/**
 * Realistic sample documents, the kind people actually bring to the Convert
 * tools: a three-page report with headings, paragraphs, lists, a ruled table
 * and a photo; an Indian salary slip; a four-page lease in a serif face;
 * phone photos of every shape (one stored on its side with an EXIF "turn
 * me" flag); a Word file and an Excel workbook with the things real ones
 * carry. Everything is built on the fly, so nothing binary is committed, and
 * each builder returns the words and numbers a test should find again.
 *
 * Raster images are drawn with @napi-rs/canvas (pdf.js's own Node canvas),
 * so this module runs in Node only: in unit tests and in the e2e runner.
 * Tests may name the libraries: the seam rule applies to app/ only.
 */
import { PDFDocument, PDFHexString, PDFName, StandardFonts, TextRenderingMode, beginText, endText, moveText, rgb, setFontAndSize, setTextRenderingMode, showText, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { strToU8, zipSync } from 'fflate';
import type { Bytes } from './pdfs';

const A4: [number, number] = [595.28, 841.89];
const fresh = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

// ---------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------

export interface PhotoOptions {
  /** A band of this colour along the top edge, as the picture is meant to be seen. */
  readonly top?: string;
  /** A band along the left edge. */
  readonly left?: string;
  readonly format?: 'jpeg' | 'png' | 'webp';
  /** PNG only: a transparent hole in the middle. */
  readonly transparent?: boolean;
  readonly quality?: number;
}

/**
 * A photo-like picture: a sky-to-grass gradient with grain (so JPEG has real
 * work to do), a red band on top and a blue band on the left, so which way up
 * it ended up on a page can be read back from the pixels.
 */
export function photo(width: number, height: number, opts: PhotoOptions = {}): Bytes {
  const canvas = createCanvas(width, height);
  const c = canvas.getContext('2d');
  const sky = c.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#7fb3e6');
  sky.addColorStop(0.55, '#e8d9a8');
  sky.addColorStop(1, '#3f7a3a');
  c.fillStyle = sky;
  c.fillRect(0, 0, width, height);
  // Grain: what makes a phone photo heavy.
  const image = c.getImageData(0, 0, width, height);
  let seed = width * 7919 + height;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = ((seed >> 16) & 31) - 16;
    image.data[i] = Math.max(0, Math.min(255, image.data[i]! + n));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1]! + n));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2]! + n));
  }
  c.putImageData(image, 0, 0);
  const band = Math.max(4, Math.round(Math.min(width, height) * 0.12));
  c.fillStyle = opts.top ?? '#d01010';
  c.fillRect(0, 0, width, band);
  c.fillStyle = opts.left ?? '#1030d0';
  c.fillRect(0, band, band, height - band);
  if (opts.transparent) c.clearRect(width / 3, height / 3, width / 3, height / 3);
  const format = opts.format ?? 'jpeg';
  const bytes = format === 'png' ? canvas.toBuffer('image/png') : format === 'webp' ? canvas.toBuffer('image/webp', Math.round((opts.quality ?? 0.85) * 100)) : canvas.toBuffer('image/jpeg', Math.round((opts.quality ?? 0.9) * 100));
  return fresh(bytes);
}

/**
 * A JPEG with an EXIF Orientation tag, the way a phone held upright stores a
 * photo: the pixels as the sensor saw them, and a note saying "turn me".
 */
export function withOrientation(jpeg: Uint8Array, orientation: number): Bytes {
  // Big-endian TIFF with one IFD entry: 0x0112 SHORT 1 = orientation.
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = body.length + 2;
  const app1 = [0xff, 0xe1, length >> 8, length & 0xff, ...body];
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2));
  out.set(app1, 2);
  out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

/**
 * A portrait phone photo as a phone stores it: landscape pixels with the red
 * band on the LEFT, and Orientation 6 ("turn 90° clockwise to view"). Shown
 * the right way up it is portrait with the red band on top.
 */
export function sidewaysPhonePhoto(): Bytes {
  // Drawn landscape, red on the left (which becomes the top), blue at the bottom (which becomes the left).
  const width = 800;
  const height = 600;
  const canvas = createCanvas(width, height);
  const c = canvas.getContext('2d');
  c.fillStyle = '#c8c0a8';
  c.fillRect(0, 0, width, height);
  c.fillStyle = '#d01010';
  c.fillRect(0, 0, 72, height);
  c.fillStyle = '#1030d0';
  c.fillRect(72, height - 72, width - 72, 72);
  return withOrientation(fresh(canvas.toBuffer('image/jpeg', 90)), 6);
}

