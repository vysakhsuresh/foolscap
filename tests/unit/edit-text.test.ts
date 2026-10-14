/**
 * Edit text on the documents people actually change: a table whose cells are
 * told apart only by the lines between them, a Windows font the new words
 * must be written in again, a cell too narrow for the new words, and a scan
 * whose words are pixels.
 */
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, StandardFonts } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { familyOf } from '../../app/src/pdf/engine-core';
import { fitLine } from '../../app/src/pdf/fit-line';
import { segmentsOf } from '../../app/src/pdf/find-text';
import { pageCover } from '../../app/src/pdf/page-cover';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { ownFont, readToUnicode } from '../../app/src/pdf/surgeon-fonts';
import type { PageLayout } from '../../app/src/pdf/types';
import { boldWords, findRules, planScanEdit, scanLines } from '../../app/src/ui/scan-lines';
import { ruledOrderPdf } from '../fixtures/edit-samples';
import { openPdf } from '../fixtures/mark-inspect';
import { createNodeEngine } from '../fixtures/node-canvas';

describe('reading a page for Edit text', () => {
  it('reads a font family from its real name first: "Sans Serif" is sans, whatever else the name says', () => {
    expect(familyOf('MicrosoftSansSerif', 'serif')).toBe('sans');
    expect(familyOf('ABCDEF+Arial-BoldMT', undefined)).toBe('sans');
    expect(familyOf('Calibri', 'serif')).toBe('sans');
    expect(familyOf('TimesNewRomanPSMT', undefined)).toBe('serif');
    expect(familyOf('NotoSerif-Regular', undefined)).toBe('serif');
    expect(familyOf('CourierNewPSMT', undefined)).toBe('mono');
    expect(familyOf('', 'serif')).toBe('serif');
    expect(familyOf('SomethingElse', undefined)).toBe('sans');
  });

  it('finds the upright lines a page draws: stroked runs and thin filled bars, not boxes or slants', () => {
    const ops = { save: 1, restore: 2, transform: 3, setTextRenderingMode: 4, showText: 5, showSpacedText: 6, nextLineShowText: 7, nextLineSetSpacingShowText: 8, paintImageXObject: 9, paintInlineImageXObject: 10, paintImageMaskXObject: 11, paintFormXObjectBegin: 12, paintFormXObjectEnd: 13, beginAnnotation: 14, constructPath: 15 };
    const path = (...n: number[]) => [20, [new Float32Array(n)], null];
    const { rules } = pageCover(
      [15, 15, 15, 15, 1, 3, 15, 2],
      [
        // A stroked line from (100, 50) to (100, 300).
        path(0, 100, 50, 1, 100, 300),
        // A filled bar one point wide, as a rectangle.
        path(0, 200, 40, 1, 201, 40, 1, 201, 240, 1, 200, 240, 4),
        // A box: its two sides are upright runs of its own.
        path(0, 300, 10, 1, 360, 10, 1, 360, 30, 1, 300, 30, 4),
        // A slanted line is not a rule.
        path(0, 400, 10, 1, 420, 200),
        null,
        [1, 0, 0, 1, 50, 0],
        // Under a transform: the line lands 50 points to the right.
        path(0, 10, 0, 1, 10, 100),
        null,
      ],
      ops,
      [0, 0, 600, 800],
    );
    expect(rules).toContainEqual([100, 50, 300]);
    expect(rules).toContainEqual([200.5, 40, 240]);
    expect(rules).toContainEqual([360, 10, 30]);
    expect(rules).toContainEqual([300, 10, 30]);
    expect(rules).toContainEqual([60, 0, 100]);
    expect(rules.some(([x]) => x > 399 && x < 421)).toBe(false);
  });

  it('cuts a row at the line between its cells even where the words almost touch, and gives each cell its room', async () => {
    const order = await ruledOrderPdf();
    const engine = await createNodeEngine();
    const view = await engine.open(order.bytes);
    try {
      const layout = await view.layout(0);
      expect(layout.rules?.length).toBeGreaterThanOrEqual(order.rules.length);
      const segments = segmentsOf(layout);
      const description = segments.find((s) => s.text.includes('Moringa'));
      expect(description?.text).toBe('O/I Moringa Leaf Powder 100g');
      expect(segments.find((s) => s.text === 'ORGANIC IND')).toBeDefined();
      // From just inside its left line to just inside its right one.
      expect(description!.room.left).toBeLessThanOrEqual(order.cells.description.x0);
      expect(description!.room.left).toBeGreaterThan(order.rules[2]!);
      expect(description!.room.right).toBeLessThan(order.rules[3]!);
      expect(description!.room.right).toBeGreaterThan(order.rules[3]! - 4);
      // The font is the file's own name for it, and is read as sans.
      expect(description!.font).toBe('MicrosoftSansSerif');
      expect(description!.family).toBeUndefined();
    } finally {
      await view.close();
    }
  });

  it('without the lines, nearby words in a row would run together: the lines are what split it', () => {
    const item = (str: string, x: number, width: number) => ({ str, x, y: 100, width, height: 8, fontName: 'F' });
    const layout: PageLayout = { width: 600, height: 800, items: [item('ORGANIC IND', 100, 60), item('O/I Moringa', 165, 50)] };
    expect(segmentsOf(layout).map((s) => s.text)).toEqual(['ORGANIC IND O/I Moringa']);
    expect(segmentsOf({ ...layout, rules: [{ x: 162.5, top: 80, bottom: 110 }] }).map((s) => s.text)).toEqual(['ORGANIC IND', 'O/I Moringa']);
    // A line above or below the words does not cut them.
    expect(segmentsOf({ ...layout, rules: [{ x: 162.5, top: 0, bottom: 50 }] }).map((s) => s.text)).toEqual(['ORGANIC IND O/I Moringa']);
  });
});

