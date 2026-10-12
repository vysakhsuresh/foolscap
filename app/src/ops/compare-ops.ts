/**
 * Compare: what changed between two versions of a document. The newer one
 * comes back marked: words that are new are highlighted, and where words
 * were taken out a comment says what they were. Nothing else on its pages
 * changes, so it can be read and sent as it is.
 */
import { wordsOf, type PlacedWord } from '../pdf/find-text';
import type { Area, Mark } from '../pdf';
import { baseName, failed, passwordFor, plural, readInput, refused, saveKeepingLock, store } from './common';
import { diffWords } from './diff';
import { checkCancelled, type Op, type OpContext, type Outcome } from './op';
import { openView } from './render-ops';
import type { FoolscapFile } from '../files/types';

const ADDED: readonly [number, number, number] = [0.45, 0.92, 0.45];
const NOTE: readonly [number, number, number] = [0.85, 0.15, 0.15];

async function wordsIn(ctx: OpContext, input: FoolscapFile, label: string): Promise<{ words: PlacedWord[]; pages: number }> {
  const view = await openView(ctx, input);
  try {
    const words: PlacedWord[] = [];
    for (let i = 0; i < view.pageCount; i++) {
      checkCancelled(ctx.signal);
      ctx.progress({ done: i, total: view.pageCount, label: `Reading page ${i + 1} of the ${label} file` });
      words.push(...wordsOf(await view.layout(i), i));
    }
    return { words, pages: view.pageCount };
  } finally {
    await view.close();
  }
}

/** Neighbouring words on one line, merged into one box, so a new sentence is one highlight, not twelve. */
function merge(areas: readonly Area[]): Area[] {
  const out: Area[] = [];
  for (const a of areas) {
    const last = out[out.length - 1];
    if (last && last.page === a.page && Math.abs(last.y - a.y) < a.h * 0.5 && a.x - (last.x + last.w) < a.h * 1.5 && a.x >= last.x) {
      out[out.length - 1] = { ...last, w: a.x + a.w - last.x, h: Math.max(last.h, a.h) };
    } else {
      out.push(a);
    }
  }
  return out;
}

export const compareOp: Op<Record<string, never>> = {
  tool: 'compare',
  arity: { kind: 'together', min: 2 },
  engine: true,
  title: () => 'Compare',
  async run(inputs, _params, ctx) {
    const [older, newer] = inputs;
    if (older === undefined || newer === undefined || inputs.length !== 2) return [refused(inputs, 'Add exactly two PDFs: the older version first, then the newer one.')];
    let a: { words: PlacedWord[]; pages: number };
    let b: { words: PlacedWord[]; pages: number };
    try {
      a = await wordsIn(ctx, older, 'first');
      b = await wordsIn(ctx, newer, 'second');
    } catch (error) {
      return [failed(error, inputs)];
    }
    if (a.words.length === 0 || b.words.length === 0) {
      return [refused(inputs, 'One of these files has no words to compare, only pictures of them. Run Make searchable on it first.')];
    }
    ctx.progress({ done: 0, total: 0, label: 'Comparing the words…' });
    const changes = diffWords(
      a.words.map((w) => w.text),
      b.words.map((w) => w.text),
    );
    const added: Area[] = [];
    const notes: Array<{ at: Area; text: string }> = [];
    let removed = 0;
    let pending: string[] = [];
    let lastB: PlacedWord | undefined;
    const flush = (next: PlacedWord | undefined) => {
      if (pending.length === 0) return;
      // The note sits where the words used to be: just before the word that now follows them.
      const anchor = next ?? lastB ?? b.words[b.words.length - 1]!;
      const text = pending.join(' ');
      notes.push({ at: anchor.area, text: `Removed: ${text.length > 600 ? `${text.slice(0, 600)}…` : text}` });
      pending = [];
    };
    for (const change of changes) {
      if (change.kind === 'removed') {
        pending.push(a.words[change.a]!.text);
        removed++;
        continue;
      }
      const word = b.words[change.b]!;
      flush(word);
      if (change.kind === 'added') added.push(word.area);
      lastB = word;
    }
    flush(undefined);
    if (added.length === 0 && removed === 0) {
      return [{ kind: 'skipped', inputIds: inputs.map((i) => i.id), reason: 'The words in these two files are the same. Any difference is in pictures or layout, which this compares by words only.' }];
    }
    const marks: Mark[] = [
      ...merge(added).map((area): Mark => ({ kind: 'highlight', area, color: ADDED })),
      ...notes.map(({ at, text }): Mark => ({ kind: 'note', area: { page: at.page, x: Math.max(0, at.x - 0.03), y: at.y, w: 0.03, h: Math.max(0.01, at.h) }, text, color: NOTE })),
    ];
    let doc;
    try {
      doc = await ctx.surgeon.open(await readInput(ctx, newer), passwordFor(ctx, newer));
    } catch (error) {
      return [failed(error, [newer])];
    }
    try {
      await doc.drawMarks(marks);
      const { bytes } = await saveKeepingLock(ctx, doc, newer);
      const pages = new Set([...added.map((x) => x.page), ...notes.map((n) => n.at.page)]).size;
      const detail = `${plural(added.length, 'word')} added and ${plural(removed, 'word')} taken out, on ${plural(pages, 'page')} of the newer file: new words in green, a comment where words went`;
      return [await store(ctx, 'compare', inputs, `${baseName(newer.name)} (compared).pdf`, bytes, detail)] as Outcome[];
    } catch (error) {
      return [failed(error, inputs)];
    } finally {
      doc.close();
    }
  },
};
