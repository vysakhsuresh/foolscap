/**
 * A page number, header or footer on a phone photo whose edges are a dark
 * table stays readable: a small white plate goes behind the words.
 */
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { installNodeCanvas } from '../fixtures/node-canvas';
import { openPdf } from '../fixtures/mark-inspect';

beforeAll(() => {
  installNodeCanvas();
});

async function darkPage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.36, 0.24, 0.15) });
  page.drawRectangle({ x: 80, y: 120, width: 435, height: 620, color: rgb(1, 1, 1) });
  return doc.save();
}

/** The brightest and darkest pixel in a box of the rendered page (fractions, top-left origin). */
async function inks(bytes: Uint8Array, box: [number, number, number, number]): Promise<{ light: number; dark: number }> {
  const pdf = await openPdf(bytes);
  const picture = await pdf.render(0, 1);
  await pdf.close();
  let light = 0;
  let dark = 255;
  for (let y = Math.floor(box[1] * picture.height); y < box[3] * picture.height; y++)
    for (let x = Math.floor(box[0] * picture.width); x < box[2] * picture.width; x++) {
      const i = (y * picture.width + x) * 4;
      const v = ((picture.data[i] ?? 0) + (picture.data[i + 1] ?? 0) + (picture.data[i + 2] ?? 0)) / 3;
      light = Math.max(light, v);
      dark = Math.min(dark, v);
    }
  return { light, dark };
}

describe('page numbers on a dark edge', () => {
  it('sit on a white plate, so they read', async () => {
    const workspace = createMemoryWorkspace();
    const ctx: OpContext = { workspace, engine: () => Promise.reject(new Error('no engine')), surgeon: createSurgeon(), passwords: new Map(), signal: new AbortController().signal, progress: () => undefined };
    const input = await workspace.put('Photo.pdf', await darkPage(), 'pdf', { kind: 'picked' });
    const outcomes: Outcome[] = await getOp('page-numbers').run([input], { format: 'page-n-of-total', position: 'bottom-center', start: 1, skipFirst: false }, ctx);
    const out = outcomes.find((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
    expect(out).toBeDefined();
    const bytes = new Uint8Array(await (await workspace.read(out!.file)).arrayBuffer());
    // The bottom strip, below the paper, is all brown before; now it has a white plate with dark words on it.
    const { light, dark } = await inks(bytes, [0.35, 0.9, 0.65, 0.995]);
    expect(light).toBeGreaterThan(220);
    expect(dark).toBeLessThan(90);
  });
});
