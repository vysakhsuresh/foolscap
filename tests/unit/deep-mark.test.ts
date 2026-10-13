/**
 * The Mark up family's logic fixes, in Node over the real surgeon: words in
 * any script stamped as a picture of them, watermarks that always fit their
 * page, and the settings each tool gained. tests/e2e/deep-deep-mark.spec.ts
 * drives the same tools through the real pages.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { installNodeCanvas } from '../fixtures/node-canvas';
import { openPdf } from '../fixtures/mark-inspect';
import { pagesPdf, stampsIn } from '../fixtures/pdfs';

beforeAll(() => {
  installNodeCanvas();
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

async function only(outcomes: Outcome[], workspace: ReturnType<typeof createMemoryWorkspace>): Promise<{ bytes: Uint8Array; detail: string }> {
  const list = outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  const out = list[0]!;
  return { bytes: new Uint8Array(await (await workspace.read(out.file)).arrayBuffer()), detail: out.detail };
}

async function a4(): Promise<Uint8Array> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage([595.28, 841.89]);
  doc.addPage([841.89, 595.28]);
  return new Uint8Array(await doc.save());
}

/** The corners of a text run as a reader sees it, from its start point, width, size and angle. */
function corners(w: { x: number; y: number; width: number; size: number; angle: number }): Array<[number, number]> {
  const rad = (w.angle * Math.PI) / 180;
  const along: [number, number] = [Math.cos(rad), -Math.sin(rad)];
  const up: [number, number] = [-Math.sin(rad), -Math.cos(rad)];
  const cap = w.size * 0.72;
  return [
    [w.x, w.y],
    [w.x + along[0] * w.width, w.y + along[1] * w.width],
    [w.x + up[0] * cap, w.y + up[1] * cap],
    [w.x + along[0] * w.width + up[0] * cap, w.y + along[1] * w.width + up[1] * cap],
  ];
}

describe('watermark', () => {
  for (const text of ['WWWWWWWWWWWWWWWW', 'MALABAR MOTORS PRIVATE LIMITED', 'CONFIDENTIAL']) {
    for (const layout of ['once', 'straight'] as const) {
      it(`keeps "${text}" ${layout === 'once' ? 'diagonally' : 'straight'} inside portrait and landscape pages`, async () => {
        const h = harness();
        const input = await h.workspace.put('Page.pdf', await a4(), 'pdf', { kind: 'picked' });
        const { bytes } = await only(await getOp('watermark').run([input], { text, strength: 'medium', layout }, h.ctx), h.workspace);
        const pdf = await openPdf(bytes);
        for (const index of [0, 1]) {
          const { width, height } = await pdf.size(index);
          const word = (await pdf.words(index)).find((w) => w.text === text);
          expect(word, `page ${index + 1}`).toBeDefined();
          for (const [x, y] of corners(word!)) {
            expect(x).toBeGreaterThan(0);
            expect(x).toBeLessThan(width);
            expect(y).toBeGreaterThan(0);
            expect(y).toBeLessThan(height);
          }
        }
        await pdf.close();
      });
    }
  }

  it('goes on the pages typed only, in the colour chosen', async () => {
    const h = harness();
    const input = await h.workspace.put('Report.pdf', await pagesPdf(4), 'pdf', { kind: 'picked' });
    const { bytes, detail } = await only(await getOp('watermark').run([input], { text: 'VOID', strength: 'strong', layout: 'straight', color: 'red', pages: '2, 4' }, h.ctx), h.workspace);
    expect(detail).toBe('"VOID" across pages 2, 4');
    const pdf = await openPdf(bytes);
    expect((await pdf.words(0)).some((w) => w.text === 'VOID')).toBe(false);
    expect((await pdf.words(1)).find((w) => w.text === 'VOID')?.angle).toBe(0);
    expect((await pdf.words(2)).some((w) => w.text === 'VOID')).toBe(false);
    expect((await pdf.words(3)).some((w) => w.text === 'VOID')).toBe(true);
    await pdf.close();
  });

  it('draws words the PDF fonts cannot as one picture, shared by every page', async () => {
    const h = harness();
    const input = await h.workspace.put('Notice.pdf', await pagesPdf(3), 'pdf', { kind: 'picked' });
    const { bytes, detail } = await only(await getOp('watermark').run([input], { text: 'കരട്', strength: 'medium', layout: 'once' }, h.ctx), h.workspace);
    expect(detail).toBe('"കരട്" across 3 pages');
    expect(stampsIn(bytes)).toEqual([]);
    const text = new TextDecoder('latin1').decode(bytes);
    // One picture of the word (and its see-through mask), drawn on three pages.
    expect(text.match(/\/Subtype\s*\/Image/g)?.length).toBe(2);
    const { PDFDocument, PDFName, PDFDict } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    for (const page of doc.getPages()) {
      const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'));
      expect(xobjects instanceof PDFDict && xobjects.keys().length > 0).toBe(true);
    }
  });

  it('tiles a picture of the words too', async () => {
    const h = harness();
    const input = await h.workspace.put('Notice.pdf', await pagesPdf(1), 'pdf', { kind: 'picked' });
    const { bytes } = await only(await getOp('watermark').run([input], { text: 'ചോർത്തരുത്', strength: 'light', layout: 'tiled' }, h.ctx), h.workspace);
    // Many copies, one picture and its mask, drawn from one form.
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.match(/\/Subtype\s*\/Image/g)?.length).toBe(2);
  });
});

