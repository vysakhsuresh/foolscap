/**
 * A signing identity: the private key and certificate from the person's
 * .pfx/.p12 file, ready to sign with and never leaving the device.
 *
 * The key is imported into WebCrypto as non-extractable, so once it is open
 * not even this code can read it back out; it can only be asked to sign.
 * The certificate is checked against the key by signing a few random bytes
 * and verifying them, which also picks the right certificate when a file
 * carries several and forgets to say which is whose.
 */
import * as asn1js from 'asn1js';
import { Certificate, type RelativeDistinguishedNames } from 'pkijs';
import { child, oid, parseDer, plain } from './der';
import { CertificateError, notACertificate, unsupported } from './errors';
import { openPkcs12, type Pkcs12Item } from './pkcs12';

export interface SigningIdentity {
  /** Non-extractable. RSASSA-PKCS1-v1_5 with SHA-256, or ECDSA on P-256, P-384 or P-521. */
  readonly privateKey: CryptoKey;
  /** The signer's certificate, DER. */
  readonly certificate: Uint8Array;
  /** The certificates that issued it, nearest first, as far as the file carries them. DER. */
  readonly chain: readonly Uint8Array[];
  /** Who the certificate names: its common name, or its organisation when it has none. */
  readonly subject: string;
  /** Who issued it, the same way. */
  readonly issuer: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
  /**
   * Past its end date. Signing still works and the signature is still
   * genuine, but readers will warn about it, so the page should say so first.
   */
  readonly expired: boolean;
}

const RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const EC_PUBLIC_KEY = '1.2.840.10045.2.1';
const CURVES: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

const KEY_KIND =
  'This certificate uses a kind of key this site cannot sign with yet. RSA keys and elliptic-curve keys on P-256 or P-384 work.';

/**
 * Opens a PKCS#12 file with its password. Throws a CertificateError whose
 * `name` says what went wrong ('WrongPassword', 'NotACertificate',
 * 'Unsupported', 'NoPrivateKey') and whose message can be shown as it is.
 */
export async function readIdentity(p12: Uint8Array, password: string): Promise<SigningIdentity> {
  const contents = await openPkcs12(p12, password);
  if (contents.keys.length === 0) {
    throw new CertificateError(
      'NoPrivateKey',
      'This certificate file has no private key in it, so it cannot sign. Export it again with the private key included.',
    );
  }
  const certs = contents.certs.map((item) => ({ item, cert: parseCertificate(item.der) }));
  if (certs.length === 0) throw notACertificate();

  for (const key of contents.keys) {
    const algorithm = keyAlgorithm(key.der, certs.map((c) => c.cert));
    let privateKey: CryptoKey;
    try {
      privateKey = await crypto.subtle.importKey('pkcs8', plain(key.der), algorithm, false, ['sign']);
    } catch (error) {
      throw new CertificateError('Unsupported', KEY_KIND, { cause: error });
    }
    // The file's own pairing first, then every other certificate in the file.
    const ordered = [...certs.filter((c) => paired(key, c.item)), ...certs.filter((c) => !paired(key, c.item))];
    for (const candidate of ordered) {
      if (!(await belongsTogether(privateKey, algorithm, candidate.cert))) continue;
      const leaf = candidate.cert;
      const now = new Date();
      return {
        privateKey,
        certificate: candidate.item.der,
        chain: chainFor(leaf, certs.map((c) => c.cert).filter((c) => c !== leaf)).map((c) => new Uint8Array(c.toSchema().toBER(false))),
        subject: displayName(leaf.subject),
        issuer: displayName(leaf.issuer),
        notBefore: leaf.notBefore.value,
        notAfter: leaf.notAfter.value,
        expired: leaf.notAfter.value.getTime() < now.getTime(),
      };
    }
  }
  throw new CertificateError(
    'NoPrivateKey',
    "The private key in this file doesn't match any certificate in it. Export the certificate again with its private key.",
  );
}

function parseCertificate(der: Uint8Array): Certificate {
  try {
    return Certificate.fromBER(plain(der));
  } catch (error) {
    throw notACertificate(error);
  }
}

