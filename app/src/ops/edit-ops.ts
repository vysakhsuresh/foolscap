/**
 * The tools that work on a page you can see: Sign, Add text, Mark up, Remove
 * areas and Fill in a form. The page editor (ui/page-editor.ts) produces the
 * marks and areas; these check them and hand them to the surgeon.
 */
import type { FoolscapFile } from '../files/types';
import type { Area, Mark, PdfDoc } from '../pdf';
import { baseName, failed, passwordFor, plural, readInput, refused, saveKeepingLock, store } from './common';
import { checkCancelled, type FillFormParams, type MarksParams, type Op, type OpContext, type Outcome, type RemoveAreasParams } from './op';
import type { ToolId } from './tools';

const LOCKED = ', still locked with the same password';

const inUnit = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= -0.01 && n <= 1.01;

function areaOk(area: Area, pageCount: number): boolean {
  return Number.isInteger(area.page) && area.page >= 0 && area.page < pageCount && [area.x, area.y, area.w, area.h].every(inUnit) && area.w > 0 && area.h > 0;
}

function markOk(mark: Mark, pageCount: number): boolean {
  if (mark.kind === 'ink') {
    return Number.isInteger(mark.page) && mark.page >= 0 && mark.page < pageCount && mark.points.length >= 2 && mark.points.every(inUnit);
  }
  return areaOk(mark.area, pageCount);
}

/** Opens the one input; a failure is the run's single outcome. */
async function withOne(
  inputs: readonly FoolscapFile[],
  ctx: OpContext,
  work: (doc: PdfDoc, input: FoolscapFile) => Promise<Outcome>,
): Promise<Outcome[]> {
  const input = inputs[0];
  if (input === undefined) return [refused(inputs, 'Pick one PDF.')];
  let doc: PdfDoc;
  try {
    doc = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
  } catch (error) {
    return [failed(error, inputs)];
  }
  try {
    ctx.progress({ done: 0, total: 0, label: 'Working on it…' });
    return [await work(doc, input)];
  } catch (error) {
    return [failed(error, inputs)];
  } finally {
    doc.close();
  }
}

function marksOp(tool: ToolId, title: string, suffix: string, nothing: string, describe: (marks: readonly Mark[]) => string): Op<MarksParams> {
  return {
    tool,
    arity: { kind: 'one' },
    title: () => title,
    run: (inputs, params, ctx) =>
      withOne(inputs, ctx, async (doc, input) => {
        const marks = params.marks.filter((m) => markOk(m, doc.pageCount));
        if (marks.length === 0) return refused([input], nothing);
        await doc.drawMarks(marks);
        checkCancelled(ctx.signal);
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        return store(ctx, tool, [input], `${baseName(input.name)} (${suffix}).pdf`, bytes, `${describe(marks)}${relocked ? LOCKED : ''}`);
      }),
  };
}

const pagesOf = (marks: readonly Mark[]): number => new Set(marks.map((m) => (m.kind === 'ink' ? m.page : m.area.page))).size;
const onPages = (marks: readonly Mark[]): string => {
  const n = pagesOf(marks);
  return n === 1 ? '' : ` across ${plural(n, 'page')}`;
};

export const signOp = marksOp('sign', 'Sign', 'signed', 'Draw your signature, then tap the page where it goes.', (marks) =>
  marks.length === 1 ? `Signed on page ${pageOf(marks[0]!) + 1}` : `Signed in ${marks.length} places${onPages(marks)}`,
);

export const addTextOp = marksOp('add-text', 'Add text', 'with text', 'Tap the page where the words go, then type them.', (marks) =>
  `${plural(marks.length, 'piece')} of text added${onPages(marks)}`,
);

export const markUpOp = marksOp('mark-up', 'Mark up', 'marked up', 'Highlight or draw on the page first.', (marks) => {
  const highlights = marks.filter((m) => m.kind === 'highlight').length;
  const strokes = marks.length - highlights;
  const parts = [highlights > 0 ? plural(highlights, 'highlight') : '', strokes > 0 ? plural(strokes, 'pen stroke') : ''].filter(Boolean);
  return `${parts.join(' and ')}${onPages(marks)}`;
});

function pageOf(mark: Mark): number {
  return mark.kind === 'ink' ? mark.page : mark.area.page;
}

/** 200 dots per inch: small print stays readable and a page stays well under a megabyte. */
const REDACT_DPI = 200;

export const removeAreasOp: Op<RemoveAreasParams> = {
  tool: 'remove-areas',
  arity: { kind: 'one' },
  engine: true,
  title: () => 'Remove areas',
  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined) return [refused(inputs, 'Pick one PDF.')];
    // First the pictures, through pdf.js: each marked page drawn with its areas filled black.
    const pictures = new Map<number, Uint8Array>();
    let areas: Area[];
    try {
      const engine = await ctx.engine();
      const view = await engine.open(await ctx.workspace.read(input), { ...passwordFor(ctx, input), signal: ctx.signal });
      try {
        areas = params.areas.filter((a) => areaOk(a, view.pageCount));
        if (areas.length === 0) return [refused(inputs, 'Drag across what should go, on the page above.')];
        const pages = [...new Set(areas.map((a) => a.page))].sort((a, b) => a - b);
        for (const [i, index] of pages.entries()) {
          checkCancelled(ctx.signal);
          ctx.progress({ done: i, total: pages.length + 1, label: `Removing from page ${index + 1}` });
          const page = await view.page(index);
          const across = page.rotation === 90 || page.rotation === 270 ? page.height : page.width;
          const cover = areas.filter((a) => a.page === index);
          pictures.set(index, await view.encode(index, { width: Math.round((across / 72) * REDACT_DPI), format: 'jpeg', quality: 0.9, signal: ctx.signal, cover }));
        }
      } finally {
        await view.close();
      }
    } catch (error) {
      return [failed(error, inputs)];
    }
    // Then the swap, through pdf-lib: each marked page becomes its picture.
    return withOne(inputs, ctx, async (doc) => {
      ctx.progress({ done: pictures.size, total: pictures.size + 1, label: 'Writing the file…' });
      for (const [index, jpeg] of pictures) await doc.replaceWithImage(index, jpeg);
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const pages = pictures.size === 1 ? `Page ${[...pictures.keys()][0]! + 1} is now a picture` : `${plural(pictures.size, 'page')} are now pictures`;
      return store(
        ctx,
        'remove-areas',
        [input],
        `${baseName(input.name)} (redacted).pdf`,
        bytes,
        `${plural(areas.length, 'area')} removed. ${pages}, so nothing under the black can be copied back${relocked ? LOCKED : ''}`,
      );
    });
  },
};

export const fillFormOp: Op<FillFormParams> = {
  tool: 'fill-form',
  arity: { kind: 'one' },
  title: (params) => (params.seal ? 'Fill in and seal' : 'Fill in a form'),
  run: (inputs, params, ctx) =>
    withOne(inputs, ctx, async (doc, input) => {
      if (Object.keys(params.values).length === 0 && !params.seal) return refused([input], 'Nothing was changed. Type your answers first.');
      const filled = Object.values(params.values).filter((v) => v !== '' && v !== false).length;
      doc.fillForm(params.values, params.seal);
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const sealed = params.seal ? ', sealed so the answers can no longer be changed' : ', still editable';
      return store(ctx, 'fill-form', [input], `${baseName(input.name)} (filled).pdf`, bytes, `${plural(filled, 'answer')}${sealed}${relocked ? LOCKED : ''}`);
    }),
};
