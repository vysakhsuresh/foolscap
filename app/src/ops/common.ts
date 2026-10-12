/**
 * What the structural ops share: reading an input, naming an output, and
 * turning whatever went wrong into a `failed` outcome in the user's words.
 */
import type { FileKind, FoolscapFile } from '../files/types';
import { PdfError, type PdfDoc } from '../pdf';
import type { OpContext, Outcome } from './op';
import { OpCancelled, checkCancelled } from './op';
import type { ToolId } from './tools';

/** "Lease agreement.pdf" → "Lease agreement". Only a trailing .pdf comes off, whatever its case. */
export function baseName(name: string): string {
  const stripped = clip(name.replace(/\.pdf$/i, '').trim(), STEM_BYTES);
  return stripped.length > 0 ? stripped : 'Document';
}

/**
 * Every file system stops at 255 bytes for a name, and a Malayalam letter is
 * three of them. A stem keeps at most this many, which leaves room for what a
 * tool adds after it (" (compressed).pdf", " image 12 (page 300).png").
 */
const STEM_BYTES = 150;
const NAME_BYTES = 240;

const utf8 = new TextEncoder();

/** The longest start of `text` that fits in `bytes`, cut between letters as a reader sees them, never inside one. */
function clip(text: string, bytes: number): string {
  if (utf8.encode(text).length <= bytes) return text;
  const parts =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
      : Array.from(text);
  let out = '';
  let used = 0;
  for (const part of parts) {
    const size = utf8.encode(part).length;
    if (used + size > bytes) break;
    out += part;
    used += size;
  }
  return out.trimEnd();
}

/** An output's name, cut down before its extension if it would be too long to save. */
export function fitName(name: string): string {
  if (utf8.encode(name).length <= NAME_BYTES) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : '';
  const stemPart = ext ? name.slice(0, dot) : name;
  return `${clip(stemPart, NAME_BYTES - utf8.encode(ext).length)}${ext}`;
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

export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : many}`;
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

/** "Holiday photo.JPG" → "Holiday photo": any extension, for images. */
export function stem(name: string): string {
  const stripped = clip(name.replace(/\.[a-z0-9]{1,5}$/i, '').trim(), STEM_BYTES);
  return stripped.length > 0 ? stripped : 'Image';
}

export function megabytes(bytes: number): string {
  const mb = bytes / 1_000_000;
  return mb >= 10 ? `${Math.round(mb)} MB` : mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** Writes one output and returns its `produced` outcome. */
export async function store(
  ctx: OpContext,
  tool: ToolId,
  from: readonly FoolscapFile[],
  name: string,
  bytes: Uint8Array,
  detail: string,
  kind: FileKind = 'pdf',
): Promise<Outcome> {
  const file = await ctx.workspace.put(fitName(name), bytes, kind, { kind: 'derived', tool, from: from.map((f) => f.id) });
  return { kind: 'produced', file, detail };
}

/**
 * The shape of every `each` op: open one input, work on it, close it, move
 * on. One unreadable file is a `failed` outcome at its own index and the rest
 * carry on; a cancel stops the run.
 */
export async function forEachPdf(
  inputs: readonly FoolscapFile[],
  ctx: OpContext,
  work: (doc: PdfDoc, input: FoolscapFile) => Promise<Outcome>,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const [i, input] of inputs.entries()) {
    checkCancelled(ctx.signal);
    ctx.progress({
      done: i,
      total: inputs.length,
      label: inputs.length > 1 ? `Working on the ${ordinal(i + 1)} file` : 'Working on it…',
    });
    let doc: PdfDoc;
    try {
      doc = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
    } catch (error) {
      outcomes.push(failed(error, [input]));
      continue;
    }
    try {
      outcomes.push(noteMissing(await work(doc, input), doc));
    } catch (error) {
      outcomes.push(failed(error, [input]));
    } finally {
      doc.close();
    }
  }
  ctx.progress({ done: inputs.length, total: inputs.length, label: 'Done' });
  return outcomes;
}

/** What a detail says after the rest when the result kept its input's password. */
export const lockNote = (relocked: boolean): string => (relocked ? ', still locked with the same password' : '');

/**
 * Saves an edited document. A file that needed a password to open still
 * needs it afterwards: the same one, now AES-256. `relocked` says whether it was.
 */
export async function saveKeepingLock(
  ctx: OpContext,
  doc: PdfDoc,
  input: FoolscapFile,
  /** For a new document built from `input`: whether `input` was locked. */
  locked: boolean = doc.wasEncrypted,
): Promise<{ bytes: Uint8Array; relocked: boolean }> {
  const password = ctx.passwords.get(input.id);
  const relocked = locked && password !== undefined && password.length > 0;
  const bytes = await doc.save(relocked ? { encrypt: { userPassword: password, allowPrinting: true, allowCopying: true } } : undefined);
  return { bytes, relocked };
}

/**
 * A file cut short loses its last pages (PdfDoc.missingPages); whatever is
 * made from it says so, because the person did not ask for fewer pages.
 */
export function noteMissing(outcome: Outcome, doc: PdfDoc): Outcome {
  const missing = doc.missingPages;
  if (outcome.kind !== 'produced' || !(missing > 0)) return outcome;
  return { ...outcome, detail: `${outcome.detail}. This file is damaged: ${plural(missing, 'page')} could not be read and ${missing === 1 ? 'is' : 'are'} left out` };
}
