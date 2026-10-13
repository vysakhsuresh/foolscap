/**
 * The tools that change how a document is put together rather than what is
 * drawn on it: a page colour, page labels, attached files, and bookmarks.
 */
import type { FileKind, FoolscapFile } from '../files/types';
import { looksLikeImage, looksLikePdf } from '../files/document-store';
import type { OutlineItem, PageLabelRange, PdfDoc, Rgb } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, forEachPdf, lockNote, passwordFor, plural, readInput, refused, saveKeepingLock, store } from './common';
import { checkCancelled, type AttachmentsParams, type BackgroundParams, type BookmarksParams, type Op, type OpContext, type Outcome, type PageLabelsParams } from './op';

/** "#ffeecc" → [1, 0.93, 0.8], or null for anything else. */
export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const backgroundOp: Op<BackgroundParams> = {
  tool: 'background',
  arity: { kind: 'each' },
  title: () => 'Page background',
  async run(inputs, params, ctx) {
    const color = parseHex(params.color);
    if (color === null) return inputs.map((input) => refused([input], 'Pick a colour for the pages.'));
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const n = doc.pageCount;
      const pages = params.pages.trim() === '' ? PageSelection.all(n) : PageSelection.parse(params.pages, n);
      if (pages.length === 0) return refused([input], `This file has ${plural(n, 'page')}; none of the pages typed are in it.`);
      for (const index of pages) doc.setBackground(index, color);
      const which = pages.length === n ? `All ${plural(n, 'page')}` : `${pages.length === 1 ? 'Page' : 'Pages'} ${PageSelection.describe(pages)}`;
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'background', [input], `${baseName(input.name)} coloured.pdf`, bytes, `${which} given a ${params.color.toUpperCase()} background${lockNote(relocked)}`);
    });
  },
};

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

export function roman(value: number): string {
  let rest = Math.max(1, Math.floor(value));
  let out = '';
  for (const [n, s] of ROMAN) {
    while (rest >= n) {
      out += s;
      rest -= n;
    }
  }
  return out;
}

export type LabelStyle = NonNullable<Extract<PageLabelsParams, { mode: 'set' }>['style']>;

/** The label ranges for "the first `front` pages in roman, then `prefix` + numbers from `start`". */
export function labelRanges(
  front: number,
  start: number,
  prefix: string,
  pageCount: number,
  frontStyle: 'roman' | 'Roman' = 'roman',
  style: LabelStyle = 'decimal',
): PageLabelRange[] {
  const lead = Math.min(Math.max(0, Math.floor(front)), pageCount);
  const ranges: PageLabelRange[] = [];
  if (lead > 0) ranges.push({ start: 0, style: frontStyle });
  if (lead < pageCount) ranges.push({ start: lead, style, ...(prefix ? { prefix } : {}), first: Math.max(1, Math.floor(start)) });
  return ranges;
}

/** What page `n` (counting from 1) is called in `style`: 4 → "iv", "IV", "D", "d" or "4". Letters run A to Z, then AA to ZZ. */
export function labelFor(n: number, style: LabelStyle | 'roman' | 'Roman'): string {
  switch (style) {
    case 'roman':
      return roman(n);
    case 'Roman':
      return roman(n).toUpperCase();
    case 'alpha':
    case 'Alpha': {
      const k = Math.max(1, Math.floor(n));
      const letter = String.fromCharCode(65 + ((k - 1) % 26)).repeat(Math.floor((k - 1) / 26) + 1);
      return style === 'alpha' ? letter.toLowerCase() : letter;
    }
    case 'decimal':
      return String(Math.max(1, Math.floor(n)));
  }
}

export const pageLabelsOp: Op<PageLabelsParams> = {
  tool: 'page-labels',
  arity: { kind: 'each' },
  title: (p) => (p.mode === 'remove' ? 'Remove page labels' : 'Set page labels'),
  async run(inputs, params, ctx) {
    if (params.mode === 'set' && !(Number.isInteger(params.start) && params.start >= 1)) {
      return inputs.map((input) => refused([input], 'The first number must be 1 or more.'));
    }
    if (params.mode === 'set' && !(Number.isInteger(params.front) && params.front >= 0)) {
      return inputs.map((input) => refused([input], 'The number of front pages must be 0 or more.'));
    }
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const n = doc.pageCount;
      const base = baseName(input.name);
      if (params.mode === 'remove') {
        doc.setPageLabels([]);
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        return store(ctx, 'page-labels', [input], `${base} labels removed.pdf`, bytes, `Page labels removed: readers show plain page numbers${lockNote(relocked)}`);
      }
      const frontStyle = params.frontStyle ?? 'roman';
      const style = params.style ?? 'decimal';
      const ranges = labelRanges(params.front, params.start, params.prefix.trim(), n, frontStyle, style);
      doc.setPageLabels(ranges);
      const lead = Math.min(params.front, n);
      const first = `${params.prefix.trim()}${labelFor(params.start, style)}`;
      const last = `${params.prefix.trim()}${labelFor(params.start + n - lead - 1, style)}`;
      const main = n - lead === 1 ? first : `${first} to ${last}`;
      const pages = n === 1 ? 'Page labelled' : 'Pages labelled';
      const detail =
        lead === 0
          ? `${pages} ${main}`
          : lead === n
            ? `${pages} ${labelFor(1, frontStyle)}${n > 1 ? ` to ${labelFor(n, frontStyle)}` : ''}`
            : `${pages} ${labelFor(1, frontStyle)}${lead > 1 ? ` to ${labelFor(lead, frontStyle)}` : ''}, then ${main}`;
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'page-labels', [input], `${base} labelled.pdf`, bytes, `${detail}${lockNote(relocked)}`);
    });
  },
};

