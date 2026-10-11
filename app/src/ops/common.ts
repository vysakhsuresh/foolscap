/**
 * What the structural ops share: reading an input, naming an output, and
 * turning whatever went wrong into a `failed` outcome in the user's words.
 */
import type { FoolscapFile } from '../files/types';
import { PdfError } from '../pdf';
import type { OpContext, Outcome } from './op';
import { OpCancelled } from './op';

/** "Lease agreement.pdf" → "Lease agreement". Only a trailing .pdf comes off, whatever its case. */
export function baseName(name: string): string {
  const stripped = name.replace(/\.pdf$/i, '').trim();
  return stripped.length > 0 ? stripped : 'Document';
}

/**
 * The input's bytes, as a fresh array the surgeon may take ownership of. The
 * caller drops its reference once `open` has it (see PdfSurgeon.open).
 */
export async function readInput(ctx: OpContext, file: FoolscapFile): Promise<Uint8Array> {
  const blob = await ctx.workspace.read(file);
  return new Uint8Array(await blob.arrayBuffer());
}

/** The password the user typed for this input, in the shape `PdfSurgeon.open` takes. */
export function passwordFor(ctx: OpContext, input: FoolscapFile): { password?: string } {
  const password = ctx.passwords.get(input.id);
  return password === undefined ? {} : { password };
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** "the second file", never its name: progress labels are shown and may be logged. */
export function ordinal(position: number): string {
  const word = ORDINALS[position - 1];
  if (word !== undefined) return word;
  const tens = position % 100;
  const ones = tens >= 11 && tens <= 13 ? 0 : position % 10;
  const suffix = ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th';
  return `${position}${suffix}`;
}

export function tooLargeReason(byteLength: number): string {
  const megabytes = Math.max(1, Math.round(byteLength / 1_000_000));
  return `This ${megabytes} MB file is too big for this device's memory. Try splitting it first.`;
}

const UNREADABLE = "This file couldn't be read. Add it again and try once more.";

function isPdfError(error: unknown): error is PdfError {
  return error instanceof PdfError || (error instanceof Error && error.name === 'PdfError');
}

function isMemoryFailure(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  const message = error instanceof Error ? error.message : '';
  return /allocation failed|out of memory|invalid array length|invalid typed array length/i.test(message);
}

/**
 * One unit of work went wrong: say so for these inputs and let the run go on.
 * A cancel is the one thing that is not a failure, so it goes back up.
 */
export function failed(error: unknown, inputs: readonly FoolscapFile[]): Outcome {
  if (error instanceof OpCancelled) throw error;
  const inputIds = inputs.map((input) => input.id);
  if (isPdfError(error)) return { kind: 'failed', inputIds, reason: error.message, code: error.code };
  if (isMemoryFailure(error)) {
    const size = inputs.reduce((sum, input) => sum + input.size, 0);
    return { kind: 'failed', inputIds, reason: tooLargeReason(size), code: 'too-large' };
  }
  return { kind: 'failed', inputIds, reason: UNREADABLE };
}

/** `failed` as a plain sentence from the op itself, for input that cannot be worked with. */
export function refused(inputs: readonly FoolscapFile[], reason: string): Outcome {
  return { kind: 'failed', inputIds: inputs.map((input) => input.id), reason };
}
