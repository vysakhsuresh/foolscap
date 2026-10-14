/**
 * What testing against documents made by real producers found (Chromium,
 * LibreOffice, ReportLab, ImageMagick, scanner software), each kept as a
 * small synthetic file that reproduces the pattern (tests/fixtures/real-producers.ts),
 * so it stays fixed without the corpus. The sweep that found them is
 * tests/unit/realworld-sweep.test.ts (REALWORLD=1).
 */
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { fromDocx, toDocx } from '../../app/src/convert/docx';
import { toFlow, toWorkbook, type PageText } from '../../app/src/convert/text-layout';
import { fromXlsx } from '../../app/src/convert/xlsx';
import type { FileKind, FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp, type ToolId } from '../../app/src/ops';
import type { OcrReader, OpContext, Outcome } from '../../app/src/ops/op';
import { withActualText } from '../../app/src/pdf/actual-text';
import { actualTextIn, markedContent } from '../../app/src/pdf/content-stream';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import type { PdfEngine } from '../../app/src/pdf/types';
import { isPdfjsWorker, patchPdfjsWorker } from '../../scripts/pdfjs-patch';
import { createNodeEngine, installNodeCanvas } from '../fixtures/node-canvas';
import {
  MALAYALAM_LINES,
  MARKED_WORD,
  SIDEWAYS_ROWS,
  actualTextPdf,
  ascii85JpegPdf,
  columnsDocx,
  exifPhotoPdf,
  markWidthPdf,
  officeDocx,
  pdfaPdf,
  reportlabSizedPdf,
  sidewaysTablePdf,
  utf16Hex,
} from '../fixtures/real-producers';

installNodeCanvas();

let engine: PdfEngine;
beforeAll(async () => {
  engine = await createNodeEngine();
}, 60_000);

function harness(ocr?: OcrReader) {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: async () => engine,
    ...(ocr ? { ocr: async () => ocr } : {}),
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
const only = (outcomes: Outcome[]) => {
  const out = produced(outcomes);
  expect(out, JSON.stringify(outcomes)).toHaveLength(1);
  return out[0]!;
};

/** The pictures a PDF draws, with their stored filters and sizes. */
async function picturesIn(bytes: Uint8Array): Promise<Array<{ filter: string; width: number; height: number; length: number }>> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: Array<{ filter: string; width: number; height: number; length: number }> = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
    const f = object.dict.lookup(PDFName.of('Filter'));
    out.push({
      filter: f instanceof PDFArray ? f.asArray().join(' ') : String(f),
      width: Number(object.dict.lookup(PDFName.of('Width'))?.toString()),
      height: Number(object.dict.lookup(PDFName.of('Height'))?.toString()),
      length: object.getContents().length,
    });
  }
  return out;
}

