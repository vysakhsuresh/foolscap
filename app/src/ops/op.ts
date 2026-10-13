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
import type { Anchor, Area, FormValues, Mark, PdfEngine, PdfErrorCode, PdfSurgeon } from '../pdf/types';
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
  | { readonly kind: 'one' }
  /** No input at all: the tool makes a new file from what is typed (templates). */
  | { readonly kind: 'none' };

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
/** A word Make searchable found: its text and box, in fractions of the picture, from the top-left. */
export interface OcrWord {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Reads the words in a picture (ocr/ocr.ts, in the op worker). */
export interface OcrReader {
  readonly ready: Promise<void>;
  read(png: Uint8Array, width: number, height: number): Promise<OcrWord[]>;
  close(): Promise<void>;
}

export interface OpContext {
  readonly workspace: Workspace;
  /**
   * Lazy. The first call imports the pdf.js chunk into the worker. Only
   * tools that draw or read pages call it (their op sets `engine: true`, so
   * the worker loads it at start). Thumbnails and page counts for the UI
   * come from the page-thread engine, not from here.
   */
  engine(): Promise<PdfEngine>;
  /** Lazy, like `engine`: the OCR reader, for an op that sets `ocr: true`. */
  ocr?(): Promise<OcrReader>;
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
  /**
   * True for ops that draw or read pages through `ctx.engine()`. The tool page
   * then has the worker load pdf.js at start, before it reports ready, so the
   * tool works with the network gone.
   */
  readonly engine?: true;
  /** True for Make searchable: the worker also loads the OCR engine and model at start. */
  readonly ocr?: true;
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
  | { readonly mode: 'ranges'; readonly ranges: string }
  /** One output per top-level bookmark (chapter), named after it. No bookmarks → `failed`. */
  | { readonly mode: 'bookmarks' };

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
  /** "3-4": take these pages out and put the new ones in their place. Empty or absent: insert after `after`. */
  readonly replace?: string;
}

/** Millimetres off each edge of a page as the reader sees it, whatever way round it is stored. */
export interface CropEdges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type CropParams = (
  /** Trim the same margin, in millimetres, from every edge; or, with `edges`, a margin of its own from each. */
  | { readonly mode: 'trim'; readonly mm: number; readonly edges?: CropEdges }
  /** Trim each page to just outside what is drawn on it: the white margins go. */
  | { readonly mode: 'auto' }
  /** Put every page on one paper size, scaled to fit, turned to match. `enlarge` false leaves smaller pages their real size. */
  | { readonly mode: 'paper'; readonly paper: Paper; readonly enlarge?: boolean }
) & {
  /** "1-3, 7"; empty or absent means every page. */
  readonly pages?: string;
};

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
  /** Once across the middle (diagonally, or straight across), or repeated all over. */
  readonly layout: 'once' | 'straight' | 'tiled';
  /** Grey unless asked: red for VOID or COPY, blue for a company name. */
  readonly color?: 'grey' | 'red' | 'blue';
  /** "1-3, 7"; empty or absent means every page. */
  readonly pages?: string;
}

export interface PageNumbersParams {
  readonly position: Exclude<Anchor, 'center'>;
  /** 'bates': legal numbering, prefix + zero-padded number, continuing across every file in the batch. */
  readonly format: 'n' | 'n-of-total' | 'page-n' | 'page-n-of-total' | 'bates';
  /** The number the first numbered page gets. */
  readonly start: number;
  /** Leave the first page (a cover) unnumbered. */
  readonly skipFirst: boolean;
  /** For 'bates': what comes before the number ("ACME-"), and how many digits it is padded to. */
  readonly prefix?: string;
  readonly digits?: number;
}

export interface HeaderFooterParams {
  /** Either may be empty, not both. {page}, {total}, {date} and {name} are filled in. */
  readonly header: string;
  readonly footer: string;
  /** Where the header sits along the top, and the footer too unless `footerAlign` says otherwise. */
  readonly align: 'left' | 'center' | 'right';
  readonly footerAlign?: 'left' | 'center' | 'right';
  /** Leave the first page (a cover) plain. */
  readonly skipFirst?: boolean;
}

export interface AddPasswordParams {
  /**
   * 'password' (the default): nobody opens it without the password.
   * 'restrict': it opens for anyone, and readers that honour the flags block
   * what is not allowed. `password` is ignored.
   */
  readonly mode?: 'password' | 'restrict';
  readonly password: string;
  readonly allowPrinting: boolean;
  readonly allowCopying: boolean;
  /** Changing pages, adding comments, putting pages in and out. Off unless asked. */
  readonly allowEditing?: boolean;
}

