/**
 * Realistic documents and pictures for the Mark up family's deep tests: the
 * kind of thing people actually stamp, sign, number and fill in. Built on the
 * fly (nothing binary is committed); every name and number is made up.
 *
 * Tests may name the libraries: the seam rule applies to app/ only.
 */
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import type { Bytes } from './pdfs';

const A4: [number, number] = [595.28, 841.89];

const fresh = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

/** A photo-like JPEG: sky, hills, a sun and a house, `w` by `h` pixels. */
export async function photoJpeg(w = 1600, h = 1000, tint = 0): Promise<Bytes> {
  const canvas = createCanvas(w, h);
  const c = canvas.getContext('2d');
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `rgb(${70 + tint}, 130, 200)`);
  sky.addColorStop(1, 'rgb(200, 220, 240)');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgb(250, 200, 60)';
  c.beginPath();
  c.arc(w * 0.8, h * 0.22, Math.min(w, h) * 0.1, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgb(60, 140, 70)';
  c.beginPath();
  c.moveTo(0, h);
  c.quadraticCurveTo(w * 0.3, h * 0.45, w * 0.6, h * 0.8);
  c.quadraticCurveTo(w * 0.8, h * 0.6, w, h * 0.75);
  c.lineTo(w, h);
  c.fill();
  c.fillStyle = 'rgb(170, 60, 50)';
  c.fillRect(w * 0.3, h * 0.55, w * 0.18, h * 0.2);
  return fresh(await canvas.encode('jpeg', 88));
}

/**
 * A JPEG stored sideways with an EXIF orientation of 6 (turn 90° clockwise to
 * view), as phones write a portrait photo. Stored `w` × `h`, seen `h` × `w`.
 * The stored picture is red on its left half, so the seen picture is red on top.
 */
export async function sidewaysPhotoJpeg(w = 800, h = 600): Promise<Bytes> {
  const canvas = createCanvas(w, h);
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgb(220, 30, 30)';
  c.fillRect(0, 0, w / 2, h);
  c.fillStyle = 'rgb(30, 60, 220)';
  c.fillRect(w / 2, 0, w / 2, h);
  const jpeg = new Uint8Array(await canvas.encode('jpeg', 90));
  // APP1 Exif: big-endian TIFF with one IFD entry, Orientation (0x0112) = 6.
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = body.length + 2;
  const app1 = Uint8Array.from([0xff, 0xe1, length >> 8, length & 255, ...body]);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(app1, 2);
  out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

/** A round logo on a see-through background: a solid green disc with a white ring. */
export async function logoPng(size = 400): Promise<Bytes> {
  const canvas = createCanvas(size, size);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, size, size);
  c.fillStyle = 'rgb(20, 150, 80)';
  c.beginPath();
  c.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgb(255, 255, 255)';
  c.lineWidth = size * 0.04;
  c.beginPath();
  c.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
  c.stroke();
  return fresh(await canvas.encode('png'));
}

/** A replacement picture for Edit pictures: a solid orange block. */
export async function orangePng(w = 300, h = 200): Promise<Bytes> {
  const canvas = createCanvas(w, h);
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgb(250, 140, 0)';
  c.fillRect(0, 0, w, h);
  return fresh(await canvas.encode('png'));
}

function paragraph(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size = 10.5, lead = 15): number {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width) {
      page.drawText(line, { x, y, size, font, color: rgb(0.12, 0.12, 0.14) });
      y -= lead;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) page.drawText(line, { x, y, size, font, color: rgb(0.12, 0.12, 0.14) });
  return y - lead;
}

const BODY =
  'Kochi Metro carried more riders this year than in any year before it. Feeder buses now meet every train at Aluva and Vyttila, and the water metro links the islands to the city. Ticket income covered running costs for the first time, and the new line to Kakkanad is on schedule for next year.';

/**
 * A three-page annual report on A4: a title, headings and paragraphs, a photo
 * on page one, a table of figures on page two, and a landscape third page.
 * Every page carries "Page N" small in the body, so page order can be checked.
 */
