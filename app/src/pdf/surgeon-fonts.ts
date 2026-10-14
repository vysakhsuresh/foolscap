/**
 * Writing new words in the font a document already carries, so a changed
 * line looks like its neighbours rather than like Helvetica standing in.
 *
 * A font is only reused when every character can be written in it for sure:
 * its codes come from the font's own ToUnicode map (or WinAnsi, which a
 * simple font names), its widths from its own Widths or W array, and — for a
 * subset, which carries only the glyphs the document used — only characters
 * the page already shows in that font. Anything less and the caller falls
 * back to the nearest built-in face.
 */
import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
  type PDFContext,
  type PDFObject,
  type PDFPage,
} from '@cantoo/pdf-lib';

export interface OwnFont {
  /** The font dictionary, to name in the page's resources. */
  readonly ref: PDFRef;
  /**
   * The line as a TJ array: hex strings of the font's codes, and a gap in
   * thousandths of an em (negative: move right) where a space goes that the
   * font cannot draw. Null when any other character cannot be written.
   */
  pieces(text: string): Array<PDFHexString | PDFNumber> | null;
  /** The line's width, in ems, as `pieces` writes it. */
  width(text: string): number;
}

/** The gap left for a space the font has no glyph for: a quarter of an em, as most faces' space. */
const SPACE_GAP = 250;

/** WinAnsi's codes 0x80–0x9F, the only ones that are not Latin-1. */
const WIN_ANSI_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

const WIN_ANSI_CODE = new Map(Object.entries(WIN_ANSI_HIGH).map(([code, u]) => [u, Number(code)]));

