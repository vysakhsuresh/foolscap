/**
 * The surgeon entry point. Only the worker imports this; pdf-lib stays off the
 * main thread.
 *
 * pdf-lib parses the whole file into objects and writes every object it holds
 * back out. Two consequences shape this module: deleting or duplicating pages
 * goes through `appendPages` into a fresh document (so the output only holds
 * what it shows), and a pure reorder moves refs in the page tree without
 * touching the objects (so nothing is cloned).
 */
import {
  BlendMode,
  EncryptedPDFError,
  LineCapStyle,
  LineJoinStyle,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  TextRenderingMode,
  beginText,
  drawObject,
  concatTransformationMatrix,
  setFillingRgbColor,
  setGraphicsState,
  endText,
  lineTo,
  moveTo,
  rotateAndSkewTextDegreesAndTranslate,
  setCharacterSqueeze,
  setFontAndSize,
  setTextRenderingMode,
  showText,
  popGraphicsState,
  pushGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
  PDFArray,
  PDFContentStream,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFInvalidObject,
  PDFName,
  PDFNumber,
  PDFObjectCopier,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFString,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  drawPage as drawPageOperators,
} from '@cantoo/pdf-lib';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import { zlibSync } from 'fflate';
import { pngFromIdat, pngFromPixels } from './png';
import { signDetached } from '../sign/cms';
import { readIdentity } from '../sign/identity';
import { signPdf } from './sign-pdf';
import { layoutFlow } from './surgeon-flow';
import { srgbProfile } from './icc';
import { drawCalls, invert, multiply, unitBox, type Matrix } from './content-stream';
import {
  PdfError,
  type Box,
  type DocInfo,
  type DocInfoField,
  type Attachment,
  type CleanOptions,
  type CleanReport,
  type CompressReport,
  type OutlineItem,
  type PageLabelRange,
  markPage,
  measureLabel,
  type ExtractedImage,
  type ImageEdit,
  type PageInfo,
  type PdfDoc,
  type PdfSurgeon,
  type RecompressedImage,
  type Rotation,
  type AnswerPicture,
  type TextFace,
  type TextStamp,
} from './types';

/**
 * The pdf-lib document behind each PdfDoc. A WeakMap rather than a property so
 * the library never shows through the interface, and so `appendPages` can
 * reach its source's document without the source exposing it.
 */
const documents = new WeakMap<PdfDoc, PDFDocument>();

export function createSurgeon(): PdfSurgeon {
  return {
    layoutFlow: (flow, paint) => layoutFlow(flow, paint),

    async signWithCertificate(pdf, certificate, password, opts) {
      const identity = await readIdentity(certificate, password);
      if (identity.expired) return { ok: false, expired: identity.notAfter };
      const probe = await this.open(pdf.slice());
      const pages = probe.pageCount;
      probe.close();
      const date = new Date();
      const reason = opts.reason?.trim();
      const bytes = await signPdf(
        pdf,
        {
          page: pages - 1,
          name: identity.subject,
          date,
          ...(reason ? { reason } : {}),
          // Bottom right of the last page, where a signature is looked for.
          ...(opts.visible ? { area: { x: 0.52, y: 0.84, w: 0.42, h: 0.1 } } : {}),
        },
        (data) => signDetached(identity, data, date),
      );
      return { ok: true, bytes, subject: identity.subject, issuer: identity.issuer };
    },

    async create() {
      const doc = await PDFDocument.create({ updateMetadata: false });
      return wrap(doc, undefined, false);
    },

    async open(data, opts) {
      const password = opts?.password;
      try {
        const doc = await load(data, password);
        repairTrailer(doc);
        const missing = repairPageTree(doc);
        // pdf-lib is lenient: a header followed by junk, or a file cut short,
        // "loads" with no catalog or no pages and only fails later, inside an
        // op. Fail here instead, where the message can say what happened.
        if (doc.getPageCount() === 0) throw notReadable(data, new Error('No pages'));
        // pdf-lib clears isEncrypted once a password has opened the file and
        // records that in its context instead; either means it was locked.
        return wrap(doc, data.byteLength, doc.isEncrypted || doc.context.isDecrypted === true, missing);
      } catch (error) {
        throw toPdfError(error, data);
      }
    },
  };
}

/**
 * Many "protected" PDFs have only an owner password: anyone may open them, and
 * the restriction is on printing or copying. Their user password is the empty
 * string, which pdf-lib wants passed explicitly. So a file that says it needs
 * a password is tried once with '' before the person is asked for one.
 */
async function load(data: Uint8Array, password: string | undefined): Promise<PDFDocument> {
  try {
    const doc = await loadOnce(data, password);
    // A catalog with no /Type loads "fine" and fails at the first look at its pages.
    doc.getPageCount();
    return doc;
  } catch (error) {
    // A file a reader shows but whose catalog has lost its /Type: pdf-lib
    // then treats the catalog as a plain dictionary and cannot find the pages.
    const labelled = labelCatalog(data);
    if (labelled === null || !(error instanceof TypeError)) throw error;
    return loadOnce(labelled, password);
  }
}

async function loadOnce(data: Uint8Array, password: string | undefined): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(data, { updateMetadata: false, ...(password === undefined ? {} : { password }) });
  } catch (error) {
    const needsPassword = error instanceof EncryptedPDFError || /needs password/i.test(error instanceof Error ? error.message : '');
    if (password !== undefined || !needsPassword) throw error;
    return PDFDocument.load(data, { updateMetadata: false, password: '' });
  }
}

/**
 * The bytes with "/Type /Catalog" written into the trailer's /Root object
 * when it lacks a /Type, or null when there is nothing to repair. pdf-lib
 * reads objects in file order rather than by the cross-reference offsets, so
 * the inserted bytes do not throw anything else off.
 */
function labelCatalog(data: Uint8Array): Uint8Array | null {
  const text = new TextDecoder('latin1').decode(data);
  const roots = [...text.matchAll(/\/Root\s+(\d+)\s+(\d+)\s+R/g)];
  const root = roots[roots.length - 1];
  if (!root) return null;
  const head = new RegExp(`(?:^|[\\s>])${root[1]}\\s+${root[2]}\\s+obj\\s*<<`, 'g');
  let match: RegExpExecArray | null = null;
  for (let m = head.exec(text); m !== null; m = head.exec(text)) match = m;
  if (!match) return null;
  const at = match.index + match[0].length;
  const body = text.slice(at, text.indexOf('endobj', at));
  if (/\/Type\s*\/Catalog/.test(body)) return null;
  const insert = new TextEncoder().encode(' /Type /Catalog ');
  const out = new Uint8Array(data.length + insert.length);
  out.set(data.subarray(0, at), 0);
  out.set(insert, at);
  out.set(data.subarray(at), at + insert.length);
  return out;
}

/**
 * pdf-lib signals a missing password with its own error class and a wrong one
 * with a plain Error from the cipher ("Password incorrect", or "NEEDS
 * PASSWORD" when the file has a non-empty user password and was given ''). A
 * damaged file surfaces as one of many parser errors; which one does not
 * matter to the user, only whether it was a PDF to begin with.
 */
function toPdfError(error: unknown, bytes: Uint8Array): PdfError {
  if (error instanceof PdfError) return error;
  if (isMemoryFailure(error)) return tooLarge(bytes.byteLength, error);
  if (error instanceof EncryptedPDFError) {
    return new PdfError('This file is locked with a password.', 'encrypted', { cause: error });
  }
  const message = error instanceof Error ? error.message : '';
  if (/needs password/i.test(message)) {
    return new PdfError('This file is locked with a password.', 'encrypted', { cause: error });
  }
  if (/password incorrect/i.test(message)) {
    return new PdfError("That password didn't open it. Check it and try again.", 'wrong-password', {
      cause: error,
    });
  }
  return notReadable(bytes, error);
}

/**
 * Undo a pdf-lib parsing defect that would otherwise make the output of an
 * encrypted input unreadable. A cross-reference stream is never encrypted, but
 * when pdf-lib parses a file with a password it runs the cipher over every
 * stream, so the input's xref stream comes out as garbage, is kept as an
 * "invalid object" holding the original bytes, and is written back verbatim.
 * Those bytes still read `/Type /XRef ... /Encrypt 8 0 R`, and the next reader
 * takes them for a trailer: a plaintext file that claims to be encrypted, and
 * opens nowhere. The same garbling loses the trailer's /Info, which is where
 * Producer and Creator live. So: drop every such object, and put /Info back
 * from the text it carried when the dictionary it names is still there.
 */
function repairTrailer(doc: PDFDocument): void {
  const { context } = doc;
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFInvalidObject)) continue;
    const raw = new Uint8Array(object.sizeInBytes());
    object.copyBytesInto(raw, 0);
    const text = String.fromCharCode(...raw.subarray(0, Math.min(raw.length, 4096)));
    if (!/\/Type\s*\/XRef\b/.test(text)) continue;
    const info = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(text);
    if (info && context.trailerInfo.Info === undefined) {
      const infoRef = PDFRef.of(Number(info[1]), Number(info[2]));
      if (context.lookup(infoRef) instanceof PDFDict) context.trailerInfo.Info = infoRef;
    }
    context.delete(ref);
  }
}

/**
 * A file cut short (an interrupted download, a mail attachment that did not
 * finish) still lists every page in its page tree, but the objects for the
 * last few are gone. pdf-lib skips those when counting pages and then writes
 * the dangling references back out, which pdf.js and every other reader
 * refuse. Prune them, so what is saved holds the pages that were there, and
 * say how many were lost so the tool can tell the person.
 */
function repairPageTree(doc: PDFDocument): number {
  const { context } = doc;
  const seen = new Set<PDFDict>();
  let lost = 0;
  const walk = (node: PDFDict): number => {
    if (seen.has(node)) return 0;
    seen.add(node);
    const kids = node.lookup(PDFName.of('Kids'));
    if (!(kids instanceof PDFArray)) return 0;
    let leaves = 0;
    for (let i = kids.size() - 1; i >= 0; i--) {
      const kid = kids.get(i);
      const target = kid instanceof PDFRef ? context.lookup(kid) : kid;
      if (!(target instanceof PDFDict) || seen.has(target)) {
        kids.remove(i);
        lost++;
        continue;
      }
      const type = target.get(PDFName.of('Type'));
      if (type === PDFName.of('Pages') || (type === undefined && target.has(PDFName.of('Kids')))) leaves += walk(target);
      else leaves++;
    }
    node.set(PDFName.of('Count'), PDFNumber.of(leaves));
    return leaves;
  };
  const root = doc.catalog.lookup(PDFName.of('Pages'));
  if (root instanceof PDFDict) walk(root);
  return lost;
}

/**
 * A JPEG or PNG into the document. pdf-lib's own errors for a picture it
 * cannot read ("SOI not found", "Invalid PNG") would surface as the file
 * being unreadable, when it is the picture that is.
 */
async function embedPicture(doc: PDFDocument, bytes: Uint8Array, kind: 'jpeg' | 'png') {
  try {
    return kind === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  } catch (error) {
    if (isMemoryFailure(error)) throw tooLarge(bytes.byteLength, error);
    throw new PdfError("That picture couldn't be read. Save it as a JPEG or PNG and try again.", 'unknown', { cause: error });
  }
}

