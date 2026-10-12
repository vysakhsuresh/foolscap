/**
 * The tools that work on a page you can see: Sign, Add text, Mark up, Remove
 * areas and Fill in a form. The page editor (ui/page-editor.ts) produces the
 * marks and areas; these check them and hand them to the surgeon.
 */
import type { FoolscapFile } from '../files/types';
import { markPage, type Area, type Mark, type PdfDoc } from '../pdf';
import { baseName, failed, noteMissing, passwordFor, plural, readInput, refused, saveKeepingLock, store } from './common';
import { checkCancelled, type CreateFormParams, type EditImagesParams, type FillFormParams, type MarksParams, type Op, type OpContext, type Outcome, type RemoveAreasParams } from './op';
import type { ToolId } from './tools';

const LOCKED = ', still locked with the same password';

const inUnit = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= -0.01 && n <= 1.01;

function areaOk(area: Area, pageCount: number): boolean {
  return Number.isInteger(area.page) && area.page >= 0 && area.page < pageCount && [area.x, area.y, area.w, area.h].every(inUnit) && area.w > 0 && area.h > 0;
}

/** Sizes and line widths are fractions of the page's width too; anything else is not something the editor sends. */
const fraction = (n: unknown, most: number): boolean => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= most;

function markOk(mark: Mark, pageCount: number): boolean {
  if (mark.kind === 'text' && !fraction(mark.size, 0.5)) return false;
  if ((mark.kind === 'ink' || mark.kind === 'line' || mark.kind === 'shape') && !fraction(mark.width, 0.2)) return false;
  if (mark.kind === 'ink' || mark.kind === 'line') {
    const onPage = Number.isInteger(mark.page) && mark.page >= 0 && mark.page < pageCount;
    if (mark.kind === 'ink') return onPage && mark.points.length >= 2 && mark.points.every(inUnit);
    return onPage && [...mark.from, ...mark.to].every(inUnit) && (mark.from[0] !== mark.to[0] || mark.from[1] !== mark.to[1]);
  }
  if (mark.kind === 'note' && mark.text.trim() === '') return false;
  if (mark.kind === 'stamp' && mark.text.trim() === '') return false;
  if (mark.kind === 'link' && !/^(https?:\/\/|mailto:|tel:)/i.test(mark.url.trim())) return false;
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
    return [noteMissing(await work(doc, input), doc)];
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

const pagesOf = (marks: readonly Mark[]): number => new Set(marks.map(markPage)).size;
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

/** What each kind of mark is called in a sentence, singular and plural. */
function nameOf(mark: Mark): [string, string] {
  switch (mark.kind) {
    case 'highlight':
      return mark.style === 'underline' ? ['underline', 'underlines'] : mark.style === 'strike' ? ['strike-through', 'strike-throughs'] : ['highlight', 'highlights'];
    case 'ink':
      return ['pen stroke', 'pen strokes'];
    case 'shape':
      return mark.shape === 'rect' ? ['box', 'boxes'] : ['circle', 'circles'];
    case 'line':
      return mark.end === 'arrow' ? ['arrow', 'arrows'] : mark.end === 'measure' ? ['measurement', 'measurements'] : ['line', 'lines'];
    case 'note':
      return ['note', 'notes'];
    case 'stamp':
      return ['stamp', 'stamps'];
    case 'link':
      return ['link', 'links'];
    case 'text':
      return mark.boxed ? ['text box', 'text boxes'] : ['piece of text', 'pieces of text'];
    case 'image':
    case 'picture':
      return ['picture', 'pictures'];
    case 'fill':
      return ['patch', 'patches'];
  }
}

export function describeMarks(marks: readonly Mark[]): string {
  const counts = new Map<string, { n: number; many: string }>();
  for (const mark of marks) {
    const [one, many] = nameOf(mark);
    const entry = counts.get(one) ?? { n: 0, many };
    entry.n++;
    counts.set(one, entry);
  }
  const parts = [...counts.entries()].map(([one, { n, many }]) => plural(n, one, many));
  const list = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list}${onPages(marks)}`;
}

export const addImageOp = marksOp('add-image', 'Add image', 'with picture', 'Choose a picture, then tap the page where it goes.', (marks) =>
  `${plural(marks.length, 'picture')} placed${onPages(marks)}`,
);

export const editTextOp = marksOp('edit-text', 'Edit text', 'edited', 'Tap a line of text and change it first.', (marks) => {
  const lines = marks.filter((m) => m.kind === 'fill').length;
  return `${plural(lines, 'change')} made${onPages(marks)}`;
});

const FIELD_WORDS: Record<'text' | 'multiline' | 'check' | 'choice', [string, string]> = {
  text: ['text field', 'text fields'],
  multiline: ['paragraph field', 'paragraph fields'],
  check: ['tick box', 'tick boxes'],
  choice: ['choice list', 'choice lists'],
};

export const createFormOp: Op<CreateFormParams> = {
  tool: 'create-form',
  arity: { kind: 'one' },
  title: () => 'Create a form',
  run: (inputs, params, ctx) =>
    withOne(inputs, ctx, async (doc, input) => {
      const fields = params.fields.filter((f) => areaOk(f.area, doc.pageCount) && f.name.trim() !== '');
      if (fields.length === 0) return refused([input], 'Draw a field on the page first.');
      doc.addFields(fields);
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const counts = new Map<string, { n: number; many: string }>();
      for (const f of fields) {
        const [one, many] = FIELD_WORDS[f.kind];
        const entry = counts.get(one) ?? { n: 0, many };
        entry.n++;
        counts.set(one, entry);
      }
      const parts = [...counts.entries()].map(([one, { n, many }]) => plural(n, one, many));
      const list = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
      return store(ctx, 'create-form', [input], `${baseName(input.name)} (form).pdf`, bytes, `${list} added: anyone can fill it in, in any PDF reader${relocked ? LOCKED : ''}`);
    }),
};

export const editImagesOp: Op<EditImagesParams> = {
  tool: 'edit-images',
  arity: { kind: 'one' },
  title: () => 'Edit pictures',
  run: (inputs, params, ctx) =>
    withOne(inputs, ctx, async (doc, input) => {
      const byPage = new Map<number, EditImagesParams['edits'][number][]>();
      for (const e of params.edits) {
        if (!areaOk(e.area, doc.pageCount)) continue;
        byPage.set(e.area.page, [...(byPage.get(e.area.page) ?? []), e]);
      }
      const done: Array<EditImagesParams['edits'][number]['action']> = [];
      for (const [page, edits] of byPage) done.push(...(await doc.editImages(page, edits)));
      if (done.length === 0) return refused([input], 'Those pictures could not be found in the page’s drawing, so nothing was changed. A picture inside a drawing or a scan cannot be edited on its own.');
      // What was actually done, not what was asked: a picture that could not be found is counted below.
      const count = (action: string) => done.filter((a) => a === action).length;
      const parts = [
        count('delete') > 0 ? `${plural(count('delete'), 'picture')} taken out` : '',
        count('move') > 0 ? `${plural(count('move'), 'picture')} moved` : '',
        count('replace') > 0 ? `${plural(count('replace'), 'picture')} replaced` : '',
      ].filter(Boolean);
      const missed = params.edits.length - done.length;
      const detail = `${parts.join(', ')}${missed > 0 ? `; ${plural(missed, 'change')} could not be made` : ''}`;
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'edit-images', [input], `${baseName(input.name)} (pictures edited).pdf`, bytes, `${detail}${relocked ? LOCKED : ''}`);
    }),
};

export const markUpOp = marksOp('mark-up', 'Mark up', 'marked up', 'Highlight or draw on the page first.', describeMarks);

const pageOf = markPage;

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
  async run(inputs, params, ctx) {
    const outcomes = await fillForm(inputs, params, ctx);
    const input = inputs[0];
    if (params.answers === undefined || input === undefined || outcomes[0]?.kind !== 'produced') return outcomes;
    // The answers, by field name, in a file the next run can read back.
    const json = JSON.stringify({ kind: 'Form answers', fields: params.answers }, null, 2);
    const count = Object.values(params.answers).filter((v) => v !== '' && v !== false).length;
    outcomes.push(
      await store(ctx, 'fill-form', [input], `${baseName(input.name)} answers.json`, new TextEncoder().encode(json), `${plural(count, 'answer')} saved: open the form here again and choose this file to fill it in one go`, 'other'),
    );
    return outcomes;
  },
};

function fillForm(inputs: readonly FoolscapFile[], params: FillFormParams, ctx: OpContext): Promise<Outcome[]> {
  return withOne(inputs, ctx, async (doc, input) => {
      if (Object.keys(params.values).length === 0 && !params.seal) return refused([input], 'Nothing was changed. Type your answers first.');
      const filled = Object.values(params.values).filter((v) => v !== '' && v !== false).length;
      const matched = doc.fillForm(params.values, params.seal);
      // Answers saved from another form fit nothing here; saying "5 answers" would be untrue.
      if (matched === 0 && !params.seal) return refused([input], 'None of these answers fit a box in this PDF. They may be from a different form.');
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      const sealed = params.seal ? ', sealed so the answers can no longer be changed' : ', still editable';
      return store(ctx, 'fill-form', [input], `${baseName(input.name)} (filled).pdf`, bytes, `${plural(filled, 'answer')}${sealed}${relocked ? LOCKED : ''}`);
    });
}
