/**
 * Several op workers sharing one batch. A tool that works on each file on its
 * own (compress, number pages, make searchable…) given a pile of files splits
 * it into one run per worker, so a phone with four cores does four files at
 * once rather than one after another.
 *
 * The first worker is the page's own, made at load (the offline proof needs
 * it); the others are made the first time a batch is big enough to share, by
 * then every script they need is already on the device. How many: one fewer
 * than the cores, never more than four, and fewer on a phone short of memory.
 * The files are cut into runs that keep their order and hold about the same
 * number of bytes each, and the outcomes come back in the order they went in.
 */
import type { FoolscapFile } from '../files/types';
import { opMeta } from '../ops/meta';
import type { Outcome, Progress } from '../ops/op';
import type { ToolId } from '../ops/tools';
import type { JobHandle, JobRunner, RunOptions } from './types';

export interface JobPool {
  /** How many workers a batch may use on this device. */
  readonly size: number;
  run<P>(tool: ToolId, inputs: readonly FoolscapFile[], params: P, opts?: RunOptions): JobHandle;
}

/** Workers this device can spare: a core for the page, half a GB of memory or so for each. */
export function poolSize(cores = navigator.hardwareConcurrency || 2, memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4): number {
  return Math.max(1, Math.min(4, cores - 1, Math.floor(memory / 2)));
}

/**
 * Cuts `sizes` into at most `parts` runs that keep their order, each holding
 * about the same total: the start of each run, by index.
 */
export function splitRuns(sizes: readonly number[], parts: number): number[][] {
  const n = sizes.length;
  const k = Math.max(1, Math.min(parts, n));
  const weights = sizes.map((s) => Math.max(1, s));
  const total = weights.reduce((a, b) => a + b, 0);
  const runs: number[][] = [[]];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const current = runs[runs.length - 1] ?? [];
    current.push(i);
    sum += weights[i] ?? 1;
    const closed = runs.length;
    const filesLeft = n - i - 1;
    const runsLeft = k - closed;
    // Close this run once the batch so far holds its share of the bytes, or when the
    // files left are only just enough to give each run still to come one of its own.
    if (runsLeft > 0 && filesLeft > 0 && (sum >= (total * closed) / k || filesLeft === runsLeft)) runs.push([]);
  }
  return runs.filter((r) => r.length > 0);
}

export function createJobPool(first: JobRunner, make: () => JobRunner, size = poolSize()): JobPool {
  const runners: JobRunner[] = [first];
  const runner = (k: number): JobRunner => {
    while (runners.length <= k) runners.push(make());
    return runners[k] ?? first;
  };
  return {
    size,
    run<P>(tool: ToolId, inputs: readonly FoolscapFile[], params: P, opts?: RunOptions): JobHandle {
      // Only a tool that treats each file on its own, whatever else is in the batch, can share it.
      const meta = opMeta(tool);
      if (size <= 1 || inputs.length < 2 || meta.arity.kind !== 'each' || meta.whole === true) return first.run(tool, inputs, params, opts);
      const runs = splitRuns(
        inputs.map((f) => f.size),
        size,
      ).map((indices) => indices.map((i) => inputs[i]).filter((f): f is FoolscapFile => f !== undefined));
      const shown: Progress[] = runs.map(() => ({ done: 0, total: 0, label: '' }));
      const report = () => {
        const done = shown.reduce((a, p) => a + p.done, 0);
        const total = shown.reduce((a, p) => a + p.total, 0);
        const label = shown.find((p) => p.label !== '' && p.done < p.total)?.label ?? shown.find((p) => p.label !== '')?.label ?? '';
        opts?.onProgress?.({ done, total, label });
      };
      const handles = runs.map((files, k) =>
        runner(k).run(tool, files, params, {
          ...(opts?.passwords ? { passwords: opts.passwords } : {}),
          ...(opts?.onRequests ? { onRequests: opts.onRequests } : {}),
          onProgress: (p) => {
            shown[k] = p;
            report();
          },
        }),
      );
      const done = Promise.allSettled(handles.map((h) => h.done)).then((settled): Outcome[] => {
        const rejected = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
        // A cancel or a crash in any run is the batch's: it is reported as the run alone would have.
        if (rejected) throw rejected.reason;
        return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
      });
      return {
        id: handles[0]?.id ?? crypto.randomUUID(),
        done,
        cancel: () => {
          for (const h of handles) h.cancel();
        },
      };
    },
  };
}