/** A 24-bit BMP, as old scanners and Paint save them. Red band on top, blue on the left. */
export function bmp(width: number, height: number): Bytes {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + stride * height;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, width, true);
  v.setInt32(22, height, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, stride * height, true);
  const band = Math.round(Math.min(width, height) * 0.12);
  for (let row = 0; row < height; row++) {
    const y = height - 1 - row; // bottom-up
    for (let x = 0; x < width; x++) {
      const at = 54 + row * stride + x * 3;
      const [r, g, b] = y < band ? [208, 16, 16] : x < band ? [16, 48, 208] : [200, 200, 170];
      out[at] = b;
      out[at + 1] = g;
      out[at + 2] = r;
    }
  }
  return out;
}

/** A 2×2 GIF, red: the kind of picture old websites and WhatsApp stickers are. */
export const RED_GIF: Bytes = Uint8Array.from(atob('R0lGODlhAgACAIAAAP8AAP///yH5BAAAAAAALAAAAAACAAIAAAIChFEAOw=='), (c) => c.charCodeAt(0));

/** The first bytes of an iPhone HEIC photo; browsers other than Safari cannot decode one. */
export function fakeHeic(): Bytes {
  const out = new Uint8Array(64);
  out.set([0, 0, 0, 24], 0);
  out.set(new TextEncoder().encode('ftypheic'), 4);
  return out;
}

// ---------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export interface Report {
  readonly bytes: Bytes;
  readonly title: string;
  readonly headings: readonly string[];
  /** Sentences that must survive whole into any text format. */
  readonly sentences: readonly string[];
  readonly bullets: readonly string[];
  readonly table: ReadonlyArray<readonly string[]>;
  readonly caption: string;
  /** The photo on page 2, as the JPEG bytes embedded. */
  readonly photo: Bytes;
}

const SUMMARY =
  'The cooperative supplied clean drinking water to more households this year than in any year before. Two new treatment plants opened, leakage fell for the third year running, and every district now has a complaint desk that answers within two days.';
const PLANT =
  'The Aluva plant treats forty million litres a day. It replaced a station built in 1974, and its filters can be cleaned without stopping the supply. The old building will become a training centre for operators from the smaller districts.';
const OUTLOOK =
  'Next year the board will extend metered connections to the hill districts, publish water quality results every month, and halve the time a new connection takes. The tariff for the first ten thousand litres will not change.';

