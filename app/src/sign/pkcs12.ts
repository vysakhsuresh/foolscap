/**
 * Opens a PKCS#12 file (.pfx, .p12): checks its password, unlocks what is
 * inside and hands back the private keys and certificates as plain DER.
 *
 * The file format (RFC 7292) is old and has been written by many hands, so
 * this reads all the ways people's files actually arrive:
 *
 * - OpenSSL 3 and current Windows: PBES2 with PBKDF2 and AES, MAC over
 *   SHA-256.
 * - Windows before 2019, the macOS Keychain, OpenSSL 1.x, Java: the PKCS#12
 *   "PBE" schemes — triple DES on the key, 40-bit RC2 on the certificates,
 *   MAC over SHA-1 — plus their RC2-128, two-key DES and RC4 cousins.
 * - Older PKCS#5 v1.5 schemes (DES or RC2 with MD5 or SHA-1).
 * - The newer PBMAC1 integrity check (RFC 9579).
 *
 * WebCrypto does PBKDF2 and AES; the PKCS#12 key derivation and the old
 * ciphers are done here, in plain code, because no browser offers them.
 * Files sealed with a public key instead of a password (rare outside
 * enterprise tools) are refused with a sentence saying so.
 */
import { hmac } from '@noble/hashes/hmac';
import { md5, sha1 } from '@noble/hashes/legacy';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2';
import { child, children, concat, equalBytes, explicit, implicitOctets, integer, isContextTag, octets, oid, parseDer, plain, rawBytes, type Node } from './der';
import { notACertificate, unsupported, wrongPassword } from './errors';
import { desCbcDecrypt, rc2CbcDecrypt, rc4, unpad } from './legacy-ciphers';

type Hash = typeof sha1;

/** A key or certificate from the file, with the id that pairs them when the file gives one. */
export interface Pkcs12Item {
  readonly der: Uint8Array;
  readonly localKeyId: string | undefined;
}

export interface Pkcs12Contents {
  /** Each a PKCS#8 PrivateKeyInfo, unlocked. */
  readonly keys: readonly Pkcs12Item[];
  /** Each an X.509 certificate. */
  readonly certs: readonly Pkcs12Item[];
}

/**
 * The password in the two spellings the format uses: the PKCS#12 schemes
 * take it as UTF-16 big-endian with two zero bytes at the end, PBES2 and
 * PBMAC1 as UTF-8.
 */
interface Password {
  readonly bmp: Uint8Array;
  readonly utf8: Uint8Array;
}

const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  envelopedData: '1.2.840.113549.1.7.3',
  encryptedData: '1.2.840.113549.1.7.6',
  keyBag: '1.2.840.113549.1.12.10.1.1',
  shroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
  certBag: '1.2.840.113549.1.12.10.1.3',
  safeContentsBag: '1.2.840.113549.1.12.10.1.6',
  x509Certificate: '1.2.840.113549.1.9.22.1',
  localKeyId: '1.2.840.113549.1.9.21',
  pbes2: '1.2.840.113549.1.5.13',
  pbkdf2: '1.2.840.113549.1.5.12',
  pbmac1: '1.2.840.113549.1.5.14',
} as const;

const DIGESTS: Record<string, Hash> = {
  '1.3.14.3.2.26': sha1,
  '2.16.840.1.101.3.4.2.4': sha224,
  '2.16.840.1.101.3.4.2.1': sha256,
  '2.16.840.1.101.3.4.2.2': sha384,
  '2.16.840.1.101.3.4.2.3': sha512,
};

const HMACS: Record<string, Hash> = {
  '1.2.840.113549.2.7': sha1,
  '1.2.840.113549.2.8': sha224,
  '1.2.840.113549.2.9': sha256,
  '1.2.840.113549.2.10': sha384,
  '1.2.840.113549.2.11': sha512,
};

/** The names WebCrypto knows these hashes by; SHA-224 it does not, so that one goes through noble. */
const WEBCRYPTO_NAMES = new Map<Hash, string>([
  [sha1, 'SHA-1'],
  [sha256, 'SHA-256'],
  [sha384, 'SHA-384'],
  [sha512, 'SHA-512'],
]);

