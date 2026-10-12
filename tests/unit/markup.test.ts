/**
 * The mark-up kit, drawn by the surgeon and read back with pdf.js: notes and
 * links become real annotations a reader lists, stamps and measurements are
 * real text, and nothing lands off the page on a page turned sideways.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import { describeMarks } from '../../app/src/ops/edit-ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { measureLabel, type Mark } from '../../app/src/pdf/types';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { TINY_JPEG, pagesPdf, rotatedPdf, stampsIn } from '../fixtures/pdfs';

type PdfJs = typeof import('pdfjs-dist');
let pdfjs: PdfJs;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
  pdfjs = await import('pdfjs-dist');
});

function harness() {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: () => Promise.reject(new Error('no engine')),
    surgeon: createSurgeon(),
    passwords: new Map(),
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return { ctx, workspace };
}

function only(outcomes: Outcome[]) {
  const list = outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  return list[0]!;
}

const red = [0.8, 0.1, 0.1] as const;
const KIT: Mark[] = [
  { kind: 'highlight', area: { page: 0, x: 0.1, y: 0.1, w: 0.3, h: 0.04 }, color: [1, 0.9, 0.2] },
  { kind: 'highlight', area: { page: 0, x: 0.1, y: 0.16, w: 0.3, h: 0.03 }, color: red, style: 'underline' },
  { kind: 'highlight', area: { page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.03 }, color: red, style: 'strike' },
  { kind: 'shape', area: { page: 0, x: 0.5, y: 0.1, w: 0.2, h: 0.1 }, shape: 'rect', color: red, width: 0.003 },
  { kind: 'shape', area: { page: 0, x: 0.5, y: 0.25, w: 0.2, h: 0.1 }, shape: 'ellipse', color: red, width: 0.003 },
  { kind: 'line', page: 0, from: [0.1, 0.5], to: [0.5, 0.5], color: red, width: 0.003, end: 'arrow' },
  { kind: 'line', page: 0, from: [0.1, 0.6], to: [0.6, 0.6], color: red, width: 0.003, end: 'measure' },
  { kind: 'note', area: { page: 0, x: 0.8, y: 0.1, w: 0.05, h: 0.04 }, text: 'ഫീസ് ചോദിക്കുക — ask about the fee', color: [0.1, 0.2, 0.8] },
  { kind: 'stamp', area: { page: 0, x: 0.55, y: 0.7, w: 0.35, h: 0.08 }, text: 'Approved', color: red },
  { kind: 'link', area: { page: 0, x: 0.1, y: 0.8, w: 0.4, h: 0.05 }, url: 'https://example.org/terms' },
  { kind: 'text', area: { page: 0, x: 0.1, y: 0.88, w: 0.3, h: 0.03 }, text: 'See clause 4', size: 0.03, color: red, boxed: true },
  { kind: 'picture', area: { page: 0, x: 0.75, y: 0.85, w: 0.1, h: 0.1 }, bytes: TINY_JPEG, format: 'jpeg' },
];

describe('the mark-up kit', () => {
  it('measures on paper', () => {
    expect(measureLabel(72)).toBe('25 mm');
    expect(measureLabel(14.4)).toBe('5.1 mm');
    expect(measureLabel(595.28)).toBe('21.0 cm');
  });

  it('says what was added, by kind', () => {
    expect(describeMarks(KIT)).toBe(
      '1 highlight, 1 underline, 1 strike-through, 1 box, 1 circle, 1 arrow, 1 measurement, 1 note, 1 stamp, 1 link, 1 text box and 1 picture',
    );
  });

  it('draws every kind, with notes and links as real annotations', async () => {
    const h = harness();
    const input = await h.workspace.put('Lease.pdf', await pagesPdf(1), 'pdf', { kind: 'picked' });
    const out = only(await getOp('mark-up').run([input], { marks: KIT }, h.ctx));
    const bytes = new Uint8Array(await (await h.workspace.read(out.file)).arrayBuffer());
    expect(stampsIn(bytes)).toEqual([]);
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    try {
      const page = await doc.getPage(1);
      const annotations = await page.getAnnotations();
      const note = annotations.find((a) => a.subtype === 'Text');
      expect(note?.contentsObj?.str).toBe('ഫീസ് ചോദിക്കുക — ask about the fee');
      const link = annotations.find((a) => a.subtype === 'Link');
      expect(link?.url).toBe('https://example.org/terms');
      const words = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('|');
      expect(words).toContain('APPROVED');
      expect(words).toContain('See clause 4');
      // Half of a 300-point-wide page: 150 points, 53 mm.
      expect(words).toContain('53 mm');
    } finally {
      await task.destroy();
    }
  });

  it('keeps a stamp upright and on the page on a page turned sideways', async () => {
    const h = harness();
    const input = await h.workspace.put('Deck.pdf', await rotatedPdf([90]), 'pdf', { kind: 'picked' });
    const out = only(await getOp('mark-up').run([input], { marks: [{ kind: 'stamp', area: { page: 0, x: 0.6, y: 0.8, w: 0.3, h: 0.1 }, text: 'PAID', color: red }] }, h.ctx));
    const bytes = new Uint8Array(await (await h.workspace.read(out.file)).arrayBuffer());
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    try {
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const item = (await page.getTextContent()).items.find((i) => 'str' in i && i.str === 'PAID');
      expect(item).toBeDefined();
      const m = pdfjs.Util.transform(viewport.transform, (item as { transform: number[] }).transform);
      expect(m[0]).toBeGreaterThan(0);
      expect(Math.abs(m[1])).toBeLessThan(1e-6);
      expect(m[4]).toBeGreaterThan(viewport.width * 0.55);
      expect(m[5]).toBeGreaterThan(viewport.height * 0.75);
      expect(m[5]).toBeLessThan(viewport.height);
    } finally {
      await task.destroy();
    }
  });

  it('refuses a link that does not open a web page, mail or a phone', async () => {
    const h = harness();
    const input = await h.workspace.put('Lease.pdf', await pagesPdf(1), 'pdf', { kind: 'picked' });
    const [out] = await getOp('mark-up').run([input], { marks: [{ kind: 'link', area: { page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.05 }, url: 'javascript:alert(1)' }] }, h.ctx);
    expect(out?.kind).toBe('failed');
  });
});
