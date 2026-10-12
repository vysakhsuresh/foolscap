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
  EncryptedPDFError,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFInvalidObject,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import { pngFromIdat, pngFromPixels } from './png';
import {
  PdfError,
  type Box,
  type DocInfo,
  type DocInfoField,
  type ExtractedImage,
  type PageInfo,
  type PdfDoc,
  type PdfSurgeon,
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
    return await PDFDocument.load(data, { updateMetadata: false, ...(password === undefined ? {} : { password }) });
  } catch (error) {
    const needsPassword = error instanceof EncryptedPDFError || /needs password/i.test(error instanceof Error ? error.message : '');
    if (password !== undefined || !needsPassword) throw error;
    return PDFDocument.load(data, { updateMetadata: false, password: '' });
  }
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

  const font = (bold: boolean): PDFFont => {
    const key = bold ? 'bold' : 'regular';
    let f = fonts.get(key);
    if (f === undefined) {
      f = live().embedStandardFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
      fonts.set(key, f);
    }
    return f;
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
      // pdf-lib does not refuse a character its font lacks: it draws an
      // empty box. Check every one against what the font can really draw.
      drawable ??= new Set(f.getCharacterSet());
      const missing = [...text].some((ch) => !drawable?.has(ch.codePointAt(0) ?? 0));
      if (missing) {
        throw new PdfError(
          'This text has letters the built-in font cannot draw yet, such as Malayalam, Hindi, Arabic or emoji. Use English letters and numbers for now.',
          'unsupported-text',
        );
      }
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
      return extractImages(live());
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
      const encrypt = opts?.encrypt;
      if (encrypt !== undefined) {
        if (encrypt.userPassword.length === 0) throw new Error('A password cannot be empty.');
        d.encrypt({
          userPassword: encrypt.userPassword,
          // Nobody is told the owner password: it exists so a reader enforces
          // the permissions. Foolscap's own "Remove a password" opens the
          // file with the user password, which is all it needs.
          ownerPassword: randomPassword(),
          permissions: {
            printing: encrypt.allowPrinting ? 'highResolution' : false,
            copying: encrypt.allowCopying,
            modifying: false,
            annotating: false,
            fillingForms: true,
            contentAccessibility: true,
            documentAssembly: false,
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
function extractImages(doc: PDFDocument): { images: ExtractedImage[]; skipped: number } {
  const { context } = doc;
  const seen = new Set<string>();
  const images: ExtractedImage[] = [];
  let skipped = 0;

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

  const take = (stream: PDFRawStream, page: number): void => {
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
      images.push({ page, bytes: stream.getContents(), ext: 'jpg', width, height });
      return;
    }
    if (only === 'JPXDecode') {
      images.push({ page, bytes: stream.getContents(), ext: 'jp2', width, height });
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
        images.push({ page, bytes: pngFromIdat({ width, height, channels }, stream.getContents()), ext: 'png', width, height });
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
    const pixels = filters.length === 0 ? stream.getContents() : decodePDFRawStream(stream).decode();
    const png = pngFromPixels({ width, height, channels }, pixels);
    if (png === null) skipped++;
    else images.push({ page, bytes: png, ext: 'png', width, height });
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
          take(stream, page);
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
  return { images, skipped };
}
