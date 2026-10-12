/**
 * Opening certificate files the way people's computers actually export them.
 *
 * The files below were made once with OpenSSL 3 (its legacy provider for the
 * old ciphers) from throwaway keys made for this test alone; they sign
 * nothing real. Between them they cover the schemes Windows, the macOS
 * Keychain, Java and OpenSSL 1.x and 3 write: PBES2 with AES and triple DES,
 * the PKCS#12 PBE family (three- and two-key triple DES, RC2 at 40 and 128
 * bits, RC4), MACs over SHA-1, SHA-256 and SHA-512, a non-ASCII password and
 * an empty one, RSA and EC keys, and a certificate that comes with its issuer.
 *
 *   LEGACY_RSA_CHAIN      openssl pkcs12 -export -legacy -certfile ca.crt          password hunter2
 *   AES_EC384             openssl pkcs12 -export                                    password pässword
 *   RC2_128_2DES_EC256    -certpbe PBE-SHA1-RC2-128 -keypbe PBE-SHA1-2DES           password secret
 *   RC4_EC256             -certpbe PBE-SHA1-RC4-40 -keypbe PBE-SHA1-RC4-128         password secret
 *   EMPTY_PASSWORD_EC256  -certpbe AES-128-CBC -keypbe DES-EDE3-CBC -macalg sha512  empty password
 */
import { describe, expect, it } from 'vitest';
import { CertificateError } from '../../app/src/sign/errors';
import { readIdentity } from '../../app/src/sign/identity';
import { rc2CbcDecrypt } from '../../app/src/sign/legacy-ciphers';
import { AES_EC384, EMPTY_PASSWORD_EC256, LEGACY_RSA_CHAIN, RC2_128_2DES_EC256, RC4_EC256 } from '../fixtures/certificates';

const bytes = (base64: string): Uint8Array => new Uint8Array(Buffer.from(base64, 'base64'));

async function problem(promise: Promise<unknown>): Promise<CertificateError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CertificateError);
    return error as CertificateError;
  }
  throw new Error('expected a rejection');
}

const CASES = [
  {
    label: 'legacy 3DES + RC2-40 with a SHA-1 MAC, an RSA key and its issuer',
    file: LEGACY_RSA_CHAIN,
    password: 'hunter2',
    subject: 'Meera Nair',
    issuer: 'Test Root CA',
    kind: 'RSASSA-PKCS1-v1_5',
    chain: 1,
  },
  {
    label: 'PBES2 AES-256 with a SHA-256 MAC, P-384 and a non-ASCII password',
    file: AES_EC384,
    password: 'pässword',
    subject: 'Kerala Test Co',
    issuer: 'Kerala Test Co',
    kind: 'ECDSA',
    chain: 0,
  },
  { label: 'RC2-128 + two-key 3DES', file: RC2_128_2DES_EC256, password: 'secret', subject: 'Ravi Kumar', issuer: 'Ravi Kumar', kind: 'ECDSA', chain: 0 },
  { label: 'RC4-40 + RC4-128', file: RC4_EC256, password: 'secret', subject: 'Ravi Kumar', issuer: 'Ravi Kumar', kind: 'ECDSA', chain: 0 },
  {
    label: 'PBES2 AES-128 + PBES2 3DES with a SHA-512 MAC and an empty password',
    file: EMPTY_PASSWORD_EC256,
    password: '',
    subject: 'Ravi Kumar',
    issuer: 'Ravi Kumar',
    kind: 'ECDSA',
    chain: 0,
  },
] as const;

describe('readIdentity', () => {
  for (const c of CASES) {
    it(`opens ${c.label}`, async () => {
      const identity = await readIdentity(bytes(c.file), c.password);
      expect(identity.subject).toBe(c.subject);
      expect(identity.issuer).toBe(c.issuer);
      expect(identity.privateKey.algorithm.name).toBe(c.kind);
      expect(identity.privateKey.extractable).toBe(false);
      expect(identity.privateKey.usages).toEqual(['sign']);
      expect(identity.chain).toHaveLength(c.chain);
      expect(identity.certificate[0]).toBe(0x30);
      expect(identity.notBefore.getTime()).toBeLessThan(identity.notAfter.getTime());
      expect(identity.expired).toBe(false);
    });

    it(`refuses ${c.label} with the wrong password`, async () => {
      const error = await problem(readIdentity(bytes(c.file), c.password === '' ? 'nope' : `${c.password}x`));
      expect(error.name).toBe('WrongPassword');
      expect(error.message).toBe("That password didn't open the certificate.");
    });
  }

  it('names the P-384 curve', async () => {
    const identity = await readIdentity(bytes(AES_EC384), 'pässword');
    expect((identity.privateKey.algorithm as EcKeyAlgorithm).namedCurve).toBe('P-384');
  });

  it('says plainly when the file is not a certificate', async () => {
    const error = await problem(readIdentity(new TextEncoder().encode('%PDF-1.7 not a certificate'), 'x'));
    expect(error.name).toBe('NotACertificate');
    expect(error.message).toMatch(/^[A-Z].*\.$/);
  });
});

describe('the old ciphers', () => {
  it('RC2 meets the RFC 2268 test vector', () => {
    // Key 00 x 8 at 63 effective bits encrypts eight zero bytes to eb b7 73 f9 93 27 8e ff.
    const out = rc2CbcDecrypt(new Uint8Array(8), 63, new Uint8Array(8), new Uint8Array(Buffer.from('ebb773f993278eff', 'hex')));
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
