/**
 * The arithmetic behind Scan, kept free of the DOM so it runs in the worker,
 * on the page and under Node's tests alike: finding the sheet of paper in a
 * photo, straightening it, and making it look like a scan rather than a photo.
 *
 * Corners are always in the order top-left, top-right, bottom-right,
 * bottom-left, as x,y pairs in fractions of the photo (0 to 1).
 */

export type Corners = readonly [number, number, number, number, number, number, number, number];

/** A little in from each edge: what the handles start at when no sheet is found. */
export const DEFAULT_CORNERS: Corners = [0.04, 0.04, 0.96, 0.04, 0.96, 0.96, 0.04, 0.96];

/**
 * Finds the sheet of paper in a small greyscale copy of a photo. Paper is
 * nearly always the brightest large thing in the frame, so: split bright from
 * dark (Otsu), keep the biggest bright patch, and take its four extreme
 * points. Null when nothing big and bright enough is there.
 */
export function findPaper(gray: Uint8Array, width: number, height: number): Corners | null {
  const n = width * height;
  if (n === 0 || gray.length < n) return null;
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < n; i++) histogram[gray[i] ?? 0]!++;
  const threshold = otsu(histogram, n);

  // The largest 4-connected bright patch, by flood fill.
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let best = -1;
  let bestSize = 0;
  let next = 1;
  for (let start = 0; start < n; start++) {
    if (label[start] !== 0 || (gray[start] ?? 0) <= threshold) continue;
    const id = next++;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const p = stack[--top]!;
      size++;
      const x = p % width;
      const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width];
      for (const q of neighbours) {
        if (q < 0 || q >= n || label[q] !== 0 || (gray[q] ?? 0) <= threshold) continue;
        label[q] = id;
        stack[top++] = q;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  // A sheet that fills less than a sixth of the photo is probably not the sheet.
  if (best < 0 || bestSize < n / 6) return null;

  // Its extreme points: smallest x+y is top-left, largest x-y top-right, and so on.
  let tl = Infinity;
  let tr = -Infinity;
  let br = -Infinity;
  let bl = Infinity;
  const at = { tl: [0, 0], tr: [0, 0], br: [0, 0], bl: [0, 0] };
  for (let p = 0; p < n; p++) {
    if (label[p] !== best) continue;
    const x = p % width;
    const y = (p - x) / width;
    if (x + y < tl) [tl, at.tl] = [x + y, [x, y]];
    if (x - y > tr) [tr, at.tr] = [x - y, [x, y]];
    if (x + y > br) [br, at.br] = [x + y, [x, y]];
    if (x - y < bl) [bl, at.bl] = [x - y, [x, y]];
  }
  const fx = (v: number) => clamp01((v + 0.5) / width);
  const fy = (v: number) => clamp01((v + 0.5) / height);
  const corners: Corners = [fx(at.tl[0]!), fy(at.tl[1]!), fx(at.tr[0]!), fy(at.tr[1]!), fx(at.br[0]!), fy(at.br[1]!), fx(at.bl[0]!), fy(at.bl[1]!)];
  // A "sheet" with no area is a line of light, not paper.
  return quadArea(corners) > 1 / 8 ? corners : null;
}

function otsu(histogram: readonly number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (histogram[i] ?? 0);
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += histogram[t] ?? 0;
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * (histogram[t] ?? 0);
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The area of the quad, as a share of the photo (shoelace formula). */
export function quadArea(c: Corners): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += c[i * 2]! * c[j * 2 + 1]! - c[j * 2]! * c[i * 2 + 1]!;
  }
  return Math.abs(area) / 2;
}

/**
 * The size the straightened page should be, in pixels: its edges' lengths
 * in the photo, averaged across from each other, so a sheet photographed at
 * a slant comes out its true shape.
 */
