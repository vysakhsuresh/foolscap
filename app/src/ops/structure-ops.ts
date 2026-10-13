/**
 * The tools that change how a document is put together rather than what is
 * drawn on it: a page colour, page labels, attached files, and bookmarks.
 */
import type { FileKind, FoolscapFile } from '../files/types';
import { looksLikeImage, looksLikePdf } from '../files/document-store';
import type { OutlineItem, PageLabelRange, PdfDoc, Rgb } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, forEachPdf, lockNote, passwordFor, plural, readInput, refused, saveKeepingLock, signedNote, store } from './common';
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

/** The label ranges for "the first `front` pages in roman, then `prefix` + numbers from `start`". */
export function labelRanges(front: number, start: number, prefix: string, pageCount: number): PageLabelRange[] {
  const lead = Math.min(Math.max(0, Math.floor(front)), pageCount);
  const ranges: PageLabelRange[] = [];
  if (lead > 0) ranges.push({ start: 0, style: 'roman' });
  if (lead < pageCount) ranges.push({ start: lead, style: 'decimal', ...(prefix ? { prefix } : {}), first: Math.max(1, Math.floor(start)) });
  return ranges;
}

export const pageLabelsOp: Op<PageLabelsParams> = {
  tool: 'page-labels',
  arity: { kind: 'each' },
  title: (p) => (p.mode === 'remove' ? 'Remove page labels' : 'Set page labels'),
  async run(inputs, params, ctx) {
    if (params.mode === 'set' && !(Number.isInteger(params.start) && params.start >= 1)) {
      return inputs.map((input) => refused([input], 'The first number must be 1 or more.'));
    }
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const n = doc.pageCount;
      const base = baseName(input.name);
      if (params.mode === 'remove') {
        doc.setPageLabels([]);
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        return store(ctx, 'page-labels', [input], `${base} labels removed.pdf`, bytes, `Page labels removed: readers show plain page numbers${lockNote(relocked)}`);
      }
      const ranges = labelRanges(params.front, params.start, params.prefix.trim(), n);
      doc.setPageLabels(ranges);
      const lead = Math.min(params.front, n);
      const first = `${params.prefix.trim()}${params.start}`;
      const detail =
        lead === 0
          ? `Pages labelled ${first} onwards`
          : lead === n
            ? `Pages labelled i to ${roman(n)}`
            : `Pages labelled i to ${roman(lead)}, then ${first} onwards`;
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
    // The first PDF in the list is the one the files go into, wherever the
    // picker put it: a phone lists "aadhaar.jpg" before "Lease.pdf".
    const target = inputs.find((input) => input.kind === 'pdf');
    if (target === undefined) return [refused(inputs, 'Add the PDF the files should go into.')];
    const rest = inputs.filter((input) => input !== target);
    if (rest.length === 0) return [refused(inputs, 'Add the files to attach after the PDF.')];
    let doc: PdfDoc;
    try {
      doc = await ctx.surgeon.open(await readInput(ctx, target), passwordFor(ctx, target));
    } catch (error) {
      return [failed(error, [target])];
    }
    try {
      // Two files of one name would be one entry in a reader's list, and the
      // other could not be found: the second becomes "name (2).ext".
      const taken = new Set(doc.attachments().map((a) => a.name.toLowerCase()));
      const renamed: string[] = [];
      for (const [i, file] of rest.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: rest.length, label: `Attaching file ${i + 1} of ${rest.length}` });
        let name = file.name;
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = file.name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
        taken.add(name.toLowerCase());
        if (name !== file.name) renamed.push(name);
        await doc.attach({ name, bytes: await readInput(ctx, file) });
      }
      ctx.progress({ done: 0, total: 0, label: 'Saving…' });
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, target);
      const names = renamed.length === 0 ? '' : `; a file of the same name was already there, so ${renamed.length === 1 ? 'one is' : 'some are'} called ${renamed.map((n) => `"${n}"`).join(', ')}`;
      return [await store(ctx, 'attachments', inputs, `${baseName(target.name)} with attachments.pdf`, bytes, `${plural(rest.length, 'file')} attached inside; open the PDF's attachments panel to see them${names}${lockNote(relocked)}${signedNote(doc)}`)];
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
      list.filter((i) => i.title.trim() !== '').map((i) => ({ title: i.title.trim(), page: i.page, items: clean(i.items) }));
    const items = clean(params.items);
    return forEachPdf([input], ctx, async (doc) => {
      const outOfRange = (list: readonly OutlineItem[]): boolean => list.some((i) => i.page === null || i.page < 0 || i.page >= doc.pageCount || outOfRange(i.items));
      if (outOfRange(items)) return refused([input], `Every bookmark needs a page between 1 and ${doc.pageCount}.`);
      doc.setBookmarks(items);
      const total = countItems(items);
      const detail = total === 0 ? 'Every bookmark removed' : `${plural(total, 'bookmark')}, ready in any reader's side panel`;
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'bookmarks', [input], `${baseName(input.name)} bookmarked.pdf`, bytes, `${detail}${lockNote(relocked)}`);
    });
  },
};
