/**
 * Batch B: the tools that change how a document is put together. Each output
 * is read back with pdf.js, the way a reader would see it, not by asking
 * pdf-lib what it just wrote.
 */
import { PDFDocument, PDFHexString, PDFName, PDFString } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FileKind, FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { labelRanges, parseHex, roman } from '../../app/src/ops/structure-ops';
import type { ToolId } from '../../app/src/ops/tools';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { flatten, toTree } from '../../app/src/ui/bookmarks-panel';
import { chunks } from '../../app/src/ui/reader';
import { bloatedPdf, outlinedPdf, pagesPdf, stampsIn } from '../fixtures/pdfs';

type PdfJs = typeof import('pdfjs-dist');
let pdfjs: PdfJs;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
  pdfjs = await import('pdfjs-dist');
});

function harness(passwords: ReadonlyMap<string, string> = new Map()) {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: () => Promise.reject(new Error('no engine here')),
    surgeon: createSurgeon(),
    passwords,
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return {
    ctx,
    add: (name: string, bytes: Uint8Array, kind: FileKind = 'pdf') => workspace.put(name, bytes, kind, { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

const run = (tool: ToolId, inputs: readonly FoolscapFile[], params: unknown, ctx: OpContext) => getOp(tool).run(inputs, params, ctx);

function produced(outcomes: Outcome[]) {
  return outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
}

function only(outcomes: Outcome[]) {
  const list = produced(outcomes);
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  return list[0]!;
}

/** Opens bytes with pdf.js and hands over the document; destroyed afterwards. */
async function withPdfJs<T>(bytes: Uint8Array, use: (doc: import('pdfjs-dist').PDFDocumentProxy) => Promise<T>, password?: string): Promise<T> {
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0, ...(password ? { password } : {}) });
  const doc = await task.promise;
  try {
    return await use(doc);
  } finally {
    await task.destroy();
  }
}

/** The colour of the pixel at the corner of page 1, drawn by pdf.js's own operator list: the first fill. */
async function firstFill(bytes: Uint8Array, page = 1): Promise<number[] | null> {
  return withPdfJs(bytes, async (doc) => {
    const ops = await (await doc.getPage(page)).getOperatorList();
    const i = ops.fnArray.indexOf(pdfjs.OPS.setFillRGBColor);
    if (i < 0) return null;
    const arg = ops.argsArray[i]?.[0] as string | number[];
    if (typeof arg === 'string') {
      const n = Number.parseInt(arg.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return arg.map((v) => Math.round(v * 255));
  });
}

describe('page background', () => {
  it('parses a colour, and refuses anything else', () => {
    expect(parseHex('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(parseHex('red')).toBeNull();
  });

  it('paints behind the pages asked for, and leaves the rest', async () => {
    const h = harness();
    const input = await h.add('Notes.pdf', await pagesPdf(3));
    const out = only(await run('background', [input], { color: '#fbf6e9', pages: '2' }, h.ctx));
    expect(out.detail).toBe('Page 2 given a #FBF6E9 background');
    const bytes = await h.bytesOf(out.file);
    expect(await firstFill(bytes, 2)).toEqual([0xfb, 0xf6, 0xe9]);
    expect(await firstFill(bytes, 1)).not.toEqual([0xfb, 0xf6, 0xe9]);
    // Still the same words on the page, drawn over the colour.
    const text = await withPdfJs(bytes, async (doc) => (await (await doc.getPage(2)).getTextContent()).items.length);
    expect(text).toBeGreaterThan(0);
    expect(stampsIn(bytes)).toEqual([]);
  });
});

describe('page labels', () => {
  it('writes roman numerals and the ranges', () => {
    expect([1, 4, 9, 14, 40, 1999].map(roman)).toEqual(['i', 'iv', 'ix', 'xiv', 'xl', 'mcmxcix']);
    expect(labelRanges(2, 1, '', 5)).toEqual([{ start: 0, style: 'roman' }, { start: 2, style: 'decimal', first: 1 }]);
    expect(labelRanges(0, 5, 'A-', 3)).toEqual([{ start: 0, style: 'decimal', prefix: 'A-', first: 5 }]);
    expect(labelRanges(9, 1, '', 3)).toEqual([{ start: 0, style: 'roman' }]);
  });

  it('labels the front pages i, ii and the rest from 1, as a reader shows them', async () => {
    const h = harness();
    const input = await h.add('Thesis.pdf', await pagesPdf(5));
    const out = only(await run('page-labels', [input], { mode: 'set', front: 2, start: 1, prefix: '' }, h.ctx));
    expect(out.detail).toBe('Pages labelled i to ii, then 1 to 3');
    const labels = await withPdfJs(await h.bytesOf(out.file), (doc) => doc.getPageLabels());
    expect(labels).toEqual(['i', 'ii', '1', '2', '3']);
    const removed = only(await run('page-labels', [out.file], { mode: 'remove' }, h.ctx));
    expect(await withPdfJs(await h.bytesOf(removed.file), (doc) => doc.getPageLabels())).toBeNull();
  });
});

describe('attachments', () => {
  it('puts any files inside a PDF and takes them out again, byte for byte', async () => {
    const h = harness();
    const pdf = await h.add('Invoice.pdf', await pagesPdf(1));
    const sheet = new TextEncoder().encode('item,amount\ntea,40\n');
    const csv = await h.add('Costs.csv', sheet, 'other');
    const photo = await h.add('Receipt.pdf', await pagesPdf(1));
    const out = only(await run('attachments', [pdf, csv, photo], { mode: 'attach' }, h.ctx));
    expect(out.detail).toMatch(/^2 files attached inside/);
    const bytes = await h.bytesOf(out.file);
    const seen = await withPdfJs(bytes, (doc) => doc.getAttachments());
    expect([...(seen?.values() ?? [])].map((a) => a.filename).sort()).toEqual(['Costs.csv', 'Receipt.pdf']);
    expect(stampsIn(bytes)).toEqual([]);

    const back = produced(await run('attachments', [out.file], { mode: 'extract' }, h.ctx));
    expect(back.map((o) => o.file.name).sort()).toEqual(['Costs.csv', 'Receipt.pdf']);
    const csvBack = back.find((o) => o.file.name === 'Costs.csv')!;
    expect(csvBack.file.kind).toBe('other');
    expect(await h.bytesOf(csvBack.file)).toEqual(sheet);
    expect(back.find((o) => o.file.name === 'Receipt.pdf')!.file.kind).toBe('pdf');
  });

  it('says so when there is nothing attached, or nothing to attach', async () => {
    const h = harness();
    const pdf = await h.add('Plain.pdf', await pagesPdf(1));
    const [none] = await run('attachments', [pdf], { mode: 'extract' }, h.ctx);
    expect(none).toMatchObject({ kind: 'skipped', reason: 'This PDF carries no attached files.' });
    const [alone] = await run('attachments', [pdf], { mode: 'attach' }, h.ctx);
    expect(alone?.kind).toBe('failed');
  });
});

describe('bookmarks', () => {
  it('turns the editor rows into a tree and back', () => {
    const rows = [
      { title: 'One', page: 0, depth: 0 },
      { title: 'One a', page: 1, depth: 1 },
      { title: 'One a i', page: 1, depth: 3 },
      { title: 'Two', page: 2, depth: 0 },
    ];
    const tree = toTree(rows);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.items[0]!.items[0]!.title).toBe('One a i');
    expect(flatten(tree).map((r) => r.depth)).toEqual([0, 1, 2, 0]);
  });

  it('writes a nested outline a reader can follow, replacing the old one', async () => {
    const h = harness();
    const input = await h.add('Manual.pdf', await outlinedPdf(4));
    const items = [
      { title: 'Start here', page: 0, items: [{ title: 'Safety', page: 1, items: [] }] },
      { title: 'Résumé', page: 3, items: [] },
    ];
    const out = only(await run('bookmarks', [input], { items }, h.ctx));
    expect(out.detail).toBe("3 bookmarks, ready in any reader's side panel");
    const read = await withPdfJs(await h.bytesOf(out.file), async (doc) => {
      const outline = (await doc.getOutline()) ?? [];
      const pageOf = async (dest: unknown) => (Array.isArray(dest) ? doc.getPageIndex(dest[0]) : -1);
      return Promise.all(
        outline.map(async (o) => ({ title: o.title, page: await pageOf(o.dest), kids: await Promise.all(o.items.map(async (k) => ({ title: k.title, page: await pageOf(k.dest) }))) })),
      );
    });
    expect(read).toEqual([
      { title: 'Start here', page: 0, kids: [{ title: 'Safety', page: 1 }] },
      { title: 'Résumé', page: 3, kids: [] },
    ]);
    // And the surgeon reads back what it wrote.
    const again = await createSurgeon().open(await h.bytesOf(out.file));
    expect(again.bookmarks().map((b) => b.title)).toEqual(['Start here', 'Résumé']);
  });

  it('refuses a bookmark to a page that does not exist, and removes them all when asked', async () => {
    const h = harness();
    const input = await h.add('Manual.pdf', await outlinedPdf(4));
    const [bad] = await run('bookmarks', [input], { items: [{ title: 'Nowhere', page: 9, items: [] }] }, h.ctx);
    expect(bad).toMatchObject({ kind: 'failed', reason: 'Every bookmark needs a page between 1 and 4.' });
    const out = only(await run('bookmarks', [input], { items: [] }, h.ctx));
    expect(out.detail).toBe('Every bookmark removed');
    expect(await withPdfJs(await h.bytesOf(out.file), (doc) => doc.getOutline())).toBeNull();
  });
});

describe('split at bookmarks', () => {
  it('makes one file per chapter, named after it', async () => {
    const h = harness();
    // "Introduction" on page 1, "Terms" on page 3.
    const input = await h.add('Lease.pdf', await outlinedPdf(4));
    const parts = produced(await run('split', [input], { mode: 'bookmarks' }, h.ctx));
    expect(parts.map((p) => p.file.name)).toEqual(['Lease 01 Introduction.pdf', 'Lease 02 Terms.pdf']);
    expect(parts.map((p) => p.detail)).toEqual(['2 pages', '2 pages']);
  });

  it('says how to add bookmarks when there are none', async () => {
    const h = harness();
    const input = await h.add('Plain.pdf', await pagesPdf(3));
    const [out] = await run('split', [input], { mode: 'bookmarks' }, h.ctx);
    expect(out).toMatchObject({ kind: 'failed' });
    expect(JSON.stringify(out)).toMatch(/no bookmarks/);
  });
});

/** A PDF that carries a script, an attachment, a comment and a title: everything Clean should take. */
async function leakyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await pagesPdf(2), { updateMetadata: false });
  const { context } = doc;
  const js = context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert("hi")') });
  doc.catalog.set(PDFName.of('OpenAction'), context.register(js));
  await doc.attach(new TextEncoder().encode('secret notes'), 'notes.txt', { mimeType: 'text/plain' });
  const note = context.register(context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], Contents: PDFHexString.fromText('Ask Priya about the fee') }));
  doc.getPage(0).node.set(PDFName.of('Annots'), context.obj([note]));
  doc.setTitle('Draft v7 – do not send');
  doc.setAuthor('R. Menon');
  return doc.save();
}

