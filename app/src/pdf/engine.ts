/**
 * The engine entry point. The UI imports THIS module, never the barrel, so the
 * surgeon (and pdf-lib) never load on the main thread.
 *
 * Stub: replaced by the pdf-seam implementation.
 */
import type { PdfEngine } from './types';

export function createEngine(): PdfEngine {
  throw new Error('PdfEngine not implemented yet');
}
