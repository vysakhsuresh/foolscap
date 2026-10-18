/**
 * The gauntlet: every live tool's op, run the way the tool page runs it,
 * over the files real people actually pick. Empty files, things that are not
 * PDFs, PDFs cut short, locked ones (with and without the right password), a
 * scan, pages on their side, mixed paper, an offset crop box, a form, notes
 * and links, odd and duplicate names, and batches that mix good and bad.
 *
 * The registry is iterated, so a new tool is covered the day it goes live;
 * the only thing a new tool needs here is a line in PARAMS saying what its
 * settings look like by default (the test fails until it has one).
 *
 * For every run: the op resolves (never throws, never hangs), every input is
 * accounted for, a failure says what happened in plain words (no stack, no
 * "undefined", no library's own message), every file made is non-empty and
 * opens, a PDF made carries no Producer or name the input did not have, and
 * the inputs are byte for byte what they were.
 *
 * Node has no canvas, so tests/fixtures/node-canvas.ts gives it one
 * (@napi-rs/canvas, pdf.js's own Node canvas): pages are really drawn, photos
 * really decoded and shrunk. Only the OCR reader is a stand-in.
 *
 * `GAUNTLET_FULL=1` adds the slow part: a 300-page document through every
 * tool, and the pdf.js corpus (when it is on this machine) through every tool.
 * `GAUNTLET_PERF=1` times every tool on a 40-page report and the 300-page
 * file and prints the table kept in tests/PERFORMANCE.md.
 */
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FileKind, FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { OP_IDS, getOp, type ToolId } from '../../app/src/ops';
import type { OcrReader, OpContext, Outcome } from '../../app/src/ops/op';
import { sniffImage } from '../../app/src/ops/images';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { Mark, PdfEngine } from '../../app/src/pdf/types';
import { AES_EC384 } from '../fixtures/certificates';
import {
  annotatedPdf,
  docxBytes,
  mixedSizesPdf,
  offsetBoxPdf,
  oldLockPdf,
  reportPdf,
  restrictedPdf,
  rotated,
  scanPdf,
  smallJpeg,
  textBytes,
  truncatedPdf,
  xlsxBytes,
} from '../fixtures/awkward';
import { PARAMS, PASSWORD } from '../fixtures/gauntlet-params';
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import { TINY_JPEG, bigPdf, corruptBytes, encryptedPdf, formPdf, noisePng, notAPdf, outlinedPdf, pagesPdf, paperPhotoPng, stampsIn } from '../fixtures/pdfs';
import { bankStatementPdf } from '../fixtures/statement';

installNodeCanvas();

const FULL = process.env['GAUNTLET_FULL'] === '1';
const PERF = process.env['GAUNTLET_PERF'] === '1';
const CORPUS = '/tmp/claude-0/-home-user/ee9174ad-8986-5b02-bb67-1e1e66ed8fc7/scratchpad/corpus';
/** Every password a run in here locks a file with, so a locked output can be reopened. */
const KNOWN_PASSWORDS = [PASSWORD, 'പാസ്‌വേഡ് 🔑'];

let engine: PdfEngine;

beforeAll(async () => {
  engine = await createNodeEngine();
}, 60_000);

// ---- Inputs ----

interface Input {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly kind?: FileKind;
  /** The password typed for it, if any. */
  readonly password?: string;
  /** True when no tool can make anything of it: it must come back failed or skipped. */
  readonly bad?: true;
  /** The error code a tool that reads it should give. */
  readonly code?: string;
}

interface Case {
  readonly name: string;
  readonly files: readonly Input[];
}

/**
 * Tools whose result is meant to open without the input's password. A digital
 * signature cannot be sealed into a locked file here, so it signs the unlocked
 * copy and says so.
 */
const UNLOCKS = new Set<ToolId>(['remove-password', 'pdf-a', 'add-password', 'merge', 'digital-sign']);

/** Tools whose inputs are not PDFs. */
const IMAGE_TOOLS = new Set<ToolId>(['images-to-pdf', 'scan', 'compress-image']);
const OFFICE_TOOLS = new Set<ToolId>(['office-to-pdf']);

let fixtures: Record<string, Uint8Array>;

beforeAll(async () => {
  fixtures = {
    good: await pagesPdf(3),
    rotated: await rotated(),
    mixed: await mixedSizesPdf(),
    offset: await offsetBoxPdf(),
    form: await formPdf(),
    annotated: await annotatedPdf(),
    outlined: await outlinedPdf(4),
    scan: await scanPdf(),
    locked: await encryptedPdf(PASSWORD),
    restricted: await restrictedPdf(),
    rc4: await oldLockPdf(PASSWORD, 'RC4-128'),
    rc440: await oldLockPdf(PASSWORD, 'RC4-40'),
    aes128: await oldLockPdf(PASSWORD, 'AES-128'),
    truncated: await truncatedPdf(),
    statement: (await bankStatementPdf([2024, 4], [2024, 6])).bytes,
    report: await reportPdf(6),
    docx: await docxBytes(),
    xlsx: await xlsxBytes(),
    jpeg: await smallJpeg(),
  };
}, 60_000);

const pdf = (name: string, bytes: Uint8Array, extra: Partial<Input> = {}): Input => ({ name, bytes, kind: 'pdf', ...extra });