function wrap(initial: PDFDocument, byteLength: number | undefined, wasEncrypted: boolean, missingPages = 0): PdfDoc {
  let doc: PDFDocument | null = initial;
  const fonts = new Map<'regular' | 'bold', PDFFont>();
  let drawable: Set<number> | null = null;
  /** Annotations on pages Remove areas turned into pictures; non-empty means save() finishes the job. */
  const removedWidgets = new Set<string>();
  let replaced = false;
  /** Tiled watermarks already drawn as a form, by what they say and the page size they cover. */
  const tiles = new Map<string, PDFRef>();
  /** Pictures of words already embedded, so one drawn for every page goes into the file once. */
  const pictures = new WeakMap<Uint8Array, PDFImage>();
  /** One object copier per source document, so what its pages share is copied into this one once. */
  const copiers = new WeakMap<PDFDocument, PDFObjectCopier>();
  const copierFrom = (from: PDFDocument): PDFObjectCopier => {
    let copier = copiers.get(from);
    if (copier === undefined) {
      copier = PDFObjectCopier.for(from.context, live().context);
      copiers.set(from, copier);
    }
    return copier;
  };

  /**
   * A page of another document as a form XObject in this one: its drawing
   * instructions as they are, its resources through the shared copier.
   * pdf-lib's own embedPage makes a new copier for every page, so on a
   * sheet of four (or a whole document fitted to A4) a picture the pages
   * share went in once per page: a 150 KB file came out at 12 MB.
   */
  const embedPageOnce = (page: PDFPage, box: { x: number; y: number; width: number; height: number }): PDFRef => {
    const target = live();
    const context = target.context;
    const resources = page.node.Resources();
    const copied = resources === undefined ? context.obj({}) : page.doc === target ? resources : copierFrom(page.doc).copy(resources);
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents === undefined ? [] : [contents];
    const parts: Uint8Array[] = [];
    for (const item of streams) {
      const stream = item instanceof PDFRef ? page.doc.context.lookup(item) : item;
      if (stream instanceof PDFRawStream) parts.push(decodePDFRawStream(stream).decode());
      else if (stream instanceof PDFContentStream) parts.push(stream.getUnencodedContents());
    }
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
    let at = 0;
    for (const p of parts) {
      joined.set(p, at);
      joined[at + p.length] = 0x0a;
      at += p.length + 1;
    }
    const form = context.flateStream(joined, {
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: [box.x, box.y, box.x + box.width, box.y + box.height],
      // The box's corner at the origin, as pdf-lib's embedder places it.
      Matrix: [1, 0, 0, 1, -box.x, -box.y],
      Resources: copied,
    });
    return context.register(form);
  };

  const font = (bold: boolean): PDFFont => {
    const key = bold ? 'bold' : 'regular';
    let f = fonts.get(key);
    if (f === undefined) {
      f = live().embedStandardFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
      fonts.set(key, f);
    }
    return f;
  };
  /** The built-in face nearest to `face`: the standard 14 cover sans, serif and fixed-width, each plain, bold, italic or both. */
  const faces = new Map<StandardFonts, PDFFont>();
  const fontFor = (face: TextFace | undefined): PDFFont => {
    const b = face?.bold === true;
    const i = face?.italic === true;
    if (face === undefined || ((face.family ?? 'sans') === 'sans' && !i)) return font(b);
    const table: Record<'sans' | 'serif' | 'mono', [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
      sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
      serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
      mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
    };
    const name = table[face.family ?? 'sans'][(b ? 1 : 0) + (i ? 2 : 0)] ?? StandardFonts.Helvetica;
    let f = faces.get(name);
    if (f === undefined) {
      f = live().embedStandardFont(name);
      faces.set(name, f);
    }
    return f;
  };

  /**
   * pdf-lib does not refuse a character its font lacks: it draws an empty
   * box. Check every one against what the font can really draw.
   */
  const assertDrawable = (f: PDFFont, text: string): void => {
    drawable ??= new Set(f.getCharacterSet());
    const missing = [...text].some((ch) => ch !== '\n' && !drawable?.has(ch.codePointAt(0) ?? 0));
    if (missing) {
      throw new PdfError(
        'This text has letters the built-in font cannot draw yet, such as Malayalam, Hindi, Arabic or emoji. Use English letters and numbers for now.',
        'unsupported-text',
      );
    }
  };

  const live = (): PDFDocument => {
    if (doc === null) throw new Error('This document has been closed.');
    return doc;
  };

  const pageAt = (index: number): PDFPage => {
    const pages = live().getPages();
    const page = pages[index];
    if (!Number.isInteger(index) || page === undefined) {
      throw new Error(`Page index ${index} is out of range (0 to ${pages.length - 1}).`);
    }
    return page;
  };

  const self: PdfDoc = {
    get pageCount() {
      return live().getPageCount();
    },

    wasEncrypted,
    missingPages,

    visibleBox(index) {
      const { x, y, width, height } = pageAt(index).getCropBox();
      return { x, y, width, height };
    },

    setVisibleBox(index, box) {
      if (!(box.width > 0 && box.height > 0)) throw new Error('A visible box needs a positive width and height.');
      pageAt(index).setCropBox(box.x, box.y, box.width, box.height);
    },

    stampText(index, stamp) {
      const page = pageAt(index);
      const f = font(stamp.bold === true);
      const text = stamp.text.replace(/[\r\n\t]+/g, ' ').trim();
      if (text.length === 0) return;
      assertDrawable(f, text);
      const view = viewOf(page);
      const angle = stamp.angle ?? 0;
      let size = stamp.size;
      let margin = stamp.margin;
      if (stamp.tiled !== true) {
        // A small page (a till receipt, a card) gets a margin to match, and
        // words that would still run off its edge, straight or turned, are
        // made smaller to fit.
        margin = Math.min(stamp.margin ?? 36, Math.min(view.width, view.height) * 0.08);
        size = fitted(view, angle, margin, size, (s) => [f.widthOfTextAtSize(text, s), f.heightAtSize(s, { descender: false })]);
      }
      const width = f.widthOfTextAtSize(text, size);
      const capHeight = f.heightAtSize(size, { descender: false });
      const placed = { ...stamp, size, ...(margin === undefined ? {} : { margin }) };
      const centres = stamp.tiled === true ? tileCentres(view, width, size) : [anchorCentre(view, placed, width, capHeight)];
      const rad = (angle * Math.PI) / 180;
      const [r, g, b] = stamp.color ?? [0, 0, 0];
      if (stamp.tiled === true) {
        // A tiled watermark is a couple of hundred copies of the words on
        // every page. Drawn one by one that is 17 KB a page (a 130 KB file
        // came out at 5 MB); drawn once into a form every page of the same
        // size shares, each page only says "draw that here".
        const key = [text, size, angle, stamp.opacity ?? 1, r, g, b, stamp.bold === true, view.width, view.height].join('|');
        let form = tiles.get(key);
        if (form === undefined) {
          const operators = [pushGraphicsState(), setGraphicsState('GS0'), beginText(), setFillingRgbColor(r, g, b), setFontAndSize('F0', size)];
          for (const [cx, cy] of centres) {
            const vx = cx - (Math.cos(rad) * width) / 2 + (Math.sin(rad) * capHeight) / 2;
            const vy = cy - (Math.sin(rad) * width) / 2 - (Math.cos(rad) * capHeight) / 2;
            operators.push(rotateAndSkewTextDegreesAndTranslate(angle, 0, 0, vx, vy), showText(f.encodeText(text)));
          }
          operators.push(endText(), popGraphicsState());
          const opacity = stamp.opacity ?? 1;
          const context = live().context;
          form = context.register(
            context.formXObject(operators, {
              BBox: [0, 0, view.width, view.height],
              Resources: { Font: { F0: f.ref }, ExtGState: { GS0: { Type: 'ExtGState', ca: opacity, CA: opacity } } },
            }),
          );
          tiles.set(key, form);
        }
        const name = page.node.newXObject('Wm', form);
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...view.matrix()), drawObject(name), popGraphicsState());
        return;
      }
      for (const [cx, cy] of centres) {
        // The text's own origin is its bottom-left; put its centre on (cx, cy).
        const vx = cx - (Math.cos(rad) * width) / 2 + (Math.sin(rad) * capHeight) / 2;
        const vy = cy - (Math.sin(rad) * width) / 2 - (Math.cos(rad) * capHeight) / 2;
        const [px, py] = view.toPage(vx, vy);
        page.drawText(text, {
          x: px,
          y: py,
          size,
          font: f,
          color: rgb(r, g, b),
          opacity: stamp.opacity ?? 1,
          rotate: degrees(angle + view.rotation),
        });
      }
    },

    canDraw(text) {
      drawable ??= new Set(font(false).getCharacterSet());
      return [...text].every((ch) => ch === '\n' || drawable?.has(ch.codePointAt(0) ?? 0));
    },

    async stampPicture(index, stamp) {
      const page = pageAt(index);
      const view = viewOf(page);
      const angle = stamp.angle ?? 0;
      let { width, height } = stamp;
      if (!(width > 0 && height > 0)) return;
      let margin = stamp.margin;
      if (stamp.tiled !== true) {
        margin = Math.min(stamp.margin ?? 36, Math.min(view.width, view.height) * 0.08);
        const k = fitted(view, angle, margin, 1, (s) => [width * s, height * s]);
        width *= k;
        height *= k;
      }
      let image = pictures.get(stamp.png);
      if (image === undefined) {
        image = await live().embedPng(stamp.png);
        pictures.set(stamp.png, image);
      }
      const rad = (angle * Math.PI) / 180;
      const opacity = stamp.opacity ?? 1;
      const placed = { ...stamp, ...(margin === undefined ? {} : { margin }) };
      const centres = stamp.tiled === true ? tileCentres(view, width, height / 1.35) : [anchorCentre(view, { ...placed, text: '', size: 0 }, width, height)];
      // The same as the words would be: the picture's own corner, turned about its centre, upright as the reader sees the page.
      const operators = [pushGraphicsState(), setGraphicsState('GS0')];
      for (const [cx, cy] of centres) {
        const vx = cx - (Math.cos(rad) * width) / 2 + (Math.sin(rad) * height) / 2;
        const vy = cy - (Math.sin(rad) * width) / 2 - (Math.cos(rad) * height) / 2;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        operators.push(pushGraphicsState(), concatTransformationMatrix(width * cos, width * sin, -height * sin, height * cos, vx, vy), drawObject('Im0'), popGraphicsState());
      }
      operators.push(popGraphicsState());
      const context = live().context;
      // Drawn once into a form the page then draws, as a tiled watermark is: a couple of hundred copies stay one picture.
      const form = context.register(
        context.formXObject(operators, {
          BBox: [Math.min(0, -view.width), Math.min(0, -view.height), view.width * 2, view.height * 2],
          Resources: { XObject: { Im0: image.ref }, ExtGState: { GS0: { Type: 'ExtGState', ca: opacity, CA: opacity } } },
        }),
      );
      const name = page.node.newXObject('Wp', form);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...view.matrix()), drawObject(name), popGraphicsState());
    },

    addBlankPage(width, height) {
      live().addPage([width, height]);
    },

    async composePage(width, height, placements) {
      const target = live();
      try {
        const sheet = target.addPage([width, height]);
        for (const { source, index, box } of placements) {
          const from = documents.get(source);
          if (from === undefined) throw new Error('The source document is not open.');
          const page = from.getPage(index);
          const crop = page.getCropBox();
          const xobject = embedPageOnce(page, crop);
          const rotation = normaliseRotation(page.getRotation().angle);
          const sideways = rotation === 90 || rotation === 270;
          const seenWidth = sideways ? crop.height : crop.width;
          const seenHeight = sideways ? crop.width : crop.height;
          const scale = Math.min(box.width / seenWidth, box.height / seenHeight);
          const w = seenWidth * scale;
          const h = seenHeight * scale;
          const tx = box.x + (box.width - w) / 2;
          const ty = box.y + (box.height - h) / 2;
          // Draw the page turned the way its reader would see it: rotating by
          // -rotation about the origin, so the origin moves to the corner the
          // page's own bottom-left ends up in.
          const origin: Record<Rotation, [number, number]> = {
            0: [tx, ty],
            90: [tx, ty + h],
            180: [tx + w, ty + h],
            270: [tx + w, ty],
          };
          const [ox, oy] = origin[rotation];
          const name = sheet.node.newXObject('EmbeddedPdfPage', xobject);
          sheet.pushOperators(...drawPageOperators(name, { x: ox, y: oy, xScale: scale, yScale: scale, rotate: degrees(-rotation), xSkew: degrees(0), ySkew: degrees(0) }));
        }
      } catch (error) {
        if (isMemoryFailure(error)) throw tooLarge(byteLength, error);
        throw error;
      }
    },

    async addImagePage(image, paper, margin) {
      const target = live();
      const embedded = await embedPicture(target, image.bytes, image.kind);
      const { width: iw, height: ih } = embedded;
      let pw: number;
      let ph: number;
      if (paper === 'fit') {
        // The image's own shape, its long side the long side of A4, so a
        // 4000-pixel phone photo is not a page a metre wide.
        const scale = 842 / Math.max(iw, ih);
        pw = iw * scale + margin * 2;
        ph = ih * scale + margin * 2;
      } else {
        const landscape = iw > ih;
        pw = landscape ? Math.max(paper.width, paper.height) : Math.min(paper.width, paper.height);
        ph = landscape ? Math.min(paper.width, paper.height) : Math.max(paper.width, paper.height);
      }
      const scale = Math.min((pw - margin * 2) / iw, (ph - margin * 2) / ih);
      const w = iw * scale;
      const h = ih * scale;
      const page = target.addPage([pw, ph]);
      page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    },

    images() {
      const { images, skipped } = extractImages(live());
      return { images, skipped };
    },

    setBackground(index, color) {
      const d = live();
      const page = pageAt(index);
      const { x, y, width, height } = page.getMediaBox();
      const [r, g, b] = color;
      const n = (v: number) => Math.min(1, Math.max(0, v)).toFixed(4);
      const paint = d.context.register(d.context.flateStream(`q ${n(r)} ${n(g)} ${n(b)} rg ${x} ${y} ${width} ${height} re f Q\n`));
      // First in the page's contents, so everything already there is drawn over it.
      page.node.normalize();
      const contents = page.node.Contents();
      if (contents instanceof PDFArray) contents.insert(0, paint);
      else page.node.addContentStream(paint);
    },

    setPageLabels(ranges) {
      const d = live();
      if (ranges.length === 0) {
        d.catalog.delete(PDFName.of('PageLabels'));
        return;
      }
      const STYLE: Record<PageLabelRange['style'], string | null> = { decimal: 'D', roman: 'r', Roman: 'R', alpha: 'a', Alpha: 'A', none: null };
      const sorted = [...ranges].filter((r) => Number.isInteger(r.start) && r.start >= 0 && r.start < d.getPageCount()).sort((a, b) => a.start - b.start);
      const nums: unknown[] = [];
      for (const range of sorted) {
        const label = d.context.obj({});
        const style = STYLE[range.style];
        if (style !== null) label.set(PDFName.of('S'), PDFName.of(style));
        if (range.prefix) label.set(PDFName.of('P'), PDFHexString.fromText(range.prefix));
        if (range.first !== undefined && range.first !== 1) label.set(PDFName.of('St'), PDFNumber.of(Math.max(1, Math.floor(range.first))));
        nums.push(PDFNumber.of(range.start), label);
      }
      // Page 0 must be covered: a range that starts later gets plain numbers before it.
      if (sorted[0] === undefined || sorted[0].start !== 0) nums.unshift(PDFNumber.of(0), d.context.obj({ S: 'D' }));
      d.catalog.set(PDFName.of('PageLabels'), d.context.obj({ Nums: d.context.obj(nums as never) }));
    },

    attachments() {
      return readAttachments(live());
    },

    async attach(file) {
      await live().attach(file.bytes, file.name, {
        ...(file.description === undefined ? {} : { description: file.description }),
        mimeType: mimeFor(file.name),
      });
    },

    bookmarks() {
      return readBookmarks(live());
    },

    setBookmarks(items) {
      writeBookmarks(live(), items);
    },

    clean(opts) {
      const report = cleanDocument(live(), opts);
      if (opts.metadata) self.stripMetadata();
      dropUnreachable(live().context);
      return report;
    },

    addTextLayer(index, words) {
      const page = pageAt(index);
      const view = viewOf(page);
      const f = font(false);
      drawable ??= new Set(f.getCharacterSet());
      const key = page.node.newFontDictionary(f.name, f.ref);
      const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
      let placed = 0;
      for (const word of words) {
        const text = [...word.text].filter((ch) => drawable?.has(ch.codePointAt(0) ?? 0)).join('');
        if (text.length === 0) continue;
        const height = word.h * view.height;
        const width = word.w * view.width;
        // A word's box runs from the tops of its tall letters to the bottom of its descenders.
        const size = Math.max(1, height * 0.92);
        const natural = f.widthOfTextAtSize(text, size);
        if (!(natural > 0) || !(width > 0)) continue;
        const [px, py] = view.toPage(word.x * view.width, (1 - word.y - word.h) * view.height + height * 0.2);
        ops.push(
          setFontAndSize(key, size),
          setCharacterSqueeze(Math.min(500, Math.max(10, (100 * width) / natural))),
          rotateAndSkewTextDegreesAndTranslate(view.rotation, 0, 0, px, py),
          showText(f.encodeText(text)),
        );
        placed++;
      }
      ops.push(endText(), popGraphicsState());
      if (placed > 0) page.pushOperators(...ops);
      return placed;
    },

    async drawMarks(marks) {
      const d = live();
      for (const mark of marks) {
        const page = pageAt(markPage(mark));
        const view = viewOf(page);
        const W = view.width;
        const H = view.height;
        /** A point in page fractions (top-left origin) to the page's own points. */
        const at = (fx: number, fy: number): [number, number] => view.toPage(fx * W, (1 - fy) * H);
        if (mark.kind === 'ink') {
          const points: Array<[number, number]> = [];
          for (let i = 0; i + 1 < mark.points.length; i += 2) points.push(at(mark.points[i] ?? 0, mark.points[i + 1] ?? 0));
          const first = points[0];
          if (first === undefined) continue;
          const [r, g, b] = mark.color;
          page.pushOperators(
            pushGraphicsState(),
            setStrokingRgbColor(r, g, b),
            setLineWidth(mark.width * W),
            setLineCap(LineCapStyle.Round),
            setLineJoin(LineJoinStyle.Round),
            moveTo(first[0], first[1]),
            // One point is a dot: a zero-length line with round caps.
            ...(points.length === 1 ? [lineTo(first[0], first[1])] : points.slice(1).map(([x, y]) => lineTo(x, y))),
            stroke(),
            popGraphicsState(),
          );
          continue;
        }
        if (mark.kind === 'line') {
          const [r, g, b] = mark.color;
          const [ax, ay] = at(mark.from[0], mark.from[1]);
          const [bx, by] = at(mark.to[0], mark.to[1]);
          const thick = Math.max(0.5, mark.width * W);
          const segments: Array<[number, number, number, number]> = [[ax, ay, bx, by]];
          const angle = Math.atan2(by - ay, bx - ax);
          const length = Math.hypot(bx - ax, by - ay);
          if (mark.end === 'arrow' && length > 0) {
            const head = Math.max(6, thick * 4.5);
            for (const turn of [Math.PI * 0.84, -Math.PI * 0.84]) segments.push([bx, by, bx + head * Math.cos(angle + turn), by + head * Math.sin(angle + turn)]);
          }
          if (mark.end === 'measure' && length > 0) {
            const tick = Math.max(4, thick * 3);
            for (const [px, py] of [[ax, ay], [bx, by]] as const) {
              const nx = -Math.sin(angle) * tick;
              const ny = Math.cos(angle) * tick;
              segments.push([px - nx, py - ny, px + nx, py + ny]);
            }
          }
          page.pushOperators(
            pushGraphicsState(),
            setStrokingRgbColor(r, g, b),
            setLineWidth(thick),
            setLineCap(LineCapStyle.Round),
            ...segments.flatMap(([x1, y1, x2, y2]) => [moveTo(x1, y1), lineTo(x2, y2)]),
            stroke(),
            popGraphicsState(),
          );
          if (mark.end === 'measure') {
            // The label sits above the middle of the line as the reader sees it, upright.
            const label = measureLabel(Math.hypot((mark.to[0] - mark.from[0]) * W, (mark.to[1] - mark.from[1]) * H));
            const f = font(true);
            const size = Math.max(7, Math.min(14, W * 0.016));
            const tw = f.widthOfTextAtSize(label, size);
            const mx = ((mark.from[0] + mark.to[0]) / 2) * W - tw / 2;
            const my = (1 - (mark.from[1] + mark.to[1]) / 2) * H + size * 0.5;
            const [px, py] = view.toPage(mx, my);
            page.drawText(label, { x: px, y: py, size, font: f, color: rgb(r, g, b), rotate: degrees(view.rotation) });
          }
          continue;
        }
        const { area } = mark;
        // The area's bottom-left, in the view's points (origin bottom-left).
        const vx = area.x * W;
        const vy = (1 - area.y - area.h) * H;
        const w = area.w * W;
        const h = area.h * H;
        /** The area as a rectangle in the page's own points: a quarter-turn keeps it upright. */
        const box = () => {
          const [x1, y1] = view.toPage(vx, vy);
          const [x2, y2] = view.toPage(vx + w, vy + h);
          return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
        };
        switch (mark.kind) {
          case 'image': {
            const image = await embedPicture(d, mark.png, 'png');
            const [px, py] = view.toPage(vx, vy);
            page.drawImage(image, { x: px, y: py, width: w, height: h, rotate: degrees(view.rotation) });
            break;
          }
          case 'picture': {
            const image = await embedPicture(d, mark.bytes, mark.format);
            const [px, py] = view.toPage(vx, vy);
            page.drawImage(image, { x: px, y: py, width: w, height: h, rotate: degrees(view.rotation) });
            break;
          }
          case 'highlight': {
            const [r, g, b] = mark.color;
            if (mark.style === 'underline' || mark.style === 'strike') {
              // A line under the words, or through their middle, as thick as a pen.
              const yView = mark.style === 'underline' ? vy + h * 0.04 : vy + h * 0.42;
              const [ax, ay] = view.toPage(vx, yView);
              const [bx, by] = view.toPage(vx + w, yView);
              page.pushOperators(
                pushGraphicsState(),
                setStrokingRgbColor(r, g, b),
                setLineWidth(Math.max(0.8, Math.min(2.5, h * 0.08))),
                moveTo(ax, ay),
                lineTo(bx, by),
                stroke(),
                popGraphicsState(),
              );
              break;
            }
            page.drawRectangle({ ...box(), color: rgb(r, g, b), opacity: 0.45, blendMode: BlendMode.Multiply });
            break;
          }
          case 'fill': {
            const [r, g, b] = mark.color;
            page.drawRectangle({ ...box(), color: rgb(r, g, b) });
            break;
          }
          case 'shape': {
            const [r, g, b] = mark.color;
            const rect = box();
            const thick = Math.max(0.5, mark.width * W);
            if (mark.shape === 'rect') {
              page.drawRectangle({ ...rect, borderColor: rgb(r, g, b), borderWidth: thick });
            } else {
              page.drawEllipse({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, xScale: rect.width / 2, yScale: rect.height / 2, borderColor: rgb(r, g, b), borderWidth: thick });
            }
            break;
          }
          case 'stamp': {
            const [r, g, b] = mark.color;
            const text = mark.text.trim().toUpperCase();
            const f = font(true);
            assertDrawable(f, text);
            const rect = box();
            const frame = Math.max(1.2, h * 0.07);
            page.drawRectangle({ x: rect.x + frame / 2, y: rect.y + frame / 2, width: rect.width - frame, height: rect.height - frame, borderColor: rgb(r, g, b), borderWidth: frame, opacity: 0, borderOpacity: 0.9 });
            // The words fill the frame's width, centred, upright as the reader sees the page.
            const size = Math.max(4, Math.min(h * 0.55, ((w - 4 * frame) / Math.max(1, f.widthOfTextAtSize(text, 1))) * 0.92));
            const tw = f.widthOfTextAtSize(text, size);
            const [px, py] = view.toPage(vx + (w - tw) / 2, vy + (h - size * 0.72) / 2);
            page.drawText(text, { x: px, y: py, size, font: f, color: rgb(r, g, b), opacity: 0.9, rotate: degrees(view.rotation) });
            break;
          }
          case 'note': {
            // A real comment: readers list it and open it; the words can be any script.
            const [x, y] = at(area.x, area.y);
            const icon = 20;
            const [r, g, b] = mark.color;
            const annot = d.context.register(
              d.context.obj({
                Type: 'Annot',
                Subtype: 'Text',
                Rect: [x, y - icon, x + icon, y],
                Contents: PDFHexString.fromText(mark.text),
                Name: 'Comment',
                C: [r, g, b],
                F: 4,
                Open: false,
              }),
            );
            page.node.addAnnot(annot);
            break;
          }
          case 'link': {
            const url = mark.url.trim();
            if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) throw new PdfError('A link must start with https://, http://, mailto: or tel:.', 'unknown');
            const rect = box();
            const annot = d.context.register(
              d.context.obj({
                Type: 'Annot',
                Subtype: 'Link',
                Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
                Border: [0, 0, 0],
                F: 4,
                A: { S: 'URI', URI: PDFString.of(url) },
              }),
            );
            page.node.addAnnot(annot);
            break;
          }
          case 'text': {
            const f = fontFor(mark.face);
            const lines = mark.text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n');
            assertDrawable(f, lines.join(''));
            const size = mark.size * W;
            const top = (1 - area.y) * H;
            const [r, g, b] = mark.color;
            if (mark.boxed === true) {
              // A text box: paper behind the words and a thin frame round them.
              const pad = size * 0.35;
              const widest = Math.max(...lines.map((l) => f.widthOfTextAtSize(l, size)));
              const bw = widest + 2 * pad;
              const bh = lines.length * size * 1.25 + pad * 1.2;
              const [x1, y1] = view.toPage(vx - pad, top - bh + pad * 0.6);
              const [x2, y2] = view.toPage(vx - pad + bw, top + pad * 0.6);
              page.drawRectangle({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), color: rgb(1, 0.995, 0.97), borderColor: rgb(r, g, b), borderWidth: Math.max(0.6, size * 0.06) });
            }
            lines.forEach((line, i) => {
              if (line.trim().length === 0) return;
              // Matches the editor's CSS: line-height 1.25, baseline 0.97 em below the line's top.
              // Right-aligned text (a changed amount) keeps the area's right edge.
              const lx = mark.align === 'right' ? vx + w - f.widthOfTextAtSize(line, size) : vx;
              const [px, py] = view.toPage(lx, top - size * (0.97 + i * 1.25));
              page.drawText(line, { x: px, y: py, size, font: f, color: rgb(r, g, b), rotate: degrees(view.rotation) });
            });
            break;
          }
        }
      }
    },

    async replaceWithImage(index, jpeg) {
      const d = live();
      const page = pageAt(index);
      const view = viewOf(page);
      const image = await d.embedJpg(jpeg);
      const node = page.node;
      // Normalise first, so pdf-lib does not later wrap the new contents in the old ones.
      node.normalize();
      const { context } = d;
      const annots = node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) for (const a of annots.asArray()) if (a instanceof PDFRef) removedWidgets.add(a.toString());
      node.delete(PDFName.of('StructParents'));
      node.set(PDFName.of('Contents'), context.obj([]));
      node.set(PDFName.of('Resources'), context.obj({ Font: {}, XObject: {}, ExtGState: {} }));
      node.set(PDFName.of('Annots'), context.obj([]));
      for (const key of ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox', 'Thumb', 'PieceInfo', 'Group']) node.delete(PDFName.of(key));
      page.setRotation(degrees(0));
      page.setMediaBox(0, 0, view.width, view.height);
      page.drawImage(image, { x: 0, y: 0, width: view.width, height: view.height });
      replaced = true;
    },

    addFields(fields) {
      const d = live();
      const form = d.getForm();
      const taken = new Set(form.getFields().map((f) => f.getName()));
      const names: string[] = [];
      for (const field of fields) {
        const page = pageAt(field.area.page);
        const view = viewOf(page);
        const { x, y, w, h } = field.area;
        const [x1, y1] = view.toPage(x * view.width, (1 - y - h) * view.height);
        const [x2, y2] = view.toPage((x + w) * view.width, (1 - y) * view.height);
        const rect = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
        // A dot in a name makes a hierarchy in a PDF form; a name is just a name here.
        const base = field.name.replace(/\./g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Field';
        let name = base;
        for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
        taken.add(name);
        // pdf-lib turns a widget's box about the (x, y) it is given, with width
        // and height as the reader sees them; give it the corner and the sides
        // that land the turned box exactly on `rect`.
        const anchored: Record<Rotation, { x: number; y: number; width: number; height: number }> = {
          0: rect,
          90: { x: rect.x + rect.width, y: rect.y, width: rect.height, height: rect.width },
          180: { x: rect.x + rect.width, y: rect.y + rect.height, width: rect.width, height: rect.height },
          270: { x: rect.x, y: rect.y + rect.height, width: rect.height, height: rect.width },
        };
        const look = { ...anchored[view.rotation], rotate: degrees(view.rotation), borderWidth: 0.75, borderColor: rgb(0.55, 0.58, 0.65), backgroundColor: rgb(0.94, 0.96, 1) };
        switch (field.kind) {
          case 'text':
          case 'multiline': {
            const text = form.createTextField(name);
            if (field.kind === 'multiline') text.enableMultiline();
            text.addToPage(page, look);
            break;
          }
          case 'check':
            form.createCheckBox(name).addToPage(page, look);
            break;
          case 'choice': {
            const choice = form.createDropdown(name);
            const options = (field.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
            if (options.length > 0) choice.addOptions(options);
            choice.addToPage(page, look);
            break;
          }
        }
        names.push(name);
      }
      return names;
    },

    async editImages(index, edits) {
      const d = live();
      const page = pageAt(index);
      const view = viewOf(page);
      const { context } = d;
      // The page's drawing instructions, as one run of bytes.
      page.node.normalize();
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray() : [];
      const parts: Uint8Array[] = [];
      for (const ref of streams) {
        const stream = ref instanceof PDFRef ? context.lookup(ref) : ref;
        if (stream instanceof PDFRawStream) parts.push(decodePDFRawStream(stream).decode());
      }
      const joined = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
      let at = 0;
      for (const p of parts) {
        joined.set(p, at);
        joined[at + p.length] = 0x0a;
        at += p.length + 1;
      }
      const resources = page.node.Resources();
      const xobjects = resources?.lookup(PDFName.of('XObject'));
      const isImage = (name: string) => {
        if (!(xobjects instanceof PDFDict)) return false;
        const x = xobjects.lookup(PDFName.of(name));
        return x instanceof PDFRawStream && x.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image';
      };
      // Where each picture is drawn, as the reader sees the page.
      const toView = (px: number, py: number): [number, number] => {
        const { x, y, width: w, height: h } = page.getCropBox();
        switch (view.rotation) {
          case 90:
            return [py - y, x + w - px];
          case 180:
            return [x + w - px, y + h - py];
          case 270:
            return [y + h - py, px - x];
          default:
            return [px - x, py - y];
        }
      };
      const calls = drawCalls(joined)
        .filter((c) => isImage(c.name))
        .map((c) => {
          const [x0, y0, x1, y1] = unitBox(c.ctm);
          const [ax, ay] = toView(x0, y0);
          const [bx, by] = toView(x1, y1);
          const area = { x: Math.min(ax, bx) / view.width, y: 1 - Math.max(ay, by) / view.height, w: Math.abs(bx - ax) / view.width, h: Math.abs(by - ay) / view.height };
          return { ...c, area, box: [x0, y0, x1, y1] as const };
        });
      const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
        const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const inter = iw * ih;
        return inter / (a.w * a.h + b.w * b.h - inter || 1);
      };
      const splices: Array<{ start: number; end: number; text: string; action: ImageEdit['action'] }> = [];
      const used = new Set<number>();
      let fresh = 0;
      const nameFor = () => {
        let name: string;
        do name = `FsPic${++fresh}`;
        while (xobjects instanceof PDFDict && xobjects.has(PDFName.of(name)));
        return name;
      };
      const num = (v: number) => (Math.abs(v) < 1e-9 ? '0' : Number(v.toFixed(6)).toString());
      const cm = (m: Matrix) => `${m.map(num).join(' ')} cm`;
      for (const edit of edits) {
        let best = -1;
        let score = 0.5;
        calls.forEach((c, k) => {
          if (used.has(k)) return;
          const s = overlap(c.area, edit.area);
          if (s > score) {
            score = s;
            best = k;
          }
        });
        const call = calls[best];
        if (call === undefined) continue;
        used.add(best);
        if (edit.action === 'delete') {
          splices.push({ start: call.start, end: call.end, text: '', action: 'delete' });
          continue;
        }
        const [x0, y0, x1, y1] = call.box;
        if (edit.action === 'move') {
          // The new box in page space, then the change that takes the old box there, in the picture's own space.
          const { to } = edit;
          const [p1x, p1y] = view.toPage(to.x * view.width, (1 - to.y - to.h) * view.height);
          const [p2x, p2y] = view.toPage((to.x + to.w) * view.width, (1 - to.y) * view.height);
          const nx0 = Math.min(p1x, p2x);
          const ny0 = Math.min(p1y, p2y);
          const sx = Math.abs(p2x - p1x) / Math.max(1e-6, x1 - x0);
          const sy = Math.abs(p2y - p1y) / Math.max(1e-6, y1 - y0);
          const shift: Matrix = [sx, 0, 0, sy, nx0 - x0 * sx, ny0 - y0 * sy];
          const back = invert(call.ctm);
          if (!back) continue;
          const local = multiply(multiply(call.ctm, shift), back);
          splices.push({ start: call.start, end: call.end, text: `q ${cm(local)} /${call.name} Do Q`, action: 'move' });
          continue;
        }
        // Replace: the new picture fills the old one's box, kept to its own shape and centred.
        const image = await embedPicture(d, edit.bytes, edit.format);
        const name = nameFor();
        if (xobjects instanceof PDFDict) xobjects.set(PDFName.of(name), image.ref);
        else if (resources) resources.set(PDFName.of('XObject'), context.obj({ [name]: image.ref }));
        const boxAspect = (x1 - x0) / Math.max(1e-6, y1 - y0);
        const aspect = image.width / Math.max(1, image.height);
        const fx = aspect >= boxAspect ? 1 : aspect / boxAspect;
        const fy = aspect >= boxAspect ? boxAspect / aspect : 1;
        splices.push({ start: call.start, end: call.end, text: `q ${cm([fx, 0, 0, fy, (1 - fx) / 2, (1 - fy) / 2])} /${name} Do Q`, action: 'replace' });
      }
      if (splices.length === 0) return [];
      const done = splices.map((s) => s.action);
      splices.sort((a, b) => b.start - a.start);
      let bytes = joined;
      for (const s of splices) {
        const text = new TextEncoder().encode(s.text);
        const next = new Uint8Array(bytes.length - (s.end - s.start) + text.length);
        next.set(bytes.subarray(0, s.start), 0);
        next.set(text, s.start);
        next.set(bytes.subarray(s.end), s.start + text.length);
        bytes = next;
      }
      page.node.set(PDFName.of('Contents'), context.register(context.flateStream(bytes)));
      dropUnreachable(context);
      return done;
    },

    makeArchival() {
      const d = live();
      const removed = cleanDocument(d, { scripts: true, attachments: true, comments: false, metadata: false });
      const { context } = d;
      // 1. The colour everything is drawn in, said once for the whole file.
      const profile = context.register(context.stream(srgbProfile(), { N: 3 }));
      const intent = context.obj({
        Type: 'OutputIntent',
        S: 'GTS_PDFA1',
        OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
        Info: PDFString.of('sRGB IEC61966-2.1'),
        DestOutputProfile: profile,
      });
      d.catalog.set(PDFName.of('OutputIntents'), context.obj([intent]));
      // 2. XMP that names the standard and mirrors the document's own details.
      const info = self.info();
      const dates = infoDates(d);
      const xmp = archivalXmp(info, dates);
      // Uncompressed, as the standard asks of the metadata stream.
      d.catalog.set(PDFName.of('Metadata'), context.register(context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' })));
      // 3. A file ID, which archives use to tell copies apart.
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      context.trailerInfo.ID = context.obj([PDFHexString.of(id), PDFHexString.of(id)]);
      // 4. Every annotation printable, as the standard requires.
      for (const page of d.getPages()) {
        const annots = page.node.lookup(PDFName.of('Annots'));
        if (!(annots instanceof PDFArray)) continue;
        for (const ref of annots.asArray()) {
          const annot = ref instanceof PDFRef ? context.lookup(ref) : ref;
          if (!(annot instanceof PDFDict) || annot.lookup(PDFName.of('Subtype'))?.toString() === '/Popup') continue;
          const flags = annot.lookup(PDFName.of('F'));
          const value = flags instanceof PDFNumber ? flags.asNumber() : 0;
          annot.set(PDFName.of('F'), PDFNumber.of((value | 4) & ~(1 | 2 | 32)));
        }
      }
      dropUnreachable(context);
      return { scripts: removed.scripts, attachments: removed.attachments, fontsMissing: countUnembeddedFonts(d) };
    },

    async fillForm(values, seal, pictures) {
      const d = live();
      const form = d.getForm();
      const f = font(false);
      let matched = 0;
      /** Fields shown with a picture of their answer: their appearance is ours, not pdf-lib's. */
      const pictured: Array<{ field: PDFTextField | PDFDropdown; lines: readonly AnswerPicture[] }> = [];
      for (const [name, value] of Object.entries(values)) {
        const field = form.getFieldMaybe(name);
        if (field === undefined) continue;
        matched++;
        if (field instanceof PDFTextField) {
          const text = typeof value === 'string' ? value : '';
          const max = field.getMaxLength();
          if (max !== undefined && [...text].length > max) {
            throw new PdfError(`One answer is longer than its box allows (${max} characters). Shorten it and try again.`, 'unknown');
          }
          const lines = pictures?.get(name);
          if (!self.canDraw(text) && lines !== undefined && lines.length > 0) pictured.push({ field, lines });
          else assertDrawable(f, text.replace(/\n/g, ''));
          field.setText(text.length > 0 ? text : undefined);
        } else if (field instanceof PDFCheckBox) {
          if (value === true) field.check();
          else field.uncheck();
        } else if (field instanceof PDFRadioGroup) {
          if (typeof value === 'string' && field.getOptions().includes(value)) field.select(value);
          else if (value === '') field.clear();
        } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
          if (typeof value === 'string' && value.length > 0) {
            const options = field.getOptions();
            if (options.includes(value)) {
              field.select(value);
              const lines = pictures?.get(name);
              if (field instanceof PDFDropdown && !self.canDraw(value) && lines !== undefined && lines.length > 0) pictured.push({ field, lines });
            }
          } else if (value === '') {
            field.clear();
          }
        }
      }
      for (const { field, lines } of pictured) {
        await pictureAppearance(d, field, lines);
        form.markFieldAsClean(field.ref);
      }
      try {
        form.updateFieldAppearances(f);
        if (seal) form.flatten({ updateFieldAppearances: false });
      } catch (error) {
        if (error instanceof PdfError) throw error;
        throw new PdfError("This form couldn't be filled. Its fields may be built in a way this tool can't change yet.", 'unknown', { cause: error });
      }
      return matched;
    },

    async compress(recompress, signal) {
      return compressDocument(live(), recompress, signal);
    },

    info() {
      const d = live();
      const out: DocInfo = {};
      const read: Record<DocInfoField, () => string | undefined> = {
        title: () => d.getTitle(),
        author: () => d.getAuthor(),
        subject: () => d.getSubject(),
        keywords: () => d.getKeywords(),
        creator: () => d.getCreator(),
        producer: () => d.getProducer(),
      };
      for (const field of Object.keys(read) as DocInfoField[]) {
        const value = read[field]();
        if (value !== undefined && value.length > 0) out[field] = value;
      }
      return out;
    },

    setInfo(info) {
      const d = live();
      for (const [field, value] of Object.entries(info) as Array<[DocInfoField, string | undefined]>) {
        if (value === undefined) continue;
        if (value.length === 0) {
          infoDict(d)?.delete(PDFName.of(INFO_KEYS[field]));
          continue;
        }
        if (field === 'title') d.setTitle(value);
        else if (field === 'author') d.setAuthor(value);
        else if (field === 'subject') d.setSubject(value);
        else if (field === 'keywords') d.setKeywords(value.split(/\s*[,;]\s*/).filter(Boolean));
        else if (field === 'creator') d.setCreator(value);
        else d.setProducer(value);
      }
    },

    stripMetadata() {
      const d = live();
      const { context } = d;
      // Delete the objects themselves, not just the references to them:
      // pdf-lib writes every object it holds, so an unlinked Info dictionary
      // would still carry the author's name in the bytes.
      const infoRef = context.trailerInfo.Info;
      if (infoRef instanceof PDFRef) context.delete(infoRef);
      delete (context.trailerInfo as { Info?: unknown }).Info;
      const metadata = d.catalog.get(PDFName.of('Metadata'));
      if (metadata instanceof PDFRef) context.delete(metadata);
      d.catalog.delete(PDFName.of('Metadata'));
    },

    pages(): readonly PageInfo[] {
      return live()
        .getPages()
        .map((page, index) => {
          const { width, height } = page.getSize();
          return { index, width, height, rotation: normaliseRotation(page.getRotation().angle) };
        });
    },

    async appendPages(source, indices) {
      const target = live();
      const from = documents.get(source);
      if (from === undefined) throw new Error('The source document is not open.');
      const sourceCount = from.getPageCount();
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= sourceCount) {
          throw new Error(`Page index ${index} is out of range (0 to ${sourceCount - 1}).`);
        }
      }
      try {
        // The copier clones every object a page reaches into this document's
        // context, including when source === this: the copies get fresh refs
        // and the tree is untouched until addPage, so order and repeats are
        // exactly as asked and the source is never modified. One copier per
        // source for this document's whole life, so a logo or a font that
        // every page shares is copied once, not once per batch of pages.
        await from.flush();
        const copier = copierFrom(from);
        const pages = from.getPages();
        for (const index of indices) {
          const node = copier.copy(pages[index]!.node);
          target.addPage(PDFPage.of(node, target.context.register(node), target));
        }
      } catch (error) {
        if (isMemoryFailure(error)) throw tooLarge(byteLength, error);
        throw error;
      }
    },

    reorder(order) {
      const target = live();
      const pages = target.getPages();
      assertPermutation(order, pages.length);

      // Unlink every leaf from the page tree, last to first so the remaining
      // indices stay valid. removeLeafNode only edits Kids and Count; unlike
      // removePage it deletes nothing from the context, so every page object
      // survives and no ref dangles. Empty intermediate nodes are pruned from
      // the tree as it empties; they remain in the file as a few orphaned
      // dicts, which is what the "few hundred bytes" allowance is for.
      for (let i = pages.length - 1; i >= 0; i--) target.catalog.removeLeafNode(i);

      // Relink in the new order. The tree is now a single flat node, so each
      // insert lands at the end of the root's Kids; the page tells its parent.
      order.forEach((sourceIndex, position) => {
        const page = pages[sourceIndex];
        if (page === undefined) throw new Error(`Page index ${sourceIndex} is out of range.`);
        const parentRef = target.catalog.insertLeafNode(page.ref, position);
        page.node.setParent(parentRef);
      });

      // pdf-lib caches getPages() and only its own insertPage/removePage
      // invalidate that cache. We moved the refs underneath it, so drop the
      // cache ourselves or pages() and copyPages() would see the old order.
      (target as unknown as { pageCache: { invalidate(): void } }).pageCache.invalidate();
    },

    setRotation(index: number, rotation: Rotation) {
      pageAt(index).setRotation(degrees(rotation));
    },

    setTitle(title: string) {
      live().setTitle(title, { showInWindowTitleBar: true });
    },

    async save(opts) {
      const d = live();
      if (replaced) finishRedaction(d, removedWidgets);
      const encrypt = opts?.encrypt;
      if (encrypt !== undefined) {
        if (encrypt.userPassword.length === 0 && encrypt.restrictOnly !== true) throw new Error('A password cannot be empty.');
        d.encrypt({
          userPassword: encrypt.userPassword,
          // Nobody is told the owner password: it exists so a reader enforces
          // the permissions. Foolscap's own "Remove a password" opens the
          // file with the user password, which is all it needs.
          ownerPassword: randomPassword(),
          permissions: {
            printing: encrypt.allowPrinting ? 'highResolution' : false,
            copying: encrypt.allowCopying,
            modifying: encrypt.allowEditing === true,
            annotating: encrypt.allowEditing === true,
            fillingForms: true,
            contentAccessibility: true,
            documentAssembly: encrypt.allowEditing === true,
          },
        });
      }
      try {
        return await d.save({ useObjectStreams: true });
      } catch (error) {
        if (isMemoryFailure(error)) throw tooLarge(byteLength, error);
        throw error;
      }
    },

    close() {
      documents.delete(self);
      doc = null;
    },
  };

  documents.set(self, initial);
  return self;
}

