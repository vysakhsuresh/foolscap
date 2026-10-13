/**
 * What the page needs to know about each tool's op before running it: how
 * many files it takes, and whether the worker must load pdf.js or the text
 * reader at start. Kept apart from the ops themselves so a tool page's first
 * script carries none of their code; a unit test checks it matches them.
 */
import type { Arity } from './op';
import type { ToolId } from './tools';

export interface OpMeta {
  readonly arity: Arity;
  readonly engine?: true;
  readonly ocr?: true;
}

export const OP_META: Partial<Record<ToolId, OpMeta>> = {
  merge: { arity: { kind: 'together', min: 2 } },
  split: { arity: { kind: 'one' } },
  organise: { arity: { kind: 'one' } },
  'extract-pages': { arity: { kind: 'one' } },
  'insert-pages': { arity: { kind: 'together', min: 1 } },
  crop: { arity: { kind: 'each' } },
  'split-by-size': { arity: { kind: 'one' } },
  'n-up': { arity: { kind: 'each' } },
  'images-to-pdf': { arity: { kind: 'together', min: 1 } },
  'extract-images': { arity: { kind: 'one' }, engine: true },
  watermark: { arity: { kind: 'each' } },
  'page-numbers': { arity: { kind: 'each' } },
  'header-footer': { arity: { kind: 'each' } },
  'add-password': { arity: { kind: 'each' } },
  'remove-password': { arity: { kind: 'each' } },
  'document-details': { arity: { kind: 'each' } },
  compress: { arity: { kind: 'each' }, engine: true },
  'pdf-to-images': { arity: { kind: 'one' }, engine: true },
  'extract-text': { arity: { kind: 'each' }, engine: true },
  sign: { arity: { kind: 'one' } },
  'add-text': { arity: { kind: 'one' } },
  'mark-up': { arity: { kind: 'one' } },
  'remove-areas': { arity: { kind: 'one' }, engine: true },
  'fill-form': { arity: { kind: 'one' } },
  scan: { arity: { kind: 'together', min: 1 } },
  ocr: { arity: { kind: 'each' }, engine: true, ocr: true },
  background: { arity: { kind: 'each' } },
  'page-labels': { arity: { kind: 'each' } },
  attachments: { arity: { kind: 'together', min: 1 } },
  bookmarks: { arity: { kind: 'one' } },
  'digital-sign': { arity: { kind: 'one' } },
  'pdf-to-word': { arity: { kind: 'each' }, engine: true },
  'pdf-to-excel': { arity: { kind: 'each' }, engine: true },
  'pdf-to-powerpoint': { arity: { kind: 'each' }, engine: true },
  'pdf-to-epub': { arity: { kind: 'each' }, engine: true },
  'office-to-pdf': { arity: { kind: 'each' } },
  'add-image': { arity: { kind: 'one' } },
  compare: { arity: { kind: 'together', min: 2 }, engine: true },
  'edit-text': { arity: { kind: 'one' } },
  'create-form': { arity: { kind: 'one' } },
  'pdf-a': { arity: { kind: 'each' } },
  'rent-receipts': { arity: { kind: 'none' } },
  'edit-images': { arity: { kind: 'one' } },
};

export function opMeta(id: ToolId): OpMeta {
  const meta = OP_META[id];
  if (meta === undefined) throw new Error(`No op for ${id}.`);
  return meta;
}
