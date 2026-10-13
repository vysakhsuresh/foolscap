/**
 * The Convert family's logic, on realistic documents, in Node: tables that
 * come apart where a person sees them come apart (a payslip's details, then
 * its earnings), numbered headings, running headers and page numbers left
 * out, a sentence cut by a page break joined again, pictures carried into
 * Word, the words of a slide lifted into text boxes in their own colours,
 * pictures stored as palettes or CMYK or one bit, Excel's own date formats,
 * Word's headers, footers, page numbers and footnotes, paise in words, and
 * the sheet that shows pages biggest.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it, beforeAll } from 'vitest';
import { fromDocx } from '../../app/src/convert/docx';
import { PAGE_COUNT, PAGE_NUMBER } from '../../app/src/convert/model';
import { slideBoxes, toFlow, toWorkbook, type PageText } from '../../app/src/convert/text-layout';
import { formatNumber } from '../../app/src/convert/xlsx';
import { parseXml } from '../../app/src/convert/xml';
import type { FileKind, FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp, type ToolId } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { nUpLayout } from '../../app/src/ops/pages-ops';
import { amountInWords } from '../../app/src/ops/template-ops';
import { withoutText } from '../../app/src/pdf/content-stream';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { layoutFlow } from '../../app/src/pdf/surgeon-flow';
import type { PdfEngine } from '../../app/src/pdf/types';
import { pixelsOf, sheetRows, unzipParts, xmlParagraphs } from '../fixtures/inspect';
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import { heavyReportPdf, householdXlsx, leasePdf, photo, reportPdf, salarySlipPdf, slidesPdf, storedOddlyPdf, wordLetterDocx } from '../fixtures/realistic';

installNodeCanvas();

let engine: PdfEngine;
beforeAll(async () => {
  engine = await createNodeEngine();
}, 60_000);

async function pagesOf(bytes: Uint8Array): Promise<PageText[]> {
  const view = await engine.open(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  try {
    const out: PageText[] = [];
    for (let i = 0; i < view.pageCount; i++) out.push(await view.layout(i));
    return out;
  } finally {
    await view.close();
  }
}

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
    add: (name: string, bytes: Uint8Array, kind: FileKind = 'pdf') => workspace.put(name, bytes.slice(), kind, { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

const run = (tool: ToolId, inputs: readonly FoolscapFile[], params: unknown, ctx: OpContext) => getOp(tool).run(inputs, params, ctx);
const produced = (outcomes: Outcome[]) => outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');

describe('reading the layout of real documents', { timeout: 60_000 }, () => {
  it('reads the bold of the standard fonts, so headings and run-in labels are found', async () => {
    const [first] = await pagesOf((await reportPdf()).bytes);
    expect(first!.items.find((i) => i.str === 'Annual Report 2025')?.bold).toBe(true);
    expect(first!.items.find((i) => i.str.startsWith('The cooperative'))?.bold).toBe(false);
  });

  it("splits a payslip's details from its earnings, and keeps the sentence under them out of the table", async () => {
    const slip = await salarySlipPdf();
    const book = toWorkbook(await pagesOf(slip.bytes));
    const rows = book.sheets[0]!.rows.map((r) => [...r]);
    expect(rows[0]).toEqual(['Employee name', 'Anjali Menon', 'Employee ID', 'TPS-0421']);
    expect(rows[3]).toEqual(['Date of joining', '12/06/2019', 'Days paid', '30']);
    const earnings = rows.findIndex((r) => r[0] === 'Earnings');
    expect(rows[earnings]).toEqual(['Earnings', 'Amount (Rs.)', 'Deductions', 'Amount (Rs.)']);
    // A row with nothing in the deductions column is its own row, not the end of the one above.
    expect(rows[earnings + 3]).toEqual(['Special Allowance', '12,300.00', 'Income Tax (TDS)', '6,850.00']);
    expect(rows[earnings + 4]).toEqual(['Conveyance', '1,600.00', '', '']);
    expect(rows.some((r) => r.join(' ').includes('Net Pay'))).toBe(false);
  });

  it('keeps a numbered heading a heading, with its number, and the list after it a list', async () => {
    const report = await reportPdf();
    const flow = toFlow(await pagesOf(report.bytes));
    const headings = flow.blocks.flatMap((b) => (b.kind === 'paragraph' && b.heading ? [[b.heading, b.runs.map((r) => r.text).join('')] as const] : []));
    expect(headings).toEqual([[1, report.title], ...report.headings.map((h) => [2, h] as const)]);
    const items = flow.blocks.flatMap((b) => (b.kind === 'paragraph' && b.list ? [b.runs.map((r) => r.text).join('')] : []));
    expect(items).toEqual(report.bullets);
  });

  it('leaves out page numbers and a running header, and keeps a letterhead on the first page', async () => {
    const flow = toFlow(await pagesOf((await reportPdf()).bytes));
    const text = flow.blocks.map((b) => (b.kind === 'paragraph' ? b.runs.map((r) => r.text).join('') : '')).join('\n');
    expect(text).not.toMatch(/Page \d of 3/);
    expect(text).not.toContain('Kerala Water Cooperative - Annual Report 2025');
    expect(text).toContain('Kerala Water Cooperative, Kochi');
  });

  it('joins a clause the page break cut in two, with no break left inside it', async () => {
    const flow = toFlow(await pagesOf(await leasePdf()));
    const paragraphs = flow.blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.runs.map((r) => r.text).join('')] : []));
    expect(paragraphs.some((p) => p.includes('from the first of October 2026 and may be renewed by mutual consent.'))).toBe(true);
    expect(flow.blocks.filter((b) => b.kind === 'paragraph' && b.list?.ordered === true)).toHaveLength(6);
  });

  it('cuts a page into text boxes for slides: lines that belong together, styles kept', async () => {
    const [slide] = await pagesOf(await slidesPdf(1));
    const boxes = slideBoxes(slide!);
    expect(boxes.map((b) => b.lines)).toEqual([['Slide 1: Quarterly review'], ['Point 1 — revenue is up in every district.']]);
    expect(boxes[0]!.bold).toBe(true);
    expect(boxes[0]!.size).toBe(30);
    // A paragraph of three lines is one box of three lines at its own spacing.
    const [page] = await pagesOf((await reportPdf()).bytes);
    const summary = slideBoxes(page!).find((b) => b.lines[0]?.startsWith('The cooperative'));
    expect(summary?.lines).toHaveLength(3);
    expect(summary?.leading).toBeCloseTo(15.4, 1);
  });
});

describe('the converters on real documents', { timeout: 60_000 }, () => {
  it('PDF to Word carries the photo across, cut from the page where it stood', async () => {
    const h = harness();
    const input = await h.add('Report.pdf', (await reportPdf()).bytes);
    const [out] = produced(await run('pdf-to-word', [input], { scans: false }, h.ctx));
    expect(out?.detail).toBe('Word document: 3 pages, 5 headings, 1 table, 1 picture');
    const parts = unzipParts(await h.bytesOf(out!.file));
    const media = parts.names.filter((n) => n.startsWith('word/media/'));
    expect(media).toHaveLength(1);
    const picture = await pixelsOf(parts.bytes(media[0]!)!);
    // 360 × 240 points at 150 dpi.
    expect([picture.width, picture.height]).toEqual([750, 500]);
    expect(picture.at(0.5, 0.03)[0]).toBeGreaterThan(150);
    expect(picture.at(0.02, 0.5)[2]).toBeGreaterThan(150);
  });

  it('PDF to PowerPoint lifts the words into text boxes in their own colours, over the page drawn without them', async () => {
    const h = harness();
    const input = await h.add('Deck.pdf', await slidesPdf(2));
    const [out] = produced(await run('pdf-to-powerpoint', [input], {}, h.ctx));
    expect(out?.detail).toBe("2 slides, with 4 text boxes to edit over each page's pictures and shapes");
    const parts = unzipParts(await h.bytesOf(out!.file));
    const slide = parts.text('ppt/slides/slide1.xml');
    parseXml(slide, { strict: true });
    expect(xmlParagraphs(slide)).toEqual(['Slide 1: Quarterly review', 'Point 1 — revenue is up in every district.']);
    const colours = [...slide.matchAll(/<a:srgbClr val="([0-9A-F]{6})"\/>/g)].map((m) => m[1]!);
    expect(colours[0]).toMatch(/^F[0-9A-F]F[0-9A-F]F[0-9A-F]$/);
    expect(Number.parseInt(colours[1]!.slice(0, 2), 16)).toBeLessThan(60);
    // 30 points of title stays 30 points: 3000 hundredths.
    expect(slide).toContain('sz="3000" b="1"');
    const background = await pixelsOf(parts.bytes('ppt/media/image1.jpeg')!);
    // The white title is gone from the blue bar; the bar itself is there.
    let white = 0;
    for (let x = 0.05; x < 0.4; x += 0.005) if (background.at(x, 0.08)[0] > 200) white++;
    expect(white).toBe(0);
    // Off: pictures only.
    const [plain] = produced(await run('pdf-to-powerpoint', [input], { editable: false }, h.ctx));
    expect(unzipParts(await h.bytesOf(plain!.file)).text('ppt/slides/slide1.xml')).not.toContain('txBox');
  });

  it('a page whose words are hidden (a searchable scan) stays a picture, with no boxes over it', async () => {
    const { PDFDocument: Doc, StandardFonts, TextRenderingMode, rgb } = await import('@cantoo/pdf-lib');
    const doc = await Doc.create({ updateMetadata: false });
    const page = doc.addPage([400, 300]);
    page.drawImage(await doc.embedJpg(photo(400, 300)), { x: 0, y: 0, width: 400, height: 300 });
    page.drawText('Hidden words read from the scan', { x: 20, y: 150, size: 14, font: await doc.embedFont(StandardFonts.Helvetica), color: rgb(0, 0, 0), renderMode: TextRenderingMode.Invisible });
    const h = harness();
    const input = await h.add('Scan.pdf', new Uint8Array(await doc.save()));
    const [out] = produced(await run('pdf-to-powerpoint', [input], {}, h.ctx));
    expect(out?.detail).toContain('as there were no words to lift off it');
    expect(unzipParts(await h.bytesOf(out!.file)).text('ppt/slides/slide1.xml')).not.toContain('txBox');
  });

  it('Extract images decodes pictures stored as a palette, as CMYK and as one bit, instead of skipping them', async () => {
    const h = harness();
    const input = await h.add('Odd.pdf', await storedOddlyPdf());
    const outcomes = await run('extract-images', [input], {}, h.ctx);
    expect(outcomes.filter((o) => o.kind !== 'produced')).toEqual([]);
    const files = produced(outcomes);
    expect(files.map((f) => f.file.name)).toEqual(['Odd image 1 (page 1).png', 'Odd image 2 (page 1).png', 'Odd image 3 (page 1).png']);
    const [logo, print, scan] = await Promise.all(files.map(async (f) => pixelsOf(await h.bytesOf(f.file))));
    expect(logo!.at(0.1, 0.5)).toEqual([255, 0, 0]);
    expect(logo!.at(0.9, 0.5)).toEqual([255, 255, 255]);
    expect(print!.at(0.5, 0.5)[0]).toBeLessThan(60);
    expect(scan!.at(0.5, 0.2)).toEqual([0, 0, 0]);
    expect(scan!.at(0.5, 0.8)).toEqual([255, 255, 255]);
  });

  it('Images to PDF names several images "and N more", and can make one PDF each', async () => {
    const h = harness();
    const inputs = await Promise.all(['A.jpg', 'B.jpg', 'C.jpg'].map((n, i) => h.add(n, photo(300 + i * 10, 200), 'image')));
    const [together] = produced(await run('images-to-pdf', inputs, { paper: 'a4', margin: 'small' }, h.ctx));
    expect(together?.file.name).toBe('A and 2 more.pdf');
    const each = produced(await run('images-to-pdf', inputs, { paper: 'fit', margin: 'none', separate: true }, h.ctx));
    expect(each.map((o) => o.file.name)).toEqual(['A.pdf', 'B.pdf', 'C.pdf']);
    expect(each[0]?.detail).toBe('1 image, the page the shape of the image');
  });

  it('Compress shrinks the photos of a heavy report and leaves its words alone', async () => {
    const h = harness();
    const bytes = await heavyReportPdf();
    const input = await h.add('Heavy.pdf', bytes);
    const [out] = produced(await run('compress', [input], { level: 'balanced' }, h.ctx));
    expect(out?.detail).toMatch(/2 photos made lighter$/);
    const smaller = await h.bytesOf(out!.file);
    expect(smaller.length).toBeLessThan(bytes.length / 2);
    const doc = await PDFDocument.load(smaller, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(2);
  });
});

describe('text off a page, for the background of a slide', { timeout: 60_000 }, () => {
  it('takes out every BT … ET block and nothing else, stepping over strings, names and inline images', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const dec = (b: Uint8Array) => new TextDecoder().decode(b);
    const stream = enc('q 1 0 0 1 0 0 cm 0 0 10 10 re f Q BT /F1 12 Tf (ET is not the end) Tj ET /BT gs BI /W 1 /H 1 ID \x00ET\x00 EI 0 g BT [(a)] TJ ET');
    const out = dec(withoutText(stream));
    expect(out).toContain('0 0 10 10 re f');
    expect(out).toContain('/BT gs');
    expect(out).toContain('BI /W 1 /H 1 ID');
    expect(out).toContain('0 g');
    expect(out).not.toContain('Tj');
    expect(out).not.toContain('TJ');
    expect(out).not.toContain('Tf');
    // Nothing to take out: the same bytes back.
    const plain = enc('0 0 m 10 10 l S');
    expect(withoutText(plain)).toBe(plain);
  });
});

describe('Word and Excel to PDF', { timeout: 60_000 }, () => {
  it('reads the header, the footer with its page fields, and the footnote', () => {
    const flow = fromDocx(wordLetterDocx());
    const text = (blocks: readonly unknown[] | undefined) => JSON.stringify(blocks ?? []);
    expect(text(flow.furniture?.every.header)).toContain('Rose Gardens Residents Association');
    const footer = flow.furniture?.every.footer?.[0];
    expect(footer?.kind === 'paragraph' && footer.runs.map((r) => r.text).join('')).toBe(`Rent notice\tPage ${PAGE_NUMBER} of ${PAGE_COUNT}`);
    const last = flow.blocks.slice(-2).map((b) => (b.kind === 'paragraph' ? b.runs.map((r) => r.text).join('') : ''));
    expect(last).toEqual(['Notes', '[1] Approved at the general body meeting on 14 March.']);
  });

  it('sets the header and footer on every page with the right numbers, clear of the text', async () => {
    const flow = fromDocx(wordLetterDocx());
    const { bytes, pages } = await layoutFlow(flow, null);
    expect(pages).toBe(2);
    const view = await engine.open(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    try {
      for (const i of [0, 1]) {
        const text = (await view.text(i)).replace(/\s+/g, ' ');
        expect(text).toContain('Rose Gardens Residents Association');
        expect(text).toContain(`Page ${i + 1} of 2`);
        expect(text).not.toContain('Page 7');
      }
    } finally {
      await view.close();
    }
  });

  it('repeats a long sheet’s heading row on every page, and shrinks the type for a very wide one', async () => {
    const { workbookToFlow } = await import('../../app/src/ops/office-ops');
    const rows = [['Date', 'Item', 'Amount'], ...Array.from({ length: 120 }, (_, i) => [`2026-04-${String((i % 28) + 1).padStart(2, '0')}`, `Item ${i + 1}`, String(100 + i)])];
    const { bytes, pages } = await layoutFlow(workbookToFlow({ sheets: [{ name: 'Log', rows }] }, 'Log'), null);
    expect(pages).toBeGreaterThan(1);
    const view = await engine.open(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    try {
      for (let i = 0; i < pages; i++) expect((await view.text(i)).replace(/\s+/g, ' ')).toMatch(/^Date Item Amount/);
    } finally {
      await view.close();
    }
    const wide = workbookToFlow({ sheets: [{ name: 'Wide', rows: [Array.from({ length: 16 }, (_, i) => `Column ${i + 1}`), Array.from({ length: 16 }, (_, i) => String(i * 1000))] }] }, 'Wide');
    const table = wide.blocks.find((b) => b.kind === 'table');
    expect(table?.kind === 'table' && table.columns!.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(841.89 - 80 + 0.5);
    expect(table?.kind === 'table' && table.rows[0]![0]!.paragraphs[0]!.runs[0]!.size).toBeLessThan(9);
  });

  it('shows dates the way their cell format writes them', () => {
    const serial = 46121; // 9 April 2026
    expect(formatNumber(serial, 'dd/mm/yyyy')).toBe('09/04/2026');
    expect(formatNumber(serial, 'd\\-mmm\\-yy')).toBe('9-Apr-26');
    expect(formatNumber(serial, 'dddd, d mmmm yyyy')).toBe('Thursday, 9 April 2026');
    expect(formatNumber(serial, 'yyyy-mm-dd')).toBe('2026-04-09');
    expect(formatNumber(serial + 0.75, 'dd/mm/yyyy hh:mm')).toBe('09/04/2026 18:00');
    expect(formatNumber(serial + 0.75, 'h:mm AM/PM')).toBe('6:00 PM');
    expect(formatNumber(0.5, 'mm:ss')).toBe('00:00');
    expect(formatNumber(1.25, '[h]:mm')).toBe('30:00');
    expect(formatNumber(serial, '"Due "dd.mm.yyyy')).toBe('Due 09.04.2026');
  });

  it('reads an Excel-written workbook, formula results and formats included', async () => {
    const { fromXlsx } = await import('../../app/src/convert/xlsx');
    const book = fromXlsx(householdXlsx());
    expect(book.sheets.map((s) => s.name)).toEqual(['Budget', 'Payments', 'Year']);
    expect(book.sheets[0]!.rows[1]).toEqual(['Rent', '15,000.00', '09/04/2026', '75.00%']);
    expect(book.sheets[0]!.rows[4]).toEqual(['Total', '20,000.50', '', '']);
  });
});

describe('small things a person would notice', { timeout: 60_000 }, () => {
  it('writes paise in words', () => {
    expect(amountInWords(15000)).toBe('Rupees Fifteen Thousand only');
    expect(amountInWords(9000.5)).toBe('Rupees Nine Thousand and Fifty Paise only');
    expect(amountInWords(12345.67)).toBe('Rupees Twelve Thousand Three Hundred Forty Five and Sixty Seven Paise only');
    expect(amountInWords(0.99)).toBe('Rupees Zero and Ninety Nine Paise only');
  });

  it('turns the sheet whichever way shows the pages biggest', () => {
    const a4 = { width: 595.28, height: 841.89 };
    const upright = { width: 595, height: 842 };
    const slide = { width: 960, height: 540 };
    expect(nUpLayout(2, a4, upright)).toMatchObject({ cols: 2, rows: 1 });
    expect(nUpLayout(2, a4, upright).sheetW).toBeGreaterThan(nUpLayout(2, a4, upright).sheetH);
    expect(nUpLayout(2, a4, slide)).toMatchObject({ cols: 1, rows: 2 });
    expect(nUpLayout(2, a4, slide).sheetW).toBeLessThan(nUpLayout(2, a4, slide).sheetH);
    expect(nUpLayout(4, a4, upright)).toMatchObject({ cols: 2, rows: 2, sheetW: 595.28 });
    expect(nUpLayout(6, a4, upright)).toMatchObject({ cols: 3, rows: 2 });
    expect(nUpLayout(9, a4, upright)).toMatchObject({ cols: 3, rows: 3 });
    expect(nUpLayout(16, a4, upright)).toMatchObject({ cols: 4, rows: 4 });
  });

  it('the Excel output of a statement still adds up after the table fixes', async () => {
    const { bankStatementPdf } = await import('../fixtures/statement');
    const statement = await bankStatementPdf([2024, 4], [2024, 6]);
    const h = harness();
    const input = await h.add('Statement.pdf', statement.bytes);
    const [out] = produced(await run('pdf-to-excel', [input], { scans: false }, h.ctx));
    const parts = unzipParts(await h.bytesOf(out!.file));
    expect(parts.text('xl/workbook.xml')).toContain('<sheet name="Table"');
    const rows = sheetRows(parts, 1).slice(1).filter((r) => r.length > 0);
    expect(rows).toHaveLength(statement.transactions + 1);
    const sum = rows.reduce((n, r) => n + (typeof r[4] === 'number' ? r[4] : 0), 0);
    expect(sum).toBeCloseTo(statement.withdrawals, 2);
  });
});
