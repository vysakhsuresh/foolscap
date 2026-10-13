/**
 * Logic fixes found by the deep test of the Protect and Read tools
 * (tests/e2e/deep-deep-protect.spec.ts), pinned down in Node.
 */
import { PDFDocument, PDFHexString, PDFName, PDFString, type PDFRef } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createSurgeon } from '../../app/src/pdf/surgeon';
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
