/**
 * The thirteen batch-2 tools, in Node, over the real surgeon and a real memory
 * Workspace. Where a tool draws text, pdf.js (running in-thread, as in
 * engine.test.ts) reads the output back, so "bottom right, upright" is checked
 * on the page as a reader sees it, rotation included.
 */
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FileKind, FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import { jpegOrientation, sniffImage } from '../../app/src/ops/images';
import { fillTokens } from '../../app/src/ops/mark-ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import type { ToolId } from '../../app/src/ops/tools';
import { pngFromPixels } from '../../app/src/pdf/png';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { encryptedPdf, pagesPdf, pdfInfo, rotatedPdf, stampsIn } from '../fixtures/pdfs';

type PdfJs = typeof import('pdfjs-dist');
let pdfjs: PdfJs;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
  pdfjs = await import('pdfjs-dist');
});

/** A 1×1 baseline JPEG: the smallest file with a frame header pdf-lib can read. */
const TINY_JPEG = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='),
  (c) => c.charCodeAt(0),
);

/** The same JPEG with an EXIF block saying "rotate 90° clockwise" (orientation 6). */
function jpegWithOrientation(value: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, value, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const app1 = [0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
  return Uint8Array.from([...TINY_JPEG.subarray(0, 2), ...app1, ...TINY_JPEG.subarray(2)]);
}

function noisePng(size: number): Uint8Array {
  // Real noise, so compression cannot shrink it: the size test needs weight.
  const pixels = new Uint8Array(size * size * 3);
  for (let i = 0; i < pixels.length; i += 65536) crypto.getRandomValues(pixels.subarray(i, i + 65536));
  const png = pngFromPixels({ width: size, height: size, channels: 3 }, pixels);
  if (png === null) throw new Error('png');
  return png;
}

function harness(passwords: ReadonlyMap<string, string> = new Map()) {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: () => Promise.reject(new Error('no engine in batch 2')),
    surgeon: createSurgeon(),
    passwords,
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return {
    ctx,
    add: (name: string, bytes: Uint8Array, kind: FileKind = 'pdf') => workspace.put(name, bytes, kind, { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

const run = (tool: ToolId, inputs: readonly FoolscapFile[], params: unknown, ctx: OpContext) => getOp(tool).run(inputs, params, ctx);

function produced(outcomes: Outcome[]) {
  return outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
}

function only(outcomes: Outcome[]) {
  const list = produced(outcomes);
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  return list[0]!;
}

/** Text on page `index` as a reader sees it: position in the rotated viewport (origin top-left) and whether it reads upright. */
async function textOn(bytes: Uint8Array, index = 0) {
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    return {
      width: viewport.width,
      height: viewport.height,
      items: content.items
        .filter((item): item is Extract<typeof item, { str: string }> => 'str' in item && item.str.trim().length > 0)
        .map((item) => {
          const m = pdfjs.Util.transform(viewport.transform, item.transform);
          return { text: item.str, x: m[4], y: m[5], upright: m[0] > 0 && Math.abs(m[1]) < 1e-6 };
        }),
    };
  } finally {
    await task.destroy();
  }
}

async function expectClean(h: ReturnType<typeof harness>, outcomes: Outcome[], inputs: readonly FoolscapFile[]) {
  const names = new Set(inputs.map((f) => f.name.toLowerCase()));
  for (const { file } of produced(outcomes)) {
    expect(names.has(file.name.toLowerCase()), file.name).toBe(false);
    if (file.kind === 'pdf') expect(stampsIn(await h.bytesOf(file))).toEqual([]);
  }
}

describe('extract or remove pages', () => {
  it('keeps the pages typed, in order, and names the output after them', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await pagesPdf(6));
    const out = only(await run('extract-pages', [input], { pages: '2-3, 6', mode: 'keep' }, h.ctx));
    expect(out.file.name).toBe('Lease pages 2-3, 6.pdf');
    expect(out.detail).toBe('3 pages kept of 6');
    expect((await pdfInfo(await h.bytesOf(out.file))).sizes.map((s) => s[0])).toEqual([310, 320, 350]);
    await expectClean(h, [out], [input]);
  });

  it('removes the pages typed and keeps the rest', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await pagesPdf(5));
    const out = only(await run('extract-pages', [input], { pages: '1, 5', mode: 'remove' }, h.ctx));
    expect(out.file.name).toBe('Lease without pages 1, 5.pdf');
    expect(out.detail).toBe('2 pages removed, 3 left');
    expect((await pdfInfo(await h.bytesOf(out.file))).pageCount).toBe(3);
  });

  it('refuses nothing typed, every page removed, and no change', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await pagesPdf(3));
    for (const params of [{ pages: '', mode: 'keep' }, { pages: '1-3', mode: 'remove' }, { pages: '1-', mode: 'keep' }]) {
      const [outcome] = await run('extract-pages', [input], params, h.ctx);
      expect(outcome?.kind).toBe('failed');
    }
  });
});

