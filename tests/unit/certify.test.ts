/**
 * Digital signature, through the op as the tool page runs it: a real
 * PKCS#12 test certificate, the PDF signed, and pdf.js finding the signature
 * field in what comes out.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { AES_EC384 } from '../fixtures/certificates';
import { encryptedPdf, pagesPdf, stampsIn } from '../fixtures/pdfs';
import { pdfjsWorkerModule } from '../fixtures/pdfjs-worker';

type PdfJs = typeof import('pdfjs-dist');
let pdfjs: PdfJs;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
  pdfjs = await import('pdfjs-dist');
});

const certificate = new Uint8Array(Buffer.from(([] as string[]).concat(AES_EC384).join(''), 'base64'));

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
  return {
    ctx,
    add: (name: string, bytes: Uint8Array) => workspace.put(name, bytes, 'pdf', { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

const sign = (inputs: FoolscapFile[], params: object, ctx: OpContext): Promise<Outcome[]> =>
  getOp('digital-sign').run(inputs, { certificate, password: 'pässword', visible: true, reason: '', ...params }, ctx);

describe('digital signature', () => {
  it('signs with the certificate, visibly on the last page, and pdf.js finds the signature', async () => {
    const h = harness();
    const input = await h.add('Agreement.pdf', await pagesPdf(3));
    const [out] = await sign([input], { reason: 'I approve' }, h.ctx);
    expect(out?.kind, JSON.stringify(out)).toBe('produced');
    if (out?.kind !== 'produced') return;
    expect(out.file.name).toBe('Agreement (signed).pdf');
    expect(out.detail).toMatch(/^Signed by Kerala Test Co, certificate from .+; shown at the foot of the last page$/);
    const bytes = await h.bytesOf(out.file);
    expect(stampsIn(bytes)).toEqual([]);
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    try {
      expect(doc.numPages).toBe(3);
      const annotations = await (await doc.getPage(3)).getAnnotations();
      expect(annotations.some((a) => a.fieldType === 'Sig')).toBe(true);
    } finally {
      await task.destroy();
    }
  });

  it('says so in words for a wrong password, no certificate, or a locked PDF', async () => {
    const h = harness();
    const input = await h.add('Agreement.pdf', await pagesPdf(1));
    expect(await sign([input], { password: 'wrong' }, h.ctx)).toMatchObject([{ kind: 'failed', reason: "That password didn't open the certificate." }]);
    expect(await sign([input], { certificate: new Uint8Array(0) }, h.ctx)).toMatchObject([{ kind: 'failed', reason: 'Choose your certificate file (.pfx or .p12).' }]);
    const locked = await h.add('Locked.pdf', await encryptedPdf('x', 1));
    expect(await sign([locked], {}, h.ctx)).toMatchObject([{ kind: 'failed', reason: 'This PDF is locked with a password. Type it on the file above and tap Unlock, then sign it.' }]);
  });
});
