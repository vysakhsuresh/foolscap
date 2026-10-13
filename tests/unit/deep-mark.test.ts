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
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import { segmentsOf } from '../../app/src/pdf/find-text';
import { paperFills } from '../../app/src/pdf/content-stream';
import { openPdf } from '../fixtures/mark-inspect';
import { pagesPdf, stampsIn } from '../fixtures/pdfs';
import { applicationFormPdf } from '../fixtures/mark-samples';

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

describe('edit text keeps the look of the words it changes', () => {
  async function fontsPdf(): Promise<Uint8Array> {
    const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.create({ updateMetadata: false });
    const page = doc.addPage([400, 400]);
    page.drawText('Gross earnings', { x: 20, y: 300, size: 12, font: await doc.embedFont(StandardFonts.HelveticaBold) });
    page.drawText('Terms', { x: 20, y: 250, size: 12, font: await doc.embedFont(StandardFonts.TimesRoman) });
    page.drawText('Plain words', { x: 20, y: 200, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
    return new Uint8Array(await doc.save());
  }

  it('the page reader says which words are bold and which are serif, and a line carries it', async () => {
    const engine = await createNodeEngine();
    const view = await engine.open(await fontsPdf());
    try {
      const segments = segmentsOf(await view.layout(0));
      expect(segments.find((s) => s.text === 'Gross earnings')?.bold).toBe(true);
      expect(segments.find((s) => s.text === 'Terms')?.family).toBe('serif');
      const plain = segments.find((s) => s.text === 'Plain words');
      expect(plain?.bold).toBeUndefined();
      expect(plain?.family).toBeUndefined();
    } finally {
      await view.close();
    }
  });

  it('the surgeon writes text in the face asked for', async () => {
    const h = harness();
    const input = await h.workspace.put('Slip.pdf', await pagesPdf(1), 'pdf', { kind: 'picked' });
    const marks = [
      { kind: 'text' as const, area: { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.05 }, text: 'Bold one', size: 0.04, color: [0, 0, 0] as const, face: { bold: true } },
      { kind: 'text' as const, area: { page: 0, x: 0.1, y: 0.3, w: 0.5, h: 0.05 }, text: 'Serif italic', size: 0.04, color: [0, 0, 0] as const, face: { family: 'serif' as const, italic: true } },
      { kind: 'text' as const, area: { page: 0, x: 0.1, y: 0.5, w: 0.5, h: 0.05 }, text: 'Typewriter', size: 0.04, color: [0, 0, 0] as const, face: { family: 'mono' as const } },
    ];
    const { bytes } = await only(await getOp('edit-text').run([input], { marks }, h.ctx), h.workspace);
    const pdf = await openPdf(bytes);
    const fonts = await pdf.fonts(0);
    await pdf.close();
    expect(fonts.find((f) => f.text === 'Bold one')?.font).toMatch(/Helvetica-Bold$/);
    expect(fonts.find((f) => f.text === 'Serif italic')?.font).toMatch(/Times-Italic$/);
    expect(fonts.find((f) => f.text === 'Typewriter')?.font).toMatch(/Courier$/);
  });
});

describe('fill in a form, in any script', () => {
  it('keeps a Malayalam answer as words in the field, shown by a picture of them', async () => {
    const h = harness();
    const input = await h.workspace.put('Card.pdf', await applicationFormPdf(), 'pdf', { kind: 'picked' });
    const { bytes, detail } = await only(await getOp('fill-form').run([input], { values: { 'applicant.full_name': 'അഞ്ജലി മേനോൻ', address: 'കാക്കനാട്\nകൊച്ചി', pin: '682030' }, seal: false }, h.ctx), h.workspace);
    expect(detail).toBe('3 answers, still editable');
    const pdf = await openPdf(bytes);
    const fields = await pdf.fields();
    expect(fields['applicant.full_name']?.find((w) => w['type'] === 'text')?.['value']).toBe('അഞ്ജലി മേനോൻ');
    expect(fields['address']?.find((w) => w['type'] === 'text')?.['value']).toBe('കാക്കനാട്\nകൊച്ചി');
    await pdf.close();
  });

  it('seals a Malayalam answer into the page', async () => {
    const h = harness();
    const input = await h.workspace.put('Card.pdf', await applicationFormPdf(), 'pdf', { kind: 'picked' });
    const { bytes } = await only(await getOp('fill-form').run([input], { values: { 'applicant.full_name': 'അഞ്ജലി' }, seal: true }, h.ctx), h.workspace);
    const pdf = await openPdf(bytes);
    expect(Object.keys(await pdf.fields())).toEqual([]);
    await pdf.close();
    expect(new TextDecoder('latin1').decode(bytes)).toMatch(/\/Subtype\s*\/Image/);
  });

  it('a Malayalam answer longer than its box allows is refused in words, counting letters as a person does', async () => {
    const h = harness();
    const input = await h.workspace.put('Card.pdf', await applicationFormPdf(), 'pdf', { kind: 'picked' });
    const outcomes = await getOp('fill-form').run([input], { values: { pin: '൬൮൨൦൩൦൧' }, seal: false }, h.ctx);
    expect(outcomes[0]).toMatchObject({ kind: 'failed', reason: 'One answer is longer than its box allows (6 characters). Shorten it and try again.' });
  });
});

describe('page background finds the white a page paints itself', () => {
  const page = { x: 0, y: 0, width: 612, height: 792 };
  const fills = (text: string) => paperFills(new TextEncoder().encode(text), page);

  it('as Chrome and Skia write it: a white rectangle over the page, before anything else', () => {
    const found = fills('q 1 0 0 -1 0 792 cm 1 1 1 rg 0 0 612 792 re f Q BT /F1 12 Tf (Hello) Tj ET');
    expect(found.fills.map((f) => f.op)).toEqual(['f']);
    expect(found.drawing).toBe(true);
  });

  it('as pdf-lib writes it: a closed path of four lines', () => {
    const found = fills('q 1 0 0 1 0 792 cm 1 0 0 -1 0 0 cm 1 1 1 rg 0 0 m 612 0 l 612 792 l 0 792 l h f Q');
    expect(found.fills).toHaveLength(1);
    expect(found.drawing).toBe(false);
  });

  it('in grey or CMYK white too', () => {
    expect(fills('1 g 0 0 612 792 re f*').fills.map((f) => f.op)).toEqual(['f*']);
    expect(fills('0 0 0 0 k -10 -10 700 900 re f').fills).toHaveLength(1);
  });

  it('never a coloured page, a white box in a corner, a white shape, or white after the words', () => {
    expect(fills('0.9 0.9 1 rg 0 0 612 792 re f').fills).toEqual([]);
    expect(fills('1 1 1 rg 0 0 100 100 re f').fills).toEqual([]);
    expect(fills('1 1 1 rg 0 0 m 612 0 l 306 792 l h f').fills).toEqual([]);
    expect(fills('1 1 1 rg 0 0 m 612 0 c 0 0 612 792 612 792 v h f').fills).toEqual([]);
    expect(fills('BT (Hi) Tj ET 1 1 1 rg 0 0 612 792 re f').fills).toEqual([]);
    expect(fills('/Im0 Do 1 1 1 rg 0 0 612 792 re f').fills).toEqual([]);
  });

  it('the background op shows its colour on such a page, and keeps its words', async () => {
    const h = harness();
    const { whitePaintedPdf } = await import('../fixtures/mark-samples');
    const input = await h.workspace.put('Printed.pdf', await whitePaintedPdf(), 'pdf', { kind: 'picked' });
    const { bytes } = await only(await getOp('background').run([input], { color: '#eaf6ee', pages: '' }, h.ctx), h.workspace);
    const pdf = await openPdf(bytes);
    const picture = await pdf.render(0, 0.25);
    expect(await pdf.text(0)).toContain('Printed from a browser, page 1');
    await pdf.close();
    const at = (Math.floor(picture.height / 2) * picture.width + Math.floor(picture.width / 2)) * 4;
    expect([picture.data[at], picture.data[at + 1], picture.data[at + 2]]).toEqual([0xea, 0xf6, 0xee]);
  });
});
