/**
 * Merge: several documents end to end, in the order given. One input is
 * resident at a time — open, append its pages, close, move on — so a merge of
 * forty scans costs the output plus one input, not all forty.
 */
import type { FoolscapFile, Origin } from '../files/types';
import type { PdfDoc } from '../pdf';
import { baseName, failed, fitName, ordinal, passwordFor, plural, readInput, refused } from './common';
import { checkCancelled, type MergeParams, type Op, type Outcome } from './op';

/** Pages appended between cancel checks and progress reports. */
const BATCH = 25;

export const mergeOp: Op<MergeParams> = {
  tool: 'merge',
  arity: { kind: 'together', min: 2 },
  title: () => 'Merge into one file',

  async run(inputs, params, ctx) {
    const outcomes: Outcome[] = [];
    const used: FoolscapFile[] = [];
    let pagesDone = 0;
    let pagesTotal = 0;

    const out = await ctx.surgeon.create();
    try {
      for (const [position, input] of inputs.entries()) {
        checkCancelled(ctx.signal);
        const label = `Adding pages from the ${ordinal(position + 1)} file`;
        ctx.progress({ done: pagesDone, total: pagesTotal, label });

        let source: PdfDoc;
        try {
          source = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
        } catch (error) {
          outcomes.push(failed(error, [input]));
          continue;
        }

        try {
          pagesTotal += source.pageCount;
          for (let start = 0; start < source.pageCount; start += BATCH) {
            checkCancelled(ctx.signal);
            const end = Math.min(start + BATCH, source.pageCount);
            await out.appendPages(source, range(start, end));
            pagesDone += end - start;
            ctx.progress({ done: pagesDone, total: pagesTotal, label });
          }
          // Each file's bookmarks come along, after the ones before it, still opening where they did.
          out.carryOver(source, { bookmarks: true });
          used.push(input);
        } catch (error) {
          // The pages this input did get in stay in: the user still gets a merge of the rest.
          outcomes.push(failed(error, [input]));
        } finally {
          source.close();
        }
      }

      // A merge of one file is a copy of it, which would read as the work
      // having been done. Say what happened and produce nothing instead.
      if (used.length < 2) {
        if (outcomes.length === 0) return [refused(inputs, 'Add at least one more file to merge.')];
        return outcomes.map((outcome) =>
          outcome.kind === 'failed' ? { ...outcome, reason: `${outcome.reason} ${NOTHING_MERGED}` } : outcome,
        );
      }

      checkCancelled(ctx.signal);
      const first = used[0];
      if (first === undefined) return outcomes;
      const base = params.name?.trim() ? params.name.trim() : `${baseName(first.name)} + ${used.length - 1} more`;
      out.setTitle(base);
      ctx.progress({ done: 0, total: 0, label: 'Writing the file…' });
      // Counted from the document itself: an input that failed part-way
      // through its append leaves the pages it did get in.
      const pageCount = out.pageCount;
      const bytes = await out.save();
      const origin: Origin = { kind: 'derived', tool: 'merge', from: used.map((input) => input.id) };
      const file = await ctx.workspace.put(fitName(outputName(base, inputs)), bytes, 'pdf', origin);

      const unreadable = inputs.length - used.length;
      const detail =
        `${plural(pageCount, 'page')} from ${plural(used.length, 'file')}` +
        (unreadable > 0 ? `, ${plural(unreadable, 'file')} couldn't be read` : '') +
        // Several files may carry several passwords; the merge carries none, and says so.
        (used.some((input) => (ctx.passwords.get(input.id) ?? '') !== '') ? '. The merged file has no password' : '');
      outcomes.push({ kind: 'produced', file, detail });
      return outcomes;
    } catch (error) {
      outcomes.push(failed(error, used.length > 0 ? used : inputs));
      return outcomes;
    } finally {
      out.close();
    }
  },
};

const NOTHING_MERGED = 'Nothing was merged, because at least two readable files are needed.';

function range(start: number, end: number): number[] {
  const indices: number[] = [];
  for (let i = start; i < end; i++) indices.push(i);
  return indices;
}

/** Never an input's own name: a user-typed name that collides gets " merged" after it. */
function outputName(base: string, inputs: readonly FoolscapFile[]): string {
  const candidate = `${base}.pdf`;
  const taken = inputs.some((input) => input.name.toLowerCase() === candidate.toLowerCase());
  return taken ? `${base} merged.pdf` : candidate;
}
