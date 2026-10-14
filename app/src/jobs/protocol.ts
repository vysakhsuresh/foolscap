/**
 * What crosses between the page and the op worker. Plain data, Blobs and
 * MessagePorts only: FoolscapFiles, params, outcomes. Document bytes never
 * ride in these messages (a picture of one page to read is the one exception) — on OPFS both sides share the store, on memory the
 * worker's Workspace fetches Blobs over its own port.
 */
import type { FoolscapFile } from '../files/types';
import type { Arity, OcrWord, Outcome, Progress } from '../ops/op';
import type { ToolId } from '../ops/tools';
import { PdfError, type PdfErrorCode } from '../pdf/types';

export type ToWorker =
  | {
      readonly type: 'init';
      readonly backend: 'opfs' | 'memory';
      readonly port?: MessagePort;
      /** Load pdf.js in the worker before answering, so a tool that draws pages works offline from the start. */
      readonly engine?: boolean;
      /** Load the OCR engine and English model too, for the same reason. */
      readonly ocr?: boolean;
    }
  | {
      readonly type: 'run';
      readonly jobId: string;
      readonly tool: ToolId;
      readonly inputs: readonly FoolscapFile[];
      readonly params: unknown;
      /** Entries of the RunOptions map; a Map would clone, but a list is plainer to inspect. */
      readonly passwords: ReadonlyArray<readonly [string, string]>;
    }
  | { readonly type: 'cancel'; readonly jobId: string }
  /**
   * Read the words in a picture of a page (Edit text on a scan). The one
   * message that carries pixels: the page drew the picture, the worker holds
   * the reader, and only the words come back.
   */
  | { readonly type: 'read'; readonly readId: string; readonly png: Uint8Array; readonly width: number; readonly height: number };

export type FromWorker =
  | { readonly type: 'inited' }
  | { readonly type: 'progress'; readonly jobId: string; readonly progress: Progress }
  /** Posted as each output is finalised, so a cancel can remove what was already written. */
  | { readonly type: 'produced'; readonly jobId: string; readonly file: FoolscapFile }
  | { readonly type: 'done'; readonly jobId: string; readonly outcomes: Outcome[] }
  | { readonly type: 'failed'; readonly jobId: string; readonly reason: string; readonly code?: PdfErrorCode }
  | { readonly type: 'cancelled'; readonly jobId: string }
  | { readonly type: 'read-done'; readonly readId: string; readonly words: OcrWord[] }
  | { readonly type: 'read-failed'; readonly readId: string };

/** Null when `count` inputs fit `arity`; otherwise what to tell the user. */
export function arityProblem(arity: Arity, title: string, count: number): string | null {
  if (arity.kind === 'none') return count === 0 ? null : `${title} makes a new file; it does not take any.`;
  if (count === 0 && (arity.kind !== 'together' || arity.min <= 1)) return 'Pick a file first.';
  switch (arity.kind) {
    case 'each':
      return null;
    case 'one':
      return count === 1 ? null : `${title} works on one file at a time. Pick just one.`;
    case 'together': {
      if (count >= arity.min) return null;
      const more = arity.min - count;
      return `${title} needs at least ${arity.min} files. Add ${more} more.`;
    }
  }
}

export const TOO_LARGE = "This file is too big for this device's memory. Try splitting it first.";
export const WENT_WRONG = "Something went wrong while working on this file. Try again, or try a smaller file.";

/** Turns whatever an op threw into words for the user. Never a stack, never a name. */
export function failureFor(error: unknown): { reason: string; code?: PdfErrorCode } {
  if (error instanceof PdfError || (error instanceof Error && error.name === 'PdfError')) {
    const { message, code } = error as PdfError;
    return { reason: message, code };
  }
  if (error instanceof RangeError) return { reason: TOO_LARGE, code: 'too-large' };
  return { reason: WENT_WRONG };
}