describe('page numbers', () => {
  it('says what it did in plain words, even for two pages and one number', async () => {
    const h = harness();
    const input = await h.workspace.put('Card.pdf', await pagesPdf(2), 'pdf', { kind: 'picked' });
    const { detail } = await only(await getOp('page-numbers').run([input], { position: 'bottom-center', format: 'n', start: 1, skipFirst: true }, h.ctx), h.workspace);
    expect(detail).toBe('Page 2 numbered 1; cover left blank');
    const one = await h.workspace.put('One.pdf', await pagesPdf(1), 'pdf', { kind: 'picked' });
    const single = await only(await getOp('page-numbers').run([one], { position: 'bottom-center', format: 'n', start: 3, skipFirst: false }, h.ctx), h.workspace);
    expect(single.detail).toBe('Numbered 3');
  });
});

describe('header and footer', () => {
  it('puts the header and footer each where asked, and can leave a cover plain', async () => {
    const h = harness();
    const input = await h.workspace.put('Minutes.pdf', await a4(), 'pdf', { kind: 'picked' });
    const outcomes = await getOp('header-footer').run([input], { header: 'Head', footer: 'Foot {page}', align: 'left', footerAlign: 'right', skipFirst: true }, h.ctx);
    const { bytes, detail } = await only(outcomes, h.workspace);
    expect(detail).toBe('Header and footer on page 2; the first page left plain');
    const pdf = await openPdf(bytes);
    expect(await pdf.words(0)).toEqual([]);
    const words = await pdf.words(1);
    const { width } = await pdf.size(1);
    const head = words.find((w) => w.text === 'Head')!;
    const foot = words.find((w) => w.text === 'Foot 2')!;
    expect(head.x).toBeLessThan(40);
    expect(foot.x + foot.width).toBeGreaterThan(width - 40);
    await pdf.close();
  });

  it('a file named in another script still gets its {name}, as a picture', async () => {
    const h = harness();
    const input = await h.workspace.put('വാടക കരാർ.pdf', await pagesPdf(2), 'pdf', { kind: 'picked' });
    const { detail } = await only(await getOp('header-footer').run([input], { header: '', footer: '{name} {page}', align: 'center' }, h.ctx), h.workspace);
    expect(detail).toBe('Footer on 2 pages');
  });
});
