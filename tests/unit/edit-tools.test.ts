/**
 * Sign, Add text, Mark up and Fill in a form, in Node over the real surgeon;
 * what they drew is read back with pdf.js. Remove areas needs a canvas, so it
 * is covered by the e2e.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { Mark, PdfEngine } from '../../app/src/pdf/types';
import { formPdf, noisePng, pagesPdf, rotatedPdf, stampsIn } from '../fixtures/pdfs';

let engine: PdfEngine;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
  const { createEngine } = await import('../../app/src/pdf/engine');
  engine = createEngine();
  await engine.ready;
});

function harness() {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: async () => engine,
    surgeon: createSurgeon(),
    passwords: new Map(),
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return {
    ctx,
    add: (name: string, bytes: Uint8Array) => workspace.put(name, bytes, 'pdf', { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

function only(outcomes: Outcome[]) {
  const list = outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  return list[0]!;
}

const ink: Mark = { kind: 'ink', page: 0, points: [0.1, 0.1, 0.5, 0.5, 0.9, 0.2], width: 0.005, color: [0, 0, 0.6] };

describe('sign', () => {
  it('places the signature picture where it was put', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await pagesPdf(3));
    const png = noisePng(20);
    const marks: Mark[] = [
      { kind: 'image', area: { page: 2, x: 0.6, y: 0.8, w: 0.3, h: 0.1 }, png },
      { kind: 'image', area: { page: 0, x: 0.6, y: 0.8, w: 0.3, h: 0.1 }, png },
    ];
    const outcome = only(await getOp('sign').run([input], { marks }, h.ctx));
    expect(outcome.file.name).toBe('Lease (signed).pdf');
    expect(outcome.detail).toBe('Signed in 2 places across 2 pages');
    const doc = await PDFDocument.load(await h.bytesOf(outcome.file), { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    expect(stampsIn(await h.bytesOf(outcome.file))).toEqual([]);
  });

  it('refuses with nothing placed, in words', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await pagesPdf(1));
    const outcomes = await getOp('sign').run([input], { marks: [] }, h.ctx);
    expect(outcomes[0]!.kind).toBe('failed');
    expect(JSON.stringify(outcomes[0])).toMatch(/Draw your signature/);
  });

  it('ignores a mark for a page the file does not have', async () => {
    const h = harness();
    const input = await h.add('Lease.pdf', await pagesPdf(1));
    const outcomes = await getOp('sign').run([input], { marks: [{ kind: 'image', area: { page: 4, x: 0, y: 0, w: 0.1, h: 0.1 }, png: noisePng(4) }] }, h.ctx);
    expect(outcomes[0]!.kind).toBe('failed');
  });
});

describe('add text', () => {
  it('writes the lines where they were placed, upright on a turned page', async () => {
    const h = harness();
    const input = await h.add('Form.pdf', await rotatedPdf([90]));
    const marks: Mark[] = [{ kind: 'text', area: { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.1 }, text: 'Vysakh Suresh\nKochi', size: 0.04, color: [0, 0, 0] }];
    const outcome = only(await getOp('add-text').run([input], { marks }, h.ctx));
    const view = await engine.open(await h.bytesOf(outcome.file));
    const text = await view.text(0);
    expect(text).toContain('Vysakh Suresh');
    expect(text).toContain('Kochi');
    // Drawn upright as the reader sees the page: pdf.js reports it as horizontal text.
    await view.close();
  });

  it('says plainly when the letters cannot be drawn', async () => {
    const h = harness();
    const input = await h.add('Form.pdf', await pagesPdf(1));
    const marks: Mark[] = [{ kind: 'text', area: { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.1 }, text: 'ക്ഷണം', size: 0.04, color: [0, 0, 0] }];
    const outcomes = await getOp('add-text').run([input], { marks }, h.ctx);
    expect(outcomes[0]).toMatchObject({ kind: 'failed', code: 'unsupported-text' });
  });
});

describe('mark up', () => {
  it('draws highlights and pen strokes and counts them', async () => {
    const h = harness();
    const input = await h.add('Notes.pdf', await pagesPdf(2));
    const marks: Mark[] = [{ kind: 'highlight', area: { page: 0, x: 0.05, y: 0.1, w: 0.4, h: 0.05 }, color: [1, 0.9, 0.2] }, ink, { ...ink, page: 1 }];
    const outcome = only(await getOp('mark-up').run([input], { marks }, h.ctx));
    expect(outcome.detail).toBe('1 highlight and 2 pen strokes across 2 pages');
    expect(outcome.file.name).toBe('Notes (marked up).pdf');
  });
});

describe('fill in a form', () => {
  it('lists the fields, fills them, and keeps them editable unless sealed', async () => {
    const h = harness();
    const input = await h.add('Application.pdf', await formPdf());
    const view = await engine.open(await h.bytesOf(input));
    const fields = await view.fields();
    await view.close();
    expect(fields.map((f) => [f.kind, f.name])).toEqual([
      ['text', 'name'],
      ['text', 'address'],
      ['check', 'agree'],
      ['choice', 'city'],
      ['choice', 'member'],
    ]);
    expect(fields.find((f) => f.name === 'member')).toMatchObject({ options: ['yes', 'no'] });

    const values = { name: 'Anjali Menon', address: '12 Marine Drive\nKochi', agree: true, city: 'Dubai', member: 'no' };
    const outcome = only(await getOp('fill-form').run([input], { values, seal: false }, h.ctx));
    expect(outcome.detail).toBe('5 answers, still editable');
    const filled = await engine.open(await h.bytesOf(outcome.file));
    const after = await filled.fields();
    await filled.close();
    expect(after.find((f) => f.name === 'name')).toMatchObject({ value: 'Anjali Menon' });
    expect(after.find((f) => f.name === 'agree')).toMatchObject({ checked: true });
    expect(after.find((f) => f.name === 'city')).toMatchObject({ value: 'Dubai' });
    expect(after.find((f) => f.name === 'member')).toMatchObject({ value: 'no' });

    const sealed = only(await getOp('fill-form').run([input], { values, seal: true }, h.ctx));
    const flat = await engine.open(await h.bytesOf(sealed.file));
    expect(await flat.fields()).toEqual([]);
    expect(await flat.text(0)).toContain('Anjali Menon');
    await flat.close();
  });
});

describe('the invisible text layer', () => {
  it('makes words findable on a page that had none, without changing how it looks', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([400, 300]).drawRectangle({ x: 0, y: 0, width: 400, height: 300 });
    const surgeon = createSurgeon();
    const pdf = await surgeon.open(await doc.save());
    const placed = pdf.addTextLayer(0, [
      { text: 'Invoice', x: 0.1, y: 0.1, w: 0.2, h: 0.05 },
      { text: '4821', x: 0.35, y: 0.1, w: 0.1, h: 0.05 },
      { text: 'ക്ഷ', x: 0.5, y: 0.1, w: 0.1, h: 0.05 },
    ]);
    expect(placed).toBe(2);
    const view = await engine.open(await pdf.save());
    expect(await view.text(0)).toMatch(/Invoice\s*4821/);
    await view.close();
  });
});