/**
 * A field's look made from pictures of its answer, one per line, for letters
 * the PDF fonts cannot draw: left-aligned with a little air, a single line
 * centred in its box and shrunk to fit it, several lines from the top. Every
 * reader shows it, and sealing draws it into the page.
 */
async function pictureAppearance(doc: PDFDocument, field: PDFTextField | PDFDropdown, lines: readonly AnswerPicture[]): Promise<void> {
  const images: PDFImage[] = [];
  for (const line of lines) images.push(await doc.embedPng(line.png));
  const multiline = field instanceof PDFTextField && field.isMultiline();
  for (const widget of field.acroField.getWidgets()) {
    const { width: w, height: h } = widget.getRectangle();
    const pad = 2;
    // Points per pixel: words about as tall as pdf-lib would size them, never wider than the box.
    let size = multiline ? Math.min(12, (h - 2 * pad) / (lines.length * 1.25)) : Math.min(12, (h - 2 * pad) * 0.62);
    const widest = Math.max(...lines.map((l) => l.width / l.size));
    if (widest * size > w - 2 * pad) size = (w - 2 * pad) / widest;
    // The field's own background and border, as its other fields show them.
    const look = widget.getAppearanceCharacteristics();
    const colour = (c: number[] | undefined, fill: boolean): string | null => {
      if (c === undefined || c.length === 0) return null;
      const n = (v: number | undefined) => (v ?? 0).toFixed(3);
      if (c.length === 1) return `${n(c[0])} ${fill ? 'g' : 'G'}`;
      if (c.length === 4) return `${n(c[0])} ${n(c[1])} ${n(c[2])} ${n(c[3])} ${fill ? 'k' : 'K'}`;
      return `${n(c[0])} ${n(c[1])} ${n(c[2])} ${fill ? 'rg' : 'RG'}`;
    };
    const operators: string[] = [];
    const background = colour(look?.getBackgroundColor(), true);
    if (background) operators.push(`q ${background} 0 0 ${w.toFixed(3)} ${h.toFixed(3)} re f Q`);
    const border = colour(look?.getBorderColor(), false);
    const bw = widget.getBorderStyle()?.getWidth() ?? 1;
    if (border && bw > 0) operators.push(`q ${border} ${bw} w ${bw / 2} ${bw / 2} ${(w - bw).toFixed(3)} ${(h - bw).toFixed(3)} re S Q`);
    operators.push('/Tx BMC', 'q');
    const xobjects: Record<string, PDFRef> = {};
    lines.forEach((line, i) => {
      const k = size / line.size;
      const lw = line.width * k;
      const lh = line.height * k;
      const y = multiline ? h - pad - (i + 1) * lh : (h - lh) / 2;
      xobjects[`Ln${i}`] = images[i]!.ref;
      operators.push(`q ${lw.toFixed(3)} 0 0 ${lh.toFixed(3)} ${pad} ${y.toFixed(3)} cm /Ln${i} Do Q`);
    });
    operators.push('Q', 'EMC');
    const stream = doc.context.stream(operators.join('\n'), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, h], Resources: { XObject: xobjects } });
    widget.setNormalAppearance(doc.context.register(stream));
  }
}

