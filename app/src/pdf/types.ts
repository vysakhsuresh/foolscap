/**
 * The PDF seam. The app owns these interfaces; the libraries are
 * implementation details behind them.
 *
 * Reading and rasterising is `PdfEngine` (pdf.js). Restructuring and writing
 * is `PdfSurgeon` (pdf-lib). The split follows the libraries' strengths:
 * pdf.js draws pages fast and faithfully but cannot save a document; pdf-lib
 * can rebuild anything but cannot draw a page.
 *
 * NOTHING OUTSIDE `app/src/pdf/` MAY IMPORT A PDF LIBRARY TYPE. Not
 * `pdfjs-dist`, not `@cantoo/pdf-lib`, not a type from either. If a caller
 * needs something these interfaces cannot express, widen the interface here;
 * never reach around it. A test greps for violations.
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
  readonly rotation: Rotation;
}

export type PdfErrorCode =
  | 'not-a-pdf'
  | 'encrypted' // needs a password and none was given
  | 'wrong-password'
  | 'corrupt'
  | 'too-large'
  | 'cancelled'
  | 'unknown';

/**
 * The one error type the seam throws. `message` is for the user and says what
 * to do: "This file needs a password" rather than "InvalidPDFException".
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

/** Reading and rasterising. */
export interface PdfEngine {
  open(data: Blob | Uint8Array, opts?: { password?: string; signal?: AbortSignal }): Promise<PdfView>;
}

export interface PdfView {
  readonly pageCount: number;
  page(index: number): Promise<PageInfo>;
  /**
   * Renders a page to a bitmap `width` device pixels wide, height following
   * the page's aspect after its rotation. Callers pass device pixels, not CSS
   * pixels, so a thumbnail on a 3x phone is sharp.
   */
  render(index: number, opts: { width: number; signal?: AbortSignal }): Promise<ImageBitmap>;
  close(): Promise<void>;
}

/** Restructuring and writing. */
export interface PdfSurgeon {
  /** An empty document to build into. */
  create(): Promise<PdfDoc>;
  open(data: Uint8Array, opts?: { password?: string }): Promise<PdfDoc>;
}

export interface PdfDoc {
  readonly pageCount: number;
  pages(): readonly PageInfo[];
  /**
   * Appends copies of `source`'s pages `indices`, in the order given. The same
   * index may appear twice; a page may be copied from a document into itself.
   * This one method is merge, extract, reorder and delete.
   */
  appendPages(source: PdfDoc, indices: readonly number[]): Promise<void>;
  /** Absolute rotation for one page of this document. */
  setRotation(index: number, rotation: Rotation): void;
  setTitle(title: string): void;
  save(): Promise<Uint8Array>;
  close(): void;
}
