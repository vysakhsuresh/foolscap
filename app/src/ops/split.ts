/**
 * Split: one document into several. The source is opened once; each part is
 * built, saved, stored and closed before the next, so memory holds the source
 * and one part, never every part.
 */
import type { FoolscapFile, Origin } from '../files/types';
import type { PdfDoc } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, fitName, lockNote, passwordFor, plural, readInput, refused, saveKeepingLock } from './common';
import { checkCancelled, type Op, type Outcome, type SplitParams } from './op';

const RANGES_HELP = 'Type the pages to split out, like 1-3, 7, 12-';

/** A part keeps the bookmarks, page labels and details that belong to its pages. */
const ALL = { bookmarks: true, labels: true, details: true } as const;

export const splitOp: Op<SplitParams> = {
  tool: 'split',
  arity: { kind: 'one' },
  title: (params) => {
    switch (params.mode) {
      case 'every':
        return `Split every ${plural(params.every, 'page')}`;
      case 'single':
        return 'Split into single pages';
      case 'ranges':
        return 'Split by page ranges';
      case 'bookmarks':
        return 'Split at each bookmark';
    }
  },

  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined || inputs.length !== 1) return [refused(inputs, 'Split works on one file at a time. Pick just one.')];
    if (params.mode === 'every' && !(Number.isInteger(params.every) && params.every >= 1)) {
      return [refused(inputs, 'Pages per part must be at least 1.')];
    }

    let source: PdfDoc;
    try {
      source = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
    } catch (error) {
      return [failed(error, inputs)];
    }

    try {
      const chapters = params.mode === 'bookmarks' ? chaptersOf(source) : null;
      if (chapters !== null && chapters.length < 2) {
        return [refused(inputs, chapters.length === 0 ? 'This PDF has no bookmarks to split at. Add some with the Bookmarks tool, or split by pages.' : 'This PDF has only one chapter bookmark, so there is nothing to split.')];
      }
      const groups = chapters !== null ? chapters.map((c) => c.pages) : groupsFor(params, source.pageCount);
      if (groups.length === 0) {
        return [refused(inputs, params.mode === 'ranges' ? RANGES_HELP : 'That split produced no pages.')];
      }
      const whole = groups[0];
      if (groups.length === 1 && whole !== undefined && whole.length === source.pageCount) {
        return [
          refused(
            inputs,
            'That would make one file with every page in it, the same as the original. Use fewer pages per part, or type the pages to split out.',
          ),
        ];
      }

      const base = baseName(input.name);
      const origin: Origin = { kind: 'derived', tool: 'split', from: [input.id] };
      const outcomes: Outcome[] = [];
      for (const [i, pages] of groups.entries()) {
        ctx.progress({ done: i, total: groups.length, label: `Writing part ${i + 1} of ${groups.length}` });
        checkCancelled(ctx.signal);
        const chapter = chapters?.[i]?.title;
        const name =
          chapter !== undefined
            ? `${base} ${String(i + 1).padStart(2, '0')} ${chapter}.pdf`
            : params.mode === 'ranges'
              ? `${base} pages ${PageSelection.describe(pages)}.pdf`
              : `${base} part ${i + 1} of ${groups.length}.pdf`;
        try {
          const part = await ctx.surgeon.create();
          try {
            await part.appendPages(source, pages);
            part.carryOver(source, ALL);
            const { bytes, relocked } = await saveKeepingLock(ctx, part, input, source.wasEncrypted);
            const file = await ctx.workspace.put(fitName(name), bytes, 'pdf', origin);
            outcomes.push({ kind: 'produced', file, detail: `${plural(pages.length, 'page')}${lockNote(relocked)}` });
          } finally {
            part.close();
          }
        } catch (error) {
          outcomes.push(failed(error, inputs));
        }
      }
      ctx.progress({ done: groups.length, total: groups.length, label: 'Done' });
      return outcomes;
    } finally {
      source.close();
    }
  },
};

/**
 * One part per top-level bookmark, from its page to the page before the next.
 * Pages before the first bookmark are a part of their own ("Opening pages").
 * Bookmarks out of order or on the same page are folded together.
 */
function chaptersOf(doc: PdfDoc): Array<{ title: string; pages: number[] }> {
  const marks = doc
    .bookmarks()
    .filter((b): b is typeof b & { page: number } => b.page !== null && b.page >= 0 && b.page < doc.pageCount)
    .sort((a, b) => a.page - b.page);
  const starts: Array<{ title: string; page: number }> = [];
  for (const mark of marks) if (starts[starts.length - 1]?.page !== mark.page) starts.push({ title: mark.title, page: mark.page });
  if (starts.length === 0) return [];
  const first = starts[0];
  if (first !== undefined && first.page > 0) starts.unshift({ title: 'Opening pages', page: 0 });
  return starts.map((s, i) => {
    const end = starts[i + 1]?.page ?? doc.pageCount;
    return { title: safeTitle(s.title), pages: Array.from({ length: end - s.page }, (_, k) => s.page + k) };
  });
}

/** A bookmark title fit to be part of a file name. */
function safeTitle(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
  return cleaned || 'Chapter';
}

function groupsFor(params: SplitParams, pageCount: number): number[][] {
  switch (params.mode) {
    case 'bookmarks':
      return [];
    case 'every':
      return PageSelection.chunks(pageCount, params.every);
    case 'single':
      return PageSelection.chunks(pageCount, 1);
    case 'ranges':
      return PageSelection.rangesInOrder(params.ranges, pageCount);
  }
}
