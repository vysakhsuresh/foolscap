/**
 * Resize photo to KB: a photo or a signature made to fit what an upload form
 * asks for ("under 50 KB", sometimes a passport photo or a pixel size). The
 * browser decodes and draws it in the worker; it is turned the way the phone
 * says it is seen, cut to the shape asked, and saved as a JPEG at the best
 * quality that fits, then, only if it must, with fewer pixels. Saving it
 * afresh leaves every hidden detail behind, the phone's location included.
 *
 * The form states its own limit. Nothing here knows any portal's rules; the
 * tool meets whatever size is typed.
 */
import { failed, ordinal, readInput, refused, stem, store } from './common';
import {
  NOT_AN_IMAGE,
  UNREADABLE_IMAGE,
  asStored,
  canDecode,
  hiddenDetails,
  jpegFrame,
  jpegOrientation,
  orientationTransform,
  orientedSize,
  sniffImage,
  withoutDetails,
} from './images';
import { checkCancelled, type CompressImageParams, type Op, type OpContext, type Outcome } from './op';
import type { FoolscapFile } from '../files/types';

/** A passport photo, 3.5 × 4.5 cm, at 300 dpi. */
export const PASSPORT = { width: 413, height: 531 } as const;

/** JPEG qualities, in percent. Above 92 a file grows without looking better; below 50 a face starts to break into blocks. */
export const BEST_QUALITY = 92;
export const LOWEST_QUALITY = 50;

/** The longest side a picture is made smaller to before the limit is called too small: a face or a signature still reads at this. */
export const SMALLEST_SIDE = 160;

/** The most pixels one canvas may hold: Safari's limit, and far more than any form wants. */
export const MAX_PIXELS = 16_777_216;

/** The smallest limit worth trying, in KB, and the pixel sizes that may be typed. */
export const MIN_KB = 2;
export const MIN_SIDE = 16;
export const MAX_SIDE = 4096;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PhotoPlan {
  /** The part of the picture, as it is seen, that is kept: all of it, or the middle cut to the shape asked. */
  readonly crop: Box;
  /** The size it is made, before any shrinking to fit. */
  readonly width: number;
  readonly height: number;
  /** Whether it may be made smaller in pixels to fit the limit: never when exact pixels were typed. */
  readonly shrink: boolean;
}

/** Where the cut goes and what size comes out, for a picture seen at `width` × `height`. */
export function planPhoto(width: number, height: number, params: CompressImageParams): PhotoPlan {
  /** The middle of the picture, cut to `aspect` (width over height). */
  const middle = (aspect: number): Box => {
    if (width / height > aspect) {
      const w = Math.min(width, Math.max(1, Math.round(height * aspect)));
      return { x: Math.floor((width - w) / 2), y: 0, width: w, height };
    }
    const h = Math.min(height, Math.max(1, Math.round(width / aspect)));
    return { x: 0, y: Math.floor((height - h) / 2), width, height: h };
  };
  switch (params.dimensions) {
    case 'passport': {
      const crop = middle(PASSPORT.width / PASSPORT.height);
      // Never enlarged: a small photo keeps its own pixels, in the passport shape.
      const big = crop.width >= PASSPORT.width;
      return { crop, width: big ? PASSPORT.width : crop.width, height: big ? PASSPORT.height : crop.height, shrink: true };
    }
    case 'custom': {
      const w = Math.round(params.width ?? 0);
      const h = Math.round(params.height ?? 0);
      return { crop: middle(w / h), width: w, height: h, shrink: false };
    }
    default: {
      // Its own shape and size; a picture bigger than one canvas can hold is made just small enough to fit in one.
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
      return { crop: { x: 0, y: 0, width, height }, width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), shrink: true };
    }
  }
}

/**
 * A size as a form shows it, never rounded up: a file under 50,000 bytes
 * never reads "50 KB". 1 KB is 1,000 bytes, as upload forms count.
 */
export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000) return `${Math.floor(bytes / 100_000) / 10} MB`;
  if (bytes >= 10_000) return `${Math.floor(bytes / 1000)} KB`;
  return `${Math.max(0.1, Math.floor(bytes / 100) / 10)} KB`;
}

/** The limit as it was typed: "50 KB", "19.5 KB". */
const limitText = (kb: number): string => `${Number(kb.toFixed(1))} KB`;

const DETAILS: Record<ReturnType<typeof hiddenDetails>, string> = {
  location: '; location and camera details taken out',
  details: '; camera details taken out',
  unknown: '; any location and camera details taken out',
  none: '',
};