function assertPermutation(order: readonly number[], pageCount: number): void {
  if (order.length !== pageCount) {
    throw new Error(`reorder needs exactly ${pageCount} indices, got ${order.length}.`);
  }
  const seen = new Set<number>();
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount || seen.has(index)) {
      throw new Error('reorder needs every page index exactly once.');
    }
    seen.add(index);
  }
}

const INFO_KEYS: Record<DocInfoField, string> = {
  title: 'Title',
  author: 'Author',
  subject: 'Subject',
  keywords: 'Keywords',
  creator: 'Creator',
  producer: 'Producer',
};

function infoDict(d: PDFDocument): PDFDict | undefined {
  const ref = d.context.trailerInfo.Info;
  const dict = ref === undefined ? undefined : d.context.lookup(ref);
  return dict instanceof PDFDict ? dict : undefined;
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A page as its reader sees it: the visible width and height after /Rotate,
 * and the mapping from those coordinates (origin bottom-left of what is on
 * screen) back to the page's own.
 */
interface PageView {
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
  /** `toPage` as a PDF matrix, for drawing a whole form in the page as the reader sees it. */
  matrix(): [number, number, number, number, number, number];
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
    matrix() {
      // toPage, as a PDF matrix [a b c d e f]: px = a·vx + c·vy + e, py = b·vx + d·vy + f.
      switch (rotation) {
        case 0:
          return [1, 0, 0, 1, x, y];
        case 90:
          return [0, 1, -1, 0, x + w, y];
        case 180:
          return [-1, 0, 0, -1, x + w, y + h];
        case 270:
          return [0, -1, 1, 0, x, y + h];
      }
    },
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
 * The size at which something `measure(size)` = [width, height] across, turned
 * `angle` degrees, fits on the page inside `margin`: `size` itself when it
 * already does.
 */
function fitted(view: PageView, angle: number, margin: number, size: number, measure: (size: number) => [number, number]): number {
  const rad = (angle * Math.PI) / 180;
  const [w, h] = measure(size);
  const across = Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h;
  const down = Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * h;
  const roomX = view.width - 2 * margin;
  const roomY = view.height - 2 * margin;
  if (!(roomX > 0 && roomY > 0 && across > 0 && down > 0)) return size;
  const k = Math.min(1, roomX / across, roomY / down);
  return k < 1 ? Math.max(size * 0.01, size * k) : size;
}

function anchorCentre(view: PageView, stamp: TextStamp, width: number, capHeight: number): [number, number] {
  const m = stamp.margin ?? 36;
  const [vertical, horizontal = 'center'] = stamp.anchor === 'center' ? ['center', 'center'] : stamp.anchor.split('-');
  const cx = horizontal === 'left' ? m + width / 2 : horizontal === 'right' ? view.width - m - width / 2 : view.width / 2;
  const cy = vertical === 'top' ? view.height - m - capHeight / 2 : vertical === 'bottom' ? m + capHeight / 2 : view.height / 2;
  return [cx, cy];
}

/** Centres for a staggered grid that covers the page, capped so tiny text cannot draw ten thousand copies. */
function tileCentres(view: PageView, width: number, size: number): Array<[number, number]> {
  const stepX = width + size * 3;
  const stepY = size * 5;
  const out: Array<[number, number]> = [];
  for (let row = 0, cy = -view.height * 0.25; cy < view.height * 1.25 && out.length < 240; row++, cy += stepY) {
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let cx = -view.width * 0.25 + offset; cx < view.width * 1.25 && out.length < 240; cx += stepX) out.push([cx, cy]);
  }
  return out;
}

/**
 * Every image the document embeds, each once, walking page resources and the
 * form XObjects inside them. JPEG and JPEG 2000 come out exactly as stored.
 * 8-bit RGB and grey pixels become PNG. Anything else (CMYK pixels, indexed
 * colour, masks, 16-bit, TIFF predictors) is counted as skipped, not guessed.
 */
/** An image found in the document, with the stream it came from, for Compress to replace. */
interface FoundImage {
  readonly image: Omit<ExtractedImage, 'bytes'>;
  /** The picture as a file, made only when asked for: Compress skips most images without ever decoding them. */
  bytes(): Uint8Array | null;
  readonly ref: PDFRef | undefined;
  readonly stream: PDFRawStream;
  /** Undefined for a JPEG in a colour space a browser cannot be trusted to decode (CMYK, Lab, indexed). */
  readonly channels: 1 | 3 | undefined;
}

function extractImages(doc: PDFDocument, eager = true): { images: ExtractedImage[]; skipped: number; found: FoundImage[] } {
  const { context } = doc;
  const seen = new Set<string>();
  const images: ExtractedImage[] = [];
  const found: FoundImage[] = [];
  let skipped = 0;
  const push = (
    image: Omit<ExtractedImage, 'bytes'>,
    make: () => Uint8Array | null,
    stream: PDFRawStream,
    ref: PDFRef | undefined,
    channels: 1 | 3 | undefined,
  ): void => {
    if (eager) {
      const bytes = make();
      if (bytes === null) {
        skipped++;
        return;
      }
      images.push({ ...image, bytes });
    }
    found.push({ image, bytes: make, ref, stream, channels });
  };

  const name = (value: unknown): string | undefined => (value instanceof PDFName ? value.decodeText() : undefined);
  const num = (dict: PDFDict, key: string): number | undefined => {
    const v = dict.lookup(PDFName.of(key));
    return v instanceof PDFNumber ? v.asNumber() : undefined;
  };

  const channelsOf = (dict: PDFDict): 1 | 3 | undefined => {
    const cs = dict.lookup(PDFName.of('ColorSpace'));
    const direct = name(cs);
    if (direct === 'DeviceRGB' || direct === 'CalRGB') return 3;
    if (direct === 'DeviceGray' || direct === 'CalGray') return 1;
    if (cs instanceof PDFArray && name(cs.lookup(0)) === 'ICCBased') {
      const profile = cs.lookup(1);
      const n = profile instanceof PDFRawStream ? num(profile.dict, 'N') : undefined;
      return n === 3 ? 3 : n === 1 ? 1 : undefined;
    }
    return undefined;
  };

  const take = (stream: PDFRawStream, page: number, ref: PDFRef | undefined): void => {
    const dict = stream.dict;
    const width = num(dict, 'Width') ?? 0;
    const height = num(dict, 'Height') ?? 0;
    const filterObj = dict.lookup(PDFName.of('Filter'));
    const filters =
      filterObj instanceof PDFArray
        ? filterObj.asArray().map((f) => name(f instanceof PDFRef ? context.lookup(f) : f))
        : filterObj === undefined
          ? []
          : [name(filterObj)];
    const only = filters.length === 1 ? filters[0] : undefined;
    if (dict.lookup(PDFName.of('ImageMask'))?.toString() === 'true') {
      skipped++;
      return;
    }
    if (only === 'DCTDecode') {
      push({ page, ext: 'jpg', width, height }, () => stream.getContents(), stream, ref, channelsOf(dict));
      return;
    }
    if (only === 'JPXDecode') {
      push({ page, ext: 'jp2', width, height }, () => stream.getContents(), stream, ref, undefined);
      return;
    }
    const channels = channelsOf(dict);
    const bits = num(dict, 'BitsPerComponent');
    if (channels === undefined || bits !== 8 || width <= 0 || height <= 0) {
      skipped++;
      return;
    }
    if (only === 'FlateDecode') {
      const parms = dict.lookup(PDFName.of('DecodeParms'));
      const predictor = parms instanceof PDFDict ? num(parms, 'Predictor') ?? 1 : 1;
      if (predictor >= 10) {
        const colors = parms instanceof PDFDict ? num(parms, 'Colors') ?? 1 : 1;
        const columns = parms instanceof PDFDict ? num(parms, 'Columns') ?? 1 : 1;
        if (colors !== channels || columns !== width) {
          skipped++;
          return;
        }
        push({ page, ext: 'png', width, height }, () => pngFromIdat({ width, height, channels }, stream.getContents()), stream, ref, channels);
        return;
      }
      if (predictor !== 1) {
        skipped++;
        return;
      }
    } else if (filters.length > 0) {
      skipped++;
      return;
    }
    const raw = filters.length === 0;
    push(
      { page, ext: 'png', width, height },
      () => pngFromPixels({ width, height, channels }, raw ? stream.getContents() : decodePDFRawStream(stream).decode()),
      stream,
      ref,
      channels,
    );
  };

  const walk = (resources: PDFDict | undefined, page: number, depth: number): void => {
    if (resources === undefined || depth > 8) return;
    const xobjects = resources.lookup(PDFName.of('XObject'));
    if (!(xobjects instanceof PDFDict)) return;
    for (const [, value] of xobjects.entries()) {
      if (value instanceof PDFRef) {
        const key = value.toString();
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const stream = value instanceof PDFRef ? context.lookup(value) : value;
      if (!(stream instanceof PDFRawStream)) continue;
      const subtype = name(stream.dict.lookup(PDFName.of('Subtype')));
      if (subtype === 'Image') {
        try {
          take(stream, page, value instanceof PDFRef ? value : undefined);
        } catch {
          skipped++;
        }
      } else if (subtype === 'Form') {
        const inner = stream.dict.lookup(PDFName.of('Resources'));
        walk(inner instanceof PDFDict ? inner : undefined, page, depth + 1);
      }
    }
  };

  doc.getPages().forEach((page, index) => walk(page.node.Resources(), index, 0));
  return { images, skipped, found };
}

/**
 * Makes a document smaller in the three ways that matter and are safe:
 *
 * 1. Photos stored bigger or finer than a screen or printer needs are
 *    re-encoded as JPEG by `recompress` (the op's, which owns the decoding),
 *    and swapped in only when the new one is smaller. A photo with a colour
 *    key mask or a /Decode array is left alone: lossy pixels would break both.
 * 2. Objects nothing points at — earlier versions left by incremental saves,
 *    the shells of unpacked object streams — are dropped.
 * 3. Streams stored with no compression at all are deflated.
 */
async function compressDocument(
  doc: PDFDocument,
  recompress: (image: ExtractedImage) => Promise<RecompressedImage | null>,
  signal: AbortSignal | undefined,
): Promise<CompressReport> {
  const { context } = doc;
  const { found } = extractImages(doc, false);
  let photos = 0;
  let replaced = 0;
  for (const { image, bytes, ref, stream, channels } of found) {
    if (signal?.aborted) break;
    if (ref === undefined || channels === undefined || image.ext === 'jp2') continue;
    const dict = stream.dict;
    // Lossy pixels would break a /Decode array, and a mask (stencil or colour
    // key) is drawn against the exact pixels; a soft mask with /Matte needs
    // the image and the mask the same size. All of those stay as they are.
    if (dict.has(PDFName.of('Decode')) || dict.has(PDFName.of('Mask'))) continue;
    const smask = dict.lookup(PDFName.of('SMask'));
    if (smask instanceof PDFRawStream && smask.dict.has(PDFName.of('Matte'))) continue;
    // A small photo has little to give and a lot to lose; skip it before decoding anything.
    if (stream.getContents().length < 24_000) continue;
    photos++;
    let picture: Uint8Array | null;
    try {
      picture = bytes();
    } catch {
      continue;
    }
    if (picture === null) continue;
    const next = await recompress({ ...image, bytes: picture });
    picture = null;
    if (next === null || next.bytes.length >= stream.getContents().length * 0.9) continue;
    const entries: Record<string, unknown> = {
      Type: 'XObject',
      Subtype: 'Image',
      Width: next.width,
      Height: next.height,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    };
    const replacement = context.stream(next.bytes, entries as never);
    // A soft mask, an intent or an alternate rides across as it was: none of them depends on the pixels' size.
    for (const key of ['SMask', 'Intent', 'Interpolate', 'Alternates', 'OC', 'Metadata', 'StructParent']) {
      const value = dict.get(PDFName.of(key));
      if (value !== undefined) replacement.dict.set(PDFName.of(key), value);
    }
    context.assign(ref, replacement);
    replaced++;
  }

  const dropped = dropUnreachable(context);

  let deflated = 0;
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    if (dict.has(PDFName.of('Filter'))) continue;
    const type = dict.lookup(PDFName.of('Type'));
    // XMP metadata is meant to be readable without a PDF library; leave it plain.
    if (type instanceof PDFName && type.decodeText() === 'Metadata') continue;
    const contents = object.getContents();
    if (contents.length < 256) continue;
    const packed = zlibSync(contents, { level: 9 });
    if (packed.length >= contents.length * 0.9) continue;
    const next = PDFRawStream.of(dict.clone(context), packed);
    next.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    next.dict.delete(PDFName.of('DecodeParms'));
    context.assign(ref, next);
    deflated++;
  }

  return { photos, replaced, dropped, deflated };
}

/**
 * Deletes every object nothing points at, from the trailer down. pdf-lib
 * writes every object it holds, so anything unlinked but not deleted would
 * still be in the file: for Compress that is waste, for Remove areas it would
 * be the very words that were removed.
 */
function dropUnreachable(context: PDFDocument['context']): number {
  const reachable = new Set<string>();
  const stack: unknown[] = [context.trailerInfo.Root, context.trailerInfo.Info, context.trailerInfo.Encrypt];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value instanceof PDFRef) {
      const key = value.toString();
      if (reachable.has(key)) continue;
      reachable.add(key);
      stack.push(context.lookup(value));
    } else if (value instanceof PDFDict) {
      for (const [, v] of value.entries()) stack.push(v);
    } else if (value instanceof PDFArray) {
      stack.push(...value.asArray());
    } else if (value !== null && typeof value === 'object' && 'dict' in value && value.dict instanceof PDFDict) {
      stack.push(value.dict);
    }
  }
  let dropped = 0;
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reachable.has(ref.toString())) {
      context.delete(ref);
      dropped++;
    }
  }
  return dropped;
}

