/**
 * Certificate signatures end to end, in Node: make a certificate, wrap it in a
 * password-protected PKCS#12 the way a person's computer would export it,
 * open it with readIdentity, sign a PDF with it, then check the result the
 * way a reader does — the byte range covers everything but the hole, the CMS
 * in the hole verifies against exactly those bytes, pdf.js still opens the
 * file and sees the signature field, and the visible signature sits upright
 * where it was asked to, on a turned page too.
 *
 * Each certificate is generated here with PKIjs and WebCrypto, so the test
 * carries no key material of its own.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import * as asn1js from 'asn1js';
import {
  Attribute,
  AttributeTypeAndValue,
  AuthenticatedSafe,
  BasicConstraints,
  CertBag,
  Certificate,
  ContentInfo,
  Extension,
  PFX,
  PKCS8ShroudedKeyBag,
  PrivateKeyInfo,
  SafeBag,
  SafeContents,
  SignedData,
} from 'pkijs';
import { beforeAll, describe, expect, it } from 'vitest';
import { estimateCmsSize, signDetached } from '../../app/src/sign/cms';
import { CertificateError } from '../../app/src/sign/errors';
import { readIdentity, type SigningIdentity } from '../../app/src/sign/identity';
import { ALREADY_SIGNED_MESSAGE, signPdf, type SignPdfOptions } from '../../app/src/pdf/sign-pdf';
import { encryptedPdf, formPdf, noisePng, pagesPdf, rotatedPdf } from '../fixtures/pdfs';
import { pdfjsWorkerModule } from '../fixtures/pdfjs-worker';

interface PdfJs {
  getDocument(src: { data: Uint8Array; verbosity?: number }): { promise: Promise<PdfJsDocument>; destroy(): Promise<void> };
  AnnotationMode: { ENABLE: number };
  OPS: Record<string, number>;
}
interface PdfJsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  /** Added here: tears down the loading task that made it. */
  destroy(): Promise<void>;
}
interface PdfJsPage {
  getAnnotations(): Promise<Array<{ subtype: string; fieldType?: string; rect: number[] }>>;
  getOperatorList(opts: { annotationMode: number }): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  getViewport(opts: { scale: number }): { convertToViewportPoint(x: number, y: number): number[]; width: number; height: number };
}

let pdfjs: PdfJs;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
  const main = 'pdfjs-dist';
  pdfjs = (await import(/* @vite-ignore */ main)) as PdfJs;
});

// ---------------------------------------------------------------- making certificates

type KeyKind = 'RSA' | 'EC';

async function selfSigned(kind: KeyKind, commonName: string, notAfter = new Date(Date.now() + 365 * 86_400_000)): Promise<{ cert: Certificate; keys: CryptoKeyPair }> {
  const algorithm =
    kind === 'RSA'
      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
  const keys = (await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])) as CryptoKeyPair;
  const cert = new Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: Math.floor(Math.random() * 1e9) });
  const name = [new AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: commonName }) })];
  cert.issuer.typesAndValues.push(...name);
  cert.subject.typesAndValues.push(...name);
  cert.notBefore.value = new Date(Date.now() - 86_400_000);
  cert.notAfter.value = notAfter;
  cert.extensions = [
    new Extension({ extnID: '2.5.29.19', critical: true, extnValue: new BasicConstraints({ cA: false }).toSchema().toBER(false) }),
  ];
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, 'SHA-256');
  return { cert, keys };
}