const NO_CANVAS = "This browser can't work on photos in the background. Try a current Chrome, Edge, Firefox or Safari.";

async function jpeg(canvas: OffscreenCanvas, quality: number): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
  return new Uint8Array(await blob.arrayBuffer());
}

/** A 2D context that resamples well when it scales, and copies pixels exactly when `smooth` is false. */
function context(canvas: OffscreenCanvas, smooth = true): OffscreenCanvasRenderingContext2D {
  const c = canvas.getContext('2d');
  // A canvas the device has no memory for: reported as too large, like any other.
  if (c === null) throw new RangeError('No 2D context');
  c.imageSmoothingEnabled = smooth;
  c.imageSmoothingQuality = 'high';
  return c;
}

interface Picture {
  /** The picture at this size. Hand it back to `release` once encoded. */
  draw(width: number, height: number): OffscreenCanvas;
  release(canvas: OffscreenCanvas): void;
  close(): void;
}

/**
 * The picture, turned and cut, at any size asked. It is made smaller by
 * halves (each half the average of four pixels), so a fine line in a
 * signature or a strand of hair survives being made a tenth of its size;
 * each half is kept for the next try. At its own size, every pixel is copied
 * exactly, never blurred by a filter.
 */
function picture(bitmap: ImageBitmap, orientation: number, plan: PhotoPlan): Picture {
  const { crop } = plan;
  // The first copy: the whole cut, or half of it when the result is to be half its size or less (and never more than a canvas may hold).
  let scale = crop.width >= plan.width * 2 && crop.height >= plan.height * 2 ? 0.5 : 1;
  scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (crop.width * crop.height)));
  const w = Math.max(1, Math.round(crop.width * scale));
  const h = Math.max(1, Math.round(crop.height * scale));
  const first = new OffscreenCanvas(w, h);
  // Turning and flipping move whole pixels: only a change of size needs a filter.
  const c = context(first, scale !== 1);
  // JPEG has no transparency: what was see-through is paper white.
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  const sx = w / crop.width;
  const sy = h / crop.height;
  c.setTransform(sx, 0, 0, sy, -crop.x * sx, -crop.y * sy);
  const [a, b, cc, d, e, f] = orientationTransform(orientation, bitmap.width, bitmap.height);
  c.transform(a, b, cc, d, e, f);
  c.drawImage(bitmap, 0, 0);
  const levels: OffscreenCanvas[] = [first];
  return {
    draw(width, height) {
      let source = first;
      for (let i = 0; source.width >= width * 2 && source.height >= height * 2; i++) {
        let next = levels[i + 1];
        if (next === undefined) {
          next = new OffscreenCanvas(Math.max(1, Math.round(source.width / 2)), Math.max(1, Math.round(source.height / 2)));
          context(next).drawImage(source, 0, 0, next.width, next.height);
          levels.push(next);
        }
        source = next;
      }
      if (source.width === width && source.height === height) return source;
      const out = new OffscreenCanvas(width, height);
      context(out).drawImage(source, 0, 0, width, height);
      return out;
    },
    release(canvas) {
      if (!levels.includes(canvas)) canvas.width = canvas.height = 0;
    },
    close() {
      for (const level of levels) level.width = level.height = 0;
    },
  };
}

type Fit = { readonly fits: true; readonly quality: number; readonly bytes: Uint8Array } | { readonly fits: false; readonly bytes: Uint8Array };

/** The best quality at which this canvas comes in under `limit`, or how big it is at the lowest. */
async function bestQuality(canvas: OffscreenCanvas, limit: number, signal: AbortSignal): Promise<Fit> {
  const best = await jpeg(canvas, BEST_QUALITY);
  if (best.length < limit) return { fits: true, quality: BEST_QUALITY, bytes: best };
  checkCancelled(signal);
  const lowest = await jpeg(canvas, LOWEST_QUALITY);
  if (lowest.length >= limit) return { fits: false, bytes: lowest };
  let lo = LOWEST_QUALITY;
  let loBytes = lowest;
  let hi = BEST_QUALITY;
  while (hi - lo > 2) {
    checkCancelled(signal);
    const mid = (lo + hi) >> 1;
    const bytes = await jpeg(canvas, mid);
    if (bytes.length < limit) {
      lo = mid;
      loBytes = bytes;
    } else hi = mid;
  }
  return { fits: true, quality: lo, bytes: loBytes };
}

interface Size {
  readonly width: number;
  readonly height: number;
}

const longest = (size: Size): number => Math.max(size.width, size.height);