/**
 * After pages were swapped for pictures: the form fields whose every widget
 * sat on those pages go (their values are text too), and so does the
 * structure tree, whose entries can carry a page's words as /Alt or
 * /ActualText. Then everything left unlinked is deleted.
 */
function finishRedaction(doc: PDFDocument, removedWidgets: ReadonlySet<string>): void {
  const { context } = doc;
  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (acroForm instanceof PDFDict) {
    // Returns true when the field (or widget) at `ref` has nothing left on any page.
    const prune = (ref: unknown, depth: number): boolean => {
      if (depth > 32) return false;
      if (ref instanceof PDFRef && removedWidgets.has(ref.toString())) return true;
      const node = ref instanceof PDFRef ? context.lookup(ref) : ref;
      if (!(node instanceof PDFDict)) return false;
      const kids = node.lookup(PDFName.of('Kids'));
      if (!(kids instanceof PDFArray)) return false;
      const keep = kids.asArray().filter((kid) => !prune(kid, depth + 1));
      if (keep.length === kids.size()) return false;
      if (keep.length === 0) return true;
      node.set(PDFName.of('Kids'), context.obj(keep));
      return false;
    };
    const fields = acroForm.lookup(PDFName.of('Fields'));
    if (fields instanceof PDFArray) {
      const keep = fields.asArray().filter((field) => !prune(field, 0));
      acroForm.set(PDFName.of('Fields'), context.obj(keep));
    }
  }
  doc.catalog.delete(PDFName.of('StructTreeRoot'));
  doc.catalog.delete(PDFName.of('MarkInfo'));
  dropUnreachable(context);
}

