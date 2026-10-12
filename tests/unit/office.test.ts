/**
 * PDF to Word, Excel, EPUB and a web page, through the ops, with the real
 * engine reading where the words sit. The files that come out are unzipped
 * and read back: the words have to be there, in order, in the right shape.
 */
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { fromDocx } from '../../app/src/convert/docx';
import { fromXlsx } from '../../app/src/convert/xlsx';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import type { PdfEngine } from '../../app/src/pdf/types';
import { createSurgeon } from '../../app/src/pdf/surgeon';

let engine: PdfEngine;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  const workerModule = 'pdfjs-dist/build/pdf.worker.mjs';
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(/* @vite-ignore */ workerModule);
  const { createEngine } = await import('../../app/src/pdf/engine');
  engine = createEngine();
  await engine.ready;
});

function harness() {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: async () => engine,
    surgeon: createSurgeon(),
    passwords: new Map(),
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return {
    ctx,
    workspace,
    add: (name: string, bytes: Uint8Array) => workspace.put(name, bytes, 'pdf', { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

function only(outcomes: Outcome[]) {
  const list = outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  return list[0]!;
}

/** A title in bold, a paragraph, and a statement table with aligned columns. */
async function statementPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const ink = rgb(0.1, 0.1, 0.1);
  page.drawText('Account statement', { x: 60, y: 760, size: 22, font: bold, color: ink });
  page.drawText('Savings account held at the Kochi branch, for October.', { x: 60, y: 720, size: 11, font: regular, color: ink });
  const rows = [
    ['Date', 'Details', 'Amount'],
    ['01/10/2026', 'Opening balance', '12,500.00'],
    ['04/10/2026', 'Electricity bill', '1,240.50'],
    ['09/10/2026', 'Salary', '48,000.00'],
    ['15/10/2026', 'Groceries', '3,310.75'],
  ];
  rows.forEach((row, r) => {
    const y = 660 - r * 22;
    const font = r === 0 ? bold : regular;
    page.drawText(row[0]!, { x: 60, y, size: 11, font, color: ink });
    page.drawText(row[1]!, { x: 180, y, size: 11, font, color: ink });
    const w = font.widthOfTextAtSize(row[2]!, 11);
    page.drawText(row[2]!, { x: 500 - w, y, size: 11, font, color: ink });
  });
  return doc.save();
}

describe('PDF to Word', () => {
  it('makes a .docx with the title as a heading and the words in order', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await statementPdf());
    const out = only(await getOp('pdf-to-word').run([input], { scans: false }, h.ctx));
    expect(out.file.name).toBe('Statement.docx');
    expect(out.file.kind).toBe('other');
    expect(out.detail).toMatch(/^Word document: 1 page, 1 heading, 1 table/);
    const flow = fromDocx(await h.bytesOf(out.file));
    const first = flow.blocks[0];
    expect(first?.kind === 'paragraph' && first.heading).toBeTruthy();
    const text = JSON.stringify(flow.blocks);
    expect(text).toContain('Account statement');
    expect(text.indexOf('Kochi branch')).toBeLessThan(text.indexOf('Salary'));
    const bytes = await h.bytesOf(out.file);
    expect(Object.keys(unzipSync(bytes))).toContain('word/document.xml');
  });

  it('says how to read a scan when the PDF has no words and scans are off', async () => {
    const h = harness();
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([300, 300]).drawRectangle({ x: 20, y: 20, width: 100, height: 100, color: rgb(0.2, 0.2, 0.2) });
    const input = await h.add('Photo.pdf', await doc.save());
    const [out] = await getOp('pdf-to-word').run([input], { scans: false }, h.ctx);
    expect(out).toMatchObject({ kind: 'failed' });
    expect(JSON.stringify(out)).toMatch(/Read scanned pages too/);
  });
});

describe('PDF to Excel', () => {
  it('turns the statement into rows and columns, amounts as numbers', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await statementPdf());
    const out = only(await getOp('pdf-to-excel').run([input], { scans: false }, h.ctx));
    expect(out.file.name).toBe('Statement.xlsx');
    const book = fromXlsx(await h.bytesOf(out.file));
    const rows = book.sheets.flatMap((s) => s.rows);
    const salary = rows.find((r) => r.includes('Salary'));
    expect(salary).toBeDefined();
    expect(salary).toContain('09/10/2026');
    // Stored as a number, so Excel can add it up.
    const sheetXml = Object.entries(unzipSync(await h.bytesOf(out.file))).filter(([k]) => k.startsWith('xl/worksheets/')).map(([, v]) => strFromU8(v)).join('');
    expect(sheetXml).toMatch(/<v>48000(\.0+)?<\/v>/);
  });
});

describe('PDF to EPUB or web page', () => {
  it('makes an EPUB with the mimetype first, and a web page with the words', async () => {
    const h = harness();
    const input = await h.add('Statement.pdf', await statementPdf());
    const epub = only(await getOp('pdf-to-epub').run([input], { format: 'epub', scans: false }, h.ctx));
    expect(epub.file.name).toBe('Statement.epub');
    const files = unzipSync(await h.bytesOf(epub.file));
    expect(Object.keys(files)[0]).toBe('mimetype');
    const html = only(await getOp('pdf-to-epub').run([input], { format: 'html', scans: false }, h.ctx));
    expect(html.file.name).toBe('Statement.html');
    const page = new TextDecoder().decode(await h.bytesOf(html.file));
    expect(page).toContain('Account statement');
    expect(page).not.toMatch(/Foolscap|pdf-lib/);
  });
});