describe('insert pages', () => {
  it('puts another file in after the page asked for', async () => {
    const h = harness();
    const target = await h.add('Report.pdf', await pagesPdf(3));
    const extra = await h.add('Annex.pdf', await rotatedPdf([0, 0]));
    const out = only(await run('insert-pages', [target, extra], { after: 1, what: 'files', blankCount: 1 }, h.ctx));
    expect(out.detail).toBe('2 pages added after page 1, 5 in all');
    expect((await pdfInfo(await h.bytesOf(out.file))).pageCount).toBe(5);
    await expectClean(h, [out], [target, extra]);
  });

  it('adds blank pages the size of the page before them, at the start or the end', async () => {
    const h = harness();
    const target = await h.add('Report.pdf', await pagesPdf(3));
    const atEnd = only(await run('insert-pages', [target], { after: 99, what: 'blank', blankCount: 2 }, h.ctx));
    expect(atEnd.detail).toBe('2 blank pages added at the end, 5 in all');
    const sizes = (await pdfInfo(await h.bytesOf(atEnd.file))).sizes;
    expect(sizes[3]).toEqual(sizes[2]);
    const atStart = only(await run('insert-pages', [target], { after: 0, what: 'blank', blankCount: 1 }, h.ctx));
    expect(atStart.detail).toBe('1 blank page added at the start, 4 in all');
  });

  it('asks for the second file when inserting files and only one was given', async () => {
    const h = harness();
    const target = await h.add('Report.pdf', await pagesPdf(2));
    const [outcome] = await run('insert-pages', [target], { after: 1, what: 'files', blankCount: 1 }, h.ctx);
    expect(outcome?.kind).toBe('failed');
  });
});

describe('crop', () => {
  it('trims the visible box on every page, and keeps the page itself', async () => {
    const h = harness();
    const input = await h.add('Scan.pdf', await pagesPdf(2));
    const out = only(await run('crop', [input], { mode: 'trim', mm: 10 }, h.ctx));
    const doc = await PDFDocument.load(await h.bytesOf(out.file), { updateMetadata: false });
    const crop = doc.getPage(0).getCropBox();
    const inset = (10 * 72) / 25.4;
    expect(crop.x).toBeCloseTo(inset, 3);
    expect(crop.width).toBeCloseTo(300 - inset * 2, 3);
    expect(doc.getPage(0).getMediaBox().width).toBe(300);
    expect(out.detail).toBe('10 mm trimmed from every edge of 2 pages');
  });

  it('puts every page on A4, landscape where the page is landscape as seen', async () => {
    const h = harness();
    const input = await h.add('Mixed.pdf', await rotatedPdf([0, 90]));
    const out = only(await run('crop', [input], { mode: 'paper', paper: 'a4' }, h.ctx));
    const sizes = (await pdfInfo(await h.bytesOf(out.file))).sizes;
    expect(sizes[0]).toEqual([595.28, 841.89]);
    expect(sizes[1]).toEqual([841.89, 595.28]);
    expect(out.file.name).toBe('Mixed on A4.pdf');
  });

  it('refuses a margin that would leave nothing', async () => {
    const h = harness();
    const input = await h.add('Scan.pdf', await pagesPdf(1));
    const [outcome] = await run('crop', [input], { mode: 'trim', mm: 60 }, h.ctx);
    expect(outcome?.kind).toBe('failed');
  });
});

