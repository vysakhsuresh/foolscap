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
import type { PageImage, PageText, TextItem } from '../convert/text-layout';
import { slideBoxes, toFlow, toWorkbook } from '../convert/text-layout';
import type { SlideText } from '../convert/model';
import { fromXlsx, toXlsx } from '../convert/xlsx';
import { unzipSync } from 'fflate';
import type { FoolscapFile } from '../files/types';
import type { LinePainter, PdfView } from '../pdf';
import { baseName, failed, ordinal, passwordFor, plural, readInput, refused, stem, store } from './common';
import { checkCancelled, type Op, type OpContext, type Outcome, type PdfToEpubParams, type PdfToPowerPointParams, type PdfToWordParams } from './op';
import { canDecode } from './images';
import { openView, pngHeight, pngWidth } from './render-ops';

/** Fewer letters than this on a page and it is treated as a scan. */
const HAS_TEXT = 12;
const OCR_DPI = 300;
/** Pictures are cut from the page drawn at this many dots per inch: sharp on screen and on paper, light in the file. */
const PICTURE_DPI = 150;
/** No picture wider than this, however big it is drawn. */
const PICTURE_PIXELS = 2000;

interface Read {
  readonly pages: PageText[];
  readonly scanned: number;
  readonly read: number;
  /** Pictures carried over from the pages. */
  readonly pictures: number;
}

/**
 * The pictures on a page as the reader sees them (photos, logos, a drawn
 * signature), each cut from a drawing of the page at 150 dpi, as JPEG, with
 * where it sits. A picture that fills most of a page whose words were read
 * from it is the scan itself, and is left out: its words are already there.
 */
async function picturesOn(ctx: OpContext, view: PdfView, index: number, width: number, height: number, scanRead: boolean): Promise<PageImage[]> {
  if (!canDecode()) return [];
  const areas = (await view.images(index)).filter((a) => !(scanRead && a.w * a.h > 0.5));
  if (areas.length === 0) return [];
  const pixels = Math.max(1, Math.round((width / 72) * PICTURE_DPI));
  const png = await view.encode(index, { width: pixels, format: 'png', signal: ctx.signal });
  const bitmap = await createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  try {
    const out: PageImage[] = [];
    for (const area of areas) {
      checkCancelled(ctx.signal);
      const sx = Math.max(0, Math.floor(area.x * bitmap.width));
      const sy = Math.max(0, Math.floor(area.y * bitmap.height));
      const sw = Math.min(bitmap.width - sx, Math.ceil(area.w * bitmap.width));
      const sh = Math.min(bitmap.height - sy, Math.ceil(area.h * bitmap.height));
      if (sw < 2 || sh < 2) continue;
      const scale = Math.min(1, PICTURE_PIXELS / Math.max(sw, sh));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
      const c = canvas.getContext('2d');
      if (!c) continue;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
      out.push({ bytes: new Uint8Array(await blob.arrayBuffer()), format: 'jpeg', x: area.x * width, y: area.y * height, width: area.w * width, height: area.h * height });
    }
    return out;
  } finally {
    bitmap.close();
  }
}