/** A name without its subset tag, spaces or punctuation, for comparing what pdf.js and the file call a font. */
const bare = (name: string) => name.replace(/^[A-Z]{6}\+/, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();

const nameOf = (o: PDFObject | undefined): string | null => (o instanceof PDFName ? o.decodeText() : null);

const numberOf = (o: PDFObject | undefined): number | null => (o instanceof PDFNumber ? o.asNumber() : null);

function hexBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function utf16(hex: string): string {
  const units: number[] = [];
  for (let i = 0; i + 3 < hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
  return String.fromCharCode(...units);
}

/**
 * A ToUnicode CMap read backwards: each character to the code that draws it.
 * Where several codes draw one character, the first is kept.
 */
export function readToUnicode(cmap: string): { codes: Map<string, number>; bytes: number } {
  const codes = new Map<string, number>();
  let bytes = 1;
  const put = (src: string, text: string) => {
    bytes = Math.max(bytes, src.length / 2);
    if (text.length > 0 && !codes.has(text)) codes.set(text, parseInt(src, 16));
  };
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of (block[1] ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) put(m[1] ?? '', utf16(m[2] ?? ''));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of (block[1] ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(m[1] ?? '0', 16);
      const hi = parseInt(m[2] ?? '0', 16);
      const width = (m[1] ?? '').length;
      if (hi < lo || hi - lo > 0xffff) continue;
      const dst = m[3] ?? '';
      if (dst.startsWith('[')) {
        const each = [...dst.matchAll(/<([0-9a-fA-F]*)>/g)].map((d) => utf16(d[1] ?? ''));
        each.forEach((text, k) => {
          if (lo + k <= hi) put((lo + k).toString(16).padStart(width, '0'), text);
        });
      } else {
        const start = dst.slice(1, -1);
        // The last UTF-16 unit counts up through the range.
        const head = start.slice(0, -4);
        const last = parseInt(start.slice(-4) || '0', 16);
        for (let code = lo; code <= hi; code++) put(code.toString(16).padStart(width, '0'), utf16(head + (last + code - lo).toString(16).padStart(4, '0')));
      }
    }
  }
  return { codes, bytes };
}

function streamText(stream: PDFObject | undefined, context: PDFContext): string | null {
  const s = stream instanceof PDFRef ? context.lookup(stream) : stream;
  if (!(s instanceof PDFRawStream)) return null;
  try {
    return new TextDecoder('latin1').decode(decodePDFRawStream(s).decode());
  } catch {
    return null;
  }
}

/** A font dictionary turned into an OwnFont, or null when it cannot be written in safely. */
function fontFrom(dict: PDFDict, ref: PDFRef, context: PDFContext, chars: ReadonlySet<string>): OwnFont | null {
  const subtype = nameOf(dict.get(PDFName.of('Subtype')));
  const base = nameOf(dict.get(PDFName.of('BaseFont'))) ?? '';
  const subset = /^[A-Z]{6}\+/.test(base);
  const map = streamText(dict.get(PDFName.of('ToUnicode')), context);
  const read = map ? readToUnicode(map) : null;
  let codeOf: (ch: string) => number | undefined;
  let bytes: number;
  let widthOf: (code: number) => number | null;
  let canDraw: (ch: string, code: number) => boolean;

  if (subtype === 'Type0') {
    if (nameOf(dict.get(PDFName.of('Encoding'))) !== 'Identity-H' || !read) return null;
    const descendants = dict.lookup(PDFName.of('DescendantFonts'));
    const cid = descendants instanceof PDFArray ? descendants.lookup(0) : null;
    if (!(cid instanceof PDFDict)) return null;
    const dw = numberOf(cid.lookup(PDFName.of('DW'))) ?? 1000;
    const widths = new Map<number, number>();
    const w = cid.lookup(PDFName.of('W'));
    if (w instanceof PDFArray) {
      const list = w.asArray().map((o) => (o instanceof PDFRef ? context.lookup(o) : o));
      for (let i = 0; i < list.length; ) {
        const first = numberOf(list[i]);
        const next = list[i + 1];
        if (first === null) break;
        if (next instanceof PDFArray) {
          next.asArray().forEach((o, k) => {
            const v = numberOf(o instanceof PDFRef ? context.lookup(o) : o);
            if (v !== null) widths.set(first + k, v);
          });
          i += 2;
        } else {
          const last = numberOf(next);
          const v = numberOf(list[i + 2]);
          if (last === null || v === null) break;
          for (let c = first; c <= last && c - first < 0x10000; c++) widths.set(c, v);
          i += 3;
        }
      }
    }
    codeOf = (ch) => read.codes.get(ch);
    bytes = Math.max(2, read.bytes);
    widthOf = (code) => widths.get(code) ?? dw;
    // A composite font carries only the glyphs it was given: only what the page already shows.
    canDraw = (ch) => chars.has(ch);
  } else if (subtype === 'Type1' || subtype === 'TrueType' || subtype === 'MMType1') {
    const first = numberOf(dict.lookup(PDFName.of('FirstChar')));
    const list = dict.lookup(PDFName.of('Widths'));
    if (first === null || !(list instanceof PDFArray)) return null;
    const descriptor = dict.lookup(PDFName.of('FontDescriptor'));
    const missing = descriptor instanceof PDFDict ? (numberOf(descriptor.lookup(PDFName.of('MissingWidth'))) ?? 0) : 0;
    const embedded = descriptor instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => descriptor.has(PDFName.of(k)));
    const encoding = dict.lookup(PDFName.of('Encoding'));
    const differs = new Set<number>();
    let winAnsi = nameOf(encoding) === 'WinAnsiEncoding';
    if (encoding instanceof PDFDict) {
      winAnsi = nameOf(encoding.get(PDFName.of('BaseEncoding'))) === 'WinAnsiEncoding';
      const diff = encoding.lookup(PDFName.of('Differences'));
      if (diff instanceof PDFArray) {
        let code = 0;
        for (const o of diff.asArray()) {
          const n = numberOf(o);
          if (n !== null) code = n;
          else differs.add(code++);
        }
      }
    }
    if (!read && !winAnsi) return null;
    const fromWinAnsi = (ch: string): number | undefined => {
      const u = ch.codePointAt(0) ?? 0;
      if (ch.length !== 1) return undefined;
      const code = (u >= 0x20 && u <= 0x7e) || (u >= 0xa0 && u <= 0xff) ? u : WIN_ANSI_CODE.get(u);
      return code !== undefined && !differs.has(code) ? code : undefined;
    };
    codeOf = (ch) => read?.codes.get(ch) ?? (winAnsi ? fromWinAnsi(ch) : undefined);
    bytes = 1;
    widthOf = (code) => {
      const v = numberOf(list.lookup(code - first) as PDFObject | undefined);
      return v ?? (missing > 0 ? missing : null);
    };
    // A whole font (or one the reader supplies) draws whatever it has a width for; a subset, only what the page already shows.
    canDraw = (ch, code) => (subset && embedded ? chars.has(ch) : (widthOf(code) ?? 0) > 0);
  } else return null;
  if (bytes > 2) return null;

  const plan = (text: string): Array<{ code: number } | { gap: number }> | null => {
    const out: Array<{ code: number } | { gap: number }> = [];
    for (const ch of text) {
      const code = codeOf(ch);
      if (code !== undefined && canDraw(ch, code) && widthOf(code) !== null) out.push({ code });
      else if (ch === ' ') out.push({ gap: SPACE_GAP });
      else return null;
    }
    return out;
  };
  return {
    ref,
    pieces(text) {
      const steps = plan(text);
      if (!steps) return null;
      const out: Array<PDFHexString | PDFNumber> = [];
      let run = '';
      for (const step of steps) {
        if ('code' in step) run += step.code.toString(16).padStart(bytes * 2, '0');
        else {
          if (run) out.push(PDFHexString.of(run));
          run = '';
          out.push(PDFNumber.of(-step.gap));
        }
      }
      if (run) out.push(PDFHexString.of(run));
      return out;
    },
    width(text) {
      let total = 0;
      for (const step of plan(text) ?? []) total += 'code' in step ? (widthOf(step.code) ?? 0) : step.gap;
      return total / 1000;
    },
  };
}

