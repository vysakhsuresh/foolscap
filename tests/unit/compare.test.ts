import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import { diffWords } from '../../app/src/ops/diff';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import type { PdfEngine } from '../../app/src/pdf/types';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { pdfjsWorkerModule } from '../fixtures/pdfjs-worker';

let engine: PdfEngine;
let pdfjs: typeof import('pdfjs-dist');

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
  pdfjs = await import('pdfjs-dist');
  const { createEngine } = await import('../../app/src/pdf/engine');
  engine = createEngine();
  await engine.ready;
});

const words = (s: string) => s.split(' ');

describe('the word diff', () => {
  it('finds a changed word, an added sentence and a removed one', () => {
    const changes = diffWords(words('the rent is 10000 a month and pets are not allowed'), words('the rent is 12000 a month and pets are allowed on the ground floor'));
    const added = changes.filter((c) => c.kind === 'added').length;
    const removed = changes.filter((c) => c.kind === 'removed').length;
    expect(removed).toBe(2); // 10000, not
    expect(added).toBe(5); // 12000, on the ground floor
  });

  it('stays put when a paragraph is moved, rather than marking everything after it', () => {
    const a = words('one two three four five six seven eight nine ten');
    const b = words('one two six seven eight three four five nine ten');
    const changes = diffWords(a, b);
    expect(changes.filter((c) => c.kind === 'same').length).toBeGreaterThanOrEqual(7);
  });
});

async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((line, i) => page.drawText(line, { x: 60, y: 760 - i * 24, size: 12, font }));
  return doc.save();
}

describe('compare', () => {
  it('marks the newer file: new words highlighted, a comment where words went', async () => {
    const workspace = createMemoryWorkspace();
    const ctx: OpContext = { workspace, engine: async () => engine, surgeon: createSurgeon(), passwords: new Map(), signal: new AbortController().signal, progress: () => undefined };
    const older = await workspace.put('Lease v1.pdf', await textPdf(['The rent is 10000 rupees a month.', 'Pets are not allowed in the flat.']), 'pdf', { kind: 'picked' });
    const newer = await workspace.put('Lease v2.pdf', await textPdf(['The rent is 12000 rupees a month.', 'Pets are allowed in the flat.', 'Parking is included.']), 'pdf', { kind: 'picked' });
    const outcomes: Outcome[] = await getOp('compare').run([older, newer], {}, ctx);
    const out = outcomes[0];
    expect(out?.kind, JSON.stringify(outcomes)).toBe('produced');
    if (out?.kind !== 'produced') return;
    expect(out.file.name).toBe('Lease v2 (compared).pdf');
    expect(out.detail).toMatch(/^4 words added and 2 words taken out, on 1 page/);
    const bytes = new Uint8Array(await (await workspace.read(out.file)).arrayBuffer());
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    try {
      const notes = (await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Text').map((a) => a.contentsObj?.str);
      expect(notes).toEqual(['Removed: 10000', 'Removed: not']);
    } finally {
      await task.destroy();
    }
  });
});
