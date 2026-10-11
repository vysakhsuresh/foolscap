/**
 * The PDF seam. The app owns these interfaces; the libraries are
 * implementation details behind them.
 *
 * Reading and rasterising is `PdfEngine` (pdf.js). Restructuring and writing
 * is `PdfSurgeon` (pdf-lib). The split follows the libraries' strengths:
 * pdf.js draws pages fast and faithfully but cannot save a document; pdf-lib
 * can rebuild anything but cannot draw a page.
 *
 * NOTHING OUTSIDE `app/src/pdf/` MAY MENTION A PDF LIBRARY. Not `pdfjs-dist`,
 * not `@cantoo/pdf-lib`, not a type from either, not a dynamic import. Inside
 * this package, `engine*.ts` never mentions pdf-lib and `surgeon*.ts` never
 * mentions pdf.js, so the page bundle carries pdf.js only and the worker
 * bundle pdf-lib only. If a caller needs something these interfaces cannot
 * express, widen the interface here; never reach around it. A test greps.
 *
 * Indices are ZERO-BASED everywhere in this package. The one place one-based
 * page numbers are turned into indices is `PageSelection`.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PageInfo {
  readonly index: number;
  /** Points, as the PDF declares them, before rotation is applied. */
  readonly width: number;
  readonly height: number;
  /** The page's own /Rotate, normalised. */
  readonly rotation: Rotation;
}

export type PdfErrorCode =
  | 'not-a-pdf'
  | 'encrypted' // needs a password and none was given
  | 'wrong-password'
  | 'corrupt'
  /**
   * The device could not allocate memory for this document: a RangeError or
   * allocation failure anywhere in open, append or save. The message names
   * the size: "This 120 MB file is too big for this device's memory. Try
   * splitting it first."
   */
  | 'too-large'
  | 'cancelled'
  | 'unknown';

/**
 * The one error type the seam throws. `message` is for the user and says what
 * to do: "This file is locked with a password." rather than
 * "PasswordException". It never contains a file name.
 */
export class PdfError extends Error {
  constructor(
    message: string,
    readonly code: PdfErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PdfError';
  }
}

/**
 * Reading and rasterising.
 *
 * Built on the page at load, where pdf.js's own worker does the parsing and
 * the page only paints; `ready` resolves once that worker exists, so a page
 * that reports itself ready can draw thumbnails with the network gone.
 *
 * The recipe, because pdf.js has several ways to do each of these and only
 * one of them keeps the promises: `getDocument` is always given `data` (a Blob
 * is read with `arrayBuffer()` first; `data` accepts no Blob), never `url`,
 * `range` or `docBaseUrl`. Always `cMapUrl`, `standardFontDataUrl`, `wasmUrl`
 * and `iccUrl` pointing at `/pdfjs/<version>/…/` on our own origin (each
 * ending in a slash, or pdf.js throws), and `useWorkerFetch: true`. On the
 * page, `GlobalWorkerOptions.workerSrc` is the URL of `./pdfjs-worker.ts`,
 * a two-line wrapper that installs `./shims.ts` and then imports
 * `pdfjs-dist/build/pdf.worker.min.mjs` — a worker's globals are its own, so
 * the page's shims cannot reach it — and the default factories are fine. Inside a worker (later stages) it also
 * needs `disableFontFace: true`, a canvas factory returning an
 * `OffscreenCanvas`, and `worker: new PDFWorker({ port })`, because pdf.js
 * otherwise reaches for `document` and `window`. Nothing imports
 * `pdfjs-dist/web/*` or `pdfjs-dist/build/pdf.sandbox*`: a document's links
 * are never followed and its scripts never run. Import `pdfjs-dist/build/*`,
 * never `legacy/` — it buys nothing on this version.
 */
