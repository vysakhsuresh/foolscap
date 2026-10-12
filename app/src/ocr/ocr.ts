/**
 * Reading words out of a picture, for "Make searchable". tesseract.js runs
 * the Tesseract engine (WebAssembly) in a worker of its own, started from the
 * op worker; every file it needs is served from this site (see
 * scripts/copy-ocr-assets.mjs), and nothing is cached in IndexedDB.
 *
 * English is loaded when the worker starts, which is when the tool page
 * opens, so it works with the network gone. Any other language is fetched
 * from this site the first time a run asks for it, into the same Tesseract
 * worker, and kept for the life of the page.
 *
 * Only the op worker imports this module, and only through `import()`, so
 * no page carries it.
 */
import { OEM, createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import type { OcrWord } from '../ops/op';
import { PRELOADED_LANGUAGE } from './languages';
import { OCR_ASSETS } from './ocr-version';
import type { OcrLanguageReader } from './reader';

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

/** Where a language's model is served from. */
function modelUrl(code: string): string {
  return `${OCR_ASSETS}lang/${code}.traineddata.gz`;
}

function start(languages: readonly string[]): Promise<TesseractWorker> {
  return createWorker(languages.join('+'), OEM.LSTM_ONLY, {
    workerPath: `${OCR_ASSETS}worker.min.js`,
    corePath: `${OCR_ASSETS}core`,
    langPath: `${OCR_ASSETS}lang`,
    gzip: true,
    cacheMethod: 'none',
    workerBlobURL: false,
    logger: () => undefined,
    errorHandler: () => undefined,
  });
}

export function createOcr(): OcrLanguageReader {
  let worker: Promise<TesseractWorker> = start([PRELOADED_LANGUAGE]);
  /** The models inside the current Tesseract worker. */
  let loaded = new Set<string>([PRELOADED_LANGUAGE]);
  /** What it is set to read now, as Tesseract writes it: "mal+eng". */
  let active = PRELOADED_LANGUAGE;
  // Runs ask for languages one at a time; a second ask waits for the first to settle.
  let switching: Promise<void> = Promise.resolve();

  const restart = (languages: readonly string[]) => {
    void worker.then((w) => w.terminate()).catch(() => undefined);
    worker = start(languages);
    loaded = new Set(languages);
    active = languages.join('+');
  };

  async function switchTo(languages: readonly string[], fetching: (code: string) => void): Promise<void> {
    const wanted = languages.join('+');
    let w: TesseractWorker;
    try {
      w = await worker;
    } catch {
      // The engine never came up (or was lost): start again, straight in these languages.
      for (const code of languages) if (!loaded.has(code)) fetching(code);
      restart(languages);
      await worker;
      return;
    }
    if (wanted === active) return;
    const missing = languages.filter((code) => !loaded.has(code));
    // Ask first whether each model can be had. tesseract.js counts a language
    // as loaded before its download finishes, so a download that fails part
    // way leaves a worker that would fail later; asking first keeps the
    // common failure (no connection) from ever reaching it.
    for (const code of missing) {
      fetching(code);
      const answer = await fetch(modelUrl(code), { method: 'HEAD' });
      if (!answer.ok) throw new Error('The model is not on this site.');
    }
    const before = [...active.split('+')];
    try {
      await w.reinitialize(wanted, OEM.LSTM_ONLY);
    } catch (error) {
      // Whatever state that left it in, put back a clean one in the languages it had.
      restart(before);
      throw error;
    }
    for (const code of missing) loaded.add(code);
    active = wanted;
  }

  return {
    ready: worker.then(() => undefined),
    use(languages, fetching) {
      const next = switching.then(() => switchTo(languages, fetching));
      switching = next.catch(() => undefined);
      return next;
    },
    async read(png, width, height) {
      await switching;
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
