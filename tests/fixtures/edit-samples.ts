/**
 * Documents for Edit text, shaped like the ones people actually change: an
 * ERP purchase order whose table draws a line between every cell and whose
 * words are in a Windows font the file names but carries only the widths of,
 * and a letter that came off a scanner, so its words are pixels.
 */
import { PDFDocument, PDFName, StandardFonts, beginText, endText, moveText, setFontAndSize, showText, rgb, type PDFFont, type PDFPage, type PDFRef } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { openPdf } from './mark-inspect';
import type { Bytes } from './pdfs';

/**
 * A TrueType font the file names but does not carry, with WinAnsi codes and
 * a width for each, as Windows programs write "Arial" or "Microsoft Sans
 * Serif". Widths are Helvetica's, which is what a reader stands in with.
 */
function namedTrueType(doc: PDFDocument, base: string, metrics: PDFFont): PDFRef {
  const widths: number[] = [];
  for (let code = 32; code <= 126; code++) widths.push(Math.round(metrics.widthOfTextAtSize(String.fromCharCode(code), 1000)));
  const descriptor = doc.context.obj({ Type: 'FontDescriptor', FontName: base, Flags: 32, FontBBox: [-200, -220, 1000, 900], ItalicAngle: 0, Ascent: 900, Descent: -210, CapHeight: 716, StemV: 80 });
  return doc.context.register(
    doc.context.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: base, FirstChar: 32, LastChar: 126, Widths: widths, Encoding: 'WinAnsiEncoding', FontDescriptor: descriptor }),
  );
}

function write(page: PDFPage, key: PDFName, metrics: PDFFont, text: string, x: number, y: number, size: number): number {
  page.pushOperators(beginText(), setFontAndSize(key, size), moveText(x, y), showText(metrics.encodeText(text)), endText());
  return metrics.widthOfTextAtSize(text, size);
}

export interface RuledOrder {
  readonly bytes: Bytes;
  readonly width: number;
  readonly height: number;
  /** The column lines, x in points from the left. */
  readonly rules: readonly number[];
  /** The row's band, in points from the top. */
  readonly rowTop: number;
  readonly rowBottom: number;
  readonly baseline: number;
  readonly size: number;
  /** Where each cell's words sit, in points from the left. */
  readonly cells: Readonly<Record<'item' | 'brand' | 'description' | 'barcode' | 'amount', { readonly text: string; readonly x0: number; readonly x1: number }>>;
}

/**
 * One order line in a ruled table, as SAP prints it: the brand's words end a
 * few points short of the line that ends their cell, closer than a column's
 * gap, so only the line tells them from the description beside them.
 */
export async function ruledOrderPdf(): Promise<RuledOrder> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const width = 842;
  const height = 595;
  const page = doc.addPage([width, height]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const key = page.node.newFontDictionary('F1', namedTrueType(doc, 'MicrosoftSansSerif', helvetica));
  const rules = [20, 60, 170, 300, 400, 470];
  const headTop = 120;
  const rowTop = 140;
  const rowBottom = 158;
  const size = 8;
  for (const x of rules) page.drawLine({ start: { x, y: height - headTop }, end: { x, y: height - rowBottom }, thickness: 0.6, color: rgb(0, 0, 0) });
  for (const y of [headTop, rowTop, rowBottom]) page.drawLine({ start: { x: rules[0]!, y: height - y }, end: { x: rules[rules.length - 1]!, y: height - y }, thickness: 0.6, color: rgb(0, 0, 0) });
  ['Item', 'Brand', 'Article Description', 'Barcode', 'Total'].forEach((h, i) => write(page, key, helvetica, h, rules[i]! + 3, height - headTop - 13, size));
  const baseline = rowBottom - 5;
  const at = (text: string, x: number) => ({ text, x0: x, x1: x + write(page, key, helvetica, text, x, height - baseline, size) });
  const item = at('0010', 23);
  // Ends about five points before the line at 170: under 0.9 of the size.
  const brandText = 'ORGANIC IND';
  const brand = at(brandText, 170 - 5 - helvetica.widthOfTextAtSize(brandText, size));
  const description = at('O/I Moringa Leaf Powder 100g', 172);
  const barcode = at('0801541510047', 303);
  const amountText = '365.26';
  const amount = at(amountText, 467 - helvetica.widthOfTextAtSize(amountText, size));
  return {
    bytes: new Uint8Array(await doc.save()),
    width,
    height,
    rules,
    rowTop,
    rowBottom,
    baseline,
    size,
    cells: { item, brand, description, barcode, amount },
  };
}

