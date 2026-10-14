/**
 * Reading a result back the way a reader would, for the deep e2e tests: the
 * words on each page and where they sit, the page drawn to pixels, its
 * annotations and form fields. pdf.js in Node, drawing on @napi-rs/canvas.
 *
 * Tests may name the libraries: the seam rule applies to app/ only.
 */
import { DOMMatrix as NodeDOMMatrix, ImageData as NodeImageData, Path2D as NodePath2D, createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pdfjsWorkerModule } from './pdfjs-worker';

type PdfJs = typeof import('pdfjs-dist');
let loaded: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  loaded ??= (async () => {
    // What pdf.js draws with in a browser, from the same canvas library.
    const g = globalThis as Record<string, unknown>;
    g.Path2D ??= NodePath2D;
    g.DOMMatrix ??= NodeDOMMatrix;
    g.ImageData ??= NodeImageData;
    await import('../../app/src/pdf/shims');
    (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
    return import('pdfjs-dist');
  })();
  return loaded;
}

export interface Word {
  readonly text: string;
  /** Left edge and baseline, in points, on the page as the reader sees it (origin top-left). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Font size as seen. */
  readonly size: number;
  /** Reads left to right, the right way up. */
  readonly upright: boolean;
  /** Degrees the text is turned, counter-clockwise as seen. */
  readonly angle: number;
}

export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Opened {
  readonly pageCount: number;
  /** Width and height in points, as seen (after /Rotate). */
  size(index: number): Promise<{ width: number; height: number; rotation: number }>;
  words(index: number): Promise<Word[]>;
  /** Every word on the page, joined with spaces. */
  text(index: number): Promise<string>;
  /** The page drawn `scale` pixels per point, annotations included. */
  render(index: number, scale?: number): Promise<Picture>;
  annotations(index: number): Promise<Array<Record<string, unknown>>>;
  /** Each run of words on the page with the real name of the font it is drawn in ("Helvetica-Bold"). */
  fonts(index: number): Promise<Array<{ text: string; font: string }>>;
  /** Field values by name, as pdf.js reads them. */
  fields(): Promise<Record<string, Array<Record<string, unknown>>>>;
  close(): Promise<void>;
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<Opened> {
  const lib = await pdfjs();
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const task = lib.getDocument({
    data: bytes.slice(),
    verbosity: 0,
    ...(password === undefined ? {} : { password }),
    standardFontDataUrl: join(root, 'standard_fonts') + '/',
    cMapUrl: join(root, 'cmaps') + '/',
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    fontExtraProperties: true,
  });
  const doc = await task.promise;
  const opened: Opened = {
    pageCount: doc.numPages,
    async size(index) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height, rotation: page.rotate };
    },
    async words(index) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      return content.items
        .filter((item): item is Extract<typeof item, { str: string }> => 'str' in item && item.str.trim().length > 0)
        .map((item) => {
          const m = lib.Util.transform(viewport.transform, item.transform);
          const [a = 0, b = 0, , , x = 0, y = 0] = m;
          return {
            text: item.str,
            x,
            y,
            width: item.width,
            size: Math.hypot(a, b),
            upright: a > 0 && Math.abs(b) < 1e-6,
            angle: Math.round((Math.atan2(-b, a) * 180) / Math.PI) || 0,
          };
        });
    },
    async text(index) {
      return (await opened.words(index)).map((w: Word) => w.text).join(' ');
    },
    async render(index, scale = 1) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(data) };
    },
    async fonts(index) {
      const page = await doc.getPage(index + 1);
      const content = await page.getTextContent();
      await page.getOperatorList();
      // Fonts arrive in commonObjs once the drawing instructions have been read; give them a moment.
      for (const item of content.items) if ('fontName' in item) await new Promise<void>((resolve) => (page.commonObjs.has(item.fontName) ? resolve() : page.commonObjs.get(item.fontName, () => resolve())));
      return content.items
        .filter((item): item is Extract<typeof item, { str: string }> => 'str' in item && item.str.trim().length > 0)
        .map((item) => {
          const font: unknown = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : null;
          const name = font !== null && typeof font === 'object' && 'name' in font && typeof font.name === 'string' ? font.name : item.fontName;
          return { text: item.str, font: name };
        });
    },
    async annotations(index) {
      const page = await doc.getPage(index + 1);
      return (await page.getAnnotations()) as Array<Record<string, unknown>>;
    },
    async fields() {
      const raw = (await doc.getFieldObjects()) as unknown;
      if (raw === null) return {};
      const entries = raw instanceof Map ? [...raw.entries()] : Object.entries(raw as Record<string, unknown>);
      return Object.fromEntries(entries) as Record<string, Array<Record<string, unknown>>>;
    },
    async close() {
      await task.destroy();
    },
  };
  return opened;
}