function pdfCases(): Case[] {
  const f = fixtures;
  const empty = new Uint8Array(0);
  return [
    { name: 'zero-byte file', files: [pdf('Empty.pdf', empty, { bad: true })] },
    { name: 'text named .pdf', files: [pdf('Letter.pdf', textBytes(), { bad: true, code: 'not-a-pdf' })] },
    { name: 'PNG named .pdf', files: [pdf('Photo.pdf', notAPdf(), { bad: true, code: 'not-a-pdf' })] },
    { name: 'corrupt PDF', files: [pdf('Broken.pdf', corruptBytes(), { bad: true, code: 'corrupt' })] },
    { name: 'truncated PDF', files: [pdf('Half.pdf', f.truncated!)] },
    { name: 'locked, no password', files: [pdf('Locked.pdf', f.locked!, { bad: true, code: 'encrypted' })] },
    { name: 'locked, wrong password', files: [pdf('Locked.pdf', f.locked!, { bad: true, code: 'wrong-password', password: 'coffee' })] },
    { name: 'locked, right password', files: [pdf('Locked.pdf', f.locked!, { password: PASSWORD })] },
    { name: 'owner-password only', files: [pdf('Restricted.pdf', f.restricted!)] },
    { name: 'locked with RC4-128', files: [pdf('Old lock.pdf', f.rc4!, { password: PASSWORD })] },
    { name: 'locked with RC4-40', files: [pdf('Older lock.pdf', f.rc440!, { password: PASSWORD })] },
    { name: 'locked with AES-128', files: [pdf('AES lock.pdf', f.aes128!, { password: PASSWORD })] },
    { name: 'RC4, wrong password', files: [pdf('Old lock.pdf', f.rc4!, { bad: true, code: 'wrong-password', password: 'coffee' })] },
    { name: 'scan (no text)', files: [pdf('Scan.pdf', f.scan!)] },
    { name: 'rotated pages', files: [pdf('Rotated.pdf', f.rotated!)] },
    { name: 'mixed page sizes', files: [pdf('Mixed.pdf', f.mixed!)] },
    { name: 'offset crop box', files: [pdf('Offset.pdf', f.offset!)] },
    { name: 'form', files: [pdf('Form.pdf', f.form!)] },
    { name: 'annotations', files: [pdf('Notes.pdf', f.annotated!)] },
    { name: 'bookmarks', files: [pdf('Book.pdf', f.outlined!)] },
    { name: 'bank statement', files: [pdf('Statement.pdf', f.statement!)] },
    { name: 'report with photos', files: [pdf('Report.pdf', f.report!)] },
    {
      name: 'odd names',
      files: [
        pdf('വാടക കരാർ.pdf', f.good!),
        pdf('🏠 lease 🔑.pdf', f.good!),
        pdf(`${'Very long name '.repeat(14)}end.pdf`, f.good!),
        pdf(`${'ഒരു നീണ്ട പേര് '.repeat(10)}.pdf`, f.good!),
        pdf('my.lease.v2.final.pdf', f.good!),
        pdf('lease', f.good!),
        pdf('.pdf', f.good!),
        pdf('LEASE.PDF', f.good!),
      ],
    },
    { name: 'duplicate names', files: [pdf('Lease.pdf', f.good!), pdf('Lease.pdf', f.rotated!), pdf('lease.PDF', f.mixed!)] },
    {
      name: 'good and bad mixed',
      files: [
        pdf('First.pdf', f.good!),
        pdf('Empty.pdf', new Uint8Array(0), { bad: true }),
        pdf('Second.pdf', f.rotated!),
        pdf('Junk.pdf', textBytes(), { bad: true }),
        pdf('Locked.pdf', f.locked!, { bad: true }),
        pdf('Third.pdf', f.annotated!),
      ],
    },
  ];
}

