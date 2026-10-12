/** The Mark up family's stamping tools: watermark, page numbers, header and footer. */
import type { FoolscapFile } from '../files/types';
import type { Anchor } from '../pdf';
import { baseName, forEachPdf, lockNote, plural, refused, saveKeepingLock, store } from './common';
import { checkCancelled, type HeaderFooterParams, type Op, type OpContext, type Outcome, type PageNumbersParams, type WatermarkParams } from './op';

const GREY: readonly [number, number, number] = [0.42, 0.42, 0.46];
const INK: readonly [number, number, number] = [0.2, 0.2, 0.24];
const OPACITY: Record<WatermarkParams['strength'], number> = { light: 0.12, medium: 0.22, strong: 0.38 };

export const watermarkOp: Op<WatermarkParams> = {
  tool: 'watermark',
  arity: { kind: 'each' },
  title: (p) => `Watermark "${p.text}"`,
  async run(inputs, params, ctx) {
    const text = params.text.trim();
    if (text.length === 0) return inputs.map((input) => refused([input], 'Type the watermark text, such as DRAFT or COPY.'));
    return forEachPdf(inputs, ctx, async (doc, input) => {
      for (let i = 0; i < doc.pageCount; i++) {
        checkCancelled(ctx.signal);
        const box = doc.visibleBox(i);
        const short = Math.min(box.width, box.height);
        if (params.layout === 'tiled') {
          doc.stampText(i, { text, anchor: 'center', size: Math.max(14, short * 0.045), bold: true, opacity: OPACITY[params.strength], color: GREY, angle: 30, tiled: true });
        } else {
          // Sized to the page and to the word, so DRAFT and CONFIDENTIAL both cross the page without running off it.
          const size = Math.min(short * 0.2, (Math.hypot(box.width, box.height) * 0.7) / Math.max(4, text.length * 0.6));
          doc.stampText(i, { text, anchor: 'center', size, bold: true, opacity: OPACITY[params.strength], color: GREY, angle: 45 });
        }
      }
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const detail = `"${text}" ${params.layout === 'tiled' ? 'repeated across' : 'across'} ${plural(doc.pageCount, 'page')}${lockNote(relocked)}`;
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

export const pageNumbersOp: Op<PageNumbersParams> = {
  tool: 'page-numbers',
  arity: { kind: 'each' },
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
        doc.stampText(i, { text: numberText(params.format, start + i - skip, last), anchor: params.position as Anchor, size: 10, color: INK, margin: 28 });
      }
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const detail = (skip ? `Pages 2 to ${doc.pageCount} numbered ${start} to ${last}; cover left blank` : `Numbered ${start} to ${last}`) + lockNote(relocked);
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
  return forEachPdf(inputs, ctx, async (doc, input) => {
    const first = next;
    for (let i = 0; i < doc.pageCount; i++) {
      checkCancelled(ctx.signal);
      doc.stampText(i, { text: `${prefix}${String(next).padStart(digits, '0')}`, anchor: params.position as Anchor, size: 9, color: INK, margin: 22 });
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
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const name = baseName(input.name);
      for (let i = 0; i < doc.pageCount; i++) {
        checkCancelled(ctx.signal);
        const values = { page: i + 1, total: doc.pageCount, date, name };
        if (header) doc.stampText(i, { text: fillTokens(header, values), anchor: `top-${params.align}` as Anchor, size: 9, color: INK, margin: 24 });
        if (footer) doc.stampText(i, { text: fillTokens(footer, values), anchor: `bottom-${params.align}` as Anchor, size: 9, color: INK, margin: 24 });
      }
      const which = header && footer ? 'Header and footer' : header ? 'Header' : 'Footer';
      const suffix = header && footer ? 'with header and footer' : header ? 'with header' : 'with footer';
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'header-footer', [input], `${name} ${suffix}.pdf`, bytes, `${which} on ${plural(doc.pageCount, 'page')}${lockNote(relocked)}`);
    });
  },
};