/** Every page's words and where they sit; with `scans`, the words in pictures of pages too; with `pictures`, the pictures. */
async function readPages(ctx: OpContext, view: PdfView, which: string, scans: boolean, pictures: boolean): Promise<Read> {
  const pages: PageText[] = [];
  let scanned = 0;
  let read = 0;
  let found = 0;
  const withPictures = async (index: number, page: PageText, scanRead: boolean): Promise<PageText> => {
    if (!pictures) return page;
    try {
      const images = await picturesOn(ctx, view, index, page.width, page.height, scanRead);
      found += images.length;
      return images.length > 0 ? { ...page, images } : page;
    } catch {
      // A page whose pictures cannot be drawn still gives its words.
      checkCancelled(ctx.signal);
      return page;
    }
  };
  for (let index = 0; index < view.pageCount; index++) {
    checkCancelled(ctx.signal);
    ctx.progress({ done: index, total: view.pageCount, label: `Reading page ${index + 1} of ${view.pageCount}${which}` });
    const layout = await view.layout(index);
    const letters = layout.items.reduce((n, i) => n + i.str.replace(/\s+/g, '').length, 0);
    if (letters >= HAS_TEXT || !scans || !ctx.ocr) {
      if (letters < HAS_TEXT) scanned++;
      pages.push(await withPictures(index, { width: layout.width, height: layout.height, items: layout.items }, false));
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
    pages.push(await withPictures(index, { width: layout.width, height: layout.height, items: items.map((i, k) => (k < items.length - 1 ? { ...i, str: `${i.str} ` } : i)) }, true));
  }
  return { pages, scanned, read, pictures: found };
}

/** The shape of every converter: open each PDF, read it, write one file. */
function converter<P>(
  tool: 'pdf-to-word' | 'pdf-to-excel' | 'pdf-to-epub' | 'pdf-to-powerpoint',
  title: (p: P) => string,
  scans: (p: P) => boolean,
  pictures: boolean,
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
            const read = tool === 'pdf-to-powerpoint' ? { pages: [], scanned: 0, read: 0, pictures: 0 } : await readPages(ctx, view, which, scans(params), pictures);
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
const hasContent = (read: Read): boolean => hasWords(read) || read.pictures > 0;

function scanNote(read: Read, scans: boolean): string {
  if (read.read > 0) return `; ${plural(read.read, 'scanned page')} read from the picture`;
  if (read.scanned > 0 && !scans) {
    const how = read.pictures > 0 ? 'came through as pictures' : 'came through empty';
    return `; ${plural(read.scanned, 'page')} looked scanned and ${how} (tick "Read scanned pages too" for their words)`;
  }
  return '';
}

export const pdfToWordOp = converter<PdfToWordParams>(
  'pdf-to-word',
  () => 'PDF to Word',
  (p) => p.scans,
  true,
  async (read, input, params) => {
    if (!hasContent(read)) return NO_WORDS(input, params.scans);
    const flow = toFlow(read.pages, { title: baseName(input.name) });
    const headings = flow.blocks.filter((b) => b.kind === 'paragraph' && b.heading !== undefined).length;
    const tables = flow.blocks.filter((b) => b.kind === 'table').length;
    const pictures = flow.blocks.filter((b) => b.kind === 'image').length;
    const parts = [
      plural(read.pages.length, 'page'),
      headings > 0 ? plural(headings, 'heading') : '',
      tables > 0 ? plural(tables, 'table') : '',
      pictures > 0 ? plural(pictures, 'picture') : '',
    ].filter(Boolean);
    return {
      name: `${baseName(input.name)}.docx`,
      bytes: toDocx(flow),
      detail: `Word document: ${parts.join(', ')}${scanNote(read, params.scans)}`,
    };
  },
);

export const pdfToExcelOp = converter<PdfToWordParams>(
  'pdf-to-excel',
  () => 'PDF to Excel',
  (p) => p.scans,
  false,
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
  true,
  async (read, input, params) => {
    if (!hasContent(read)) return NO_WORDS(input, params.scans);
    const flow = toFlow(read.pages, { title: baseName(input.name) });
    const pictures = flow.blocks.filter((b) => b.kind === 'image').length;
    const withPictures = pictures > 0 ? ` and ${plural(pictures, 'picture')}` : '';
    if (params.format === 'html') {
      return {
        name: `${baseName(input.name)}.html`,
        bytes: new TextEncoder().encode(toHtml(flow)),
        detail: `One web page that opens in any browser, ${plural(read.pages.length, 'page')} of text${withPictures}${scanNote(read, params.scans)}`,
      };
    }
    return {
      name: `${baseName(input.name)}.epub`,
      bytes: toEpub(flow),
      detail: `An e-book whose text reflows on any reader, ${plural(read.pages.length, 'page')} of text${withPictures}${scanNote(read, params.scans)}`,
    };
  },
);

/** About 150 dpi across a slide: sharp on a projector, a few hundred KB a slide. */
const SLIDE_PIXELS = 1600;

/** A page drawn as pixels: what the slide's colours are read from. Straight from the drawing, with no PNG in between. */
async function pixelsOf(view: PdfView, index: number, width: number, signal: AbortSignal): Promise<ImageData> {
  const bitmap = await view.render(index, { width, signal });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const c = canvas.getContext('2d');
    if (!c) throw new Error('No 2D context');
    c.drawImage(bitmap, 0, 0);
    return c.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * The colour a box of text is drawn in, read from where the page with its
 * words and the page without them differ: those pixels are the letters.
 * Null when they hardly differ at all: text nobody can see (the hidden layer
 * of a searchable scan, or words under a picture), which gets no box.
 */
function inkOf(box: SlideText, page: { width: number; height: number }, withText: ImageData, without: ImageData): string | null {
  const sx = withText.width / page.width;
  const sy = withText.height / page.height;
  const x0 = Math.max(0, Math.floor(box.x * sx));
  const y0 = Math.max(0, Math.floor(box.y * sy));
  const x1 = Math.min(withText.width, Math.ceil((box.x + box.width) * sx));
  const y1 = Math.min(withText.height, Math.ceil((box.y + box.height) * sy));
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  // A big paragraph is sampled every other pixel: plenty to read a colour from, a quarter of the work.
  const step = area > 120_000 ? 2 : 1;
  const a = withText.data;
  const b = without.data;
  const stride = withText.width * 4;
  // How strongly each pixel differs, counted by strength, so the strongest can be picked without sorting.
  const counts = new Uint32Array(766);
  let hits = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0, at = y * stride + x0 * 4; x < x1; x += step, at += 4 * step) {
      const d = Math.abs((a[at] ?? 0) - (b[at] ?? 0)) + Math.abs((a[at + 1] ?? 0) - (b[at + 1] ?? 0)) + Math.abs((a[at + 2] ?? 0) - (b[at + 2] ?? 0));
      if (d > 60) {
        counts[d] = (counts[d] ?? 0) + 1;
        hits++;
      }
    }
  }
  if (hits < Math.max(4, (area / (step * step)) * 0.002)) return null;
  // The strongest quarter are the middles of the strokes, clear of the soft edges.
  let need = Math.ceil(hits / 4);
  let cut = 765;
  while (cut > 61 && need > 0) need -= counts[cut--] ?? 0;
  let r = 0;
  let g = 0;
  let bl = 0;
  let n = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0, at = y * stride + x0 * 4; x < x1; x += step, at += 4 * step) {
      const d = Math.abs((a[at] ?? 0) - (b[at] ?? 0)) + Math.abs((a[at + 1] ?? 0) - (b[at + 1] ?? 0)) + Math.abs((a[at + 2] ?? 0) - (b[at + 2] ?? 0));
      if (d > cut) {
        r += a[at] ?? 0;
        g += a[at + 1] ?? 0;
        bl += a[at + 2] ?? 0;
        n++;
      }
    }
  }
  if (n === 0) return null;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
}

