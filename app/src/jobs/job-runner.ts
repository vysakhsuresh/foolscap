/**
 * The page side of running an op. See types.ts for the lifecycle; the
 * mechanics here are a queue, one worker at a time, and the two ways a
 * worker goes away: our terminate after a cancel the op did not answer, and a
 * death of its own. Either way the next job gets a fresh worker.
 */
import { serveWorkspace } from '../files/workspace-protocol';
import type { FoolscapFile, Workspace } from '../files/types';
import { getOp } from '../ops';
import { ArityError, OpCancelled, type Outcome, type Progress } from '../ops/op';
import { toolById, type ToolId } from '../ops/tools';
import { arityProblem, type FromWorker, type ToWorker } from './protocol';
import { JobCrashed, type JobHandle, type JobRunner, type RunOptions } from './types';

/** How long the op gets to notice `signal` before the worker is terminated. */
const CANCEL_GRACE_MS = 500;
/** Workers that die before ever answering are not retried forever. */
const MAX_UNANSWERED_CRASHES = 3;

interface Job {
  readonly id: string;
  readonly tool: ToolId;
  readonly inputs: readonly FoolscapFile[];
  readonly params: unknown;
  readonly passwords: ReadonlyArray<readonly [string, string]>;
  readonly onProgress: ((p: Progress) => void) | undefined;
  readonly resolve: (outcomes: Outcome[]) => void;
  readonly reject: (error: Error) => void;
  readonly produced: FoolscapFile[];
  posted: boolean;
  cancelled: boolean;
}

export function createJobRunner(ws: Workspace, opts: { readonly engine?: boolean; readonly ocr?: boolean } = {}): JobRunner {
  const engine = opts.engine === true;
  const ocr = opts.ocr === true;
  const queue: Job[] = [];
  let running: Job | null = null;
  let worker: Worker | null = null;
  let inited: Promise<void> = Promise.resolve();
  let port: MessagePort | null = null;
  let cancelTimer: ReturnType<typeof setTimeout> | null = null;
  let unansweredCrashes = 0;
  let broken = false;

  let settleReady: { resolve: () => void; reject: (error: Error) => void } | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    settleReady = { resolve, reject };
  });

  const post = (message: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(message, transfer);

  function spawn(): void {
    const w = new Worker(new URL('./op.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    inited = new Promise<void>((resolve) => {
      w.addEventListener('message', (ev: MessageEvent) => {
        if (w !== worker) return;
        const message = ev.data as FromWorker;
        if (message.type === 'inited') {
          unansweredCrashes = 0;
          settleReady?.resolve();
          settleReady = null;
          resolve();
        } else {
          onMessage(message);
        }
      });
    });
    w.addEventListener('error', () => crashed(w));
    w.addEventListener('messageerror', () => crashed(w));
    if (ws.backend === 'memory') {
      // The worker's Workspace is a client of ours; a fresh worker gets a fresh channel.
      port?.close();
      const channel = new MessageChannel();
      serveWorkspace(ws, channel.port1);
      port = channel.port1;
      w.postMessage({ type: 'init', backend: 'memory', port: channel.port2, engine, ocr } satisfies ToWorker, [channel.port2]);
    } else {
      w.postMessage({ type: 'init', backend: 'opfs', engine, ocr } satisfies ToWorker);
    }
  }

  function clearCancelTimer(): void {
    if (cancelTimer !== null) clearTimeout(cancelTimer);
    cancelTimer = null;
  }

  /** Outputs a job wrote before it was cancelled or died are not the user's: take them back out. */
  async function discard(job: Job): Promise<void> {
    await Promise.all(job.produced.map((file) => ws.remove(file).catch(() => undefined)));
  }

  function finish(job: Job, settle: () => void): void {
    clearCancelTimer();
    if (running === job) running = null;
    settle();
    pump();
  }

  function finishCancelled(job: Job): void {
    finish(job, () => {
      void discard(job).then(() => job.reject(new OpCancelled()));
    });
  }

  function onMessage(message: FromWorker): void {
    if (message.type === 'inited') return;
    const job = running;
    if (!job || job.id !== message.jobId) return;
    switch (message.type) {
      case 'progress':
        if (!job.cancelled) job.onProgress?.(message.progress);
        break;
      case 'produced':
        job.produced.push(message.file);
        break;
      case 'done':
        if (job.cancelled) finishCancelled(job);
        else finish(job, () => job.resolve(message.outcomes));
        break;
      case 'failed': {
        // The op threw instead of reporting: that is one failed outcome for the set, never a lost batch.
        const outcome: Outcome = {
          kind: 'failed',
          inputIds: job.inputs.map((input) => input.id),
          reason: message.reason,
          ...(message.code === undefined ? {} : { code: message.code }),
        };
        if (job.cancelled) finishCancelled(job);
        else finish(job, () => job.resolve([outcome]));
        break;
      }
      case 'cancelled':
        finishCancelled(job);
        break;
    }
  }

  function replaceWorker(): void {
    worker?.terminate();
    worker = null;
    if (broken) return;
    spawn();
  }

  function crashed(w: Worker): void {
    if (w !== worker) return;
    const job = running;
    running = null;
    clearCancelTimer();
    if (!job) {
      unansweredCrashes += 1;
      if (unansweredCrashes >= MAX_UNANSWERED_CRASHES) {
        broken = true;
        settleReady?.reject(new JobCrashed());
        settleReady = null;
      }
    }
    replaceWorker();
    if (job) void discard(job).then(() => job.reject(new JobCrashed()));
    pump();
  }

  function pump(): void {
    if (running || queue.length === 0) return;
    const job = queue.shift();
    if (!job) return;
    running = job;
    if (broken) {
      running = null;
      job.reject(new JobCrashed());
      pump();
      return;
    }
    const w = worker;
    void inited.then(() => {
      if (running !== job || w !== worker || job.cancelled) return;
      job.posted = true;
      post({ type: 'run', jobId: job.id, tool: job.tool, inputs: job.inputs, params: job.params, passwords: job.passwords });
    });
  }

  function cancel(job: Job): void {
    if (job.cancelled) return;
    job.cancelled = true;
    const queued = queue.indexOf(job);
    if (queued !== -1) {
      queue.splice(queued, 1);
      job.reject(new OpCancelled());
      return;
    }
    if (running !== job) return;
    if (!job.posted) {
      finishCancelled(job);
      return;
    }
    post({ type: 'cancel', jobId: job.id });
    cancelTimer = setTimeout(() => {
      cancelTimer = null;
      if (running !== job) return;
      // The op did not come back: it is inside pdf-lib, and terminate is the only real cancel.
      replaceWorker();
      finishCancelled(job);
    }, CANCEL_GRACE_MS);
  }

  spawn();

  return {
    ready,
    run<P>(tool: ToolId, inputs: readonly FoolscapFile[], params: P, opts?: RunOptions): JobHandle {
      const problem = arityProblem(getOp(tool).arity, toolById(tool).title, inputs.length);
      if (problem !== null) throw new ArityError(problem);
      let resolve!: Job['resolve'];
      let reject!: Job['reject'];
      const done = new Promise<Outcome[]>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const job: Job = {
        id: crypto.randomUUID(),
        tool,
        inputs: [...inputs],
        params,
        passwords: opts?.passwords ? [...opts.passwords].map(([id, pw]) => [id, pw] as const) : [],
        onProgress: opts?.onProgress,
        resolve,
        reject,
        produced: [],
        posted: false,
        cancelled: false,
      };
      queue.push(job);
      pump();
      return { id: job.id, done, cancel: () => cancel(job) };
    },
  };
}
