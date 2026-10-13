/**
 * The Pages tools on documents like the ones people bring (tests/fixtures/
 * documents.ts), read back the way a reader app reads them: a page's
 * links, form fields and notes go where the page goes; the bookmarks,
 * labels and title come along with the pages they belong to; and nothing
 * the person did not ask to lose is lost.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { inkBounds, seenToStored } from '../../app/src/ops/pages-ops';
import { labelFor } from '../../app/src/ops/structure-ops';
import type { ToolId } from '../../app/src/ops/tools';
import type { PdfEngine } from '../../app/src/pdf/types';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { flatten, toTree } from '../../app/src/ui/bookmarks-panel';
import { annotatedPdf, idCardScanPdf, leasePdf, namedDestsPdf, reportPdf, salarySlipPdf, sidewaysScanPdf } from '../fixtures/documents';
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import { markers, outlineLines, readPdf } from '../fixtures/pdf-read';
import { stampsIn } from '../fixtures/pdfs';

installNodeCanvas();
// Real documents through real pdf.js: generous, so a busy machine does not fail them for being slow.
vi.setConfig({ testTimeout: 30_000 });
let engine: PdfEngine;
beforeAll(async () => {
  engine = await createNodeEngine();
});

function harness() {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: async () => engine,
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

const run = (tool: ToolId, inputs: readonly FoolscapFile[], params: unknown, ctx: OpContext) => getOp(tool).run(inputs, params, ctx);

function produced(outcomes: Outcome[]) {
  const list = outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
  expect(list.length, JSON.stringify(outcomes)).toBe(outcomes.length);
  return list;
}

const REPORT_OUTLINE = [
  'Cover→1',
  'Contents→2',
  '1 Overview→3',
  '  1.1 Highlights→4',
  '2 Finances→5',
  '  2.1 Table of accounts→6',
  '3 Outlook→7',
  'Appendix→8',
  'Society website→https://example.org/coir',
];

describe('merge', () => {
  it('keeps every file’s bookmarks, each still opening where it did, and the form still fills in', async () => {
    const h = harness();
    const files = [await h.add('Report.pdf', await reportPdf()), await h.add('Lease.pdf', await leasePdf()), await h.add('Slip.pdf', await salarySlipPdf())];
    const [out] = produced(await run('merge', files, {}, h.ctx));
    const bytes = await h.bytesOf(out!.file);
    const read = await readPdf(bytes);
    expect(markers(read, 'Report|Lease|Payslip')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 1]);
    expect(outlineLines(read.outline)).toEqual(REPORT_OUTLINE);
    expect(read.outline[2]?.kind).toBe('XYZ');
    expect(read.outline.find((o) => o.title === '2 Finances')?.open).toBe(false);
    // The contents page's links go to the chapters in the merged file.
    expect(read.pages[1]!.annotations.map((a) => a.dest)).toEqual([2, 4, 6, 7]);
    expect([...read.formFields].sort()).toEqual(['signed_on', 'witnessed']);
    expect(read.fields).toEqual({ signed_on: '20/09/2026', witnessed: 'Yes' });
    expect(stampsIn(bytes)).toEqual([]);
  });
});

describe('split', () => {
  it('a part keeps the bookmarks, labels and title of its own pages, and no copy of pages it does not have', async () => {
    const h = harness();
    const source = await reportPdf({ photo: 300 });
    const input = await h.add('Report.pdf', source);
    const parts = produced(await run('split', [input], { mode: 'bookmarks' }, h.ctx));
    expect(parts.map((p) => p.file.name)).toEqual([
      'Report 01 Cover.pdf',
      'Report 02 Contents.pdf',
      'Report 03 1 Overview.pdf',
      'Report 04 2 Finances.pdf',
      'Report 05 3 Outlook.pdf',
      'Report 06 Appendix.pdf',
    ]);
    const finances = await readPdf(await h.bytesOf(parts[3]!.file));
    expect(outlineLines(finances.outline)).toEqual(['2 Finances→1', '  2.1 Table of accounts→2', 'Society website→https://example.org/coir']);
    expect(finances.labels).toEqual(['3', '4']);
    expect(finances.title).toBe('Annual Report 2025-26');
    // The contents page links to every chapter. Its part holds the contents
    // page alone: no hidden copies of the chapters (and their photos), and no
    // links that go nowhere.
    const contents = await h.bytesOf(parts[1]!.file);
    expect(contents.length).toBeLessThan(10_000);
    expect((await readPdf(contents)).pages[0]!.annotations).toEqual([]);
  });

  it('one page per file from a report whose every page links back to the contents: each part holds its own page only', async () => {
    const h = harness();
    const source = await reportPdf({ photo: 300, backLinks: true });
    const input = await h.add('Report.pdf', source);
    const parts = produced(await run('split', [input], { mode: 'single' }, h.ctx));
    const sizes = await Promise.all(parts.map(async (p) => (await h.bytesOf(p.file)).length));
    // Pages 4 and 6 carry a 270 KB photo each; every other part is a page of text.
    for (const [i, size] of sizes.entries()) expect(size, `part ${i + 1}`).toBeLessThan(i === 3 || i === 5 ? 290_000 : 10_000);
    expect((await readPdf(await h.bytesOf(parts[4]!.file))).pages[0]!.annotations).toEqual([]);
    const [pair] = produced(await run('extract-pages', [input], { pages: '2-3', mode: 'keep' }, h.ctx));
    const read = await readPdf(await h.bytesOf(pair!.file));
    expect(read.pages[0]!.annotations.map((a) => a.dest)).toEqual([1]);
    expect(read.pages[1]!.annotations.map((a) => a.dest)).toEqual([0]);
  });

  it('links within a part still work', async () => {
    const h = harness();
    const input = await h.add('Report.pdf', await reportPdf());
    const [first] = produced(await run('split', [input], { mode: 'ranges', ranges: '2-5' }, h.ctx));
    const read = await readPdf(await h.bytesOf(first!.file));
    expect(markers(read, 'Report')).toEqual([2, 3, 4, 5]);
    // Links to pages 3 and 5 stay (now pages 2 and 4); links to 7 and 8 go.
    expect(read.pages[0]!.annotations.map((a) => a.dest)).toEqual([1, 3]);
  });

  it('a link that goes by name (as LaTeX writes them) goes to the page in the part', async () => {
    const h = harness();
    const input = await h.add('Thesis.pdf', await namedDestsPdf());
    const [part] = produced(await run('split', [input], { mode: 'ranges', ranges: '1-2' }, h.ctx));
    const read = await readPdf(await h.bytesOf(part!.file));
    expect(read.pages[0]!.annotations.map((a) => a.dest)).toEqual([1]);
    expect(outlineLines(read.outline)).toEqual(['Methods→2']);
  });
});

describe('extract and organise', () => {
  it('keeping pages 3-5 keeps their bookmarks, labels 1-3 and the title', async () => {
    const h = harness();
    const input = await h.add('Report.pdf', await reportPdf());
    const [out] = produced(await run('extract-pages', [input], { pages: '3-5', mode: 'keep' }, h.ctx));
    const read = await readPdf(await h.bytesOf(out!.file));
    expect(markers(read, 'Report')).toEqual([3, 4, 5]);
    expect(outlineLines(read.outline)).toEqual(['1 Overview→1', '  1.1 Highlights→2', '2 Finances→3', 'Society website→https://example.org/coir']);
    expect(read.labels).toEqual(['1', '2', '3']);
    expect(read.title).toBe('Annual Report 2025-26');
    expect(read.author).toBe('Malabar Coir Cooperative Society');
  });

  it('deleting a page in Organise keeps the rest of the bookmarks and numbers the labels on', async () => {
    const h = harness();
    const input = await h.add('Report.pdf', await reportPdf());
    const pages = [0, 1, 2, 4, 5, 6, 7].map((source) => ({ source, rotation: 0 as const }));
    const [out] = produced(await run('organise', [input], { pages }, h.ctx));
    const read = await readPdf(await h.bytesOf(out!.file));
    expect(markers(read, 'Report')).toEqual([1, 2, 3, 5, 6, 7, 8]);
    expect(outlineLines(read.outline)).toEqual([
      'Cover→1',
      'Contents→2',
      '1 Overview→3',
      '2 Finances→4',
      '  2.1 Table of accounts→5',
      '3 Outlook→6',
      'Appendix→7',
      'Society website→https://example.org/coir',
    ]);
    expect(read.labels).toEqual(['i', 'ii', '1', '2', '3', '4', '5']);
    expect(read.pages[1]!.annotations.map((a) => a.dest)).toEqual([2, 3, 5, 6]);
  });

  it('removing the signature page of a form leaves no dead field behind', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await leasePdf());
    const [out] = produced(await run('extract-pages', [input], { pages: '4', mode: 'remove' }, h.ctx));
    const read = await readPdf(await h.bytesOf(out!.file));
    expect(read.formFields).toEqual([]);
    const [kept] = produced(await run('extract-pages', [input], { pages: '4', mode: 'keep' }, h.ctx));
    const signature = await readPdf(await h.bytesOf(kept!.file));
    expect([...signature.formFields].sort()).toEqual(['signed_on', 'witnessed']);
  });
});

describe('insert', () => {
  it('puts a payslip after the contents: labels run on, every bookmark and link still lands on its page', async () => {
    const h = harness();
    const files = [await h.add('Report.pdf', await reportPdf()), await h.add('Slip.pdf', await salarySlipPdf())];
    const [out] = produced(await run('insert-pages', files, { what: 'files', after: 2, blankCount: 1 }, h.ctx));
    expect(out!.detail).toBe('1 page added after page 2, 9 in all');
    const read = await readPdf(await h.bytesOf(out!.file));
    expect(markers(read, 'Report|Payslip')).toEqual([1, 2, 1, 3, 4, 5, 6, 7, 8]);
    expect(read.pages[2]!.text).toContain('Net pay Rs. 62,250.00');
    expect(read.labels).toEqual(['i', 'ii', 'iii', '1', '2', '3', '4', '5', '6']);
    expect(outlineLines(read.outline)[2]).toBe('1 Overview→4');
    expect(read.pages[1]!.annotations.map((a) => a.dest)).toEqual([3, 5, 7, 8]);
  });

  it('two blank pages in a landscape section are landscape, and the numbering runs on', async () => {
    const h = harness();
    const input = await h.add('Report.pdf', await reportPdf());
    const [out] = produced(await run('insert-pages', [input], { what: 'blank', after: 7, blankCount: 2 }, h.ctx));
    const read = await readPdf(await h.bytesOf(out!.file));
    expect(read.pages.map((p) => p.width > p.height)).toEqual([false, false, false, false, false, false, true, true, true, false]);
    expect(read.labels).toEqual(['i', 'ii', '1', '2', '3', '4', '5', '6', '7', '8']);
  });
});

describe('crop', () => {
  it('fitting to A4 keeps the words, the highlight, the note, the link and the filled field, moved with the page', async () => {
    const h = harness();
    const input = await h.add('Annotated.pdf', await annotatedPdf());
    const [out] = produced(await run('crop', [input], { mode: 'paper', paper: 'a4' }, h.ctx));
    const read = await readPdf(await h.bytesOf(out!.file));
    const page = read.pages[0]!;
    expect([page.width, page.height]).toEqual([595.28, 841.89]);
    expect(page.text).toContain('Please check the rent clause again.');
    expect(page.annotations.map((a) => a.subtype)).toEqual(['Highlight', 'Text', 'Link', 'Widget']);
    expect(read.fields).toEqual({ tenant_name: 'Farhan Ali' });
    // Letter is wider and shorter than A4: scaled by 595.28 / 612 and centred up and down.
    const s = 595.28 / 612;
    const ty = (841.89 - 792 * s) / 2;
    const link = page.annotations.find((a) => a.subtype === 'Link')!;
    expect(link.rect[0]).toBeCloseTo(72 * s, 1);
    expect(link.rect[1]).toBeCloseTo(500 * s + ty, 1);
    expect(link.url).toBe('https://example.org/lease');
  });

  it('a card left at its real size stays card-sized in the middle of the sheet, and only the pages asked for change', async () => {
    const h = harness();
    const card = await h.add('ID.pdf', await idCardScanPdf());
    const [real] = produced(await run('crop', [card], { mode: 'paper', paper: 'a4', enlarge: false }, h.ctx));
    const doc = await PDFDocument.load(await h.bytesOf(real!.file), { updateMetadata: false });
    expect(doc.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
    expect(real!.detail).toBe('1 page put on A4, smaller pages at their real size');

    const report = await h.add('Report.pdf', await reportPdf());
    const [some] = produced(await run('crop', [report], { mode: 'trim', mm: 10, pages: '2-3' }, h.ctx));
    expect(some!.detail).toBe('10 mm trimmed from every edge of pages 2-3');
    const read = await readPdf(await h.bytesOf(some!.file));
    expect(read.pages.map((p) => Math.round(p.width))).toEqual([595, 539, 539, 595, 595, 595, 842, 595]);
  });

  it('trims each edge as the reader sees the page, even on a page stored sideways', async () => {
    const h = harness();
    const input = await h.add('Sideways.pdf', await sidewaysScanPdf());
    const edges = { top: 20, right: 0, bottom: 0, left: 10 };
    const [out] = produced(await run('crop', [input], { mode: 'trim', mm: 0, edges }, h.ctx));
    expect(out!.detail).toBe('20 mm off the top, 0 mm right, 0 mm bottom and 10 mm left of 2 pages');
    const doc = await PDFDocument.load(await h.bytesOf(out!.file), { updateMetadata: false });
    const crop = doc.getPage(0).getCropBox();
    const mm = 72 / 25.4;
    // Stored portrait, shown turned a quarter clockwise: the top as seen is the stored left edge, the left as seen the stored bottom.
    expect(crop.x).toBeCloseTo(20 * mm, 2);
    expect(crop.y).toBeCloseTo(10 * mm, 2);
    expect(crop.width).toBeCloseTo(595.28 - 20 * mm, 2);
    expect(crop.height).toBeCloseTo(841.89 - 10 * mm, 2);
  });

  it('removes the white margins down to what is drawn, and says so when there are none', async () => {
    const h = harness();
    const input = await h.add('Slip.pdf', await salarySlipPdf());
    const [out] = produced(await run('crop', [input], { mode: 'auto' }, h.ctx));
    expect(out!.detail).toBe('White margins removed from 1 page');
    const doc = await PDFDocument.load(await h.bytesOf(out!.file), { updateMetadata: false });
    const crop = doc.getPage(0).getCropBox();
    // The slip's ink runs from the box at x 40 to the rule at 555, and from the footer near y 30 to the box top at 800; 2 mm is left round it.
    expect(crop.x).toBeGreaterThan(30);
    expect(crop.x).toBeLessThan(40);
    expect(crop.x + crop.width).toBeGreaterThan(555);
    expect(crop.x + crop.width).toBeLessThan(565);
    expect(crop.y + crop.height).toBeGreaterThan(800);
    expect(crop.y + crop.height).toBeLessThan(810);
    expect((await readPdf(await h.bytesOf(out!.file))).pages[0]!.text).toContain('Net pay Rs. 62,250.00');

    const card = await h.add('ID.pdf', await idCardScanPdf());
    const [none] = await run('crop', [card], { mode: 'auto' }, h.ctx);
    expect(none?.kind).toBe('failed');
  });

  it('maps a rectangle as seen to the page’s own space for every turn', () => {
    const box = { x: 10, y: 20, width: 100, height: 200 };
    const top = { x0: 0, y0: 0, x1: 1, y1: 0.5 };
    expect(seenToStored(box, 0, top)).toEqual({ x: 10, y: 120, width: 100, height: 100 });
    // Turned 90: the seen top half is the stored left half.
    expect(seenToStored(box, 90, top)).toEqual({ x: 10, y: 20, width: 50, height: 200 });
    expect(seenToStored(box, 180, top)).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    expect(seenToStored(box, 270, top)).toEqual({ x: 60, y: 20, width: 50, height: 200 });
  });

  it('finds the ink on a picture of a page', () => {
    const w = 10;
    const h = 8;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    const ink = (x: number, y: number) => data.set([0, 0, 0, 255], (y * w + x) * 4);
    ink(2, 3);
    ink(6, 5);
    expect(inkBounds(data, w, h)).toEqual({ x0: 0.2, y0: 3 / 8, x1: 0.7, y1: 6 / 8 });
    expect(inkBounds(new Uint8ClampedArray(w * h * 4).fill(255), w, h)).toBeNull();
  });
});

describe('bookmarks', () => {
  it('renaming one keeps where every other opens, the web link, the closed chapter, and the new name', async () => {
    const h = harness();
    const input = await h.add('Report.pdf', await reportPdf());
    const view = await engine.open(await h.bytesOf(input));
    const rows = flatten(await view.outline());
    await view.close();
    expect(rows.map((r) => r.page)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, null]);
    rows[2]!.title = 'Overview of the year';
    rows[7]!.page = 6;
    const [out] = produced(await run('bookmarks', [input], { items: toTree(rows) }, h.ctx));
    const read = await readPdf(await h.bytesOf(out!.file));
    expect(outlineLines(read.outline)).toEqual([
      'Cover→1',
      'Contents→2',
      'Overview of the year→3',
      '  1.1 Highlights→4',
      '2 Finances→5',
      '  2.1 Table of accounts→6',
      '3 Outlook→7',
      'Appendix→7',
      'Society website→https://example.org/coir',
    ]);
    expect(read.outline[2]!.kind).toBe('XYZ');
    expect(read.outline.find((o) => o.title === 'Appendix')!.kind).toBe('Fit');
    expect(read.outline.find((o) => o.title === '2 Finances')!.open).toBe(false);
  });
});

describe('page labels', () => {
  it('names pages in every style a reader knows', async () => {
    expect([1, 4, 27, 28].map((n) => labelFor(n, 'Alpha'))).toEqual(['A', 'D', 'AA', 'BB']);
    expect(labelFor(14, 'Roman')).toBe('XIV');
    const h = harness();
    const input = await h.add('Report.pdf', await reportPdf());
    const [out] = produced(await run('page-labels', [input], { mode: 'set', front: 2, start: 1, prefix: 'A-', frontStyle: 'Roman', style: 'Alpha' }, h.ctx));
    expect(out!.detail).toBe('Pages labelled I to II, then A-A to A-F');
    expect((await readPdf(await h.bytesOf(out!.file))).labels).toEqual(['I', 'II', 'A-A', 'A-B', 'A-C', 'A-D', 'A-E', 'A-F']);
    const [bad] = await run('page-labels', [input], { mode: 'set', front: -1, start: 1, prefix: '' }, h.ctx);
    expect(bad?.kind).toBe('failed');
  });
});