export async function annualReportPdf(): Promise<{ bytes: Bytes; photo: Bytes }> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const photo = await photoJpeg(1200, 750);
  const image = await doc.embedJpg(photo);

  const one = doc.addPage(A4);
  one.drawText('Annual Report 2025-26', { x: 56, y: 770, size: 24, font: bold, color: rgb(0.1, 0.2, 0.45) });
  one.drawText('Kochi Transit Users Forum', { x: 56, y: 745, size: 12, font, color: rgb(0.35, 0.35, 0.4) });
  one.drawImage(image, { x: 56, y: 470, width: 400, height: 250 });
  one.drawText('1. The year in short', { x: 56, y: 440, size: 15, font: bold });
  let y = paragraph(one, font, BODY, 56, 418, 480);
  y = paragraph(one, font, BODY, 56, y - 6, 480);
  one.drawText('Page 1', { x: 56, y: 120, size: 9, font });

  const two = doc.addPage(A4);
  two.drawText('2. Figures', { x: 56, y: 780, size: 15, font: bold });
  const rows = [
    ['Quarter', 'Riders', 'Income (Rs.)', 'Costs (Rs.)'],
    ['April - June', '2,41,300', '1,82,40,000', '1,95,10,000'],
    ['July - September', '2,58,900', '1,96,75,500', '1,93,20,000'],
    ['October - December', '2,77,450', '2,10,05,250', '1,98,60,000'],
    ['January - March', '2,90,120', '2,21,30,000', '2,01,45,000'],
  ];
  const cols = [56, 210, 330, 450];
  rows.forEach((row, r) => {
    const ry = 740 - r * 26;
    if (r === 0) two.drawRectangle({ x: 50, y: ry - 8, width: 495, height: 24, color: rgb(0.9, 0.93, 0.97) });
    row.forEach((cell, k) => {
      const f = r === 0 ? bold : font;
      const x = k === 0 ? cols[0]! : cols[k]! + 90 - f.widthOfTextAtSize(cell, 10.5);
      two.drawText(cell, { x, y: ry, size: 10.5, font: f });
    });
  });
  paragraph(two, font, BODY, 56, 560, 480);
  two.drawText('Page 2', { x: 56, y: 120, size: 9, font });

  const three = doc.addPage([A4[1], A4[0]]);
  three.drawText('3. The year ahead', { x: 56, y: 520, size: 15, font: bold });
  paragraph(three, font, BODY, 56, 495, 700);
  three.drawText('Page 3', { x: 56, y: 80, size: 9, font });

  return { bytes: fresh(await doc.save()), photo };
}

/**
 * An Indian salary slip: company, employee details, earnings and deductions
 * side by side with right-aligned amounts, and the net pay. One A4 page.
 */
export async function salarySlipPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  const ink = rgb(0.1, 0.1, 0.12);
  page.drawText('Periyar Software Services Pvt. Ltd.', { x: 56, y: 780, size: 16, font: bold, color: ink });
  page.drawText('Payslip for the month of September 2026', { x: 56, y: 758, size: 11, font, color: ink });
  const details = [
    ['Employee name', 'Anjali Menon'],
    ['Employee ID', 'PSS-0482'],
    ['Designation', 'Senior Engineer'],
    ['PAN', 'ABCPM1234K'],
  ];
  details.forEach(([k, v], i) => {
    page.drawText(k!, { x: 56, y: 720 - i * 18, size: 10, font, color: ink });
    page.drawText(v!, { x: 200, y: 720 - i * 18, size: 10, font: bold, color: ink });
  });
  const right = (text: string, x: number, y: number, f = font) => page.drawText(text, { x: x - f.widthOfTextAtSize(text, 10), y, size: 10, font: f, color: ink });
  page.drawText('Earnings', { x: 56, y: 620, size: 11, font: bold, color: ink });
  page.drawText('Deductions', { x: 320, y: 620, size: 11, font: bold, color: ink });
  const earnings = [
    ['Basic', '45,000.00'],
    ['House rent allowance', '18,000.00'],
    ['Special allowance', '12,500.00'],
  ];
  const deductions = [
    ['Provident fund', '5,400.00'],
    ['Professional tax', '200.00'],
    ['Income tax (TDS)', '7,999.00'],
  ];
  earnings.forEach(([k, v], i) => {
    page.drawText(k!, { x: 56, y: 596 - i * 18, size: 10, font, color: ink });
    right(v!, 280, 596 - i * 18);
  });
  deductions.forEach(([k, v], i) => {
    page.drawText(k!, { x: 320, y: 596 - i * 18, size: 10, font, color: ink });
    right(v!, 540, 596 - i * 18);
  });
  page.drawLine({ start: { x: 56, y: 530 }, end: { x: 540, y: 530 }, thickness: 0.8, color: ink });
  page.drawText('Gross earnings', { x: 56, y: 512, size: 10, font: bold, color: ink });
  right('75,500.00', 280, 512, bold);
  page.drawText('Total deductions', { x: 320, y: 512, size: 10, font: bold, color: ink });
  right('13,599.00', 540, 512, bold);
  page.drawText('Net pay', { x: 56, y: 480, size: 12, font: bold, color: ink });
  page.drawText('Rs. 61,901.00', { x: 200, y: 480, size: 12, font: bold, color: ink });
  return fresh(await doc.save());
}

const LEASE = [
  'This agreement is made at Kochi on the first day of October 2026 between Joseph Mathew, the owner, and Anjali Menon, the tenant.',
  'The owner lets the flat at 4B Rose Gardens, Kakkanad, to the tenant for eleven months from the first of October 2026.',
  'The rent is fifteen thousand rupees a month, paid on or before the fifth day of each month by bank transfer.',
  'The tenant has paid a deposit of fifty thousand rupees, to be returned within thirty days of the tenant leaving.',
  'Either party may end this agreement with two months of notice in writing.',
];