/** Three A4 pages: a title, numbered headings, paragraphs, a bulleted list, a ruled table of figures, a photo with a caption, and a numbered list. */
export async function reportPdf(): Promise<Report> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.14);
  const M = 56;
  const W = A4[0] - 2 * M;
  const title = 'Annual Report 2025';
  const headings = ['1. Summary', '2. Figures by district', '3. The new plant', '4. Outlook'];
  const bullets = ['Connections grew by twelve per cent.', 'Leakage fell to eighteen per cent of supply.', 'Complaints were answered in two days on average.'];
  const table = [
    ['District', 'Households', 'Revenue (Rs.)', 'Growth'],
    ['Ernakulam', '1,24,500', '18,42,000.00', '12%'],
    ['Thrissur', '98,200', '12,05,500.00', '9%'],
    ['Kozhikode', '87,650', '10,98,250.00', '11%'],
    ['Idukki', '23,400', '2,64,800.00', '15%'],
  ];
  const caption = 'Figure 1: The new treatment plant at Aluva.';
  const numbered = ['Metered connections in the hill districts.', 'Monthly water quality results, published online.', 'New connections within fifteen days.'];

  let page = doc.addPage(A4);
  let y = A4[1] - 72;
  const para = (text: string, size = 11) => {
    for (const line of wrap(text, font, size, W)) {
      page.drawText(line, { x: M, y, size, font, color: ink });
      y -= size * 1.4;
    }
    y -= size * 0.8;
  };
  const heading = (text: string) => {
    y -= 8;
    page.drawText(text, { x: M, y, size: 16, font: bold, color: ink });
    y -= 26;
  };

  page.drawText(title, { x: M, y, size: 26, font: bold, color: rgb(0.05, 0.25, 0.5) });
  y -= 22;
  page.drawText('Kerala Water Cooperative, Kochi', { x: M, y, size: 12, font, color: ink });
  y -= 36;
  heading(headings[0]!);
  para(SUMMARY);
  for (const b of bullets) {
    page.drawText('•', { x: M + 8, y, size: 11, font, color: ink });
    page.drawText(b, { x: M + 22, y, size: 11, font, color: ink });
    y -= 16;
  }
  y -= 8;
  heading(headings[1]!);
  // A ruled table: header shaded, figures right-aligned.
  const colX = [M, M + 150, M + 260, M + 400];
  const colR = [M + 145, M + 255, M + 395, M + W];
  const rowH = 20;
  page.drawRectangle({ x: M, y: y - 6, width: W, height: rowH, color: rgb(0.9, 0.93, 0.97) });
  table.forEach((row, r) => {
    row.forEach((cell, i) => {
      const f = r === 0 ? bold : font;
      const x = i === 0 ? colX[i]! + 4 : colR[i]! - 4 - f.widthOfTextAtSize(cell, 10);
      page.drawText(cell, { x, y, size: 10, font: f, color: ink });
    });
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: M + W, y: y - 6 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.65) });
    y -= rowH;
  });
  y -= 10;
  para('Revenue is shown in rupees for the financial year ending in March.');

  page = doc.addPage(A4);
  y = A4[1] - 72;
  heading(headings[2]!);
  const jpeg = photo(900, 600, { quality: 0.85 });
  const embedded = await doc.embedJpg(jpeg);
  page.drawImage(embedded, { x: M + 60, y: y - 240, width: 360, height: 240 });
  y -= 262;
  page.drawText(caption, { x: M + 60, y, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
  y -= 30;
  para(PLANT);

  page = doc.addPage(A4);
  y = A4[1] - 72;
  heading(headings[3]!);
  para(OUTLOOK);
  numbered.forEach((n, i) => {
    page.drawText(`${i + 1}.`, { x: M + 6, y, size: 11, font, color: ink });
    page.drawText(n, { x: M + 22, y, size: 11, font, color: ink });
    y -= 16;
  });

  // A running header on the pages after the first, and a page number at the foot of every page.
  doc.getPages().forEach((p, i) => {
    if (i > 0) p.drawText('Kerala Water Cooperative - Annual Report 2025', { x: M, y: A4[1] - 36, size: 8, font, color: rgb(0.4, 0.4, 0.45) });
    const label = `Page ${i + 1} of ${doc.getPageCount()}`;
    p.drawText(label, { x: (A4[0] - font.widthOfTextAtSize(label, 9)) / 2, y: 30, size: 9, font, color: rgb(0.4, 0.4, 0.45) });
  });
  return {
    bytes: fresh(await doc.save()),
    title,
    headings,
    sentences: ['Two new treatment plants opened', 'The Aluva plant treats forty million litres a day.', 'The tariff for the first ten thousand litres will not change.'],
    bullets: [...bullets, ...numbered],
    table,
    caption,
    photo: jpeg,
  };
}

export interface SalarySlip {
  readonly bytes: Bytes;
  readonly employee: string;
  readonly earnings: ReadonlyArray<readonly [string, number]>;
  readonly deductions: ReadonlyArray<readonly [string, number]>;
  readonly gross: number;
  readonly totalDeductions: number;
  readonly net: number;
}

const inr = (n: number): string => {
  const [w = '0', p = '00'] = n.toFixed(2).split('.');
  const last3 = w.slice(-3);
  const rest = w.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest ? `${rest},${last3}` : last3}.${p}`;
};

/** A one-page Indian payslip: company header, employee details, an earnings and deductions table side by side, net pay. */
export async function salarySlipPdf(): Promise<SalarySlip> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  const ink = rgb(0.1, 0.1, 0.12);
  const M = 48;
  const right = (t: string, x: number, y: number, f: PDFFont = font, size = 10) => page.drawText(t, { x: x - f.widthOfTextAtSize(t, size), y, size, font: f, color: ink });
  const centre = (t: string, y: number, f: PDFFont, size: number) => page.drawText(t, { x: (A4[0] - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color: ink });
  centre('TECHNOPARK SOLUTIONS PVT LTD', 790, bold, 16);
  centre('Phase III, Technopark, Thiruvananthapuram 695583', 774, font, 9);
  centre('Payslip for the month of September 2026', 750, bold, 12);
  const details: Array<[string, string, string, string]> = [
    ['Employee name', 'Anjali Menon', 'Employee ID', 'TPS-0421'],
    ['Designation', 'Senior Engineer', 'PAN', 'ABCPM1234K'],
    ['Department', 'Platform', 'Bank account', 'XXXXXX4521'],
    ['Date of joining', '12/06/2019', 'Days paid', '30'],
  ];
  details.forEach(([a, b, c, d], i) => {
    const y = 716 - i * 16;
    page.drawText(a, { x: M, y, size: 10, font: bold, color: ink });
    page.drawText(b, { x: M + 110, y, size: 10, font, color: ink });
    page.drawText(c, { x: M + 270, y, size: 10, font: bold, color: ink });
    page.drawText(d, { x: M + 370, y, size: 10, font, color: ink });
  });
  const earnings: Array<[string, number]> = [
    ['Basic', 45000],
    ['House Rent Allowance', 22500],
    ['Special Allowance', 12300],
    ['Conveyance', 1600],
  ];
  const deductions: Array<[string, number]> = [
    ['Provident Fund', 5400],
    ['Professional Tax', 200],
    ['Income Tax (TDS)', 6850],
  ];
  const gross = earnings.reduce((n, [, v]) => n + v, 0);
  const totalDeductions = deductions.reduce((n, [, v]) => n + v, 0);
  const net = gross - totalDeductions;
  let y = 630;
  page.drawRectangle({ x: M, y: y - 5, width: A4[0] - 2 * M, height: 18, color: rgb(0.9, 0.92, 0.96) });
  page.drawText('Earnings', { x: M + 4, y, size: 10, font: bold, color: ink });
  right('Amount (Rs.)', M + 240, y, bold);
  page.drawText('Deductions', { x: M + 260, y, size: 10, font: bold, color: ink });
  right('Amount (Rs.)', A4[0] - M - 4, y, bold);
  y -= 20;
  for (let i = 0; i < Math.max(earnings.length, deductions.length); i++) {
    const e = earnings[i];
    const d = deductions[i];
    if (e) {
      page.drawText(e[0], { x: M + 4, y, size: 10, font, color: ink });
      right(inr(e[1]), M + 240, y);
    }
    if (d) {
      page.drawText(d[0], { x: M + 260, y, size: 10, font, color: ink });
      right(inr(d[1]), A4[0] - M - 4, y);
    }
    y -= 18;
  }
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: A4[0] - M, y: y + 10 }, thickness: 0.6, color: ink });
  page.drawText('Total Earnings', { x: M + 4, y, size: 10, font: bold, color: ink });
  right(inr(gross), M + 240, y, bold);
  page.drawText('Total Deductions', { x: M + 260, y, size: 10, font: bold, color: ink });
  right(inr(totalDeductions), A4[0] - M - 4, y, bold);
  y -= 34;
  page.drawText(`Net Pay: Rs. ${inr(net)}`, { x: M, y, size: 12, font: bold, color: ink });
  y -= 16;
  page.drawText('Rupees Sixty Eight Thousand Nine Hundred Fifty only', { x: M, y, size: 10, font, color: ink });
  y -= 40;
  page.drawText('This is a computer generated payslip and needs no signature.', { x: M, y, size: 8, font, color: rgb(0.4, 0.4, 0.45) });
  return { bytes: fresh(await doc.save()), employee: 'Anjali Menon', earnings, deductions, gross, totalDeductions, net };
}

export const LEASE_CLAUSES = [
  'The tenant shall pay a monthly rent of Rs. 15,000 on or before the fifth day of every month.',
  'The tenant has paid a security deposit of Rs. 45,000, which the owner shall return when the tenant leaves, less any unpaid rent.',
  'The owner shall keep the roof, the outer walls and the water supply in good repair.',
  'The tenant shall not sublet the flat or use it for any business without the written consent of the owner.',
  'Either party may end this agreement by giving two months notice in writing.',
  'This agreement runs for eleven months from the first of October 2026 and may be renewed by mutual consent.',
] as const;

/** A four-page residential lease in Times, numbered clauses, with signature lines on the last page. */
export async function leasePdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.08, 0.08, 0.1);
  const M = 72;
  const W = A4[0] - 2 * M;
  const filler =
    'Both parties have read this clause, understood it, and agree to be bound by it for the whole term of the agreement and any renewal of it. Nothing in this clause takes away a right the law gives either of them.';
  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - 90;
  const t = 'RENTAL AGREEMENT';
  page.drawText(t, { x: (A4[0] - bold.widthOfTextAtSize(t, 18)) / 2, y, size: 18, font: bold, color: ink });
  y -= 36;
  for (const line of wrap('This agreement is made at Kochi between Joseph Mathew (the owner) and Anjali Menon (the tenant) for the flat at 4B Rose Gardens, Kakkanad.', font, 12, W)) {
    page.drawText(line, { x: M, y, size: 12, font, color: ink });
    y -= 17;
  }
  y -= 12;
  LEASE_CLAUSES.forEach((clause, i) => {
    for (const [k, line] of wrap(`${clause} ${filler} ${filler}`, font, 12, W - 24).entries()) {
      if (y < 90) {
        page = doc.addPage(A4);
        y = A4[1] - 90;
      }
      if (k === 0) page.drawText(`${i + 1}.`, { x: M, y, size: 12, font: bold, color: ink });
      page.drawText(line, { x: M + 24, y, size: 12, font, color: ink });
      y -= 17;
    }
    y -= 10;
  });
  if (doc.getPageCount() < 4) {
    page = doc.addPage(A4);
    y = A4[1] - 90;
  }
  y -= 40;
  page.drawText('Owner: ______________________', { x: M, y, size: 12, font, color: ink });
  page.drawText('Tenant: ______________________', { x: M + 250, y, size: 12, font, color: ink });
  return fresh(await doc.save());
}

/** A PDF with photos of different kinds inside: a JPEG, a lossless (Flate) RGB photo, and a greyscale scan; the JPEG is used on two pages. */
export async function photoAlbumPdf(): Promise<{ bytes: Bytes; jpeg: Bytes; flateSize: [number, number] }> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const jpeg = photo(640, 480, { quality: 0.8 });
  const embeddedJpeg = await doc.embedJpg(jpeg);
  const png = photo(300, 200, { format: 'png' });
  const embeddedPng = await doc.embedPng(png);
  // A greyscale picture, as a scanner stores a page: DeviceGray, 8 bits, Flate.
  const gw = 200;
  const gh = 260;
  const grey = new Uint8Array(gw * gh);
  for (let i = 0; i < grey.length; i++) grey[i] = (i % gw) % 40 < 4 ? 40 : 220;
  const { zlibSync } = await import('fflate');
  const greyRef = doc.context.register(
    doc.context.stream(zlibSync(grey), { Type: 'XObject', Subtype: 'Image', Width: gw, Height: gh, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }),
  );
  const one = doc.addPage(A4);
  one.drawImage(embeddedJpeg, { x: 60, y: 450, width: 320, height: 240 });
  one.drawImage(embeddedPng, { x: 60, y: 200, width: 300, height: 200 });
  const two = doc.addPage(A4);
  two.drawImage(embeddedJpeg, { x: 100, y: 500, width: 160, height: 120 });
  two.node.setXObject(PDFName.of('Scan'), greyRef);
  two.node.addContentStream(doc.context.register(doc.context.stream(`q ${gw} 0 0 ${gh} 100 100 cm /Scan Do Q`)));
  return { bytes: fresh(await doc.save()), jpeg, flateSize: [300, 200] };
}

/** Landscape slides, as a deck exported to PDF: 16:9, a big title and a line of text on each. */
export async function slidesPdf(n = 3): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < n; i++) {
    const page = doc.addPage([960, 540]);
    page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: rgb(0.95, 0.96, 0.99) });
    page.drawRectangle({ x: 0, y: 470, width: 960, height: 70, color: rgb(0.1, 0.25, 0.55) });
    page.drawText(`Slide ${i + 1}: Quarterly review`, { x: 40, y: 490, size: 30, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`Point ${i + 1} — revenue is up in every district.`, { x: 40, y: 380, size: 22, font, color: rgb(0.1, 0.1, 0.1) });
  }
  return fresh(await doc.save());
}

// ---------------------------------------------------------------------
// Word and Excel, written as Word and Excel write them
// ---------------------------------------------------------------------

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/**
 * A .docx shaped the way Word itself writes one, not the way our own writer
 * does: headings by style id, a numbered list through numbering.xml, a bold
 * and an italic run, a table with a merged cell, a hyperlink, a page break,
 * Malayalam, and a header and footer.
 */
export function wordLetterDocx(): Bytes {
  const p = (text: string, style?: string, extra = '') =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>` : extra ? `<w:pPr>${extra}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const li = (text: string) => `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const tc = (text: string, span = 1) => `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const body = [
    p('Notice of rent revision', 'Title'),
    p('Dear Anjali,', undefined),
    `<w:p><w:r><w:t xml:space="preserve">From April the rent for Flat 4B will be </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Rs. 15,750</w:t></w:r><w:r><w:t xml:space="preserve"> a month, </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>five per cent</w:t></w:r><w:r><w:t xml:space="preserve"> more than now.</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>`,
    p('What changes', 'Heading1'),
    li('The rent goes up by five per cent.'),
    li('Water charges stay the same.'),
    li('The deposit does not change.'),
    p('The figures', 'Heading2'),
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>`,
    `<w:tr>${tc('Item')}${tc('Now')}${tc('From April')}</w:tr>`,
    `<w:tr>${tc('Rent')}${tc('15000')}${tc('15750')}</w:tr>`,
    `<w:tr>${tc('Maintenance')}${tc('1200')}${tc('1200')}</w:tr>`,
    `<w:tr>${tc('Both payable by the fifth of the month', 3)}</w:tr>`,
    `</w:tbl>`,
    `<w:p><w:r><w:t xml:space="preserve">Details are on </w:t></w:r><w:hyperlink r:id="rIdLink"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>the society website</w:t></w:r></w:hyperlink><w:r><w:t>.</w:t></w:r></w:p>`,
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
    p('ആശംസകളോടെ, ജോസഫ് മാത്യു'),
    p('With regards, Joseph Mathew'),
    `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`,
  ].join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/_rels/document.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/rent" TargetMode="External"/></Relationships>',
    ),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}</w:body></w:document>`),
    'word/styles.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:sz w:val="56"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>`,
    ),
    'word/numbering.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    ),
    // "Rent notice <tab> Page 1 of 2": a simple PAGE field, and a NUMPAGES field written the long way, with a stale cached result.
    'word/footer1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W_NS}><w:p><w:r><w:t>Rent notice</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>7</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`,
    ),
    'word/footnotes.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W_NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Approved at the general body meeting on 14 March.</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    ),
    'word/header1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W_NS}><w:p><w:r><w:t>Rose Gardens Residents Association</w:t></w:r></w:p></w:hdr>`),
  };
  return fresh(zipSync(files));
}

