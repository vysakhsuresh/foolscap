/**
 * Puts a certificate signature into a PDF: the kind a reader shows as
 * "Signed by …" and checks, not a picture of a hand.
 *
 * Always an incremental update. The original bytes are kept exactly as they
 * were and the signature's objects are appended after them, with their own
 * cross-reference section pointing back at the old one (/Prev). That is what
 * makes it safe to sign a document somebody has already signed: their
 * signature covers bytes 0 to the end of their revision, and nothing in
 * those bytes moves. It also means nothing pdf-lib would otherwise rewrite —
 * object numbering, object streams, quirks of the original writer — is
 * touched. pdf-lib is used only to read the structure and to build the new
 * objects; the bytes of the update are laid out here, by hand, so the hole
 * for the signature (/Contents) and the /ByteRange around it are known to
 * the byte.
 *
 * The one exception: a file whose last cross-reference offset does not
 * point at a cross-reference (damaged, or hand-edited) cannot have anything
 * appended that a reader will trust. If it is unsigned it is rewritten whole
 * first, then signed; if it is already signed it is refused, because the
 * rewrite would break the first signature.
 *
 * Encrypted files are refused: the signature would have to be written
 * encrypted too, and removing the password first is one tap away.
 */
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, StandardFonts, type PDFFont, type PDFImage, type PDFObject, type PDFPage } from '@cantoo/pdf-lib';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import { PdfError, type Rotation } from './types';

export interface SignPdfOptions {
  /** 0-based. */
  readonly page: number;
  /**
   * Where the visible signature goes, as fractions of the page as the reader
   * sees it (after /Rotate), from its top-left corner. Absent: an invisible
   * signature, which readers still list and check.
   */
  readonly area?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** The signer's name, for /Name and the visible text. */
  readonly name: string;
  readonly reason?: string;
  readonly location?: string;
  /** A picture of a handwritten signature to show in the area. */
  readonly appearance?: { readonly png: Uint8Array };
  /** The moment of signing, written as /M. Pass the same Date to the CMS signer. Defaults to now. */
  readonly date?: Date;
  /**
   * Bytes to leave for the signature. 16 KB unless said otherwise; if the
   * signature comes back larger, the hole is made larger and it is signed
   * again, so this is a hint, not a limit.
   */
  readonly reserve?: number;
}

/** Signs the covered bytes (the file with its /Contents hole taken out) and returns DER CMS. */
export type SignCallback = (data: Uint8Array) => Promise<Uint8Array>;

export const ALREADY_SIGNED_MESSAGE = 'This PDF is already signed. Signing it again here would break the first signature.';

const DEFAULT_RESERVE = 16_384;

export async function signPdf(pdf: Uint8Array, opts: SignPdfOptions, sign: SignCallback): Promise<Uint8Array> {
  checkOptions(opts);
  try {
    let source = pdf;
    let doc = await open(source);
    const signed = hasSignatures(doc);
    if (lockedByCertification(doc)) {
      throw new PdfError(
        "This PDF was certified with a signature that allows no changes, so it can't be signed again without breaking that signature.",
        'unknown',
      );
    }
    let tail = readTail(source);
    if (tail === null) {
      if (signed) throw new PdfError(ALREADY_SIGNED_MESSAGE, 'unknown');
      source = await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
      doc = await open(source);
      tail = readTail(source);
      if (tail === null) throw notReadable(source, new Error('No usable cross-reference after rewrite'));
    }
    if (opts.page < 0 || opts.page >= doc.getPageCount()) throw new Error(`There is no page ${opts.page + 1} in this document.`);

    const date = opts.date ?? new Date();
    const update = await buildUpdate(doc, opts, date);
    let reserve = Math.max(opts.reserve ?? DEFAULT_RESERVE, 1);
    for (;;) {
      const laid = layOut(source, tail, update, sigDictionary(opts, date, reserve));
      const covered = new Uint8Array(laid.contentsStart + (laid.bytes.length - laid.contentsEnd));
      covered.set(laid.bytes.subarray(0, laid.contentsStart), 0);
      covered.set(laid.bytes.subarray(laid.contentsEnd), laid.contentsStart);
      const cms = await sign(covered);
      if (cms.length > reserve) {
        // A long chain: make the hole bigger and sign again. Nothing has been handed out yet.
        reserve = cms.length + 2_048;
        continue;
      }
      const hex = new TextEncoder().encode(toHex(cms));
      laid.bytes.set(hex, laid.contentsStart + 1);
      return laid.bytes;
    }
  } catch (error) {
    if (error instanceof PdfError) throw error;
    if (isMemoryFailure(error)) throw tooLarge(pdf.byteLength, error);
    throw error;
  }
}

