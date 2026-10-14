/**
 * Edit text on a scan: the page is a picture, so its words come from the OCR
 * reader, and a change touches only the words that changed — the rest of the
 * line stays the original picture of the paper.
 *
 * Everything here is in fractions of the page: x and sizes of its width,
 * baselines of its height.
 */
import type { OcrWord } from '../ops/op';

export interface ScanWord {
  readonly text: string;
  readonly x0: number;
  readonly x1: number;
  /** Printed heavier than the page's usual (boldWords). */
  readonly bold?: boolean;
}

/** An upright line printed on the paper (a table's column border), found in the picture: fractions of the page. */
export interface ScanRule {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * The upright lines printed on a scanned page: columns of dark pixels
 * running unbroken (a pixel or two of gap allowed) for longer than any letter
 * stands. Neighbouring columns are one line. `minRun` is in pixels.
 */
export function findRules(image: { readonly data: ArrayLike<number>; readonly width: number; readonly height: number }, minRun: number): ScanRule[] {
  const { data, width, height } = image;
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (data[i] ?? 255) + (data[i + 1] ?? 255) + (data[i + 2] ?? 255) < 3 * 140;
  };
  const runs: Array<{ x: number; y0: number; y1: number }> = [];
  for (let x = 0; x < width; x++) {
    let start = -1;
    let gap = 0;
    for (let y = 0; y <= height; y++) {
      if (y < height && dark(x, y)) {
        if (start < 0) start = y;
        gap = 0;
      } else if (start >= 0) {
        if (y < height && ++gap <= 2) continue;
        const end = y - gap;
        if (end - start >= minRun) runs.push({ x, y0: start, y1: end });
        start = -1;
        gap = 0;
      }
    }
  }
  // Runs side by side and overlapping are one thick line.
  const rules: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
  for (const run of runs) {
    const same = rules.find((r) => run.x - r.x1 <= 1 && run.y0 < r.y1 && run.y1 > r.y0);
    if (same) {
      same.x1 = run.x;
      same.y0 = Math.min(same.y0, run.y0);
      same.y1 = Math.max(same.y1, run.y1);
    } else rules.push({ x0: run.x, x1: run.x, y0: run.y0, y1: run.y1 });
  }
  // A wide dark block (a photo, a logo, a stamp) is not a line.
  return rules.filter((r) => r.x1 - r.x0 <= Math.max(3, width * 0.004)).map((r) => ({ x: (r.x0 + r.x1 + 1) / 2 / width, top: r.y0 / height, bottom: r.y1 / height }));
}

export interface ScanLine {
  readonly text: string;
  readonly x0: number;
  readonly x1: number;
  /** Of the page's height. */
  readonly baseline: number;
  /** The words' em, of the page's width. */
  readonly size: number;
  readonly room: { readonly left: number; readonly right: number };
  readonly words: readonly ScanWord[];
}

