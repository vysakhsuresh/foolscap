/**
 * Split: one document into several. The source is opened once; each part is
 * built, saved, stored and closed before the next, so memory holds the source
 * and one part, never every part.
 */
import type { FoolscapFile, Origin } from '../files/types';
import type { PdfDoc } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, passwordFor, plural, readInput, refused } from './common';
import { checkCancelled, type Op, type Outcome, type SplitParams } from './op';

const RANGES_HELP = 'Type the pages to split out, like 1-3, 7, 12-';

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
      const groups = groupsFor(params, source.pageCount);
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
        const name =
          params.mode === 'ranges'
            ? `${base} pages ${PageSelection.describe(pages)}.pdf`
            : `${base} part ${i + 1} of ${groups.length}.pdf`;
        try {
          const part = await ctx.surgeon.create();
          try {
            await part.appendPages(source, pages);
            const bytes = await part.save();
            const file = await ctx.workspace.put(name, bytes, 'pdf', origin);
            outcomes.push({ kind: 'produced', file, detail: plural(pages.length, 'page') });
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

function groupsFor(params: SplitParams, pageCount: number): number[][] {
  switch (params.mode) {
    case 'every':
      return PageSelection.chunks(pageCount, params.every);
    case 'single':
      return PageSelection.chunks(pageCount, 1);
    case 'ranges':
      return PageSelection.rangesInOrder(params.ranges, pageCount);
  }
}