function checkOptions(opts: SignPdfOptions): void {
  if (!Number.isInteger(opts.page)) throw new Error('The page must be a whole number.');
  const a = opts.area;
  if (a === undefined) return;
  const finite = [a.x, a.y, a.w, a.h].every((n) => Number.isFinite(n));
  if (!finite || a.w <= 0 || a.h <= 0 || a.x < 0 || a.y < 0 || a.x + a.w > 1.000001 || a.y + a.h > 1.000001) {
    throw new Error('The signature area must sit inside the page.');
  }
}

async function open(bytes: Uint8Array): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    doc.getPageCount();
  } catch (error) {
    if (isMemoryFailure(error)) throw tooLarge(bytes.byteLength, error);
    throw notReadable(bytes, error);
  }
  if (doc.isEncrypted) {
    throw new PdfError('This PDF is locked with a password. Remove the password first, then sign it.', 'encrypted');
  }
  return doc;
}

// ---------------------------------------------------------------- what is already there

/** Every field in the form, walking /Kids, with /FT inherited as the spec says. */
function* fields(doc: PDFDocument): Generator<{ dict: PDFDict; type: string | undefined }> {
  const form = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (!(form instanceof PDFDict)) return;
  const top = form.lookup(PDFName.of('Fields'));
  if (!(top instanceof PDFArray)) return;
  const seen = new Set<PDFDict>();
  const walk = function* (array: PDFArray, inherited: string | undefined): Generator<{ dict: PDFDict; type: string | undefined }> {
    for (let i = 0; i < array.size(); i++) {
      const dict = array.lookup(i);
      if (!(dict instanceof PDFDict) || seen.has(dict)) continue;
      seen.add(dict);
      const ft = dict.lookup(PDFName.of('FT'));
      const type = ft instanceof PDFName ? ft.decodeText() : inherited;
      yield { dict, type };
      const kids = dict.lookup(PDFName.of('Kids'));
      if (kids instanceof PDFArray) yield* walk(kids, type);
    }
  };
  yield* walk(top, undefined);
}

function hasSignatures(doc: PDFDocument): boolean {
  for (const { dict, type } of fields(doc)) {
    if (type === 'Sig' && dict.lookup(PDFName.of('V')) instanceof PDFDict) return true;
  }
  return false;
}

/** A certification signature with /P 1 forbids every later change, signatures included. */
function lockedByCertification(doc: PDFDocument): boolean {
  const perms = doc.catalog.lookup(PDFName.of('Perms'));
  if (!(perms instanceof PDFDict)) return false;
  const sig = perms.lookup(PDFName.of('DocMDP'));
  if (!(sig instanceof PDFDict)) return false;
  const refs = sig.lookup(PDFName.of('Reference'));
  if (!(refs instanceof PDFArray)) return false;
  for (let i = 0; i < refs.size(); i++) {
    const ref = refs.lookup(i);
    if (!(ref instanceof PDFDict)) continue;
    const params = ref.lookup(PDFName.of('TransformParams'));
    const p = params instanceof PDFDict ? params.lookup(PDFName.of('P')) : undefined;
    if (p instanceof PDFNumber && p.asNumber() === 1) return true;
  }
  return false;
}

/** The last cross-reference section, which the update's /Prev points at. */
interface Tail {
  readonly prev: number;
  /** A file whose last section is a cross-reference stream gets one in the update too. */
  readonly stream: boolean;
}

/**
 * Reads `startxref` from the end of the file and checks it lands on a
 * cross-reference table or stream. Null when it does not, which means a
 * reader would not find the update either.
 */
