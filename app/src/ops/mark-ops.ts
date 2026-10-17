/** The Mark up family's stamping tools: watermark, page numbers, header and footer. */
import type { FoolscapFile } from '../files/types';
import type { Anchor, PdfDoc, TextStamp } from '../pdf';
import { baseName, forEachPdf, lockNote, plural, refused, saveKeepingLock, store } from './common';
import { paintLine } from './office-ops';
import { PageSelection } from '../pdf/page-selection';
import { checkCancelled, type HeaderFooterParams, type Op, type OpContext, type Outcome, type PageNumbersParams, type WatermarkParams } from './op';

const GREY: readonly [number, number, number] = [0.42, 0.42, 0.46];
const INK: readonly [number, number, number] = [0.2, 0.2, 0.24];
const OPACITY: Record<WatermarkParams['strength'], number> = { light: 0.12, medium: 0.22, strong: 0.38 };

/**
 * The letter height, in pixels, a picture of words is drawn at for words
 * `size` points tall: about four pixels a point (sharp in print), in steps,
 * so pages of nearly the same size share one picture, and never a huge one.
 */
const picturePixels = (size: number): number => Math.min(512, Math.max(32, 2 ** Math.ceil(Math.log2(Math.max(1, size) * 4))));

/**
 * Stamps words on a page: as real text when the built-in font can draw them,
 * and otherwise (Malayalam, Hindi, Arabic, emoji) as a picture of the words
 * the browser shapes, placed the same way. `cache` keeps one picture per
 * wording for a whole run, so a watermark on 300 pages goes in once.
 */
export async function stampWords(doc: PdfDoc, index: number, stamp: TextStamp, cache: Map<string, Promise<{ png: Uint8Array; width: number; height: number } | null>>): Promise<void> {
  const text = stamp.text.replace(/[\r\n\t]+/g, ' ').trim();
  if (text.length === 0 || doc.canDraw(text)) {
    doc.stampText(index, stamp);
    return;
  }
  const px = picturePixels(stamp.size);
  const color = stamp.color ?? [0, 0, 0];
  const key = [text, px, stamp.bold === true, ...color].join('|');
  let made = cache.get(key);
  if (made === undefined) {
    // Drawn at 1 point = 1 pixel times `px`: the picture is `px` pixels to the point size.
    made = paintLine(text, { size: px, bold: stamp.bold === true, italic: false, family: 'sans', color }, 1).catch(() => null);
    cache.set(key, made);
  }
  const picture = await made;
  // No way to draw it here at all: stampText says so in words.
  if (picture === null) {
    doc.stampText(index, stamp);
    return;
  }
  const scale = px / stamp.size;
  await doc.stampPicture(index, {
    anchor: stamp.anchor,
    ...(stamp.opacity === undefined ? {} : { opacity: stamp.opacity }),
    ...(stamp.margin === undefined ? {} : { margin: stamp.margin }),
    ...(stamp.angle === undefined ? {} : { angle: stamp.angle }),
    ...(stamp.tiled === undefined ? {} : { tiled: stamp.tiled }),
    png: picture.png,
    width: picture.width / scale,
    height: picture.height / scale,
  });
}

const COLOURS: Record<NonNullable<WatermarkParams['color']>, readonly [number, number, number]> = {
  grey: GREY,
  red: [0.8, 0.12, 0.12],
  blue: [0.1, 0.27, 0.72],
};

