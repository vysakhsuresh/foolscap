/**
 * The file layer. Read this before touching anything that holds bytes.
 *
 * Foolscap never writes to the file you picked. Not for a quick rotate, not
 * ever. The rule is structural rather than a convention somebody has to
 * remember: `DocumentStore.import` takes a `File` and hands back a
 * `FoolscapFile` that lives in the Workspace. Every op takes a `FoolscapFile`,
 * so an op can only ever reach the Workspace. The only component that may
 * hand bytes back to the user is `Exporter`, and it only writes to a
 * destination the user just chose in a save dialog, as a NEW file, or
 * triggers a download.
 *
 * A `File` from an input or a drop carries no write handle, which is what
 * makes the first half of this true for free. Keep it that way: nobody calls
 * `showOpenFilePicker`, `DataTransferItem.getAsFileSystemHandle`,
 * `webkitGetAsEntry` or `launchQueue`, because each hands over a handle that
 * CAN be written to. (A later PWA file handler reads `handle.getFile()` once,
 * inside this package, and drops the handle.) `fs-access.d.ts` beside this
 * file declares the pickers we use and deliberately not the ones we don't.
 */
import type { ToolId } from '../ops/tools';

/** Where a file came from. `derived` carries the ids it was made from. */
export type Origin =
  | { readonly kind: 'picked' }
  | { readonly kind: 'derived'; readonly tool: ToolId; readonly from: readonly string[] };

/** 'other' is any file at all: something to attach inside a PDF, or that came out of one. */
export type FileKind = 'pdf' | 'image' | 'text' | 'other';

/**
 * A document inside Foolscap. Plain data: it crosses postMessage to the
 * worker and back, so nothing here may be a class instance, a Blob, or a
 * function. The bytes live in the Workspace under `id`.
 */
export interface FoolscapFile {
  readonly id: string;
  /** Display name, with its extension: "Lease agreement.pdf". Never logged. */
  readonly name: string;
  /** Bytes. */
  readonly size: number;
  readonly kind: FileKind;
  readonly origin: Origin;
}

/**
 * Scratch space for everything the app holds: imported documents and tool
 * output. Two backends, and code that uses a Workspace must work identically
 * on both:
 *
 * `opfs` — the Origin Private File System. Reads happen anywhere through
 * `getFile()`, which is lazy. Writes happen ONLY inside a worker, through
 * `FileSystemFileHandle.createSyncAccessHandle()` — Safari before 26 has no
 * `createWritable()` — so the page-side Workspace forwards its writes to a
 * small long-lived storage worker, and the op worker writes its own outputs
 * directly. `backend` is `'opfs'` only after a start-up probe (getDirectory,
 * write one byte through a sync handle in the worker, delete it) succeeded;
 * any throw, including private browsing, means `'memory'`. Probe, do not
 * sniff.
 *
 * `memory` — the page's Workspace is the only store and mints every id; the
 * worker's Workspace is a proxy to it over a MessagePort. It stores Blob and
 * File objects by reference, never Uint8Arrays (a Uint8Array is wrapped in
 * `new Blob([data])` and the array dropped). Blobs are posted to the worker
 * beside their FoolscapFiles — structured clone shares a Blob's backing
 * store, the page keeps its copy, nothing is detached — and the worker posts
 * each output back as a Blob for the page to store under an id it hands out.
 * ArrayBuffers are never transferred across threads.
 *
 * On either backend a picked `File` MAY be kept by reference: it carries no
 * write path. `read()` of such a file can reject if the original changed on
 * disk since it was picked, and an op reports that as a `failed` outcome.
 *
 * `put()` is atomic: a file is visible to `list()` and `read()` only once
 * fully written (write under a temporary name, then finalise; sweep
 * unfinalised files at start-up), so a cancelled or crashed job never leaves
 * half a document that looks like the user's. Sync access handles are
 * exclusive: the worker closes them before a job returns, or the page's
 * `read()` fails.
 *
 * Files here are the user's documents. They are removed only by `remove()`,
 * `clear()` and `clearExcept()`, never on a timer. The page clears the
 * workspace on load except for a pending "Then…" handoff: nothing stays
 * behind.
 */
export interface Workspace {
  readonly backend: 'opfs' | 'memory';
  /** Resolves when the backend has been probed and the store is usable. */
  readonly ready: Promise<void>;
  put(name: string, data: Blob | Uint8Array, kind: FileKind, origin: Origin): Promise<FoolscapFile>;
  /** Lazy on OPFS: reading a Blob does not load the bytes until asked. */
  read(file: FoolscapFile): Promise<Blob>;
  remove(file: FoolscapFile): Promise<void>;
  list(): Promise<FoolscapFile[]>;
  clear(): Promise<void>;
  /** Removes everything except `ids`. Used on page load to keep a handoff and drop the rest. */
  clearExcept(ids: readonly string[]): Promise<void>;
}

export type ImportResult =
  | { readonly ok: true; readonly file: FoolscapFile }
  | { readonly ok: false; readonly name: string; readonly reason: string };

/** The only way a document enters Foolscap. */
export interface DocumentStore {
  /**
   * Takes each File into the Workspace. Sniffs for a PDF header in the first
   * 1024 bytes and rejects the rest with a plain reason. One unreadable file
   * is reported in its own result rather than thrown, so dropping forty
   * files with one bad one still imports thirty-nine. Results are in input
   * order.
   */
  import(files: Iterable<File>): Promise<ImportResult[]>;
}

export type SaveOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'downloaded' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: string };

export type ShareOutcome =
  | { readonly kind: 'shared' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'failed'; readonly reason: string };

/**
 * The only component permitted to hand bytes back to the user. It writes to a
 * destination from `showSaveFilePicker` / `showDirectoryPicker` where the
 * browser has them, and falls back to an `<a download>` with a blob URL.
 * Several files go to a chosen folder, or into one ZIP when no folder can be
 * chosen.
 *
 * The Exporter never replaces an existing file. In a chosen folder it calls
 * `getFileHandle(name)` WITHOUT `create` first; if that resolves it picks
 * "name (2).pdf", "name (3).pdf"… before creating, and never opens an
 * existing entry for writing. Every output is a new file: ops name outputs
 * so that no output name ever equals an input's name.
 *
 * Nothing else in the codebase may call `showSaveFilePicker`,
 * `showDirectoryPicker`, `navigator.share`, `navigator.canShare`,
 * `URL.createObjectURL`, or set a `download` attribute. A test enforces this.
 */
export interface Exporter {
  save(file: FoolscapFile): Promise<SaveOutcome>;
  saveAll(files: readonly FoolscapFile[], zipName: string): Promise<SaveOutcome>;
  canShare(files: readonly FoolscapFile[]): Promise<boolean>;
  /** Web Share with files: on Android this puts the PDF straight into WhatsApp. */
  share(files: readonly FoolscapFile[]): Promise<ShareOutcome>;
}