function readTail(bytes: Uint8Array): Tail | null {
  const end = latin1(bytes.subarray(Math.max(0, bytes.length - 2048)));
  const found = [...end.matchAll(/startxref\s+(\d+)/g)].pop();
  if (!found) return null;
  const prev = Number(found[1]);
  if (!Number.isSafeInteger(prev) || prev <= 0 || prev >= bytes.length) return null;
  const head = latin1(bytes.subarray(prev, Math.min(bytes.length, prev + 4096)));
  if (/^xref\s/.test(head)) return { prev, stream: false };
  const obj = /^\d+\s+\d+\s+obj\b/.exec(head);
  if (obj && /\/Type\s*\/XRef\b/.test(head.slice(0, head.indexOf('stream') === -1 ? head.length : head.indexOf('stream')))) {
    return { prev, stream: true };
  }
  return null;
}

// ---------------------------------------------------------------- the new and changed objects

interface Update {
  readonly doc: PDFDocument;
  /** Indirect objects to write: changed ones keep their number, new ones get fresh ones. */
  readonly refs: readonly PDFRef[];
  /** The signature dictionary's number; it is written by hand, not by pdf-lib. */
  readonly sigRef: PDFRef;
  /** Highest object number before the update (from /Size, so freed numbers are not reused). */
  readonly base: number;
}

async function buildUpdate(doc: PDFDocument, opts: SignPdfOptions, date: Date): Promise<Update> {
  const { context } = doc;
  const root = context.trailerInfo.Root;
  if (!(root instanceof PDFRef)) throw notReadable(new Uint8Array(0), new Error('No catalog reference'));
  const size = context.trailerInfo.Size?.asNumber() ?? 0;
  const base = Math.max(context.largestObjectNumber, size - 1);
  context.largestObjectNumber = base;

  const touched = new Set<PDFRef>();
  const page = doc.getPage(opts.page);

  // The form: the catalog's /AcroForm, its /Fields, and /SigFlags 3
  // (signatures exist; save only by appending).
  const formEntry = doc.catalog.get(PDFName.of('AcroForm'));
  let form: PDFDict;
  if (formEntry instanceof PDFRef && context.lookup(formEntry) instanceof PDFDict) {
    form = context.lookup(formEntry, PDFDict);
    touched.add(formEntry);
  } else if (formEntry instanceof PDFDict) {
    form = formEntry;
    touched.add(root);
  } else {
    form = context.obj({});
    doc.catalog.set(PDFName.of('AcroForm'), context.register(form));
    touched.add(root);
  }
  const fieldsEntry = form.get(PDFName.of('Fields'));
  let fieldList: PDFArray;
  if (fieldsEntry instanceof PDFRef && context.lookup(fieldsEntry) instanceof PDFArray) {
    fieldList = context.lookup(fieldsEntry, PDFArray);
    touched.add(fieldsEntry);
  } else if (fieldsEntry instanceof PDFArray) {
    fieldList = fieldsEntry;
  } else {
    fieldList = context.obj([]);
    form.set(PDFName.of('Fields'), fieldList);
  }
  const flags = form.lookup(PDFName.of('SigFlags'));
  form.set(PDFName.of('SigFlags'), PDFNumber.of((flags instanceof PDFNumber ? flags.asNumber() : 0) | 3));

  const sigRef = context.nextRef();
  const widget = context.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    T: PDFString.of(freeFieldName(doc)),
    F: 132, // Print + Locked: shown on paper, not draggable.
    P: page.ref,
    V: sigRef,
  });
  if (opts.area === undefined) {
    widget.set(PDFName.of('Rect'), context.obj([0, 0, 0, 0]));
  } else {
    const { rect, ap } = await appearance(doc, page, opts, opts.area, date);
    widget.set(PDFName.of('Rect'), context.obj(rect));
    widget.set(PDFName.of('AP'), context.obj({ N: ap }));
  }
  const widgetRef = context.register(widget);
  fieldList.push(widgetRef);

  // The page's /Annots gets the widget too, or no reader will show it.
  const annotsEntry = page.node.get(PDFName.of('Annots'));
  if (annotsEntry instanceof PDFRef && context.lookup(annotsEntry) instanceof PDFArray) {
    context.lookup(annotsEntry, PDFArray).push(widgetRef);
    touched.add(annotsEntry);
  } else if (annotsEntry instanceof PDFArray) {
    annotsEntry.push(widgetRef);
    touched.add(page.ref);
  } else {
    page.node.set(PDFName.of('Annots'), context.obj([widgetRef]));
    touched.add(page.ref);
  }

  const fresh = context
    .enumerateIndirectObjects()
    .map(([ref]) => ref)
    .filter((ref) => ref.objectNumber > base);
  const refs = [...new Set([...touched, ...fresh])].sort((a, b) => a.objectNumber - b.objectNumber);
  return { doc, refs, sigRef, base };
}

