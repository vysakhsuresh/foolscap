/**
 * Running an op without freezing the page.
 *
 * Every op runs inside a dedicated module Worker. The page sends FoolscapFiles
 * and params; the worker reads the bytes from the Workspace, runs the Op, and
 * writes the outputs back; the page gets FoolscapFiles for the outputs. On the
 * OPFS backend both sides share the store and no bytes cross postMessage; on
 * the memory backend Blobs are posted by reference (see files/types.ts).
 *
 * Lifecycle. `createJobRunner()` creates the worker at page load, never on
 * first use, so a page that reports itself ready can run a job with the
 * network gone; `ready` resolves once the worker has answered (and, for a
 * tool whose op draws pages, once pdf.js has loaded in it). One worker
 * serves the page's jobs in turn and drops every reference when a job ends
 * so pdf-lib's memory can be collected. `cancel()` aborts `ctx.signal` and,
 * if the op has not returned within ~500 ms, terminates the worker — pdf-lib
 * cannot be interrupted inside `appendPages` or `save`, so terminate is the
 * real cancel — then creates a fresh worker for the next job. Outputs the
 * cancelled job had already written are removed by the runner. A worker that
 * dies on its own (usually out of memory) rejects its job with `JobCrashed`
 * and is recreated the same way.
 *
 * A job does not survive a reload; on the web that is the honest limit, and
 * the UI says "Keep this tab open until it's done" while one runs.
 */
import type { FoolscapFile } from '../files/types';
import type { OcrWord, Outcome, Progress } from '../ops/op';
import type { ToolId } from '../ops/tools';

export interface JobHandle {
  readonly id: string;
  /**
   * Resolves with the outcomes. Rejects with `OpCancelled` on cancel,
   * `JobCrashed` when the worker died without answering, and `ArityError`
   * synchronously from `run()` when the inputs do not fit the tool.
   */
  readonly done: Promise<Outcome[]>;
  cancel(): void;
}

export interface RunOptions {
  readonly onProgress?: (p: Progress) => void;
  /** How many network requests the worker made while the job ran: shown as proof nothing went anywhere. */
  readonly onRequests?: (count: number) => void;
  /** By input file id. Forwarded to the op, never stored, never logged. */
  readonly passwords?: ReadonlyMap<string, string>;
}

export interface JobRunner {
  /** Resolves when the worker exists and has answered. Nothing is fetched after this. */
  readonly ready: Promise<void>;
  /** Checks `arity` before posting; throws `ArityError` if the inputs do not fit. */
  run<P>(tool: ToolId, inputs: readonly FoolscapFile[], params: P, opts?: RunOptions): JobHandle;
  /**
   * The words in a picture of a page, with where each sits (fractions of the
   * picture). The reader and its English model are fetched from this site the
   * first time, unless the tool already loaded them. Rejects when they cannot be had.
   */
  read(png: Uint8Array, width: number, height: number): Promise<OcrWord[]>;
}

/**
 * The worker died without answering — almost always the device ran out of
 * memory on a large document. The UI gives it the same words as a
 * `too-large` failure: "This file is too big for this device's memory. Try
 * splitting it first."
 */
export class JobCrashed extends Error {
  constructor() {
    super('The job stopped unexpectedly.');
    this.name = 'JobCrashed';
  }
}