export interface PdfEngine {
  /** Resolves when pdf.js and its worker are loaded. Nothing is fetched after this. */
  readonly ready: Promise<void>;
  /**
   * The most device pixels one render may produce. 5,242,880 on phones, as
   * pdf.js's own viewer does; a 4× zoom on a 1080×2400 screen would otherwise
   * ask for 166 MB in one bitmap.
   */
  readonly maxRenderPixels: number;
  /**
   * Takes ownership of `data`: the caller must not read or post it afterwards.
   * pdf.js hands a full-buffer Uint8Array to its worker and leaves the caller's
   * buffer detached. An op that needs both a render and a restructure reads
   * the Workspace twice rather than sharing one array.
   */
  open(data: Blob | Uint8Array, opts?: { password?: string; signal?: AbortSignal }): Promise<PdfView>;
}

export interface PdfView {
  readonly pageCount: number;
  page(index: number): Promise<PageInfo>;
  /**
   * Renders a page `width` device pixels wide, height following the page's
   * aspect after its own rotation. Callers pass device pixels, not CSS
   * pixels, so a thumbnail on a 3× phone is sharp.
   *
   * `width` is clamped so width × height ≤ `maxRenderPixels`; the returned
   * bitmap's width is authoritative. The caller owns the ImageBitmap and
   * must `close()` it when it leaves the viewport — a 600-page grid that
   * never does is evicted on iOS. `signal` cancels the render (PdfError
   * 'cancelled'). The engine calls the page's cleanup after each render so
   * pdf.js does not cache 600 pages of decoded scans.
   */
  render(index: number, opts: { width: number; signal?: AbortSignal }): Promise<ImageBitmap>;
  /** Awaits pdf.js destroy: frees page caches, decoded images and fonts. The UI calls it when a grid unmounts. */
  close(): Promise<void>;
}

/**
 * Restructuring and writing.
 *
 * Implementations never let the library write its own name or dates into a
 * document: `PDFDocument.load` and `PDFDocument.create` are always called
 * with `{ updateMetadata: false }`. /Producer, /Creator, /CreationDate and
 * /ModDate are the input's own, or absent on `create()`; only the
 * `document-details` tool may change them, and only to what the user typed.
 * A test re-opens every op's output and checks.
 */
export interface PdfSurgeon {
  /** An empty document to build into. */
  create(): Promise<PdfDoc>;
  /**
   * Takes ownership of `data`: pdf-lib copies every stream out at parse, so a
   * caller that holds the input keeps a second copy alive. Drop it.
   */
  open(data: Uint8Array, opts?: { password?: string }): Promise<PdfDoc>;
}

export interface PdfDoc {
  readonly pageCount: number;
  pages(): readonly PageInfo[];
  /**
   * Appends copies of `source`'s pages `indices`, in the order given. The same
   * index may appear twice; a page may be copied from a document into itself.
   * This one method is merge, extract, delete and duplicate.
   *
   * It is the right path whenever a page is deleted or duplicated: pdf-lib's
   * writer serialises every object it has parsed, so an in-place delete would
   * leave the removed pages' streams in the output and the file would not
   * shrink. It costs roughly one extra copy of the source in memory; for a
   * pure reorder, prefer `reorder`.
   */
  appendPages(source: PdfDoc, indices: readonly number[]): Promise<void>;
  /**
   * Reorders this document's existing pages in place: `order[i]` is the
   * current index of the page that goes at position i, every index exactly
   * once. No stream is cloned, so it is the cheap path for organise when no
   * page was deleted or duplicated. Implementations move the existing page
   * refs in the page tree; they do not remove and re-insert page objects,
   * which would leave dangling refs.
   */
  reorder(order: readonly number[]): void;
  /** Absolute /Rotate for one page of this document. Replaces, never adds to, the page's own rotation. */
  setRotation(index: number, rotation: Rotation): void;
  setTitle(title: string): void;
  /** Cannot be interrupted once started; the JobRunner's terminate is the real cancel. */
  save(): Promise<Uint8Array>;
  /**
   * Drops this document's references so they can be collected. It cannot force
   * memory back; the JobRunner's worker lifecycle does that. Every other method
   * throws afterwards.
   */
  close(): void;
}