/** "Signature1", or the first "SignatureN" no field in the form already uses. */
function freeFieldName(doc: PDFDocument): string {
  const used = new Set<string>();
  for (const { dict } of fields(doc)) {
    const t = dict.lookup(PDFName.of('T'));
    if (t instanceof PDFString || t instanceof PDFHexString) used.add(t.decodeText());
  }
  let n = 1;
  while (used.has(`Signature${n}`)) n++;
  return `Signature${n}`;
}

// ---------------------------------------------------------------- the visible signature

/**
 * A page as its reader sees it: the visible width and height after /Rotate,
 * and the mapping from those coordinates (origin bottom-left of what is on
 * screen) back to the page's own. The same maths as the surgeon's `viewOf`,
 * copied rather than imported so this module stays out of the surgeon.
 */
interface PageView {
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
  toPage(vx: number, vy: number): [number, number];
}

function viewOf(page: PDFPage): PageView {
  const { x, y, width: w, height: h } = page.getCropBox();
  const rotation = normaliseRotation(page.getRotation().angle);
  const sideways = rotation === 90 || rotation === 270;
  return {
    width: sideways ? h : w,
    height: sideways ? w : h,
    rotation,
    toPage(vx, vy) {
      switch (rotation) {
        case 0:
          return [x + vx, y + vy];
        case 90:
          return [x + w - vy, y + vx];
        case 180:
          return [x + w - vx, y + h - vy];
        case 270:
          return [x + vy, y + h - vx];
      }
    },
  };
}

/**
 * The widget's rectangle in page space and its appearance: a form XObject
 * drawn in the reader's orientation (width × height as seen), whose /Matrix
 * turns it by the page's /Rotate so it lands upright. A reader maps the
 * turned box onto /Rect, which is exactly the area asked for.
 */
async function appearance(
  doc: PDFDocument,
  page: PDFPage,
  opts: SignPdfOptions,
  area: NonNullable<SignPdfOptions['area']>,
  date: Date,
): Promise<{ rect: number[]; ap: PDFRef }> {
  const { context } = doc;
  const view = viewOf(page);
  const w = area.w * view.width;
  const h = area.h * view.height;
  const vx = area.x * view.width;
  const vy = (1 - area.y - area.h) * view.height;
  const [x1, y1] = view.toPage(vx, vy);
  const [x2, y2] = view.toPage(vx + w, vy + h);
  const rect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];

  const font = await doc.embedFont(StandardFonts.Helvetica);
  await font.embed();
  let image: PDFImage | undefined;
  if (opts.appearance !== undefined) {
    try {
      image = await doc.embedPng(opts.appearance.png);
      await image.embed();
    } catch (error) {
      throw new PdfError("The signature picture couldn't be read. Draw it again or use a PNG.", 'unknown', { cause: error });
    }
  }

  const pad = Math.min(w, h) * 0.06;
  let textBox = { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad };
  const ops: string[] = [];
  if (image !== undefined) {
    const wide = w >= h * 1.5;
    const picture = wide ? { x: pad, y: pad, w: w / 2 - 1.5 * pad, h: h - 2 * pad } : { x: pad, y: h * 0.4, w: w - 2 * pad, h: h * 0.6 - pad };
    textBox = wide ? { x: w / 2 + pad / 2, y: pad, w: w / 2 - 1.5 * pad, h: h - 2 * pad } : { x: pad, y: pad, w: w - 2 * pad, h: h * 0.4 - 1.5 * pad };
    const scale = Math.min(picture.w / image.width, picture.h / image.height);
    const iw = image.width * scale;
    const ih = image.height * scale;
    ops.push('q', `${n(iw)} 0 0 ${n(ih)} ${n(picture.x + (picture.w - iw) / 2)} ${n(picture.y + (picture.h - ih) / 2)} cm`, '/Im0 Do', 'Q');
  }
  ops.push(...textOps(font, opts.name, date, textBox));

  const turn = rotationMatrix(view.rotation);
  const stream = context.flateStream(ops.join('\n'), {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, w, h],
    Matrix: turn,
    Resources: context.obj({ Font: { F0: font.ref }, ...(image === undefined ? {} : { XObject: { Im0: image.ref } }) }),
  });
  return { rect, ap: context.register(stream) };
}

