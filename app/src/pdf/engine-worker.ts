/**
 * The engine inside the op worker, for the tools that draw or read pages:
 * PDF to images, Extract text, Compress. Same body as the page's engine
 * (engine-core.ts); what differs is that a worker has no `document`, so
 * pdf.js is given a canvas factory that makes OffscreenCanvases, a filter
 * factory that makes nothing (SVG filters need a DOM), fonts drawn as paths
 * rather than installed as FontFaces, and its own worker passed in as a port
 * because pdf.js would otherwise look at `window.location` to make one.
 */
import { PDFWorker, VerbosityLevel } from 'pdfjs-dist';
import { createEngineOn } from './engine-core';
import workerUrl from './pdfjs-worker?worker&url';
import type { PdfEngine } from './types';

interface CanvasAndContext {
  canvas: OffscreenCanvas | null;
  context: OffscreenCanvasRenderingContext2D | null;
}

/** pdf.js's BaseCanvasFactory, which it does not export, with OffscreenCanvas as the canvas. */
class OffscreenCanvasFactory {
  constructor(_: { enableHWA?: boolean }) {}
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }
  reset(cc: CanvasAndContext, width: number, height: number): void {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  destroy(cc: CanvasAndContext): void {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    cc.canvas.width = 0;
    cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

/** pdf.js's BaseFilterFactory: every filter is "none", which pdf.js handles by drawing without it. */
class NoFilterFactory {
  constructor(_: { docId?: string }) {}
  addFilter(): string {
    return 'none';
  }
  addHCMFilter(): string {
    return 'none';
  }
  addAlphaFilter(): string {
    return 'none';
  }
  addLuminosityFilter(): string {
    return 'none';
  }
  addKnockoutFilter(): string {
    return 'none';
  }
  addHighlightHCMFilter(): string {
    return 'none';
  }
  addSelectionHCMFilter(): string {
    return 'none';
  }
  addSelectionFilter(): string {
    return 'none';
  }
  createSelectionStyle(): null {
    return null;
  }
  destroy(): void {}
}

/**
 * A page's worth of pixels is a page's worth of memory in a worker too, but
 * no screen is involved: 300 dpi on A4 is 8.7 million, so the budget allows that.
 */
const MAX_RENDER_PIXELS = 16_777_216;

export function createEngine(): PdfEngine {
  const port = new Worker(workerUrl, { type: 'module' });
  return createEngineOn({
    worker: PDFWorker.create({ port, verbosity: VerbosityLevel.ERRORS }),
    maxRenderPixels: MAX_RENDER_PIXELS,
    options: {
      disableFontFace: true,
      useSystemFonts: false,
      isOffscreenCanvasSupported: true,
      CanvasFactory: OffscreenCanvasFactory,
      FilterFactory: NoFilterFactory,
    },
    canvas: (width, height) => new OffscreenCanvas(width, height),
    encode: (canvas, type, quality) =>
      canvas instanceof OffscreenCanvas ? canvas.convertToBlob({ type, quality }) : Promise.reject(new TypeError('canvas')),
  });
}
