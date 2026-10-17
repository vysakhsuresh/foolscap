import { describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files';
import { createJobPool, poolSize, splitRuns } from '../../app/src/jobs/pool';
import type { JobHandle, JobRunner } from '../../app/src/jobs/types';
import type { ToolId } from '../../app/src/ops/tools';

describe('sharing a batch between workers', () => {
  it('keeps the order, uses every file once, and gives each run about the same bytes', () => {
    const sizes = [5, 1, 1, 1, 1, 1, 5, 5, 1, 1];
    const runs = splitRuns(sizes, 3);
    expect(runs.flat()).toEqual(sizes.map((_, i) => i));
    expect(runs).toHaveLength(3);
    for (const run of runs) expect(run.length).toBeGreaterThan(0);
    const totals = runs.map((r) => r.reduce((a, i) => a + (sizes[i] ?? 0), 0));
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(6);
  });

  it('never makes more runs than files, and one file is one run', () => {
    expect(splitRuns([10, 10], 4)).toEqual([[0], [1]]);
    expect(splitRuns([3], 4)).toEqual([[0]]);
    expect(splitRuns([], 4)).toEqual([]);
    // A giant first file does not leave the others with nothing to share.
    const runs = splitRuns([1000, 1, 1, 1], 3);
    expect(runs).toHaveLength(3);
    expect(runs.flat()).toEqual([0, 1, 2, 3]);
  });

  it('spares a core for the page, takes no more than four, and fewer on a phone short of memory', () => {
    expect(poolSize(8, 8)).toBe(4);
    expect(poolSize(8, 4)).toBe(2);
    expect(poolSize(2, 8)).toBe(1);
    expect(poolSize(1, 1)).toBe(1);
    expect(poolSize(4, 16)).toBe(3);
  });

  it('splits a tool that treats each file alone, and never one whose batch is one job', async () => {
    const calls: { runner: number; tool: ToolId; files: number }[] = [];
    const fake = (n: number): JobRunner => ({
      ready: Promise.resolve(),
      read: async () => [],
      run: (tool, inputs) => {
        calls.push({ runner: n, tool, files: inputs.length });
        return { id: `${n}`, done: Promise.resolve(inputs.map((f) => ({ kind: 'skipped' as const, inputIds: [f.id], reason: '' }))), cancel: () => undefined } as unknown as JobHandle;
      },
    });
    let made = 0;
    const pool = createJobPool(fake(0), () => fake(++made), 3);
    const files = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, name: `${i}.pdf`, size: 100, kind: 'pdf' }) as unknown as FoolscapFile);
    for (const tool of ['page-numbers', 'document-details'] as const) {
      calls.length = 0;
      await pool.run(tool, files, {}).done;
      expect(calls, tool).toEqual([{ runner: 0, tool, files: 6 }]);
    }
    calls.length = 0;
    const out = await pool.run('compress', files, {}).done;
    expect(calls.length).toBe(3);
    expect(out.map((o) => (o.kind === 'skipped' ? o.inputIds[0] : ''))).toEqual(files.map((f) => f.id));
  });
});
