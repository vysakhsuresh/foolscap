/**
 * Turns what a person types into page indices.
 *
 * People write page ranges the way they write them on paper - "1-3, 7, 12-" -
 * and they write them wrong: backwards ranges, spaces everywhere, a trailing
 * comma, a page past the end. All of that is ordinary input rather than an
 * error state, so this is forgiving by design and only refuses input with
 * nothing usable in it at all.
 *
 * ONE-BASED GOING IN, ZERO-BASED COMING OUT. Users count from one and PDF
 * libraries count from zero, and every off-by-one in an app like this comes
 * from that boundary being crossed in more than one place. It is crossed here
 * and nowhere else.
 *
 * Ported from the Android app's PageSelection.kt. Pure TypeScript, no DOM, no library,
 * so it runs in the op worker and under Node's unit tests alike.
 *
 * Ops import this module directly (`'../pdf/page-selection'`); `index.ts`
 * exports types only and stays that way on purpose.
 */

/**
 * @param spec what the user typed, e.g. "1-3, 7, 12-".
 * @param pageCount how many pages the document has.
 * @returns zero-based indices, ascending, no duplicates. Empty if nothing matched.
 */
export function parse(spec: string, pageCount: number): number[] {
  if (pageCount <= 0) return [];
  const selected = new Set<number>();
  for (const part of spec.split(',')) addPart(selected, part, pageCount);
  return [...selected].sort(ascending);
}

/**
 * Like `parse`, but keeps the parts apart: one group per comma-separated
 * part, in the order typed, each group ascending with no duplicates. Parts
 * that match nothing are dropped. "Split by ranges" needs this because each
 * range becomes its own output file, and "7, 1-3" should give the page-7 file
 * first, which a merged, sorted selection cannot say.
 */
export function rangesInOrder(spec: string, pageCount: number): number[][] {
  if (pageCount <= 0) return [];
  const groups: number[][] = [];
  for (const part of spec.split(',')) {
    const group = new Set<number>();
    addPart(group, part, pageCount);
    if (group.size > 0) groups.push([...group].sort(ascending));
  }
  return groups;
}

/** Every page. */
export function all(pageCount: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < pageCount; i++) indices.push(i);
  return indices;
}

/**
 * Groups pages into chunks of `size`, for "split every N pages". A final short
 * group is kept - a 10-page document split every 3 gives 3, 3, 3, 1.
 */
export function chunks(pageCount: number, size: number): number[][] {
  if (pageCount <= 0 || size <= 0) return [];
  const every = Math.floor(size);
  if (every <= 0) return [];
  const result: number[][] = [];
  const pages = all(pageCount);
  for (let start = 0; start < pages.length; start += every) {
    result.push(pages.slice(start, start + every));
  }
  return result;
}

/**
 * The inverse: which pages are NOT selected. Used by delete, which is
 * expressed as "keep everything else" so it goes through the same extract
 * path rather than its own.
 */
export function invert(selected: Iterable<number>, pageCount: number): number[] {
  const drop = new Set(selected);
  return all(pageCount).filter((i) => !drop.has(i));
}

/** Renders indices back as a spec a person would recognise, collapsing runs into ranges. */
export function describe(indices: readonly number[]): string {
  if (indices.length === 0) return '';
  const sorted = [...new Set(indices)].sort(ascending);
  const first = sorted[0];
  if (first === undefined) return '';

  const parts: string[] = [];
  let start = first;
  let previous = first;
  for (const value of sorted.slice(1)) {
    if (value === previous + 1) {
      previous = value;
    } else {
      parts.push(renderRun(start, previous));
      start = value;
      previous = value;
    }
  }
  parts.push(renderRun(start, previous));
  return parts.join(', ');
}

export const PageSelection = { parse, rangesInOrder, all, chunks, invert, describe } as const;

function renderRun(start: number, end: number): string {
  return start === end ? `${start + 1}` : `${start + 1}-${end + 1}`;
}

/** One comma-separated part, in every form people write it; parts that say nothing are ignored. */
function addPart(into: Set<number>, rawPart: string, pageCount: number): void {
  const part = rawPart.trim();
  if (part.length === 0) return;

  if (part.endsWith('-')) {
    // "12-" means twelve to the end, which is how people write "the rest".
    const from = toInt(part.slice(0, -1));
    if (from !== undefined) addRange(into, from, pageCount, pageCount);
  } else if (part.startsWith('-')) {
    // "-5" means the start up to five.
    const to = toInt(part.slice(1));
    if (to !== undefined) addRange(into, 1, to, pageCount);
  } else if (part.includes('-')) {
    const dash = part.indexOf('-');
    const from = toInt(part.slice(0, dash));
    const to = toInt(part.slice(dash + 1));
    // "9-3" is a backwards range. Treating it as 3-9 is what the user meant;
    // rejecting it would only make them retype it the other way round.
    if (from !== undefined && to !== undefined) {
      addRange(into, Math.min(from, to), Math.max(from, to), pageCount);
    }
  } else {
    const single = toInt(part);
    if (single !== undefined) addRange(into, single, single, pageCount);
  }
}

/** `from` and `to` are one-based and inclusive; out-of-range ends are clipped, not rejected. */
function addRange(into: Set<number>, from: number, to: number, pageCount: number): void {
  const first = Math.max(1, from);
  const last = Math.min(pageCount, to);
  for (let page = first; page <= last; page++) into.add(page - 1);
}

/** Kotlin's `toIntOrNull`: whole decimal integers only, with surrounding spaces allowed. */
function toInt(text: string): number | undefined {
  const trimmed = text.trim();
  return /^[+-]?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined;
}

function ascending(a: number, b: number): number {
  return a - b;
}