describe('pages per sheet', () => {
  it('puts two pages on each landscape sheet and four on each portrait sheet', async () => {
    const h = harness();
    const input = await h.add('Notes.pdf', await pagesPdf(5));
    const two = only(await run('n-up', [input], { perSheet: 2, paper: 'a4' }, h.ctx));
    expect(two.detail).toBe('5 pages on 3 sheets of A4');
    expect((await pdfInfo(await h.bytesOf(two.file))).sizes[0]).toEqual([841.89, 595.28]);
    const four = only(await run('n-up', [input], { perSheet: 4, paper: 'letter' }, h.ctx));
    expect(four.detail).toBe('5 pages on 2 sheets of Letter');
    expect((await pdfInfo(await h.bytesOf(four.file))).sizes[0]).toEqual([612, 792]);
    expect(four.file.name).toBe('Notes 4-up.pdf');
  });
});

describe('split by size', () => {
  it('makes parts that each fit under the limit and together hold every page', async () => {
    const h = harness();
    const doc = await PDFDocument.create({ updateMetadata: false });
    for (let i = 0; i < 8; i++) {
      const image = await doc.embedPng(noisePng(260 + i));
      doc.addPage([300, 300]).drawImage(image, { x: 0, y: 0, width: 300, height: 300 });
    }
    const input = await h.add('Photos.pdf', await doc.save());
    expect(input.size).toBeGreaterThan(1_000_000);
    const outcomes = await run('split-by-size', [input], { megabytes: 1 }, h.ctx);
    const parts = produced(outcomes);
    expect(parts.length).toBeGreaterThan(1);
    let pages = 0;
    for (const part of parts) {
      expect(part.file.size).toBeLessThanOrEqual(1_000_000);
      pages += (await pdfInfo(await h.bytesOf(part.file))).pageCount;
    }
    expect(pages).toBe(8);
    expect(parts[0]!.file.name).toBe('Photos part 1.pdf');
  });

  it('says so when the file is already small enough', async () => {
    const h = harness();
    const input = await h.add('Small.pdf', await pagesPdf(2));
    const [outcome] = await run('split-by-size', [input], { megabytes: 5 }, h.ctx);
    expect(outcome?.kind).toBe('failed');
  });
});