/** What a changed scan line repaints, and what it writes where. */
export interface ScanPlan {
  /** The span painted over in the paper's colour. */
  readonly paint: { readonly x0: number; readonly x1: number };
  /** Where the new words start, and how far they may run. */
  readonly start: number;
  readonly right: number;
  readonly text: string;
  /** Whether the words it replaces were bold, so the new ones are too. */
  readonly bold: boolean;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** A word's em and baseline from its box: how tall its letters stand depends on which letters it has. */
function measureWord(text: string, top: number, height: number): { em: number; baseline: number } {
  const tall = /[A-Z0-9bdfhklti!?#$%&@/\\|()[\]{}'"]/.test(text);
  const deep = /[gjpqy,;()[\]{}|@$]/.test(text);
  const em = height / ((tall ? 0.73 : 0.53) + (deep ? 0.21 : 0));
  return { em, baseline: top + height - (deep ? 0.21 * em : 0) };
}

/**
 * The reader's words as lines, cut where a gap is wider than a column's,
 * each with its size, baseline and the room it may run in. `aspect` is the
 * page's height over its width.
 */
export function scanLines(words: readonly OcrWord[], aspect: number, rules: readonly ScanRule[] = []): ScanLine[] {
  /** Whether a printed line stands between x0 and x1 at the height of words on `baseline` (of the width). */
  const ruled = (x0: number, x1: number, baseline: number, em: number) => {
    const mid = (baseline - em * 0.35) / aspect;
    return rules.some((r) => r.x > x0 && r.x < x1 && r.top <= mid && r.bottom >= mid);
  };
  // A printed column line is often read as a "|" of its own, or stuck to a word's edge: it is a border, not a word.
  const crossed = (x0: number, x1: number, top: number, bottom: number) => rules.some((r) => r.x >= x0 && r.x <= x1 && r.top <= bottom && r.bottom >= top);
  const placed = words
    .map((w) => {
      const lead = /^[|¦[\]]+/.exec(w.text)?.[0].length ?? 0;
      const trail = /[|¦[\]]+$/.exec(w.text)?.[0].length ?? 0;
      const text = w.text.trim();
      if (lead === 0 && trail === 0) return { ...w, text };
      const per = w.w / Math.max(1, w.text.length);
      const kept = w.text.slice(lead, w.text.length - trail).trim();
      return { ...w, text: kept, x: w.x + per * lead, w: Math.max(0, w.w - per * (lead + trail)) };
    })
    .filter((w) => w.text !== '' && w.w > 0 && w.h > 0)
    // A lone stroke on a printed line ("l", "I", "1", "!") is the line, read as a letter.
    .filter((w) => !(/^[Il1!]$/.test(w.text) && crossed(w.x, w.x + w.w, w.y, w.y + w.h)))
    .map((w) => {
      const { em, baseline } = measureWord(w.text, w.y * aspect, w.h * aspect);
      return { text: w.text.trim(), x0: w.x, x1: w.x + w.w, em, baseline };
    })
    .sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0);
  const rows: Array<typeof placed> = [];
  for (const word of placed) {
    const row = rows.find((r) => {
      const base = median(r.map((w) => w.baseline));
      const em = median(r.map((w) => w.em));
      return Math.abs(base - word.baseline) < Math.min(em, word.em) * 0.4;
    });
    if (row) row.push(word);
    else rows.push([word]);
  }
  const margin = Math.max(0.02, Math.min(0.1, ...placed.map((w) => w.x0)));
  const out: ScanLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x0 - b.x0);
    const em = median(row.map((w) => w.em));
    // A gap wider than a column's (more than about four spaces) starts a new piece.
    const pieces: Array<typeof row> = [];
    for (const word of row) {
      const last = pieces[pieces.length - 1];
      const end = last?.[last.length - 1];
      if (last && end && word.x0 - end.x1 <= em * 1.2 && !ruled(end.x1, word.x0, word.baseline, em)) last.push(word);
      else pieces.push([word]);
    }
    pieces.forEach((piece, k) => {
      const first = piece[0];
      const final = piece[piece.length - 1];
      if (!first || !final) return;
      const size = median(piece.map((w) => w.em));
      const before = pieces[k - 1]?.[pieces[k - 1]!.length - 1];
      const after = pieces[k + 1]?.[0];
      // The cell's own borders bound it too.
      const mid = (median(piece.map((w) => w.baseline)) - size * 0.35) / aspect;
      const across = rules.filter((r) => r.top <= mid && r.bottom >= mid);
      const leftRule = Math.max(-1, ...across.filter((r) => r.x <= first.x0).map((r) => r.x));
      const rightRule = Math.min(2, ...across.filter((r) => r.x >= final.x1).map((r) => r.x));
      let left = before ? before.x1 + size * 0.5 : Math.min(first.x0, margin);
      let right = after ? after.x0 - size * 0.5 : Math.max(final.x1, 1 - margin);
      if (leftRule >= 0) left = Math.max(left, leftRule + size * 0.2);
      if (rightRule <= 1) right = Math.min(right, rightRule - size * 0.2);
      out.push({
        text: piece.map((w) => w.text).join(' '),
        x0: first.x0,
        x1: final.x1,
        baseline: median(piece.map((w) => w.baseline)) / aspect,
        size,
        room: { left: Math.min(left, first.x0), right: Math.max(right, final.x1) },
        words: piece.map((w) => ({ text: w.text, x0: w.x0, x1: w.x1 })),
      });
    });
  }
  return out.sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0);
}