/** Width and height at `scale` of the plan, never under one pixel. */
const at = (plan: PhotoPlan, scale: number): Size => ({ width: Math.max(1, Math.round(plan.width * scale)), height: Math.max(1, Math.round(plan.height * scale)) });

async function fitOne(input: FoolscapFile, params: CompressImageParams, limit: number, ctx: OpContext): Promise<Outcome> {
  const bytes = await readInput(ctx, input);
  const kind = sniffImage(bytes.subarray(0, 32));
  if (kind === null) return refused([input], NOT_AN_IMAGE);
  const before = bytes.length;
  const under = limitText(params.targetKb);
  const hidden = DETAILS[hiddenDetails(bytes, kind)];
  const orientation = kind === 'jpeg' ? jpegOrientation(bytes) : 1;
  const name = (what: string) => `${stem(input.name)} (${what}).jpg`;

  // A JPEG that already fits and needs no turning or cutting keeps its picture
  // byte for byte: only what is hidden in it comes off.
  if (kind === 'jpeg' && orientation === 1) {
    const frame = jpegFrame(bytes);
    if (frame !== null && frame.width > 0 && frame.height > 0 && (frame.components === 1 || frame.components === 3) && frame.marker <= 0xc2) {
      const plan = planPhoto(frame.width, frame.height, params);
      const same = plan.crop.width === frame.width && plan.crop.height === frame.height && plan.width === frame.width && plan.height === frame.height;
      const bare = same ? withoutDetails(bytes) : null;
      if (bare !== null && bare.bytes.length < limit) {
        if (!bare.removed) {
          return {
            kind: 'skipped',
            inputIds: [input.id],
            reason: `This photo is already a ${sizeText(before)} JPEG, under ${under}, ${frame.width} × ${frame.height} px, with nothing hidden in it. Nothing to change.`,
          };
        }
        return store(ctx, 'compress-image', [input], name(`under ${under}`), bare.bytes, `${sizeText(before)} → ${sizeText(bare.bytes.length)}, under ${under}; ${frame.width} × ${frame.height} px, the picture itself untouched${hidden}`, 'image');
      }
    }
  }

  if (!canDecode()) return refused([input], NO_CANVAS);
  let bitmap: ImageBitmap;
  try {
    // Decoded as stored; orientationTransform is what turns it, the same in every browser.
    const stored = kind === 'jpeg' ? asStored(bytes) : bytes;
    bitmap = await createImageBitmap(new Blob([stored as Uint8Array<ArrayBuffer>]));
  } catch {
    return refused([input], UNREADABLE_IMAGE[kind] ?? "This picture couldn't be read. Save it as JPEG or PNG and try again.");
  }
  const seen = orientedSize(orientation, bitmap.width, bitmap.height);
  const plan = planPhoto(seen.width, seen.height, params);
  let pic: Picture | null = null;
  try {
    const drawn = picture(bitmap, orientation, plan);
    pic = drawn;
    bitmap.close();
    /** Draws the picture at `size`, works on that canvas, and lets the canvas go straight after. */
    const encodeAt = async <T>(size: Size, work: (canvas: OffscreenCanvas) => Promise<T>): Promise<T> => {
      checkCancelled(ctx.signal);
      const canvas = drawn.draw(size.width, size.height);
      try {
        return await work(canvas);
      } finally {
        drawn.release(canvas);
      }
    };
    const lowest = (size: Size) => encodeAt(size, (canvas) => jpeg(canvas, LOWEST_QUALITY));

    let size = at(plan, 1);
    let fit = await encodeAt(size, (canvas) => bestQuality(canvas, limit, ctx.signal));

    // Too big even at the lowest quality: fewer pixels, where fewer are allowed.
    let shrunk = false;
    if (!fit.fits && plan.shrink) {
      const floor = Math.min(1, SMALLEST_SIDE / Math.max(plan.width, plan.height));
      let failing = 1;
      let failingBytes = fit.bytes.length;
      let fitting = 0;
      let smallest = { bytes: fit.bytes, size };
      for (let tries = 0; tries < 10 && failing > floor; tries++) {
        // A JPEG's weight goes roughly with its pixel count: aim a little under.
        const scale = Math.max(floor, Math.min(failing * 0.95, failing * Math.sqrt(limit / failingBytes) * 0.9));
        const tried = at(plan, scale);
        const bytes = await lowest(tried);
        if (bytes.length < limit) {
          fitting = scale;
          break;
        }
        failing = scale;
        failingBytes = bytes.length;
        smallest = { bytes, size: tried };
      }
      if (fitting === 0) {
        // Even the smallest that still looks right is over the limit: say so, and hand it over only if it weighs less than before.
        if (smallest.bytes.length >= before) {
          return {
            kind: 'skipped',
            inputIds: [input.id],
            reason: `${under} is too small for this picture to stay clear, and it is already as small as it gets (${sizeText(before)}). Choose a bigger size if the form allows it.`,
          };
        }
        return store(
          ctx,
          'compress-image',
          [input],
          name('resized'),
          smallest.bytes,
          `${sizeText(before)} → ${sizeText(smallest.bytes.length)}. ${under} is too small for this picture to stay clear: this is the smallest that still looks right, ${smallest.size.width} × ${smallest.size.height} px${hidden}`,
          'image',
        );
      }
      // The most pixels that fit at the lowest quality; then the best quality at that size.
      for (let tries = 0; tries < 6; tries++) {
        const a = longest(at(plan, fitting));
        const b = longest(at(plan, failing));
        if (b - a <= Math.max(2, a * 0.02)) break;
        const mid = (fitting + failing) / 2;
        if ((await lowest(at(plan, mid))).length < limit) fitting = mid;
        else failing = mid;
      }
      size = at(plan, fitting);
      fit = await encodeAt(size, (canvas) => bestQuality(canvas, limit, ctx.signal));
      shrunk = true;
    }

    if (!fit.fits) {
      // Exact pixels were typed, and they cannot be had under the limit.
      return store(
        ctx,
        'compress-image',
        [input],
        name('resized'),
        fit.bytes,
        `${sizeText(before)} → ${sizeText(fit.bytes.length)}. ${under} is too small for ${size.width} × ${size.height} px to stay clear: this is the smallest at that size. Type fewer pixels, or choose Keep its shape to let it shrink${hidden}`,
        'image',
      );
    }

    let dims = `${params.dimensions === 'passport' ? 'passport shape, ' : ''}${size.width} × ${size.height} px`;
    if (shrunk) dims += params.dimensions === 'keep' ? `, made smaller to fit (it was ${seen.width} × ${seen.height})` : `, made smaller than ${plan.width} × ${plan.height} to fit`;
    else if (params.dimensions === 'keep' && (plan.width !== seen.width || plan.height !== seen.height)) dims += ` (it was ${seen.width} × ${seen.height})`;
    else if (params.dimensions === 'passport' && plan.width < PASSPORT.width) dims += `, not enlarged to ${PASSPORT.width} × ${PASSPORT.height}: the photo has fewer pixels`;
    if (orientation !== 1) dims += ', turned upright';
    if (kind !== 'jpeg') dims += ', now a JPEG';
    return store(ctx, 'compress-image', [input], name(`under ${under}`), fit.bytes, `${sizeText(before)} → ${sizeText(fit.bytes.length)}, under ${under}; ${dims}${hidden}`, 'image');
  } finally {
    bitmap.close();
    pic?.close();
  }
}