const paired = (key: Pkcs12Item, cert: Pkcs12Item): boolean => key.localKeyId !== undefined && key.localKeyId === cert.localKeyId;

/** The WebCrypto algorithm a PKCS#8 key imports as, from its own AlgorithmIdentifier. */
function keyAlgorithm(pkcs8: Uint8Array, certs: readonly Certificate[]): RsaHashedImportParams | EcKeyImportParams {
  let algorithmId: string;
  let params: asn1js.BaseBlock | undefined;
  try {
    const info = parseDer(pkcs8);
    const identifier = child(info, 1);
    algorithmId = oid(child(identifier, 0));
    params = identifier instanceof asn1js.Constructed ? identifier.valueBlock.value[1] : undefined;
  } catch (error) {
    throw notACertificate(error);
  }
  if (algorithmId === RSA_ENCRYPTION) return { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  if (algorithmId === EC_PUBLIC_KEY) {
    // The curve is named beside the key; when a writer left it out, the
    // matching certificate names it.
    let curveId = params instanceof asn1js.ObjectIdentifier ? params.valueBlock.toString() : undefined;
    if (curveId === undefined) {
      const fromCert = certs
        .map((c) => c.subjectPublicKeyInfo.algorithm)
        .find((a) => a.algorithmId === EC_PUBLIC_KEY && a.algorithmParams instanceof asn1js.ObjectIdentifier);
      const named = fromCert?.algorithmParams;
      curveId = named instanceof asn1js.ObjectIdentifier ? named.valueBlock.toString() : undefined;
    }
    const namedCurve = curveId === undefined ? undefined : CURVES[curveId];
    if (namedCurve === undefined) throw unsupported(KEY_KIND);
    return { name: 'ECDSA', namedCurve };
  }
  throw unsupported(KEY_KIND);
}

/** Whether the certificate's public key verifies what this private key signs. */
async function belongsTogether(
  privateKey: CryptoKey,
  algorithm: RsaHashedImportParams | EcKeyImportParams,
  cert: Certificate,
): Promise<boolean> {
  const spki = cert.subjectPublicKeyInfo.algorithm.algorithmId;
  if ((algorithm.name === 'ECDSA') !== (spki === EC_PUBLIC_KEY)) return false;
  try {
    const publicKey = await crypto.subtle.importKey('spki', cert.subjectPublicKeyInfo.toSchema().toBER(false), algorithm, false, ['verify']);
    const probe = crypto.getRandomValues(new Uint8Array(32));
    const use = algorithm.name === 'ECDSA' ? { name: 'ECDSA', hash: 'SHA-256' } : algorithm;
    const signature = await crypto.subtle.sign(use, privateKey, probe);
    return await crypto.subtle.verify(use, publicKey, signature, probe);
  } catch {
    return false;
  }
}

/** The issuers of `leaf`, nearest first, as far as the pool has them. Stops at a self-signed root or a loop. */
function chainFor(leaf: Certificate, pool: readonly Certificate[]): Certificate[] {
  const chain: Certificate[] = [];
  let current = leaf;
  const left = [...pool];
  while (!current.issuer.isEqual(current.subject)) {
    const index = left.findIndex((c) => c.subject.isEqual(current.issuer));
    const next = left[index];
    if (next === undefined) break;
    left.splice(index, 1);
    chain.push(next);
    current = next;
  }
  return chain;
}

const COMMON_NAME = '2.5.4.3';
const ORGANISATION = '2.5.4.10';

/** The common name, else the organisation, else every value in the name joined up. */
export function displayName(name: RelativeDistinguishedNames): string {
  const text = (type: string) =>
    name.typesAndValues
      .filter((tv) => tv.type === type)
      .map((tv) => stringOf(tv.value))
      .find((v) => v.length > 0);
  return text(COMMON_NAME) ?? text(ORGANISATION) ?? name.typesAndValues.map((tv) => stringOf(tv.value)).filter((v) => v.length > 0).join(', ');
}

function stringOf(value: unknown): string {
  if (value instanceof asn1js.BaseStringBlock) {
    const v: unknown = value.getValue();
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}
