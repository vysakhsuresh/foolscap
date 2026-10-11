/**
 * The engine entry point. The UI imports THIS module, never the barrel, so the
 * surgeon (and pdf-lib) never load on the main thread.
 *
 * Stage 1: the page thread only. pdf.js's own worker parses the document; this
 * module hands it bytes, asks for pages, and paints them onto a canvas. The
 * recipe in types.ts is followed to the letter because pdf.js has several
 * ways to do each step and only one of them keeps the promises.
 */
import './shims';
import {
  AbortException,
  getDocument,
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
  PDFWorker,
  RenderingCancelledException,
  VerbosityLevel,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import workerUrl from './pdfjs-worker?worker&url';
import { PDFJS_ASSETS } from './pdfjs-version';
import { PdfError, type PageInfo, type PdfEngine, type PdfView } from './types';

const MAX_RENDER_PIXELS = 5_242_880;

export function createEngine(): PdfEngine {
  // pdf.js's worker script, wrapped so the shims load ahead of it (see
  // pdfjs-worker.ts). Vite builds the wrapper as a module worker under
  // /assets/; this is its URL. Set before the worker is made.
  GlobalWorkerOptions.workerSrc = workerUrl;

  // Made now, at page load, and shared by every document: a page that reports
  // itself ready has already fetched everything it needs to draw. Errors only:
  // pdf.js's warnings name fonts and objects, and nothing of ours goes to the
  // console.
  const worker = new PDFWorker({ verbosity: VerbosityLevel.ERRORS });

  return {
    ready: worker.promise,
    maxRenderPixels: MAX_RENDER_PIXELS,

    async open(data, opts) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
      // getDocument transfers the buffer to the worker, so anything we want to
      // know about the bytes afterwards has to be read before the call.
      const byteLength = bytes.byteLength;
      const header = bytes.slice(0, 1024 + 5);
      const signal = opts?.signal;
      if (signal?.aborted) throw cancelled();

      const task = getDocument({
        data: bytes,
        worker,
        useWorkerFetch: true,
        cMapUrl: PDFJS_ASSETS + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: PDFJS_ASSETS + 'standard_fonts/',
        wasmUrl: PDFJS_ASSETS + 'wasm/',
        iccUrl: PDFJS_ASSETS + 'iccs/',
        verbosity: VerbosityLevel.ERRORS,
        ...(opts?.password === undefined ? {} : { password: opts.password }),
      });

      const onAbort = () => void task.destroy();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const doc = await task.promise;
        return view(task, doc);
      } catch (error) {
        if (signal?.aborted) throw cancelled(error);
        throw toOpenError(error, header, byteLength);
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

function view(task: PDFDocumentLoadingTask, initial: PDFDocumentProxy): PdfView {
  let doc: PDFDocumentProxy | null = initial;

  const live = (): PDFDocumentProxy => {
    if (doc === null) throw new Error('This document has been closed.');
    return doc;
  };

  const pageAt = async (index: number): Promise<PDFPageProxy> => {
    const current = live();
    if (!Number.isInteger(index) || index < 0 || index >= current.numPages) {
      throw new Error(`Page index ${index} is out of range (0 to ${current.numPages - 1}).`);
    }
    return current.getPage(index + 1);
  };

  return {
    get pageCount() {
      return live().numPages;
    },

    async page(index): Promise<PageInfo> {
      const page = await pageAt(index);
      const [x1, y1, x2, y2] = page.view;
      return {
        index,
        width: Math.abs((x2 ?? 0) - (x1 ?? 0)),
        height: Math.abs((y2 ?? 0) - (y1 ?? 0)),
        rotation: normaliseRotation(page.rotate),
      };
    },

    async render(index, { width, signal }) {
      if (signal?.aborted) throw cancelled();
      const page = await pageAt(index);
      try {
        // getViewport defaults to the page's own /Rotate, so a landscape scan
        // stored sideways comes out the way a reader shows it.
        const natural = page.getViewport({ scale: 1 });
        let scale = Math.max(1, width) / natural.width;
        if (natural.width * natural.height * scale * scale > MAX_RENDER_PIXELS) {
          scale = Math.sqrt(MAX_RENDER_PIXELS / (natural.width * natural.height));
        }
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const canvasContext = canvas.getContext('2d', { alpha: false });
        if (!canvasContext) {
          throw new PdfError("This page couldn't be drawn. Try closing other tabs.", 'unknown');
        }

        const task = page.render({ canvasContext, canvas, viewport });
        const onAbort = () => task.cancel();
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          await task.promise;
        } finally {
          signal?.removeEventListener('abort', onAbort);
        }

        const bitmap = await createImageBitmap(canvas);
        // Release the canvas's backing store now rather than when the GC gets
        // to it: Safari counts canvas memory against a tight per-page budget.
        canvas.width = 0;
        canvas.height = 0;
        return bitmap;
      } catch (error) {
        throw toRenderError(error);
      } finally {
        // Without this pdf.js keeps every decoded image and font of every page
        // it has drawn, which on a 600-page scan is the whole scan.
        page.cleanup();
      }
    },

    async close() {
      if (doc === null) return;
      doc = null;
      // Destroying the loading task frees the document in the worker. The
      // worker itself is ours, not the task's, so it survives for the next open.
      await task.destroy();
    },
  };
}

function cancelled(cause?: unknown): PdfError {
  return new PdfError('Stopped.', 'cancelled', cause === undefined ? undefined : { cause });
}

/**
 * Everything pdf.js's worker throws reaches us re-created as one of a handful
 * of exception classes (see wrapReason in pdf.js), so instanceof is reliable.
 */
function toOpenError(error: unknown, header: Uint8Array, byteLength: number): PdfError {
  if (error instanceof PdfError) return error;
  if (error instanceof PasswordException) {
    return error.code === PasswordResponses.INCORRECT_PASSWORD
      ? new PdfError("That password didn't open it. Check it and try again.", 'wrong-password', {
          cause: error,
        })
      : new PdfError('This file is locked with a password.', 'encrypted', { cause: error });
  }
  if (isMemoryFailure(error)) return tooLarge(byteLength, error);
  if (error instanceof InvalidPDFException) return notReadable(header, error);
  if (error instanceof AbortException) return cancelled(error);
  return new PdfError("This PDF couldn't be read.", 'unknown', { cause: error });
}

function toRenderError(error: unknown): PdfError {
  if (error instanceof PdfError) return error;
  if (error instanceof RenderingCancelledException || error instanceof AbortException) {
    return cancelled(error);
  }
  if (isMemoryFailure(error)) {
    return new PdfError("This page is too big to draw on this device's memory.", 'too-large', {
      cause: error,
    });
  }
  return new PdfError("This page couldn't be drawn.", 'unknown', { cause: error });
}