/** What an attached file is, by its bytes, so a PDF that comes out can go straight into another tool. */
function kindOf(bytes: Uint8Array, name: string): FileKind {
  const head = bytes.subarray(0, 1024);
  if (looksLikePdf(head)) return 'pdf';
  if (looksLikeImage(head)) return 'image';
  return /\.txt$/i.test(name) ? 'text' : 'other';
}

export const attachmentsOp: Op<AttachmentsParams> = {
  tool: 'attachments',
  arity: { kind: 'together', min: 1 },
  title: (p) => (p.mode === 'attach' ? 'Attach files' : 'Take out attached files'),
  async run(inputs, params, ctx) {
    if (params.mode === 'extract') return extractAttachments(inputs, ctx);
    const [target, ...rest] = inputs;
    if (target === undefined || target.kind !== 'pdf') return [refused(inputs, 'Add the PDF first, then the files to put inside it.')];
    if (rest.length === 0) return [refused(inputs, 'Add the files to attach after the PDF.')];
    let doc: PdfDoc;
    try {
      doc = await ctx.surgeon.open(await readInput(ctx, target), passwordFor(ctx, target));
    } catch (error) {
      return [failed(error, [target])];
    }
    try {
      for (const [i, file] of rest.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: rest.length, label: `Attaching file ${i + 1} of ${rest.length}` });
        await doc.attach({ name: file.name, bytes: await readInput(ctx, file) });
      }
      ctx.progress({ done: 0, total: 0, label: 'Saving…' });
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, target);
      return [await store(ctx, 'attachments', inputs, `${baseName(target.name)} with attachments.pdf`, bytes, `${plural(rest.length, 'file')} attached inside; open the PDF's attachments panel to see them${lockNote(relocked)}`)];
    } catch (error) {
      return [failed(error, inputs)];
    } finally {
      doc.close();
    }
  },
};

async function extractAttachments(inputs: readonly FoolscapFile[], ctx: OpContext): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const input of inputs) {
    checkCancelled(ctx.signal);
    if (input.kind !== 'pdf') {
      outcomes.push({ kind: 'skipped', inputIds: [input.id], reason: 'This is not a PDF, so it carries no attachments.' });
      continue;
    }
    let doc: PdfDoc;
    try {
      doc = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
    } catch (error) {
      outcomes.push(failed(error, [input]));
      continue;
    }
    try {
      const files = doc.attachments();
      if (files.length === 0) {
        outcomes.push({ kind: 'skipped', inputIds: [input.id], reason: 'This PDF carries no attached files.' });
        continue;
      }
      const used = new Set<string>();
      for (const file of files) {
        let name = file.name;
        for (let n = 2; used.has(name.toLowerCase()); n++) name = file.name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
        used.add(name.toLowerCase());
        outcomes.push(await store(ctx, 'attachments', [input], name, file.bytes, `Attached file, ${kb(file.bytes.length)}`, kindOf(file.bytes, name)));
      }
    } catch (error) {
      outcomes.push(failed(error, [input]));
    } finally {
      doc.close();
    }
  }
  return outcomes;
}

function kb(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function countItems(items: readonly OutlineItem[]): number {
  return items.reduce((sum, item) => sum + 1 + countItems(item.items), 0);
}

export const bookmarksOp: Op<BookmarksParams> = {
  tool: 'bookmarks',
  arity: { kind: 'one' },
  title: () => 'Bookmarks',
  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined || inputs.length !== 1) return [refused(inputs, 'Bookmarks works on one file at a time.')];
    const clean = (list: readonly OutlineItem[]): OutlineItem[] =>
      list.filter((i) => i.title.trim() !== '').map((i) => ({ title: i.title.trim(), page: i.page, items: clean(i.items), ...(i.was ? { was: i.was } : {}) }));
    const items = clean(params.items);
    return forEachPdf([input], ctx, async (doc) => {
      // No page is allowed only for a bookmark the file already had that opens a web page or the like.
      const outOfRange = (list: readonly OutlineItem[]): boolean =>
        list.some((i) => (i.page === null ? i.was === undefined || i.was.page !== null : i.page < 0 || i.page >= doc.pageCount) || outOfRange(i.items));
      if (outOfRange(items)) return refused([input], `Every bookmark needs a page between 1 and ${doc.pageCount}.`);
      doc.setBookmarks(items);
      const total = countItems(items);
      const detail = total === 0 ? 'Every bookmark removed' : `${plural(total, 'bookmark')}, ready in any reader's side panel`;
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'bookmarks', [input], `${baseName(input.name)} bookmarked.pdf`, bytes, `${detail}${lockNote(relocked)}`);
    });
  },
};
