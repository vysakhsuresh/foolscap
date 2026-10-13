/**
 * Logic fixes found by the deep test of the Protect and Read tools
 * (tests/e2e/deep-deep-protect.spec.ts), pinned down in Node.
 */
import { PDFDocument, PDFHexString, PDFName, PDFString, type PDFRef } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { AES_EC384 } from '../fixtures/certificates';
import { pagesPdf } from '../fixtures/pdfs';
import { pdfDetails, withPdf } from '../fixtures/protect-inspect';

describe('a password keeps every string readable', () => {
  /** Strings pdf-lib writes outside an object stream: a page label's prefix in the catalog, a note written straight into a page. */
  async function stringsEverywhere(): Promise<Uint8Array> {
    const doc = await PDFDocument.load(await pagesPdf(3), { updateMetadata: false });
    const { context } = doc;
    doc.catalog.set(PDFName.of('PageLabels'), context.obj({ Nums: [0, { S: 'D', P: PDFString.of('Annex A-') }] }));
    doc.catalog.set(PDFName.of('Lang'), PDFString.of('en-IN'));
    const note = context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [20, 20, 40, 40], Contents: PDFHexString.fromText('Rent is due on the 5th — ₹18,000') });
    doc.getPage(0).node.set(PDFName.of('Annots'), context.obj([note]));
    await doc.attach(new TextEncoder().encode('a,b\n'), 'costs.csv', { mimeType: 'text/csv' });
    return new Uint8Array(await doc.save());
  }

  for (const encrypted of [false, true]) {
    it(`after locking${encrypted ? ' a file that was already locked' : ''}`, async () => {
      const surgeon = createSurgeon();
      let input = await stringsEverywhere();
      if (encrypted) input = await (await surgeon.open(input)).save({ encrypt: { userPassword: 'first', allowPrinting: true, allowCopying: true } });
      const doc = await surgeon.open(input.slice(), encrypted ? { password: 'first' } : {});
      const locked = await doc.save({ encrypt: { userPassword: 'tea', allowPrinting: true, allowCopying: true } });
      expect(await withPdf(locked, (d) => d.getPageLabels(), 'tea')).toEqual(['Annex A-1', 'Annex A-2', 'Annex A-3']);
      const details = await pdfDetails(locked, 'tea');
      expect(details.annotations[0]?.[0]?.contents).toBe('Rent is due on the 5th — ₹18,000');
      expect(details.attachments.map((a) => a.name)).toEqual(['costs.csv']);
      expect(await withPdf(locked, (d) => d.getMetadata().then((m) => m.info['Language' as keyof typeof m.info]), 'tea')).toBe('en-IN');
      // Remove a password: opened with it, saved without.
      const unlocked = await (await surgeon.open(locked.slice(), { password: 'tea' })).save();
      expect(await withPdf(unlocked, (d) => d.getPageLabels())).toEqual(['Annex A-1', 'Annex A-2', 'Annex A-3']);
      expect((await pdfDetails(unlocked)).annotations[0]?.[0]?.contents).toBe('Rent is due on the 5th — ₹18,000');
    });
  }
});

describe('unlocking keeps every string as it was', () => {
  /** A literal string the way other programs write one: the cipher's bytes, with ( ) \\ and CR escaped. */
  function literal(bytes: Uint8Array): PDFString {
    let out = '';
    for (const byte of bytes) {
      if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
      else if (byte === 0x0d) out += '\\r';
      else out += String.fromCharCode(byte);
    }
    return PDFString.of(out);
  }
  const utf16 = (text: string): Uint8Array => {
    const out = [0xfe, 0xff];
    for (const ch of text) {
      const code = ch.codePointAt(0)!;
      out.push(code >> 8, code & 0xff);
    }
    return new Uint8Array(out);
  };

  it('a lock written with literal strings (as banks and Word write them) unlocks with every string intact', async () => {
    const label = 'Annex (A\\';
    const words = 'Rent (due 5th) — C:\\new ₹ ;-)';
    const doc = await PDFDocument.load(await pagesPdf(2), { updateMetadata: false });
    const { context } = doc;
    doc.encrypt({ userPassword: 'tea', ownerPassword: 'owner', algorithm: 'RC4-128', allowWeakCryptography: true } as never);
    const security = context.security!;
    const catalogRef = context.trailerInfo.Root as PDFRef;
    const pageRef = doc.getPage(0).ref;
    // Every candidate byte that trips a literal string: brackets, a backslash, a carriage return.
    const sealedLabel = security.getEncryptFn(catalogRef.objectNumber, catalogRef.generationNumber)(utf16(label));
    const sealedWords = security.getEncryptFn(pageRef.objectNumber, pageRef.generationNumber)(utf16(words));
    doc.catalog.set(PDFName.of('PageLabels'), context.obj({ Nums: [0, { S: 'D', P: literal(sealedLabel) }] }));
    const note = context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [20, 20, 40, 40], Contents: literal(sealedWords) });
    doc.getPage(0).node.set(PDFName.of('Annots'), context.obj([note]));
    const locked = new Uint8Array(await doc.save({ useObjectStreams: false }));
    // A reader sees the strings right in the locked file: the fixture is a fair one.
    expect(await withPdf(locked, (d) => d.getPageLabels(), 'tea')).toEqual([`${label}1`, `${label}2`]);
    expect((await pdfDetails(locked, 'tea')).annotations[0]?.[0]?.contents).toBe(words);

    const surgeon = createSurgeon();
    const unlocked = await (await surgeon.open(locked.slice(), { password: 'tea' })).save();
    expect(await withPdf(unlocked, (d) => d.getPageLabels())).toEqual([`${label}1`, `${label}2`]);
    expect((await pdfDetails(unlocked)).annotations[0]?.[0]?.contents).toBe(words);
    // And locked again, with ours.
    const relocked = await (await surgeon.open(unlocked.slice())).save({ encrypt: { userPassword: 'two', allowPrinting: true, allowCopying: true } });
    expect(await withPdf(relocked, (d) => d.getPageLabels(), 'two')).toEqual([`${label}1`, `${label}2`]);
  });
});