describe('Malayalam and Hindi from Chrome and LibreOffice: /ActualText', () => {
  it('reads an inline dictionary’s /ActualText, literal or hex, and a named property list', () => {
    const bytes = new TextEncoder().encode(`/Span <</ActualText <${utf16Hex('ഗ്രാ')}>>> BDC (X) Tj EMC /P <</MCID 3>> BDC EMC /Span /MC0 BDC EMC /Artifact BMC EMC /Fm1 Do`);
    expect(markedContent(bytes)).toEqual([
      { kind: 'begin', tag: 'Span', actualText: 'ഗ്രാ' },
      { kind: 'begin', tag: 'P' },
      { kind: 'begin', tag: 'Span', properties: 'MC0' },
      { kind: 'begin', tag: 'Artifact' },
      { kind: 'form', name: 'Fm1' },
    ]);
    expect(actualTextIn(new TextEncoder().encode('<< /ActualText (fi\\(x\\)) >>'))).toBe('fi(x)');
    expect(actualTextIn(new TextEncoder().encode('<< /Alt (no) >>'))).toBeUndefined();
  });

  it('puts the text back in place of the shapes, keeps the space before a section, and changes nothing when the sections do not line up', () => {
    const word = (str: string, x: number, extra: { hasEOL?: boolean } = {}) => ({ str, width: 10, transform: [12, 0, 0, 12, x, 700], ...extra });
    const items = [
      { type: 'beginMarkedContentProps', tag: 'Span' },
      word('ഗ', 72),
      word('\u0000ാ', 82),
      { type: 'endMarkedContent' },
      { type: 'beginMarkedContentProps', tag: 'Span' },
      word(' ', 92),
      word('മ', 102),
      { type: 'endMarkedContent' },
    ];
    const out = withActualText(items, [{ tag: 'Span', actualText: 'ഗ്രാ' }, { tag: 'Span', actualText: 'മ' }]);
    expect(out?.map((w) => w.str).join('')).toBe('ഗ്രാ മ');
    expect(out?.[0]?.width).toBe(20);
    expect(withActualText(items, [{ tag: 'Span', actualText: 'x' }])).toBeNull();
    expect(withActualText(items, [{ tag: 'P' }, { tag: 'Span' }])).toBeNull();
  });

  it('Extract text gives the words, not their pieces, inline, by property list and inside a form', async () => {
    const h = harness();
    const input = await h.add('Letter.pdf', await actualTextPdf());
    const out = only(await run('extract-text', [input], {}, h.ctx));
    const text = new TextDecoder().decode(await h.bytesOf(out.file));
    for (const line of MALAYALAM_LINES) expect(text).toContain(line);
    expect(text).not.toMatch(/[\u0000-\u0008]/);
  });

  it('PDF to Word carries the same words', async () => {
    const h = harness();
    const input = await h.add('Letter.pdf', await actualTextPdf());
    const out = only(await run('pdf-to-word', [input], { scans: false, scanPages: 'picture' }, h.ctx));
    const xml = strFromU8(unzipSync(await h.bytesOf(out.file))['word/document.xml']!);
    const words = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(words).toContain('ഗ്രാമ');
    expect(words).toContain('പഞ്ചായത്ത്');
    expect(words).toContain('കേരളം');
  });

  it('Compare reads them too, and a glyph that maps to U+0000 does not stop it', async () => {
    const h = harness();
    const a = await h.add('First.pdf', await actualTextPdf());
    const b = await h.add('Second.pdf', await actualTextPdf());
    const [out] = await run('compare', [a, b], {}, h.ctx);
    expect(out?.kind, JSON.stringify(out)).toBe('skipped');
  });
});

describe('pdf.js reading a glyph that carries a vowel sign', () => {
  it('gives it its width, so a Malayalam word placed glyph by glyph has no space inside it', async () => {
    const view = await engine.open(await markWidthPdf());
    try {
      expect((await view.text(0)).trim()).toBe(MARKED_WORD);
    } finally {
      await view.close();
    }
  });

  it('is patched once, in the worker only, and stops the build if pdf.js changes the code it corrects', () => {
    const code = 'class Glyph { get category() {\n    return shadow(this, "category", getCharUnicodeCategory(this.unicode), true);\n  } }';
    const patched = patchPdfjsWorker(code);
    expect(patched).toContain('__foolscapWidthAware(this,getCharUnicodeCategory(this.unicode))');
    expect(patchPdfjsWorker(patched)).toBe(patched);
    expect(() => patchPdfjsWorker('class Glyph {}')).toThrow(/pdfjs-patch/);
    expect(isPdfjsWorker('/x/node_modules/pdfjs-dist/build/pdf.worker.min.mjs')).toBe(true);
    expect(isPdfjsWorker('/x/node_modules/pdfjs-dist/build/pdf.mjs')).toBe(false);
  });
});

describe('PDF/A files', () => {
  it('can be locked: the copy stops saying it is PDF/A, and says so', async () => {
    const h = harness();
    const input = await h.add('Certificate.pdf', await pdfaPdf());
    for (const params of [
      { password: 'tea', allowPrinting: true, allowCopying: false },
      { mode: 'restrict', password: '', allowPrinting: true, allowCopying: false },
    ]) {
      const out = only(await run('add-password', [input], params, h.ctx));
      expect(out.detail).toMatch(/archive copy \(PDF\/A\)/);
      const doc = await PDFDocument.load(await h.bytesOf(out.file), { updateMetadata: false, ignoreEncryption: true });
      expect(doc.isEncrypted).toBe(true);
    }
    const plain = await createSurgeon().open(await pdfaPdf());
    expect(plain.archival).toBe(true);
    plain.close();
  });
});