/**
 * The least of a scanned line to repaint for `text`: the words before and
 * after the change keep their original picture. When the new words would
 * run into the words after them, everything from the change to the line's
 * end is written again instead. Null when nothing changed.
 * `measure` gives a run of words' width at the line's size.
 */
export function planScanEdit(line: Pick<ScanLine, 'words' | 'room' | 'size'>, text: string, measure: (words: string) => number): ScanPlan | null {
  const old = line.words.map((w) => w.text);
  const fresh = text.trim().split(/\s+/).filter((w) => w !== '');
  let p = 0;
  while (p < old.length && p < fresh.length && old[p] === fresh[p]) p++;
  let s = 0;
  while (s < old.length - p && s < fresh.length - p && old[old.length - 1 - s] === fresh[fresh.length - 1 - s]) s++;
  if (p === old.length && p === fresh.length) return null;
  const space = line.size * 0.28;
  const lastWord = line.words[line.words.length - 1];
  const lineEnd = lastWord?.x1 ?? line.room.right;
  // An insertion or deletion moves the words after it: they are written again too.
  if (old.length - s === p || fresh.length - s === p) s = 0;
  const middle = fresh.slice(p, fresh.length - s).join(' ');
  const firstOld = line.words[p];
  /** The weight of the words being replaced, by most of them; an insertion takes its neighbour's. */
  const boldOf = (replaced: readonly ScanWord[]) => {
    const pool = replaced.length > 0 ? replaced : [line.words[p - 1] ?? line.words[p]].filter((w): w is ScanWord => w !== undefined);
    return pool.filter((w) => w.bold === true).length * 2 > pool.length;
  };
  const start = firstOld ? firstOld.x0 : (line.words[p - 1]?.x1 ?? line.room.left) + space;
  if (s > 0) {
    const nextKept = line.words[old.length - s];
    const lastChanged = line.words[old.length - s - 1];
    const right = (nextKept?.x0 ?? line.room.right) - space;
    // Fits, squeezed a little at most: only the changed words are touched. A short tail is
    // moved up instead when the new words are much shorter, so no hole is left in the line.
    const width = measure(middle);
    const hole = right - start - width;
    if (lastChanged && width * 0.85 <= right - start && !(hole > line.size * 1.2 && s <= 3)) return { paint: { x0: start, x1: lastChanged.x1 }, start, right, text: middle, bold: boldOf(line.words.slice(p, old.length - s)) };
  }
  const tail = fresh.slice(p).join(' ');
  return { paint: { x0: start, x1: Math.max(start, lineEnd) }, start, right: line.room.right, text: tail, bold: boldOf(line.words.slice(p, old.length - s)) };
}

/** A PNG's width and height, from its header. */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  if (png.length < 24) return null;
  const view = new DataView(png.buffer, png.byteOffset);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Which words are bold, by how much ink they lay down against the page's
 * usual: a scan has no font to ask. Each box is a word's, from its top of
 * capitals to its baseline, in fractions of the page.
 */
export function boldWords(image: { readonly data: ArrayLike<number>; readonly width: number; readonly height: number }, boxes: ReadonlyArray<{ x0: number; x1: number; top: number; bottom: number }>): boolean[] {
  const { data, width, height } = image;
  const share = (b: { x0: number; x1: number; top: number; bottom: number }) => {
    let ink = 0;
    let all = 0;
    const x0 = Math.max(0, Math.floor(b.x0 * width));
    const x1 = Math.min(width, Math.ceil(b.x1 * width));
    const y0 = Math.max(0, Math.floor(b.top * height));
    const y1 = Math.min(height, Math.ceil(b.bottom * height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        if ((data[i] ?? 255) + (data[i + 1] ?? 255) + (data[i + 2] ?? 255) < 3 * 128) ink++;
        all++;
      }
    }
    return all === 0 ? 0 : ink / all;
  };
  const shares = boxes.map(share);
  const usual = median(shares.filter((v) => v > 0));
  return shares.map((v) => usual > 0 && v > usual * 1.3);
}
