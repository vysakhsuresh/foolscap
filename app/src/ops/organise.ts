/**
 * Organise: reorder, rotate, delete and duplicate in one pass. When the
 * finished list is a plain permutation of the source, the pages are moved in
 * place and nothing is cloned; otherwise the output is built page by page into
 * a fresh document, so a deleted page's streams are really gone.
 */
import type { Origin } from '../files/types';
import type { PdfDoc, Rotation } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, passwordFor, plural, readInput, refused } from './common';
import { checkCancelled, type Op, type OrganiseParams } from './op';

type Page = OrganiseParams['pages'][number];

export const organiseOp: Op<OrganiseParams> = {
  tool: 'organise',
  arity: { kind: 'one' },
  title: () => 'Organise pages',

  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined || inputs.length !== 1) return [refused(inputs, 'Organise works on one file at a time. Pick just one.')];
    const pages = params.pages ?? [];
    if (pages.length === 0) return [refused(inputs, 'Keep at least one page.')];

    let doc: PdfDoc;
    try {
      doc = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
    } catch (error) {
      return [failed(error, inputs)];
    }

    try {
      const sourcePages = doc.pages();
      const outOfRange = pages.find((page) => !Number.isInteger(page.source) || page.source < 0 || page.source >= sourcePages.length);
      if (outOfRange !== undefined) {
        return [refused(inputs, `Page ${outOfRange.source + 1} isn't in this document, which has ${plural(sourcePages.length, 'page')}. Start over and try again.`)];
      }
      const badRotation = pages.find((page) => !ROTATIONS.has(page.rotation));
      if (badRotation !== undefined) return [refused(inputs, 'A page can only be turned in quarter turns. Start over and try again.')];

      const order = pages.map((page) => page.source);
      const permutation = isPermutation(order, sourcePages.length);
      const rotated = pages.filter((page, i) => page.rotation !== sourcePages[order[i] ?? 0]?.rotation).length;

      ctx.progress({ done: 0, total: pages.length, label: permutation ? 'Arranging the pages' : 'Rebuilding the pages' });
      checkCancelled(ctx.signal);

      let bytes: Uint8Array;
      if (permutation) {
        doc.reorder(order);
        pages.forEach((page, i) => doc.setRotation(i, page.rotation));
        ctx.progress({ done: 0, total: 0, label: 'Writing the file…' });
        bytes = await doc.save();
      } else {
        const out = await ctx.surgeon.create();
        try {
          await out.appendPages(doc, order);
          pages.forEach((page, i) => out.setRotation(i, page.rotation));
          checkCancelled(ctx.signal);
          ctx.progress({ done: 0, total: 0, label: 'Writing the file…' });
          bytes = await out.save();
        } finally {
          out.close();
        }
      }

      const origin: Origin = { kind: 'derived', tool: 'organise', from: [input.id] };
      const file = await ctx.workspace.put(`${baseName(input.name)} organised.pdf`, bytes, 'pdf', origin);
      return [{ kind: 'produced', file, detail: detailFor(pages, sourcePages.length, permutation, rotated) }];
    } catch (error) {
      return [failed(error, inputs)];
    } finally {
      doc.close();
    }
  },
};

const ROTATIONS: ReadonlySet<Rotation> = new Set<Rotation>([0, 90, 180, 270]);

function isPermutation(order: readonly number[], pageCount: number): boolean {
  return order.length === pageCount && new Set(order).size === pageCount;
}

/**
 * Said against the source, because that is what the user was looking at:
 * "7 pages, 2 rotated, 1 removed" or "Same 7 pages, reordered". A page counts
 * as rotated when its output /Rotate differs from the source page's own.
 */
function detailFor(pages: readonly Page[], sourceCount: number, permutation: boolean, rotated: number): string {
  const parts: string[] = [];
  if (permutation) {
    parts.push(`Same ${plural(pages.length, 'page')}`);
    if (pages.some((page, i) => page.source !== i)) parts.push('reordered');
    if (rotated > 0) parts.push(`${rotated} rotated`);
    if (parts.length === 1) parts.push('nothing changed');
    return parts.join(', ');
  }
  parts.push(plural(pages.length, 'page'));
  if (rotated > 0) parts.push(`${rotated} rotated`);
  const kept = new Set(pages.map((page) => page.source));
  const removed = PageSelection.invert(kept, sourceCount).length;
  if (removed > 0) parts.push(`${removed} removed`);
  const duplicated = pages.length - kept.size;
  if (duplicated > 0) parts.push(`${duplicated} duplicated`);
  return parts.join(', ');
}