describe('Compress on pictures as real producers store them', () => {
  it('takes the ASCII85 wrapping off a JPEG (ReportLab), and the file gets smaller', async () => {
    const h = harness();
    const { bytes } = await ascii85JpegPdf();
    const input = await h.add('Scan.pdf', bytes);
    const out = only(await run('compress', [input], { level: 'balanced' }, h.ctx));
    expect(out.file.size).toBeLessThan(bytes.length * 0.85);
    const [picture] = await picturesIn(await h.bytesOf(out.file));
    expect(picture?.filter).toBe('/DCTDecode');
  });

  it('leaves a phone photo’s EXIF turn alone: the picture stays the shape it is drawn', async () => {
    const h = harness();
    const bytes = await exifPhotoPdf();
    const input = await h.add('Photo.pdf', bytes);
    const out = only(await run('compress', [input], { level: 'strong' }, h.ctx));
    const [picture] = await picturesIn(await h.bytesOf(out.file));
    expect(picture!.width).toBeGreaterThan(picture!.height);
  });

  it('Extract images takes a wrapped JPEG out as the JPEG it is', async () => {
    const h = harness();
    const { bytes, jpeg } = await ascii85JpegPdf();
    const input = await h.add('Scan.pdf', bytes);
    const out = only(await run('extract-images', [input], {}, h.ctx));
    expect(out.file.name).toMatch(/\.jpg$/);
    expect(Buffer.compare(Buffer.from(await h.bytesOf(out.file)), Buffer.from(jpeg))).toBe(0);
  });
});

describe('Make searchable on a document with a blank page', () => {
  it('says a document with a blank page already has its words, rather than that none could be read', async () => {
    const reader: OcrReader = { ready: Promise.resolve(), read: async () => [], close: async () => undefined };
    const h = harness(reader);
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([595, 842]).drawText('A page of words that a reader can already search and copy.', { x: 72, y: 700, size: 12 });
    doc.addPage([595, 842]);
    const input = await h.add('Resume.pdf', await doc.save());
    const [out] = await run('ocr', [input], { languages: ['eng'] }, h.ctx);
    expect(out?.kind).toBe('skipped');
    expect(out?.kind === 'skipped' && out.reason).toMatch(/already has text/);
  });
});

