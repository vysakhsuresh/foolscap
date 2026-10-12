/**
 * From PDF to the formats people edit: Word, Excel, PowerPoint, EPUB and a
 * web page. pdf.js reads where every word sits (PdfView.layout); the
 * converters in convert/ infer paragraphs, headings, lists and tables from
 * that geometry and write the file. All of it in the op worker.
 */
import { fromDocx, toDocx } from '../convert/docx';
import { toEpub } from '../convert/epub';
import { toHtml } from '../convert/html';
import type { Block, Deck, FlowDocument, Workbook } from '../convert/model';
import { toPptx } from '../convert/pptx';
import type { PageText, TextItem } from '../convert/text-layout';
import { toFlow, toWorkbook } from '../convert/text-layout';
import { fromXlsx, toXlsx } from '../convert/xlsx';
import { unzipSync } from 'fflate';
import type { FoolscapFile } from '../files/types';
import type { LinePainter, PdfView } from '../pdf';
import { baseName, failed, ordinal, plural, readInput, refused, stem, store } from './common';
import { checkCancelled, type Op, type OpContext, type Outcome, type PdfToEpubParams, type PdfToWordParams } from './op';
import { openView, pngHeight, pngWidth } from './render-ops';

/** Fewer letters than this on a page and it is treated as a scan. */
const HAS_TEXT = 12;
const OCR_DPI = 300;

interface Read {
  readonly pages: PageText[];
  readonly scanned: number;
  readonly read: number;
}

/** Every page's words and where they sit; with `scans`, the words in pictures of pages too. */
async function readPages(ctx: OpContext, view: PdfView, which: string, scans: boolean): Promise<Read> {
  const pages: PageText[] = [];
  let scanned = 0;
  let read = 0;
  for (let index = 0; index < view.pageCount; index++) {
    checkCancelled(ctx.signal);
    ctx.progress({ done: index, total: view.pageCount, label: `Reading page ${index + 1} of ${view.pageCount}${which}` });
    const layout = await view.layout(index);
    const letters = layout.items.reduce((n, i) => n + i.str.replace(/\s+/g, '').length, 0);
    if (letters >= HAS_TEXT || !scans || !ctx.ocr) {
      if (letters < HAS_TEXT) scanned++;
      pages.push({ width: layout.width, height: layout.height, items: layout.items });
      continue;
    }
    // A scan: read the picture of the page, then treat its words like any other.
    ctx.progress({ done: index, total: view.pageCount, label: `Reading the words in page ${index + 1}${which} (a scan, so this is slower)` });
    const reader = await ctx.ocr();
    const width = Math.round((layout.width / 72) * OCR_DPI);
    const png = await view.encode(index, { width, format: 'png', signal: ctx.signal });
    const pw = pngWidth(png) ?? width;
    const ph = pngHeight(png) ?? Math.round((width * layout.height) / layout.width);
    const words = await reader.read(png, pw, ph);
    read++;
    const items: TextItem[] = words.map((w) => ({
      str: w.text,
      x: w.x * layout.width,
      // The box's bottom sits on the descenders; the baseline is a little above it.
      y: (w.y + w.h * 0.82) * layout.height,
      width: w.w * layout.width,
      height: w.h * layout.height * 1.1,
      fontName: 'scan',
    }));
    // The reader gives words; a space between neighbours keeps them words.
    pages.push({ width: layout.width, height: layout.height, items: items.map((i, k) => (k < items.length - 1 ? { ...i, str: `${i.str} ` } : i)) });
  }
  return { pages, scanned, read };
}

/** The shape of every converter: open each PDF, read it, write one file. */
function converter<P>(
  tool: 'pdf-to-word' | 'pdf-to-excel' | 'pdf-to-epub' | 'pdf-to-powerpoint',
  title: (p: P) => string,
  scans: (p: P) => boolean,
  write: (read: Read, input: FoolscapFile, params: P, view: PdfView, ctx: OpContext, which: string) => Promise<{ name: string; bytes: Uint8Array; detail: string } | Outcome>,
): Op<P> {
  return {
    tool,
    arity: { kind: 'each' },
    engine: true,
    title,
    async run(inputs, params, ctx) {
      const outcomes: Outcome[] = [];
      for (const [n, input] of inputs.entries()) {
        checkCancelled(ctx.signal);
        const which = inputs.length > 1 ? ` of the ${ordinal(n + 1)} file` : '';
        try {
          const view = await openView(ctx, input);
          try {
            const read = tool === 'pdf-to-powerpoint' ? { pages: [], scanned: 0, read: 0 } : await readPages(ctx, view, which, scans(params));
            ctx.progress({ done: 0, total: 0, label: 'Writing the file…' });
            const made = await write(read, input, params, view, ctx, which);
            if ('kind' in made) outcomes.push(made);
            else outcomes.push(await store(ctx, tool, [input], made.name, made.bytes, made.detail, 'other'));
          } finally {
            await view.close();
          }
        } catch (error) {
          outcomes.push(failed(error, [input]));
        }
      }
      return outcomes;
    },
  };
}

