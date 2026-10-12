/**
 * What Make searchable is asked to do: which languages the scan is in.
 * Plain data, like every op's params, so it crosses postMessage; checked
 * again by the op, because the page is not the only thing that can post a
 * job.
 */
import { ocrLanguage, PRELOADED_LANGUAGE } from '../ocr/languages';

export interface OcrParams {
  /**
   * Tesseract codes ("eng", "mal"), the main language first. One to three:
   * each extra language makes the reading slower and, past three, worse.
   */
  readonly languages: readonly string[];
}

/** More than this and Tesseract spends its time choosing between alphabets. */
export const MAX_OCR_LANGUAGES = 3;

export const DEFAULT_OCR_PARAMS: OcrParams = { languages: [PRELOADED_LANGUAGE] };

export type CheckedOcrParams = { readonly ok: true; readonly languages: readonly string[] } | { readonly ok: false; readonly reason: string };

/**
 * The languages to read in, or the sentence that says why not. Repeats are
 * dropped rather than refused. Params with no `languages` at all (a job
 * posted before the picker existed) mean English.
 */
export function checkOcrParams(params: Partial<OcrParams> | null | undefined): CheckedOcrParams {
  const given = params?.languages;
  if (given === undefined) return { ok: true, languages: DEFAULT_OCR_PARAMS.languages };
  if (!Array.isArray(given)) return { ok: false, reason: 'Pick the language the scan is in.' };
  const languages: string[] = [];
  for (const code of given) {
    if (typeof code !== 'string' || ocrLanguage(code) === undefined) return { ok: false, reason: 'One of those languages is not one this tool can read.' };
    if (!languages.includes(code)) languages.push(code);
  }
  if (languages.length === 0) return { ok: false, reason: 'Pick the language the scan is in.' };
  if (languages.length > MAX_OCR_LANGUAGES) return { ok: false, reason: `Pick up to ${MAX_OCR_LANGUAGES} languages. More than that makes the reading worse, not better.` };
  return { ok: true, languages };
}
