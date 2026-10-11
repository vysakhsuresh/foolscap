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
  PDFDict,
  PDFDocument,
  PDFInvalidObject,
  PDFRef,
  degrees,
  type PDFPage,
} from '@cantoo/pdf-lib';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import { PdfError, type PageInfo, type PdfDoc, type PdfSurgeon, type Rotation } from './types';

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
      return wrap(doc, undefined);
    },

    async open(data, opts) {
      const password = opts?.password;
      try {
        const doc = await PDFDocument.load(data, {
          updateMetadata: false,
          ...(password === undefined ? {} : { password }),
        });
        repairTrailer(doc);
        // pdf-lib is lenient: a header followed by junk, or a file cut short,
        // "loads" with no catalog or no pages and only fails later, inside an
        // op. Fail here instead, where the message can say what happened.
        if (doc.getPageCount() === 0) throw notReadable(data, new Error('No pages'));
        return wrap(doc, data.byteLength);
      } catch (error) {
        throw toPdfError(error, data);
      }
    },
  };
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

function wrap(initial: PDFDocument, byteLength: number | undefined): PdfDoc {
  let doc: PDFDocument | null = initial;

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

    async save() {
      try {
        return await live().save({ useObjectStreams: true });
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