describe('clean hidden data', () => {
  it('takes out scripts, attachments, comments and metadata, and says what went', async () => {
    const h = harness();
    const input = await h.add('Offer.pdf', await leakyPdf());
    const out = only(await run('document-details', [input], { mode: 'clean', comments: true, attachments: true }, h.ctx));
    expect(out.detail).toBe('Removed the title and author, 1 script or action, 1 attached file and 1 comment');
    const bytes = await h.bytesOf(out.file);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).not.toMatch(/JavaScript|app\.alert|secret notes|R\. Menon|Draft v7/);
    await withPdfJs(bytes, async (doc) => {
      expect(await doc.getAttachments()).toBeNull();
      expect(await (await doc.getPage(1)).getAnnotations()).toEqual([]);
      expect((await doc.getMetadata()).info).not.toHaveProperty('Title');
    });
  });

  it('keeps comments and attachments when asked to', async () => {
    const h = harness();
    const input = await h.add('Offer.pdf', await leakyPdf());
    const out = only(await run('document-details', [input], { mode: 'clean', comments: false, attachments: false }, h.ctx));
    expect(out.detail).toBe('Removed the title and author and 1 script or action');
    await withPdfJs(await h.bytesOf(out.file), async (doc) => {
      expect((await doc.getAttachments())?.size).toBe(1);
      expect(await (await doc.getPage(1)).getAnnotations()).toHaveLength(1);
    });
  });
});