describe('Converters on real layouts', () => {
  it('reads a table printed sideways the way a person turning the page would', async () => {
    const h = harness();
    const input = await h.add('Annexure.pdf', await sidewaysTablePdf());
    const out = only(await run('pdf-to-word', [input], { scans: false, scanPages: 'picture' }, h.ctx));
    const xml = strFromU8(unzipSync(await h.bytesOf(out.file))['word/document.xml']!);
    for (const row of SIDEWAYS_ROWS) for (const cell of row) expect(xml).toContain(`>${cell}<`);
    // Its title, which runs the usual way, is kept too, above the table.
    expect(xml.indexOf('Annexure II')).toBeGreaterThan(0);
    expect(xml.indexOf('Annexure II')).toBeLessThan(xml.indexOf('>District<'));
    // The layout as shown (for the editors) is unchanged: the sideways words are not there.
    const view = await engine.open(await sidewaysTablePdf());
    try {
      expect((await view.layout(0)).items.map((i) => i.str)).toEqual(['Annexure II']);
      const upright = await view.layout(0, { upright: true });
      expect(upright.turned).toBe(270);
      expect(upright.width).toBeCloseTo(841.89, 1);
    } finally {
      await view.close();
    }
  });

  it('keeps the words outside the tables in Excel: a payslip’s Net Pay is not lost', () => {
    const at = (str: string, x: number, y: number) => ({ str, x, y, width: str.length * 5, height: 10, fontName: 'f' });
    const page: PageText = {
      width: 595,
      height: 842,
      items: [
        at('Earnings', 72, 100), at('Amount', 300, 100),
        at('Basic', 72, 116), at('42,500.00', 300, 116),
        at('HRA', 72, 132), at('21,250.00', 300, 132),
        at('Net Pay: Rs. 73,102.00', 72, 180),
      ],
    };
    const book = toWorkbook([page]);
    expect(JSON.stringify(book.sheets)).toContain('Net Pay: Rs. 73,102.00');
  });

  it('makes editable slides of a ReportLab page (595.2756 points wide), not pictures', async () => {
    const h = harness();
    const input = await h.add('Form.pdf', await reportlabSizedPdf());
    const out = only(await run('pdf-to-powerpoint', [input], {}, h.ctx));
    expect(out.detail).toMatch(/text box/);
    const slide = strFromU8(unzipSync(await h.bytesOf(out.file))['ppt/slides/slide1.xml']!);
    expect(slide).toContain('KYC Update Form');
  });

  it('keeps a Word page inside the 22 inches Word allows, the same shape', () => {
    const docx = toDocx({ page: { width: 3000, height: 4000, margin: 18 }, blocks: [{ kind: 'paragraph', runs: [{ text: 'Photo', size: 11 }] }] });
    const xml = strFromU8(unzipSync(docx)['word/document.xml']!);
    const [, w, hh] = /<w:pgSz w:w="(\d+)" w:h="(\d+)"/.exec(xml) ?? [];
    expect(Number(hh)).toBeLessThanOrEqual(22 * 72 * 20);
    expect(Number(w) / Number(hh)).toBeCloseTo(0.75, 2);
  });
});

void decodePDFRawStream;

describe('Word files as LibreOffice and python-docx write them', () => {
  it('keeps headings headings (an outline numbering that shows nothing is not a list), the first section’s paper and header, and a photo in a table cell', async () => {
    const flow = fromDocx(officeDocx());
    const headings = flow.blocks.filter((b) => b.kind === 'paragraph' && b.heading !== undefined);
    expect(headings.map((b) => b.kind === 'paragraph' && b.runs.map((r) => r.text).join(''))).toEqual(['Arun Das', 'Experience', 'Annexure']);
    expect(headings.every((b) => b.kind === 'paragraph' && b.list === undefined)).toBe(true);
    expect(flow.page?.width).toBeLessThan(flow.page?.height ?? 0);
    expect(JSON.stringify(flow.furniture?.every.header)).toContain('Malabar Builders (fictional)');
    const table = flow.blocks.find((b) => b.kind === 'table');
    expect(table?.kind === 'table' && table.rows[0]?.[0]?.images?.length).toBe(1);

    const h = harness();
    const input = await h.add('Resume.docx', officeDocx(), 'other');
    const out = only(await run('office-to-pdf', [input], {}, h.ctx));
    const pdf = await h.bytesOf(out.file);
    expect((await picturesIn(pdf)).length).toBe(1);
    const view = await engine.open(pdf);
    try {
      expect(await view.text(0)).toContain('Malabar Builders (fictional)');
      expect(await view.text(0)).not.toMatch(/•\s*Arun Das/);
    } finally {
      await view.close();
    }
    // A section that starts "continuous" (LibreOffice's two columns) does not start a new page; the next one does.
    const kinds = fromDocx(columnsDocx()).blocks.map((b) => (b.kind === 'paragraph' ? b.runs.map((r) => r.text).join('') : b.kind));
    expect(kinds).toEqual(['Groundwater study', 'Findings in two columns', 'page-break', 'Annexure on its own page']);
    // And back into Word, the photo stays in its cell.
    const back = strFromU8(unzipSync(toDocx(flow))['word/document.xml']!);
    expect(back).toMatch(/<w:tc>(?:(?!<\/w:tc>).)*<w:drawing>/);
  });
});