describe('fitting a changed line into its cell', () => {
  it('leaves a line that fits alone, squeezes up to 15%, then makes it smaller, never under half', () => {
    expect(fitLine(80, 100)).toEqual({ squeeze: 100, scale: 1 });
    expect(fitLine(110, 100)).toEqual({ squeeze: 90, scale: 1 });
    const tight = fitLine(200, 100);
    expect(tight.squeeze).toBe(85);
    expect(200 * 0.85 * tight.scale).toBeCloseTo(100, 5);
    expect(fitLine(1000, 100).scale).toBe(0.5);
    expect(fitLine(50, 0)).toEqual({ squeeze: 100, scale: 1 });
  });
});

describe('writing in the document’s own font', () => {
  it('reads a ToUnicode map backwards: single codes, ranges, and ranges given as lists', () => {
    const cmap = `begincmap
2 begincodespacerange <0000> <FFFF> endcodespacerange
2 beginbfchar
<0003> <0020>
<0024> <0041>
endbfchar
2 beginbfrange
<0044> <0046> <0061>
<0050> <0051> [<0070> <00660069>]
endbfrange
endcmap`;
    const { codes, bytes } = readToUnicode(cmap);
    expect(bytes).toBe(2);
    expect(codes.get(' ')).toBe(3);
    expect(codes.get('A')).toBe(0x24);
    expect(codes.get('a')).toBe(0x44);
    expect(codes.get('c')).toBe(0x46);
    expect(codes.get('p')).toBe(0x50);
    expect(codes.get('fi')).toBe(0x51);
  });

  async function pageWithFonts(): Promise<PDFDocument> {
    const doc = await PDFDocument.create({ updateMetadata: false });
    const page = doc.addPage([400, 400]);
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const widths = Array.from({ length: 95 }, (_, k) => Math.round(helvetica.widthOfTextAtSize(String.fromCharCode(32 + k), 1000)));
    const fontFile = doc.context.register(doc.context.stream(new Uint8Array([0, 1, 0, 0])));
    const font = (base: string, embedded: boolean) =>
      doc.context.register(
        doc.context.obj({
          Type: 'Font',
          Subtype: 'TrueType',
          BaseFont: base,
          FirstChar: 32,
          LastChar: 126,
          Widths: widths,
          Encoding: 'WinAnsiEncoding',
          FontDescriptor: doc.context.obj({ Type: 'FontDescriptor', FontName: base, Flags: 32, ...(embedded ? { FontFile2: fontFile } : {}) }),
        }),
      );
    page.node.newFontDictionary('Whole', font('MicrosoftSansSerif', false));
    page.node.newFontDictionary('Sub', font('ABCDEF+Calibri', true));
    page.node.newFontDictionary('Full', font('Verdana', true));
    // A composite font: two-byte codes from its ToUnicode map, widths from W.
    const toUnicode = doc.context.register(
      doc.context.flateStream(new TextEncoder().encode('begincmap\n1 beginbfrange\n<0024> <003D> <0041>\nendbfrange\n1 beginbfchar\n<0003> <0020>\nendbfchar\nendcmap')),
    );
    page.node.newFontDictionary(
      'Cid',
      doc.context.register(
        doc.context.obj({
          Type: 'Font',
          Subtype: 'Type0',
          BaseFont: 'GHIJKL+Arial',
          Encoding: 'Identity-H',
          ToUnicode: toUnicode,
          DescendantFonts: [doc.context.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'GHIJKL+Arial', DW: 500, W: [0x24, [667, 667, 722]] })],
        }),
      ),
    );
    return doc;
  }

  it('reuses a font the file names but does not carry for any letter it has a width for', async () => {
    const doc = await pageWithFonts();
    const page = doc.getPage(0);
    const font = ownFont(page, doc.context, 'MicrosoftSansSerif', '', 'Moringa 250g');
    expect(font).not.toBeNull();
    const pieces = font!.pieces('Ab c')!;
    expect(pieces).toHaveLength(1);
    expect((pieces[0] as PDFHexString).asString()).toBe('41622063');
    expect(font!.width('A')).toBeCloseTo(0.667, 3);
    // Letters it has no code or width for: no.
    expect(ownFont(page, doc.context, 'MicrosoftSansSerif', '', 'Moringa ₹250')).toBeNull();
    expect(ownFont(page, doc.context, 'MicrosoftSansSerif', '', 'മലയാളം')).toBeNull();
  });

  it('writes in a subset only what the page already shows in it, and a space it lacks as a gap', async () => {
    const doc = await pageWithFonts();
    const page = doc.getPage(0);
    expect(ownFont(page, doc.context, 'Calibri', 'Price 12.0', 'Price 21.0')).not.toBeNull();
    expect(ownFont(page, doc.context, 'Calibri', 'Price 12.0', 'Price 13.0')).toBeNull();
    const gapped = ownFont(page, doc.context, 'Calibri', 'Price12', 'Price 12')!;
    const pieces = gapped.pieces('Price 12')!;
    expect(pieces.map((p) => (p instanceof PDFNumber ? p.asNumber() : 'text'))).toEqual(['text', -250, 'text']);
    // A whole embedded font writes anything it has a width for.
    expect(ownFont(page, doc.context, 'Verdana', '', 'Anything at all 123')).not.toBeNull();
  });

  it('will not guess between two subsets of one face: the page’s letters cannot say which holds which', async () => {
    const doc = await pageWithFonts();
    const page = doc.getPage(0);
    const fonts = page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    const calibri = fonts
      .entries()
      .map(([, ref]) => doc.context.lookup(ref, PDFDict))
      .find((d) => d.get(PDFName.of('BaseFont'))?.toString() === '/ABCDEF+Calibri')!;
    const twin = calibri.clone(doc.context);
    twin.set(PDFName.of('BaseFont'), PDFName.of('QRSTUV+Calibri'));
    page.node.newFontDictionary('Twin', doc.context.register(twin));
    expect(ownFont(page, doc.context, 'Calibri', 'Price 12.0', 'Price 21.0')).toBeNull();
    // Named exactly, the subset is known.
    expect(ownFont(page, doc.context, 'QRSTUV+Calibri', 'Price 12.0', 'Price 21.0')).not.toBeNull();
  });

  it('writes a composite font in its own two-byte codes, only with characters the page shows', async () => {
    const doc = await pageWithFonts();
    const page = doc.getPage(0);
    const font = ownFont(page, doc.context, 'Arial', 'ABC ', 'CAB')!;
    expect(font).not.toBeNull();
    expect((font.pieces('CAB')![0] as PDFHexString).asString()).toBe('002600240025');
    expect(font.width('CAB')).toBeCloseTo((722 + 667 + 667) / 1000, 5);
    expect(ownFont(page, doc.context, 'Arial', 'ABC ', 'CABD')).toBeNull();
  });

  it('writes a changed cell in the file’s own font, kept between the cell’s lines', async () => {
    const order = await ruledOrderPdf();
    const doc = await createSurgeon().open(order.bytes.slice());
    const cell = order.cells.description;
    const text = 'O/I Moringa Leaf Powder Organic Premium 250g Pack';
    await doc.drawMarks([
      { kind: 'fill', area: { page: 0, x: cell.x0 / order.width, y: order.rowTop / order.height, w: (cell.x1 - cell.x0) / order.width, h: (order.rowBottom - order.rowTop) / order.height }, color: [1, 1, 1] },
      {
        kind: 'text',
        area: { page: 0, x: cell.x0 / order.width, y: (order.baseline - order.size * 0.97) / order.height, w: (cell.x1 - cell.x0) / order.width, h: 0.02 },
        text,
        size: order.size / order.width,
        color: [0, 0, 0],
        own: { name: 'MicrosoftSansSerif', chars: '' },
        fit: { left: order.rules[2]! / order.width, right: (order.rules[3]! - 2) / order.width },
      },
    ]);
    const out = await doc.save();
    const pdf = await openPdf(out);
    try {
      const written = (await pdf.words(0)).find((w) => w.text === text)!;
      expect(written).toBeDefined();
      expect(Math.abs(written.x - cell.x0)).toBeLessThan(0.5);
      expect(written.x + written.width).toBeLessThanOrEqual(order.rules[3]! - 1.5);
      const fonts = await pdf.fonts(0);
      expect(fonts.find((f) => f.text === text)?.font).toBe('MicrosoftSansSerif');
    } finally {
      await pdf.close();
    }
  });
});