describe('Word or Excel to PDF', () => {
  it('lays a Word file out with real, selectable words, in order', async () => {
    const { toDocx } = await import('../../app/src/convert/docx');
    const h = harness();
    const docx = toDocx({
      title: 'Minutes',
      blocks: [
        { kind: 'paragraph', heading: 1, runs: [{ text: 'Society meeting', size: 20, bold: true }] },
        { kind: 'paragraph', runs: [{ text: 'Held in the community hall. '.repeat(30), size: 11 }] },
        { kind: 'paragraph', list: { ordered: true, level: 0 }, runs: [{ text: 'Water tank cleaning', size: 11 }] },
        { kind: 'paragraph', list: { ordered: true, level: 0 }, runs: [{ text: 'Parking rules', size: 11 }] },
        {
          kind: 'table',
          rows: [
            [{ paragraphs: [{ kind: 'paragraph', runs: [{ text: 'Flat', size: 11 }] }] }, { paragraphs: [{ kind: 'paragraph', runs: [{ text: 'Dues', size: 11 }] }] }],
            [{ paragraphs: [{ kind: 'paragraph', runs: [{ text: 'A-12', size: 11 }] }] }, { paragraphs: [{ kind: 'paragraph', runs: [{ text: '2,400', size: 11 }] }] }],
          ],
        },
      ],
    });
    const input = await h.workspace.put('Minutes.docx', docx, 'other', { kind: 'picked' });
    const out = only(await getOp('office-to-pdf').run([input], {}, h.ctx));
    expect(out.file.name).toBe('Minutes.pdf');
    expect(out.file.kind).toBe('pdf');
    const view = await engine.open(await h.bytesOf(out.file));
    const text = (await Promise.all(Array.from({ length: view.pageCount }, (_, i) => view.text(i)))).join('\n');
    await view.close();
    expect(text).toContain('Society meeting');
    expect(text).toMatch(/1\.\s*Water tank cleaning/);
    expect(text).toContain('2.');
    expect(text).toContain('A-12');
    expect(text.indexOf('Society meeting')).toBeLessThan(text.indexOf('A-12'));
    expect(new TextDecoder('latin1').decode(await h.bytesOf(out.file))).not.toMatch(/pdf-lib|Foolscap/);
  });

  it('puts a wide spreadsheet on a sideways page, and refuses what is not Office', async () => {
    const { toXlsx } = await import('../../app/src/convert/xlsx');
    const h = harness();
    const header = Array.from({ length: 12 }, (_, i) => `Column ${i + 1}`);
    const xlsx = toXlsx({ sheets: [{ name: 'Sales', rows: [header, header.map((_, i) => String(i * 100))] }] });
    const input = await h.workspace.put('Sales.xlsx', xlsx, 'other', { kind: 'picked' });
    const out = only(await getOp('office-to-pdf').run([input], {}, h.ctx));
    expect(out.detail).toMatch(/from the spreadsheet/);
    const view = await engine.open(await h.bytesOf(out.file));
    const page = await view.page(0);
    expect(page.width).toBeGreaterThan(page.height);
    expect(await view.text(0)).toContain('Column 12');
    await view.close();
    const junk = await h.workspace.put('notes.txt', new TextEncoder().encode('hello'), 'other', { kind: 'picked' });
    const [bad] = await getOp('office-to-pdf').run([junk], {}, h.ctx);
    expect(bad?.kind).toBe('failed');
  });
});

describe('PDF to Excel on a bank statement', () => {
  it('joins every page into one sheet, keeps the account details apart, and the totals add up', async () => {
    const { bankStatementPdf } = await import('../fixtures/statement');
    const statement = await bankStatementPdf([2024, 1], [2024, 12]);
    const h = harness();
    const input = await h.add('Statement.pdf', statement.bytes);
    const out = only(await getOp('pdf-to-excel').run([input], { scans: false }, h.ctx));
    const book = fromXlsx(await h.bytesOf(out.file));
    expect(book.sheets.map((s) => s.name)).toEqual(['Table', 'Other details']);
    const rows = book.sheets[0]!.rows;
    // The header once, the opening balance, then every transaction, each with its date.
    expect(rows[0]).toEqual(['Date', 'Narration', 'Chq/Ref No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']);
    expect(rows).toHaveLength(statement.transactions + 2);
    expect(rows.slice(1).every((r) => /^\d\d\/\d\d\/\d\d$/.test(r[0] ?? ''))).toBe(true);
    const sum = (k: number) => Math.round(rows.slice(2).reduce((n, r) => n + (Number((r[k] ?? '').replace(/,/g, '')) || 0), 0) * 100) / 100;
    expect(sum(4)).toBe(statement.withdrawals);
    expect(sum(5)).toBe(statement.deposits);
    // A narration that wrapped onto two lines is one cell.
    expect(rows.some((r) => /^NEFT CR-HDFC0000123-TECHNOPARK SOLUTIONS PVT LTD-SALARY [A-Z]{3} 2024$/.test(r[1] ?? ''))).toBe(true);
    expect(JSON.stringify(book.sheets[1]!.rows)).toContain('ANJALI MENON');
  });
});
