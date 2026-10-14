/**
 * The real engine over real pdf.js, in Node. pdf.js has no Web Worker here, so
 * before the engine is created the worker module is put where pdf.js looks for
 * an in-thread fallback (`globalThis.pdfjsWorker`); parsing then runs on the
 * test's own thread. Rendering needs a canvas, which Node has not, so `render`
 * is covered by the e2e thumbnails test and not here.
 *
 * Node 22 lacks the same new built-ins (Promise.try, Uint8Array.toHex,
 * Map.getOrInsertComputed, Math.sumPrecise) as the browsers on the floor, so
 * this test also proves the app's shims make pdf.js run without them.
 */
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PdfEngine } from '../../app/src/pdf/types';
import { PdfError } from '../../app/src/pdf/types';
import { pdfjsWorkerModule } from '../fixtures/pdfjs-worker';

let engine: PdfEngine;

beforeAll(async () => {
  // pdf.js 6.4 uses a few built-ins Node 22 lacks; the app's own shims cover
  // them and go in first, as they do on the page and in the worker.
  await import('../../app/src/pdf/shims');

  // A non-literal specifier: the worker module ships no types, and the only
  // thing wanted from it is its presence on the global pdf.js checks for an
  // in-thread fallback.
  (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();

  const { createEngine } = await import('../../app/src/pdf/engine');
  engine = createEngine();
  await engine.ready;
});

async function makeInput(sizes: ReadonlyArray<[number, number]>, rotate?: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (const size of sizes) doc.addPage(size);
  if (rotate !== undefined) doc.getPage(1).setRotation(degrees(rotate));
  return doc.save({ useObjectStreams: true });
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

describe('open and page', () => {
  it('reports the page count, unrotated sizes and normalised rotation', async () => {
    const view = await engine.open(
      await makeInput(
        [
          [200, 300],
          [400, 500],
          [600, 700],
        ],
        -90,
      ),
    );
    expect(view.pageCount).toBe(3);
    expect(await view.page(0)).toEqual({ index: 0, width: 200, height: 300, rotation: 0 });
    expect(await view.page(1)).toEqual({ index: 1, width: 400, height: 500, rotation: 270 });
    expect(await view.page(2)).toEqual({ index: 2, width: 600, height: 700, rotation: 0 });
    await view.close();
  });

  it('accepts a Blob', async () => {
    const bytes = await makeInput([[300, 300]]);
    const view = await engine.open(new Blob([new Uint8Array(bytes)]));
    expect(view.pageCount).toBe(1);
    await view.close();
  });

  it('refuses an index outside the document with a plain Error', async () => {
    const view = await engine.open(await makeInput([[300, 300]]));
    await expect(view.page(1)).rejects.toThrow(/out of range/);
    await expect(view.page(-1)).rejects.toThrow(/out of range/);
    await view.close();
  });

  it('exposes the render pixel budget', () => {
    expect(engine.maxRenderPixels).toBe(5_242_880);
  });
});

describe('errors are PdfErrors with plain messages', () => {
  it('random bytes are not a PDF', async () => {
    const junk = new Uint8Array(4096);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919 + 13) % 251;
    expect(await failureCode(engine.open(junk))).toBe('not-a-pdf');
  });

  it('a PDF header followed by junk is corrupt', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n' + 'x'.repeat(2000));
    expect(await failureCode(engine.open(bytes))).toBe('corrupt');
  });

  it('an already-aborted signal cancels before anything is read', async () => {
    const controller = new AbortController();
    controller.abort();
    const code = await failureCode(engine.open(await makeInput([[300, 300]]), { signal: controller.signal }));
    expect(code).toBe('cancelled');
  });
});

describe('encrypted documents', () => {
  async function makeEncrypted(): Promise<Uint8Array> {
    const doc = await PDFDocument.load(await makeInput([[200, 300]]), { updateMetadata: false });
    doc.encrypt({ userPassword: 'open sesame', ownerPassword: 'owner' });
    return doc.save({ useObjectStreams: true });
  }

  it('needs a password', async () => {
    expect(await failureCode(engine.open(await makeEncrypted()))).toBe('encrypted');
  });

  it('rejects the wrong password', async () => {
    expect(await failureCode(engine.open(await makeEncrypted(), { password: 'nope' }))).toBe('wrong-password');
  });

  it('opens with the right password', async () => {
    const view = await engine.open(await makeEncrypted(), { password: 'open sesame' });
    expect(view.pageCount).toBe(1);
    expect(await view.page(0)).toMatchObject({ width: 200, height: 300 });
    await view.close();
  });
});

describe('close', () => {
  it('makes every method throw a plain Error, and is safe to repeat', async () => {
    const view = await engine.open(await makeInput([[300, 300]]));
    await view.close();
    expect(() => view.pageCount).toThrow(/closed/);
    await expect(view.page(0)).rejects.toThrow(/closed/);
    await expect(view.render(0, { width: 100 })).rejects.toThrow(/closed/);
    await expect(view.close()).resolves.toBeUndefined();
  });

  it('leaves the shared worker usable for the next document', async () => {
    const first = await engine.open(await makeInput([[300, 300]]));
    await first.close();
    const second = await engine.open(await makeInput([[100, 100]]));
    expect(second.pageCount).toBe(1);
    await second.close();
  });
});
