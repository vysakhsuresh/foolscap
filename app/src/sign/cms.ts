/**
 * The signature itself: a detached CMS SignedData (RFC 5652) over the bytes a
 * PDF signature covers, ready to go into its /Contents.
 *
 * Which PDF flavour this is for: /SubFilter /adbe.pkcs7.detached. The other
 * choice, ETSI.CAdES.detached (PAdES baseline), forbids the signingTime
 * attribute and wants the claimed time only in the PDF's /M; a signingTime
 * inside the signature is what older readers show as "Signed on", and every
 * reader from Acrobat 6 on validates adbe.pkcs7.detached. The ESS
 * signingCertificateV2 attribute is included anyway: it binds the signature
 * to this exact certificate, so a second certificate with the same name and
 * key cannot be swapped in, and it keeps the door open to PAdES later.
 *
 * Signed attributes, sorted as DER wants a SET OF: contentType (id-data),
 * signingTime, messageDigest (SHA-256 of the covered bytes) and
 * signingCertificateV2. The signer's certificate and the chain the file came
 * with are carried along so a reader can show who signed without a lookup.
 * No timestamp: that needs a server, and nothing here talks to one.
 */
import * as asn1js from 'asn1js';
import {
  AlgorithmIdentifier,
  Attribute,
  Certificate,
  ContentInfo,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo,
} from 'pkijs';
import { plain } from './der';
import type { SigningIdentity } from './identity';

const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha256WithRSA: '1.2.840.113549.1.1.11',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
} as const;

/**
 * Signs `digestInput` (for a PDF: the file with its /Contents hole taken out)
 * and returns the DER CMS SignedData. `signingTime` should be the same moment
 * written into the PDF's /M, so the two agree.
 */
export async function signDetached(identity: SigningIdentity, digestInput: Uint8Array, signingTime: Date): Promise<Uint8Array> {
  const cert = Certificate.fromBER(plain(identity.certificate));
  const chain = identity.chain.map((der) => Certificate.fromBER(plain(der)));
  const digest = await sha256(digestInput);

  const attributes = sortedForDer([
    new Attribute({ type: OID.contentType, values: [new asn1js.ObjectIdentifier({ value: OID.data })] }),
    new Attribute({ type: OID.signingTime, values: [timeValue(signingTime)] }),
    new Attribute({ type: OID.messageDigest, values: [new asn1js.OctetString({ valueHex: digest })] }),
    new Attribute({ type: OID.signingCertificateV2, values: [signingCertificateV2(await sha256(identity.certificate), cert)] }),
  ]);

  // What is signed is the attributes encoded as a SET; what is stored is the
  // same content under an IMPLICIT [0] tag. Only the first byte differs.
  const toSign = new asn1js.Set({ value: attributes.map((a) => a.toSchema()) }).toBER(false);
  const ec = identity.privateKey.algorithm.name === 'ECDSA';
  const raw = new Uint8Array(
    await crypto.subtle.sign(ec ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }, identity.privateKey, toSign),
  );
  const signature = ec ? ecdsaToDer(raw) : raw;

  const signerInfo = new SignerInfo({
    version: 1,
    sid: new IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
    digestAlgorithm: new AlgorithmIdentifier({ algorithmId: OID.sha256 }),
    signedAttrs: new SignedAndUnsignedAttributes({ type: 0, attributes }),
    signatureAlgorithm: ec
      ? new AlgorithmIdentifier({ algorithmId: OID.ecdsaWithSha256 })
      : new AlgorithmIdentifier({ algorithmId: OID.sha256WithRSA, algorithmParams: new asn1js.Null() }),
    signature: new asn1js.OctetString({ valueHex: signature }),
  });

  const signedData = new SignedData({
    version: 1,
    digestAlgorithms: [new AlgorithmIdentifier({ algorithmId: OID.sha256 })],
    encapContentInfo: new EncapsulatedContentInfo({ eContentType: OID.data }),
    certificates: [cert, ...chain],
    signerInfos: [signerInfo],
  });

  const contentInfo = new ContentInfo({ contentType: OID.signedData, content: signedData.toSchema(true) });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

/**
 * How many bytes to leave in a PDF for this identity's signature: the
 * certificates dominate, plus room for the signature and attributes. Never
 * less than 16 KB, which is what most signers reserve.
 */
export function estimateCmsSize(identity: SigningIdentity): number {
  const certs = identity.chain.reduce((n, c) => n + c.length, identity.certificate.length);
  return Math.max(16_384, certs + 4_096);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', plain(bytes)));
}

/** UTCTime for 1950 to 2049, GeneralizedTime outside it, as RFC 5652 requires. */
function timeValue(date: Date): asn1js.BaseBlock {
  const year = date.getUTCFullYear();
  const whole = new Date(Math.floor(date.getTime() / 1000) * 1000);
  return year >= 1950 && year < 2050 ? new asn1js.UTCTime({ valueDate: whole }) : new asn1js.GeneralizedTime({ valueDate: whole });
}

/**
 * SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
 * ESSCertIDv2 ::= SEQUENCE { certHash OCTET STRING, issuerSerial IssuerSerial }
 * (hashAlgorithm is left out because SHA-256 is its default, and DER omits defaults.)
 */
function signingCertificateV2(certHash: Uint8Array<ArrayBuffer>, cert: Certificate): asn1js.Sequence {
  const directoryName = new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 4 }, value: [cert.issuer.toSchema()] });
  const issuerSerial = new asn1js.Sequence({
    value: [new asn1js.Sequence({ value: [directoryName] }), new asn1js.Integer({ valueHex: cert.serialNumber.valueBlock.valueHexView.slice() })],
  });
  const essCertIdV2 = new asn1js.Sequence({ value: [new asn1js.OctetString({ valueHex: certHash }), issuerSerial] });
  return new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [essCertIdV2] })] });
}

/** DER's SET OF is sorted by each element's encoding. */
function sortedForDer(attributes: Attribute[]): Attribute[] {
  const encoded = attributes.map((a) => ({ a, der: new Uint8Array(a.toSchema().toBER(false)) }));
  encoded.sort((x, y) => {
    const n = Math.min(x.der.length, y.der.length);
    for (let i = 0; i < n; i++) {
      const d = (x.der[i] ?? 0) - (y.der[i] ?? 0);
      if (d !== 0) return d;
    }
    return x.der.length - y.der.length;
  });
  return encoded.map((e) => e.a);
}

/** WebCrypto gives ECDSA signatures as r || s; CMS wants SEQUENCE { INTEGER r, INTEGER s }. */
function ecdsaToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const int = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.subarray(start);
    const value = (trimmed[0] ?? 0) & 0x80 ? Uint8Array.of(0, ...trimmed) : trimmed.slice();
    return new asn1js.Integer({ valueHex: value });
  };
  return new Uint8Array(new asn1js.Sequence({ value: [int(raw.subarray(0, half)), int(raw.subarray(half))] }).toBER(false));
}
