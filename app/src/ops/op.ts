/**
 * Every tool in Foolscap, expressed as one shape.
 *
 *     FoolscapFile[] -> Op -> FoolscapFile[]
 *
 * Plural on both sides from the first commit, and that is the most
 * consequential decision in this codebase. Merge is many-to-one, split is
 * one-to-many, compress is one-to-one, and a batch is the same operation
 * handed more inputs - so batch mode is not a feature to build later, it is
 * what the type already means. Chaining tools ("Then...") is function
 * composition rather than new machinery.
 *
 * The competition sells "process twenty files at once" as the paid tier. Here
 * it falls out of the signature. Resist any pull towards a convenient
 * `run(input: FoolscapFile): FoolscapFile` - one of those and the property is
 * gone.
 *
 * Ops run inside a Web Worker. Everything that crosses to them - inputs,
 * params, outcomes - is plain structured-clonable data.
 */
import type { FoolscapFile, Workspace } from '../files/types';
import type { PdfEngine, PdfSurgeon } from '../pdf/types';
import type { ToolId } from './tools';

export type Arity =
  /** Runs on each input independently. Compress, rotate, OCR. */
  | { readonly kind: 'each' }
  /** Needs at least `min` inputs, consumed together. Merge. */
  | { readonly kind: 'together'; readonly min: number }
  /** Exactly one input. Split, organise. */
  | { readonly kind: 'one' };

/**
 * How far along a job is. Counts pages rather than files wherever a file can
 * take a while: a bar that sits at "1 of 2" for ninety seconds tells the user
 * nothing about whether the page has hung.
 */
export interface Progress {
  readonly done: number;
  readonly total: number;
  readonly label: string;
}

/**
 * The result for one unit of work. `failed` carries a reason in the user's
 * words because it is shown to them directly: "page 4 could not be read" is
 * actionable, a stack trace is not.
 */
export type Outcome =
  | {
      readonly kind: 'produced';
      readonly file: FoolscapFile;
      /**
       * What actually happened, in the user's terms: "12 pages from 3 files",
       * "4.2 MB to 1.1 MB". Without it the screen says only that something
       * was written, which reads as nothing having been done.
       */
      readonly detail?: string;
    }
  | { readonly kind: 'failed'; readonly inputName: string; readonly reason: string }
  | { readonly kind: 'skipped'; readonly inputName: string; readonly reason: string };

/** What an op is given to work with. Assembled once per job, inside the worker. */
export interface OpContext {
  readonly workspace: Workspace;
  readonly engine: PdfEngine;
  readonly surgeon: PdfSurgeon;
  /**
   * Passwords the user typed for encrypted inputs, by file id. In memory only.
   * Never persisted, never logged, gone when the job ends.
   */
  readonly passwords: ReadonlyMap<string, string>;
  /** Aborted when the user cancels. Check it at every page boundary. */
  readonly signal: AbortSignal;
  progress(p: Progress): void;
}

export interface Op<P = unknown> {
  readonly tool: ToolId;
  readonly arity: Arity;
  /** What this run is called, including its settings: "Split every 3 pages". */
  title(params: P): string;
  /**
   * Runs the operation.
   *
   * Writes every output through `ctx.workspace` and never modifies an input.
   * Returns one Outcome per logical unit of work, in input order. A failure
   * for one file is reported as a `failed` outcome rather than thrown, so one
   * unreadable document in a batch of forty does not discard the other
   * thirty-nine. Throws `OpCancelled` if `ctx.signal` aborted - the one case
   * where unwinding the whole run is right.
   */
  run(inputs: readonly FoolscapFile[], params: P, ctx: OpContext): Promise<Outcome[]>;
}

/** Thrown out of `Op.run` when the user cancelled. Not an error; nothing is reported for it. */
export class OpCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'OpCancelled';
  }
}

/** Call at each natural checkpoint. */
export function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new OpCancelled();
}

// ---- Params for the stage-1 tools. Plain data: these cross postMessage. ----

export interface MergeParams {
  /** Output file name, without extension. Defaults to a name built from the inputs. */
  readonly name?: string;
}

export type SplitParams =
  /** Every N pages: a 10-page document every 3 gives 3, 3, 3, 1. */
  | { readonly mode: 'every'; readonly every: number }
  /** Each page its own file. */
  | { readonly mode: 'single' }
  /** One output per range, as typed: "1-3, 7, 12-". */
  | { readonly mode: 'ranges'; readonly ranges: string };

export interface OrganiseParams {
  /**
   * The finished document, page by page: which source page sits where, and
   * how it is rotated. A source page absent from the list is deleted; one
   * present twice is duplicated. Order here is output order.
   */
  readonly pages: ReadonlyArray<{ readonly source: number; readonly rotation: import('../pdf/types').Rotation }>;
}
