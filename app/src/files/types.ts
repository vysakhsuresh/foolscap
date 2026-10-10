/**
 * The file layer. Read this before touching anything that holds bytes.
 *
 * Foolscap never writes to the file you picked. Not for a quick rotate, not
 * ever. The rule is structural rather than a convention somebody has to
 * remember: `DocumentStore.import` copies the picked File into the Workspace
 * and hands back a `FoolscapFile` pointing at the copy. Every op takes a
 * `FoolscapFile`, so an op can only ever reach the copy. The only component
 * that may hand bytes back to the user is `Exporter`, and it may only write to
 * a destination the user just chose in a save dialog, or trigger a download.
 *
 * On the web the picked file is handed to us as a `File` (from an input or a
 * drop), which carries no write handle at all. Keep it that way: never call
 * `showOpenFilePicker`, because the handle it returns CAN be written to, and
 * that is the one way this promise could be broken by accident.
 */
import type { ToolId } from '../ops/tools';

/** Where a file came from. `derived` carries the ids it was made from. */
export type Origin =
  | { readonly kind: 'picked' }
  | { readonly kind: 'derived'; readonly tool: ToolId; readonly from: readonly string[] };

export type FileKind = 'pdf' | 'image';

/**
 * A document inside Foolscap. Points at a copy in the Workspace, never at the
 * file the user picked. Plain data: it crosses postMessage to the worker and
 * back, so nothing here may be a class instance, a Blob, or a function.
 */
export interface FoolscapFile {
  readonly id: string;
  /** Display name, with its extension: "Lease agreement.pdf". */
  readonly name: string;
  /** Bytes. */
  readonly size: number;
  readonly kind: FileKind;
  readonly origin: Origin;
}

/**
 * Scratch space for everything the app holds: imported copies and tool
 * output. Backed by the Origin Private File System where the browser has it,
 * which both the page and the worker can read, and by memory where it does
 * not. Code that uses a Workspace must work identically on both backends.
 *
 * Files here are the user's documents. Evict only on `clear()` or `remove()`,
 * never on a timer the user cannot see.
 */
export interface Workspace {
  readonly backend: 'opfs' | 'memory';
  put(name: string, data: Blob | Uint8Array, kind: FileKind, origin: Origin): Promise<FoolscapFile>;
  /** Lazy on OPFS: reading a Blob does not load the bytes until asked. */
  read(file: FoolscapFile): Promise<Blob>;
  remove(file: FoolscapFile): Promise<void>;
  list(): Promise<FoolscapFile[]>;
  clear(): Promise<void>;
}

export type ImportResult =
  | { readonly ok: true; readonly file: FoolscapFile }
  | { readonly ok: false; readonly name: string; readonly reason: string };

/** The only way a document enters Foolscap. */
export interface DocumentStore {
  /**
   * Copies each File into the Workspace. One unreadable file is reported in
   * its own result rather than thrown, so dropping forty files with one bad
   * one still imports thirty-nine.
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
 * browser has them, and falls back to an `<a download>`. Several files go to
 * a chosen folder, or into one ZIP when no folder can be chosen.
 *
 * Nothing else in the codebase may call `showSaveFilePicker`,
 * `showDirectoryPicker`, `createWritable`, `navigator.share`, or create a
 * download link. A test enforces this.
 */
export interface Exporter {
  save(file: FoolscapFile): Promise<SaveOutcome>;
  saveAll(files: readonly FoolscapFile[], zipName: string): Promise<SaveOutcome>;
  canShare(files: readonly FoolscapFile[]): Promise<boolean>;
  /** Web Share with files: on Android this puts the PDF straight into WhatsApp. */
  share(files: readonly FoolscapFile[]): Promise<ShareOutcome>;
}
