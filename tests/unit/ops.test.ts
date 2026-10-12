/**
 * The three stage-1 ops, in Node, over the real surgeon and a real memory
 * Workspace. Only the engine is a stub: merge, split and organise never call
 * it, and a stub that rejects proves they do not.
 */
import { describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import { baseName, ordinal } from '../../app/src/ops/common';
import { OpCancelled, type MergeParams, type OpContext, type OrganiseParams, type Outcome, type Progress, type SplitParams } from '../../app/src/ops/op';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { corruptBytes, encryptedPdf, notAPdf, pagesPdf, pdfInfo, rotatedPdf, sourceIndices, stampsIn } from '../fixtures/pdfs';

interface Harness {
  readonly ctx: OpContext;
  readonly controller: AbortController;
  readonly progress: Progress[];
  add(name: string, bytes: Uint8Array): Promise<FoolscapFile>;
  bytesOf(file: FoolscapFile): Promise<Uint8Array>;
  names(): Promise<string[]>;
}

function harness(passwords: ReadonlyMap<string, string> = new Map()): Harness {
  const workspace = createMemoryWorkspace();
  const controller = new AbortController();
  const progress: Progress[] = [];
  const ctx: OpContext = {
    workspace,
    engine: () => Promise.reject(new Error('the structural ops must not ask for the engine')),
    surgeon: createSurgeon(),
    passwords,
    signal: controller.signal,
    progress: (p) => progress.push(p),
  };
  return {
    ctx,
    controller,
    progress,
    add: (name, bytes) => workspace.put(name, bytes, 'pdf', { kind: 'picked' }),
    bytesOf: async (file) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
    names: async () => (await workspace.list()).map((f) => f.name),
  };
}

function produced(outcomes: Outcome[]): Array<Extract<Outcome, { kind: 'produced' }>> {
  return outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
}

function failures(outcomes: Outcome[]): Array<Extract<Outcome, { kind: 'failed' }>> {
  return outcomes.filter((o): o is Extract<Outcome, { kind: 'failed' }> => o.kind === 'failed');
}

/** Every output: a created document carries no Producer/Creator; no output carries a forbidden string. */
async function expectNoStamp(h: Harness, outcomes: Outcome[], created = true): Promise<void> {
  for (const { file } of produced(outcomes)) {
    const bytes = await h.bytesOf(file);
    const info = await pdfInfo(bytes);
    if (created) {
      expect(info.producer).toBeUndefined();
      expect(info.creator).toBeUndefined();
    }
    expect(stampsIn(bytes)).toEqual([]);
  }
}

function expectOutputNamesDiffer(inputs: readonly FoolscapFile[], outcomes: Outcome[]): void {
  const inputNames = new Set(inputs.map((f) => f.name.toLowerCase()));
  for (const { file } of produced(outcomes)) {
    expect(inputNames.has(file.name.toLowerCase()), file.name).toBe(false);
    expect(file.name).toMatch(/\.pdf$/);
    expect(file.origin.kind).toBe('derived');
  }
}

const run = <P>(tool: 'merge' | 'split' | 'organise', inputs: readonly FoolscapFile[], params: P, ctx: OpContext) =>
  getOp(tool).run(inputs, params, ctx);

describe('merge', () => {
  it('joins inputs in order, counts pages and files, and names the output after the first', async () => {
    const h = harness();
    const a = await h.add('Lease.pdf', await pagesPdf(3, { producer: 'Example Producer', creator: 'Example Creator' }));
    const b = await h.add('Annex.pdf', await pagesPdf(2));
    const c = await h.add('Receipt.PDF', await pagesPdf(1));

    const outcomes = await run<MergeParams>('merge', [a, b, c], {}, h.ctx);
    expect(outcomes).toHaveLength(1);
    const [out] = produced(outcomes);
    expect(out?.detail).toBe('6 pages from 3 files');
    expect(out?.file.name).toBe('Lease + 2 more.pdf');
    expect(out?.file.origin).toEqual({ kind: 'derived', tool: 'merge', from: [a.id, b.id, c.id] });

    const info = await pdfInfo(await h.bytesOf(out!.file));
    expect(info.pageCount).toBe(6);
    expect(sourceIndices(info)).toEqual([0, 1, 2, 0, 1, 0]);
    expect(info.title).toBe('Lease + 2 more');
    expectOutputNamesDiffer([a, b, c], outcomes);
    await expectNoStamp(h, outcomes);

    // The inputs are still there.
    expect(await h.names()).toEqual(['Lease.pdf', 'Annex.pdf', 'Receipt.PDF', 'Lease + 2 more.pdf']);
  });

  it('flips the order when the inputs are given the other way round', async () => {
    const h = harness();
    const a = await h.add('a.pdf', await pagesPdf(3));
    const b = await h.add('b.pdf', await pagesPdf(2));
    const [out] = produced(await run<MergeParams>('merge', [b, a], {}, h.ctx));
    expect(sourceIndices(await pdfInfo(await h.bytesOf(out!.file)))).toEqual([0, 1, 0, 1, 2]);
    expect(out?.file.name).toBe('b + 1 more.pdf');
  });

  it('uses the typed name, and never an input’s own name', async () => {
    const h = harness();
    const a = await h.add('Lease.pdf', await pagesPdf(1));
    const b = await h.add('Annex.pdf', await pagesPdf(1));
    const [typed] = produced(await run<MergeParams>('merge', [a, b], { name: 'Everything' }, h.ctx));
    expect(typed?.file.name).toBe('Everything.pdf');
    const [clash] = produced(await run<MergeParams>('merge', [a, b], { name: 'lease' }, h.ctx));
    expect(clash?.file.name).toBe('lease merged.pdf');
  });

  it('keeps going past one unreadable input and says so', async () => {
    const h = harness();
    const good = await h.add('Good.pdf', await pagesPdf(2));
    const bad = await h.add('Bad.pdf', corruptBytes());
    const other = await h.add('Other.pdf', await pagesPdf(1));

    const outcomes = await run<MergeParams>('merge', [good, bad, other], {}, h.ctx);
    expect(outcomes.map((o) => o.kind)).toEqual(['failed', 'produced']);
    const [failure] = failures(outcomes);
    expect(failure?.inputIds).toEqual([bad.id]);
    expect(failure?.code).toBe('corrupt');
    expect(failure?.reason).toMatch(/^[A-Z].*\.$/);
    expect(failure?.reason).not.toContain('Bad.pdf');

    const [out] = produced(outcomes);
    expect(out?.detail).toBe("3 pages from 2 files, 1 file couldn't be read");
    expect(out?.file.origin).toEqual({ kind: 'derived', tool: 'merge', from: [good.id, other.id] });
    expect(sourceIndices(await pdfInfo(await h.bytesOf(out!.file)))).toEqual([0, 1, 0]);
  });

  it('produces nothing when fewer than two inputs could be read', async () => {
    const h = harness();
    const good = await h.add('Good.pdf', await pagesPdf(2));
    const png = await h.add('Photo.pdf', notAPdf());
    const outcomes = await run<MergeParams>('merge', [good, png], {}, h.ctx);
    expect(outcomes).toHaveLength(1);
    const [failure] = failures(outcomes);
    expect(failure?.inputIds).toEqual([png.id]);
    expect(failure?.code).toBe('not-a-pdf');
    expect(failure?.reason).toContain('Nothing was merged');
    expect(await h.names()).toEqual(['Good.pdf', 'Photo.pdf']);
  });

  it('opens an encrypted input with the password it was given, and reports one it was not', async () => {
    const h = harness();
    const locked = await h.add('Locked.pdf', await encryptedPdf('open sesame'));
    const plain = await h.add('Plain.pdf', await pagesPdf(1));

    const without = await run<MergeParams>('merge', [locked, plain], {}, h.ctx);
    expect(failures(without)[0]).toMatchObject({ inputIds: [locked.id], code: 'encrypted' });
    expect(produced(without)).toHaveLength(0);

    const ctx: OpContext = { ...h.ctx, passwords: new Map([[locked.id, 'open sesame']]) };
    const [out] = produced(await run<MergeParams>('merge', [locked, plain], {}, ctx));
    expect(out?.detail).toBe('3 pages from 2 files');
    const info = await pdfInfo(await h.bytesOf(out!.file));
    expect(info.encrypted).toBe(false);
    expect(sourceIndices(info)).toEqual([0, 1, 0]);
  });

  it('reports progress by pages, with labels that never carry a name, and writes with an indeterminate bar', async () => {
    const h = harness();
    const a = await h.add('Secret name.pdf', await pagesPdf(30));
    const b = await h.add('Other secret.pdf', await pagesPdf(2));
    await run<MergeParams>('merge', [a, b], {}, h.ctx);
    expect(h.progress.length).toBeGreaterThan(3);
    for (const p of h.progress) {
      expect(p.label).not.toMatch(/secret/i);
      expect(p.done).toBeLessThanOrEqual(Math.max(p.total, 0));
    }
    expect(h.progress.some((p) => p.label === 'Adding pages from the second file')).toBe(true);
    expect(h.progress.at(-1)).toEqual({ done: 0, total: 0, label: 'Writing the file…' });
    expect(h.progress.filter((p) => p.total > 0).at(-1)).toEqual({ done: 32, total: 32, label: 'Adding pages from the second file' });
  });

  it('throws OpCancelled when the signal aborts, and leaves no output behind', async () => {
    const h = harness();
    const a = await h.add('a.pdf', await pagesPdf(2));
    const b = await h.add('b.pdf', await pagesPdf(2));
    const ctx: OpContext = {
      ...h.ctx,
      progress: (p) => {
        if (p.label.includes('second')) h.controller.abort();
      },
    };
    await expect(run<MergeParams>('merge', [a, b], {}, ctx)).rejects.toBeInstanceOf(OpCancelled);
    expect(await h.names()).toEqual(['a.pdf', 'b.pdf']);
  });
});

describe('split', () => {
  it('every N: parts of 2, 2, 1, in page order', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await pagesPdf(5, { producer: 'Example Producer' }));
    const outcomes = await run<SplitParams>('split', [input], { mode: 'every', every: 2 }, h.ctx);
    expect(outcomes.map((o) => o.kind)).toEqual(['produced', 'produced', 'produced']);
    const outs = produced(outcomes);
    expect(outs.map((o) => o.file.name)).toEqual(['Statement part 1 of 3.pdf', 'Statement part 2 of 3.pdf', 'Statement part 3 of 3.pdf']);
    expect(outs.map((o) => o.detail)).toEqual(['2 pages', '2 pages', '1 page']);
    const infos = await Promise.all(outs.map(async (o) => pdfInfo(await h.bytesOf(o.file))));
    expect(infos.map(sourceIndices)).toEqual([[0, 1], [2, 3], [4]]);
    expect(outs.every((o) => o.file.origin.kind === 'derived' && o.file.origin.from[0] === input.id)).toBe(true);
    expectOutputNamesDiffer([input], outcomes);
    await expectNoStamp(h, outcomes);
    expect(h.progress.map((p) => p.total)).toEqual([3, 3, 3, 3]);
    expect(h.progress.map((p) => p.done)).toEqual([0, 1, 2, 3]);
  });

  it('single: one file per page', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await pagesPdf(5));
    const outs = produced(await run<SplitParams>('split', [input], { mode: 'single' }, h.ctx));
    expect(outs).toHaveLength(5);
    expect(outs[4]?.file.name).toBe('Statement part 5 of 5.pdf');
    expect(sourceIndices(await pdfInfo(await h.bytesOf(outs[3]!.file)))).toEqual([3]);
  });

  it('ranges: one file per range, in the order typed, named by the pages', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await pagesPdf(5));
    const outs = produced(await run<SplitParams>('split', [input], { mode: 'ranges', ranges: '5, 1-2' }, h.ctx));
    expect(outs.map((o) => o.file.name)).toEqual(['Statement pages 5.pdf', 'Statement pages 1-2.pdf']);
    expect(outs.map((o) => o.detail)).toEqual(['1 page', '2 pages']);
    const infos = await Promise.all(outs.map(async (o) => pdfInfo(await h.bytesOf(o.file))));
    expect(infos.map(sourceIndices)).toEqual([[4], [0, 1]]);
  });

  it('refuses empty ranges, every = 0, a non-integer, and a split that is the whole document', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await pagesPdf(5));
    const empty = await run<SplitParams>('split', [input], { mode: 'ranges', ranges: ' , ' }, h.ctx);
    expect(empty).toEqual([{ kind: 'failed', inputIds: [input.id], reason: 'Type the pages to split out, like 1-3, 7, 12-' }]);
    const zero = await run<SplitParams>('split', [input], { mode: 'every', every: 0 }, h.ctx);
    expect(zero).toEqual([{ kind: 'failed', inputIds: [input.id], reason: 'Pages per part must be at least 1.' }]);
    const fraction = await run<SplitParams>('split', [input], { mode: 'every', every: 1.5 }, h.ctx);
    expect(fraction[0]?.kind).toBe('failed');
    const whole = await run<SplitParams>('split', [input], { mode: 'every', every: 10 }, h.ctx);
    expect(whole).toHaveLength(1);
    expect(whole[0]?.kind).toBe('failed');
    expect(await h.names()).toEqual(['Statement.pdf']);
  });

  it('reports an unreadable input as one failed outcome with its code', async () => {
    const h = harness();
    const input = await h.add('Bad.pdf', corruptBytes());
    const outcomes = await run<SplitParams>('split', [input], { mode: 'single' }, h.ctx);
    expect(outcomes).toHaveLength(1);
    expect(failures(outcomes)[0]).toMatchObject({ inputIds: [input.id], code: 'corrupt' });
  });

  it('throws OpCancelled between parts', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await pagesPdf(5));
    const ctx: OpContext = {
      ...h.ctx,
      progress: (p) => {
        if (p.done === 2) h.controller.abort();
      },
    };
    await expect(run<SplitParams>('split', [input], { mode: 'single' }, ctx)).rejects.toBeInstanceOf(OpCancelled);
    // Two parts were written before the cancel; the runner removes them, the op does not.
    expect((await h.names()).length).toBe(3);
  });
});