/**
 * An .xlsx shaped the way Excel writes one: shared strings, a formula with
 * its cached value, a date, a percentage, a currency format, a second sheet,
 * and a wide third sheet (twelve months across) that needs a sideways page.
 */
export function householdXlsx(): Bytes {
  const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const strings = ['Item', 'Amount', 'Due', 'Rent', 'Electricity', 'Water', 'Total', 'Share', 'Month', 'Paid'];
  const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const allStrings = [...strings, ...months, 'Expense'];
  const s = (ref: string, text: string) => `<c r="${ref}" t="s"><v>${allStrings.indexOf(text)}</v></c>`;
  const n = (ref: string, v: number, style = 0) => `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
  // Sheet 1: Item | Amount (currency format) | Due (a date) | Share (a percentage)
  const sheet1 = [
    `<row r="1">${s('A1', 'Item')}${s('B1', 'Amount')}${s('C1', 'Due')}${s('D1', 'Share')}</row>`,
    `<row r="2">${s('A2', 'Rent')}${n('B2', 15000, 1)}${n('C2', 46121, 2)}${n('D2', 0.75, 3)}</row>`,
    `<row r="3">${s('A3', 'Electricity')}${n('B3', 2380.5, 1)}${n('C3', 46126, 2)}${n('D3', 0.119, 3)}</row>`,
    `<row r="4">${s('A4', 'Water')}${n('B4', 2620, 1)}${n('C4', 46131, 2)}${n('D4', 0.131, 3)}</row>`,
    `<row r="5">${s('A5', 'Total')}<c r="B5" s="1"><f>SUM(B2:B4)</f><v>20000.5</v></c></row>`,
  ].join('');
  // Sheet 2: a short log with a gap row.
  const sheet2 = [`<row r="1">${s('A1', 'Month')}${s('B1', 'Paid')}</row>`, `<row r="2">${s('A2', 'Apr')}${n('B2', 15000)}</row>`, `<row r="4">${s('A4', 'May')}${n('B4', 15000)}</row>`].join('');
  // Sheet 3: twelve months across, too wide for an upright A4.
  const cols = 'ABCDEFGHIJKLM';
  const head = `<row r="1">${s('A1', 'Expense')}${months.map((m, i) => s(`${cols[i + 1]}1`, m)).join('')}</row>`;
  const rows = ['Rent', 'Electricity', 'Water'].map((item, r) => `<row r="${r + 2}">${s(`A${r + 2}`, item)}${months.map((_, i) => n(`${cols[i + 1]}${r + 2}`, [15000, 2100 + i * 35, 650][r]!, 4)).join('')}</row>`).join('');
  const sheet = (rowsXml: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${S}><sheetData>${rowsXml}</sheetData></worksheet>`);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${S}><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/><sheet name="Payments" sheetId="2" r:id="rId2"/><sheet name="Year" sheetId="3" r:id="rId3"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst ${S} count="${allStrings.length}" uniqueCount="${allStrings.length}">${allStrings.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`,
    ),
    'xl/styles.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${S}><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="10" applyNumberFormat="1"/><xf numFmtId="3" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ),
    'xl/worksheets/sheet1.xml': sheet(sheet1),
    'xl/worksheets/sheet2.xml': sheet(sheet2),
    'xl/worksheets/sheet3.xml': sheet(head + rows),
  };
  return fresh(zipSync(files));
}

/**
 * Pictures stored the ways scanners and print tools store them, which a PDF
 * reader draws but a plain "save the bytes" cannot: a palette (Indexed)
 * logo, a CMYK photo from a print workflow, and a one-bit black-and-white
 * scan. Each is 60 × 40 and has a known colour in its top-left corner.
 */
export async function storedOddlyPdf(): Promise<Bytes> {
  const { zlibSync } = await import('fflate');
  const doc = await PDFDocument.create({ updateMetadata: false });
  const w = 60;
  const h = 40;
  // Indexed: two colours, red and white, red on the left half.
  const indexed = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) indexed[y * w + x] = x < w / 2 ? 0 : 1;
  const palette = doc.context.obj([PDFName.of('Indexed'), PDFName.of('DeviceRGB'), 1, PDFHexString.of('FF0000FFFFFF')]);
  const indexedRef = doc.context.register(
    doc.context.stream(zlibSync(indexed), { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: palette, BitsPerComponent: 8, Filter: 'FlateDecode' }),
  );
  // CMYK: pure cyan everywhere.
  const cmyk = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) cmyk[i * 4] = 255;
  const cmykRef = doc.context.register(
    doc.context.stream(zlibSync(cmyk), { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: 'FlateDecode' }),
  );
  // One bit: black on the top half, white below.
  const stride = Math.ceil(w / 8);
  const bits = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) for (let b = 0; b < stride; b++) bits[y * stride + b] = y < h / 2 ? 0x00 : 0xff;
  const bitsRef = doc.context.register(
    doc.context.stream(zlibSync(bits), { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 1, Filter: 'FlateDecode' }),
  );
  const page = doc.addPage([300, 300]);
  page.node.setXObject(PDFName.of('Logo'), indexedRef);
  page.node.setXObject(PDFName.of('Print'), cmykRef);
  page.node.setXObject(PDFName.of('Scan'), bitsRef);
  page.node.addContentStream(doc.context.register(doc.context.stream('q 120 0 0 80 20 200 cm /Logo Do Q q 120 0 0 80 160 200 cm /Print Do Q q 120 0 0 80 20 60 cm /Scan Do Q')));
  return fresh(await doc.save());
}

/**
 * Two A4 pages, each with a heading, a paragraph and a big photo stored
 * losslessly, as a phone's "scan to PDF" or a careless export stores them:
 * several megabytes for two pages, which is what Compress is for. The red
 * band on top of each photo shows where it is.
 */
export async function heavyReportPdf(): Promise<Bytes> {
  const { zlibSync } = await import('fflate');
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let p = 0; p < 2; p++) {
    const w = 1500;
    const h = 1000;
    const png = photo(w, h, { format: 'png' });
    // The PNG's pixels, re-stored as a plain Flate image (no predictor), like many writers do.
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const img = await loadImage(Buffer.from(png));
    const canvas = createCanvas(w, h);
    const c = canvas.getContext('2d');
    c.drawImage(img, 0, 0);
    const rgba = c.getImageData(0, 0, w, h).data;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i]!;
      rgb[j + 1] = rgba[i + 1]!;
      rgb[j + 2] = rgba[i + 2]!;
    }
    const ref = doc.context.register(
      doc.context.stream(zlibSync(rgb), { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' }),
    );
    const page = doc.addPage(A4);
    page.drawText(`Site visit, day ${p + 1}`, { x: 56, y: 780, size: 18, font: bold });
    page.drawText('The new pipeline runs along the canal for two kilometres.', { x: 56, y: 750, size: 11, font });
    page.node.setXObject(PDFName.of('Photo'), ref);
    page.node.addContentStream(doc.context.register(doc.context.stream('q 480 0 0 320 56 380 cm /Photo Do Q')));
  }
  return fresh(await doc.save());
}

/**
 * A site plan: one page of tens of thousands of fine lines and a title, the
 * way CAD and mapping programs export a drawing. Its weight is in its drawing
 * instructions, not in photos, so only turning the page into a picture can
 * make it much smaller.
 */
export async function sitePlanPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let ops = '0.2 w 0.1 0.2 0.5 RG\n';
  for (let i = 0; i < 40_000; i++) {
    const x = 40 + rand() * 515;
    const y = 60 + rand() * 700;
    ops += `${x.toFixed(3)} ${y.toFixed(3)} m ${(x + rand() * 20 - 10).toFixed(3)} ${(y + rand() * 20 - 10).toFixed(3)} l S\n`;
  }
  page.node.addContentStream(doc.context.register(doc.context.flateStream(ops)));
  page.drawText('Site plan, ward 14', { x: 40, y: 790, size: 18, font });
  return fresh(await doc.save());
}

/**
 * A document the way a scanner hands it over: each page one photo of the
 * paper, with the scanner's own guess at the words laid over it where nobody
 * sees them, so the file can be searched. `layer: 'invisible'` writes them in
 * render mode 3, as OmniPage, Adobe Scan and most phone apps do;
 * `layer: 'under'` draws them first and the photo over them, as some older
 * scanners do. The guesses include the kind of junk a real one makes: a
 * barcode read as "1111111", words in another script read as Latin letters.
 */
export async function scannerPdf(layer: 'invisible' | 'under' = 'invisible', pages = 2): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const words = ['REPUBLIC OF INDIA', 'Surname SURESH', 'Given name VYSAKH', 'III11111 1111g1', 'mfiasFl efil /Place of Issue'];
  for (let n = 0; n < pages; n++) {
    const page = doc.addPage([356, 486]);
    const jpeg = await doc.embedJpg(photo(712, 972, { top: n === 0 ? '#c03030' : '#3060c0' }));
    const fontKey = page.node.newFontDictionary(font.name, font.ref);
    const putWords = () => {
      page.pushOperators(beginText(), setFontAndSize(fontKey, 9));
      if (layer === 'invisible') page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
      words.forEach((w, i) => page.pushOperators(moveText(i === 0 ? 30 : 0, i === 0 ? 420 : -40), showText(font.encodeText(`${w} ${n + 1}`))));
      page.pushOperators(endText());
    };
    if (layer === 'under') putWords();
    page.drawImage(jpeg, { x: 0, y: 0, width: 356, height: 486 });
    if (layer === 'invisible') putWords();
  }
  return new Uint8Array(await doc.save());
}
