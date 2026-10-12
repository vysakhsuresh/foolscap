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
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFInvalidObject,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import { zlibSync } from 'fflate';
import { pngFromIdat, pngFromPixels } from './png';
import { signDetached } from '../sign/cms';
import { readIdentity } from '../sign/identity';
import { signPdf } from './sign-pdf';
import { layoutFlow } from './surgeon-flow';
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
  type ExtractedImage,
  type PageInfo,
  type PdfDoc,
  type PdfSurgeon,
  type RecompressedImage,
  type Rotation,
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
        // pdf-lib is lenient: a header followed by junk, or a file cut short,
        // "loads" with no catalog or no pages and only fails later, inside an
        // op. Fail here instead, where the message can say what happened.
        if (doc.getPageCount() === 0) throw notReadable(data, new Error('No pages'));
        // pdf-lib clears isEncrypted once a password has opened the file and
        // records that in its context instead; either means it was locked.
        return wrap(doc, data.byteLength, doc.isEncrypted || doc.context.isDecrypted === true);
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

function wrap(initial: PDFDocument, byteLength: number | undefined, wasEncrypted: boolean): PdfDoc {
  let doc: PDFDocument | null = initial;
  const fonts = new Map<'regular' | 'bold', PDFFont>();
  let drawable: Set<number> | null = null;
  /** Annotations on pages Remove areas turned into pictures; non-empty means save() finishes the job. */
  const removedWidgets = new Set<string>();
  let replaced = false;

  const font = (bold: boolean): PDFFont => {
    const key = bold ? 'bold' : 'regular';
    let f = fonts.get(key);
    if (f === undefined) {
      f = live().embedStandardFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
      fonts.set(key, f);
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
      const width = f.widthOfTextAtSize(text, stamp.size);
      const capHeight = f.heightAtSize(stamp.size, { descender: false });
      const view = viewOf(page);
      const angle = stamp.angle ?? 0;
      const centres = stamp.tiled === true ? tileCentres(view, width, stamp.size) : [anchorCentre(view, stamp, width, capHeight)];
      const rad = (angle * Math.PI) / 180;
      const [r, g, b] = stamp.color ?? [0, 0, 0];
      for (const [cx, cy] of centres) {
        // The text's own origin is its bottom-left; put its centre on (cx, cy).
        const vx = cx - (Math.cos(rad) * width) / 2 + (Math.sin(rad) * capHeight) / 2;
        const vy = cy - (Math.sin(rad) * width) / 2 - (Math.cos(rad) * capHeight) / 2;
        const [px, py] = view.toPage(vx, vy);
        page.drawText(text, {
          x: px,
          y: py,
          size: stamp.size,
          font: f,
          color: rgb(r, g, b),
          opacity: stamp.opacity ?? 1,
          rotate: degrees(angle + view.rotation),
        });
      }
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
          const embedded = await target.embedPage(page, {
            left: crop.x,
            bottom: crop.y,
            right: crop.x + crop.width,
            top: crop.y + crop.height,
          });
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
          sheet.drawPage(embedded, { x: ox, y: oy, xScale: scale, yScale: scale, rotate: degrees(-rotation) });
        }
      } catch (error) {
        if (isMemoryFailure(error)) throw tooLarge(byteLength, error);
        throw error;
      }
    },

    async addImagePage(image, paper, margin) {
      const target = live();
      const embedded = image.kind === 'jpeg' ? await target.embedJpg(image.bytes) : await target.embedPng(image.bytes);
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
        const page = pageAt(mark.kind === 'ink' ? mark.page : mark.area.page);
        const view = viewOf(page);
        const W = view.width;
        const H = view.height;
        if (mark.kind === 'ink') {
          const points: Array<[number, number]> = [];
          for (let i = 0; i + 1 < mark.points.length; i += 2) {
            points.push(view.toPage((mark.points[i] ?? 0) * W, (1 - (mark.points[i + 1] ?? 0)) * H));
          }
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
        const { area } = mark;
        // The area's bottom-left, in the view's points (origin bottom-left).
        const vx = area.x * W;
        const vy = (1 - area.y - area.h) * H;
        const w = area.w * W;
        const h = area.h * H;
        switch (mark.kind) {
          case 'image': {
            const image = await d.embedPng(mark.png);
            const [px, py] = view.toPage(vx, vy);
            page.drawImage(image, { x: px, y: py, width: w, height: h, rotate: degrees(view.rotation) });
            break;
          }
          case 'highlight': {
            const [x1, y1] = view.toPage(vx, vy);
            const [x2, y2] = view.toPage(vx + w, vy + h);
            const [r, g, b] = mark.color;
            page.drawRectangle({
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              width: Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
              color: rgb(r, g, b),
              opacity: 0.45,
              blendMode: BlendMode.Multiply,
            });
            break;
          }
          case 'text': {
            const f = font(false);
            const lines = mark.text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n');
            assertDrawable(f, lines.join(''));
            const size = mark.size * W;
            const top = (1 - area.y) * H;
            const [r, g, b] = mark.color;
            lines.forEach((line, i) => {
              if (line.trim().length === 0) return;
              // Matches the editor's CSS: line-height 1.25, baseline 0.97 em below the line's top.
              const [px, py] = view.toPage(vx, top - size * (0.97 + i * 1.25));
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

    fillForm(values, seal) {
      const d = live();
      const form = d.getForm();
      const f = font(false);
      for (const [name, value] of Object.entries(values)) {
        const field = form.getFieldMaybe(name);
        if (field === undefined) continue;
        if (field instanceof PDFTextField) {
          const text = typeof value === 'string' ? value : '';
          assertDrawable(f, text.replace(/\n/g, ''));
          const max = field.getMaxLength();
          if (max !== undefined && text.length > max) {
            throw new PdfError(`One answer is longer than its box allows (${max} characters). Shorten it and try again.`, 'unknown');
          }
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
            if (options.includes(value)) field.select(value);
          } else if (value === '') {
            field.clear();
          }
        }
      }
      try {
        form.updateFieldAppearances(f);
        if (seal) form.flatten({ updateFieldAppearances: false });
      } catch (error) {
        if (error instanceof PdfError) throw error;
        throw new PdfError("This form couldn't be filled. Its fields may be built in a way this tool can't change yet.", 'unknown', { cause: error });
      }
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
        // copyPages clones every object a page reaches into this document's
        // context, including when source === this: the copies get fresh refs
        // and the tree is untouched until addPage, so order and repeats are
        // exactly as asked and the source is never modified.
        const copies = await target.copyPages(from, [...indices]);
        for (const copy of copies) target.addPage(copy);
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