/** A media type from a file name, for an attachment's /Subtype; generic when unknown. */
function mimeFor(name: string): string {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const known: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    txt: 'text/plain',
    csv: 'text/csv',
    xml: 'application/xml',
    json: 'application/json',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
  };
  return known[ext] ?? 'application/octet-stream';
}

const textOf = (value: unknown): string | undefined =>
  value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined;

/** Walks a name tree (/Names pairs, /Kids) and calls `visit` for every value. */
function walkNameTree(context: PDFDocument['context'], node: unknown, visit: (key: string, value: unknown) => void, depth = 0): void {
  const dict = node instanceof PDFRef ? context.lookup(node) : node;
  if (!(dict instanceof PDFDict) || depth > 16) return;
  const names = dict.lookup(PDFName.of('Names'));
  if (names instanceof PDFArray) {
    for (let i = 0; i + 1 < names.size(); i += 2) visit(textOf(names.lookup(i)) ?? '', names.get(i + 1));
  }
  const kids = dict.lookup(PDFName.of('Kids'));
  if (kids instanceof PDFArray) for (const kid of kids.asArray()) walkNameTree(context, kid, visit, depth + 1);
}

/** A file specification's name and decoded bytes, or null when it carries no embedded file. */
function fileFromSpec(context: PDFDocument['context'], spec: unknown, fallback: string): Attachment | null {
  const dict = spec instanceof PDFRef ? context.lookup(spec) : spec;
  if (!(dict instanceof PDFDict)) return null;
  const ef = dict.lookup(PDFName.of('EF'));
  if (!(ef instanceof PDFDict)) return null;
  const stream = ef.lookup(PDFName.of('UF')) ?? ef.lookup(PDFName.of('F'));
  if (!(stream instanceof PDFRawStream)) return null;
  const name = textOf(dict.lookup(PDFName.of('UF'))) ?? textOf(dict.lookup(PDFName.of('F'))) ?? fallback;
  const description = textOf(dict.lookup(PDFName.of('Desc')));
  const bytes = decodePDFRawStream(stream).decode();
  return { name: name.replace(/[\\/]/g, '_') || fallback, bytes, ...(description ? { description } : {}) };
}