/** Back to bytes: the background a slide's text boxes sit on. */
async function jpegOf(pixels: ImageData): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(pixels.width, pixels.height);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No 2D context');
  c.putImageData(pixels, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  return new Uint8Array(await blob.arrayBuffer());
}

export const pdfToPowerPointOp = converter<PdfToPowerPointParams>(
  'pdf-to-powerpoint',
  () => 'PDF to PowerPoint',
  () => false,
  false,
  async (_read, input, params, view, ctx, which) => {
    const first = await view.page(0);
    const turned = (p: { rotation: number }) => p.rotation === 90 || p.rotation === 270;
    const slideW = turned(first) ? first.height : first.width;
    const slideH = turned(first) ? first.width : first.height;
    // The same document with its words taken off, drawn for the backgrounds of editable slides.
    let bare: PdfView | null = null;
    if (params.editable !== false && canDecode()) {
      try {
        const doc = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
        try {
          doc.removeText();
          bare = await (await ctx.engine()).open(new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>]), { signal: ctx.signal });
        } finally {
          doc.close();
        }
      } catch {
        // Then every slide is the page as it looks, which is never wrong.
        checkCancelled(ctx.signal);
        bare = null;
      }
    }
    const slides: Array<Deck['slides'][number]> = [];
    let editable = 0;
    let boxes = 0;
    try {
      for (let index = 0; index < view.pageCount; index++) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: index, total: view.pageCount, label: `Making slide ${index + 1} of ${view.pageCount}${which}` });
        const page = index === 0 ? first : await view.page(index);
        const w = turned(page) ? page.height : page.width;
        const h = turned(page) ? page.width : page.height;
        const text = (await view.text(index)).trim();
        const notes = text ? { text } : {};
        let made: Deck['slides'][number] | null = null;
        if (bare !== null) {
          const layout = await view.layout(index);
          const laidOut = layout.items.reduce((n, i) => n + i.str.replace(/\s+/g, '').length, 0);
          // Words set at an angle are left out of the layout; such a page stays a picture, so none go missing.
          const complete = text.replace(/\s+/g, '').length <= laidOut * 1.05 + 3;
          const found = complete ? slideBoxes(layout) : [];
          if (found.length > 0) {
            const withText = await pixelsOf(view, index, SLIDE_PIXELS, ctx.signal);
            const without = await pixelsOf(bare, index, withText.width, ctx.signal);
            if (without.width === withText.width && without.height === withText.height) {
              const texts: SlideText[] = [];
              for (const box of found) {
                const color = inkOf(box, layout, withText, without);
                if (color !== null) texts.push({ ...box, color });
              }
              if (texts.length > 0) {
                made = { picture: { kind: 'image', bytes: await jpegOf(without), format: 'jpeg', width: w, height: h }, texts, ...notes };
                editable++;
                boxes += texts.length;
              }
            }
          }
        }
        if (made === null) {
          const bytes = await view.encode(index, { width: SLIDE_PIXELS, format: 'jpeg', quality: 0.88, signal: ctx.signal });
          made = { picture: { kind: 'image', bytes, format: 'jpeg', width: w, height: h }, ...notes };
        }
        slides.push(made);
      }
    } finally {
      await bare?.close();
    }
    const how =
      params.editable === false
        ? 'each page as it looks; its words are in the speaker notes'
        : editable === slides.length
          ? `with ${plural(boxes, 'text box', 'text boxes')} to edit over each page's pictures and shapes`
          : editable > 0
            ? `${editable} with text to edit; the other ${plural(slides.length - editable, 'slide')} ${slides.length - editable === 1 ? 'has' : 'have'} no words to lift and ${slides.length - editable === 1 ? 'is' : 'are'} the page as it looks`
            : 'each page as it looks, as there were no words to lift off it; any words are in the speaker notes';
    return {
      name: `${baseName(input.name)}.pptx`,
      bytes: toPptx({ width: slideW, height: slideH, slides }, { title: baseName(input.name) }),
      detail: `${plural(slides.length, 'slide')}, ${how}`,
    };
  },
);