/** Every font dictionary the page can reach: its own resources and those of the drawings it uses, a few levels down. */
function fontsOn(page: PDFPage, context: PDFContext): Array<{ dict: PDFDict; ref: PDFRef }> {
  const out: Array<{ dict: PDFDict; ref: PDFRef }> = [];
  const seen = new Set<PDFDict>();
  const walk = (resources: PDFObject | undefined, depth: number) => {
    const res = resources instanceof PDFRef ? context.lookup(resources) : resources;
    if (!(res instanceof PDFDict) || depth > 3) return;
    const fonts = res.lookup(PDFName.of('Font'));
    if (fonts instanceof PDFDict) {
      for (const [, value] of fonts.entries()) {
        const dict = value instanceof PDFRef ? context.lookup(value) : value;
        if (!(dict instanceof PDFDict) || seen.has(dict)) continue;
        seen.add(dict);
        out.push({ dict, ref: value instanceof PDFRef ? value : context.register(dict) });
      }
    }
    const xobjects = res.lookup(PDFName.of('XObject'));
    if (xobjects instanceof PDFDict) {
      for (const [, value] of xobjects.entries()) {
        const x = value instanceof PDFRef ? context.lookup(value) : value;
        if (x instanceof PDFStream && nameOf(x.dict.get(PDFName.of('Subtype'))) === 'Form') walk(x.dict.get(PDFName.of('Resources')), depth + 1);
      }
    }
  };
  walk(page.node.get(PDFName.of('Resources')) ?? page.node.Resources(), 0);
  return out;
}

/**
 * The page's own font called `name` (as pdf.js names it), able to write
 * `text`; `chars` are the characters the page already shows in it. Null when
 * there is no such font or it cannot write every character for certain.
 */
export function ownFont(page: PDFPage, context: PDFContext, name: string, chars: string, text: string): OwnFont | null {
  const want = bare(name);
  if (want === '') return null;
  const shown = new Set(chars);
  const fonts = fontsOn(page, context).map((f) => ({ ...f, base: nameOf(f.dict.get(PDFName.of('BaseFont'))) ?? '' }));
  // The very font first. A name without its subset tag may stand for several subsets of one
  // face, each holding different letters, and the page's letters cannot say which holds which:
  // then only a whole (untagged) font of that name will do.
  const exact = fonts.filter((f) => f.base === name);
  const alike = fonts.filter((f) => bare(f.base) === want);
  const subsets = new Set(alike.filter((f) => /^[A-Z]{6}\+/.test(f.base)).map((f) => f.base));
  const candidates = exact.length > 0 ? exact : subsets.size > 1 ? alike.filter((f) => !/^[A-Z]{6}\+/.test(f.base)) : alike;
  for (const { dict, ref } of candidates) {
    const font = fontFrom(dict, ref, context, shown);
    if (font && font.pieces(text) !== null) return font;
  }
  return null;
}