export const compressImageOp: Op<CompressImageParams> = {
  tool: 'compress-image',
  arity: { kind: 'each' },
  title: (params) => `Resize photo to ${limitText(params.targetKb)}`,
  async run(inputs, params, ctx) {
    const kb = Number(params.targetKb);
    if (!Number.isFinite(kb) || kb < MIN_KB) return inputs.map((input) => refused([input], `Choose a size of at least ${MIN_KB} KB.`));
    const custom = params.dimensions === 'custom';
    const w = Math.round(Number(params.width));
    const h = Math.round(Number(params.height));
    if (custom && !(w >= MIN_SIDE && h >= MIN_SIDE && w <= MAX_SIDE && h <= MAX_SIDE)) {
      return inputs.map((input) => refused([input], `Type a width and a height between ${MIN_SIDE} and ${MAX_SIDE} pixels.`));
    }
    const settled: CompressImageParams = custom
      ? { targetKb: kb, dimensions: 'custom', width: w, height: h }
      : { targetKb: kb, dimensions: params.dimensions === 'passport' ? 'passport' : 'keep' };
    const limit = Math.round(kb * 1000);
    const outcomes: Outcome[] = [];
    for (const [i, input] of inputs.entries()) {
      checkCancelled(ctx.signal);
      ctx.progress({ done: i, total: inputs.length, label: inputs.length > 1 ? `Fitting the ${ordinal(i + 1)} picture under ${limitText(kb)}` : `Fitting it under ${limitText(kb)}…` });
      try {
        outcomes.push(await fitOne(input, settled, limit, ctx));
      } catch (error) {
        outcomes.push(failed(error, [input]));
      }
    }
    ctx.progress({ done: inputs.length, total: inputs.length, label: 'Done' });
    return outcomes;
  },
};