const OLD_CIPHER =
  'This certificate file is locked with an encryption method this site cannot open. Export it again from your computer, choosing AES-256 encryption if you are asked.';

export async function openPkcs12(bytes: Uint8Array, password: string): Promise<Pkcs12Contents> {
  let pfx: Node;
  let authSafeType: string;
  let authSafe: Node;
  try {
    pfx = parseDer(bytes);
    const version = integer(child(pfx, 0));
    if (version !== 3) throw new Error('Not a PFX');
    authSafeType = oid(child(child(pfx, 1), 0));
    authSafe = child(child(pfx, 1), 1);
  } catch (error) {
    throw notACertificate(error);
  }
  if (authSafeType === OID.signedData) {
    throw unsupported(
      'This certificate file is sealed with a key instead of a password, which this site cannot open. Export it again with a password.',
    );
  }
  if (authSafeType !== OID.data) throw notACertificate();
  const content = octets(explicit(authSafe, 0));

  const candidates = passwordSpellings(password);
  const macData = children(pfx)[2];
  let chosen: readonly Password[] = candidates;
  if (macData !== undefined) {
    const passing = [];
    for (const candidate of candidates) {
      const verdict = await macMatches(macData, content, candidate);
      if (verdict === 'unknown') {
        passing.push(...candidates);
        break;
      }
      if (verdict) passing.push(candidate);
    }
    if (passing.length === 0) throw wrongPassword();
    chosen = passing;
  }

  const keys: Pkcs12Item[] = [];
  const certs: Pkcs12Item[] = [];
  let infos: Node[];
  try {
    infos = children(parseDer(content));
  } catch (error) {
    throw notACertificate(error);
  }
  for (const info of infos) {
    const type = oid(child(info, 0));
    if (type === OID.data) {
      await readSafeContentsAsync(octets(explicit(child(info, 1), 0)), chosen, keys, certs);
    } else if (type === OID.encryptedData) {
      // EncryptedData: version, then EncryptedContentInfo (type, algorithm, [0] IMPLICIT bytes).
      const eci = child(explicit(child(info, 1), 0), 1);
      const algorithm = child(eci, 1);
      const sealed = children(eci)[2];
      if (!isContextTag(sealed, 0)) continue;
      const { plain: opened, password: used } = await decryptWithAny(algorithm, implicitOctets(sealed), chosen);
      chosen = [used];
      await readSafeContentsAsync(opened, chosen, keys, certs);
    } else if (type === OID.envelopedData) {
      throw unsupported(
        'This certificate file is sealed with a key instead of a password, which this site cannot open. Export it again with a password.',
      );
    }
  }
  return { keys, certs };
}

/**
 * Bags that are themselves encrypted (shrouded keys) need async decryption,
 * so the walk collects them first and unlocks them after.
 */
async function readSafeContentsAsync(bytes: Uint8Array, passwords: readonly Password[], keys: Pkcs12Item[], certs: Pkcs12Item[]): Promise<void> {
  const shrouded: Array<{ algorithm: Node; data: Uint8Array; localKeyId: string | undefined }> = [];
  readSafeContents(bytes, passwords, keys, certs, shrouded);
  for (const item of shrouded) {
    const { plain: der } = await decryptWithAny(item.algorithm, item.data, passwords);
    keys.push({ der, localKeyId: item.localKeyId });
  }
}

