/**
 * Reading results back the way a person would look at them, for the e2e
 * specs: a PDF's words page by page, the colour at a point of a drawn page,
 * the pixels of a PNG or JPEG, and the parts of a .docx, .xlsx, .pptx or
 * .epub. Runs in Node, over the real pdf.js and the @napi-rs/canvas that
 * tests/fixtures/node-canvas.ts sets up.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { strFromU8, unzipSync } from 'fflate';

/** What the specs read a PDF through: its words, where they sit, and a drawing of a page. */
export interface InspectView {
  readonly pageCount: number;
  text(index: number): Promise<string>;
  layout(index: number): Promise<{ width: number; height: number; items: Array<{ str: string; x: number; y: number }> }>;
  encode(index: number, opts: { width: number; format: 'png' }): Promise<Uint8Array>;
  /** Where the page's links go. */
  links(index: number): Promise<string[]>;
  close(): Promise<void>;
}

/**
 * A PDF opened with pdf.js, as a reader would open it. Close it when done.
 * Straight over pdfjs-dist rather than the app's engine, which needs Vite's
 * import.meta.env and so only loads in a build or under Vitest.
 */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<InspectView> {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>)['pdfjsWorker'] ??= await import(/* @vite-ignore */ workerModule);
  const pdfjs = await import('pdfjs-dist');
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0, ...(password === undefined ? {} : { password }) });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    async text(index) {
      const page = await doc.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : '')).join('');
    },
    async layout(index) {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.flatMap((i) => {
        if (!('str' in i) || i.str.trim() === '') return [];
        const m = pdfjs.Util.transform(viewport.transform, i.transform);
        return [{ str: i.str, x: m[4] ?? 0, y: m[5] ?? 0 }];
      });
      return { width: viewport.width, height: viewport.height, items };
    },
    async encode(index, { width }) {
      const page = await doc.getPage(index + 1);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / natural.width });
      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      return new Uint8Array(await canvas.encode('png'));
    },
    async links(index) {
      const page = await doc.getPage(index + 1);
      const annotations = (await page.getAnnotations()) as Array<{ subtype?: string; url?: string }>;
      return annotations.flatMap((a) => (a.subtype === 'Link' && typeof a.url === 'string' ? [a.url] : []));
    },
    close: () => task.destroy(),
  };
}

/** Every page's words, as one string per page with runs of spaces collapsed. */
export async function pdfTexts(bytes: Uint8Array, password?: string): Promise<string[]> {
  const view = await openPdf(bytes, password);
  try {
    const out: string[] = [];
    for (let i = 0; i < view.pageCount; i++) out.push((await view.text(i)).replace(/\s+/g, ' ').trim());
    return out;
  } finally {
    await view.close();
  }
}

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  /** [r, g, b] at a point given as fractions of the width and height from the top-left. */
  at(fx: number, fy: number): [number, number, number];
}

/** The pixels of a PNG or JPEG. */
export async function pixelsOf(image: Uint8Array): Promise<Pixels> {
  const img = await loadImage(Buffer.from(image));
  const canvas = createCanvas(img.width, img.height);
  const c = canvas.getContext('2d');
  c.drawImage(img, 0, 0);
  const { data } = c.getImageData(0, 0, img.width, img.height);
  const width = img.width;
  const height = img.height;
  return {
    width,
    height,
    data,
    at(fx, fy) {
      const x = Math.min(width - 1, Math.max(0, Math.floor(fx * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(fy * height)));
      const i = (y * width + x) * 4;
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    },
  };
}

/** One page of a PDF drawn `width` pixels wide. */
export async function pagePixels(bytes: Uint8Array, index: number, width = 400, password?: string): Promise<Pixels> {
  const view = await openPdf(bytes, password);
  try {
    return await pixelsOf(await view.encode(index, { width, format: 'png' }));
  } finally {
    await view.close();
  }
}

/** Near enough to a colour: every channel within `tolerance`. */
export function near(rgb: readonly number[], target: readonly number[], tolerance = 40): boolean {
  return rgb.every((v, i) => Math.abs(v - (target[i] ?? 0)) <= tolerance);
}

/** A zip's parts, with the text ones decoded. */
export function unzipParts(bytes: Uint8Array): { names: string[]; text(name: string): string; bytes(name: string): Uint8Array | undefined } {
  const files = unzipSync(bytes);
  return {
    names: Object.keys(files),
    text: (name) => {
      const f = files[name];
      if (f === undefined) throw new Error(`${name} is not in the package (${Object.keys(files).join(', ')})`);
      return strFromU8(f);
    },
    bytes: (name) => files[name],
  };
}

/** The visible text of a WordprocessingML or DrawingML part, paragraph by paragraph. */
export function xmlParagraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<(w|a):p\b[\s\S]*?<\/\1:p>/g) ?? []) {
    const text = [...p.matchAll(/<(?:w|a):t(?:\s[^>]*)?>([^<]*)<\/(?:w|a):t>/g)].map((m) => m[1] ?? '').join('');
    out.push(decodeEntities(text));
  }
  return out;
}

export function decodeEntities(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** A worksheet as rows of cell values: shared strings resolved, numbers as numbers. */
export function sheetRows(parts: ReturnType<typeof unzipParts>, sheet: number): Array<Array<string | number>> {
  const shared = parts.names.includes('xl/sharedStrings.xml')
    ? [...parts.text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeEntities([...(m[1] ?? '').matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1] ?? '').join('')))
    : [];
  const xml = parts.text(`xl/worksheets/sheet${sheet}.xml`);
  const rows: Array<Array<string | number>> = [];
  for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const r = Number(/\br="(\d+)"/.exec(row)?.[1] ?? rows.length + 1) - 1;
    const cells: Array<string | number> = [];
    for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c)?.[1] ?? 'A';
      let col = 0;
      for (const ch of ref) col = col * 26 + (ch.charCodeAt(0) - 64);
      const type = /\bt="(\w+)"/.exec(c)?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(c)?.[1];
      const inline = /<is>[\s\S]*?<t[^>]*>([^<]*)<\/t>/.exec(c)?.[1];
      cells[col - 1] = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? decodeEntities(inline ?? '') : v === undefined ? '' : Number(v);
    }
    rows[r] = Array.from(cells, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}
