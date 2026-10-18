/**
 * Each live tool's settings as its tool page sends them by default, for the
 * gauntlet (tests/unit/gauntlet.test.ts). Text sizes and line widths are
 * fractions of the page's width, as the page editor sends them.
 */
import type { Mark } from '../../app/src/pdf/types';
import { AES_EC384 } from './certificates';
import { TINY_JPEG, noisePng } from './pdfs';

export const PASSWORD = 'tea';

export const marks = (png: Uint8Array): Mark[] => [
  { kind: 'highlight', area: { page: 0, x: 0.1, y: 0.1, w: 0.4, h: 0.04 }, color: [1, 0.9, 0.2] },
  { kind: 'highlight', area: { page: 0, x: 0.1, y: 0.2, w: 0.4, h: 0.04 }, color: [0.9, 0.1, 0.1], style: 'strike' },
  { kind: 'ink', page: 0, points: [0.1, 0.5, 0.3, 0.6, 0.5, 0.55], width: 0.005, color: [0, 0, 0.6] },
  { kind: 'shape', area: { page: 0, x: 0.5, y: 0.5, w: 0.2, h: 0.1 }, shape: 'ellipse', color: [0.8, 0, 0], width: 0.004 },
  { kind: 'line', page: 0, from: [0.1, 0.9], to: [0.6, 0.85], color: [0, 0, 0], width: 0.003, end: 'measure' },
  { kind: 'line', page: 0, from: [0.2, 0.7], to: [0.4, 0.75], color: [0, 0, 0], width: 0.003, end: 'arrow' },
  { kind: 'note', area: { page: 0, x: 0.8, y: 0.1, w: 0.04, h: 0.03 }, text: 'ഇത് പരിശോധിക്കുക — check this 🔑', color: [1, 0.8, 0] },
  { kind: 'stamp', area: { page: 0, x: 0.6, y: 0.3, w: 0.3, h: 0.08 }, text: 'APPROVED', color: [0, 0.5, 0] },
  { kind: 'link', area: { page: 0, x: 0.1, y: 0.3, w: 0.3, h: 0.04 }, url: 'https://example.com/lease' },
  { kind: 'text', area: { page: 0, x: 0.1, y: 0.4, w: 0.5, h: 0.05 }, text: 'Seen and agreed', size: 0.03, color: [0, 0, 0], boxed: true },
  { kind: 'image', area: { page: 0, x: 0.6, y: 0.8, w: 0.3, h: 0.1 }, png },
];

/** Each tool's settings as the tool page sends them by default, given the first input's page count. */
export const PARAMS: Record<string, (pages: number) => unknown> = {
  merge: () => ({}),
  split: () => ({ mode: 'every', every: 2 }),
  organise: (n) => ({ pages: Array.from({ length: n }, (_, i) => ({ source: n - 1 - i, rotation: i === 0 ? 90 : 0 })).concat([{ source: 0, rotation: 180 }]) }),
  'extract-pages': () => ({ pages: '1', mode: 'keep' }),
  'insert-pages': () => ({ after: 1, what: 'blank', blankCount: 1 }),
  crop: () => ({ mode: 'trim', mm: 5 }),
  'split-by-size': () => ({ megabytes: 1 }),
  'n-up': () => ({ perSheet: 4, paper: 'a4' }),
  'images-to-pdf': () => ({ paper: 'a4', margin: 'small' }),
  'extract-images': () => ({}),
  watermark: () => ({ text: 'DRAFT', strength: 'medium', layout: 'tiled' }),
  'page-numbers': () => ({ position: 'bottom-center', format: 'page-n-of-total', start: 1, skipFirst: false }),
  'header-footer': () => ({ header: 'CONFIDENTIAL', footer: '{name} – page {page} of {total}, {date}', align: 'center' }),
  'add-password': () => ({ password: PASSWORD, allowPrinting: true, allowCopying: false }),
  'remove-password': () => ({}),
  'document-details': () => ({ mode: 'clean', comments: true, attachments: true }),
  compress: () => ({ level: 'balanced' }),
  'compress-image': () => ({ targetKb: 20, dimensions: 'keep' }),
  'pdf-to-images': () => ({ format: 'jpeg', dpi: 72, pages: '' }),
  'extract-text': () => ({}),
  sign: () => ({ marks: [{ kind: 'image', area: { page: 0, x: 0.6, y: 0.8, w: 0.3, h: 0.1 }, png: noisePng(24) }] }),
  'add-text': () => ({ marks: [{ kind: 'text', area: { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.04 }, text: 'Received with thanks', size: 0.03, color: [0, 0, 0] }] }),
  'mark-up': () => ({ marks: marks(noisePng(16)) }),
  'remove-areas': () => ({ areas: [{ page: 0, x: 0.05, y: 0.05, w: 0.5, h: 0.1 }] }),
  'fill-form': () => ({ values: { name: 'Anjali Menon', address: 'Kochi', agree: true, city: 'Kochi', member: 'yes' }, seal: false, answers: { name: 'Anjali Menon' } }),
  scan: () => ({ pages: [], look: 'grey', paper: 'a4' }),
  ocr: () => ({ languages: ['eng'] }),
  background: () => ({ color: '#fff4d6', pages: '' }),
  'page-labels': () => ({ mode: 'set', front: 1, start: 1, prefix: '' }),
  attachments: () => ({ mode: 'extract' }),
  bookmarks: () => ({ items: [{ title: 'Start', page: 0, items: [] }] }),
  'digital-sign': () => ({ certificate: new Uint8Array(Buffer.from(([] as string[]).concat(AES_EC384).join(''), 'base64')), password: 'pässword', visible: true, reason: '' }),
  'pdf-to-word': () => ({ scans: true }),
  'pdf-to-excel': () => ({ scans: false }),
  'pdf-to-powerpoint': () => ({}),
  'pdf-to-epub': () => ({ format: 'epub', scans: false }),
  'office-to-pdf': () => ({}),
  'add-image': () => ({ marks: [{ kind: 'picture', area: { page: 0, x: 0.2, y: 0.2, w: 0.3, h: 0.2 }, bytes: TINY_JPEG, format: 'jpeg' }] }),
  compare: () => ({}),
  'edit-text': () => ({
    marks: [
      { kind: 'fill', area: { page: 0, x: 0.05, y: 0.1, w: 0.3, h: 0.05 }, color: [1, 1, 1] },
      { kind: 'text', area: { page: 0, x: 0.05, y: 0.1, w: 0.3, h: 0.05 }, text: '42', size: 0.03, color: [0, 0, 0] },
    ],
  }),
  'create-form': () => ({ fields: [{ kind: 'text', name: 'Name', area: { page: 0, x: 0.1, y: 0.1, w: 0.4, h: 0.05 } }] }),
  'pdf-a': () => ({}),
  'rent-receipts': () => ({ tenant: 'Anjali Menon', landlord: 'Joseph Mathew', address: '12 MG Road, Kochi', rent: 15000, start: '2026-04', months: 12, mode: 'UPI', pan: '' }),
  'edit-images': () => ({ edits: [{ area: { page: 0, x: 0, y: 0.75, w: 0.25, h: 0.25 }, action: 'delete' }] }),
};

