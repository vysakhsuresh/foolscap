/**
 * Small pieces both halves of the seam share. Nothing here names a PDF library,
 * so it is safe for the page bundle and the worker bundle alike.
 */
import { PdfError, type Rotation } from './types';

/** Any /Rotate a file declares, brought to the four values the rest of the app understands. */
export function normaliseRotation(degrees: number): Rotation {
  if (!Number.isFinite(degrees)) return 0;
  const quarter = Math.round(degrees / 90) % 4;
  switch ((quarter + 4) % 4) {
    case 1:
      return 90;
    case 2:
      return 180;
    case 3:
      return 270;
    default:
      return 0;
  }
}

/**
 * Whether the bytes announce themselves as a PDF. The header may sit after
 * some junk, so like every reader we look through the first kilobyte. Used
 * only to tell "not a PDF" from "a PDF, but damaged" once a library has
 * already refused the file; it never rejects anything on its own.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024 + 5);
  // "%PDF-"
  for (let i = 0; i + 5 <= limit; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

/**
 * A RangeError is how every engine reports that it could not allocate: "Array
 * buffer allocation failed", "Invalid array length", "Invalid typed array
 * length". The message texts vary; the class does not.
 */
export function isMemoryFailure(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /allocation failed|out of memory|invalid array length|invalid typed array length/i.test(message);
}

export function tooLarge(byteLength: number | undefined, cause: unknown): PdfError {
  const size = byteLength === undefined ? '' : `${Math.max(1, Math.round(byteLength / 1_000_000))} MB `;
  return new PdfError(
    `This ${size}file is too big for this device's memory. Try splitting it first.`,
    'too-large',
    { cause },
  );
}

export function notReadable(bytes: Uint8Array, cause: unknown): PdfError {
  return looksLikePdf(bytes)
    ? new PdfError("This PDF is damaged and couldn't be read.", 'corrupt', { cause })
    : new PdfError("This doesn't look like a PDF.", 'not-a-pdf', { cause });
}