function readSafeContents(
  bytes: Uint8Array,
  passwords: readonly Password[],
  keys: Pkcs12Item[],
  certs: Pkcs12Item[],
  shrouded: Array<{ algorithm: Node; data: Uint8Array; localKeyId: string | undefined }>,
): void {
  let bags: Node[];
  try {
    bags = children(parseDer(bytes));
  } catch (error) {
    throw notACertificate(error);
  }
  for (const bag of bags) {
    const id = oid(child(bag, 0));
    const value = explicit(child(bag, 1), 0);
    const localKeyId = localKeyIdOf(children(bag)[2]);
    switch (id) {
      case OID.keyBag:
        keys.push({ der: rawBytes(value), localKeyId });
        break;
      case OID.shroudedKeyBag:
        shrouded.push({ algorithm: child(value, 0), data: octets(child(value, 1)), localKeyId });
        break;
      case OID.certBag:
        if (oid(child(value, 0)) === OID.x509Certificate) certs.push({ der: octets(explicit(child(value, 1), 0)), localKeyId });
        break;
      case OID.safeContentsBag:
        readSafeContents(rawBytes(value), passwords, keys, certs, shrouded);
        break;
      default:
        // CRLs, secrets and anything newer play no part in signing.
        break;
    }
  }
}

function localKeyIdOf(attributes: Node | undefined): string | undefined {
  if (attributes === undefined) return undefined;
  for (const attribute of children(attributes)) {
    if (oid(child(attribute, 0)) !== OID.localKeyId) continue;
    const value = children(child(attribute, 1))[0];
    if (value === undefined) return undefined;
    return Array.from(octets(value), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return undefined;
}

/**
 * An empty password is ambiguous in PKCS#12: some tools hash two zero bytes,
 * some hash nothing at all. Both are tried; the MAC says which one is right.
 */
function passwordSpellings(password: string): Password[] {
  const utf8 = new TextEncoder().encode(password);
  const bmp = new Uint8Array(password.length * 2 + 2);
  for (let i = 0; i < password.length; i++) {
    const unit = password.charCodeAt(i);
    bmp[2 * i] = unit >> 8;
    bmp[2 * i + 1] = unit & 0xff;
  }
  return password.length === 0 ? [{ bmp, utf8 }, { bmp: new Uint8Array(0), utf8 }] : [{ bmp, utf8 }];
}

/** Whether the file's MAC matches this password, or 'unknown' for a MAC algorithm this code does not know. */
async function macMatches(macData: Node, content: Uint8Array, password: Password): Promise<boolean | 'unknown'> {
  const digestInfo = child(macData, 0);
  const algorithm = child(digestInfo, 0);
  const expected = octets(child(digestInfo, 1));
  const algorithmId = oid(child(algorithm, 0));
  if (algorithmId === OID.pbmac1) {
    // RFC 9579: the key comes from PBKDF2 over the UTF-8 password; the salt
    // and count in MacData are placeholders.
    const params = child(algorithm, 1);
    const kdf = child(params, 0);
    if (oid(child(kdf, 0)) !== OID.pbkdf2) return 'unknown';
    const mac = HMACS[oid(child(child(params, 1), 0))];
    const p = readPbkdf2Params(child(kdf, 1));
    if (mac === undefined || p === null || p.keyLength === undefined) return 'unknown';
    const key = await pbkdf2Bytes(p.prf, password.utf8, p.salt, p.iterations, p.keyLength);
    return equalBytes(hmac(mac, key, content), expected);
  }
  const hash = DIGESTS[algorithmId];
  if (hash === undefined) return 'unknown';
  const salt = octets(child(macData, 1));
  const iterationsNode = children(macData)[2];
  const iterations = iterationsNode === undefined ? 1 : integer(iterationsNode);
  const key = pkcs12Kdf(hash, password.bmp, salt, 3, iterations, hash.outputLen);
  return equalBytes(hmac(hash, key, content), expected);
}

/**
 * Tries each spelling of the password until one decrypts cleanly. With a MAC
 * that already passed there is only one; without a MAC, bad padding is the
 * only sign of a wrong password, so that is what fails here.
 */
async function decryptWithAny(
  algorithm: Node,
  data: Uint8Array,
  passwords: readonly Password[],
): Promise<{ plain: Uint8Array; password: Password }> {
  for (const password of passwords) {
    const opened = await decrypt(algorithm, data, password);
    if (opened !== null && looksLikeDer(opened)) return { plain: opened, password };
  }
  throw wrongPassword();
}

function looksLikeDer(bytes: Uint8Array): boolean {
  try {
    parseDer(bytes);
    return bytes[0] === 0x30;
  } catch {
    return false;
  }
}

/** Decrypts one encrypted item, or null when the password was wrong. Throws for schemes this code cannot do. */
async function decrypt(algorithm: Node, data: Uint8Array, password: Password): Promise<Uint8Array | null> {
  const id = oid(child(algorithm, 0));
  const params = children(algorithm)[1];

  // PKCS#12 PBE: pbeWithSHAAnd...
  const pkcs12 = /^1\.2\.840\.113549\.1\.12\.1\.([1-6])$/.exec(id);
  if (pkcs12) {
    const salt = octets(child(params, 0));
    const iterations = integer(child(params, 1));
    const kind = Number(pkcs12[1]);
    const derive = (which: 1 | 2, n: number) => pkcs12Kdf(sha1, password.bmp, salt, which, iterations, n);
    switch (kind) {
      case 1:
        return rc4(derive(1, 16), data);
      case 2:
        return rc4(derive(1, 5), data);
      case 3:
        return unpad(desCbcDecrypt(derive(1, 24), derive(2, 8), data), 8);
      case 4:
        return unpad(desCbcDecrypt(derive(1, 16), derive(2, 8), data), 8);
      case 5:
        return unpad(rc2CbcDecrypt(derive(1, 16), 128, derive(2, 8), data), 8);
      default:
        return unpad(rc2CbcDecrypt(derive(1, 5), 40, derive(2, 8), data), 8);
    }
  }

  // PKCS#5 v1.5 PBES1: pbeWith{MD5,SHA1}And{DES,RC2}-CBC.
  const pbes1 = /^1\.2\.840\.113549\.1\.5\.(3|6|10|11)$/.exec(id);
  if (pbes1) {
    const salt = octets(child(params, 0));
    const iterations = integer(child(params, 1));
    const which = Number(pbes1[1]);
    const hash = which === 3 || which === 6 ? md5 : sha1;
    let t = hash(concat(password.utf8, salt));
    for (let i = 1; i < iterations; i++) t = hash(t);
    const key = t.subarray(0, 8);
    const iv = t.subarray(8, 16);
    return unpad(which === 3 || which === 10 ? desCbcDecrypt(key, iv, data) : rc2CbcDecrypt(key, 64, iv, data), 8);
  }

  if (id === OID.pbes2) return decryptPbes2(child(params, 0), child(params, 1), data, password);

  throw unsupported(OLD_CIPHER);
}

const AES: Record<string, number> = {
  '2.16.840.1.101.3.4.1.2': 16,
  '2.16.840.1.101.3.4.1.22': 24,
  '2.16.840.1.101.3.4.1.42': 32,
};

async function decryptPbes2(kdf: Node, scheme: Node, data: Uint8Array, password: Password): Promise<Uint8Array | null> {
  if (oid(child(kdf, 0)) !== OID.pbkdf2) throw unsupported(OLD_CIPHER);
  const p = readPbkdf2Params(child(kdf, 1));
  if (p === null) throw unsupported(OLD_CIPHER);
  const schemeId = oid(child(scheme, 0));
  const schemeParams = children(scheme)[1];

  const aesLength = AES[schemeId];
  if (aesLength !== undefined) {
    const key = await pbkdf2Bytes(p.prf, password.utf8, p.salt, p.iterations, p.keyLength ?? aesLength);
    const iv = octets(schemeParams);
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey('raw', plain(key), 'AES-CBC', false, ['decrypt']);
    } catch {
      // Chrome has no 192-bit AES.
      throw unsupported(OLD_CIPHER);
    }
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: plain(iv) }, cryptoKey, plain(data)));
    } catch {
      return null;
    }
  }
  if (schemeId === '1.2.840.113549.3.7' || schemeId === '1.3.14.3.2.7') {
    const length = schemeId === '1.2.840.113549.3.7' ? 24 : 8;
    const key = await pbkdf2Bytes(p.prf, password.utf8, p.salt, p.iterations, p.keyLength ?? length);
    return unpad(desCbcDecrypt(key, octets(schemeParams), data), 8);
  }
  if (schemeId === '1.2.840.113549.3.2') {
    // RC2-CBC-Parameter: an optional "version" that encodes the effective key bits, then the IV.
    const parts = children(schemeParams);
    const version = parts.length > 1 ? integer(parts[0]) : 32;
    const bits = version === 160 ? 40 : version === 120 ? 64 : version === 58 ? 128 : version >= 256 ? version : 32;
    const key = await pbkdf2Bytes(p.prf, password.utf8, p.salt, p.iterations, p.keyLength ?? Math.ceil(bits / 8));
    return unpad(rc2CbcDecrypt(key, bits, octets(parts[parts.length - 1]), data), 8);
  }
  throw unsupported(OLD_CIPHER);
}

