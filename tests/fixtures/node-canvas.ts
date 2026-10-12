/**
 * What a browser worker has and Node has not, for tests that want the real
 * drawing paths: OffscreenCanvas, createImageBitmap and ImageData, backed by
 * @napi-rs/canvas (already installed as pdf.js's own Node canvas). And an
 * engine over real pdf.js that draws with it, so Remove areas, PDF to images,
 * Compress's photo path and Make searchable's page pictures run for real.
 *
 * Tests may name the libraries: the seam rule applies to app/ only.
 */
import { createCanvas, DOMMatrix as NodeDOMMatrix, ImageData as NodeImageData, Path2D as NodePath2D, loadImage, type Canvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { PdfEngine } from '../../app/src/pdf/types';

type BlobOptions = { type?: string; quality?: number };

function withBlob(canvas: Canvas): Canvas & { convertToBlob(opts?: BlobOptions): Promise<Blob> } {
  return Object.assign(canvas, {
    async convertToBlob(opts: BlobOptions = {}): Promise<Blob> {
      const type = opts.type ?? 'image/png';
      const bytes =
        type === 'image/jpeg' ? await canvas.encode('jpeg', Math.round((opts.quality ?? 0.92) * 100)) : await canvas.encode('png');
      return new Blob([new Uint8Array(bytes)], { type: type === 'image/jpeg' ? 'image/jpeg' : 'image/png' });
    },
  });
}

/** Puts the three globals in place. Idempotent. */
export function installNodeCanvas(): void {
  const g = globalThis as Record<string, unknown>;
  if (g.__nodeCanvas === true) return;
  g.__nodeCanvas = true;
  g.OffscreenCanvas = function OffscreenCanvas(width: number, height: number) {
    return withBlob(createCanvas(Math.max(1, width), Math.max(1, height)));
  };
  g.ImageData = NodeImageData;
  g.Path2D ??= NodePath2D;
  g.DOMMatrix ??= NodeDOMMatrix;
  g.createImageBitmap = async (source: Blob | Canvas) => {
    if (source instanceof Blob) {
      const image = await loadImage(Buffer.from(await source.arrayBuffer()));
      if (!(image.width > 0 && image.height > 0)) throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      return Object.assign(image, { close: () => undefined });
    }
    return Object.assign(source, { close: () => undefined });
  };
}

/** The real engine over real pdf.js, drawing on @napi-rs/canvas, with pdf.js parsing in this thread. */
export async function createNodeEngine(): Promise<PdfEngine> {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
  const { PDFWorker, VerbosityLevel } = await import('pdfjs-dist');
  const { createEngineOn } = await import('../../app/src/pdf/engine-core');
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const engine = createEngineOn({
    worker: new PDFWorker({ verbosity: VerbosityLevel.ERRORS }),
    maxRenderPixels: 16_777_216,
    options: {
      useWorkerFetch: false,
      cMapUrl: join(root, 'cmaps') + '/',
      standardFontDataUrl: join(root, 'standard_fonts') + '/',
      wasmUrl: join(root, 'wasm') + '/',
      iccUrl: join(root, 'iccs') + '/',
      isOffscreenCanvasSupported: false,
    },
    canvas: (width, height) => withBlob(createCanvas(width, height)) as unknown as OffscreenCanvas,
    encode: (canvas, type, quality) => (canvas as unknown as ReturnType<typeof withBlob>).convertToBlob({ type, quality }),
  });
  await engine.ready;
  return engine;
}
