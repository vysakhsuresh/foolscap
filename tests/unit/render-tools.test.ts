/**
 * Compress, Extract text and PDF to images, in Node. Extract text runs over
 * the real engine with pdf.js in-thread (as in engine.test.ts). Node has no
 * image decoder, so Compress here can only drop dead objects and deflate
 * plain streams; the photo path, and PDF to images (which needs a canvas),
 * are covered by the e2e.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { PdfEngine } from '../../app/src/pdf/types';
import { TINY_JPEG, bloatedPdf, outlinedPdf, pagesPdf, pdfInfo, stampsIn } from '../fixtures/pdfs';
import { pdfjsWorkerModule } from '../fixtures/pdfjs-worker';

let engine: PdfEngine;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
  const { createEngine } = await import('../../app/src/pdf/engine');
  engine = createEngine();
  await engine.ready;
});

function harness(passwords: ReadonlyMap<string, string> = new Map()) {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: async () => engine,
    surgeon: createSurgeon(),
    passwords,
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return {
    ctx,
    add: (name: string, bytes: Uint8Array) => workspace.put(name, bytes, 'pdf', { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
    textOf: async (file: FoolscapFile) => (await workspace.read(file)).text(),
  };
}

function only(outcomes: Outcome[]) {
  const list = outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  return list[0]!;
}

describe('compress', () => {
  it('drops what nothing points at and deflates plain streams, and says how much it saved', async () => {
    const h = harness();
    const input = await h.add('Report.pdf', await bloatedPdf());
    const outcome = only(await getOp('compress').run([input], { level: 'balanced' }, h.ctx));
    const bytes = await h.bytesOf(outcome.file);
    expect(bytes.length).toBeLessThan(input.size / 4);
    expect(outcome.file.name).toBe('Report (compressed).pdf');
    expect(outcome.detail).toMatch(/^\d.* → .*, \d+% smaller$/);
    expect((await pdfInfo(bytes)).pageCount).toBe(1);
    expect(stampsIn(bytes)).toEqual([]);
    // The page still says what it said.
    const view = await engine.open(bytes);
    expect(await view.text(0)).toContain('Quarterly figures');
    await view.close();
  });

  it('says so, and makes nothing, when a file cannot get smaller', async () => {
    const h = harness();
    const input = await h.add('Small.pdf', await pagesPdf(2));
    const outcomes = await getOp('compress').run([input], { level: 'strong' }, h.ctx);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.kind).toBe('skipped');
    expect(JSON.stringify(outcomes[0])).toMatch(/already about as small/);
  });

  it('keeps a password-protected file locked with the same password', async () => {
    const passwords = new Map<string, string>();
    const h = harness(passwords);
    const plain = await h.add('Report.pdf', await bloatedPdf());
    const locked = only(await getOp('add-password').run([plain], { password: 'tea', allowPrinting: true, allowCopying: true }, h.ctx));
    passwords.set(locked.file.id, 'tea');
    const outcome = only(await getOp('compress').run([locked.file], { level: 'balanced' }, h.ctx));
    expect(outcome.detail).toMatch(/still locked with the same password$/);
    const out = await h.bytesOf(outcome.file);
    expect(out.length).toBeLessThan(locked.file.size / 2);
    await expect(engine.open(new Uint8Array(out))).rejects.toMatchObject({ code: 'encrypted' });
    const opened = await engine.open(new Uint8Array(out), { password: 'tea' });
    expect(await opened.text(0)).toContain('Quarterly figures');
    await opened.close();
  });

  it('fails one unreadable file without losing the rest', async () => {
    const h = harness();
    const bad = await h.add('Bad.pdf', new TextEncoder().encode('not a pdf at all'));
    const good = await h.add('Good.pdf', await bloatedPdf());
    const outcomes = await getOp('compress').run([bad, good], { level: 'light' }, h.ctx);
    expect(outcomes.map((o) => o.kind)).toEqual(['failed', 'produced']);
  });
});

describe('extract text', () => {
  it('writes each file’s words to a .txt, page by page', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await pagesPdf(3));
    const outcome = only(await getOp('extract-text').run([input], {}, h.ctx));
    expect(outcome.file.name).toBe('Lease.txt');
    expect(outcome.file.kind).toBe('text');
    expect(outcome.detail).toMatch(/words? from 3 pages$/);
    const text = await h.textOf(outcome.file);
    expect(text).toMatch(/--- Page 1 ---/);
    expect(text).toMatch(/--- Page 3 ---/);
  });

  it('refuses a file with no words, and says it is probably a scan', async () => {
    const h = harness();
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([200, 200]).drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
    const input = await h.add('Scan.pdf', await doc.save());
    const outcomes = await getOp('extract-text').run([input], {}, h.ctx);
    expect(outcomes[0]!.kind).toBe('failed');
    expect(JSON.stringify(outcomes[0])).toMatch(/probably a scan/);
  });
});

describe('the reader', () => {
  it('reads a table of contents with the page each entry opens', async () => {
    const view = await engine.open(await outlinedPdf(4));
    expect(await view.outline()).toEqual([
      { title: 'Introduction', page: 0, items: [] },
      { title: 'Terms', page: 2, items: [] },
    ]);
    await view.close();
  });

  it('has an empty outline for a file without one', async () => {
    const view = await engine.open(await pagesPdf(2));
    expect(await view.outline()).toEqual([]);
    await view.close();
  });
});

describe('compress, images it must leave alone', () => {
  it('re-encodes a plain photo, and leaves one with a mask exactly as it was', async () => {
    const { PDFName, PDFRawStream } = await import('@cantoo/pdf-lib');
    const { zlibSync } = await import('fflate');
    const doc = await PDFDocument.create({ updateMetadata: false });
    const page = doc.addPage([200, 200]);
    const noise = (n: number) => {
      const px = new Uint8Array(n * n * 3);
      for (let i = 0; i < px.length; i += 65536) crypto.getRandomValues(px.subarray(i, i + 65536));
      return zlibSync(px);
    };
    const image = (extra: Record<string, unknown>) =>
      doc.context.register(doc.context.stream(noise(200), { Type: 'XObject', Subtype: 'Image', Width: 200, Height: 200, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode', ...extra } as never));
    const stencil = doc.context.register(doc.context.stream(new Uint8Array(200 * 25), { Type: 'XObject', Subtype: 'Image', Width: 200, Height: 200, ImageMask: true, BitsPerComponent: 1 } as never));
    const plain = image({});
    const masked = image({ Mask: stencil });
    page.node.setXObject(PDFName.of('A'), plain);
    page.node.setXObject(PDFName.of('B'), masked);
    page.node.addContentStream(doc.context.register(doc.context.stream('q 100 0 0 100 0 0 cm /A Do Q q 100 0 0 100 100 0 cm /B Do Q')));

    const pdf = await createSurgeon().open(await doc.save());
    let asked = 0;
    const report = await pdf.compress(async () => {
      asked++;
      return { bytes: TINY_JPEG, width: 1, height: 1 };
    });
    expect(asked).toBe(1);
    expect(report.replaced).toBe(1);
    const out = await PDFDocument.load(await pdf.save(), { updateMetadata: false });
    const filters = new Map<string, string>();
    for (const [, object] of out.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      if (object.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image' || object.dict.has(PDFName.of('ImageMask'))) continue;
      filters.set(object.dict.has(PDFName.of('Mask')) ? 'masked' : 'plain', String(object.dict.lookup(PDFName.of('Filter'))));
    }
    expect(filters.get('plain')).toBe('/DCTDecode');
    expect(filters.get('masked')).toBe('/FlateDecode');
  });
});