const NO_WORDS = (input: FoolscapFile, scans: boolean): Outcome =>
  refused(
    [input],
    scans
      ? 'No words could be read in this file, even in its pictures. If it is a photo, try Scan first for a straighter, sharper page.'
      : 'This file has no words in it, only pictures of them. Tick "Read scanned pages too" and run it again.',
  );

const hasWords = (read: Read): boolean => read.pages.some((p) => p.items.some((i) => i.str.trim() !== ''));

function scanNote(read: Read, scans: boolean): string {
  if (read.read > 0) return `; ${plural(read.read, 'scanned page')} read from the picture`;
  if (read.scanned > 0 && !scans) return `; ${plural(read.scanned, 'page')} looked scanned and came through empty`;
  return '';
}

export const pdfToWordOp = converter<PdfToWordParams>(
  'pdf-to-word',
  () => 'PDF to Word',
  (p) => p.scans,
  async (read, input, params) => {
    if (!hasWords(read)) return NO_WORDS(input, params.scans);
    const flow = toFlow(read.pages, { title: baseName(input.name) });
    const headings = flow.blocks.filter((b) => b.kind === 'paragraph' && b.heading !== undefined).length;
    const tables = flow.blocks.filter((b) => b.kind === 'table').length;
    const parts = [plural(read.pages.length, 'page'), headings > 0 ? plural(headings, 'heading') : '', tables > 0 ? plural(tables, 'table') : ''].filter(Boolean);
    return {
      name: `${baseName(input.name)}.docx`,
      bytes: toDocx(flow),
      detail: `Word document: ${parts.join(', ')}${scanNote(read, params.scans)}. Pictures stay in the PDF for now`,
    };
  },
);

export const pdfToExcelOp = converter<PdfToWordParams>(
  'pdf-to-excel',
  () => 'PDF to Excel',
  (p) => p.scans,
  async (read, input, params) => {
    if (!hasWords(read)) return NO_WORDS(input, params.scans);
    const book = toWorkbook(read.pages);
    const rows = book.sheets.reduce((n, s) => n + s.rows.length, 0);
    return {
      name: `${baseName(input.name)}.xlsx`,
      bytes: toXlsx(book, { title: baseName(input.name) }),
      detail: `Spreadsheet: ${plural(book.sheets.length, 'sheet')}, ${plural(rows, 'row')}; amounts are numbers you can add up${scanNote(read, params.scans)}`,
    };
  },
);

export const pdfToEpubOp = converter<PdfToEpubParams>(
  'pdf-to-epub',
  (p) => (p.format === 'html' ? 'PDF to web page' : 'PDF to EPUB'),
  (p) => p.scans,
  async (read, input, params) => {
    if (!hasWords(read)) return NO_WORDS(input, params.scans);
    const flow = toFlow(read.pages, { title: baseName(input.name) });
    if (params.format === 'html') {
      return {
        name: `${baseName(input.name)}.html`,
        bytes: new TextEncoder().encode(toHtml(flow)),
        detail: `One web page that opens in any browser, ${plural(read.pages.length, 'page')} of text${scanNote(read, params.scans)}`,
      };
    }
    return {
      name: `${baseName(input.name)}.epub`,
      bytes: toEpub(flow),
      detail: `An e-book whose text reflows on any reader, ${plural(read.pages.length, 'page')} of text${scanNote(read, params.scans)}`,
    };
  },
);

/** About 150 dpi across a slide: sharp on a projector, a few hundred KB a slide. */
const SLIDE_PIXELS = 1600;

export const pdfToPowerPointOp = converter<Record<string, never>>(
  'pdf-to-powerpoint',
  () => 'PDF to PowerPoint',
  () => false,
  async (_read, input, _params, view, ctx, which) => {
    const first = await view.page(0);
    const turned = (p: { rotation: number }) => p.rotation === 90 || p.rotation === 270;
    const slideW = turned(first) ? first.height : first.width;
    const slideH = turned(first) ? first.width : first.height;
    const slides: Array<Deck['slides'][number]> = [];
    for (let index = 0; index < view.pageCount; index++) {
      checkCancelled(ctx.signal);
      ctx.progress({ done: index, total: view.pageCount, label: `Making slide ${index + 1} of ${view.pageCount}${which}` });
      const page = index === 0 ? first : await view.page(index);
      const w = turned(page) ? page.height : page.width;
      const h = turned(page) ? page.width : page.height;
      const bytes = await view.encode(index, { width: SLIDE_PIXELS, format: 'jpeg', quality: 0.88, signal: ctx.signal });
      const text = (await view.text(index)).trim();
      slides.push({ picture: { kind: 'image', bytes, format: 'jpeg', width: w, height: h }, ...(text ? { text } : {}) });
    }
    return {
      name: `${baseName(input.name)}.pptx`,
      bytes: toPptx({ width: slideW, height: slideH, slides }, { title: baseName(input.name) }),
      detail: `${plural(slides.length, 'slide')}, each page as it looks; its words are in the speaker notes`,
    };
  },
);

