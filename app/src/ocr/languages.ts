/**
 * The languages Make searchable can read, in the order the picker shows
 * them: English first, then the languages of India, then the rest.
 *
 * Each one is a Tesseract model ("best_int", the small fast kind) from the
 * `@tesseract.js-data/<code>` package, copied to /tesseract/<version>/lang/
 * by scripts/copy-ocr-assets.mjs, which reads this list. English is fetched
 * when the tool page opens, so it works offline; every other model is fetched
 * from this site the first time somebody picks it, and never before.
 *
 * Plain data with no imports: the page, the op worker and the copy script
 * all read it.
 */

/** The writing system a language is printed in. Only `latin` fits the PDF's built-in font. */
export type OcrScript =
  | 'latin'
  | 'devanagari'
  | 'malayalam'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'bengali'
  | 'gujarati'
  | 'gurmukhi'
  | 'arabic'
  | 'han'
  | 'japanese'
  | 'hangul'
  | 'cyrillic';

export interface OcrLanguage {
  /** Tesseract's code, which is also the model's file name. */
  readonly code: string;
  /** The name in English. */
  readonly name: string;
  /** The name in its own script, so somebody can find their language without reading English. */
  readonly native: string;
  readonly script: OcrScript;
  /** Which part of the picker it sits in. */
  readonly region: 'first' | 'india' | 'world';
  /** The model's download size in megabytes (gzipped), rounded to one place. A unit test checks it. */
  readonly megabytes: number;
}

export const OCR_LANGUAGES: readonly OcrLanguage[] = [
  { code: 'eng', name: 'English', native: 'English', script: 'latin', region: 'first', megabytes: 3.0 },

  { code: 'mal', name: 'Malayalam', native: 'മലയാളം', script: 'malayalam', region: 'india', megabytes: 2.8 },
  { code: 'hin', name: 'Hindi', native: 'हिन्दी', script: 'devanagari', region: 'india', megabytes: 1.4 },
  { code: 'tam', name: 'Tamil', native: 'தமிழ்', script: 'tamil', region: 'india', megabytes: 1.4 },
  { code: 'tel', name: 'Telugu', native: 'తెలుగు', script: 'telugu', region: 'india', megabytes: 1.7 },
  { code: 'kan', name: 'Kannada', native: 'ಕನ್ನಡ', script: 'kannada', region: 'india', megabytes: 1.9 },
  { code: 'ben', name: 'Bengali', native: 'বাংলা', script: 'bengali', region: 'india', megabytes: 1.4 },
  { code: 'mar', name: 'Marathi', native: 'मराठी', script: 'devanagari', region: 'india', megabytes: 2.0 },
  { code: 'guj', name: 'Gujarati', native: 'ગુજરાતી', script: 'gujarati', region: 'india', megabytes: 1.2 },
  { code: 'pan', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'gurmukhi', region: 'india', megabytes: 1.4 },
  { code: 'urd', name: 'Urdu', native: 'اردو', script: 'arabic', region: 'india', megabytes: 1.0 },

  { code: 'ara', name: 'Arabic', native: 'العربية', script: 'arabic', region: 'world', megabytes: 1.7 },
  { code: 'fra', name: 'French', native: 'Français', script: 'latin', region: 'world', megabytes: 0.7 },
  { code: 'deu', name: 'German', native: 'Deutsch', script: 'latin', region: 'world', megabytes: 1.3 },
  { code: 'spa', name: 'Spanish', native: 'Español', script: 'latin', region: 'world', megabytes: 2.1 },
  { code: 'por', name: 'Portuguese', native: 'Português', script: 'latin', region: 'world', megabytes: 1.4 },
  { code: 'ita', name: 'Italian', native: 'Italiano', script: 'latin', region: 'world', megabytes: 1.7 },
  { code: 'chi_sim', name: 'Chinese (simplified)', native: '简体中文', script: 'han', region: 'world', megabytes: 1.7 },
  { code: 'jpn', name: 'Japanese', native: '日本語', script: 'japanese', region: 'world', megabytes: 2.0 },
  { code: 'kor', name: 'Korean', native: '한국어', script: 'hangul', region: 'world', megabytes: 1.6 },
  { code: 'rus', name: 'Russian', native: 'Русский', script: 'cyrillic', region: 'world', megabytes: 2.7 },
];

/** The one that is ready the moment the page is. */
export const PRELOADED_LANGUAGE = 'eng';

const BY_CODE: ReadonlyMap<string, OcrLanguage> = new Map(OCR_LANGUAGES.map((l) => [l.code, l]));

/** The language with this code, or undefined for one we do not have. */
export function ocrLanguage(code: string): OcrLanguage | undefined {
  return BY_CODE.get(code);
}

/** "Malayalam", or the code itself for one we do not know (never shown: params are checked first). */
export function languageName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}

/** True when every word in these languages can sit in the PDF's searchable layer as it is. */
export function allLatin(codes: readonly string[]): boolean {
  return codes.every((code) => BY_CODE.get(code)?.script === 'latin');
}