function readAttachments(doc: PDFDocument): Attachment[] {
  const { context } = doc;
  const out: Attachment[] = [];
  const names = doc.catalog.lookup(PDFName.of('Names'));
  if (names instanceof PDFDict) {
    walkNameTree(context, names.get(PDFName.of('EmbeddedFiles')), (key, value) => {
      const file = fileFromSpec(context, value, key || `attachment ${out.length + 1}`);
      if (file) out.push(file);
    });
  }
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    for (const ref of annots.asArray()) {
      const annot = ref instanceof PDFRef ? context.lookup(ref) : ref;
      if (!(annot instanceof PDFDict) || annot.lookup(PDFName.of('Subtype'))?.toString() !== '/FileAttachment') continue;
      const file = fileFromSpec(context, annot.get(PDFName.of('FS')), `attachment ${out.length + 1}`);
      if (file) out.push(file);
    }
  }
  return out;
}

/** The page index a destination (explicit array, a name, or a GoTo action) points to, or null. */
function destinationPage(doc: PDFDocument, value: unknown, pageIndex: ReadonlyMap<string, number>): number | null {
  const { context } = doc;
  let dest = value instanceof PDFRef ? context.lookup(value) : value;
  if (dest instanceof PDFDict) {
    // An action: /S /GoTo /D …, or a destination dictionary with /D.
    dest = dest.lookup(PDFName.of('D'));
  }
  const named = dest instanceof PDFName ? dest.decodeText() : textOf(dest);
  if (named !== undefined) {
    let found: unknown;
    const dests = doc.catalog.lookup(PDFName.of('Dests'));
    if (dests instanceof PDFDict) found = dests.get(PDFName.of(named));
    const names = doc.catalog.lookup(PDFName.of('Names'));
    if (found === undefined && names instanceof PDFDict) {
      walkNameTree(context, names.get(PDFName.of('Dests')), (key, v) => {
        if (key === named && found === undefined) found = v;
      });
    }
    if (found === undefined) return null;
    const resolved = found instanceof PDFRef ? context.lookup(found) : found;
    dest = resolved instanceof PDFDict ? resolved.lookup(PDFName.of('D')) : resolved;
  }
  if (!(dest instanceof PDFArray)) return null;
  const target = dest.get(0);
  if (target instanceof PDFRef) return pageIndex.get(target.toString()) ?? null;
  if (target instanceof PDFNumber) return Math.floor(target.asNumber());
  return null;
}