// ---- And back: Word and Excel to PDF ----

/** The browser draws a line the PDF fonts cannot (Malayalam, Hindi, emoji), in the worker. */
const paintLine: LinePainter = async (text, style, scale) => {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const px = style.size * scale;
  const family = style.family === 'serif' ? 'serif' : style.family === 'mono' ? 'monospace' : 'sans-serif';
  const font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${px}px ${family}`;
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  if (!probe) return null;
  probe.font = font;
  const width = Math.max(1, Math.ceil(probe.measureText(text).width) + 2);
  const height = Math.ceil(px * 1.35);
  const canvas = new OffscreenCanvas(width, height);
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.font = font;
  const [r, g, b] = style.color;
  c.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  c.textBaseline = 'middle';
  c.fillText(text, 1, height / 2);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
};

/** Each sheet as a table, on a page turned sideways when it is wide. */
export function workbookToFlow(book: Workbook, title: string): FlowDocument {
  const blocks: Block[] = [];
  const sheets = book.sheets.filter((s) => s.rows.some((r) => r.some((c) => c.trim() !== '')));
  let widest = 0;
  sheets.forEach((sheet, i) => {
    if (i > 0) blocks.push({ kind: 'page-break' });
    let rows = sheet.rows.map((r) => [...r]);
    while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();
    const count = Math.max(...rows.map((r) => r.length));
    // Columns that are empty all the way down are left out.
    const used = Array.from({ length: count }, (_, c) => rows.some((r) => (r[c] ?? '').trim() !== ''));
    rows = rows.map((r) => r.filter((_, c) => used[c]));
    const n = Math.max(1, ...rows.map((r) => r.length));
    const columns = Array.from({ length: n }, (_, c) => Math.min(230, Math.max(36, 14 + 5.8 * Math.max(...rows.map((r) => Math.min(40, (r[c] ?? '').length))))));
    widest = Math.max(widest, columns.reduce((a, b) => a + b, 0));
    if (sheets.length > 1) blocks.push({ kind: 'paragraph', heading: 2, runs: [{ text: sheet.name, size: 14, bold: true }] });
    blocks.push({
      kind: 'table',
      columns,
      rows: rows.map((r, ri) =>
        Array.from({ length: n }, (_, c) => {
          const text = r[c] ?? '';
          const numeric = /^[-+]?[\d,]*\.?\d+%?$/.test(text.trim());
          return { paragraphs: [{ kind: 'paragraph', runs: [{ text, size: 9, ...(ri === 0 ? { bold: true } : {}) }], ...(numeric ? { align: 'right' as const } : {}) }] };
        }),
      ),
    });
  });
  // Wider than an upright A4 can hold: turn the paper.
  const page = widest > 483 ? { width: 841.89, height: 595.28, margin: 40 } : { width: 595.28, height: 841.89, margin: 48 };
  return { title, page, blocks };
}

function officeKind(bytes: Uint8Array): 'docx' | 'xlsx' | null {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  try {
    const names = Object.keys(unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' || f.name === 'xl/workbook.xml' }));
    if (names.includes('word/document.xml')) return 'docx';
    if (names.includes('xl/workbook.xml')) return 'xlsx';
  } catch {
    return null;
  }
  return null;
}

export const officeToPdfOp: Op<Record<string, never>> = {
  tool: 'office-to-pdf',
  arity: { kind: 'each' },
  title: () => 'Word or Excel to PDF',
  async run(inputs, _params, ctx) {
    const outcomes: Outcome[] = [];
    for (const [n, input] of inputs.entries()) {
      checkCancelled(ctx.signal);
      ctx.progress({ done: n, total: inputs.length, label: inputs.length > 1 ? `Laying out the ${ordinal(n + 1)} file` : 'Laying out the pages…' });
      try {
        const bytes = await readInput(ctx, input);
        const kind = officeKind(bytes);
        if (kind === null) {
          outcomes.push(refused([input], "This isn't a Word (.docx) or Excel (.xlsx) file. Older .doc and .xls files need saving as the newer kind first."));
          continue;
        }
        const name = stem(input.name);
        const flow = kind === 'docx' ? fromDocx(bytes) : workbookToFlow(fromXlsx(bytes), name);
        if (flow.blocks.length === 0) {
          outcomes.push(refused([input], 'This file is empty, so there is nothing to put on a page.'));
          continue;
        }
        const { bytes: pdf, pages } = await ctx.surgeon.layoutFlow(flow, paintLine);
        const detail =
          kind === 'docx'
            ? `${plural(pages, 'page')} from the Word file; headings, lists, tables and pictures laid out, words still selectable`
            : `${plural(pages, 'page')} from the spreadsheet, each sheet as a table`;
        outcomes.push(await store(ctx, 'office-to-pdf', [input], `${name}.pdf`, pdf, detail));
      } catch (error) {
        outcomes.push(failed(error, [input]));
      }
    }
    return outcomes;
  },
};
