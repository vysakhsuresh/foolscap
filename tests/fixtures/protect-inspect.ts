/**
 * Reading an output back the way a reader would, in Node, for the e2e specs
 * that check what a tool really made: whether it needs a password and which
 * permissions it grants, its words and where they sit, its details and XMP,
 * its attachments and comments, and its pages as pixels.
 *
 * pdf.js runs in this thread (its worker module is handed over as
 * `pdfjsWorker`), with the standard fonts from node_modules so Helvetica
 * draws as it does in a browser. Tests may name the library: the seam rule
 * applies to app/ only.
 */
import { createCanvas, DOMMatrix as NodeDOMMatrix, Path2D as NodePath2D } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

type PdfJs = typeof import('pdfjs-dist');
type Doc = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

let loading: Promise<PdfJs> | null = null;
let root = '';

async function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    await import('../../app/src/pdf/shims');
    // What pdf.js draws some shapes with, and Node has not.
    const g = globalThis as Record<string, unknown>;
    g.Path2D ??= NodePath2D;
    g.DOMMatrix ??= NodeDOMMatrix;
    const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
    (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
    root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
    return (await import('pdfjs-dist')) as PdfJs;
  })();
  return loading;
}

export type Opened = 'opens' | 'needs-password' | 'wrong-password' | 'unreadable';

/** Opens `bytes` (with `password` if given) and hands the document to `use`, closing it after. */
export async function withPdf<T>(bytes: Uint8Array, use: (doc: Doc) => Promise<T>, password?: string): Promise<T> {
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: bytes.slice(),
    verbosity: 0,
    useSystemFonts: false,
    standardFontDataUrl: join(root, 'standard_fonts') + '/',
    cMapUrl: join(root, 'cmaps') + '/',
    wasmUrl: join(root, 'wasm') + '/',
    iccUrl: join(root, 'iccs') + '/',
    isOffscreenCanvasSupported: false,
    ...(password === undefined ? {} : { password }),
  });
  try {
    return await use(await task.promise);
  } finally {
    await task.destroy();
  }
}

/** Whether a reader opens the file: without a password, with this one, or not at all. */
export async function opens(bytes: Uint8Array, password?: string): Promise<Opened> {
  try {
    await withPdf(bytes, async (doc) => doc.numPages, password);
    return 'opens';
  } catch (error) {
    const name = (error as { name?: string }).name ?? '';
    const code = (error as { code?: number }).code;
    if (name === 'PasswordException') return code === 2 ? 'wrong-password' : 'needs-password';
    return 'unreadable';
  }
}

export interface Word {
  readonly text: string;
  /** Fractions of the page as the reader sees it, from the top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Each page's words, and the page's whole text joined in reading order. */
export async function pdfText(bytes: Uint8Array, password?: string): Promise<{ pages: string[]; words: Word[][] }> {
  return withPdf(
    bytes,
    async (doc) => {
      const pages: string[] = [];
      const words: Word[][] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const list: Word[] = [];
        let text = '';
        for (const item of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean }>) {
          if (typeof item.str !== 'string') continue;
          text += item.str + (item.hasEOL ? '\n' : ' ');
          if (!item.str.trim() || !item.transform) continue;
          const [, , , , e = 0, f = 0] = item.transform;
          const h = Math.abs(item.height ?? item.transform[3] ?? 0);
          const w = item.width ?? 0;
          const [x1 = 0, y1 = 0] = viewport.convertToViewportPoint(e, f);
          const [x2 = 0, y2 = 0] = viewport.convertToViewportPoint(e + w, f + h);
          const left = Math.min(x1, x2);
          const top = Math.min(y1, y2);
          list.push({ text: item.str, x: left / viewport.width, y: top / viewport.height, w: Math.abs(x2 - x1) / viewport.width, h: Math.abs(y2 - y1) / viewport.height });
        }
        pages.push(text.replace(/[ \t]+/g, ' ').trim());
        words.push(list);
        page.cleanup();
      }
      return { pages, words };
    },
    password,
  );
}

export interface Details {
  readonly info: Record<string, unknown>;
  /** pdf.js's list of what is allowed, or null when nothing is restricted. */
  readonly permissions: number[] | null;
  readonly attachments: Array<{ name: string; bytes: Uint8Array }>;
  readonly pageCount: number;
  /** Annotations per page: subtype and, for notes, the text. */
  readonly annotations: Array<Array<{ subtype: string; contents: string; rect: number[]; url?: string; fieldType?: string; fieldName?: string }>>;
}

export async function pdfDetails(bytes: Uint8Array, password?: string): Promise<Details> {
  return withPdf(
    bytes,
    async (doc) => {
      const meta = await doc.getMetadata();
      const attachments: Array<{ name: string; bytes: Uint8Array }> = [];
      const found = (await doc.getAttachments()) as Map<string, { filename: string }> | null;
      for (const [id, value] of found ?? new Map<string, { filename: string }>()) {
        attachments.push({ name: value.filename, bytes: new Uint8Array((await doc.getAttachmentContent(id)) as Uint8Array) });
      }
      const annotations: Details['annotations'] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const list = (await page.getAnnotations()) as Array<{ subtype: string; contentsObj?: { str?: string }; rect: number[]; url?: string; fieldType?: string; fieldName?: string }>;
        annotations.push(
          list.map((a) => ({
            subtype: a.subtype,
            contents: a.contentsObj?.str ?? '',
            rect: a.rect,
            ...(a.url ? { url: a.url } : {}),
            ...(a.fieldType ? { fieldType: a.fieldType } : {}),
            ...(a.fieldName ? { fieldName: a.fieldName } : {}),
          })),
        );
      }
      return {
        info: (meta.info ?? {}) as Record<string, unknown>,
        permissions: permissionList(await doc.getPermissions()),
        attachments,
        pageCount: doc.numPages,
        annotations,
      };
    },
    password,
  );
}

