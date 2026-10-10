/**
 * Running an op without freezing the page.
 *
 * Every op runs inside a dedicated Web Worker. The page sends FoolscapFiles
 * and params; the worker reads the bytes from the Workspace, runs the Op, and
 * writes the outputs back to the Workspace; the page gets FoolscapFiles for
 * the outputs. Bytes cross postMessage only on the memory backend, where the
 * two sides cannot share storage, and then as transferred ArrayBuffers, not
 * copies.
 *
 * A job survives the user scrolling, typing and switching tabs. It does not
 * survive a reload; on the web that is the honest limit, and the UI says so
 * while a job is running.
 */
import type { FoolscapFile } from '../files/types';
import type { Outcome, Progress } from '../ops/op';
import type { ToolId } from '../ops/tools';

export interface JobHandle {
  readonly id: string;
  /** Resolves with the outcomes; rejects only on cancel or a worker crash. */
  readonly done: Promise<Outcome[]>;
  cancel(): void;
}

export interface RunOptions {
  readonly onProgress?: (p: Progress) => void;
  /** By input file id. Forwarded to the op, never stored. */
  readonly passwords?: ReadonlyMap<string, string>;
}

export interface JobRunner {
  run<P>(tool: ToolId, inputs: readonly FoolscapFile[], params: P, opts?: RunOptions): JobHandle;
}