/** Rotates the appearance counter-clockwise by the page's /Rotate, which the reader then turns back. */
function rotationMatrix(rotation: Rotation): number[] {
  switch (rotation) {
    case 0:
      return [1, 0, 0, 1, 0, 0];
    case 90:
      return [0, 1, -1, 0, 0, 0];
    case 180:
      return [-1, 0, 0, -1, 0, 0];
    case 270:
      return [0, -1, 1, 0, 0, 0];
  }
}

/**
 * "Digitally signed by <name>" and the date, as large as fits the box (at
 * most 12 pt), broken over more lines when that lets it be larger. Helvetica draws WinAnsi only, so characters it cannot draw
 * are dropped from the picture; the name in /Name keeps them all.
 */
function textOps(font: PDFFont, name: string, date: Date, box: { x: number; y: number; w: number; h: number }): string[] {
  const drawable = new Set(font.getCharacterSet());
  const clean = (s: string) =>
    Array.from(s.replace(/\s+/g, ' '))
      .filter((c) => drawable.has(c.codePointAt(0) ?? -1))
      .join('')
      .trim();
  const who = clean(name);
  const [day, time] = readableDate(date);
  const when = `Date: ${day} ${time}`;
  // From one line each to the date split over two: whichever lets the text be largest.
  const layouts =
    who.length === 0
      ? [['Digitally signed', when], ['Digitally signed', `Date: ${day}`, time]]
      : [
          [`Digitally signed by ${who}`, when],
          ['Digitally signed by', who, when],
          ['Digitally signed by', who, `Date: ${day}`, time],
        ];
  const fit = (lines: string[]) =>
    Math.min(12, box.h / (lines.length * 1.2), ...lines.map((l) => box.w / Math.max(font.widthOfTextAtSize(l, 1), 1e-6)));
  let best = layouts[0] ?? [];
  for (const l of layouts) if (fit(l) > fit(best) + 0.01) best = l;
  const size = Math.max(fit(best), 0.5);
  const lineHeight = size * 1.2;
  const top = box.y + box.h - (box.h - lineHeight * best.length) / 2;
  const ops = ['BT', `/F0 ${n(size)} Tf`, '0.1 0.1 0.1 rg'];
  best.forEach((line, i) => {
    const baseline = top - (i + 1) * lineHeight + size * 0.28;
    ops.push(`1 0 0 1 ${n(box.x)} ${n(baseline)} Tm`, `${font.encodeText(line).toString()} Tj`);
  });
  ops.push('ET');
  return ops;
}

// ---------------------------------------------------------------- the signature dictionary and the bytes

const BYTE_RANGE_WIDTH = 36; // "[0 " + three 10-digit numbers + spaces + "]"

