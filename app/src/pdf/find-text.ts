/**
 * Finding words on a page by where they sit: the bridge from "every Aadhaar
 * number" or "the word Confidential" to the boxes on the page they occupy.
 *
 * pdf.js reports a page's text in pieces, often a word or a run of words, and
 * a number like "1234 5678 9012" may come in three. So pieces are joined into
 * lines first, the patterns run over each line, and every match is mapped
 * back to the part of each piece it covers. Widths inside a piece are shared
 * out by character count, which is exact for the fixed-width figures that
 * make up most of what people hide, and close enough for the rest.
 */
import type { Area, LayoutItem, PageLayout } from './types';

/** A kind of private detail people are asked to hide, Indian ones first. */
export type Pattern = 'aadhaar' | 'pan' | 'phone' | 'email' | 'card';

export const PATTERN_NAMES: Record<Pattern, string> = {
  aadhaar: 'Aadhaar numbers',
  pan: 'PAN numbers',
  phone: 'Phone numbers',
  email: 'Email addresses',
  card: 'Card numbers',
};

const REGEX: Record<Pattern, RegExp> = {
  // 12 digits, often in fours; never starting 0 or 1.
  aadhaar: /(?<![\d])[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/g,
  pan: /(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])/g,
  // Indian mobiles with or without +91 / 0, and landlines with an STD code.
  phone: /(?<![\d+])(?:(?:\+|00)91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|(?<![\d+])0\d{2,4}[\s-]\d{6,8}(?!\d)/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  card: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
};

/** True for a number a card scheme would accept: the Luhn check. */
function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Where `patterns` and the typed `words` match in `text`, as [start, end) ranges. */
export function matchRanges(text: string, patterns: readonly Pattern[], words: readonly string[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const pattern of patterns) {
    const re = new RegExp(REGEX[pattern].source, REGEX[pattern].flags);
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      if (pattern === 'card') {
        const digits = m[0].replace(/\D/g, '');
        if (digits.length < 13 || !luhn(digits)) continue;
      }
      out.push([m.index, m.index + m[0].length]);
    }
  }
  const lower = text.toLocaleLowerCase();
  for (const word of words) {
    const needle = word.trim().toLocaleLowerCase();
    if (needle.length === 0) continue;
    for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) out.push([at, at + needle.length]);
  }
  return out;
}

/** The words typed into a box: split on commas and new lines, so "salary, Ravi Kumar" is two. */
export function splitWords(typed: string): string[] {
  return typed
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

interface Placed {
  readonly item: LayoutItem;
  /** Where this piece starts in the joined line. */
  readonly start: number;
}

interface Measurer {
  font: string;
  measureText(text: string): { readonly width: number };
}

let measurer: Measurer | null | undefined;

/** A 2D context to measure text with, on the page or in a worker; null where there is none. */
function textMeasurer(): Measurer | null {
  if (measurer !== undefined) return measurer;
  measurer = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') measurer = new OffscreenCanvas(1, 1).getContext('2d');
    else if (typeof document !== 'undefined') measurer = document.createElement('canvas').getContext('2d');
  } catch {
    measurer = null;
  }
  return measurer;
}

const FAMILIES: Record<NonNullable<LayoutItem['family']>, string> = {
  sans: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", serif',
  mono: '"Courier New", Courier, "Liberation Mono", monospace',
};

/**
 * Where characters [from, to) of a piece sit, in points from the page's
 * left. pdf.js gives a piece's width, not each letter's, so the width is
 * shared out the way a face of the same kind would draw the letters: in
 * Helvetica "W" is three times "i", and sharing by count would leave the
 * first digits of "card 4567…" outside a box meant to hide them. Without a
 * canvas to measure on, by count.
 */
