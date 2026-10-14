/**
 * One correction to pdf.js's worker, applied when it is bundled
 * (vite.config.ts) and when the tests load it (tests/fixtures/pdfjs-worker.ts).
 *
 * While reading a page's words, pdf.js treats a glyph whose text contains a
 * nonspacing mark (Unicode category Mn) as a "zero-width diacritic": an
 * accent drawn over the letter before it, taking no room, so the reading
 * position does not move. That is right for an accent the font gives no
 * width. It is wrong for Malayalam, Hindi, Tamil and the other Indic
 * scripts, where a consonant with its vowel sign ("ഹു", "कु") or a vowel sign
 * alone ("ു") is a glyph with a real width: pdf.js lost that width, took the
 * gap it left before the next letter for a space, and read "ബഹുമാനപ്പെട്ട" as
 * "ബഹു മാനപ്പെട്ട" (and Excel and Word got the broken words). Here a glyph is a
 * zero-width diacritic only when the font gives it no width.
 *
 * pdf.js keeps the category on its Glyph class; the patch wraps that getter.
 * If pdf.js changes it the build stops, rather than quietly shipping the old
 * behaviour: look at the new code and move the fix, or drop the patch if
 * pdf.js has fixed it upstream.
 */

/** Where the getter asks for the category, in the plain build and the minified one. */
const CATEGORY = /shadow\(this,\s*"category",\s*/;
const HELPER = '__foolscapWidthAware';
/** `widthAware` survives minifying (a property name), so a test can see the build carries the patch. */
const HELPER_SOURCE = `function ${HELPER}(g,c){return c.isZeroWidthDiacritic&&g.width>0?{isWhitespace:c.isWhitespace,isZeroWidthDiacritic:false,isInvisibleFormatMark:c.isInvisibleFormatMark,widthAware:true}:c}\n`;

/** True for pdf.js's worker module, minified or not. */
export const isPdfjsWorker = (id: string): boolean => /pdfjs-dist[\\/]build[\\/]pdf\.worker(\.min)?\.mjs$/.test(id.split('?')[0] ?? id);

/** The worker's source with the correction made; throws when the code it corrects is not there. */
export function patchPdfjsWorker(code: string): string {
  if (code.includes(HELPER)) return code;
  const getter = code.indexOf('get category()');
  const match = getter < 0 ? null : CATEGORY.exec(code.slice(getter, getter + 400));
  const call = match === null ? -1 : code.indexOf('(this.unicode)', getter);
  if (match === null || call < 0 || call > getter + 600) {
    throw new Error("pdf.js's Glyph category getter has changed; scripts/pdfjs-patch.ts no longer applies. See that file.");
  }
  const open = getter + match.index + match[0].length;
  const close = call + '(this.unicode)'.length;
  return HELPER_SOURCE + code.slice(0, open) + `${HELPER}(this,` + code.slice(open, close) + ')' + code.slice(close);
}