describe('images to PDF', () => {
  it('recognises images by their bytes and reads a phone photo\'s orientation', () => {
    expect(sniffImage(TINY_JPEG)).toBe('jpeg');
    expect(sniffImage(noisePng(2))).toBe('png');
    expect(sniffImage(new TextEncoder().encode('GIF89a......'))).toBe('gif');
    expect(sniffImage(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(jpegOrientation(TINY_JPEG)).toBe(1);
    expect(jpegOrientation(jpegWithOrientation(6))).toBe(6);
  });

  it('puts each image on its own page, in order, on the paper asked for', async () => {
    const h = harness();
    const a = await h.add('Receipt.jpg', TINY_JPEG, 'image');
    const b = await h.add('Chart.png', noisePng(40), 'image');
    const outcomes = await run('images-to-pdf', [a, b], { paper: 'a4', margin: 'small' }, h.ctx);
    const out = only(outcomes);
    expect(out.file.name).toBe('Receipt and 1 more.pdf');
    expect(out.detail).toBe('2 images, on A4');
    const info = await pdfInfo(await h.bytesOf(out.file));
    expect(info.pageCount).toBe(2);
    expect(info.sizes[0]).toEqual([595.28, 841.89]);
  });

  it('reports a file that is not an image and still makes the PDF from the rest', async () => {
    const h = harness();
    const good = await h.add('Photo.png', noisePng(10), 'image');
    const bad = await h.add('notes.png', new TextEncoder().encode('not an image at all'), 'image');
    const outcomes = await run('images-to-pdf', [good, bad], { paper: 'fit', margin: 'none' }, h.ctx);
    expect(produced(outcomes)).toHaveLength(1);
    expect(outcomes.some((o) => o.kind === 'failed' && o.inputIds[0] === bad.id)).toBe(true);
  });
});

describe('extract images', () => {
  it('saves JPEGs exactly as stored and pixel images as PNG, each once', async () => {
    const h = harness();
    const doc = await PDFDocument.create({ updateMetadata: false });
    const jpeg = await doc.embedJpg(TINY_JPEG);
    const png = await doc.embedPng(noisePng(16));
    const one = doc.addPage([200, 200]);
    one.drawImage(jpeg, { x: 0, y: 0, width: 50, height: 50 });
    one.drawImage(png, { x: 60, y: 0, width: 50, height: 50 });
    doc.addPage([200, 200]).drawImage(jpeg, { x: 0, y: 0, width: 50, height: 50 });
    const input = await h.add('Brochure.pdf', await doc.save());
    const outcomes = await run('extract-images', [input], {}, h.ctx);
    const files = produced(outcomes).map((o) => o.file);
    expect(files.map((f) => f.name).sort()).toEqual(['Brochure image 1 (page 1).jpg', 'Brochure image 2 (page 1).png'].sort());
    const jpg = files.find((f) => f.name.endsWith('.jpg'))!;
    expect(await h.bytesOf(jpg)).toEqual(TINY_JPEG);
    const pngOut = await h.bytesOf(files.find((f) => f.name.endsWith('.png'))!);
    expect(Array.from(pngOut.subarray(1, 4), (c) => String.fromCharCode(c)).join('')).toBe('PNG');
    expect(new DataView(pngOut.buffer, pngOut.byteOffset).getUint32(16)).toBe(16);
    for (const f of files) expect(f.kind).toBe('image');
  });

  it('says so when there are no images', async () => {
    const h = harness();
    const input = await h.add('Text.pdf', await pagesPdf(1));
    const [outcome] = await run('extract-images', [input], {}, h.ctx);
    expect(outcome?.kind).toBe('failed');
  });
});

describe('watermark', () => {
  it('draws the text on every page, and refuses letters the built-in font cannot draw', async () => {
    const h = harness();
    const input = await h.add('Draft.pdf', await pagesPdf(2));
    const out = only(await run('watermark', [input], { text: 'DRAFT', strength: 'medium', layout: 'once' }, h.ctx));
    expect(out.detail).toBe('"DRAFT" across 2 pages');
    for (const page of [0, 1]) expect((await textOn(await h.bytesOf(out.file), page)).items.map((i) => i.text)).toContain('DRAFT');
    const tiled = only(await run('watermark', [input], { text: 'COPY', strength: 'light', layout: 'tiled' }, h.ctx));
    expect((await textOn(await h.bytesOf(tiled.file))).items.filter((i) => i.text === 'COPY').length).toBeGreaterThan(3);
    const [malayalam] = await run('watermark', [input], { text: 'കരട്', strength: 'medium', layout: 'once' }, h.ctx);
    expect(malayalam).toMatchObject({ kind: 'failed', code: 'unsupported-text' });
  });
});

describe('page numbers', () => {
  it('numbers every page bottom right, upright as read, even on a page turned sideways', async () => {
    const h = harness();
    const input = await h.add('Deck.pdf', await rotatedPdf([0, 90, 180, 270]));
    const out = only(await run('page-numbers', [input], { position: 'bottom-right', format: 'n-of-total', start: 1, skipFirst: false }, h.ctx));
    expect(out.detail).toBe('Numbered 1 to 4');
    const bytes = await h.bytesOf(out.file);
    for (const page of [0, 1, 2, 3]) {
      const seen = await textOn(bytes, page);
      const label = seen.items.find((i) => i.text === `${page + 1} of 4`);
      expect(label, `page ${page + 1}`).toBeDefined();
      expect(label!.upright, `page ${page + 1} upright`).toBe(true);
      expect(label!.x, `page ${page + 1} right`).toBeGreaterThan(seen.width / 2);
      expect(label!.y, `page ${page + 1} bottom`).toBeGreaterThan(seen.height / 2);
    }
  });

  it('leaves a cover unnumbered and starts where asked', async () => {
    const h = harness();
    const input = await h.add('Deck.pdf', await pagesPdf(3));
    const out = only(await run('page-numbers', [input], { position: 'top-center', format: 'page-n', start: 1, skipFirst: true }, h.ctx));
    expect(out.detail).toBe('Pages 2 to 3 numbered 1 to 2; cover left blank');
    const bytes = await h.bytesOf(out.file);
    expect((await textOn(bytes, 0)).items.some((i) => i.text.startsWith('Page'))).toBe(false);
    const second = await textOn(bytes, 1);
    const label = second.items.find((i) => i.text === 'Page 1');
    expect(label!.y).toBeLessThan(second.height / 2);
  });
});

describe('header and footer', () => {
  it('fills in the page, total, date and name', () => {
    expect(fillTokens('{name} – page {page} of {total} – {date}', { page: 2, total: 9, date: '12 Oct 2026', name: 'Lease' })).toBe(
      'Lease – page 2 of 9 – 12 Oct 2026',
    );
  });

  it('puts the header at the top and the footer at the bottom of every page', async () => {
    const h = harness();
    const input = await h.add('Minutes.pdf', await pagesPdf(2));
    const out = only(await run('header-footer', [input], { header: 'CONFIDENTIAL', footer: 'Page {page} of {total}', align: 'center' }, h.ctx));
    expect(out.file.name).toBe('Minutes with header and footer.pdf');
    const seen = await textOn(await h.bytesOf(out.file), 1);
    expect(seen.items.find((i) => i.text === 'CONFIDENTIAL')!.y).toBeLessThan(seen.height / 2);
    expect(seen.items.find((i) => i.text === 'Page 2 of 2')!.y).toBeGreaterThan(seen.height / 2);
  });
});

describe('passwords', () => {
  it('locks a file so it opens with its password and not without', async () => {
    const h = harness();
    const input = await h.add('Salary slip.pdf', await pagesPdf(2));
    const out = only(await run('add-password', [input], { password: 'tiger42', allowPrinting: true, allowCopying: false }, h.ctx));
    expect(out.file.name).toBe('Salary slip locked.pdf');
    expect(out.detail).toBe('Locked with AES-256; printing allowed, copying blocked');
    const surgeon = createSurgeon();
    await expect(surgeon.open(await h.bytesOf(out.file))).rejects.toMatchObject({ code: 'encrypted' });
    expect((await surgeon.open(await h.bytesOf(out.file), { password: 'tiger42' })).pageCount).toBe(2);
  });

  it('removes a password it is given, and says when there was none', async () => {
    const locked = await encryptedPdf('open-sesame', 3);
    const withPassword = harness();
    const file = await withPassword.add('Statement.pdf', locked);
    const ctx = { ...withPassword.ctx, passwords: new Map([[file.id, 'open-sesame']]) };
    const out = only(await run('remove-password', [file], {}, ctx));
    expect(out.detail).toBe('Password removed: it opens without one now');
    expect((await createSurgeon().open(await withPassword.bytesOf(out.file))).pageCount).toBe(3);
    const plain = await withPassword.add('Plain.pdf', await pagesPdf(1));
    const [skipped] = await run('remove-password', [plain], {}, withPassword.ctx);
    expect(skipped?.kind).toBe('skipped');
  });
});

describe('document details', () => {
  it('removes the title, author and hidden metadata from the bytes, not just the view', async () => {
    const h = harness();
    const input = await h.add('CV.pdf', await pagesPdf(1, { title: 'Secret plan', producer: 'Corporate Writer 9', creator: 'Jane Q' }));
    const out = only(await run('document-details', [input], { mode: 'strip' }, h.ctx));
    const bytes = await h.bytesOf(out.file);
    const info = await pdfInfo(bytes);
    expect(info.title).toBeUndefined();
    expect(info.producer).toBeUndefined();
    const text = new TextDecoder('latin1').decode(bytes);
    for (const secret of ['Secret plan', 'Corporate Writer', 'Jane Q']) expect(text).not.toContain(secret);
    expect(out.file.name).toBe('CV cleaned.pdf');
  });

  it('writes the details typed, and skips when nothing changes', async () => {
    const h = harness();
    const input = await h.add('CV.pdf', await pagesPdf(1));
    const out = only(await run('document-details', [input], { mode: 'edit', title: 'My CV', author: 'A. Person', subject: '', keywords: '' }, h.ctx));
    expect(out.detail).toBe('Updated the title and author');
    const doc = await PDFDocument.load(await h.bytesOf(out.file), { updateMetadata: false });
    expect(doc.getTitle()).toBe('My CV');
    expect(doc.getAuthor()).toBe('A. Person');
    const [same] = await run('document-details', [input], { mode: 'edit', title: '', author: '', subject: '', keywords: '' }, h.ctx);
    expect(same?.kind).toBe('skipped');
  });
});

describe('every batch-2 output', () => {
  it('a page turned sideways stays sideways after watermarking', async () => {
    const h = harness();
    const input = await h.add('Turned.pdf', await rotatedPdf([90]));
    const out = only(await run('watermark', [input], { text: 'DRAFT', strength: 'light', layout: 'once' }, h.ctx));
    const doc = await PDFDocument.load(await h.bytesOf(out.file), { updateMetadata: false });
    expect(doc.getPage(0).getRotation()).toEqual(degrees(90));
  });
});