/** The colour at a point given in fractions of the picture (top-left origin). */
export function pixel(picture: Picture, fx: number, fy: number): [number, number, number] {
  const x = Math.min(picture.width - 1, Math.max(0, Math.round(fx * picture.width)));
  const y = Math.min(picture.height - 1, Math.max(0, Math.round(fy * picture.height)));
  const at = (y * picture.width + x) * 4;
  return [picture.data[at] ?? 0, picture.data[at + 1] ?? 0, picture.data[at + 2] ?? 0];
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The share of pixels in `box` (fractions, top-left origin) for which `test` holds. */
export function share(picture: Picture, box: Box, test: (r: number, g: number, b: number) => boolean): number {
  const x0 = Math.max(0, Math.floor(box.x * picture.width));
  const y0 = Math.max(0, Math.floor(box.y * picture.height));
  const x1 = Math.min(picture.width, Math.ceil((box.x + box.w) * picture.width));
  const y1 = Math.min(picture.height, Math.ceil((box.y + box.h) * picture.height));
  let hit = 0;
  let all = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * picture.width + x) * 4;
      all++;
      if (test(picture.data[at] ?? 0, picture.data[at + 1] ?? 0, picture.data[at + 2] ?? 0)) hit++;
    }
  }
  return all === 0 ? 0 : hit / all;
}

/** The average colour in `box`, of the pixels for which `only` holds (all of them by default). */
export function mean(picture: Picture, box: Box, only: (r: number, g: number, b: number) => boolean = () => true): [number, number, number] {
  const sum = [0, 0, 0];
  let n = 0;
  share(picture, box, (r, g, b) => {
    if (!only(r, g, b)) return false;
    sum[0]! += r;
    sum[1]! += g;
    sum[2]! += b;
    n++;
    return true;
  });
  return n === 0 ? [0, 0, 0] : [Math.round(sum[0]! / n), Math.round(sum[1]! / n), Math.round(sum[2]! / n)];
}

/** The smallest box (fractions) holding every pixel for which `test` holds, or null. */
export function extent(picture: Picture, test: (r: number, g: number, b: number) => boolean): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < picture.width; x++) {
      const at = (y * picture.width + x) * 4;
      if (!test(picture.data[at] ?? 0, picture.data[at + 1] ?? 0, picture.data[at + 2] ?? 0)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0 / picture.width, y: y0 / picture.height, w: (x1 - x0 + 1) / picture.width, h: (y1 - y0 + 1) / picture.height };
}

export const isInk = (r: number, g: number, b: number): boolean => r + g + b < 3 * 150;
export const isWhite = (r: number, g: number, b: number): boolean => r > 245 && g > 245 && b > 245;
export const notWhite = (r: number, g: number, b: number): boolean => !isWhite(r, g, b);
/** Clearly red, blue, green or grey, as the tools draw them. */
export const isRed = (r: number, g: number, b: number): boolean => r > 150 && g < 110 && b < 110;
export const isBlue = (r: number, g: number, b: number): boolean => b > 130 && r < 110 && b - r > 60;
export const isGreen = (r: number, g: number, b: number): boolean => g > 100 && r < 120 && b < 140 && g - r > 40;

/**
 * Where `after` differs from `before` (two drawings of the same page at the
 * same scale): what a tool added, as a picture of its own. Pixels that did
 * not change come out white.
 */
export function difference(before: Picture, after: Picture, tolerance = 24): Picture {
  if (before.width !== after.width || before.height !== after.height) throw new Error(`Pages differ in size: ${before.width}×${before.height} and ${after.width}×${after.height}`);
  const data = new Uint8ClampedArray(after.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const moved = Math.abs((after.data[i] ?? 0) - (before.data[i] ?? 0)) + Math.abs((after.data[i + 1] ?? 0) - (before.data[i + 1] ?? 0)) + Math.abs((after.data[i + 2] ?? 0) - (before.data[i + 2] ?? 0));
    const keep = moved > tolerance;
    data[i] = keep ? (after.data[i] ?? 0) : 255;
    data[i + 1] = keep ? (after.data[i + 1] ?? 0) : 255;
    data[i + 2] = keep ? (after.data[i + 2] ?? 0) : 255;
    data[i + 3] = 255;
  }
  return { width: after.width, height: after.height, data };
}

/** Draws page `index` of both files at `scale` and returns what changed. */
export async function added(input: Uint8Array, output: Uint8Array, index: number, scale = 0.5, password?: string): Promise<Picture> {
  const a = await openPdf(input, password);
  const b = await openPdf(output, password);
  try {
    return difference(await a.render(index, scale), await b.render(index, scale));
  } finally {
    await a.close();
    await b.close();
  }
}

/** Writes a picture as a PNG, for a person to look at while a test is being written. */
export async function savePng(picture: Picture, path: string): Promise<void> {
  const canvas = createCanvas(picture.width, picture.height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(picture.width, picture.height);
  image.data.set(picture.data);
  context.putImageData(image, 0, 0);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, await canvas.encode('png'));
}

/** Draws page `index` of `bytes` and saves it, when LOOK is set to a folder. */
export async function look(bytes: Uint8Array, index: number, name: string, password?: string): Promise<void> {
  const folder = process.env['LOOK'];
  if (!folder) return;
  const pdf = await openPdf(bytes, password);
  try {
    await savePng(await pdf.render(index, 1), `${folder}/${name}.png`);
  } finally {
    await pdf.close();
  }
}