describe('organise', () => {
  const page = (source: number, rotation: 0 | 90 | 180 | 270 = 0) => ({ source, rotation });

  it('reorders, rotates, deletes and duplicates, and describes it against the source', async () => {
    const h = harness();
    const input = await h.add('Scan.pdf', await pagesPdf(4, { producer: 'Example Producer', creator: 'Example Creator' }));
    const params: OrganiseParams = { pages: [page(3), page(0, 90), page(2, 180), page(0)] };
    const outcomes = await run('organise', [input], params, h.ctx);
    expect(outcomes).toHaveLength(1);
    const [out] = produced(outcomes);
    expect(out?.file.name).toBe('Scan organised.pdf');
    expect(out?.detail).toBe('4 pages, 2 rotated, 1 removed, 1 duplicated');
    const info = await pdfInfo(await h.bytesOf(out!.file));
    expect(sourceIndices(info)).toEqual([3, 0, 2, 0]);
    expect(info.rotations).toEqual([0, 90, 180, 0]);
    expectOutputNamesDiffer([input], outcomes);
    await expectNoStamp(h, outcomes);
  });

  it('deletes through a fresh document, so the removed page’s bytes are gone', async () => {
    const h = harness();
    const input = await h.add('Scan.pdf', await pagesPdf(4));
    const [out] = produced(await run('organise', [input], { pages: [page(3), page(0), page(2)] } satisfies OrganiseParams, h.ctx));
    expect(out?.detail).toBe('3 pages, 1 removed');
    const info = await pdfInfo(await h.bytesOf(out!.file));
    expect(sourceIndices(info)).toEqual([3, 0, 2]);
    expect(info.producer).toBeUndefined();
  });

  it('takes the cheap path for a permutation: metadata survives, nothing is cloned', async () => {
    const h = harness();
    const source = await pagesPdf(4, { producer: 'Example Producer', creator: 'Example Creator' });
    const input = await h.add('Scan.pdf', source);
    const params: OrganiseParams = { pages: [page(1), page(0), page(3, 90), page(2, 270)] };
    const outcomes = await run('organise', [input], params, h.ctx);
    const [out] = produced(outcomes);
    expect(out?.detail).toBe('Same 4 pages, reordered, 2 rotated');
    const bytes = await h.bytesOf(out!.file);
    const info = await pdfInfo(bytes);
    expect(sourceIndices(info)).toEqual([1, 0, 3, 2]);
    expect(info.rotations).toEqual([0, 0, 90, 270]);
    expect(info.producer).toBe('Example Producer');
    expect(info.creator).toBe('Example Creator');
    expect(bytes.length).toBeLessThanOrEqual(source.length + 400);
    expect(stampsIn(bytes)).toEqual([]);
  });

  it('counts a page as rotated against its own rotation, not against zero', async () => {
    const h = harness();
    const input = await h.add('Scan.pdf', await rotatedPdf([0, 90, 180]));
    // Page 2 keeps its 90; page 3 goes from 180 to 0; page 1 goes to 270.
    const [out] = produced(await run('organise', [input], { pages: [page(0, 270), page(1, 90), page(2, 0)] } satisfies OrganiseParams, h.ctx));
    expect(out?.detail).toBe('Same 3 pages, 2 rotated');
    expect((await pdfInfo(await h.bytesOf(out!.file))).rotations).toEqual([270, 90, 0]);
  });

  it('says when nothing changed', async () => {
    const h = harness();
    const input = await h.add('Scan.pdf', await pagesPdf(2));
    const [out] = produced(await run('organise', [input], { pages: [page(0), page(1)] } satisfies OrganiseParams, h.ctx));
    expect(out?.detail).toBe('Same 2 pages, nothing changed');
  });

  it('refuses an empty list and an index outside the document', async () => {
    const h = harness();
    const input = await h.add('Scan.pdf', await pagesPdf(2));
    expect(await run('organise', [input], { pages: [] } satisfies OrganiseParams, h.ctx)).toEqual([
      { kind: 'failed', inputIds: [input.id], reason: 'Keep at least one page.' },
    ]);
    const outside = await run('organise', [input], { pages: [page(0), page(5)] } satisfies OrganiseParams, h.ctx);
    expect(outside[0]?.kind).toBe('failed');
    expect(outside[0]?.kind === 'failed' && outside[0].reason).toBe("Page 6 isn't in this document, which has 2 pages. Start over and try again.");
    expect(await h.names()).toEqual(['Scan.pdf']);
  });

  it('reports an unreadable input and a wrong password with their codes', async () => {
    const h = harness();
    const bad = await h.add('Bad.pdf', notAPdf());
    expect(failures(await run('organise', [bad], { pages: [page(0)] } satisfies OrganiseParams, h.ctx))[0]).toMatchObject({ inputIds: [bad.id], code: 'not-a-pdf' });
    const locked = await h.add('Locked.pdf', await encryptedPdf('right'));
    const ctx: OpContext = { ...h.ctx, passwords: new Map([[locked.id, 'wrong']]) };
    expect(failures(await run('organise', [locked], { pages: [page(0)] } satisfies OrganiseParams, ctx))[0]?.code).toBe('wrong-password');
  });
});

describe('helpers', () => {
  it('baseName strips only a trailing .pdf, in any case', () => {
    expect(baseName('Lease.pdf')).toBe('Lease');
    expect(baseName('Lease.PDF')).toBe('Lease');
    expect(baseName('report.pdf.pdf')).toBe('report.pdf');
    expect(baseName('notes')).toBe('notes');
    expect(baseName('.pdf')).toBe('Document');
  });

  it('ordinal reads the way people say it', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      'first', 'second', 'third', 'fourth', 'tenth', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });

  it('getOp throws a plain Error for a tool with no Op (Read)', () => {
    expect(() => getOp('read')).toThrow(Error);
    expect(() => getOp('read')).toThrow("Read isn't ready yet.");
  });
});