export const watermarkOp: Op<WatermarkParams> = {
  tool: 'watermark',
  arity: { kind: 'each' },
  title: (p) => `Watermark "${p.text}"`,
  async run(inputs, params, ctx) {
    const text = params.text.replace(/[\r\n\t]+/g, ' ').trim();
    if (text.length === 0) return inputs.map((input) => refused([input], 'Type the watermark text, such as DRAFT or COPY.'));
    const color = COLOURS[params.color ?? 'grey'] ?? GREY;
    const opacity = OPACITY[params.strength] ?? OPACITY.medium;
    const pictures = new Map<string, Promise<{ png: Uint8Array; width: number; height: number } | null>>();
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const n = doc.pageCount;
      const pages = (params.pages ?? '').trim() === '' ? PageSelection.all(n) : PageSelection.parse(params.pages ?? '', n);
      if (pages.length === 0) return refused([input], `This file has ${plural(n, 'page')}; none of the pages typed are in it.`);
      for (const i of pages) {
        checkCancelled(ctx.signal);
        const box = doc.visibleBox(i);
        const short = Math.min(box.width, box.height);
        if (params.layout === 'tiled') {
          await stampWords(doc, i, { text, anchor: 'center', size: Math.max(14, short * 0.045), bold: true, opacity, color, angle: 30, tiled: true }, pictures);
        } else {
          // Sized to the page and to the word, so DRAFT and CONFIDENTIAL both cross the page; anything longer is shrunk to fit inside it.
          const straight = params.layout === 'straight';
          const across = straight ? box.width : Math.hypot(box.width, box.height);
          const size = Math.min(short * 0.2, (across * 0.7) / Math.max(4, text.length * 0.6));
          await stampWords(doc, i, { text, anchor: 'center', size, bold: true, opacity, color, angle: straight ? 0 : 45 }, pictures);
        }
      }
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const which = pages.length === n ? plural(n, 'page') : `${pages.length === 1 ? 'page' : 'pages'} ${PageSelection.describe(pages)}`;
      const detail = `"${text}" ${params.layout === 'tiled' ? 'repeated across' : 'across'} ${which}${lockNote(relocked)}`;
      return store(ctx, 'watermark', [input], `${baseName(input.name)} watermarked.pdf`, bytes, detail);
    });
  },
};

function numberText(format: PageNumbersParams['format'], n: number, total: number): string {
  switch (format) {
    case 'n':
      return String(n);
    case 'n-of-total':
      return `${n} of ${total}`;
    case 'page-n':
      return `Page ${n}`;
    case 'page-n-of-total':
      return `Page ${n} of ${total}`;
    case 'bates':
      return String(n);
  }
}

/**
 * How much bigger than on A4 a page's numbers and headers are set: 1 on A4
 * and smaller paper, more on a page that says it is bigger. A phone photo
 * made into a PDF at 72 dpi has a page 42 inches wide, and a 10-point number
 * on it is a speck nobody sees once the page is fitted to a screen.
 */
function paperScale(doc: PdfDoc, index: number): number {
  const { width, height } = doc.visibleBox(index);
  return Math.max(1, Math.min(width, height) / 595);
}

export const pageNumbersOp: Op<PageNumbersParams> = {
  tool: 'page-numbers',
  arity: { kind: 'each' },
  whole: true,
  title: () => 'Page numbers',
  async run(inputs, params, ctx) {
    const start = Math.floor(params.start);
    if (!(start >= 0 && start <= 100000)) return inputs.map((input) => refused([input], 'The first number must be between 0 and 100,000.'));
    if (params.format === 'bates') return batesNumbers(inputs, params, start, ctx);
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const skip = params.skipFirst && doc.pageCount > 1 ? 1 : 0;
      const numbered = doc.pageCount - skip;
      const last = start + numbered - 1;
      for (let i = skip; i < doc.pageCount; i++) {
        checkCancelled(ctx.signal);
        const k = paperScale(doc, i);
        doc.stampText(i, { text: numberText(params.format, start + i - skip, last), anchor: params.position as Anchor, size: 10 * k, color: INK, margin: 28 * k });
      }
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const numbers = start === last ? `numbered ${start}` : `numbered ${start} to ${last}`;
      const detail = (skip ? `${doc.pageCount === 2 ? 'Page 2' : `Pages 2 to ${doc.pageCount}`} ${numbers}; cover left blank` : `${numbers.charAt(0).toUpperCase()}${numbers.slice(1)}`) + lockNote(relocked);
      return store(ctx, 'page-numbers', [input], `${baseName(input.name)} numbered.pdf`, bytes, detail);
    });
  },
};