describe('find and remove covers a number to its first and last digit', () => {
  it('in a line of wide and narrow letters, measured the way the face draws them', async () => {
    const { installNodeCanvas } = await import('../fixtures/node-canvas');
    installNodeCanvas();
    const { findOnPage } = await import('../../app/src/pdf/find-text');
    const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    for (const [before, number] of [
      ['WWWWWWWW MMMM card ', '9876 5432 1098'],
      ['iiii llll fill: ', '4567 8912 3456'],
    ] as const) {
      const str = `${before}${number} and more`;
      const size = 14;
      const item = { str, x: 40, y: 100, width: font.widthOfTextAtSize(str, size), height: size, fontName: 'Helvetica', family: 'sans' as const };
      const [area] = findOnPage({ width: 595, height: 842, items: [item] }, 0, ['aadhaar'], []);
      const left = 40 + font.widthOfTextAtSize(before, size);
      const right = left + font.widthOfTextAtSize(number, size);
      expect(area).toBeDefined();
      expect(area!.x * 595, number).toBeLessThanOrEqual(left);
      expect((area!.x + area!.w) * 595, number).toBeGreaterThanOrEqual(right);
      // And not a whole word wider either side.
      expect(left - area!.x * 595).toBeLessThan(size);
      expect((area!.x + area!.w) * 595 - right).toBeLessThan(size);
    }
  });
});

function harness() {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: () => Promise.reject(new Error('no engine')),
    surgeon: createSurgeon(),
    passwords: new Map(),
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return {
    ctx,
    add: (name: string, bytes: Uint8Array) => workspace.put(name, bytes, 'pdf', { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

const produced = (outcomes: Outcome[]) => outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');

describe('digital signature on a locked file', () => {
  const certificate = new Uint8Array(Buffer.from(([] as string[]).concat(AES_EC384).join(''), 'base64'));

  it('signs it once its password is typed, says the lock is gone, and puts the box on the page asked for', async () => {
    const surgeon = createSurgeon();
    const locked = await (await surgeon.open(await pagesPdf(3))).save({ encrypt: { userPassword: 'tea', allowPrinting: true, allowCopying: true } });
    const h = harness();
    const file = await h.add('Locked.pdf', locked);
    const ctx: OpContext = { ...h.ctx, passwords: new Map([[file.id, 'tea']]) };
    const [out] = produced(
      await getOp('digital-sign').run([file], { certificate, password: 'pässword', visible: true, page: 'first', reason: 'Approved', location: 'Kochi' }, ctx),
    );
    expect(out?.detail).toBe(
      'Signed by Kerala Test Co, certificate from Kerala Test Co; shown at the foot of the first page. The signed copy opens without the password: locking it again would break the signature',
    );
    const bytes = await h.bytesOf(out!.file);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).not.toMatch(/\/Encrypt/);
    expect(text).toMatch(/\/Location <FEFF004B006F006300680069>/i);
    const details = await pdfDetails(bytes);
    expect(details.annotations[0]?.some((a) => a.fieldType === 'Sig')).toBe(true);
    expect(details.annotations[2]).toEqual([]);
  });
});

describe('set new details', () => {
  const titled = async (title: string) => {
    const doc = await PDFDocument.load(await pagesPdf(1), { updateMetadata: false });
    doc.setTitle(title);
    doc.setAuthor('Old Clerk');
    return new Uint8Array(await doc.save());
  };

  it('on one file, an empty box removes that detail', async () => {
    const h = harness();
    const one = await h.add('April.pdf', await titled('April'));
    const [out] = produced(await getOp('document-details').run([one], { mode: 'edit', title: 'April rent', author: '', subject: '', keywords: '' }, h.ctx));
    expect(out?.detail).toBe('Set the title; removed the author');
    const doc = await PDFDocument.load(await h.bytesOf(out!.file), { updateMetadata: false });
    expect([doc.getTitle(), doc.getAuthor()]).toEqual(['April rent', undefined]);
  });

  it('on several files, an empty box keeps each one its own', async () => {
    const h = harness();
    const files = [await h.add('April.pdf', await titled('April')), await h.add('May.pdf', await titled('May'))];
    const outs = produced(await getOp('document-details').run(files, { mode: 'edit', title: '', author: 'Joseph Mathew', subject: '', keywords: '' }, h.ctx));
    expect(outs.map((o) => o.detail)).toEqual(['Set the author', 'Set the author']);
    const titles = await Promise.all(outs.map(async (o) => (await PDFDocument.load(await h.bytesOf(o.file), { updateMetadata: false })).getTitle()));
    expect(titles).toEqual(['April', 'May']);
  });
});
