/**
 * The real-world sweep: every tool over documents made the way people's files
 * are made (Chromium print-to-PDF, LibreOffice, ImageMagick, ReportLab,
 * poppler, scanner-style image PDFs with and without a hidden OCR layer,
 * phone photos), with the real engine and node canvas, and real Tesseract for
 * Make searchable. It writes every output and a manifest to disk; the
 * differential checks (text recall against pdftotext, page renders against
 * the source pages, office files converted back with LibreOffice) run over
 * that folder afterwards.
 *
 * Needs the corpus built on this machine (tests/realworld/build.sh), so it
 * is skipped unless REALWORLD=1 and REALWORLD_DIR says where the corpus is.
 * REALWORLD_TOOLS limits it to some tools ("pdf-to-word,compress"). The
 * outputs and a manifest.jsonl land in $REALWORLD_DIR/out.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FileKind, FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { OP_IDS, getOp, type ToolId } from '../../app/src/ops';
import type { OcrReader, OcrWord, OpContext, Outcome } from '../../app/src/ops/op';
import { findPaper } from '../../app/src/ops/scan-math';
import { detectBlanks, findOnPage, segmentsOf } from '../../app/src/pdf/find-text';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { FormValues, Mark, PdfEngine } from '../../app/src/pdf/types';
import { PARAMS } from '../fixtures/gauntlet-params';
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import { noisePng, TINY_JPEG } from '../fixtures/pdfs';

const DIR = process.env['REALWORLD_DIR'] ?? '';
const ON = process.env['REALWORLD'] === '1' && DIR !== '' && existsSync(join(DIR, 'pdf'));
const OUT = join(DIR, 'out');
const ONLY = process.env['REALWORLD_TOOLS']?.split(',').filter(Boolean);
const PASSWORDS: Record<string, string> = { 'lo-report-locked.pdf': 'x' };

installNodeCanvas();

let engine: PdfEngine;

/** Tesseract in Node, read the way app/src/ocr/ocr.ts reads it. */
async function nodeOcr(): Promise<OcrReader> {
  const require = createRequire(import.meta.url);
  const { createWorker, OEM } = await import('tesseract.js');
  const langPath = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' });
  return {
    ready: Promise.resolve(),
    async read(png, width, height) {
      const result = await worker.recognize(Buffer.from(png), {}, { text: false, blocks: true });
      const words: OcrWord[] = [];
      const page = result.data as unknown as { blocks: Array<{ paragraphs: Array<{ lines: Array<{ words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> }> | null };
      for (const block of page.blocks ?? [])
        for (const p of block.paragraphs)
          for (const line of p.lines)
            for (const w of line.words) {
              const text = w.text.trim();
              if (!text || w.confidence < 35) continue;
              const { x0, y0, x1, y1 } = w.bbox;
              words.push({ text, x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height });
            }
      return words;
    },
    close: async () => {
      await worker.terminate();
    },
  };
}

let ocr: Promise<OcrReader> | undefined;

interface Entry {
  tool: ToolId;
  variant: string;
  inputs: string[];
  ms: number;
  outcomes: Array<{ kind: string; detail?: string; reason?: string; code?: string; path?: string; name?: string }>;
  error?: string;
}

const list = (sub: string) => (existsSync(join(DIR, sub)) ? readdirSync(join(DIR, sub)).sort() : []);

async function runOne(tool: ToolId, variant: string, files: Array<{ name: string; bytes: Uint8Array; kind: FileKind }>, params: unknown): Promise<void> {
  const workspace = createMemoryWorkspace();
  const passwords = new Map<string, string>();
  const inputs: FoolscapFile[] = [];
  for (const f of files) {
    const file = await workspace.put(f.name, f.bytes.slice(), f.kind, { kind: 'picked' });
    const pw = PASSWORDS[f.name];
    if (pw !== undefined) passwords.set(file.id, pw);
    inputs.push(file);
  }
  const ctx: OpContext = {
    workspace,
    engine: async () => engine,
    ocr: async () => (ocr ??= nodeOcr()),
    surgeon: createSurgeon(),
    passwords,
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  const entry: Entry = { tool, variant, inputs: files.map((f) => f.name), ms: 0, outcomes: [] };
  const started = performance.now();
  let outcomes: Outcome[] = [];
  try {
    outcomes = await Promise.race([
      getOp(tool).run(inputs, params, ctx),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout 300s')), 300_000)),
    ]);
  } catch (error) {
    entry.error = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  }
  entry.ms = Math.round(performance.now() - started);
  const where = join(OUT, tool, variant, files.length === 0 ? 'none' : files.length === 1 ? files[0]!.name : `${files[0]!.name}+${files.length - 1}`);
  mkdirSync(where, { recursive: true });
  for (const o of outcomes) {
    if (o.kind === 'produced') {
      const bytes = new Uint8Array(await (await workspace.read(o.file)).arrayBuffer());
      const path = join(where, o.file.name.replace(/\//g, '_'));
      writeFileSync(path, bytes);
      entry.outcomes.push({ kind: 'produced', detail: o.detail, path, name: o.file.name });
    } else {
      entry.outcomes.push({ kind: o.kind, reason: o.reason, ...(o.kind === 'failed' && o.code ? { code: o.code } : {}) });
    }
  }
  appendFileSync(join(OUT, 'manifest.jsonl'), JSON.stringify(entry) + '\n');
}

const pdfFile = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(join(DIR, 'pdf', name))), kind: 'pdf' as FileKind });

async function firstLayout(name: string) {
  const view = await engine.open(new Uint8Array(readFileSync(join(DIR, 'pdf', name))), PASSWORDS[name] ? { password: PASSWORDS[name] } : {});
  try {
    return { layout: await view.layout(0), count: view.pageCount, fields: await view.fields(), images: await view.images(0) };
  } finally {
    await view.close();
  }
}

/** Every variant to run for a tool on one PDF. */
async function variantsFor(tool: ToolId, name: string): Promise<Array<[string, unknown]>> {
  const base: Array<[string, unknown]> = [['default', PARAMS[tool]!(1)]];
  const markOn = (page: number): Mark[] => [
    { kind: 'text', area: { page, x: 0.55, y: 0.02, w: 0.4, h: 0.03 }, text: 'Received 14/10/2026', size: 0.02, color: [0, 0, 0.6] },
  ];
  switch (tool) {
    case 'split':
      return [...base, ['single', { mode: 'single' }], ['bookmarks', { mode: 'bookmarks' }]];
    case 'organise': {
      const { count } = await firstLayout(name);
      return [['reverse-rotate', { pages: Array.from({ length: count }, (_, i) => ({ source: count - 1 - i, rotation: i === 0 ? 90 : 0 })) }]];
    }
    case 'extract-pages':
      return [...base, ['remove-first', { pages: '1', mode: 'remove' }]];
    case 'crop':
      return [...base, ['auto', { mode: 'auto' }], ['paper-a4', { mode: 'paper', paper: 'a4' }]];
    case 'split-by-size':
      return [['1MB', { megabytes: 1 }]];
    case 'n-up':
      return [...base, ['2-letter', { perSheet: 2, paper: 'letter' }]];
    case 'watermark':
      return [...base, ['once-red', { text: 'COPY', strength: 'strong', layout: 'once', color: 'red' }]];
    case 'page-numbers':
      return [...base, ['bates', { position: 'bottom-right', format: 'bates', start: 1, skipFirst: false, prefix: 'KL-', digits: 6 }]];
    case 'add-password':
      return [...base, ['restrict', { mode: 'restrict', password: '', allowPrinting: true, allowCopying: false }]];
    case 'document-details':
      return [...base, ['strip', { mode: 'strip' }], ['edit', { mode: 'edit', title: 'Title typed', author: 'Author typed', subject: '', keywords: '' }]];
    case 'compress':
      return [...base, ['strong', { level: 'strong' }], ['target-100', { level: 'target', targetKb: 100, allowPictures: true }]];
    case 'pdf-to-images':
      return [['jpeg-72', { format: 'jpeg', dpi: 72, pages: '' }], ['png-150-p1', { format: 'png', dpi: 150, pages: '1' }]];
    case 'sign':
    case 'add-text': {
      const { count } = await firstLayout(name);
      return [...base, ['last-page', { marks: markOn(count - 1) }]];
    }
    case 'remove-areas': {
      const view = await engine.open(new Uint8Array(readFileSync(join(DIR, 'pdf', name))), PASSWORDS[name] ? { password: PASSWORDS[name] } : {});
      const areas = [];
      try {
        for (let i = 0; i < view.pageCount; i++) areas.push(...findOnPage(await view.layout(i), i, ['aadhaar', 'pan', 'phone', 'email', 'card'], ['Rs.', 'Kochi']));
      } finally {
        await view.close();
      }
      return [...base, ...(areas.length ? [['found', { areas }] as [string, unknown]] : [])];
    }
    case 'fill-form': {
      const { fields } = await firstLayout(name);
      if (fields.length === 0) return [['no-fields', PARAMS[tool]!(1)]];
      const values: Record<string, string | boolean> = {};
      for (const f of fields) values[f.name] = f.kind === 'check' ? true : f.kind === 'choice' ? (f.options[1] ?? f.options[0] ?? '') : `Value for ${f.name} ഫോം`;
      return [['filled', { values: values as FormValues, seal: false, answers: values }], ['sealed', { values: values as FormValues, seal: true }]];
    }
    case 'create-form': {
      const { layout } = await firstLayout(name);
      const blanks = detectBlanks(layout, 0);
      return [...base, ...(blanks.length ? [['blanks', { fields: blanks }] as [string, unknown]] : [])];
    }
    case 'edit-text': {
      const { layout } = await firstLayout(name);
      if ((layout.pictureCover ?? 0) >= 0.8 && (layout.hiddenText ?? 0) >= 0.8) return [];
      const segs = segmentsOf(layout);
      const pick = segs.find((s) => /\d/.test(s.text)) ?? segs[0];
      if (!pick) return [];
      const top = pick.baseline - pick.size * 0.95;
      const bottom = pick.baseline + pick.size * 0.28;
      const area = { page: 0, x: pick.x0 / layout.width - 0.004, y: top / layout.height, w: (pick.x1 - pick.x0) / layout.width + 0.008, h: (bottom - top) / layout.height };
      writeFileSync(join(OUT, 'edit-text-picks.jsonl'), JSON.stringify({ name, text: pick.text, area }) + '\n', { flag: 'a' });
      const size = pick.size / layout.width;
      const aspect = layout.height / layout.width;
      const textTop = pick.baseline / layout.height - (0.97 * size) / aspect;
      const right = /^[\d.,()-]+$/.test(pick.text.trim());
      return [
        [
          'first-number',
          {
            marks: [
              { kind: 'fill', area, color: [1, 1, 1] },
              { kind: 'text', area: { page: 0, x: area.x + 0.004, y: Math.max(0, textTop), w: Math.max(0.01, area.w - 0.008), h: area.h }, text: right ? '4,242.00' : 'EDITED 4242', size, color: [0, 0, 0], ...(right ? { align: 'right' } : {}) },
            ],
          },
        ],
      ];
    }
    case 'edit-images': {
      const { images } = await firstLayout(name);
      if (images.length === 0) return [];
      const first = images[0]!;
      return [
        ['delete-first', { edits: [{ area: first, action: 'delete' }] }],
        ['move-first', { edits: [{ area: first, action: 'move', to: { ...first, x: Math.max(0, first.x - 0.05), y: Math.min(1 - first.h, first.y + 0.05) } }] }],
        ['replace-first', { edits: [{ area: first, action: 'replace', bytes: TINY_JPEG, format: 'jpeg' }] }],
      ];
    }
    case 'pdf-to-word':
      return [['picture', { scans: false, scanPages: 'picture' }], ['words', { scans: true, scanPages: 'words' }]];
    case 'pdf-to-excel':
      return [['default', { scans: true }]];
    case 'pdf-to-powerpoint':
      return [['editable', {}], ['pictures', { editable: false }]];
    case 'pdf-to-epub':
      return [['epub', { format: 'epub', scans: false, scanPages: 'picture' }], ['html-words', { format: 'html', scans: true, scanPages: 'words' }]];
    case 'mark-up':
      return [['default', { marks: (PARAMS[tool]!(1) as { marks: Mark[] }).marks.map((m) => (m.kind === 'image' ? { ...m, png: noisePng(16) } : m)) }]];
    default:
      return base;
  }
}

/** Tools whose inputs are not single PDFs, or that need more than one. */
const SPECIAL = new Set<ToolId>(['merge', 'insert-pages', 'compare', 'attachments', 'images-to-pdf', 'scan', 'office-to-pdf', 'rent-receipts']);

describe.skipIf(!ON)('real-world sweep', () => {
  beforeAll(async () => {
    engine = await createNodeEngine();
    mkdirSync(OUT, { recursive: true });
  }, 60_000);

  const tools = OP_IDS.filter((t) => !ONLY || ONLY.includes(t));
  for (const tool of tools) {
    it(tool, async () => {
      const pdfs = list('pdf').filter((n) => n.endsWith('.pdf'));
      const images = list('img');
      const office = list('office').filter((n) => /\.(docx|xlsx)$/.test(n)).map((n) => join('office', n)).concat(list('office/lo').map((n) => join('office/lo', n)).filter((n) => /\.(docx|xlsx)$/.test(n)));
      const img = (n: string) => ({ name: n, bytes: new Uint8Array(readFileSync(join(DIR, 'img', n))), kind: 'image' as FileKind });
      if (!SPECIAL.has(tool)) {
        for (const name of pdfs) for (const [variant, params] of await variantsFor(tool, name)) await runOne(tool, variant, [pdfFile(name)], params);
        return;
      }
      switch (tool) {
        case 'merge':
          await runOne(tool, 'chrome-all', pdfs.filter((n) => n.startsWith('chrome-')).map(pdfFile), {});
          await runOne(tool, 'mixed', ['lo-report.pdf', 'scan-salary-slip-ocr.pdf', 'rl-handbook-rotated.pdf', 'lo-form.pdf', 'rl-kyc-form.pdf', 'im-form16-g4.pdf', 'lo-study-pdfa-tagged.pdf', 'chrome-id-card.pdf', 'lo-report-locked.pdf'].map(pdfFile), {});
          break;
        case 'insert-pages':
          for (const name of pdfs) await runOne(tool, 'file-after-1', [pdfFile(name), pdfFile('chrome-salary-slip.pdf')], { after: 1, what: 'files', blankCount: 1 });
          await runOne(tool, 'replace-2', [pdfFile('lo-report.pdf'), pdfFile('scan-salary-slip-ocr.pdf')], { after: 1, what: 'files', blankCount: 1, replace: '2' });
          break;
        case 'compare': {
          const pairs: Array<[string, string]> = [
            ['lo-report.pdf', 'lo-report-watermark.pdf'],
            ['chrome-salary-slip.pdf', 'incr-salary-slip-annotated.pdf'],
            ['lo-study.pdf', 'lo-study-pdfa-tagged.pdf'],
            ['chrome-salary-slip.pdf', 'scan-salary-slip-ocr.pdf'],
            ['chrome-invoice-gst.pdf', 'cairo-chrome-invoice-gst.pdf'],
            ['lo-report.pdf', 'cairo-lo-report.pdf'],
            ['chrome-rent-agreement.pdf', 'scan-rent-agreement-ocr.pdf'],
            ['chrome-malayalam-letter.pdf', 'cairo-chrome-malayalam-letter.pdf'],
            ['rl-bank-statement-long.pdf', 'chrome-bank-statement.pdf'],
          ];
          for (const [a, b] of pairs) await runOne(tool, `${a}~${b}`, [pdfFile(a), pdfFile(b)], {});
          break;
        }
        case 'attachments':
          await runOne(tool, 'attach', [pdfFile('chrome-invoice-gst.pdf'), { name: 'report.docx', bytes: new Uint8Array(readFileSync(join(DIR, 'office/report.docx'))), kind: 'other' }, img('photo-salary-slip.jpg'), pdfFile('chrome-salary-slip.pdf')], { mode: 'attach' });
          for (const name of pdfs) await runOne(tool, 'extract', [pdfFile(name)], { mode: 'extract' });
          break;
        case 'images-to-pdf':
          await runOne(tool, 'all-a4', images.map(img), { paper: 'a4', margin: 'small' });
          await runOne(tool, 'separate-fit', images.map(img), { paper: 'fit', margin: 'none', separate: true });
          break;
        case 'scan': {
          const photos = images.filter((n) => /^(photo|wa|grey)-/.test(n)).map(img);
          const pages = [];
          for (const p of photos) {
            const { loadImage, createCanvas } = await import('@napi-rs/canvas');
            const im = await loadImage(Buffer.from(p.bytes));
            const w = 200;
            const h = Math.max(1, Math.round((200 * im.height) / im.width));
            const c = createCanvas(w, h);
            const g = c.getContext('2d');
            g.drawImage(im, 0, 0, w, h);
            const rgba = g.getImageData(0, 0, w, h).data;
            const gray = new Uint8Array(w * h);
            for (let q = 0; q < gray.length; q++) gray[q] = (rgba[q * 4]! * 77 + rgba[q * 4 + 1]! * 150 + rgba[q * 4 + 2]! * 29) >> 8;
            const found = findPaper(gray, w, h);
            pages.push({ corners: found ? [...found] : [0.05, 0.05, 0.95, 0.05, 0.95, 0.95, 0.05, 0.95], turn: 0 as const });
          }
          writeFileSync(join(OUT, 'scan-corners.json'), JSON.stringify(pages.map((p, i) => ({ name: photos[i]!.name, ...p }))));
          for (const look of ['colour', 'grey', 'bw'] as const) await runOne(tool, look, photos, { pages, look, paper: 'a4' });
          break;
        }
        case 'office-to-pdf':
          for (const n of office) await runOne(tool, 'default', [{ name: n.replace(/\//g, '_'), bytes: new Uint8Array(readFileSync(join(DIR, n))), kind: 'other' }], {});
          break;
        case 'rent-receipts':
          await runOne(tool, 'default', [], PARAMS[tool]!(0));
          break;
      }
      expect(true).toBe(true);
    }, 3_600_000);
  }

  it('closes the reader', async () => {
    if (ocr) await (await ocr).close();
  });
});