/**
 * Bates numbering, as courts and law offices use it: every page of every file
 * in the set gets the next number in one sequence ("ACME-000001" onwards),
 * so a page can be cited by its number alone. Files are numbered in the order
 * they were added.
 */
async function batesNumbers(inputs: readonly FoolscapFile[], params: PageNumbersParams, start: number, ctx: OpContext): Promise<Outcome[]> {
  const prefix = (params.prefix ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 40);
  const digits = Math.min(12, Math.max(1, Math.floor(params.digits ?? 6)));
  let next = start;
  const pictures = new Map<string, Promise<{ png: Uint8Array; width: number; height: number } | null>>();
  return forEachPdf(inputs, ctx, async (doc, input) => {
    const first = next;
    for (let i = 0; i < doc.pageCount; i++) {
      checkCancelled(ctx.signal);
      const k = paperScale(doc, i);
      await stampWords(doc, i, { text: `${prefix}${String(next).padStart(digits, '0')}`, anchor: params.position as Anchor, size: 9 * k, color: INK, margin: 22 * k }, pictures);
      next++;
    }
    const from = `${prefix}${String(first).padStart(digits, '0')}`;
    const to = `${prefix}${String(next - 1).padStart(digits, '0')}`;
    const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
    return store(ctx, 'page-numbers', [input], `${baseName(input.name)} (Bates ${from}).pdf`, bytes, `Bates numbered ${from} to ${to}${lockNote(relocked)}`);
  });
}

/** Today as "12 Oct 2026": unambiguous wherever the reader is. */
function today(): string {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function fillTokens(template: string, values: { page: number; total: number; date: string; name: string }): string {
  return template
    .replace(/\{page\}/gi, String(values.page))
    .replace(/\{total\}/gi, String(values.total))
    .replace(/\{date\}/gi, values.date)
    .replace(/\{name\}/gi, values.name);
}

export const headerFooterOp: Op<HeaderFooterParams> = {
  tool: 'header-footer',
  arity: { kind: 'each' },
  title: () => 'Header and footer',
  async run(inputs, params, ctx) {
    const header = params.header.trim();
    const footer = params.footer.trim();
    if (header.length === 0 && footer.length === 0) {
      return inputs.map((input) => refused([input], 'Type a header, a footer, or both.'));
    }
    const date = today();
    const footerAlign = params.footerAlign ?? params.align;
    const pictures = new Map<string, Promise<{ png: Uint8Array; width: number; height: number } | null>>();
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const name = baseName(input.name);
      // A cover is left plain when asked, unless it is the only page.
      const from = params.skipFirst === true && doc.pageCount > 1 ? 1 : 0;
      for (let i = from; i < doc.pageCount; i++) {
        checkCancelled(ctx.signal);
        const values = { page: i + 1, total: doc.pageCount, date, name };
        const k = paperScale(doc, i);
        if (header) await stampWords(doc, i, { text: fillTokens(header, values), anchor: `top-${params.align}` as Anchor, size: 9 * k, color: INK, margin: 24 * k }, pictures);
        if (footer) await stampWords(doc, i, { text: fillTokens(footer, values), anchor: `bottom-${footerAlign}` as Anchor, size: 9 * k, color: INK, margin: 24 * k }, pictures);
      }
      const which = header && footer ? 'Header and footer' : header ? 'Header' : 'Footer';
      const suffix = header && footer ? 'with header and footer' : header ? 'with header' : 'with footer';
      const where = from === 1 ? `${doc.pageCount === 2 ? 'page 2' : `pages 2 to ${doc.pageCount}`}; the first page left plain` : plural(doc.pageCount, 'page');
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'header-footer', [input], `${name} ${suffix}.pdf`, bytes, `${which} on ${where}${lockNote(relocked)}`);
    });
  },
};