/** A PKCS#12 as OpenSSL 3 writes one: the key shrouded with PBES2/AES-256, a SHA-256 MAC over everything. */
async function pkcs12(cert: Certificate, keys: CryptoKeyPair, password: string): Promise<Uint8Array> {
  const pass = new TextEncoder().encode(password).buffer;
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
  const localKeyId = new Attribute({ type: '1.2.840.113549.1.9.21', values: [new asn1js.OctetString({ valueHex: new Uint8Array([1, 2, 3, 4]).buffer })] });
  const keyBag = new PKCS8ShroudedKeyBag({ parsedValue: PrivateKeyInfo.fromBER(pkcs8) });
  const pfx = new PFX({
    parsedValue: {
      integrityMode: 0,
      authenticatedSafe: new AuthenticatedSafe({
        parsedValue: {
          safeContents: [
            {
              privacyMode: 0,
              value: new SafeContents({
                safeBags: [
                  new SafeBag({ bagId: '1.2.840.113549.1.12.10.1.2', bagValue: keyBag, bagAttributes: [localKeyId] }),
                  new SafeBag({ bagId: '1.2.840.113549.1.12.10.1.3', bagValue: new CertBag({ parsedValue: cert }), bagAttributes: [localKeyId] }),
                ],
              }),
            },
          ],
        },
      }),
    },
  });
  await keyBag.makeInternalValues({ password: pass, contentEncryptionAlgorithm: { name: 'AES-CBC', length: 256, iv: new Uint8Array(16) }, hmacHashAlgorithm: 'SHA-256', iterationCount: 2048 });
  await pfx.parsedValue?.authenticatedSafe?.makeInternalValues({ safeContents: [{}] });
  await pfx.makeInternalValues({ password: pass, iterations: 2048, pbkdf2HashAlgorithm: 'SHA-256', hmacHashAlgorithm: 'SHA-256' });
  return new Uint8Array(pfx.toSchema().toBER(false));
}

const identities: Partial<Record<KeyKind, SigningIdentity>> = {};
const files: Partial<Record<KeyKind, Uint8Array>> = {};

async function identity(kind: KeyKind): Promise<SigningIdentity> {
  const ready = identities[kind];
  if (ready !== undefined) return ready;
  const { cert, keys } = await selfSigned(kind, kind === 'RSA' ? 'Anjali Menon' : 'Ravi Kumar');
  const file = await pkcs12(cert, keys, 'correct horse');
  files[kind] = file;
  const opened = await readIdentity(file, 'correct horse');
  identities[kind] = opened;
  return opened;
}

// ---------------------------------------------------------------- reading a signed file back

interface Signature {
  readonly range: [number, number, number, number];
  readonly covered: Uint8Array;
  readonly cms: Uint8Array<ArrayBuffer>;
}

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