function imageCases(): Case[] {
  const img = (name: string, bytes: Uint8Array, bad?: true): Input => ({ name, bytes, kind: 'image', ...(bad ? { bad } : {}) });
  return [
    { name: 'photos', files: [img('Receipt.jpg', fixtures.jpeg!), img('Page.png', paperPhotoPng(240, 320)), img('Tiny.jpg', TINY_JPEG)] },
    { name: 'zero-byte image', files: [img('Empty.jpg', new Uint8Array(0), true)] },
    { name: 'text named .jpg', files: [img('Note.jpg', textBytes(), true)] },
    { name: 'a JPEG cut short', files: [img('Broken.jpg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xdb]), true)] },
    { name: 'a PDF among photos', files: [img('Receipt.jpg', fixtures.jpeg!), img('Lease.jpg', fixtures.good!, true), img('ഫോട്ടോ 🏠.png', noisePng(40))] },
  ];
}

function officeCases(): Case[] {
  const other = (name: string, bytes: Uint8Array, bad?: true): Input => ({ name, bytes, kind: 'other', ...(bad ? { bad } : {}) });
  return [
    { name: 'word and excel', files: [other('Notes.docx', fixtures.docx!), other('Rent.xlsx', fixtures.xlsx!)] },
    { name: 'zero-byte document', files: [other('Empty.docx', new Uint8Array(0), true)] },
    { name: 'a PDF named .docx', files: [other('Lease.docx', fixtures.good!, true)] },
    { name: 'a zip that is not office', files: [other('Archive.xlsx', new Uint8Array(Buffer.from('UEsDBAoAAAAAAAAAIQAAAAAAAAAAAAAAAAAFAAAAYS50eHRQSwECFAAKAAAAAAAAACEAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAYS50eHRQSwUGAAAAAAEAAQAzAAAAIwAAAAAA', 'base64')), true)] },
  ];
}

// ---- Running ----

const fakeOcr: OcrReader = {
  ready: Promise.resolve(),
  read: async () => [
    { text: 'Rent', x: 0.1, y: 0.1, w: 0.1, h: 0.03 },
    { text: 'received', x: 0.22, y: 0.1, w: 0.18, h: 0.03 },
  ],
  close: async () => undefined,
};

interface Run {
  readonly outcomes: Outcome[];
  readonly inputs: readonly FoolscapFile[];
  readonly given: readonly Input[];
  readonly bytesOf: (file: FoolscapFile) => Promise<Uint8Array>;
  readonly ms: number;
}

async function pageCountOf(input: Input | undefined): Promise<number> {
  if (input === undefined) return 1;
  try {
    const doc = await PDFDocument.load(input.bytes, { updateMetadata: false, ignoreEncryption: true });
    return doc.getPageCount() || 1;
  } catch {
    return 1;
  }
}

async function run(tool: ToolId, given: readonly Input[], timeout: number, paramsOverride?: unknown): Promise<Run> {
  const workspace = createMemoryWorkspace();
  const passwords = new Map<string, string>();
  const inputs: FoolscapFile[] = [];
  for (const input of given) {
    const file = await workspace.put(input.name, input.bytes.slice(), input.kind ?? 'pdf', { kind: 'picked' });
    if (input.password !== undefined) passwords.set(file.id, input.password);
    inputs.push(file);
  }
  const ctx: OpContext = {
    workspace,
    engine: async () => engine,
    ocr: async () => fakeOcr,
    surgeon: createSurgeon(),
    passwords,
    signal: new AbortController().signal,
    progress: (p) => {
      if (/undefined|NaN/.test(p.label)) throw new Error(`Progress label "${p.label}"`);
    },
  };
  const params = paramsOverride ?? PARAMS[tool]!(await pageCountOf(given[0]));
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcomes = await Promise.race([
    getOp(tool).run(inputs, params, ctx),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${tool} took longer than ${timeout / 1000}s`)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
  const ms = performance.now() - started;
  // The inputs are still there, byte for byte.
  for (const [i, file] of inputs.entries()) {
    const after = new Uint8Array(await (await workspace.read(file)).arrayBuffer());
    expect(Buffer.compare(Buffer.from(after), Buffer.from(given[i]!.bytes)), `${tool} changed input ${i}`).toBe(0);
  }
  const bytesOf = async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer());
  return { outcomes, inputs, given, bytesOf, ms };
}

/** What a library or a programmer says, never a person. */
const RAW =
  /undefined|\bnull\b|\[object|Error\b|Cannot read|is not a function|is not defined|not iterable|Invalid object ref|Expected|out of range|\bat \S+ \(|pdf-?lib|pdf\.js|pdfjs|PDF(Dict|Ref|Name|Array|Stream)|xref|trailer|Page index|\bobj\b|\b0x[0-9a-f]+/i;
const RAW_CASED = /\bNaN\b/;
/** What common.ts and the engine say when the error was not one anybody planned for. */
const CATCH_ALL = /^This file couldn't be read\. Add it again|^This page couldn't be drawn\.$|^Something went wrong/;

async function check(tool: ToolId, r: Run, label: string): Promise<void> {
  const where = `${tool} / ${label}`;
  const { outcomes, inputs, given } = r;
  expect(Array.isArray(outcomes), where).toBe(true);
  expect(outcomes.length, `${where}: no outcome at all`).toBeGreaterThan(0);
  const arity = getOp(tool).arity.kind;
  const referenced = new Set<string>();
  for (const outcome of outcomes) {
    if (outcome.kind === 'produced') {
      if (outcome.file.origin.kind === 'derived') outcome.file.origin.from.forEach((id) => referenced.add(id));
    } else {
      outcome.inputIds.forEach((id) => referenced.add(id));
    }
  }
  // An `each` tool answers for every file; the others for the run.
  if (arity === 'each') for (const [i, input] of inputs.entries()) expect(referenced.has(input.id), `${where}: input ${i} (${given[i]!.name}) has no outcome`).toBe(true);

  const inputNames = new Set(given.map((g) => g.name.toLowerCase()));
  const inputStamps = new Set(given.flatMap((g) => stampsIn(g.bytes)));
  const inputProducers = new Set<string | undefined>();
  for (const g of given) inputProducers.add(await producerOf(g.bytes));

  for (const [i, input] of inputs.entries()) {
    const g = given[i]!;
    if (!g.bad) continue;
    const mine = outcomes.filter((o) => (o.kind === 'produced' ? o.file.origin.kind === 'derived' && o.file.origin.from.includes(input.id) && o.file.origin.from.length === 1 : o.inputIds.includes(input.id)));
    // A file nothing can be made of is never turned into something.
    for (const o of mine) expect(o.kind, `${where}: ${g.name} should not have produced anything: ${JSON.stringify(o)}`).not.toBe('produced');
    if (g.code !== undefined && arity !== 'together' && arity !== 'none') {
      const fail = mine.find((o) => o.kind === 'failed');
      if (fail && fail.kind === 'failed' && fail.code !== undefined) expect(fail.code, `${where}: ${fail.reason}`).toBe(g.code);
    }
  }

  const good = new Set(inputs.filter((_, i) => !given[i]!.bad).map((input) => input.id));
  for (const outcome of outcomes) {
    if (outcome.kind !== 'produced') {
      const reason = outcome.reason;
      // The catch-all answers mean something threw that nobody expected: on a file that is fine, that is a bug.
      if (outcome.inputIds.length > 0 && outcome.inputIds.every((id) => good.has(id))) {
        expect(reason, `${where}: a readable file got the catch-all answer`).not.toMatch(CATCH_ALL);
      }
      expect(typeof reason, where).toBe('string');
      expect(reason.trim().length, `${where}: empty reason`).toBeGreaterThan(8);
      expect(reason, `${where}: raw message`).not.toMatch(RAW);
      expect(reason, `${where}: raw message`).not.toMatch(RAW_CASED);
      expect(reason, `${where}: reason should read as a sentence`).toMatch(/^["“A-Z0-9]/);
      expect(reason.length, `${where}: reason too long`).toBeLessThan(400);
      continue;
    }
    const { file, detail } = outcome;
    expect(detail.trim().length, `${where}: empty detail`).toBeGreaterThan(0);
    expect(detail, `${where}: detail "${detail}"`).not.toMatch(/undefined|NaN|\[object|\bnull\b/);
    expect(file.size, `${where}: empty output ${file.name}`).toBeGreaterThan(0);
    expect(inputNames.has(file.name.toLowerCase()), `${where}: output named like an input: ${file.name}`).toBe(false);
    expect(file.name.trim(), `${where}: output name`).not.toMatch(/^\.|\.pdf\.pdf$|^ | $/i);
    expect(new TextEncoder().encode(file.name).length, `${where}: output name too long for a file system: ${file.name}`).toBeLessThanOrEqual(255);
    const bytes = await r.bytesOf(file);
    expect(bytes.length, `${where}: ${file.name}`).toBe(file.size);
    await checkOutput(where, file, bytes, outcome.detail, given, inputStamps, inputProducers);
    // A file that needed a password still needs it, unless taking it away is the point.
    const fromLocked = given.length === 1 && given[0]!.password !== undefined && !given[0]!.bad;
    if (fromLocked && file.kind === 'pdf' && !UNLOCKS.has(tool)) {
      const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
      expect(doc.isEncrypted, `${where}: ${file.name} lost its password`).toBe(true);
      expect(detail, `${where}: the detail should say it is still locked`).toMatch(/still locked with the same password/);
    }
  }
}

async function producerOf(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    return doc.isEncrypted ? undefined : doc.getProducer();
  } catch {
    return undefined;
  }
}

async function checkOutput(
  where: string,
  file: FoolscapFile,
  bytes: Uint8Array,
  detail: string,
  given: readonly Input[],
  inputStamps: Set<string>,
  inputProducers: Set<string | undefined>,
): Promise<void> {
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
  if (file.kind === 'pdf' || ext === 'pdf') {
    expect(stampsIn(bytes).filter((s) => !inputStamps.has(s)), `${where}: stamped ${file.name}`).toEqual([]);
    const producer = await producerOf(bytes);
    if (producer !== undefined) expect(inputProducers.has(producer), `${where}: Producer "${producer}" the input did not have`).toBe(true);
    // Reopens in pdf.js, with whichever password it is meant to carry.
    const candidates = [undefined, ...KNOWN_PASSWORDS, ...given.map((g) => g.password)];
    let opened = false;
    let lastError: unknown;
    for (const password of candidates) {
      try {
        const view = await engine.open(bytes.slice(), password === undefined ? {} : { password });
        expect(view.pageCount, `${where}: ${file.name} has no pages`).toBeGreaterThan(0);
        await view.page(view.pageCount - 1);
        await view.text(0);
        await view.close();
        opened = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    expect(opened, `${where}: ${file.name} does not open (${String(lastError)}); detail "${detail}"`).toBe(true);
    return;
  }
  if (['docx', 'xlsx', 'pptx', 'epub'].includes(ext)) {
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).length, `${where}: empty ${ext}`).toBeGreaterThan(1);
    return;
  }
  if (['png', 'jpg', 'jpeg', 'jp2'].includes(ext) || file.kind === 'image') {
    if (ext !== 'jp2') expect(sniffImage(bytes.subarray(0, 32)), `${where}: ${file.name} is not a picture`).not.toBeNull();
    return;
  }
  if (['txt', 'json', 'html'].includes(ext)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    expect(text.trim().length, `${where}: empty ${ext}`).toBeGreaterThan(0);
    if (ext === 'json') JSON.parse(text);
  }
}

/** The inputs for one tool in one case: a `one` tool runs once per file, as the runner does. */
function runsFor(tool: ToolId, files: readonly Input[]): Input[][] {
  const op = getOp(tool);
  switch (op.arity.kind) {
    case 'none':
      return [[]];
    case 'one':
      return files.map((f) => [f]);
    case 'each':
      return [[...files]];
    case 'together': {
      if (files.length >= op.arity.min) return [[...files]];
      // Two-file tools get a good partner first, so it is the awkward file that is tested.
      const partner = pdf('Partner.pdf', fixtures.good!);
      return [[partner, ...files]];
    }
  }
}

function casesFor(tool: ToolId): Case[] {
  if (IMAGE_TOOLS.has(tool)) return [...imageCases(), ...pdfCases().slice(0, 3)];
  if (OFFICE_TOOLS.has(tool)) return [...officeCases(), ...pdfCases().slice(0, 2)];
  if (tool === 'rent-receipts') return [{ name: 'no input', files: [] }];
  return pdfCases();
}

const TIMEOUT = 60_000;

/** Runs one check, keeping what went wrong rather than stopping at it, so one run shows every problem. */
async function attempt(problems: string[], label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    problems.push(`${label}: ${message}`);
  }
}

describe('the gauntlet', () => {
  it('has default settings for every live tool', () => {
    expect(OP_IDS.filter((id) => PARAMS[id] === undefined)).toEqual([]);
  });

  for (const tool of OP_IDS) {
    it(`${tool}: every awkward input gets a clear answer`, async () => {
      const problems: string[] = [];
      for (const c of casesFor(tool)) {
        for (const inputs of runsFor(tool, c.files)) {
          await attempt(problems, `${c.name}`, async () => check(tool, await run(tool, inputs, TIMEOUT), c.name));
        }
      }
      expect(problems.join('\n')).toBe('');
    }, 240_000);
  }
});

describe('the gauntlet, settings people can type', () => {
  const good = () => pdf('Lease.pdf', fixtures.good!);
  const tries: Array<[ToolId, unknown, string]> = [
    ['split', { mode: 'every', every: 0 }, 'zero pages per part'],
    ['split', { mode: 'every', every: 1.5 }, 'a fraction'],
    ['split', { mode: 'ranges', ranges: 'abc' }, 'words for pages'],
    ['split', { mode: 'ranges', ranges: '99-100' }, 'pages past the end'],
    ['split', { mode: 'bookmarks' }, 'no bookmarks'],
    ['extract-pages', { pages: '', mode: 'keep' }, 'nothing typed'],
    ['extract-pages', { pages: '1-3', mode: 'remove' }, 'every page removed'],
    ['extract-pages', { pages: '7-9', mode: 'remove' }, 'pages it has not got'],
    ['organise', { pages: [] }, 'no pages'],
    ['organise', { pages: [{ source: 9, rotation: 0 }] }, 'a page it has not got'],
    ['organise', { pages: [{ source: 0, rotation: 45 }] }, 'a slanted page'],
    ['insert-pages', { after: -4, what: 'blank', blankCount: 2 }, 'before the start'],
    ['insert-pages', { after: 99, what: 'blank', blankCount: 2 }, 'past the end'],
    ['insert-pages', { after: 1, what: 'blank', blankCount: 0 }, 'no blank pages'],
    ['insert-pages', { after: 1, what: 'blank', blankCount: Number.NaN }, 'not a number'],
    ['insert-pages', { after: 1, what: 'files', blankCount: 1 }, 'no file to insert'],
    ['insert-pages', { after: 1, what: 'blank', blankCount: 1, replace: '1-3' }, 'every page replaced'],
    ['crop', { mode: 'trim', mm: 0 }, 'no margin'],
    ['crop', { mode: 'trim', mm: 90 }, 'a margin bigger than the page'],
    ['crop', { mode: 'trim', mm: Number.NaN }, 'not a number'],
    ['crop', { mode: 'paper', paper: 'letter' }, 'onto Letter'],
    ['split-by-size', { megabytes: 0 }, 'zero megabytes'],
    ['n-up', { perSheet: 2, paper: 'letter' }, 'two up'],
    ['watermark', { text: '   ', strength: 'light', layout: 'once' }, 'blank'],
    ['watermark', { text: 'ഡ്രാഫ്റ്റ്', strength: 'light', layout: 'once' }, 'Malayalam'],
    ['watermark', { text: 'CONFIDENTIAL — DO NOT SHARE OUTSIDE THE FAMILY OR THE BANK '.repeat(4), strength: 'strong', layout: 'once' }, 'very long'],
    ['page-numbers', { position: 'top-right', format: 'n', start: -1, skipFirst: false }, 'a negative start'],
    ['page-numbers', { position: 'top-right', format: 'bates', start: 1, skipFirst: false, prefix: 'ACME-', digits: 99 }, 'too many digits'],
    ['page-numbers', { position: 'bottom-left', format: 'n-of-total', start: 0, skipFirst: true }, 'skip the cover'],
    ['header-footer', { header: '', footer: '', align: 'left' }, 'nothing typed'],
    ['header-footer', { header: 'രഹസ്യം', footer: '', align: 'left' }, 'Malayalam'],
    ['add-password', { password: '', allowPrinting: true, allowCopying: true }, 'no password'],
    ['add-password', { mode: 'restrict', password: '', allowPrinting: true, allowCopying: true, allowEditing: true }, 'nothing restricted'],
    ['add-password', { password: 'പാസ്‌വേഡ് 🔑', allowPrinting: false, allowCopying: false }, 'a Malayalam password'],
    ['document-details', { mode: 'strip' }, 'strip'],
    ['document-details', { mode: 'edit', title: 'വാടക', author: '', subject: '', keywords: '' }, 'a Malayalam title'],
    ['document-details', { mode: 'edit', title: '', author: '', subject: '', keywords: '' }, 'nothing changed'],
    ['compress', { level: 'target', targetKb: 5 }, 'too small a target'],
    ['compress', { level: 'target', targetKb: 1, allowPictures: true }, 'one kilobyte'],
    ['compress', { level: 'strong' }, 'strong'],
    ['compress-image', { targetKb: 0.5, dimensions: 'keep' }, 'half a kilobyte'],
    ['compress-image', { targetKb: Number.NaN, dimensions: 'keep' }, 'not a number'],
    ['compress-image', { targetKb: 2, dimensions: 'passport' }, 'two kilobytes, passport'],
    ['compress-image', { targetKb: 20, dimensions: 'custom', width: 0, height: 400 }, 'no width'],
    ['compress-image', { targetKb: 20, dimensions: 'custom', width: 99999, height: 400 }, 'too many pixels'],
    ['compress-image', { targetKb: 3, dimensions: 'custom', width: 2000, height: 2000 }, 'pixels that cannot fit'],
    ['pdf-to-images', { format: 'png', dpi: 150, pages: '99' }, 'a page it has not got'],
    ['pdf-to-images', { format: 'png', dpi: 150, pages: '1, 1, 2' }, 'a page twice'],
    ['sign', { marks: [] }, 'nothing drawn'],
    ['sign', { marks: [{ kind: 'image', area: { page: 0, x: 2, y: -3, w: 0, h: 0.1 }, png: noisePng(4) }] }, 'off the page'],
    ['sign', { marks: [{ kind: 'image', area: { page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, png: new Uint8Array(10) }] }, 'a broken picture'],
    ['add-text', { marks: [{ kind: 'text', area: { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.04 }, text: 'ഹലോ 👋', size: 0.03, color: [0, 0, 0] }] }, 'Malayalam and emoji'],
    ['add-text', { marks: [{ kind: 'text', area: { page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.04 }, text: '', size: 0.03, color: [0, 0, 0] }] }, 'empty text'],
    ['add-image', { marks: [{ kind: 'picture', area: { page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, bytes: new Uint8Array([1, 2, 3]), format: 'png' }] }, 'a broken picture'],
    ['mark-up', { marks: [{ kind: 'link', area: { page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, url: 'javascript:alert(1)' }] }, 'a script link'],
    ['remove-areas', { areas: [] }, 'nothing marked'],
    ['fill-form', { values: {}, seal: false }, 'nothing typed'],
    ['fill-form', { values: { nothere: 'x' }, seal: true }, 'a field it has not got'],
    ['background', { color: 'blue', pages: '' }, 'a colour name'],
    ['background', { color: '#ffffff', pages: '50' }, 'a page it has not got'],
    ['page-labels', { mode: 'set', front: 99, start: 1, prefix: 'A-' }, 'more front pages than pages'],
    ['page-labels', { mode: 'set', front: 0, start: 0, prefix: '' }, 'start at zero'],
    ['page-labels', { mode: 'remove' }, 'remove'],
    ['attachments', { mode: 'attach' }, 'nothing to attach'],
    ['bookmarks', { items: [{ title: 'Gone', page: 40, items: [] }] }, 'a page it has not got'],
    ['bookmarks', { items: [] }, 'remove them all'],
    ['digital-sign', { certificate: new Uint8Array(0), password: '', visible: true, reason: '' }, 'no certificate'],
    ['digital-sign', { certificate: new Uint8Array(Buffer.from(([] as string[]).concat(AES_EC384).join(''), 'base64')), password: 'wrong', visible: false, reason: '' }, 'the wrong certificate password'],
    ['digital-sign', { certificate: textBytes(), password: 'x', visible: false, reason: '' }, 'not a certificate'],
    ['create-form', { fields: [{ kind: 'text', name: '   ', area: { page: 0, x: 0.1, y: 0.1, w: 0.4, h: 0.05 } }] }, 'a field with no name'],
    ['create-form', { fields: [{ kind: 'choice', name: 'City', area: { page: 0, x: 0.1, y: 0.1, w: 0.4, h: 0.05 }, options: [] }] }, 'a choice with no options'],
    ['create-form', { fields: [{ kind: 'text', name: 'A', area: { page: 0, x: 0.1, y: 0.1, w: 0.4, h: 0.05 } }, { kind: 'check', name: 'A', area: { page: 0, x: 0.1, y: 0.3, w: 0.05, h: 0.05 } }] }, 'two fields with one name'],
    ['edit-images', { edits: [] }, 'nothing changed'],
    ['ocr', { languages: ['xx'] }, 'an unknown language'],
    ['ocr', { languages: [] }, 'no language'],
    ['rent-receipts', { tenant: '', landlord: 'J', address: 'K', rent: 100, start: '2026-04', months: 1, mode: 'UPI', pan: '' }, 'no tenant'],
    ['rent-receipts', { tenant: 'A', landlord: 'J', address: 'K', rent: 100, start: 'soon', months: 1, mode: 'UPI', pan: '' }, 'a start month that is not a month'],
    ['rent-receipts', { tenant: 'അഞ്ജലി 🏠', landlord: 'ജോസഫ്', address: 'കൊച്ചി', rent: 15000, start: '2026-04', months: 24, mode: 'Cash', pan: 'abcde1234f' }, 'Malayalam names'],
    ['rent-receipts', { tenant: 'A', landlord: 'J', address: 'K', rent: 1e15, start: '2026-04', months: 1, mode: 'UPI', pan: '' }, 'an absurd rent'],
  ];
  for (const [tool, params, label] of tries) {
    it(`${tool}: ${label}`, async () => {
      const photo: Input = { name: 'Page.png', bytes: paperPhotoPng(240, 320), kind: 'image' };
      const files = tool === 'rent-receipts' ? [] : tool === 'compress-image' ? [photo] : tool === 'attachments' ? [good()] : tool === 'fill-form' ? [pdf('Form.pdf', fixtures.form!)] : [good()];
      const r = await run(tool, files, TIMEOUT, params);
      await check(tool, r, label);
    }, 60_000);
  }
});

describe.skipIf(!FULL)('the gauntlet, long and real-world files', () => {
  it('runs every tool over a 300-page document', async () => {
    const big = pdf('Long.pdf', await bigPdf(300));
    const problems: string[] = [];
    for (const tool of OP_IDS) {
      if (IMAGE_TOOLS.has(tool) || OFFICE_TOOLS.has(tool) || tool === 'rent-receipts') continue;
      for (const inputs of runsFor(tool, [big])) {
        await attempt(problems, tool, async () => check(tool, await run(tool, inputs, 300_000), '300 pages'));
      }
    }
    expect(problems.join('\n')).toBe('');
  }, 3_600_000);

  const corpus = existsSync(CORPUS) ? readdirSync(CORPUS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort() : [];
  for (const name of corpus) {
    it(`runs every tool over the corpus file ${name}`, async () => {
      const bytes = new Uint8Array(readFileSync(join(CORPUS, name)));
      const input = pdf(name, bytes);
      const problems: string[] = [];
      for (const tool of OP_IDS) {
        if (IMAGE_TOOLS.has(tool) || OFFICE_TOOLS.has(tool) || tool === 'rent-receipts') continue;
        for (const inputs of runsFor(tool, [input])) {
          await attempt(problems, tool, async () => check(tool, await run(tool, inputs, 120_000), name));
        }
      }
      expect(problems.join('\n')).toBe('');
    }, 1_800_000);
  }
});

describe.skipIf(!PERF)('the gauntlet, timed', () => {
  it('times every tool on a 40-page report and a 300-page document', async () => {
    const report = pdf('Report.pdf', await reportPdf(40));
    const long = pdf('Long.pdf', await bigPdf(300));
    const rows: string[] = [];
    for (const tool of OP_IDS) {
      if (IMAGE_TOOLS.has(tool) || OFFICE_TOOLS.has(tool) || tool === 'rent-receipts') continue;
      const times: string[] = [];
      for (const input of [report, long]) {
        const inputs = runsFor(tool, [input])[0]!;
        const r = await run(tool, inputs, 600_000);
        await check(tool, r, `timed ${input.name}`);
        const made = r.outcomes.filter((o) => o.kind === 'produced').length;
        times.push(`${(r.ms / 1000).toFixed(2)} s (${made} made)`);
      }
      rows.push(`| ${tool} | ${times.join(' | ')} |`);
    }
    const lines = ['| Tool | 40-page report (4 MB, 10 photos) | 300 pages (130 KB) |', '|---|---|---|', ...rows];
    process.stdout.write(`\n${lines.join('\n')}\n`);
  }, 3_600_000);
});

// ---- Where things land on pages that are turned, or whose box is not at the origin ----

const SEEN_WIDTH = 240;

/** The page as a reader shows it, as RGBA pixels. */
async function seen(bytes: Uint8Array, index: number, password?: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const view = await engine.open(bytes.slice(), password === undefined ? {} : { password });
  try {
    const png = await view.encode(index, { width: SEEN_WIDTH, format: 'png' });
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(Buffer.from(png));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
  } finally {
    await view.close();
  }
}

interface Frac {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The box, in fractions of the page as seen, around every pixel that changed;
 * or, with `black`, every pixel that turned black (a redaction re-draws the
 * whole page as a photo, so everything changes a little). Null when nothing did.
 */
async function changed(before: Uint8Array, after: Uint8Array, index: number, black = false): Promise<Frac | null> {
  const a = await seen(before, index);
  const b = await seen(after, index);
  expect([b.width, b.height], 'the page changed shape').toEqual([a.width, a.height]);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const dark = (p: Uint8ClampedArray, k: number) => p[k]! + p[k + 1]! + p[k + 2]! < 40;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const k = (y * a.width + x) * 4;
      const d = Math.abs(a.data[k]! - b.data[k]!) + Math.abs(a.data[k + 1]! - b.data[k + 1]!) + Math.abs(a.data[k + 2]! - b.data[k + 2]!);
      if (black ? !dark(b.data, k) || dark(a.data, k) : d < 60) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  }
  if (x1 < 0) return null;
  return { x: x0 / a.width, y: y0 / a.height, w: (x1 - x0) / a.width, h: (y1 - y0) / a.height };
}

const near = (got: Frac | null, want: Frac, slack = 0.03): string | null => {
  if (got === null) return 'nothing changed on the page';
  const inside = got.x >= want.x - slack && got.y >= want.y - slack && got.x + got.w <= want.x + want.w + slack && got.y + got.h <= want.y + want.h + slack;
  return inside ? null : `changed ${JSON.stringify(round(got))}, expected inside ${JSON.stringify(want)}`;
};
const round = (f: Frac): Frac => ({ x: +f.x.toFixed(3), y: +f.y.toFixed(3), w: +f.w.toFixed(3), h: +f.h.toFixed(3) });

describe('the gauntlet, where things land on turned and offset pages', () => {
  const AREA = { x: 0.15, y: 0.55, w: 0.4, h: 0.1 };
  const perPage = (n: number, make: (page: number) => unknown): unknown[] => Array.from({ length: n }, (_, page) => make(page));
  const tools: Array<[ToolId, (n: number) => unknown, (page: number) => Frac]> = [
    ['sign', (n) => ({ marks: perPage(n, (page) => ({ kind: 'image', area: { page, ...AREA }, png: noisePng(24) })) }), () => AREA],
    ['add-image', (n) => ({ marks: perPage(n, (page) => ({ kind: 'picture', area: { page, ...AREA }, bytes: noisePng(30), format: 'png' })) }), () => AREA],
    ['add-text', (n) => ({ marks: perPage(n, (page) => ({ kind: 'text', area: { page, ...AREA }, text: 'Paid in full', size: 0.04, color: [0.8, 0, 0] })) }), () => AREA],
    [
      'mark-up',
      (n) => ({
        marks: perPage(n, (page) => [
          { kind: 'shape', area: { page, ...AREA }, shape: 'rect', color: [0.8, 0, 0], width: 0.004 },
          { kind: 'highlight', area: { page, x: AREA.x, y: AREA.y + 0.02, w: AREA.w, h: 0.03 }, color: [1, 0.85, 0.1] },
          { kind: 'line', page, from: [AREA.x, AREA.y + AREA.h], to: [AREA.x + AREA.w, AREA.y], color: [0, 0, 0.8], width: 0.004, end: 'arrow' },
          { kind: 'ink', page, points: [AREA.x, AREA.y, AREA.x + AREA.w / 2, AREA.y + AREA.h, AREA.x + AREA.w, AREA.y], width: 0.004, color: [0, 0.5, 0] },
        ]).flat(),
      }),
      () => AREA,
    ],
    [
      'edit-text',
      (n) => ({
        marks: perPage(n, (page) => [
          { kind: 'fill', area: { page, ...AREA }, color: [0.2, 0.6, 0.2] },
          { kind: 'text', area: { page, ...AREA }, text: 'Changed', size: 0.03, color: [0, 0, 0] },
        ]).flat(),
      }),
      () => AREA,
    ],
    ['remove-areas', (n) => ({ areas: perPage(n, (page) => ({ page, ...AREA })) }), () => AREA],
    ['create-form', (n) => ({ fields: perPage(n, (page) => ({ kind: 'text', name: `Field ${page + 1}`, area: { page, ...AREA } })) }), () => AREA],
    ['watermark', () => ({ text: 'DRAFT', strength: 'strong', layout: 'once' }), () => ({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 })],
    ['page-numbers', () => ({ position: 'bottom-right', format: 'page-n-of-total', start: 1, skipFirst: false }), () => ({ x: 0.35, y: 0.75, w: 0.65, h: 0.25 })],
    ['header-footer', () => ({ header: 'CONFIDENTIAL', footer: '', align: 'left' }), () => ({ x: 0, y: 0, w: 0.95, h: 0.2 })],
  ];

  for (const [tool, params, want] of tools) {
    it(`${tool}: lands where it was put on every page, whatever its /Rotate or box`, async () => {
      const problems: string[] = [];
      for (const [name, bytes] of [
        ['rotated', fixtures.rotated!],
        ['offset', fixtures.offset!],
        ['mixed', fixtures.mixed!],
      ] as const) {
        const n = await pageCountOf({ name, bytes });
        const r = await run(tool, [pdf(`${name}.pdf`, bytes)], TIMEOUT, params(n));
        await attempt(problems, name, () => check(tool, r, name));
        const made = r.outcomes.find((o) => o.kind === 'produced');
        if (made?.kind !== 'produced') {
          problems.push(`${name}: nothing made: ${JSON.stringify(r.outcomes)}`);
          continue;
        }
        const after = await r.bytesOf(made.file);
        for (let page = 0; page < n; page++) {
          await attempt(problems, `${name} page ${page + 1}`, async () => {
            const box = await changed(bytes, after, page, tool === 'remove-areas');
            const wrong = near(box, want(page));
            if (wrong) throw new Error(wrong);
            // A redaction covers all of what was marked, not just some of it.
            if (tool === 'remove-areas' && box !== null && (box.w < AREA.w * 0.95 || box.h < AREA.h * 0.9)) throw new Error(`only ${JSON.stringify(round(box))} went black`);
          });
        }
      }
      expect(problems.join('\n')).toBe('');
    }, 120_000);
  }
});

describe('the gauntlet, pictures moved on turned pages', () => {
  it('edit-images finds and moves a picture on every page, whatever its /Rotate or box', async () => {
    const FROM = { x: 0.15, y: 0.55, w: 0.3, h: 0.15 };
    const TO = { x: 0.5, y: 0.1, w: 0.3, h: 0.15 };
    const problems: string[] = [];
    for (const [name, bytes] of [
      ['rotated', fixtures.rotated!],
      ['offset', fixtures.offset!],
    ] as const) {
      const n = await pageCountOf({ name, bytes });
      const signed = await run('sign', [pdf(`${name}.pdf`, bytes)], TIMEOUT, { marks: Array.from({ length: n }, (_, page) => ({ kind: 'image', area: { page, ...FROM }, png: noisePng(30) })) });
      const first = signed.outcomes[0];
      if (first?.kind !== 'produced') throw new Error(JSON.stringify(signed.outcomes));
      const withPictures = await signed.bytesOf(first.file);
      // Found where the reader sees them, as the editor finds them.
      const edits = [];
      const view = await engine.open(withPictures.slice());
      for (let page = 0; page < n; page++) {
        const found = (await view.images(page)).filter((a) => Math.abs(a.x - FROM.x) < 0.02 && Math.abs(a.y - FROM.y) < 0.02);
        if (found.length !== 1) problems.push(`${name} page ${page + 1}: the picture was found at ${JSON.stringify(await view.images(page))}`);
        else edits.push({ area: found[0]!, action: 'move', to: { page, ...TO } });
      }
      await view.close();
      const moved = await run('edit-images', [pdf(`${name} signed.pdf`, withPictures)], TIMEOUT, { edits });
      await attempt(problems, name, () => check('edit-images', moved, name));
      const made = moved.outcomes[0];
      if (made?.kind !== 'produced') {
        problems.push(`${name}: ${JSON.stringify(moved.outcomes)}`);
        continue;
      }
      const after = await moved.bytesOf(made.file);
      for (let page = 0; page < n; page++) {
        await attempt(problems, `${name} page ${page + 1}`, async () => {
          const wrong = near(await changed(bytes, after, page), TO);
          if (wrong) throw new Error(wrong);
        });
      }
    }
    expect(problems.join('\n')).toBe('');
  }, 120_000);
});

/** The box around everything drawn on a page as seen (anything not white), in fractions. */
async function inkBox(bytes: Uint8Array, index: number): Promise<Frac & { aspect: number }> {
  const p = await seen(bytes, index);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const k = (y * p.width + x) * 4;
      if (p.data[k]! + p.data[k + 1]! + p.data[k + 2]! > 720) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  }
  return { x: x0 / p.width, y: y0 / p.height, w: (x1 - x0) / p.width, h: (y1 - y0) / p.height, aspect: p.width / p.height };
}

describe('the gauntlet, pages put on other paper', () => {
  it('crop to A4 keeps each page the way up a reader sees it, whatever its /Rotate or box', async () => {
    const problems: string[] = [];
    for (const [name, bytes] of [
      ['rotated', fixtures.rotated!],
      ['offset', fixtures.offset!],
      ['mixed', fixtures.mixed!],
    ] as const) {
      const n = await pageCountOf({ name, bytes });
      const r = await run('crop', [pdf(`${name}.pdf`, bytes)], TIMEOUT, { mode: 'paper', paper: 'a4' });
      const made = r.outcomes[0];
      if (made?.kind !== 'produced') {
        problems.push(`${name}: ${JSON.stringify(r.outcomes)}`);
        continue;
      }
      const after = await r.bytesOf(made.file);
      for (let page = 0; page < n; page++) {
        await attempt(problems, `${name} page ${page + 1}`, async () => {
          const source = await inkBox(bytes, page);
          const sheet = await inkBox(after, page);
          // Where the page sits on the sheet: scaled to fit, centred.
          const fit = Math.min(1, source.aspect / sheet.aspect);
          const fw = fit;
          const fh = sheet.aspect / source.aspect * fit;
          const fx = (1 - fw) / 2;
          const fy = (1 - fh) / 2;
          const want = { x: fx + source.x * fw, y: fy + source.y * fh, w: source.w * fw, h: source.h * fh };
          const off = Math.max(Math.abs(want.x - sheet.x), Math.abs(want.y - sheet.y), Math.abs(want.w - sheet.w), Math.abs(want.h - sheet.h));
          if (off > 0.03) throw new Error(`drawn at ${JSON.stringify(round(sheet))}, expected ${JSON.stringify(round(want))}`);
        });
      }
    }
    expect(problems.join('\n')).toBe('');
  }, 120_000);
});

describe('the gauntlet, what pages share is copied once', () => {
  it('a logo on every page goes into the result once, whatever the tool', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    const logo = await doc.embedPng(noisePng(200));
    for (let i = 0; i < 100; i++) doc.addPage([300, 300]).drawImage(logo, { x: 0, y: 0, width: 50, height: 50 });
    const letterhead = pdf('Letterhead.pdf', new Uint8Array(await doc.save()));
    const partner = pdf('Cover.pdf', fixtures.good!);
    const problems: string[] = [];
    const tries: Array<[ToolId, unknown, Input[]]> = [
      ['merge', {}, [letterhead, partner]],
      ['insert-pages', { after: 50, what: 'blank', blankCount: 1 }, [letterhead]],
      ['n-up', { perSheet: 4, paper: 'a4' }, [letterhead]],
      ['crop', { mode: 'paper', paper: 'a4' }, [letterhead]],
      ['organise', { pages: Array.from({ length: 100 }, (_, i) => ({ source: 99 - i, rotation: 0 })).slice(0, 60) }, [letterhead]],
      ['extract-pages', { pages: '1-50', mode: 'keep' }, [letterhead]],
      // Not a shared picture, but the same idea: two hundred copies of the words on every page, drawn once.
      ['watermark', { text: 'CONFIDENTIAL', strength: 'light', layout: 'tiled' }, [letterhead]],
    ];
    for (const [tool, params, inputs] of tries) {
      await attempt(problems, tool, async () => {
        const r = await run(tool, inputs, TIMEOUT, params);
        await check(tool, r, 'letterhead');
        for (const o of r.outcomes) {
          if (o.kind === 'produced' && o.file.size > letterhead.bytes.length * 1.5) throw new Error(`${o.file.size} bytes from ${letterhead.bytes.length}`);
        }
      });
    }
    expect(problems.join('\n')).toBe('');
  }, 120_000);
});

describe('the gauntlet, cancelled part way', () => {
  for (const tool of OP_IDS) {
    it(`${tool}: stops when the person taps Stop, and says nothing else`, async () => {
      const files = casesFor(tool).find((c) => !c.files.some((f) => f.bad) && c.files.length > 0)?.files ?? [];
      const inputs = runsFor(tool, files)[0] ?? [];
      const workspace = createMemoryWorkspace();
      const ids: FoolscapFile[] = [];
      for (const input of inputs) ids.push(await workspace.put(input.name, input.bytes.slice(), input.kind ?? 'pdf', { kind: 'picked' }));
      const controller = new AbortController();
      const ctx: OpContext = {
        workspace,
        engine: async () => engine,
        ocr: async () => fakeOcr,
        surgeon: createSurgeon(),
        passwords: new Map(),
        signal: controller.signal,
        // Stop at the first sign of work, as a person tapping Stop would.
        progress: () => controller.abort(),
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settled = await Promise.race([
        getOp(tool)
          .run(ids, PARAMS[tool]!(await pageCountOf(inputs[0])), ctx)
          .then(
            (outcomes) => ({ outcomes }),
            (error: unknown) => ({ error }),
          ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${tool} did not stop`)), 30_000);
        }),
      ]).finally(() => clearTimeout(timer));
      // Either it was too quick to stop (and finished), or it stopped with OpCancelled: never another error.
      if ('error' in settled) expect((settled.error as Error).name, String(settled.error)).toBe('OpCancelled');
    }, 60_000);
  }
});

