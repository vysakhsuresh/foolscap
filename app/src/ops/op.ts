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
import type { Anchor, PdfEngine, PdfErrorCode, PdfSurgeon } from '../pdf/types';
import type { ToolId } from './tools';

/**
 * How many inputs an op makes sense for. The JobRunner checks it before
 * posting: `one` needs exactly one input, `together` at least `min`, `each`
 * at least one. A run that fails the check throws `ArityError` synchronously
 * from `JobRunner.run` and never reaches the op. A batch of `one`-arity runs
 * is several jobs, one per input.
 */
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
 *
 * `total === 0` means indeterminate: the UI shows an active bar with `label`
 * and no fraction. Use it while `save()` runs; pdf-lib reports nothing during
 * a write. `label` never contains a file name ("Adding pages from the second
 * file", not the name).
 */
export interface Progress {
  readonly done: number;
  readonly total: number;
  readonly label: string;
}

/**
 * The result for one unit of work.
 *
 * Ids, not names: the UI owns the id→name map, so an Outcome can be logged or
 * persisted without carrying a name, and a `together` failure can name all
 * its inputs. `reason` is in the user's words because it is shown to them
 * directly: "page 4 could not be read" is actionable, a stack trace is not.
 */
export type Outcome =
  | {
      readonly kind: 'produced';
      readonly file: FoolscapFile;
      /**
       * What actually happened, in the user's terms: "12 pages from 3 files",
       * "4.2 MB to 1.1 MB", "Same 12 pages, 3 rotated". Required: several
       * tools produce a file that looks identical to the input, and without
       * this the screen says only that something was written, which reads as
       * nothing having been done.
       */
      readonly detail: string;
    }
  | {
      readonly kind: 'failed';
      readonly inputIds: readonly string[];
      readonly reason: string;
      /** Lets the UI tell "too big, split it first" from "not a PDF" without parsing prose. */
      readonly code?: PdfErrorCode;
    }
  | { readonly kind: 'skipped'; readonly inputIds: readonly string[]; readonly reason: string };

/** What an op is given to work with. Assembled once per job, inside the worker. */
export interface OpContext {
  readonly workspace: Workspace;
  /**
   * Lazy. The first call imports the pdf.js chunk into the worker. Merge,
   * split and organise never call it; only tools that rasterise (remove
   * areas, PDF to images, compress) do. Thumbnails and page counts for the
   * UI come from the page-thread engine, not from here.
   */
  engine(): Promise<PdfEngine>;
  readonly surgeon: PdfSurgeon;
  /**
   * Passwords the user typed for encrypted inputs, by file id. In memory only.
   * Never persisted, never logged, gone when the job ends.
   */
  readonly passwords: ReadonlyMap<string, string>;
  /**
   * Aborted when the user cancels. Check it at every file boundary and every
   * few dozen pages. `appendPages` and `save` cannot be interrupted from
   * inside pdf-lib; the runner's terminate is the real cancel, this is the
   * polite one.
   */
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
   * Writes every output through `ctx.workspace.put` and never modifies or
   * removes an input: inputs outlive the job, which is what "Then…" relies
   * on. Output names never equal an input's name.
   *
   * Outcomes: for `each`, one per input at the input's index; for `one` and
   * `together`, in output order (page order for split), and a failure is the
   * single outcome of the run. A failure for one file in an `each` batch is
   * reported as a `failed` outcome rather than thrown, so one unreadable
   * document in forty does not discard the other thirty-nine. `together`
   * means one outcome for the set, not every input resident at once: open
   * one input, append, close it, move on.
   *
   * Throws `OpCancelled` if `ctx.signal` aborted - the one case where
   * unwinding the whole run is right.
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

/** Thrown synchronously by `JobRunner.run` when the inputs do not fit the tool's arity. */
export class ArityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArityError';
  }
}

/** Call at each natural checkpoint. */
export function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new OpCancelled();
}

// ---- Params for the stage-1 tools. Plain data: these cross postMessage. ----

export interface MergeParams {
  /** Output file name, without extension. Defaults to "<first input> + N more". */
  readonly name?: string;
}

export type SplitParams =
  /** Every N pages: a 10-page document every 3 gives 3, 3, 3, 1. `every` is an integer ≥ 1, else `failed`. */
  | { readonly mode: 'every'; readonly every: number }
  /** Each page its own file. */
  | { readonly mode: 'single' }
  /** One output per range, in the order typed: "1-3, 7, 12-". Empty → `failed` with how to type it. */
  | { readonly mode: 'ranges'; readonly ranges: string };

export interface OrganiseParams {
  /**
   * The finished document, page by page: which source page sits where, and
   * its rotation. A source page absent from the list is deleted; one present
   * twice is duplicated. Order here is output order.
   *
   * `rotation` is ABSOLUTE: the /Rotate the output page carries, already
   * including the source page's own rotation. The UI adds its quarter-turns
   * to `PageInfo.rotation` modulo 360 before building this list; the op
   * replaces, never adds.
   */
  readonly pages: ReadonlyArray<{ readonly source: number; readonly rotation: import('../pdf/types').Rotation }>;
}

/** Paper sizes, by name. Points are in pages-ops.ts. */
export type Paper = 'a4' | 'letter';

export interface ExtractPagesParams {
  /** One-based, as typed: "1-3, 7, 12-". */
  readonly pages: string;
  /** Keep the pages typed, or keep everything else. */
  readonly mode: 'keep' | 'remove';
}

export interface InsertPagesParams {
  /** Insert after this one-based page; 0 puts them before the first page. Clipped to the document. */
  readonly after: number;
  /** The other files picked, in order, or blank pages the size of the neighbouring page. */
  readonly what: 'files' | 'blank';
  readonly blankCount: number;
}

export type CropParams =
  /** Trim the same margin, in millimetres, from every edge of every page. */
  | { readonly mode: 'trim'; readonly mm: number }
  /** Put every page on one paper size, scaled to fit, turned to match. */
  | { readonly mode: 'paper'; readonly paper: Paper };

export interface SplitBySizeParams {
  /** The most each part may weigh, in megabytes (1 MB = 1,000,000 bytes, as mail limits count). */
  readonly megabytes: number;
}

export interface ImagesToPdfParams {
  readonly paper: 'fit' | Paper;
  readonly margin: 'none' | 'small' | 'large';
}

export interface NUpParams {
  readonly perSheet: 2 | 4;
  readonly paper: Paper;
}

export interface WatermarkParams {
  readonly text: string;
  readonly strength: 'light' | 'medium' | 'strong';
  readonly layout: 'once' | 'tiled';
}

export interface PageNumbersParams {
  readonly position: Exclude<Anchor, 'center'>;
  readonly format: 'n' | 'n-of-total' | 'page-n' | 'page-n-of-total';
  /** The number the first numbered page gets. */
  readonly start: number;
  /** Leave the first page (a cover) unnumbered. */
  readonly skipFirst: boolean;
}

export interface HeaderFooterParams {
  /** Either may be empty, not both. {page}, {total}, {date} and {name} are filled in. */
  readonly header: string;
  readonly footer: string;
  readonly align: 'left' | 'center' | 'right';
}

export interface AddPasswordParams {
  readonly password: string;
  readonly allowPrinting: boolean;
  readonly allowCopying: boolean;
}

export type DocumentDetailsParams =
  | { readonly mode: 'strip' }
  | {
      readonly mode: 'edit';
      readonly title: string;
      readonly author: string;
      readonly subject: string;
      readonly keywords: string;
    };

/** Tools that take no settings. */
export type NoParams = Record<string, never>;
