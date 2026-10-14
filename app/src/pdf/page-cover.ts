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
}

export interface PageCover {
  /** The share of the page the largest picture covers, 0 to 1. */
  readonly pictureCover: number;
  /** The share of the page's text drawing nobody sees: invisible, or under a picture painted later. 0 to 1. */
  readonly hiddenText: number;
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
    } else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) picture(k);
  }
  const hidden = shows.filter((s) => s.invisible || s.at < lastBigPicture).length;
  return { pictureCover: biggest, hiddenText: shows.length === 0 ? 0 : hidden / shows.length };
}
