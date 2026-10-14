/**
 * Putting /ActualText back into what pdf.js reads off a page.
 *
 * A Malayalam or Hindi word is drawn with shapes that are not letters one for
 * one: a conjunct is one shape, a vowel sign is drawn before the consonant it
 * follows, the "ra" of ്ര is a mark in front of the letter. Chrome,
 * LibreOffice and Word wrap each such cluster in a marked-content section
 * whose /ActualText says what it reads as. pdf.js reads the shapes and not
 * the /ActualText, so "ഗ്രാമ" came out as "ഗാമ" and "കേരള" as "േകരള", in
 * Extract text, every converter and Compare.
 *
 * pdf.js does report where each section begins and ends (includeMarkedContent);
 * the surgeon reads the same sections, in the same order, with their
 * /ActualText (PdfDoc.markedSections). Lined up, the text inside a section
 * that has one is replaced by it. When the two lists do not line up, nothing
 * is changed: the glyphs are what they were.
 */
import type { MarkedSection } from './types';

/** What pdf.js puts in a text content's items: words, and the edges of marked content. */
export type ContentItem<T> = T | { readonly type: string; readonly tag?: string | null };

interface Word {
  readonly str: string;
  readonly width: number;
  readonly transform: readonly number[];
  readonly hasEOL?: boolean;
}

const isWord = <T extends Word>(item: ContentItem<T>): item is T => 'str' in item;
const isBegin = (item: { readonly type: string }) => item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps';

/** Whether pdf.js saw any marked content with properties on the page: only then can there be /ActualText to look for. */
export function hasMarkedProps<T extends Word>(items: ReadonlyArray<ContentItem<T>>): boolean {
  return items.some((item) => !isWord(item) && item.type === 'beginMarkedContentProps');
}

/**
 * The page's words with each section's /ActualText in place of its glyphs,
 * or null when pdf.js's sections and the file's do not line up.
 */
export function withActualText<T extends Word>(items: ReadonlyArray<ContentItem<T>>, sections: readonly MarkedSection[]): T[] | null {
  const begins = items.filter((item): item is { readonly type: string; readonly tag?: string | null } => !isWord(item) && isBegin(item));
  if (begins.length !== sections.length) return null;
  for (const [k, begin] of begins.entries()) {
    const tag = begin.tag;
    if (typeof tag === 'string' && tag !== sections[k]!.tag) return null;
  }
  if (!sections.some((s) => s.actualText !== undefined)) return items.filter(isWord);

  const out: T[] = [];
  /** The open sections, innermost last, by their place in `sections`. */
  const open: number[] = [];
  let next = 0;
  let group: { section: number; words: T[] } | null = null;
  const flush = () => {
    if (group === null) return;
    const { section, words } = group;
    group = null;
    const text = sections[section]!.actualText ?? '';
    // pdf.js puts what it sees before a section's first glyph (the space in the
    // gap before it, the end of the line above) inside the section, with that
    // glyph: it belongs before the text, as it was.
    const lead = words.findIndex((w) => w.str.trim() !== '');
    if (lead < 0) {
      out.push(...words.filter((w) => w.hasEOL === true || (text !== '' && w.str !== '')));
      return;
    }
    out.push(...words.slice(0, lead));
    const shapes = words.slice(lead);
    const first = shapes[0]!;
    const before = /^\s/.test(first.str);
    const after = /\s$/.test(shapes[shapes.length - 1]!.str);
    if (text === '') return;
    // One word where the shapes were: from the first one's start to the last one's end.
    const x0 = first.transform[4] ?? 0;
    const across = Math.max(...shapes.map((w) => (w.transform[4] ?? 0) + w.width)) - x0;
    const sum = shapes.reduce((n, w) => n + w.width, 0);
    const level = shapes.every((w) => Math.abs((w.transform[5] ?? 0) - (first.transform[5] ?? 0)) < 0.5 && Math.abs(w.transform[1] ?? 0) < 1e-6);
    out.push({ ...first, str: `${before ? ' ' : ''}${text}${after ? ' ' : ''}`, width: level && across > 0 ? across : sum, hasEOL: shapes.some((w) => w.hasEOL === true) });
  };
  for (const item of items) {
    if (!isWord(item)) {
      if (isBegin(item)) open.push(next++);
      else if (item.type === 'endMarkedContent') open.pop();
      continue;
    }
    // The outermost open section with /ActualText speaks for everything inside it.
    const speaker = open.find((k) => sections[k]!.actualText !== undefined);
    if (speaker === undefined) {
      flush();
      out.push(item);
      continue;
    }
    if (group === null || group.section !== speaker) {
      flush();
      group = { section: speaker, words: [] };
    }
    group.words.push(item);
  }
  flush();
  return out;
}