interface Pbkdf2Params {
  readonly salt: Uint8Array;
  readonly iterations: number;
  readonly keyLength: number | undefined;
  readonly prf: Hash;
}

/** PBKDF2-params: salt, iteration count, optional key length, optional PRF (HMAC-SHA1 when absent). */
function readPbkdf2Params(node: Node): Pbkdf2Params | null {
  const parts = children(node);
  const saltNode = parts[0];
  // The salt may be an "otherSource" AlgorithmIdentifier; nobody uses it.
  if (saltNode === undefined || saltNode.idBlock.tagNumber !== 4) return null;
  let keyLength: number | undefined;
  let prf: Hash | undefined = sha1;
  for (const extra of parts.slice(2)) {
    if (extra.idBlock.tagNumber === 2) keyLength = integer(extra);
    else prf = HMACS[oid(child(extra, 0))];
  }
  if (prf === undefined) return null;
  return { salt: octets(saltNode), iterations: integer(parts[1]), keyLength, prf };
}

/** PBKDF2, through WebCrypto when it knows the hash (it is far faster at high counts), noble otherwise. */
async function pbkdf2Bytes(prf: Hash, password: Uint8Array, salt: Uint8Array, iterations: number, length: number): Promise<Uint8Array> {
  const name = WEBCRYPTO_NAMES.get(prf);
  if (name !== undefined) {
    const base = await crypto.subtle.importKey('raw', plain(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: name, salt: plain(salt), iterations }, base, length * 8);
    return new Uint8Array(bits);
  }
  return pbkdf2(prf, password, salt, { c: iterations, dkLen: length });
}