// ---- And back: Word and Excel to PDF ----

/** The browser draws a line the PDF fonts cannot (Malayalam, Hindi, emoji), in the worker. */
export const paintLine: LinePainter = async (text, style, scale) => {
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
  const tables: Array<{ name: string; rows: string[][]; n: number; natural: number[] }> = [];
  sheets.forEach((sheet) => {
    let rows = sheet.rows.map((r) => [...r]);
    while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();
    const count = Math.max(...rows.map((r) => r.length));
    // Columns that are empty all the way down are left out.
    const used = Array.from({ length: count }, (_, c) => rows.some((r) => (r[c] ?? '').trim() !== ''));
    rows = rows.map((r) => r.filter((_, c) => used[c]));
    const n = Math.max(1, ...rows.map((r) => r.length));
    const natural = Array.from({ length: n }, (_, c) => Math.min(230, Math.max(36, 14 + 5.8 * Math.max(...rows.map((r) => Math.min(40, (r[c] ?? '').length))))));
    tables.push({ name: sheet.name, rows, n, natural });
    widest = Math.max(widest, natural.reduce((a, b) => a + b, 0));
  });
  // Wider than an upright A4 can hold: turn the paper. Wider than a sideways one too: a smaller type, so every column still fits.
  const page = widest > 483 ? { width: 841.89, height: 595.28, margin: 40 } : { width: 595.28, height: 841.89, margin: 48 };
  const room = page.width - 2 * page.margin;
  tables.forEach(({ name, rows, n, natural }, i) => {
    const total = natural.reduce((a, b) => a + b, 0);
    const shrink = Math.min(1, room / total);
    const size = Math.max(5, Math.round(9 * shrink * 10) / 10);
    const columns = natural.map((w) => w * (size / 9));
    if (i > 0) blocks.push({ kind: 'page-break' });
    if (sheets.length > 1) blocks.push({ kind: 'paragraph', heading: 2, runs: [{ text: name, size: 14, bold: true }] });
    blocks.push({
      kind: 'table',
      columns,
      headerRows: rows.length > 1 ? 1 : 0,
      rows: rows.map((r, ri) =>
        Array.from({ length: n }, (_, c) => {
          const text = r[c] ?? '';
          const numeric = /^[-+]?[\d,]*\.?\d+%?$/.test(text.trim());
          return { paragraphs: [{ kind: 'paragraph', runs: [{ text, size, ...(ri === 0 ? { bold: true } : {}) }], ...(numeric ? { align: 'right' as const } : {}) }] };
        }),
      ),
    });
  });
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
