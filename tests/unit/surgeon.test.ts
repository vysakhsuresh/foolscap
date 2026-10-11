/**
 * The real surgeon over real pdf-lib, in Node. Tests may name the library: the
 * seam rule applies to app/ only.
 */
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { PdfError, type PdfDoc } from '../../app/src/pdf/types';

const surgeon = createSurgeon();

/** Every byte array a test saved, checked once at the end for a stamp. */
const outputs: Array<{ label: string; bytes: Uint8Array; created: boolean; producer?: string; creator?: string }> = [];

const SIZES: ReadonlyArray<[number, number]> = [
  [200, 300],
  [400, 500],
  [600, 700],
  [210, 297],
  [612, 792],
];

/** A document with `n` pages of distinct sizes, so order is checkable after any operation. */
async function makeInput(n: number, meta?: { producer: string; creator: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < n; i++) {
    const size = SIZES[i % SIZES.length]!;
    const page = doc.addPage(size);
    page.drawText(`Page ${i + 1}`, { x: 20, y: size[1] - 40, size: 18 });
  }
  if (meta) {
    doc.setProducer(meta.producer);
    doc.setCreator(meta.creator);
  }
  return doc.save({ useObjectStreams: true });
}

function sizesOf(doc: PdfDoc): Array<[number, number]> {
  return doc.pages().map((p) => [p.width, p.height]);
}

async function reopen(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
}

async function failureCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PdfError);
    const pdfError = error as PdfError;
    expect(pdfError.message).toMatch(/^[A-Z].*\.$/);
    return pdfError.code;
  }
  throw new Error('expected a rejection');
}

describe('open and pages', () => {
  it('reports count, sizes and normalised rotation', async () => {
    const input = await makeInput(3);
    const src = await PDFDocument.load(input, { updateMetadata: false });
    src.getPage(1).setRotation(degrees(-90));
    const doc = await surgeon.open(await src.save({ useObjectStreams: true }));
    expect(doc.pageCount).toBe(3);
    expect(sizesOf(doc)).toEqual([
      [200, 300],
      [400, 500],
      [600, 700],
    ]);
    expect(doc.pages().map((p) => p.rotation)).toEqual([0, 270, 0]);
    expect(doc.pages().map((p) => p.index)).toEqual([0, 1, 2]);
    doc.close();
  });
});

describe('appendPages, setRotation, setTitle, save', () => {
  it('builds a document in a custom order with a repeat and survives a round trip', async () => {
    const input = await makeInput(3, { producer: 'Example Producer', creator: 'Example Creator' });
    const source = await surgeon.open(input.slice());
    const out = await surgeon.create();

    await out.appendPages(source, [2, 0, 2]);
    expect(out.pageCount).toBe(3);
    out.setRotation(1, 90);
    out.setRotation(2, 270);
    out.setTitle('Three pages');
    const bytes = await out.save();
    outputs.push({ label: 'appended', bytes, created: true });

    // The source is untouched.
    expect(source.pageCount).toBe(3);
    expect(sizesOf(source)).toEqual([
      [200, 300],
      [400, 500],
      [600, 700],
    ]);

    const again = await surgeon.open(bytes);
    expect(again.pageCount).toBe(3);
    expect(sizesOf(again)).toEqual([
      [600, 700],
      [200, 300],
      [600, 700],
    ]);
    expect(again.pages().map((p) => p.rotation)).toEqual([0, 90, 270]);

    const lib = await reopen(bytes);
    expect(lib.getTitle()).toBe('Three pages');

    source.close();
    out.close();
    again.close();
  });

  it('setRotation replaces the page’s own rotation rather than adding to it', async () => {
    const doc = await surgeon.open(await makeInput(1));
    doc.setRotation(0, 90);
    doc.setRotation(0, 90);
    expect(doc.pages()[0]!.rotation).toBe(90);
    doc.setRotation(0, 0);
    expect(doc.pages()[0]!.rotation).toBe(0);
    doc.close();
  });

  it('refuses an index outside the source', async () => {
    const source = await surgeon.open(await makeInput(2));
    const out = await surgeon.create();
    await expect(out.appendPages(source, [0, 2])).rejects.toThrow(/out of range/);
    await expect(out.appendPages(source, [-1])).rejects.toThrow(/out of range/);
    expect(out.pageCount).toBe(0);
    source.close();
    out.close();
  });

  it('refuses a source that is not an open document', async () => {
    const source = await surgeon.open(await makeInput(2));
    source.close();
    const out = await surgeon.create();
    await expect(out.appendPages(source, [0])).rejects.toThrow(/not open/);
    out.close();
  });
});