/** The /V dictionary, written by hand so the hole and the byte range sit exactly where this code says. */
function sigDictionary(opts: SignPdfOptions, date: Date, reserve: number): string {
  const parts = [
    '<<',
    '/Type /Sig',
    '/Filter /Adobe.PPKLite',
    '/SubFilter /adbe.pkcs7.detached',
    `/ByteRange ${'[0 0 0 0]'.padEnd(BYTE_RANGE_WIDTH, ' ')}`,
    `/Contents <${'0'.repeat(reserve * 2)}>`,
    `/M ${PDFString.of(pdfDate(date)).toString()}`,
    `/Name ${PDFHexString.fromText(opts.name).toString()}`,
  ];
  if (opts.reason !== undefined && opts.reason.length > 0) parts.push(`/Reason ${PDFHexString.fromText(opts.reason).toString()}`);
  if (opts.location !== undefined && opts.location.length > 0) parts.push(`/Location ${PDFHexString.fromText(opts.location).toString()}`);
  parts.push('>>');
  return parts.join('\n');
}

interface Laid {
  readonly bytes: Uint8Array;
  /** Offset of the "<" that opens /Contents. */
  readonly contentsStart: number;
  /** Offset just past the ">" that closes it. */
  readonly contentsEnd: number;
}

/**
 * The original bytes, then the update: each changed or new object, the
 * signature dictionary, a cross-reference section (a table, or a stream when
 * the file already used them) and a trailer with /Prev. The /ByteRange is
 * filled in here; the /Contents hole is left as zeros for the caller.
 */
function layOut(source: Uint8Array, tail: Tail, update: Update, sigDict: string): Laid {
  const { doc, refs, sigRef } = update;
  const { context } = doc;
  const chunks: Uint8Array[] = [];
  const last = source[source.length - 1];
  let at = source.length;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    at += chunk.length;
  };
  if (last !== 0x0a && last !== 0x0d) push(ascii('\n'));

  const offsets = new Map<number, { offset: number; gen: number }>();
  let sigText = { start: 0 };
  const all = [...refs, sigRef].sort((a, b) => a.objectNumber - b.objectNumber);
  for (const ref of all) {
    offsets.set(ref.objectNumber, { offset: at, gen: ref.generationNumber });
    const head = ascii(`${ref.objectNumber} ${ref.generationNumber} obj\n`);
    if (ref === sigRef) {
      push(head);
      sigText = { start: at };
      push(ascii(sigDict));
    } else {
      const object: PDFObject | undefined = context.lookup(ref);
      if (object === undefined) continue;
      const body = new Uint8Array(object.sizeInBytes());
      object.copyBytesInto(body, 0);
      push(head);
      push(body);
    }
    push(ascii('\nendobj\n'));
  }

  const size = Math.max(update.base + 1, ...all.map((r) => r.objectNumber + 1));
  const trailerEntries = [`/Root ${refText(context.trailerInfo.Root)}`, `/Prev ${tail.prev}`, `/ID ${idPair(context.trailerInfo.ID)}`];
  const info = context.trailerInfo.Info;
  if (info instanceof PDFRef) trailerEntries.push(`/Info ${refText(info)}`);

  let startxref: number;
  if (tail.stream) {
    // A cross-reference stream (uncompressed; it is a few hundred bytes): type 1 entries, 4-byte offsets, 2-byte generations.
    const xrefNumber = size;
    startxref = at;
    offsets.set(xrefNumber, { offset: at, gen: 0 });
    const numbers = [...offsets.keys()].sort((a, b) => a - b);
    const data = new Uint8Array(numbers.length * 7);
    numbers.forEach((num, i) => {
      const { offset, gen } = offsets.get(num) ?? { offset: 0, gen: 0 };
      data[i * 7] = 1;
      new DataView(data.buffer).setUint32(i * 7 + 1, offset);
      new DataView(data.buffer).setUint16(i * 7 + 5, gen);
    });
    const dict = [
      '<<',
      '/Type /XRef',
      `/Size ${xrefNumber + 1}`,
      `/Index [${subsections(numbers)
        .map(([first, count]) => `${first} ${count}`)
        .join(' ')}]`,
      '/W [1 4 2]',
      `/Length ${data.length}`,
      ...trailerEntries,
      '>>',
    ].join('\n');
    push(ascii(`${xrefNumber} 0 obj\n${dict}\nstream\n`));
    push(data);
    push(ascii('\nendstream\nendobj\n'));
  } else {
    startxref = at;
    const numbers = [...offsets.keys()].sort((a, b) => a - b);
    const lines = ['xref', '0 1', '0000000000 65535 f\r'];
    for (const [first, count] of subsections(numbers)) {
      lines.push(`${first} ${count}`);
      for (let num = first; num < first + count; num++) {
        const { offset, gen } = offsets.get(num) ?? { offset: 0, gen: 0 };
        lines.push(`${String(offset).padStart(10, '0')} ${String(gen).padStart(5, '0')} n\r`);
      }
    }
    lines.push('trailer', ['<<', `/Size ${size}`, ...trailerEntries, '>>'].join('\n'));
    push(ascii(`${lines.join('\n')}\n`));
  }
  push(ascii(`startxref\n${startxref}\n%%EOF\n`));

  const bytes = new Uint8Array(at);
  bytes.set(source, 0);
  let offset = source.length;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  // Find the hole and the range placeholder inside the signature dictionary.
  const sigBody = latin1(bytes.subarray(sigText.start, sigText.start + sigDict.length));
  const contentsStart = sigText.start + sigBody.indexOf('/Contents <') + '/Contents '.length;
  const contentsEnd = sigText.start + sigBody.indexOf('>', contentsStart - sigText.start) + 1;
  const rangeAt = sigText.start + sigBody.indexOf('/ByteRange ') + '/ByteRange '.length;
  const range = `[0 ${contentsStart} ${contentsEnd} ${bytes.length - contentsEnd}]`.padEnd(BYTE_RANGE_WIDTH, ' ');
  if (range.length !== BYTE_RANGE_WIDTH) throw tooLarge(bytes.length, new RangeError('Byte range too wide'));
  bytes.set(ascii(range), rangeAt);
  return { bytes, contentsStart, contentsEnd };
}