export function outputSize(c: Corners, photoWidth: number, photoHeight: number, maxSide: number): { width: number; height: number } {
  const len = (a: number, b: number) => Math.hypot((c[b * 2]! - c[a * 2]!) * photoWidth, (c[b * 2 + 1]! - c[a * 2 + 1]!) * photoHeight);
  const w = (len(0, 1) + len(3, 2)) / 2;
  const h = (len(0, 3) + len(1, 2)) / 2;
  const scale = Math.min(1, maxSide / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * The projective map from the unit square to the quad (Heckbert's
 * square-to-quad). Returns (u, v) in [0,1]² → (x, y) in the quad's units.
 */
export function squareToQuad(q: readonly number[]): (u: number, v: number) => [number, number] {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q as [number, number, number, number, number, number, number, number];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // A parallelogram: affine.
    a = x1 - x0;
    b = x3 - x0;
    c = x0;
    d = y1 - y0;
    e = y3 - y0;
    f = y0;
    g = 0;
    h = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + h * x3;
    c = x0;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + h * y3;
    f = y0;
  }
  return (u, v) => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
}

/**
 * Straightens the quad `corners` of an RGBA photo into a `width` × `height`
 * RGBA image, sampling bilinearly.
 */
export function warp(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  corners: Corners,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const map = squareToQuad(corners.map((v, i) => v * (i % 2 === 0 ? srcWidth : srcHeight) - 0.5));
  const out = new Uint8ClampedArray(width * height * 4);
  const maxX = srcWidth - 1;
  const maxY = srcHeight - 1;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      let [sx, sy] = map((x + 0.5) / width, v);
      sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcWidth + x0) * 4;
      const i10 = (y0 * srcWidth + x1) * 4;
      const i01 = (y1 * srcWidth + x0) * 4;
      const i11 = (y1 * srcWidth + x1) * 4;
      const o = (y * width + x) * 4;
      for (let k = 0; k < 3; k++) {
        const top = src[i00 + k]! + (src[i10 + k]! - src[i00 + k]!) * fx;
        const bottom = src[i01 + k]! + (src[i11 + k]! - src[i01 + k]!) * fx;
        out[o + k] = top + (bottom - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

export type Look = 'colour' | 'grey' | 'bw';

/**
 * Makes a photo of paper look like a scan, in place. Colour and grey stretch
 * the levels so the paper is white and the ink is dark; black and white
 * compares each pixel with its neighbourhood, which survives a shadow across
 * the page where one threshold for the whole page would not.
 */
export function enhance(px: Uint8ClampedArray, width: number, height: number, look: Look): void {
  const n = width * height;
  if (look === 'colour') {
    for (let k = 0; k < 3; k++) {
      const [lo, hi] = levels(px, n, (i) => px[i * 4 + k]!);
      const span = Math.max(1, hi - lo);
      for (let i = 0; i < n; i++) px[i * 4 + k] = ((px[i * 4 + k]! - lo) * 255) / span;
    }
    return;
  }
  const gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) gray[i] = (px[i * 4]! * 77 + px[i * 4 + 1]! * 150 + px[i * 4 + 2]! * 29) >> 8;
  if (look === 'grey') {
    const [lo, hi] = levels(gray, n, (i) => gray[i]!);
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < n; i++) {
      const v = ((gray[i]! - lo) * 255) / span;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    }
    return;
  }
  // Black and white: a pixel is ink when it is clearly darker than the mean of its neighbourhood.
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]!;
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1]! + row;
    }
  }
  const r = Math.max(8, Math.round(Math.max(width, height) / 60));
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const sum = integral[y1 * (width + 1) + x1]! - integral[y0 * (width + 1) + x1]! - integral[y1 * (width + 1) + x0]! + integral[y0 * (width + 1) + x0]!;
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = gray[y * width + x]! < mean * 0.86 ? 0 : 255;
      const o = (y * width + x) * 4;
      px[o] = px[o + 1] = px[o + 2] = v;
    }
  }
}

/** The 1st and 99th percentiles: where black and white should be. */
function levels(_px: ArrayLike<number>, n: number, value: (i: number) => number): [number, number] {
  const histogram = new Array<number>(256).fill(0);
  const step = Math.max(1, Math.floor(n / 200_000));
  let count = 0;
  for (let i = 0; i < n; i += step) {
    histogram[Math.round(value(i))]!++;
    count++;
  }
  let lo = 0;
  let hi = 255;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v]!;
    if (seen >= count * 0.01) {
      lo = v;
      break;
    }
  }
  seen = 0;
  for (let v = 255; v >= 0; v--) {
    seen += histogram[v]!;
    if (seen >= count * 0.01) {
      hi = v;
      break;
    }
  }
  return hi - lo < 32 ? [0, 255] : [lo, hi];
}