function readBookmarks(doc: PDFDocument): OutlineItem[] {
  const { context } = doc;
  const pageIndex = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i]));
  let budget = 5000;
  const walk = (first: unknown, depth: number): OutlineItem[] => {
    const out: OutlineItem[] = [];
    const seen = new Set<string>();
    let ref = first;
    while (ref instanceof PDFRef && budget-- > 0 && !seen.has(ref.toString())) {
      seen.add(ref.toString());
      const item = context.lookup(ref);
      if (!(item instanceof PDFDict)) break;
      const title = (textOf(item.lookup(PDFName.of('Title'))) ?? '').replace(/\s+/g, ' ').trim() || 'Untitled';
      const page = destinationPage(doc, item.get(PDFName.of('Dest')) ?? item.get(PDFName.of('A')), pageIndex);
      out.push({ title, page, items: depth < 8 ? walk(item.get(PDFName.of('First')), depth + 1) : [] });
      ref = item.get(PDFName.of('Next'));
    }
    return out;
  };
  const outlines = doc.catalog.lookup(PDFName.of('Outlines'));
  return outlines instanceof PDFDict ? walk(outlines.get(PDFName.of('First')), 0) : [];
}

function writeBookmarks(doc: PDFDocument, items: readonly OutlineItem[]): void {
  const { context } = doc;
  const old = doc.catalog.get(PDFName.of('Outlines'));
  doc.catalog.delete(PDFName.of('Outlines'));
  if (old instanceof PDFRef) dropUnreachable(context);
  const pages = doc.getPages();
  const usable = (list: readonly OutlineItem[]): OutlineItem[] =>
    list.filter((i) => i.page !== null && i.page >= 0 && i.page < pages.length).map((i) => ({ ...i, items: usable(i.items) }));
  const top = usable(items);
  if (top.length === 0) return;
  const root = context.register(context.obj({ Type: 'Outlines' }));
  // Builds one level under `parent` and returns how many entries it holds, open.
  const level = (list: readonly OutlineItem[], parent: PDFRef): number => {
    const refs = list.map(() => context.nextRef());
    let count = 0;
    list.forEach((item, i) => {
      const dict = context.obj({});
      dict.set(PDFName.of('Title'), PDFHexString.fromText(item.title.slice(0, 500)));
      dict.set(PDFName.of('Parent'), parent);
      dict.set(PDFName.of('Dest'), context.obj([pages[item.page ?? 0]!.ref, PDFName.of('Fit')]));
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]!);
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]!);
      context.assign(refs[i]!, dict);
      count++;
      if (item.items.length > 0) {
        const inner = level(item.items, refs[i]!);
        dict.set(PDFName.of('Count'), PDFNumber.of(inner));
        count += inner;
      }
    });
    const parentDict = context.lookup(parent);
    if (parentDict instanceof PDFDict && refs.length > 0) {
      parentDict.set(PDFName.of('First'), refs[0]!);
      parentDict.set(PDFName.of('Last'), refs[refs.length - 1]!);
    }
    return count;
  };
  const total = level(top, root);
  const rootDict = context.lookup(root);
  if (rootDict instanceof PDFDict) rootDict.set(PDFName.of('Count'), PDFNumber.of(total));
  doc.catalog.set(PDFName.of('Outlines'), root);
}

/** Takes scripts, attachments and comments out, counting each; the caller strips metadata and sweeps. */
function cleanDocument(doc: PDFDocument, opts: CleanOptions): CleanReport {
  const { context } = doc;
  let scripts = 0;
  let attachments = 0;
  let comments = 0;
  const names = doc.catalog.lookup(PDFName.of('Names'));
  if (opts.scripts) {
    if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
      walkNameTree(context, names.get(PDFName.of('JavaScript')), () => scripts++);
      names.delete(PDFName.of('JavaScript'));
    }
    for (const key of ['OpenAction', 'AA']) {
      if (doc.catalog.has(PDFName.of(key))) {
        const value = doc.catalog.lookup(PDFName.of(key));
        // An OpenAction that only says which page to show is harmless; anything else goes.
        const harmless = key === 'OpenAction' && value instanceof PDFArray;
        if (!harmless) {
          doc.catalog.delete(PDFName.of(key));
          scripts++;
        }
      }
    }
    const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
    if (acroForm instanceof PDFDict && acroForm.has(PDFName.of('XFA'))) {
      acroForm.delete(PDFName.of('XFA'));
      scripts++;
    }
  }
  if (opts.attachments && names instanceof PDFDict && names.has(PDFName.of('EmbeddedFiles'))) {
    walkNameTree(context, names.get(PDFName.of('EmbeddedFiles')), () => attachments++);
    names.delete(PDFName.of('EmbeddedFiles'));
  }
  for (const page of doc.getPages()) {
    if (opts.scripts && page.node.has(PDFName.of('AA'))) {
      page.node.delete(PDFName.of('AA'));
      scripts++;
    }
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    const keep: unknown[] = [];
    for (const ref of annots.asArray()) {
      const annot = ref instanceof PDFRef ? context.lookup(ref) : ref;
      if (!(annot instanceof PDFDict)) continue;
      const subtype = annot.lookup(PDFName.of('Subtype'))?.toString();
      if (opts.scripts) {
        for (const key of ['AA', 'A']) {
          const action = annot.lookup(PDFName.of(key));
          const kind = action instanceof PDFDict ? action.lookup(PDFName.of('S'))?.toString() : undefined;
          if (key === 'AA' || kind === '/JavaScript' || kind === '/Launch' || kind === '/ImportData' || kind === '/SubmitForm') {
            if (annot.has(PDFName.of(key))) {
              annot.delete(PDFName.of(key));
              scripts++;
            }
          }
        }
      }
      if (subtype === '/FileAttachment' && opts.attachments) {
        attachments++;
        continue;
      }
      if (opts.comments && subtype !== '/Link' && subtype !== '/Widget') {
        if (subtype !== '/Popup') comments++;
        continue;
      }
      keep.push(ref);
    }
    page.node.set(PDFName.of('Annots'), context.obj(keep as never));
  }
  return { scripts, attachments, comments, metadata: opts.metadata };
}

/** "D:20261012143000+05'30'" → "2026-10-12T14:30:00+05:30". Null for anything else. */
export function pdfDateToIso(value: string): string | null {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz]|[+-]\d{2}'?\d{2}'?)?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', zone] = m;
  const tz = zone === undefined || /^[Zz]$/.test(zone) ? (zone === undefined ? '' : 'Z') : `${zone.slice(0, 3)}:${zone.replace(/'/g, '').slice(3, 5) || '00'}`;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`;
}

function infoDates(doc: PDFDocument): { created?: string; modified?: string } {
  const ref = doc.context.trailerInfo.Info;
  const info = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
  if (!(info instanceof PDFDict)) return {};
  const read = (key: string) => {
    const raw = textOf(info.lookup(PDFName.of(key)));
    return raw === undefined ? undefined : (pdfDateToIso(raw) ?? undefined);
  };
  const created = read('CreationDate');
  const modified = read('ModDate');
  return { ...(created ? { created } : {}), ...(modified ? { modified } : {}) };
}

const xmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** XMP for PDF/A-2b, carrying exactly the details the Info dictionary has, so the two agree. */
export function archivalXmp(info: DocInfo, dates: { created?: string; modified?: string }): string {
  const lines: string[] = [];
  if (info.title) lines.push(`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlText(info.title)}</rdf:li></rdf:Alt></dc:title>`);
  if (info.author) lines.push(`<dc:creator><rdf:Seq><rdf:li>${xmlText(info.author)}</rdf:li></rdf:Seq></dc:creator>`);
  if (info.subject) lines.push(`<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlText(info.subject)}</rdf:li></rdf:Alt></dc:description>`);
  if (info.keywords) lines.push(`<pdf:Keywords>${xmlText(info.keywords)}</pdf:Keywords>`);
  if (info.producer) lines.push(`<pdf:Producer>${xmlText(info.producer)}</pdf:Producer>`);
  if (info.creator) lines.push(`<xmp:CreatorTool>${xmlText(info.creator)}</xmp:CreatorTool>`);
  if (dates.created) lines.push(`<xmp:CreateDate>${dates.created}</xmp:CreateDate>`);
  if (dates.modified) lines.push(`<xmp:ModifyDate>${dates.modified}</xmp:ModifyDate>`);
  return [
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    '<pdfaid:part>2</pdfaid:part>',
    '<pdfaid:conformance>B</pdfaid:conformance>',
    ...lines,
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
}

/** Fonts the file uses but does not carry: the one thing an archive copy cannot fix without the font. */
function countUnembeddedFonts(doc: PDFDocument): number {
  const { context } = doc;
  const seen = new Set<string>();
  let missing = 0;
  const look = (value: unknown): PDFDict | null => {
    const v = value instanceof PDFRef ? context.lookup(value) : value;
    return v instanceof PDFDict ? v : null;
  };
  const visitFont = (ref: unknown, depth: number) => {
    const key = ref instanceof PDFRef ? ref.toString() : '';
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    const font = look(ref);
    if (!font || depth > 4) return;
    const subtype = font.lookup(PDFName.of('Subtype'))?.toString();
    if (subtype === '/Type3') return;
    if (subtype === '/Type0') {
      const kids = font.lookup(PDFName.of('DescendantFonts'));
      if (kids instanceof PDFArray) for (const kid of kids.asArray()) visitFont(kid, depth + 1);
      return;
    }
    const descriptor = look(font.get(PDFName.of('FontDescriptor')));
    const embedded = descriptor !== null && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => descriptor.has(PDFName.of(k)));
    if (!embedded) missing++;
  };
  const visitResources = (resources: PDFDict | null, depth: number) => {
    if (!resources || depth > 6) return;
    const fonts = look(resources.get(PDFName.of('Font')));
    if (fonts) for (const [, ref] of fonts.entries()) visitFont(ref, 0);
    const xobjects = look(resources.get(PDFName.of('XObject')));
    if (xobjects) {
      for (const [, ref] of xobjects.entries()) {
        const key = ref instanceof PDFRef ? `x${ref.toString()}` : '';
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        const x = ref instanceof PDFRef ? context.lookup(ref) : ref;
        const dict = x instanceof PDFRawStream ? x.dict : null;
        if (dict && dict.lookup(PDFName.of('Subtype'))?.toString() === '/Form') visitResources(look(dict.get(PDFName.of('Resources'))), depth + 1);
      }
    }
  };
  for (const page of doc.getPages()) visitResources(look(page.node.get(PDFName.of('Resources'))) ?? (page.node.Resources() ?? null), 0);
  return missing;
}

