/**
 * Compress to a size, when it has to turn pages into pictures, keeps each
 * page's words underneath the picture: the file still searches and copies.
 */
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import { openPdf } from '../fixtures/mark-inspect';

beforeAll(() => {
  installNodeCanvas();
});

describe('compress to a size, pages as pictures', () => {
  it('keeps every page’s words, to search and copy, under the picture', { timeout: 120_000 }, async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // A chart of thousands of strokes: no photo to shrink, so only pictures of the pages get it small.
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const line of ['Monthly statement, Kochi branch', 'Closing balance 45,000.00']) {
      const page = doc.addPage([595, 842]);
      page.drawText(line, { x: 60, y: 760, size: 18, font });
      for (let i = 0; i < 4000; i++) page.drawLine({ start: { x: 60 + rand() * 470, y: 100 + rand() * 600 }, end: { x: 60 + rand() * 470, y: 100 + rand() * 600 }, thickness: 0.3 });
    }
    const workspace = createMemoryWorkspace();
    const engine = await createNodeEngine();
    const ctx: OpContext = { workspace, engine: async () => engine, surgeon: createSurgeon(), passwords: new Map(), signal: new AbortController().signal, progress: () => undefined };
    const input = await workspace.put('Statement.pdf', await doc.save(), 'pdf', { kind: 'picked' });
    const outcomes: Outcome[] = await getOp('compress').run([input], { level: 'target', targetKb: 150, allowPictures: true }, ctx);
    const out = outcomes.find((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
    expect(out?.detail).toContain('pages are now pictures');
    expect(out?.detail).toContain('words kept underneath');
    const view = await openPdf(new Uint8Array(await (await workspace.read(out!.file)).arrayBuffer()));
    expect(await view.text(0)).toContain('Monthly statement, Kochi branch');
    expect(await view.text(1)).toContain('Closing balance 45,000.00');
    await view.close();
  });
});