/**
 * The PKCS#12 key derivation (RFC 7292, appendix B.2). `which` is 1 for a
 * cipher key, 2 for an IV and 3 for a MAC key.
 */
export function pkcs12Kdf(hash: Hash, password: Uint8Array, salt: Uint8Array, which: 1 | 2 | 3, iterations: number, length: number): Uint8Array {
  const u = hash.outputLen;
  const v = hash.blockLen;
  const fill = (source: Uint8Array): Uint8Array => {
    const n = source.length === 0 ? 0 : v * Math.ceil(source.length / v);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = source[i % source.length] ?? 0;
    return out;
  };
  const d = new Uint8Array(v).fill(which);
  const i = concat(fill(salt), fill(password));
  const out = new Uint8Array(Math.ceil(length / u) * u);
  for (let block = 0; block * u < length; block++) {
    let a = hash(concat(d, i));
    for (let r = 1; r < iterations; r++) a = hash(a);
    out.set(a, block * u);
    // I_j = (I_j + B + 1) mod 2^(8v), for each v-byte block of I, with B = A repeated to v bytes.
    const b = new Uint8Array(v);
    for (let k = 0; k < v; k++) b[k] = a[k % u] ?? 0;
    for (let j = 0; j < i.length; j += v) {
      let carry = 1;
      for (let k = v - 1; k >= 0; k--) {
        const sum = (i[j + k] ?? 0) + (b[k] ?? 0) + carry;
        i[j + k] = sum & 0xff;
        carry = sum >> 8;
      }
    }
  }
  return out.subarray(0, length);
}
