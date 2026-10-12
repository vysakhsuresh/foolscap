/**
 * The engine on the page. The UI imports THIS module, never the barrel, so the
 * surgeon (and pdf-lib) never load on the main thread.
 *
 * pdf.js's own worker parses the document; this module hands it bytes, asks
 * for pages, and paints them onto a canvas. The body is in engine-core.ts,
 * shared with the op worker's engine.
 */
import { GlobalWorkerOptions, PDFWorker, VerbosityLevel } from 'pdfjs-dist';
import { createEngineOn } from './engine-core';
import workerUrl from './pdfjs-worker?worker&url';
import type { PdfEngine } from './types';

export function createEngine(): PdfEngine {
  // pdf.js's worker script, wrapped so the shims load ahead of it (see
  // pdfjs-worker.ts). Vite builds the wrapper as a module worker under
  // /assets/; this is its URL. Set before the worker is made.
  GlobalWorkerOptions.workerSrc = workerUrl;

  return createEngineOn({
    // Made now, at page load, and shared by every document: a page that
    // reports itself ready has already fetched everything it needs to draw.
    // Errors only: pdf.js's warnings name fonts and objects, and nothing of
    // ours goes to the console.
    worker: new PDFWorker({ verbosity: VerbosityLevel.ERRORS }),
    maxRenderPixels: 5_242_880,
    options: {},
    canvas(width, height) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    encode(canvas, type, quality) {
      if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type, quality });
      return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new RangeError('toBlob'))), type, quality),
      );
    },
  });
}