function span(item: LayoutItem, from: number, to: number): [number, number] {
  const ctx = textMeasurer();
  if (ctx !== null) {
    ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}100px ${FAMILIES[item.family ?? 'sans']}`;
    const whole = ctx.measureText(item.str).width;
    if (whole > 0) {
      const a = ctx.measureText(item.str.slice(0, from)).width / whole;
      const b = ctx.measureText(item.str.slice(0, to)).width / whole;
      return [item.x + item.width * a, item.x + item.width * b];
    }
  }
  const per = item.width / Math.max(1, item.str.length);
  return [item.x + per * from, item.x + per * to];
}

/** A page's pieces joined into lines, top to bottom, each with where every piece starts. */
export function linesOf(layout: PageLayout): Array<{ text: string; pieces: Placed[] }> {
  const items = layout.items.filter((i) => i.str.length > 0).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Array<typeof items> = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    const first = row?.[0];
    if (row && first && Math.abs(first.y - item.y) < Math.max(first.height, item.height) * 0.4) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = '';
    const pieces: Placed[] = [];
    let end = -Infinity;
    for (const item of row) {
      // A visible gap between two pieces is a space in the line.
      if (text.length > 0 && item.x - end > item.height * 0.15 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' ';
      pieces.push({ item, start: text.length });
      text += item.str;
      end = item.x + item.width;
    }
    return { text, pieces };
  });
}

/**
 * Every place on the page where a pattern or word appears, as areas in
 * fractions of the page (top-left origin), a little larger than the letters
 * so no edge of one survives.
 */
export function findOnPage(layout: PageLayout, page: number, patterns: readonly Pattern[], words: readonly string[]): Area[] {
  const areas: Area[] = [];
  if (layout.width <= 0 || layout.height <= 0) return areas;
  for (const line of linesOf(layout)) {
    for (const [s, e] of matchRanges(line.text, patterns, words)) {
      for (const { item, start } of line.pieces) {
        const from = Math.max(s, start);
        const to = Math.min(e, start + item.str.length);
        if (from >= to) continue;
        const [x, end] = span(item, from - start, to - start);
        const w = end - x;
        const top = item.y - item.height * 0.9;
        const h = item.height * 1.2;
        // Generous at the sides: a sliver of a digit left showing is a digit given away.
        const padX = item.height * 0.15;
        areas.push({
          page,
          x: Math.max(0, (x - padX) / layout.width),
          y: Math.max(0, top / layout.height),
          w: Math.min(1, (w + 2 * padX) / layout.width),
          h: Math.min(1, h / layout.height),
        });
      }
    }
  }
  return areas;
}

/** A word on a page and the box it sits in. */
export interface PlacedWord {
  readonly text: string;
  readonly area: Area;
}

/** Every word on the page, in reading order, each with its box (fractions of the page, top-left origin). */
export function wordsOf(layout: PageLayout, page: number): PlacedWord[] {
  const out: PlacedWord[] = [];
  if (layout.width <= 0 || layout.height <= 0) return out;
  for (const line of linesOf(layout)) {
    const re = /\S+/g;
    for (let m = re.exec(line.text); m !== null; m = re.exec(line.text)) {
      const s = m.index;
      const e = s + m[0].length;
      let x0 = Infinity;
      let x1 = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const { item, start } of line.pieces) {
        const from = Math.max(s, start);
        const to = Math.min(e, start + item.str.length);
        if (from >= to) continue;
        const [a, b] = span(item, from - start, to - start);
        x0 = Math.min(x0, a);
        x1 = Math.max(x1, b);
        top = Math.min(top, item.y - item.height * 0.85);
        bottom = Math.max(bottom, item.y + item.height * 0.25);
      }
      if (!Number.isFinite(x0)) continue;
      out.push({ text: m[0], area: { page, x: x0 / layout.width, y: top / layout.height, w: (x1 - x0) / layout.width, h: (bottom - top) / layout.height } });
    }
  }
  return out;
}

/**
 * The blanks a printed form leaves for answers: runs of underscores or dots
 * ("Name: ________") become text boxes, and empty boxes ("☐ Married",
 * "[ ] Yes") become tick boxes. Each is named after the words beside it, so
 * the form reads sensibly in any reader's list of fields.
 */
export function detectBlanks(layout: PageLayout, page: number): Array<{ kind: 'text' | 'check'; name: string; area: Area }> {
  const out: Array<{ kind: 'text' | 'check'; name: string; area: Area }> = [];
  if (layout.width <= 0 || layout.height <= 0) return out;
  const boxOf = (line: ReturnType<typeof linesOf>[number], s: number, e: number) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let baseline = 0;
    let size = 0;
    for (const { item, start } of line.pieces) {
      const from = Math.max(s, start);
      const to = Math.min(e, start + item.str.length);
      if (from >= to) continue;
      const per = item.width / Math.max(1, item.str.length);
      x0 = Math.min(x0, item.x + per * (from - start));
      x1 = Math.max(x1, item.x + per * (to - start));
      baseline = item.y;
      size = Math.max(size, item.height);
    }
    return Number.isFinite(x0) ? { x0, x1, baseline, size } : null;
  };
  const label = (text: string) =>
    text
      .replace(/[_.…:\-–—\s]+$/g, '')
      .replace(/^[_.…:\-–—\s]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  for (const line of linesOf(layout)) {
    const blank = /_{4,}|\.{6,}|…{3,}/g;
    let previousEnd = 0;
    for (let m = blank.exec(line.text); m !== null; m = blank.exec(line.text)) {
      const box = boxOf(line, m.index, m.index + m[0].length);
      if (box) {
        const top = box.baseline - box.size * 1.05;
        const bottom = box.baseline + box.size * 0.2;
        const before = label(line.text.slice(previousEnd, m.index)) || label(line.text.slice(m.index + m[0].length).split(/_{4,}|\.{6,}/)[0] ?? '');
        out.push({
          kind: 'text',
          name: before || `Field ${out.length + 1}`,
          area: { page, x: box.x0 / layout.width, y: Math.max(0, top / layout.height), w: (box.x1 - box.x0) / layout.width, h: (bottom - top) / layout.height },
        });
      }
      previousEnd = m.index + m[0].length;
    }
    const tick = /[☐□❏]|\[\s?\]/g;
    for (let m = tick.exec(line.text); m !== null; m = tick.exec(line.text)) {
      const box = boxOf(line, m.index, m.index + m[0].length);
      if (!box) continue;
      const side = Math.max(box.x1 - box.x0, box.size * 0.8);
      const after = label(line.text.slice(m.index + m[0].length).split(/[☐□❏]|\[\s?\]/)[0] ?? '');
      out.push({
        kind: 'check',
        name: after || `Tick ${out.length + 1}`,
        area: { page, x: box.x0 / layout.width, y: Math.max(0, (box.baseline - side * 0.9) / layout.height), w: side / layout.width, h: side / layout.height },
      });
    }
  }
  return out;
}

/** One run of words on a line with no column-sized gap in it: a table cell, or a whole line of prose. */
export interface TextSegment {
  readonly text: string;
  /** In points from the page's left; `baseline` from its top. */
  readonly x0: number;
  readonly x1: number;
  readonly baseline: number;
  readonly size: number;
  /** The look of its first piece, so a changed line can be written again in the same weight and family. */
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly family?: 'sans' | 'serif' | 'mono';
  /** The real name of the font every piece of it is drawn in; absent when it mixes fonts. */
  readonly font?: string;
  /**
   * How far the words may run, in points from the page's left: from the cell
   * border or the neighbouring words on its left to those on its right, or the
   * page's margins. A longer replacement is fitted inside it.
   */
  readonly room: { readonly left: number; readonly right: number };
}

/** Whether a drawn upright line stands between x0 and x1 at the height of words on `baseline`. */
function ruleBetween(rules: PageLayout['rules'], x0: number, x1: number, baseline: number, size: number): boolean {
  const mid = baseline - size * 0.35;
  return (rules ?? []).some((r) => r.x > x0 && r.x < x1 && r.top <= mid && r.bottom >= mid);
}

/**
 * A page's lines cut at the wide gaps between columns, and at the lines a
 * table draws between its cells, so a statement row is its date,
 * description, reference and amounts, each on its own, and a line of prose
 * stays whole.
 */
export function segmentsOf(layout: PageLayout): TextSegment[] {
  type Open = { text: string; x0: number; x1: number; baseline: number; size: number; bold?: boolean; italic?: boolean; family?: 'sans' | 'serif' | 'mono'; font: string | undefined };
  const rules = layout.rules ?? [];
  // The page's margin, as its text shows it: the nearest any words come to the left edge, and as much on the right.
  const margin = Math.max(12, Math.min(layout.width * 0.1, ...layout.items.map((i) => i.x)));
  const out: TextSegment[] = [];
  for (const line of linesOf(layout)) {
    const row: Open[] = [];
    let current: Open | null = null;
    for (const { item } of line.pieces) {
      const size = Math.max(item.height, 1);
      const gap = current ? item.x - current.x1 : Infinity;
      if (current && gap <= Math.max(current.size, size) * 0.9 && !ruleBetween(rules, current.x1 - 0.5, item.x + 0.5, item.y, size)) {
        if (gap > size * 0.15 && !current.text.endsWith(' ') && !item.str.startsWith(' ')) current.text += ' ';
        current.text += item.str;
        current.x1 = Math.max(current.x1, item.x + item.width);
        current.size = Math.max(current.size, size);
        if (current.font !== item.fontName) current.font = undefined;
        continue;
      }
      if (current && current.text.trim() !== '') row.push(current);
      current = {
        text: item.str,
        x0: item.x,
        x1: item.x + item.width,
        baseline: item.y,
        size,
        ...(item.bold ? { bold: true } : {}),
        ...(item.italic ? { italic: true } : {}),
        ...(item.family && item.family !== 'sans' ? { family: item.family } : {}),
        font: item.fontName || undefined,
      };
    }
    if (current && current.text.trim() !== '') row.push(current);
    row.forEach((seg, k) => {
      const mid = seg.baseline - seg.size * 0.35;
      const across = rules.filter((r) => r.top <= mid && r.bottom >= mid);
      const pad = seg.size * 0.25;
      // The nearest border or neighbour on each side; the page's margins when there is neither.
      let left = Math.min(seg.x0, margin);
      let right = Math.max(seg.x1, layout.width - margin);
      for (const r of across) {
        if (r.x <= seg.x0 + 0.5) left = Math.max(left, r.x + pad);
        if (r.x >= seg.x1 - 0.5) right = Math.min(right, r.x - pad);
      }
      const before = row[k - 1];
      const after = row[k + 1];
      if (before) left = Math.max(left, before.x1 + pad * 2);
      if (after) right = Math.min(right, after.x0 - pad * 2);
      const { font, ...rest } = seg;
      out.push({ ...rest, text: seg.text.trim(), ...(font ? { font } : {}), room: { left: Math.min(left, seg.x0), right: Math.max(right, seg.x1) } });
    });
  }
  return out;
}