describe('self-duplication', () => {
  it('copies a page from a document into itself', async () => {
    const doc = await surgeon.open(await makeInput(3));
    await doc.appendPages(doc, [0, 0]);
    expect(doc.pageCount).toBe(5);
    expect(sizesOf(doc)).toEqual([
      [200, 300],
      [400, 500],
      [600, 700],
      [200, 300],
      [200, 300],
    ]);
    const bytes = await doc.save();
    outputs.push({ label: 'self-duplicated', bytes, created: false });
    const again = await surgeon.open(bytes);
    expect(again.pageCount).toBe(5);
    expect(sizesOf(again)[4]).toEqual([200, 300]);
    doc.close();
    again.close();
  });
});

describe('reorder', () => {
  it('moves refs without cloning: order changes, size does not', async () => {
    const input = await makeInput(5, { producer: 'Example Producer', creator: 'Example Creator' });
    const doc = await surgeon.open(input.slice());
    doc.reorder([4, 0, 3, 1, 2]);

    // Visible before saving: the page cache was refreshed.
    expect(sizesOf(doc)).toEqual([
      [612, 792],
      [200, 300],
      [210, 297],
      [400, 500],
      [600, 700],
    ]);
    expect(doc.pageCount).toBe(5);

    const bytes = await doc.save();
    outputs.push({
      label: 'reordered',
      bytes,
      created: false,
      producer: 'Example Producer',
      creator: 'Example Creator',
    });
    expect(bytes.length).toBeLessThanOrEqual(input.length + 400);

    const again = await surgeon.open(bytes);
    expect(sizesOf(again)).toEqual([
      [612, 792],
      [200, 300],
      [210, 297],
      [400, 500],
      [600, 700],
    ]);
    doc.close();
    again.close();
  });

  it('can be applied twice, and the second sees the first', async () => {
    const doc = await surgeon.open(await makeInput(3));
    doc.reorder([2, 1, 0]);
    doc.reorder([2, 1, 0]);
    expect(sizesOf(doc)).toEqual([
      [200, 300],
      [400, 500],
      [600, 700],
    ]);
    doc.close();
  });

  it('feeds copyPages the new order', async () => {
    const doc = await surgeon.open(await makeInput(3));
    doc.reorder([2, 0, 1]);
    const out = await surgeon.create();
    await out.appendPages(doc, [0]);
    expect(sizesOf(out)).toEqual([[600, 700]]);
    doc.close();
    out.close();
  });

  it('refuses anything that is not a permutation', async () => {
    const doc = await surgeon.open(await makeInput(3));
    expect(() => doc.reorder([0, 1])).toThrow();
    expect(() => doc.reorder([0, 1, 1])).toThrow();
    expect(() => doc.reorder([0, 1, 3])).toThrow();
    expect(() => doc.reorder([0, 1, -1])).toThrow();
    expect(sizesOf(doc)).toEqual([
      [200, 300],
      [400, 500],
      [600, 700],
    ]);
    doc.close();
  });
});

describe('merge into a created document', () => {
  it('appends from two sources in turn', async () => {
    const a = await surgeon.open(await makeInput(2));
    const b = await surgeon.open(await makeInput(3));
    const out = await surgeon.create();
    await out.appendPages(a, [0, 1]);
    a.close();
    await out.appendPages(b, [0, 1, 2]);
    b.close();
    expect(out.pageCount).toBe(5);
    const bytes = await out.save();
    outputs.push({ label: 'merged', bytes, created: true });
    const again = await surgeon.open(bytes);
    expect(again.pageCount).toBe(5);
    expect(sizesOf(again)).toEqual([
      [200, 300],
      [400, 500],
      [200, 300],
      [400, 500],
      [600, 700],
    ]);
    out.close();
    again.close();
  });
});