/** Runs of consecutive numbers as [first, count], for xref subsections. */
function subsections(sorted: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const num of sorted) {
    const lastRun = out[out.length - 1];
    if (lastRun !== undefined && lastRun[0] + lastRun[1] === num) lastRun[1]++;
    else out.push([num, 1]);
  }
  return out;
}

function refText(ref: PDFObject | undefined): string {
  if (!(ref instanceof PDFRef)) throw new PdfError("This PDF is damaged and couldn't be read.", 'corrupt');
  return `${ref.objectNumber} ${ref.generationNumber} R`;
}

/** The file's own first ID kept (it names the document), a fresh second one (it names this revision). */
function idPair(existing: PDFObject | undefined): string {
  const fresh = PDFHexString.of(toHex(crypto.getRandomValues(new Uint8Array(16)))).toString();
  if (existing instanceof PDFArray) {
    const first = existing.get(0);
    if (first instanceof PDFHexString || first instanceof PDFString) return `[${first.toString()} ${fresh}]`;
  }
  return `[${fresh} ${fresh}]`;
}

/** D:YYYYMMDDHHmmSS+HH'mm', in the device's own time zone, as readers show it. */
function pdfDate(date: Date): string {
  const [y, mo, d, h, mi, s] = parts(date);
  return `D:${y}${mo}${d}${h}${mi}${s}${zone(date)}`;
}

/** ["2026.10.12", "16:05:09 +05'30'"], the way Acrobat writes the date under a signature. */
function readableDate(date: Date): [string, string] {
  const [y, mo, d, h, mi, s] = parts(date);
  return [`${y}.${mo}.${d}`, `${h}:${mi}:${s} ${zone(date)}`];
}

function parts(date: Date): string[] {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    ...[date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()].map(pad2),
  ];
}

/** The device's offset from UTC as +HH'mm'. */
function zone(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const abs = Math.abs(offset);
  return `${offset >= 0 ? '+' : '-'}${pad2(Math.floor(abs / 60))}'${pad2(abs % 60)}'`;
}

const pad2 = (v: number): string => String(v).padStart(2, '0');

/** Numbers for a content stream: short, and never in exponent form. */
function n(v: number): string {
  return String(Number(v.toFixed(3)) + 0);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function latin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}
