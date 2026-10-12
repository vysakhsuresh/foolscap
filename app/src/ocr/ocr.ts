/**
 * Reading words out of a picture, for "Make searchable". tesseract.js runs
 * the Tesseract engine (WebAssembly) in a worker of its own, started from the
 * op worker; every file it needs is served from this site (see
 * scripts/copy-ocr-assets.mjs), and nothing is cached in IndexedDB.
 *
 * Only the op worker imports this module, and only through `import()`, so
 * no page carries it.
 */
import { OEM, createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import type { OcrReader, OcrWord } from '../ops/op';
import { OCR_ASSETS } from './ocr-version';

/** Below this, Tesseract is guessing: the word is left out rather than made searchable wrong. */
const MIN_CONFIDENCE = 35;

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface RawWord {
  readonly text: string;
  readonly confidence: number;
  readonly bbox: Box;
}

interface RawPage {
  readonly blocks: ReadonlyArray<{ readonly paragraphs: ReadonlyArray<{ readonly lines: ReadonlyArray<{ readonly words: readonly RawWord[] }> }> }> | null;
}

export function createOcr(): OcrReader {
  const worker: Promise<TesseractWorker> = createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${OCR_ASSETS}worker.min.js`,
    corePath: `${OCR_ASSETS}core`,
    langPath: `${OCR_ASSETS}lang`,
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: () => undefined,
    errorHandler: () => undefined,
  });

  return {
    ready: worker.then(() => undefined),
    async read(png, width, height) {
      const w = await worker;
      const result = await w.recognize(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }), {}, { text: false, blocks: true });
      const page = result.data as unknown as RawPage;
      const words: OcrWord[] = [];
      for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              const text = word.text.trim();
              if (text.length === 0 || word.confidence < MIN_CONFIDENCE) continue;
              const { x0, y0, x1, y1 } = word.bbox;
              if (x1 <= x0 || y1 <= y0) continue;
              words.push({ text, x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height });
            }
          }
        }
      }
      return words;
    },
    async close() {
      await (await worker.catch(() => null))?.terminate();
    },
  };
}