describe('errors are PdfErrors with plain messages', () => {
  it('random bytes are not a PDF', async () => {
    const junk = new Uint8Array(4096);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919 + 13) % 251;
    expect(await failureCode(surgeon.open(junk))).toBe('not-a-pdf');
  });

  it('a PDF header followed by junk is corrupt', async () => {
    const text = '%PDF-1.7\n' + 'x'.repeat(2000);
    const bytes = new TextEncoder().encode(text);
    expect(await failureCode(surgeon.open(bytes))).toBe('corrupt');
  });

  it('a PDF cut short before any page is corrupt', async () => {
    const whole = await makeInput(3);
    const cut = whole.slice(0, 64);
    expect(await failureCode(surgeon.open(cut))).toBe('corrupt');
  });
});

describe('encrypted documents', () => {
  async function makeEncrypted(): Promise<Uint8Array> {
    const input = await makeInput(2, { producer: 'Example Producer', creator: 'Example Creator' });
    const doc = await PDFDocument.load(input, { updateMetadata: false });
    doc.encrypt({ userPassword: 'open sesame', ownerPassword: 'owner' });
    return doc.save({ useObjectStreams: true });
  }

  it('needs a password', async () => {
    expect(await failureCode(surgeon.open(await makeEncrypted()))).toBe('encrypted');
  });

  it('rejects the wrong password', async () => {
    expect(await failureCode(surgeon.open(await makeEncrypted(), { password: 'nope' }))).toBe(
      'wrong-password',
    );
  });

  it('opens with the right password and saves readable output', async () => {
    const doc = await surgeon.open(await makeEncrypted(), { password: 'open sesame' });
    expect(doc.pageCount).toBe(2);
    expect(sizesOf(doc)).toEqual([
      [200, 300],
      [400, 500],
    ]);
    const bytes = await doc.save();
    outputs.push({
      label: 'decrypted',
      bytes,
      created: false,
      producer: 'Example Producer',
      creator: 'Example Creator',
    });
    // The output is plain: it opens with no password, in pdf-lib as well as
    // through the surgeon, and does not claim to be encrypted.
    const again = await surgeon.open(bytes);
    expect(again.pageCount).toBe(2);
    const lib = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(lib.isEncrypted).toBe(false);
    expect(lib.getProducer()).toBe('Example Producer');
    doc.close();
    again.close();
  });
});

describe('close', () => {
  it('makes every method throw a plain Error', async () => {
    const doc = await surgeon.open(await makeInput(1));
    const other = await surgeon.open(await makeInput(1));
    doc.close();
    expect(() => doc.pageCount).toThrow(Error);
    expect(() => doc.pages()).toThrow(/closed/);
    expect(() => doc.reorder([0])).toThrow(/closed/);
    expect(() => doc.setRotation(0, 90)).toThrow(/closed/);
    expect(() => doc.setTitle('x')).toThrow(/closed/);
    await expect(doc.appendPages(other, [0])).rejects.toThrow(/closed/);
    await expect(doc.save()).rejects.toThrow(/closed/);
    expect(() => doc.close()).not.toThrow();
    other.close();
  });
});

describe('no stamp', () => {
  it('leaves Producer and Creator alone and never writes the library’s or the site’s name', async () => {
    expect(outputs.length).toBeGreaterThanOrEqual(5);
    const decoder = new TextDecoder('latin1');
    for (const { label, bytes, created, producer, creator } of outputs) {
      const doc = await reopen(bytes);
      if (created) {
        expect(doc.getProducer(), label).toBeUndefined();
        expect(doc.getCreator(), label).toBeUndefined();
      } else {
        expect(doc.getProducer(), label).toBe(producer);
        expect(doc.getCreator(), label).toBe(creator);
      }
      expect(doc.getModificationDate(), label).toBeUndefined();
      const text = decoder.decode(bytes);
      expect(text, label).not.toContain('pdf-lib');
      expect(text, label).not.toContain('Foolscap');
      expect(text, label).not.toContain('Sheaf');
    }
  });
});