describe('Numbers and headers on a phone photo’s page', () => {
  it('are set in proportion to a page bigger than A4, so they can be seen when it is fitted to a screen', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([3000, 4000]);
    doc.addPage([595.28, 841.89]);
    const h = harness();
    const input = await h.add('Photos.pdf', await doc.save());
    const numbered = only(await run('page-numbers', [input], { position: 'bottom-center', format: 'n', start: 1, skipFirst: false }, h.ctx));
    const footed = only(await run('header-footer', [input], { header: '', footer: 'Rent receipts', align: 'center' }, h.ctx));
    for (const out of [numbered, footed]) {
      const view = await engine.open(await h.bytesOf(out.file));
      try {
        const big = (await view.layout(0)).items[0];
        const a4 = (await view.layout(1)).items[0];
        expect(big!.height / a4!.height).toBeCloseTo(3000 / 595.28, 0);
      } finally {
        await view.close();
      }
    }
  });
});

describe('Excel files made by programs', () => {
  it('works out the totals of formulas saved without their results (openpyxl), and leaves what it cannot alone', () => {
    const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const cell = (ref: string, inner: string, type = '') => `<c r="${ref}"${type ? ` t="${type}"` : ''}>${inner}</c>`;
    const rows = [
      `<row r="1">${cell('A1', '<is><t>Item</t></is>', 'inlineStr')}${cell('B1', '<is><t>Amount</t></is>', 'inlineStr')}</row>`,
      `<row r="2">${cell('A2', '<is><t>Rent</t></is>', 'inlineStr')}${cell('B2', '<v>15000</v>')}</row>`,
      `<row r="3">${cell('A3', '<is><t>Power</t></is>', 'inlineStr')}${cell('B3', '<v>1625.5</v>')}</row>`,
      `<row r="4">${cell('A4', '<is><t>Total</t></is>', 'inlineStr')}${cell('B4', '<f>SUM(B2:B3)</f><v></v>')}</row>`,
      `<row r="5">${cell('A5', '<is><t>With tax</t></is>', 'inlineStr')}${cell('B5', '<f>ROUND(B4*1.18,2)</f>')}</row>`,
      `<row r="6">${cell('A6', '<is><t>Lookup</t></is>', 'inlineStr')}${cell('B6', '<f>VLOOKUP(A2,Other!A:B,2,0)</f>')}</row>`,
    ].join('');
    const xlsx = zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook ${S}><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet ${S}><sheetData>${rows}</sheetData></worksheet>`),
    });
    const book = fromXlsx(xlsx);
    const rowsOut = book.sheets[0]!.rows;
    expect(rowsOut[3]).toEqual(['Total', '16625.5']);
    expect(rowsOut[4]).toEqual(['With tax', '19618.09']);
    expect(rowsOut[5]).toEqual(['Lookup', '']);
  });
});

describe('A résumé with a sidebar (Chrome, Word templates)', () => {
  it('is read sidebar first, then the main text, not line by line across both', () => {
    const at = (str: string, x: number, y: number, size = 10) => ({ str, x, y, width: str.length * size * 0.5, height: size, fontName: 'f' });
    const side = ['Contact', 'meera@example.com', '+91 98470 00000', 'Skills', 'SQL, Python, R', 'Power BI, Tableau', 'Languages', 'English, Malayalam'].map((s, i) => at(s, 24, 120 + i * 23));
    const prose = 'Analyst with eight years of experience turning messy operational data into decisions';
    const main = Array.from({ length: 12 }, (_, i) => at(i % 4 === 0 ? 'Experience at a retail chain' : prose, 220, 110 + i * 15.5, 9));
    const flow = toFlow([{ width: 595, height: 842, items: [...side, ...main] }]);
    const text = flow.blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.runs.map((r) => r.text).join('')] : [])).join('\n');
    expect(text.indexOf('English, Malayalam')).toBeGreaterThan(-1);
    expect(text.indexOf('English, Malayalam')).toBeLessThan(text.indexOf('Analyst with eight'));
    expect(text.indexOf('Contact')).toBeLessThan(text.indexOf('Skills'));
  });
});
