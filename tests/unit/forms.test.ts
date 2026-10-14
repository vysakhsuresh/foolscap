import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { detectBlanks } from '../../app/src/pdf/find-text';
import type { PageLayout } from '../../app/src/pdf/types';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { pagesPdf } from '../fixtures/pdfs';
import { pdfjsWorkerModule } from '../fixtures/pdfjs-worker';

let pdfjs: typeof import('pdfjs-dist');

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
  pdfjs = await import('pdfjs-dist');
});

function harness() {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = { workspace, engine: () => Promise.reject(new Error('no engine')), surgeon: createSurgeon(), passwords: new Map(), signal: new AbortController().signal, progress: () => undefined };
  return { ctx, workspace };
}

const produced = (outcomes: Outcome[]) => outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');

describe('finding the blanks on a printed form', () => {
  it('turns ____ into text fields and ☐ into tick boxes, named after their words', () => {
    const layout: PageLayout = {
      width: 600,
      height: 800,
      items: [
        { str: 'Full name: ______________', x: 50, y: 100, width: 250, height: 12, fontName: 'f' },
        { str: 'Date of birth:', x: 50, y: 130, width: 90, height: 12, fontName: 'f' },
        { str: '..........', x: 150, y: 130, width: 60, height: 12, fontName: 'f' },
        { str: '☐ Married   ☐ Single', x: 50, y: 160, width: 160, height: 12, fontName: 'f' },
      ],
    };
    const blanks = detectBlanks(layout, 0);
    expect(blanks.map((b) => [b.kind, b.name])).toEqual([
      ['text', 'Full name'],
      ['text', 'Date of birth'],
      ['check', 'Married'],
      ['check', 'Single'],
    ]);
    const name = blanks[0]!.area;
    expect(name.x * 600).toBeGreaterThan(50 + 80);
    expect(name.y * 800).toBeLessThan(100);
    expect((name.y + name.h) * 800).toBeGreaterThan(100);
  });
});

describe('create a form', () => {
  it('adds real fields any reader fills in, with unique names', async () => {
    const h = harness();
    const input = await h.workspace.put('Application.pdf', await pagesPdf(1), 'pdf', { kind: 'picked' });
    const fields = [
      { kind: 'text', name: 'Full name', area: { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.04 } },
      { kind: 'text', name: 'Full name', area: { page: 0, x: 0.1, y: 0.2, w: 0.5, h: 0.04 } },
      { kind: 'check', name: 'Agree', area: { page: 0, x: 0.1, y: 0.3, w: 0.04, h: 0.03 } },
      { kind: 'choice', name: 'City', options: ['Kochi', 'Chennai'], area: { page: 0, x: 0.1, y: 0.4, w: 0.3, h: 0.04 } },
    ];
    const [out] = produced(await getOp('create-form').run([input], { fields }, h.ctx));
    expect(out?.detail).toBe('2 text fields, 1 tick box and 1 choice list added: anyone can fill it in, in any PDF reader');
    const bytes = new Uint8Array(await (await h.workspace.read(out!.file)).arrayBuffer());
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    try {
      const objects = await doc.getFieldObjects();
      expect([...(objects?.keys() ?? [])].sort()).toEqual(['Agree', 'City', 'Full name', 'Full name 2']);
    } finally {
      await task.destroy();
    }
  });
});

describe('fill in a form, saving the answers', () => {
  it('saves every answer as a .json beside the filled PDF', async () => {
    const h = harness();
    const doc = await PDFDocument.create({ updateMetadata: false });
    const page = doc.addPage([400, 400]);
    const form = doc.getForm();
    form.createTextField('name').addToPage(page, { x: 20, y: 300, width: 200, height: 20, font: await doc.embedFont(StandardFonts.Helvetica) });
    const input = await h.workspace.put('Form.pdf', await doc.save(), 'pdf', { kind: 'picked' });
    const outs = produced(await getOp('fill-form').run([input], { values: { name: 'Meera' }, seal: false, answers: { name: 'Meera' } }, h.ctx));
    expect(outs.map((o) => o.file.name)).toEqual(['Form (filled).pdf', 'Form answers.json']);
    const json = JSON.parse(await (await h.workspace.read(outs[1]!.file)).text()) as { fields: Record<string, string> };
    expect(json.fields).toEqual({ name: 'Meera' });
  });
});
