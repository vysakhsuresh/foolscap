/**
 * Whether a page is a scan: how much of it one picture covers, and how much
 * of its text nobody can see. A scanner's own reader (OmniPage, Adobe Scan,
 * a phone app) lays its guess at the words under or behind the photo of the
 * page, invisibly, so the file can be searched. Those words are often wrong
 * — a barcode read as "1111111", Hindi read as Latin letters — and must
 * never come out as if they were the page's visible text.
 *
 * Read from pdf.js's list of drawing operations, so it works the same on
 * every file: text drawn in render mode 3 or 7 is invisible, and text drawn
 * before a picture that covers most of the page is hidden under it.
 */
import { multiply, unitBox, type Matrix } from './content-stream';

/** The pdf.js operation codes this reads, passed in so it can be tested without pdf.js. */
export interface CoverOps {
  readonly save: number;
  readonly restore: number;
  readonly transform: number;
  readonly setTextRenderingMode: number;
  readonly showText: number;
  readonly showSpacedText: number;
  readonly nextLineShowText: number;
  readonly nextLineSetSpacingShowText: number;
  readonly paintImageXObject: number;
  readonly paintInlineImageXObject: number;
  readonly paintImageMaskXObject: number;
  readonly paintFormXObjectBegin: number;
  readonly paintFormXObjectEnd: number;
  readonly beginAnnotation: number;
  /** Optional, so a test about pictures need not name it: without it no rules are read. */
  readonly constructPath?: number;
}

/** A vertical line drawn on the page (a table's column border), in the page's own space: x, and the y it runs between. */
export type Rule = readonly [x: number, y0: number, y1: number];

export interface PageCover {
  /** The share of the page the largest picture covers, 0 to 1. */
  readonly pictureCover: number;
  /** The share of the page's text drawing nobody sees: invisible, or under a picture painted later. 0 to 1. */
  readonly hiddenText: number;
  /** The vertical lines drawn on the page, longer than a few points: where a table's cells end. */
  readonly rules: readonly Rule[];
}

/** A picture this much of the page or more is the page itself: a scan or a photo of paper. */
export const SCAN_COVER = 0.8;

export function pageCover(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: CoverOps, pageBox: readonly [number, number, number, number]): PageCover {
  const [px0, py0, px1, py1] = pageBox;
  const pageArea = Math.max(1, Math.abs(px1 - px0) * Math.abs(py1 - py0));
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let mode = 0;
  const stack: Array<{ ctm: Matrix; mode: number }> = [];
  const shows: Array<{ at: number; invisible: boolean }> = [];
  let biggest = 0;
  let lastBigPicture = -1;
  const rules: Rule[] = [];
  const point = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  /** A straight run from a to b, kept when it stands upright on the page. */
  const segment = (a: [number, number], b: [number, number]) => {
    if (Math.abs(a[0] - b[0]) <= 0.75 && Math.abs(a[1] - b[1]) >= 4) rules.push([(a[0] + b[0]) / 2, Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
  };
  /**
   * pdf.js's path data: a code, then its numbers (moveTo 0 x y, lineTo 1 x y,
   * curveTo 2 six, quadraticCurveTo 3 four, closePath 4). Upright straight runs
   * are rules; so is a filled sliver of a rectangle, which is how many programs
   * draw a thin line.
   */
  const path = (data: ArrayLike<number>) => {
    let start: [number, number] | null = null;
    let at: [number, number] | null = null;
    let shape: Array<[number, number]> = [];
    const close = () => {
      if (shape.length >= 4) {
        const xs = shape.map((p) => p[0]);
        const ys = shape.map((p) => p[1]);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        if (w <= 2.5 && h >= 4 && w > 0.75) rules.push([(Math.max(...xs) + Math.min(...xs)) / 2, Math.min(...ys), Math.max(...ys)]);
      }
      shape = [];
    };
    for (let i = 0; i < data.length; ) {
      const code = data[i++];
      if (code === 0) {
        close();
        start = at = point(data[i] ?? 0, data[i + 1] ?? 0);
        shape.push(at);
        i += 2;
      } else if (code === 1) {
        const next = point(data[i] ?? 0, data[i + 1] ?? 0);
        if (at) segment(at, next);
        at = next;
        shape.push(at);
        i += 2;
      } else if (code === 2) {
        at = point(data[i + 4] ?? 0, data[i + 5] ?? 0);
        shape = [];
        i += 6;
      } else if (code === 3) {
        at = point(data[i + 2] ?? 0, data[i + 3] ?? 0);
        shape = [];
        i += 4;
      } else if (code === 4) {
        if (at && start) segment(at, start);
        close();
        at = start;
      } else break;
    }
    close();
  };
  const picture = (at: number) => {
    const [x0, y0, x1, y1] = unitBox(ctm);
    // Only the part on the page counts.
    const w = Math.max(0, Math.min(x1, Math.max(px0, px1)) - Math.max(x0, Math.min(px0, px1)));
    const h = Math.max(0, Math.min(y1, Math.max(py0, py1)) - Math.max(y0, Math.min(py0, py1)));
    const share = Math.min(1, (w * h) / pageArea);
    biggest = Math.max(biggest, share);
    if (share >= SCAN_COVER) lastBigPicture = at;
  };
  for (let k = 0; k < fnArray.length; k++) {
    const fn = fnArray[k];
    const args = argsArray[k] as unknown[] | null | undefined;
    if (fn === ops.beginAnnotation) break;
    if (fn === ops.save) stack.push({ ctm, mode });
    else if (fn === ops.restore) {
      const top = stack.pop();
      if (top) ({ ctm, mode } = top);
    } else if (fn === ops.transform && args && args.length >= 6) ctm = multiply(args.slice(0, 6) as unknown as Matrix, ctm);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push({ ctm, mode });
      const m = args?.[0];
      if (Array.isArray(m) && m.length === 6) ctm = multiply(m as unknown as Matrix, ctm);
    } else if (fn === ops.paintFormXObjectEnd) {
      const top = stack.pop();
      if (top) ({ ctm, mode } = top);
    } else if (fn === ops.setTextRenderingMode && typeof args?.[0] === 'number') mode = args[0];
    else if (fn === ops.showText || fn === ops.showSpacedText || fn === ops.nextLineShowText || fn === ops.nextLineSetSpacingShowText) {
      // 3 draws nothing; 7 only clips.
      shows.push({ at: k, invisible: mode === 3 || mode === 7 });
    } else if (fn === ops.constructPath && ops.constructPath !== undefined) {
      const data = (args?.[1] as unknown[] | undefined)?.[0];
      if (data !== null && typeof data === 'object' && 'length' in data) path(data as ArrayLike<number>);
    } else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) picture(k);
  }
  const hidden = shows.filter((s) => s.invisible || s.at < lastBigPicture).length;
  return { pictureCover: biggest, hiddenText: shows.length === 0 ? 0 : hidden / shows.length, rules };
}