export interface ScannedLetter {
  readonly bytes: Bytes;
  /** Where lines sit on the page, as fractions of it: x of their start, y of their middle. */
  readonly salutation: { readonly x: number; readonly y: number };
  readonly cell: { readonly x: number; readonly y: number };
  /** The table's column lines, as fractions of the width, and its band as fractions of the height. */
  readonly rules: readonly number[];
  readonly tableTop: number;
  readonly tableBottom: number;
}

/**
 * A letter as a scanner hands it over: one picture of the paper filling the
 * page, nothing else. Drawn first as text (a bold name, a ruled table of
 * products), then turned into pixels at 200 dots an inch.
 */
export async function scannedLetterPdf(): Promise<ScannedLetter> {
  const W = 595.28;
  const H = 841.89;
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([W, H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 11;
  page.drawText('W.J. TOWELL CO. (L.L.C)', { x: 60, y: H - 80, size: 16, font: bold });
  page.drawText('Enhance Logistics Center, Dubai Industrial Park', { x: 60, y: H - 98, size: 9, font: regular });
  page.drawText('M/s:', { x: 60, y: H - 170, size, font: regular });
  page.drawText('Valued Customer', { x: 92, y: H - 170, size, font: bold });
  page.drawText('Dear Sir,', { x: 60, y: H - 210, size, font: regular });
  page.drawText('As a result of rising costs our partner has decided to update its prices.', { x: 60, y: H - 240, size, font: regular });
  const rules = [60, 130, 330, 430, 535];
  const tableTop = 280;
  const rows = [300, 320, 340];
  for (const x of rules) page.drawLine({ start: { x, y: H - tableTop }, end: { x, y: H - rows[rows.length - 1]! }, thickness: 0.8, color: rgb(0, 0, 0) });
  for (const y of [tableTop, ...rows]) page.drawLine({ start: { x: rules[0]!, y: H - y }, end: { x: rules[rules.length - 1]!, y: H - y }, thickness: 0.8, color: rgb(0, 0, 0) });
  const cellRows = [
    ['Code', 'Item Name', 'Barcode', 'Price'],
    ['LT020', 'PEPERO ASSORTED (10x4x36g)', '8801062267675', '15.07'],
    ['LT005', 'FUNZELS CHOCO STICK (12x5x30)', '607297169795', '8.92'],
  ];
  cellRows.forEach((cells, r) => cells.forEach((text, c) => page.drawText(text, { x: rules[c]! + 4, y: H - (tableTop + 20 * r) - 14, size: 10, font: regular })));
  page.drawText('Thank you for your continued support.', { x: 60, y: H - 380, size, font: regular });
  const text = new Uint8Array(await doc.save());

  // The paper, photographed: the page drawn to pixels, then a page that is only that picture.
  const pdf = await openPdf(text);
  const scale = 200 / 72;
  const picture = await pdf.render(0, scale);
  await pdf.close();
  const canvas = createCanvas(picture.width, picture.height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(picture.width, picture.height);
  image.data.set(picture.data);
  context.putImageData(image, 0, 0);
  const jpeg = await canvas.encode('jpeg', 92);
  const scan = await PDFDocument.create({ updateMetadata: false });
  const sheet = scan.addPage([W, H]);
  sheet.drawImage(await scan.embedJpg(jpeg), { x: 0, y: 0, width: W, height: H });
  return {
    bytes: new Uint8Array(await scan.save()),
    salutation: { x: 120 / W, y: (170 - 4) / H },
    cell: { x: 200 / W, y: (tableTop + 20 + 14 - 4) / H },
    rules: rules.map((x) => x / W),
    tableTop: tableTop / H,
    tableBottom: rows[rows.length - 1]! / H,
  };
}