/** Every signature in the file, in the order written, read the way a validator does. */
function signaturesIn(bytes: Uint8Array): Signature[] {
  const text = latin1(bytes);
  return [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map((m) => {
    const range = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
    const [a, b, c, d] = range;
    const covered = new Uint8Array(b + d);
    covered.set(bytes.subarray(a, a + b), 0);
    covered.set(bytes.subarray(c, c + d), b);
    const hex = text.slice(b + 1, c - 1);
    const cms = new Uint8Array(Buffer.from(hex, 'hex'));
    // The hole is zero-padded past the end of the DER.
    const parsed = asn1js.fromBER(cms);
    return { range, covered, cms: cms.subarray(0, parsed.offset) };
  });
}

async function verify(signature: Signature): Promise<{ ok: boolean; signer: Certificate | undefined; signedData: SignedData }> {
  const info = ContentInfo.fromBER(signature.cms.slice());
  expect(info.contentType).toBe('1.2.840.113549.1.7.2');
  const signedData = new SignedData({ schema: info.content });
  try {
    const result = await signedData.verify({ signer: 0, data: signature.covered.slice().buffer, checkChain: false, extendedMode: true });
    return { ok: result.signatureVerified === true, signer: result.signerCertificate ?? undefined, signedData };
  } catch {
    // PKIjs throws, rather than answering false, when the digest does not match.
    return { ok: false, signer: undefined, signedData };
  }
}

const sign = (who: SigningIdentity, date: Date) => (data: Uint8Array) => signDetached(who, data, date);

async function openWithPdfJs(bytes: Uint8Array): Promise<PdfJsDocument> {
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  return { numPages: doc.numPages, getPage: (n) => doc.getPage(n), destroy: () => task.destroy() };
}

// ---------------------------------------------------------------- tests

describe('readIdentity over a PKIjs-made PKCS#12', () => {
  for (const kind of ['RSA', 'EC'] as const) {
    it(`opens the ${kind} file and reports who it names`, async () => {
      const who = await identity(kind);
      expect(who.subject).toBe(kind === 'RSA' ? 'Anjali Menon' : 'Ravi Kumar');
      expect(who.issuer).toBe(who.subject);
      expect(who.privateKey.algorithm.name).toBe(kind === 'RSA' ? 'RSASSA-PKCS1-v1_5' : 'ECDSA');
      expect(who.expired).toBe(false);
      expect(who.chain).toEqual([]);
    });

    it(`refuses the ${kind} file with the wrong password`, async () => {
      await identity(kind);
      const file = files[kind];
      if (file === undefined) throw new Error('no file');
      const error = await readIdentity(file, 'Correct horse').then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(CertificateError);
      expect((error as CertificateError).name).toBe('WrongPassword');
      expect((error as CertificateError).message).toBe("That password didn't open the certificate.");
    });
  }

  it('flags an expired certificate but still opens it', async () => {
    const { cert, keys } = await selfSigned('EC', 'Old Key', new Date(Date.now() - 2 * 86_400_000));
    const who = await readIdentity(await pkcs12(cert, keys, 'pw'), 'pw');
    expect(who.expired).toBe(true);
  });
});

describe('signPdf', () => {
  const date = new Date('2026-10-12T10:30:00Z');

  for (const kind of ['RSA', 'EC'] as const) {
    for (const objectStreams of [true, false]) {
      it(`signs with ${kind}, ${objectStreams ? 'over a cross-reference stream' : 'over a classic xref table'}, and the signature verifies`, async () => {
        const who = await identity(kind);
        const doc = await PDFDocument.load(await pagesPdf(3), { updateMetadata: false });
        const input = await doc.save({ useObjectStreams: objectStreams });
        const opts: SignPdfOptions = { page: 1, name: 'Anjali Menon', reason: 'I agree', location: 'Kochi', date, reserve: estimateCmsSize(who) };
        const out = await signPdf(input, opts, sign(who, date));

        // Appended, never rewritten: every original byte is where it was.
        expect(Buffer.from(out.subarray(0, input.length)).equals(Buffer.from(input))).toBe(true);

        const [signature, ...rest] = signaturesIn(out);
        expect(rest).toEqual([]);
        if (signature === undefined) throw new Error('no signature');
        const [a, b, c, d] = signature.range;
        expect(a).toBe(0);
        expect(c + d).toBe(out.length);
        expect(String.fromCharCode(out[b] ?? 0)).toBe('<');
        expect(String.fromCharCode(out[c - 1] ?? 0)).toBe('>');
        expect(latin1(out.subarray(b + 1, c - 1))).toMatch(/^[0-9a-f]+$/);
        expect(latin1(out.subarray(b - 10, b))).toContain('/Contents');

        const { ok, signer, signedData } = await verify(signature);
        expect(ok).toBe(true);
        expect(signer?.subject.typesAndValues[0]?.value.valueBlock.value).toBe(who.subject);
        const attrs = signedData.signerInfos[0]?.signedAttrs?.attributes.map((x) => x.type) ?? [];
        expect(attrs.sort()).toEqual(['1.2.840.113549.1.9.16.2.47', '1.2.840.113549.1.9.3', '1.2.840.113549.1.9.4', '1.2.840.113549.1.9.5'].sort());

        // A single changed byte anywhere in the covered range breaks it.
        const tampered = out.slice();
        tampered[100] = (tampered[100] ?? 0) ^ 1;
        const [broken] = signaturesIn(tampered);
        if (broken === undefined) throw new Error('no signature');
        expect((await verify(broken)).ok).toBe(false);

        const text = latin1(out);
        expect(text).not.toContain('pdf-lib');
        expect(text).not.toContain('Foolscap');
        expect(text).not.toContain('Sheaf');
        expect(text).not.toMatch(/\/Producer|\/Creator/);
        expect(text).toContain('/SubFilter /adbe.pkcs7.detached');
        expect(text).toMatch(/\/M \(D:\d{14}[+-Z]/);

        const reread = await PDFDocument.load(out, { updateMetadata: false });
        expect(reread.getPageCount()).toBe(3);
        const form = reread.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
        expect(form.lookup(PDFName.of('SigFlags'))?.toString()).toBe('3');
        expect(form.lookup(PDFName.of('Fields'), PDFArray).size()).toBe(1);

        const pdf = await openWithPdfJs(out);
        expect(pdf.numPages).toBe(3);
        const annotations = await (await pdf.getPage(2)).getAnnotations();
        expect(annotations.filter((x) => x.fieldType === 'Sig')).toHaveLength(1);
        await pdf.destroy();
      });
    }
  }

  it('signs an already-signed PDF without breaking the first signature', async () => {
    const rsa = await identity('RSA');
    const ec = await identity('EC');
    const once = await signPdf(await pagesPdf(2), { page: 0, name: 'Anjali Menon', date, area: { x: 0.05, y: 0.7, w: 0.4, h: 0.2 } }, sign(rsa, date));
    const twice = await signPdf(once, { page: 0, name: 'Ravi Kumar', date, area: { x: 0.55, y: 0.7, w: 0.4, h: 0.2 } }, sign(ec, date));
    const [first, second] = signaturesIn(twice);
    if (first === undefined || second === undefined) throw new Error('expected two signatures');
    // The first still covers exactly the first revision; the second covers the whole file.
    expect(first.range[2] + first.range[3]).toBe(once.length);
    expect(second.range[2] + second.range[3]).toBe(twice.length);
    expect((await verify(first)).ok).toBe(true);
    expect((await verify(second)).ok).toBe(true);
    const reread = await PDFDocument.load(twice, { updateMetadata: false });
    const fields = reread.catalog.lookup(PDFName.of('AcroForm'), PDFDict).lookup(PDFName.of('Fields'), PDFArray);
    expect(fields.size()).toBe(2);
    const names = [0, 1].map((i) => fields.lookup(i, PDFDict).lookup(PDFName.of('T'))?.toString());
    expect(names).toEqual(['(Signature1)', '(Signature2)']);
    const pdf = await openWithPdfJs(twice);
    expect(pdf.numPages).toBe(2);
    await pdf.destroy();
  });

  it('refuses to sign an already-signed PDF it would have to rewrite', async () => {
    const rsa = await identity('RSA');
    const once = await signPdf(await pagesPdf(1), { page: 0, name: 'A', date }, sign(rsa, date));
    const broken = new TextEncoder().encode(latin1(once).replace(/startxref\s+\d+\s+%%EOF\s*$/, 'startxref\n12\n%%EOF\n'));
    await expect(signPdf(broken, { page: 0, name: 'B', date }, sign(rsa, date))).rejects.toThrow(ALREADY_SIGNED_MESSAGE);
  });

  it('rewrites a damaged but unsigned PDF, then signs it', async () => {
    const rsa = await identity('RSA');
    const input = latin1(await pagesPdf(2)).replace(/startxref\s+\d+/, 'startxref\n12');
    const out = await signPdf(new TextEncoder().encode(input), { page: 1, name: 'A', date }, sign(rsa, date));
    const [signature] = signaturesIn(out);
    if (signature === undefined) throw new Error('no signature');
    expect((await verify(signature)).ok).toBe(true);
    expect((await PDFDocument.load(out, { updateMetadata: false })).getPageCount()).toBe(2);
    expect(latin1(out)).not.toMatch(/pdf-lib|\/Producer|\/Creator/);
  });

  it('adds its field beside the ones a form already has', async () => {
    const rsa = await identity('RSA');
    const input = await formPdf();
    const out = await signPdf(input, { page: 0, name: 'A', date, area: { x: 0.5, y: 0.05, w: 0.45, h: 0.15 } }, sign(rsa, date));
    expect(Buffer.from(out.subarray(0, input.length)).equals(Buffer.from(input))).toBe(true);
    const [signature] = signaturesIn(out);
    if (signature === undefined) throw new Error('no signature');
    expect((await verify(signature)).ok).toBe(true);
    const form = (await PDFDocument.load(out, { updateMetadata: false })).getForm();
    expect(form.getFields().map((f) => f.getName())).toEqual(['name', 'address', 'agree', 'city', 'member', 'Signature1']);
  });

  it('refuses an encrypted PDF in plain words', async () => {
    const rsa = await identity('RSA');
    await expect(signPdf(await encryptedPdf('secret'), { page: 0, name: 'A', date }, sign(rsa, date))).rejects.toThrow(
      'This PDF is locked with a password. Remove the password first, then sign it.',
    );
  });

  it('makes the hole bigger when the signature does not fit the reserve', async () => {
    const rsa = await identity('RSA');
    const out = await signPdf(await pagesPdf(1), { page: 0, name: 'A', date, reserve: 64 }, sign(rsa, date));
    const [signature] = signaturesIn(out);
    if (signature === undefined) throw new Error('no signature');
    expect((await verify(signature)).ok).toBe(true);
  });

  for (const rotation of [0, 90, 180, 270]) {
    it(`puts a visible signature upright where asked on a /Rotate ${rotation} page`, async () => {
      const ec = await identity('EC');
      const input = await rotatedPdf([rotation]);
      const area = { x: 0.1, y: 0.6, w: 0.5, h: 0.25 };
      const out = await signPdf(input, { page: 0, name: 'Ravi Kumar — രവി', date, area, appearance: { png: noisePng(24) } }, sign(ec, date));
      const [signature] = signaturesIn(out);
      if (signature === undefined) throw new Error('no signature');
      expect((await verify(signature)).ok).toBe(true);

      const pdf = await openWithPdfJs(out);
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const list = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.ENABLE });
      const at = list.fnArray.indexOf(pdfjs.OPS['beginAnnotation'] ?? -1);
      expect(at).toBeGreaterThanOrEqual(0);
      const [, , transform, matrix] = list.argsArray[at] as [string, number[], number[], number[]];
      // Form space -> page space is transform x matrix; then pdf.js's own viewport turns the page as a reader sees it.
      const apply = (m: number[], x: number, y: number): [number, number] => [
        (m[0] ?? 0) * x + (m[2] ?? 0) * y + (m[4] ?? 0),
        (m[1] ?? 0) * x + (m[3] ?? 0) * y + (m[5] ?? 0),
      ];
      const seen = (x: number, y: number) => {
        const [px, py] = apply(transform, ...apply(matrix, x, y));
        const [sx = 0, sy = 0] = viewport.convertToViewportPoint(px, py);
        return [sx / viewport.width, sy / viewport.height];
      };
      const w = area.w * viewport.width;
      const h = area.h * viewport.height;
      const close = (got: number[], want: number[]) => {
        expect(got[0]).toBeCloseTo(want[0] ?? 0, 3);
        expect(got[1]).toBeCloseTo(want[1] ?? 0, 3);
      };
      // The appearance's own bottom-left, bottom-right and top-left land on the area's,
      // in the reader's view (y down): so its text runs left to right, the right way up.
      close(seen(0, 0), [area.x, area.y + area.h]);
      close(seen(w, 0), [area.x + area.w, area.y + area.h]);
      close(seen(0, h), [area.x, area.y]);
      await pdf.destroy();

      // The name keeps its Malayalam in /Name; the picture drops what Helvetica cannot draw.
      expect(latin1(out)).toContain('/Name <FEFF');
    });
  }
});
