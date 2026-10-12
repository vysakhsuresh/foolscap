import { beforeAll, describe, expect, it } from 'vitest';
import { drawCalls, invert, multiply, unitBox } from '../../app/src/pdf/content-stream';
import type { PdfEngine } from '../../app/src/pdf/types';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { TINY_JPEG, imagesPdf } from '../fixtures/pdfs';

let engine: PdfEngine;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
  const { createEngine } = await import('../../app/src/pdf/engine');
  engine = createEngine();
  await engine.ready;
});

const enc = (s: string) => new TextEncoder().encode(s);

describe('reading drawing instructions', () => {
  it('follows q, Q and cm to where each picture is drawn, stepping over strings and inline images', () => {
    const stream = enc('q 50 0 0 40 10 20 cm /Im1 Do Q (a string with Do and \\) inside) Tj ) stray BI /W 1 /H 1 ID \u0000\u0001Do EI q 2 0 0 2 0 0 cm q 5 0 0 5 1 1 cm /Im2 Do Q Q');
    const calls = drawCalls(stream);
    expect(calls.map((c) => c.name)).toEqual(['Im1', 'Im2']);
    expect(unitBox(calls[0]!.ctm)).toEqual([10, 20, 60, 60]);
    expect(unitBox(calls[1]!.ctm)).toEqual([2, 2, 12, 12]);
    expect(new TextDecoder().decode(stream.subarray(calls[0]!.start, calls[0]!.end))).toBe('/Im1 Do');
  });

  it('inverts a drawing position', () => {
    const m = [2, 0, 0, 3, 10, 20] as const;
    expect(multiply(m, invert(m)!).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('edit pictures', () => {
  it('finds the pictures, then takes one out, moves one and swaps another', async () => {
    const view = await engine.open(await imagesPdf());
    const found = await view.images(0);
    await view.close();
    expect(found).toHaveLength(2);
    // The JPEG at 0,0 50×50 on a 200×200 page: top-left fraction (0, 0.75), a quarter wide.
    expect(found[0]!.x).toBeCloseTo(0, 3);
    expect(found[0]!.y).toBeCloseTo(0.75, 3);
    expect(found[0]!.w).toBeCloseTo(0.25, 3);

    const doc = await createSurgeon().open(await imagesPdf());
    const done = await doc.editImages(0, [
      { area: found[0]!, action: 'delete' },
      { area: found[1]!, action: 'move', to: { page: 0, x: 0.5, y: 0.1, w: 0.4, h: 0.4 } },
    ]);
    expect(done).toEqual(['delete', 'move']);
    const second = await doc.editImages(1, [{ area: { page: 1, x: 0, y: 0.75, w: 0.25, h: 0.25 }, action: 'replace', bytes: TINY_JPEG, format: 'jpeg' }]);
    expect(second).toEqual(['replace']);
    const bytes = await doc.save();
    doc.close();

    const after = await engine.open(bytes);
    const page1 = await after.images(0);
    expect(page1).toHaveLength(1);
    expect(page1[0]!.x).toBeCloseTo(0.5, 2);
    expect(page1[0]!.y).toBeCloseTo(0.1, 2);
    expect(page1[0]!.w).toBeCloseTo(0.4, 2);
    expect(await after.images(1)).toHaveLength(1);
    await after.close();
  });
});
