/**
 * Font families, as near as the converters can tell them. A PDF names its
 * fonts in whatever way the program that made it chose ("ABCDEF+TimesNewRoman
 * PS-BoldMT"), and Word names them by face; all the model keeps is which of
 * three families a face belongs to, because that is what survives being
 * re-set in a different font on a different machine.
 */
import type { Run } from './model';

export type Family = NonNullable<Run['family']>;

const MONO = /mono|consol|courier|menlo|lucida ?console|source ?code|fira ?code|inconsolata|typewriter|fixed/i;
const SERIF =
  /serif|times|roman|cambria|georgia|garamond|palatino|book ?antiqua|minion|baskerville|didot|bodoni|century|constantia|charter|merriweather|playfair|lora|caslon|cochin|hoefler|bookman|cmr\d|nimbus ?rom|tinos|gelasio|crimson|libre ?bask/i;

/** Which family a font name suggests, or undefined when the name says nothing (pdf.js's "g_d0_f1"). */
export function familyOf(fontName: string): Family | undefined {
  const name = fontName.replace(/^[A-Z]{6}\+/, '');
  if (MONO.test(name)) return 'mono';
  if (/sans/i.test(name)) return 'sans';
  if (SERIF.test(name)) return 'serif';
  if (/^g_d\d+_f\d+$/i.test(name) || name.trim() === '') return undefined;
  return 'sans';
}

/** The face a family is written as in Word: fonts every copy of Office has. */
export const WORD_FONT: Readonly<Record<Family, string>> = { sans: 'Calibri', serif: 'Cambria', mono: 'Consolas' };

/** The same family as a CSS stack, for HTML and EPUB. */
export const CSS_FONT: Readonly<Record<Family, string>> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, Consolas, "Courier New", monospace',
};

/** "#rrggbb" in lower case, or undefined for anything else (including "auto"). */
export function normaliseColor(color: string | undefined): string | undefined {
  if (color === undefined) return undefined;
  const hex = color.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('').toLowerCase()}`;
  return undefined;
}
