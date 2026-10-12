/**
 * The OCR reader as the op sees it, plus the one thing op.ts's `OcrReader`
 * does not say: which languages to read in. Types and a guard only, so the
 * op can ask for languages without importing tesseract.js (ocr.ts is loaded
 * by `import()` in the op worker, and only there).
 */
import type { OcrReader } from '../ops/op';

export interface OcrLanguageReader extends OcrReader {
  /**
   * Readies the reader for these languages, the main one first. A model this
   * worker has not loaded yet is fetched from this site, once; `fetching` is
   * called with its code just before, so the op can say what the wait is.
   * Rejects when a model cannot be had (no connection, usually); the reader
   * is still usable afterwards, in the languages it already had.
   */
  use(languages: readonly string[], fetching: (code: string) => void): Promise<void>;
}

/** Whether this reader can switch language. The one ocr.ts makes always can. */
export function readsLanguages(reader: OcrReader): reader is OcrLanguageReader {
  return typeof (reader as Partial<OcrLanguageReader>).use === 'function';
}
