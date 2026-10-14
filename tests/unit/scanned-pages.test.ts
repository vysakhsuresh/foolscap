/**
 * Scanned PDFs that carry the scanner's hidden guess at their words: PDF to
 * Word and EPUB keep each such page as the picture it is, unless words are
 * asked for, and never pour the hidden guesses out as visible text under the
 * picture. Found with a real passport scan (OmniPage, render mode 3) whose
 * Word file came out as five pages of picture plus junk like "III11111".
 */
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome, PdfToWordParams } from '../../app/src/ops/op';
import { pageCover, SCAN_COVER } from '../../app/src/pdf/page-cover';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { PdfEngine } from '../../app/src/pdf/types';
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import { reportPdf, scannerPdf } from '../fixtures/realistic';

installNodeCanvas();
let engine: PdfEngine;
beforeAll(async () => {
  engine = await createNodeEngine();
}, 60_000);

async function convert(tool: 'pdf-to-word' | 'pdf-to-epub', bytes: Uint8Array, params: PdfToWordParams & { format?: 'epub' | 'html' }) {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = { workspace, engine: async () => engine, surgeon: createSurgeon(), passwords: new Map(), signal: new AbortController().signal, progress: () => undefined };
  const input = await workspace.put('Passport.pdf', bytes, 'pdf', { kind: 'picked' });
  const outcomes: Outcome[] = await getOp(tool).run([input], params as never, ctx);
  const made = outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
  expect(made, JSON.stringify(outcomes)).toHaveLength(1);
  const file: FoolscapFile = made[0]!.file;
  const out = new Uint8Array(await (await workspace.read(file)).arrayBuffer());
  return { detail: made[0]!.detail, parts: unzipSync(out) };
}

const textOf = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
const pictures = (parts: Record<string, Uint8Array>) => Object.keys(parts).filter((k) => /media\/image\d+\./.test(k)).length;

describe('a page that is a scan', () => {
  it('is told apart by its drawing: invisible words, or words under a picture painted after them', async () => {
    for (const layer of ['invisible', 'under'] as const) {
      const view = await engine.open(await scannerPdf(layer, 1));
      try {
        const layout = await view.layout(0);
        expect(layout.pictureCover, layer).toBeGreaterThanOrEqual(SCAN_COVER);
        expect(layout.hiddenText, layer).toBe(1);
        expect(layout.items.length, layer).toBeGreaterThan(0);
      } finally {
        await view.close();
      }
    }
    // An ordinary page with a photo and visible words is not a scan.
    const view = await engine.open((await reportPdf()).bytes);
    try {
      for (let i = 0; i < view.pageCount; i++) {
        const layout = await view.layout(i);
        expect((layout.pictureCover ?? 0) >= SCAN_COVER && (layout.hiddenText ?? 0) >= 0.8, `report page ${i + 1}`).toBe(false);
      }
    } finally {
      await view.close();
    }
  });

  it('pageCover counts the text drawn in render mode 3 and 7 as unseen, and text later covered by a page-sized picture', () => {
    const ops = { save: 1, restore: 2, transform: 3, setTextRenderingMode: 4, showText: 5, showSpacedText: 6, nextLineShowText: 7, nextLineSetSpacingShowText: 8, paintImageXObject: 9, paintInlineImageXObject: 10, paintImageMaskXObject: 11, paintFormXObjectBegin: 12, paintFormXObjectEnd: 13, beginAnnotation: 14 };
    const box = [0, 0, 100, 100] as const;
    const page = [1, 3, 9, 2];
    const pageArgs = [null, [100, 0, 0, 100, 0, 0], null, null];
    expect(pageCover([...page, 5], [...pageArgs, null], ops, box)).toEqual({ pictureCover: 1, hiddenText: 0 });
    expect(pageCover([4, 5, ...page], [[3], null, ...pageArgs], ops, box)).toEqual({ pictureCover: 1, hiddenText: 1 });
    expect(pageCover([5, ...page], [null, ...pageArgs], ops, box)).toEqual({ pictureCover: 1, hiddenText: 1 });
    expect(pageCover([4, 5, 4, 5], [[7], null, [0], null], ops, box)).toEqual({ pictureCover: 0, hiddenText: 0.5 });
    // A small photo is not the page.
    expect(pageCover([1, 3, 9, 2, 5], [null, [30, 0, 0, 30, 0, 0], null, null, null], ops, box).pictureCover).toBeCloseTo(0.09, 2);
  });
});

describe('PDF to Word on a scan with hidden words', () => {
  it('keeps each page as one picture by default, and none of the hidden guesses', async () => {
    const { detail, parts } = await convert('pdf-to-word', await scannerPdf('invisible', 2), { scans: false, scanPages: 'picture' });
    const xml = strFromU8(parts['word/document.xml']!);
    expect(pictures(parts)).toBe(2);
    expect(textOf(xml).trim()).toBe('');
    expect(xml).not.toContain('III11111');
    // Two pages: the break rides in the first picture's paragraph, with no empty paragraph to spill onto a blank page.
    expect(xml.match(/w:type="page"/g)?.length).toBe(1);
    expect(xml).not.toMatch(/<\/w:drawing><\/w:r><\/w:p><w:p><w:r><w:br w:type="page"\/>/);
    // The page is the scan's own size, with a narrow margin so the picture nearly fills it.
    expect(xml).toMatch(/<w:pgSz w:w="7120" w:h="9720"\/>/);
    expect(xml).toContain('w:top="360"');
    expect(detail).toContain('2 scanned pages kept as pictures of the page');
  });

  it('also when the words are under the picture rather than invisible, and when no choice is sent', async () => {
    const { parts } = await convert('pdf-to-word', await scannerPdf('under', 2), { scans: false });
    expect(pictures(parts)).toBe(2);
    expect(textOf(strFromU8(parts['word/document.xml']!)).trim()).toBe('');
  });

  it('gives the words, without the picture, when editable words are chosen, and says where they came from', async () => {
    const { detail, parts } = await convert('pdf-to-word', await scannerPdf('invisible', 2), { scans: true, scanPages: 'words' });
    const text = textOf(strFromU8(parts['word/document.xml']!));
    expect(pictures(parts)).toBe(0);
    expect(text).toContain('Surname SURESH 1');
    expect(text).toContain('Given name VYSAKH 2');
    expect(detail).toContain('taken from the text the scanner hid in them: check names and numbers');
  });

  it('gives the picture and then its words when both are chosen', async () => {
    const { parts } = await convert('pdf-to-word', await scannerPdf('invisible', 1), { scans: true, scanPages: 'both' });
    const xml = strFromU8(parts['word/document.xml']!);
    expect(pictures(parts)).toBe(1);
    expect(xml.indexOf('<w:drawing>')).toBeLessThan(xml.indexOf('REPUBLIC OF INDIA'));
  });

  it('an EPUB of the same scan carries the pictures, not the guesses', async () => {
    const { parts } = await convert('pdf-to-epub', await scannerPdf('invisible', 2), { scans: false, scanPages: 'picture', format: 'epub' });
    const pages = Object.entries(parts).filter(([k]) => k.endsWith('.xhtml')).map(([, v]) => strFromU8(v)).join('');
    expect(Object.keys(parts).filter((k) => /\.(jpe?g|png)$/.test(k)).length).toBe(2);
    expect(pages).not.toContain('III11111');
  });
});