export interface Hidden {
  /** Every XMP packet in the file, the document's and any page's, picture's or font's own, as text. */
  readonly xmp: string[];
  /** Scripts and actions that run by themselves: /JavaScript, /Launch, /SubmitForm, /ImportData, and any /AA. */
  readonly scripts: number;
  /** Private data editing programs leave: /PieceInfo. */
  readonly pieceInfo: number;
  readonly embeddedFiles: number;
  /** The document's Info dictionary, as pdf-lib reads it. */
  readonly info: Record<string, string>;
}

/** What an unencrypted file carries besides its pages, read object by object with pdf-lib. */
export async function hiddenIn(bytes: Uint8Array): Promise<Hidden> {
  const { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const xmp: string[] = [];
  let scripts = 0;
  let pieceInfo = 0;
  let embeddedFiles = 0;
  const visit = (dict: import('@cantoo/pdf-lib').PDFDict): void => {
    const s = dict.get(PDFName.of('S'));
    if (s instanceof PDFName && ['/JavaScript', '/Launch', '/SubmitForm', '/ImportData'].includes(s.toString())) scripts++;
    if (dict.has(PDFName.of('AA'))) scripts++;
    if (dict.has(PDFName.of('PieceInfo'))) pieceInfo++;
    for (const [, value] of dict.entries()) if (value instanceof PDFDict) visit(value);
  };
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      const type = object.dict.get(PDFName.of('Type'));
      if (type === PDFName.of('Metadata')) xmp.push(new TextDecoder().decode(decodePDFRawStream(object).decode()));
      if (type === PDFName.of('EmbeddedFile')) embeddedFiles++;
      visit(object.dict);
    } else if (object instanceof PDFDict) {
      visit(object);
    }
  }
  const info: Record<string, string> = {};
  const read: Record<string, () => string | undefined> = {
    Title: () => doc.getTitle(),
    Author: () => doc.getAuthor(),
    Subject: () => doc.getSubject(),
    Keywords: () => doc.getKeywords(),
    Creator: () => doc.getCreator(),
    Producer: () => doc.getProducer(),
  };
  for (const [key, get] of Object.entries(read)) {
    const value = get();
    if (value !== undefined) info[key] = value;
  }
  return { xmp, scripts, pieceInfo, embeddedFiles, info };
}

function permissionList(raw: unknown): number[] | null {
  if (raw === null || raw === undefined) return null;
  return Array.from(raw as Iterable<number>);
}

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Page `index` (0-based) drawn at `scale` (1 = 72 dpi), as RGBA, annotations included. */
export async function renderPage(bytes: Uint8Array, index: number, scale = 1, password?: string): Promise<Pixels> {
  return withPdf(
    bytes,
    async (doc) => {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      page.cleanup();
      return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(image.data) };
    },
    password,
  );
}

/** The average colour of a region given in fractions of the page, from its top-left corner. */
export function meanColour(px: Pixels, region: { x: number; y: number; w: number; h: number }): [number, number, number] {
  const x0 = Math.max(0, Math.floor(region.x * px.width));
  const y0 = Math.max(0, Math.floor(region.y * px.height));
  const x1 = Math.min(px.width, Math.ceil((region.x + region.w) * px.width));
  const y1 = Math.min(px.height, Math.ceil((region.y + region.h) * px.height));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * px.width + x) * 4;
      r += px.data[at]!;
      g += px.data[at + 1]!;
      b += px.data[at + 2]!;
      n++;
    }
  }
  return n === 0 ? [255, 255, 255] : [r / n, g / n, b / n];
}

/** The share of a region's pixels darker than `below` (0–255 luminance). */
export function darkShare(px: Pixels, region: { x: number; y: number; w: number; h: number }, below = 80): number {
  const x0 = Math.max(0, Math.floor(region.x * px.width));
  const y0 = Math.max(0, Math.floor(region.y * px.height));
  const x1 = Math.min(px.width, Math.ceil((region.x + region.w) * px.width));
  const y1 = Math.min(px.height, Math.ceil((region.y + region.h) * px.height));
  let dark = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * px.width + x) * 4;
      const lum = 0.299 * px.data[at]! + 0.587 * px.data[at + 1]! + 0.114 * px.data[at + 2]!;
      if (lum < below) dark++;
      n++;
    }
  }
  return n === 0 ? 0 : dark / n;
}

/** The first word on page `page` whose text contains `needle`, or undefined. */
export function findWord(words: readonly Word[][], page: number, needle: string): Word | undefined {
  return words[page]?.find((w) => w.text.includes(needle));
}

/** A PNG of the page, for building "scans" of a typed document. */
export async function pagePng(bytes: Uint8Array, index: number, scale: number): Promise<Uint8Array> {
  return withPdf(bytes, async (doc) => {
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    page.cleanup();
    return new Uint8Array(await canvas.encode('png'));
  });
}