describe('the gauntlet, a turned page looks the same as an upright one', () => {
  /** Blank pages that all look 300 × 420 to a reader: upright, then stored sideways or upside down and turned back by /Rotate, one with an offset box. */
  async function lookalikes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([300, 420]);
    doc.addPage([420, 300]).setRotation(degrees(90));
    doc.addPage([300, 420]).setRotation(degrees(180));
    doc.addPage([420, 300]).setRotation(degrees(270));
    const offset = doc.addPage([700, 900]);
    offset.setMediaBox(50, 80, 300, 420);
    return new Uint8Array(await doc.save());
  }
  const stamps: Array<[ToolId, unknown]> = [
    ['watermark', { text: 'DRAFT', strength: 'strong', layout: 'tiled' }],
    ['watermark', { text: 'COPY', strength: 'strong', layout: 'once' }],
    ['header-footer', { header: 'CONFIDENTIAL', footer: 'Footer', align: 'left' }],
    ['add-text', { marks: [0, 1, 2, 3, 4].map((page) => ({ kind: 'text', area: { page, x: 0.1, y: 0.3, w: 0.6, h: 0.05 }, text: 'Paid in full', size: 0.05, color: [0, 0, 0] })) }],
    ['mark-up', { marks: [0, 1, 2, 3, 4].flatMap((page) => [{ kind: 'stamp', area: { page, x: 0.1, y: 0.5, w: 0.5, h: 0.1 }, text: 'APPROVED', color: [0, 0.5, 0] }, { kind: 'line', page, from: [0.1, 0.8], to: [0.7, 0.7], color: [0, 0, 0], width: 0.005, end: 'measure' }]) }],
  ];
  for (const [tool, params] of stamps) {
    it(`${tool} ${JSON.stringify(params).slice(0, 40)}: every page shows the same thing`, async () => {
      const bytes = await lookalikes();
      const r = await run(tool, [pdf('Blank.pdf', bytes)], TIMEOUT, params);
      const made = r.outcomes[0];
      if (made?.kind !== 'produced') throw new Error(JSON.stringify(r.outcomes));
      const after = await r.bytesOf(made.file);
      const upright = await seen(after, 0);
      const problems: string[] = [];
      for (let page = 1; page < 5; page++) {
        const other = await seen(after, page);
        let differ = 0;
        let inked = 0;
        for (let k = 0; k < upright.data.length; k += 4) {
          const a = upright.data[k]! + upright.data[k + 1]! + upright.data[k + 2]! < 700;
          const b = other.data[k]! + other.data[k + 1]! + other.data[k + 2]! < 700;
          if (a) inked++;
          if (a !== b) differ++;
        }
        // The same to the pixel, give or take anti-aliasing.
        if (inked === 0 || differ > inked * 0.1) problems.push(`page ${page + 1}: ${differ} of ${inked} inked pixels differ`);
      }
      expect(problems.join('\n')).toBe('');
    }, 60_000);
  }
});