export type DocumentDetailsParams =
  | { readonly mode: 'strip' }
  /** Metadata and every script go; comments and attached files too when asked. */
  | { readonly mode: 'clean'; readonly comments: boolean; readonly attachments: boolean }
  | {
      readonly mode: 'edit';
      readonly title: string;
      readonly author: string;
      readonly subject: string;
      readonly keywords: string;
    };

/** Tools that take no settings. */
export interface CompressParams {
  /** A fixed strength, or 'target': as good as it can look while weighing at most `targetKb`. */
  readonly level: 'light' | 'balanced' | 'strong' | 'target';
  /** For 'target': the most the file may weigh, in kilobytes (1 KB = 1000 bytes, as upload forms count). */
  readonly targetKb?: number;
  /**
   * For 'target': when shrinking photos is not enough, turn the pages into
   * pictures too. The words stop being selectable, and the person is told.
   */
  readonly allowPictures?: boolean;
}

export interface PdfToImagesParams {
  readonly format: 'png' | 'jpeg';
  /** Pixels per inch: 72 for a screen, 150 for sharing, 300 for print. */
  readonly dpi: 72 | 150 | 300;
  /** "1-3, 7"; empty means every page. */
  readonly pages: string;
}

/** Sign, Add text and Mark up: what to draw, where. */
export interface MarksParams {
  readonly marks: readonly Mark[];
}

export interface EditImagesParams {
  /** Each change, found by where the picture is drawn (area.page says which page). */
  readonly edits: readonly import('../pdf/types').ImageEdit[];
}

export interface CreateFormParams {
  readonly fields: readonly import('../pdf/types').NewField[];
}

export interface RemoveAreasParams {
  readonly areas: readonly Area[];
}

export interface FillFormParams {
  readonly values: FormValues;
  /** Flatten the answers into the page so they can no longer be changed. */
  readonly seal: boolean;
  /** Every answer on the form, to save beside the PDF as a .json that fills the same form next time. */
  readonly answers?: FormValues;
}

export interface ScanParams {
  /** One per input photo, in order: where the sheet is in it, and how far to turn it. */
  readonly pages: ReadonlyArray<{ readonly corners: readonly number[]; readonly turn: 0 | 90 | 180 | 270 }>;
  readonly look: 'colour' | 'grey' | 'bw';
  readonly paper: 'a4' | 'letter' | 'fit';
}

export interface BackgroundParams {
  /** "#rrggbb". */
  readonly color: string;
  /** "1-3, 7"; empty means every page. */
  readonly pages: string;
}

export type PageLabelsParams =
  | { readonly mode: 'remove' }
  | {
      readonly mode: 'set';
      /** How many pages at the front are numbered i, ii, iii (a cover, contents). 0 for none. */
      readonly front: number;
      /** What the main numbers start at, and what comes before them ("A-"). */
      readonly start: number;
      readonly prefix: string;
      /** How the front pages are numbered: i, ii, iii (the default) or I, II, III. */
      readonly frontStyle?: 'roman' | 'Roman';
      /** How the rest are numbered: 1, 2, 3 (the default), I, II, III, i, ii, iii, A, B, C or a, b, c. */
      readonly style?: 'decimal' | 'Roman' | 'roman' | 'Alpha' | 'alpha';
    };

export interface AttachmentsParams {
  /** 'attach': the first file is the PDF, every other file goes inside it. 'extract': take out what each PDF carries. */
  readonly mode: 'attach' | 'extract';
}

export interface BookmarksParams {
  /** The whole new list; empty takes every bookmark out. Pages are zero-based. */
  readonly items: readonly import('../pdf/types').OutlineItem[];
}

export interface PdfToWordParams {
  /** Read the words in scanned pages too (slower; the text reader is fetched from this site once). */
  readonly scans: boolean;
}

export interface PdfToEpubParams extends PdfToWordParams {
  readonly format: 'epub' | 'html';
}

export interface RentReceiptsParams {
  readonly tenant: string;
  readonly landlord: string;
  readonly address: string;
  /** Monthly rent in rupees. */
  readonly rent: number;
  /** The first month, "2026-04". */
  readonly start: string;
  readonly months: number;
  readonly mode: 'Cash' | 'Bank transfer' | 'UPI' | 'Cheque';
  /** The owner's PAN, which employers ask for when the rent is over Rs. 1 lakh a year. */
  readonly pan: string;
}

export interface DigitalSignParams {
  /** The .pfx / .p12 file's bytes. Never stored; gone when the run ends. */
  readonly certificate: Uint8Array;
  readonly password: string;
  /** Show a signature box at the foot of a page, or sign invisibly. */
  readonly visible: boolean;
  /** The page the box goes on; the last when not said. */
  readonly page?: 'first' | 'last';
  readonly reason: string;
  /** Where it was signed, for the reader's signature panel. */
  readonly location?: string;
}

export type NoParams = Record<string, never>;