describe('Edit text on a scan', () => {
  const word = (text: string, x: number, y: number, w: number, h = 0.012) => ({ text, x, y, w, h });

  it('makes lines of the reader’s words, drops the column lines it read as "|", and cuts rows at the printed lines', () => {
    const words = [
      word('LT020', 0.1, 0.4, 0.06),
      word('|', 0.165, 0.399, 0.006),
      word('PEPERO', 0.18, 0.4, 0.08),
      word('ASSORTED', 0.265, 0.4, 0.1),
      word('|5023659804718', 0.4, 0.4, 0.15),
      word('Dear', 0.1, 0.3, 0.05),
      word('Sir,', 0.155, 0.3, 0.04),
    ];
    const rules = [
      { x: 0.168, top: 0.38, bottom: 0.45 },
      { x: 0.395, top: 0.38, bottom: 0.45 },
    ];
    const lines = scanLines(words, 1.4, rules);
    expect(lines.map((l) => l.text)).toEqual(['Dear Sir,', 'LT020', 'PEPERO ASSORTED', '5023659804718']);
    const cell = lines.find((l) => l.text === 'PEPERO ASSORTED')!;
    expect(cell.room.left).toBeGreaterThan(0.168);
    expect(cell.room.right).toBeLessThan(0.395);
    // The stray bar is gone from the barcode, and its box starts after it.
    const barcode = lines.find((l) => l.text === '5023659804718')!;
    expect(barcode.x0).toBeGreaterThan(0.4);
  });

  it('repaints only the words that changed, closes a hole a short tail would leave, and moves the tail for an insertion', () => {
    const line = {
      size: 0.02,
      room: { left: 0.1, right: 0.9 },
      words: [
        { text: 'PEPERO', x0: 0.1, x1: 0.2 },
        { text: 'ASSORTED', x0: 0.21, x1: 0.34, bold: true },
        { text: '(10x4x36g)', x0: 0.35, x1: 0.45 },
        { text: 'box', x0: 0.46, x1: 0.5 },
        { text: 'of', x0: 0.51, x1: 0.53 },
        { text: 'twelve', x0: 0.54, x1: 0.6 },
      ],
    };
    const measure = (t: string) => t.length * 0.012;
    expect(planScanEdit(line, 'PEPERO ASSORTED (10x4x36g) box of twelve', measure)).toBeNull();
    // Same length: only the changed word.
    const swap = planScanEdit(line, 'PEPERO ASSORTEX (10x4x36g) box of twelve', measure)!;
    expect(swap).toMatchObject({ paint: { x0: 0.21, x1: 0.34 }, start: 0.21, text: 'ASSORTEX', bold: true });
    // Much shorter, with a long tail after it: the hole is left rather than rewriting the rest.
    expect(planScanEdit(line, 'PEPERO MIX (10x4x36g) box of twelve', measure)).toMatchObject({ text: 'MIX', paint: { x1: 0.34 } });
    // Much shorter with a short tail: the tail moves up.
    const shortTail = { ...line, words: line.words.slice(0, 3) };
    expect(planScanEdit(shortTail, 'PEPERO MIX (10x4x36g)', measure)).toMatchObject({ text: 'MIX (10x4x36g)', paint: { x0: 0.21, x1: 0.45 } });
    // Too long for its place: rewritten to the end of the line.
    expect(planScanEdit(line, 'PEPERO ASSORTED-AND-MIXED-FLAVOURS (10x4x36g) box of twelve', measure)).toMatchObject({ text: 'ASSORTED-AND-MIXED-FLAVOURS (10x4x36g) box of twelve', paint: { x0: 0.21, x1: 0.6 } });
    // A word added at the end: written after the last one, nothing painted out.
    const added = planScanEdit(line, 'PEPERO ASSORTED (10x4x36g) box of twelve only', measure)!;
    expect(added.text).toBe('only');
    expect(added.start).toBeGreaterThan(0.6);
    // A word taken out: the rest moves up.
    expect(planScanEdit(shortTail, 'PEPERO (10x4x36g)', measure)).toMatchObject({ text: '(10x4x36g)', paint: { x0: 0.21, x1: 0.45 } });
  });

  it('finds printed upright lines in a picture, and tells bold words by their ink', () => {
    const width = 200;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const ink = (x: number, y: number) => data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    for (let y = 10; y < 90; y++) {
      ink(50, y);
      ink(51, y);
      // A short stroke (a letter) is not a line.
      if (y < 20) ink(120, y);
    }
    // A broken pixel or two is still the same line.
    data.fill(255, (40 * width + 50) * 4, (40 * width + 52) * 4);
    const rules = findRules({ data, width, height }, 30);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.x).toBeCloseTo(51 / 200, 3);
    expect(rules[0]!.top).toBeCloseTo(0.1, 2);
    // Bold: one box a third inked, two others an eighth.
    const page = new Uint8ClampedArray(width * height * 4).fill(255);
    const fill = (x0: number, x1: number, every: number) => {
      for (let y = 0; y < 10; y++) for (let x = x0; x < x1; x++) if ((x - x0) % every === 0) page.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    };
    fill(0, 30, 3);
    fill(40, 70, 8);
    fill(80, 110, 8);
    const box = (x0: number, x1: number) => ({ x0: x0 / width, x1: x1 / width, top: 0, bottom: 0.1 });
    expect(boldWords({ data: page, width, height }, [box(0, 30), box(40, 70), box(80, 110)])).toEqual([true, false, false]);
  });
});