describe('restrict without a password', () => {
  it('opens for anyone and carries the permissions asked for', async () => {
    const h = harness();
    const input = await h.add('Brochure.pdf', await pagesPdf(2));
    const out = only(await run('add-password', [input], { mode: 'restrict', password: '', allowPrinting: true, allowCopying: false, allowEditing: false }, h.ctx));
    expect(out.file.name).toBe('Brochure restricted.pdf');
    expect(out.detail).toBe('Opens without a password; printing allowed, copying blocked, editing blocked');
    const perms = await withPdfJs(await h.bytesOf(out.file), (doc) => doc.getPermissions());
    expect(perms).toContain(pdfjs.PermissionFlag.PRINT);
    expect(perms).not.toContain(pdfjs.PermissionFlag.COPY);
    expect(perms).not.toContain(pdfjs.PermissionFlag.MODIFY_CONTENTS);
  });

  it('refuses when everything is allowed', async () => {
    const h = harness();
    const input = await h.add('Brochure.pdf', await pagesPdf(1));
    const [out] = await run('add-password', [input], { mode: 'restrict', password: '', allowPrinting: true, allowCopying: true, allowEditing: true }, h.ctx);
    expect(out?.kind).toBe('failed');
  });
});

describe('Bates numbering', () => {
  it('runs one sequence through every file in the batch', async () => {
    const h = harness();
    const a = await h.add('A.pdf', await pagesPdf(2));
    const b = await h.add('B.pdf', await pagesPdf(3));
    const outs = produced(await run('page-numbers', [a, b], { position: 'bottom-right', format: 'bates', start: 1, skipFirst: false, prefix: 'ACME-', digits: 6 }, h.ctx));
    expect(outs.map((o) => o.detail)).toEqual(['Bates numbered ACME-000001 to ACME-000002', 'Bates numbered ACME-000003 to ACME-000005']);
    const last = await withPdfJs(await h.bytesOf(outs[1]!.file), async (doc) => (await (await doc.getPage(3)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')));
    expect(last).toContain('ACME-000005');
  });
});

describe('replace pages', () => {
  it('takes the pages typed out and puts the new ones where they were', async () => {
    const h = harness();
    const main = await h.add('Contract.pdf', await pagesPdf(4));
    const fix = await h.add('Signed page.pdf', await pagesPdf(1));
    const out = only(await run('insert-pages', [main, fix], { what: 'files', after: 0, blankCount: 1, replace: '2-3' }, h.ctx));
    expect(out.detail).toBe('Pages 2-3 replaced with 1 page, 3 in all');
    expect(await withPdfJs(await h.bytesOf(out.file), async (doc) => doc.numPages)).toBe(3);
  });
});

describe('compress to a size', () => {
  it('gets under the size asked for, and says so', async () => {
    const h = harness();
    const input = await h.add('Form.pdf', await bloatedPdf());
    const limitKb = Math.ceil(input.size / 1000 / 2);
    const out = only(await run('compress', [input], { level: 'target', targetKb: limitKb }, h.ctx));
    expect((await h.bytesOf(out.file)).length).toBeLessThanOrEqual(limitKb * 1000);
    expect(out.file.name).toBe(`Form (under ${limitKb} KB).pdf`);
    expect(out.detail).toMatch(/under .* KB; text untouched/);
  });

  it('does nothing to a file already under the size', async () => {
    const h = harness();
    const input = await h.add('Small.pdf', await pagesPdf(1));
    const [out] = await run('compress', [input], { level: 'target', targetKb: 5000 }, h.ctx);
    expect(out?.kind).toBe('skipped');
  });
});

describe('read aloud', () => {
  it('cuts text into pieces a speech engine will finish', () => {
    expect(chunks('   ')).toEqual([]);
    expect(chunks('One. Two.')).toEqual(['One. Two.']);
    const long = `${'word '.repeat(120)}end.`;
    const parts = chunks(long);
    expect(parts.every((p) => p.length <= 220)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long.trim());
  });
});