/**
 * A two-page lease: clauses on page one, and on page two the signature
 * blocks, each a line of underscores with its label beside it. What Sign and
 * Create a form are for.
 */
export async function leasePdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const one = doc.addPage(A4);
  one.drawText('RENTAL AGREEMENT', { x: 56, y: 780, size: 18, font: bold });
  let y = 740;
  LEASE.forEach((clause, i) => {
    y = paragraph(one, font, `${i + 1}. ${clause}`, 56, y, 480, 11, 16) - 8;
  });
  one.drawText('Page 1 of 2', { x: 260, y: 40, size: 9, font });
  const two = doc.addPage(A4);
  two.drawText('Signed by the parties', { x: 56, y: 780, size: 14, font: bold });
  two.drawText('Owner: ______________________', { x: 56, y: 700, size: 11, font });
  two.drawText('Tenant: ______________________', { x: 56, y: 640, size: 11, font });
  two.drawText('Date: ______________', { x: 56, y: 580, size: 11, font });
  two.drawText('Page 2 of 2', { x: 260, y: 40, size: 9, font });
  return fresh(await doc.save());
}

/**
 * A realistic application form, every kind of field a government or bank
 * form has: name (pre-filled), a ten-character PIN-code box, a multi-line
 * address, a nationality dropdown, a yes/no radio, two tick boxes (one
 * ticked), and a Date of birth on page two.
 */
export async function applicationFormPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();
  const one = doc.addPage(A4);
  one.drawText('Application for a library card', { x: 56, y: 780, size: 16, font: bold });
  const label = (page: PDFPage, text: string, y: number) => page.drawText(text, { x: 56, y: y + 6, size: 10, font });
  label(one, 'Full name', 720);
  const name = form.createTextField('applicant.full_name');
  name.setText('Ravi Kumar');
  name.addToPage(one, { x: 180, y: 714, width: 300, height: 22 });
  label(one, 'PIN code', 680);
  const pin = form.createTextField('pin');
  pin.setMaxLength(6);
  pin.addToPage(one, { x: 180, y: 674, width: 100, height: 22 });
  label(one, 'Address', 630);
  const address = form.createTextField('address');
  address.enableMultiline();
  address.addToPage(one, { x: 180, y: 580, width: 300, height: 66 });
  label(one, 'Nationality', 540);
  const nationality = form.createDropdown('nationality');
  nationality.addOptions(['Indian', 'Overseas Citizen of India', 'Other']);
  nationality.addToPage(one, { x: 180, y: 534, width: 200, height: 22 });
  label(one, 'Student?', 500);
  const student = form.createRadioGroup('student');
  student.addOptionToPage('Yes', one, { x: 180, y: 500, width: 14, height: 14 });
  student.addOptionToPage('No', one, { x: 240, y: 500, width: 14, height: 14 });
  one.drawText('Yes', { x: 198, y: 502, size: 10, font });
  one.drawText('No', { x: 258, y: 502, size: 10, font });
  label(one, 'Send me the newsletter', 460);
  const news = form.createCheckBox('newsletter');
  news.addToPage(one, { x: 220, y: 460, width: 14, height: 14 });
  label(one, 'I agree to the rules', 430);
  const agree = form.createCheckBox('agree');
  agree.check();
  agree.addToPage(one, { x: 220, y: 430, width: 14, height: 14 });
  const two = doc.addPage(A4);
  two.drawText('Page 2: more about you', { x: 56, y: 780, size: 14, font: bold });
  label(two, 'Date of birth', 720);
  form.createTextField('dob').addToPage(two, { x: 180, y: 714, width: 160, height: 22 });
  return fresh(await doc.save());
}

/** A page that paints itself white first, as Chrome's and Skia's PDFs do, with text on top. */
export async function whitePaintedPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage(A4);
    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 1, 1) });
    page.drawText(`Printed from a browser, page ${i + 1}`, { x: 56, y: 760, size: 14, font });
  }
  return fresh(await doc.save());
}

/**
 * Four pages, one per /Rotate (0, 90, 180, 270), each A4 portrait as stored
 * with a word near its own top: a scanned bundle where some pages went
 * through sideways.
 */
export async function turnedPagesPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const turn of [0, 90, 180, 270]) {
    const page = doc.addPage(A4);
    page.drawText(`Turned ${turn}`, { x: 56, y: 780, size: 14, font });
    page.setRotation(degrees(turn));
  }
  return fresh(await doc.save());
}

/** A page with two pictures placed side by side: a photo (left) and a logo (right). For Edit pictures. */
export async function brochurePdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const photo = await doc.embedJpg(await photoJpeg(600, 400));
  const logo = await doc.embedPng(await logoPng(200));
  const page = doc.addPage(A4);
  page.drawText('Onam Sale at Lulu', { x: 56, y: 780, size: 22, font });
  page.drawImage(photo, { x: 56, y: 480, width: 300, height: 200 });
  page.drawImage(logo, { x: 400, y: 520, width: 140, height: 140 });
  return fresh(await doc.save());
}
