/**
 * Words in any script as real, invisible text: the way a scanner makes a
 * Malayalam page searchable. PDF's built-in fonts draw Latin letters only,
 * so a Malayalam, Hindi, Tamil or Arabic word that the browser drew as a
 * picture (or that the OCR reader found on a scan) goes in here as text
 * nobody sees but every reader can search, select, copy and read aloud.
 *
 * The font draws nothing: a few hundred bytes of our own (made by
 * scripts/gen-glyphless.py), one blank glyph every character maps to. The
 * text is written in UTF-16 code units straight through Identity-H, and a
 * ToUnicode map says each code is itself, so what is copied out is exactly
 * the words put in. Text drawn invisible (render mode 3) never shows, so
 * the page looks as it did. Characters outside the Basic Multilingual Plane
 * (emoji) are left out: they would need a pair of codes per character.
 */
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFRef,
  PDFString,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rotateAndSkewTextDegreesAndTranslate,
  setCharacterSqueeze,
  setFontAndSize,
  setTextRenderingMode,
  showText,
  type PDFOperator,
} from '@cantoo/pdf-lib';

/** The glyphless font: .notdef and one blank glyph, 500 units wide, 1000 to the em. */
const GLYPHLESS_TTF = 'AAEAAAAKAIAAAwAgT1MvMkT7RUAAAAEoAAAAYGNtYXAADABzAAABkAAAADRnbHlmAAAAAAAAAcwAAAABaGVhZC0K0lQAAACsAAAANmhoZWED6QH2AAAA5AAAACRobXR4AfQAAAAAAYgAAAAGbG9jYQAAAAAAAAHEAAAABm1heHAAAwACAAABCAAAACBuYW1lGZ8ZNAAAAdAAAABycG9zdAAHAAAAAAJEAAAAJgABAAAAAQAAgmg2ll8PPPUAAwPoAAAAAOb6SLoAAAAA5vpIugAAAAAAAAAAAAAAAwACAAAAAAAAAAEAAAPoAAAAAAH0AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAEAAAACAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwH0AZAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAACAAIAPoAAAAAAPoAAAAAAAAAAAAAAAAAAAAAAAgAAAB9AAAAAAAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAIAAAAAQABAABAAAAIP//AAAAIP///+EAAQAAAAAAAAAAAAAAAAAAAAAAAAAEADYAAQAAAAAAAQANAAAAAQAAAAAAAgAHAA0AAwABBAkAAQAaABQAAwABBAkAAgAOAC5HbHlwaExlc3NGb250UmVndWxhcgBHAGwAeQBwAGgATABlAHMAcwBGAG8AbgB0AFIAZQBnAHUAbABhAHIAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAADAAA=';

const NAME = 'GlyphLessFont';
const WIDTH = 0.5; // of the point size, for every character

const made = new WeakMap<PDFDocument, PDFRef>();

function bytesOf(base64: string): Uint8Array {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Each code is itself: 256 ranges, one per high byte, as readers expect. */
function toUnicodeCMap(): string {
  const ranges: string[] = [];
  for (let hi = 0; hi < 256; hi++) {
    const h = hi.toString(16).padStart(2, '0').toUpperCase();
    ranges.push(`<${h}00> <${h}FF> <${h}00>`);
  }
  const blocks: string[] = [];
  for (let i = 0; i < ranges.length; i += 100) {
    const part = ranges.slice(i, i + 100);
    blocks.push(`${part.length} beginbfrange\n${part.join('\n')}\nendbfrange`);
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/** The document's one copy of the font, made the first time it is needed. */
export function glyphlessFont(doc: PDFDocument): PDFRef {
  const known = made.get(doc);
  if (known) return known;
  const context = doc.context;
  const ttf = bytesOf(GLYPHLESS_TTF);
  const fontFile = context.register(context.flateStream(ttf, { Length1: ttf.length }));
  const descriptor = context.register(
    context.obj({ Type: 'FontDescriptor', FontName: NAME, Flags: 5, FontBBox: [0, 0, 500, 1000], ItalicAngle: 0, Ascent: 1000, Descent: 0, CapHeight: 1000, StemV: 80, FontFile2: fontFile }),
  );
  // Every code to glyph 1, the blank one.
  const map = new Uint8Array(131072);
  for (let i = 1; i < map.length; i += 2) map[i] = 1;
  const cidToGid = context.register(context.flateStream(map));
  const cidFont = context.register(
    context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: NAME,
      CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
      FontDescriptor: descriptor,
      DW: 500,
      CIDToGIDMap: cidToGid,
    }),
  );
  const toUnicode = context.register(context.flateStream(toUnicodeCMap()));
  const font = context.register(context.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: NAME, Encoding: 'Identity-H', DescendantFonts: [cidFont], ToUnicode: toUnicode }));
  made.set(doc, font);
  return font;
}

const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const LTR = /[A-Za-z0-9\u00c0-\u024f\u0900-\u0dff]/;

/**
 * A right-to-left word (Arabic, Urdu, Hebrew) is stored the way PDF makers
 * store it, in the order it is drawn, left to right; readers turn it back.
 */
function inDrawnOrder(text: string): string[] {
  const chars = [...text];
  return RTL.test(text) && !LTR.test(text) ? chars.reverse() : chars;
}

/** The text as UTF-16 codes, emoji and controls left out. */
export function unicodeCodes(text: string): string {
  let hex = '';
  for (const ch of inDrawnOrder(text)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0xffff || cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue;
    hex += cp.toString(16).padStart(4, '0').toUpperCase();
  }
  return hex;
}

/** A run of words to write: where its baseline starts, how wide it should come out, how tall. */
export interface InvisibleRun {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly size: number;
  readonly rotation?: number;
}

/** The operators for runs of invisible words in the glyphless font, under the page's name for it. */
export function invisibleOperators(key: PDFName, runs: readonly InvisibleRun[]): PDFOperator[] {
  const ops: PDFOperator[] = [];
  for (const run of runs) {
    const hex = unicodeCodes(run.text);
    if (hex.length === 0 || !(run.width > 0) || !(run.size > 0)) continue;
    const natural = (hex.length / 4) * WIDTH * run.size;
    ops.push(
      setFontAndSize(key, run.size),
      setCharacterSqueeze(Math.min(1000, Math.max(5, (100 * run.width) / natural))),
      rotateAndSkewTextDegreesAndTranslate(run.rotation ?? 0, 0, 0, run.x, run.y),
      showText(PDFHexString.of(hex)),
    );
  }
  if (ops.length === 0) return [];
  return [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible), ...ops, endText(), popGraphicsState()];
}

/** Writes the runs onto the page as invisible text; how many went in. */
export function writeInvisible(doc: PDFDocument, page: PDFPage, runs: readonly InvisibleRun[]): number {
  const usable = runs.filter((r) => unicodeCodes(r.text).length > 0);
  if (usable.length === 0) return 0;
  const key = page.node.newFontDictionary(NAME, glyphlessFont(doc));
  const ops = invisibleOperators(key, usable);
  if (ops.length > 0) page.pushOperators(...ops);
  return usable.length;
}
