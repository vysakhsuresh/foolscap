/**
 * Realistic sample documents for the Protect and Read tools: an Indian salary
 * slip carrying everything a file can hide (details, XMP, a script, an
 * attachment, a comment, a photo with its own metadata), two versions of a
 * three-page lease, a report with a table and a photo, a scan of the slip,
 * and phone photos of a sheet of paper on a table. Every name, number and
 * company here is made up. Built with pdf-lib on the fly, like the rest of
 * the fixtures, so nothing binary is committed.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import { pagePng } from './protect-inspect';

export type Bytes = Uint8Array<ArrayBuffer>;

const A4: [number, number] = [595.28, 841.89];
const fresh = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

/** The words on the slip a test looks for, so a test and the fixture never disagree. */
/** What a phone writes into a photo, which Clean hidden data must take out. */
export const CAMERA = { gps: 'GPS 9.9312N 76.2673E Kochi', device: 'Pixel 7 Pro', comment: 'Taken by Anjali' } as const;

/**
 * A 160 × 200 photo as a phone saves it: a JPEG with an Exif block naming the
 * device and the place, an XMP block, and a comment, all before the picture.
 */
export async function phoneJpeg(): Promise<Bytes> {
  const canvas = createCanvas(160, 200);
  const c = canvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 160, 200);
  g.addColorStop(0, '#d9a066');
  g.addColorStop(1, '#5b7fa3');
  c.fillStyle = g;
  c.fillRect(0, 0, 160, 200);
  const plain = new Uint8Array(await canvas.encode('jpeg', 90));
  const segment = (marker: number, body: Uint8Array) => {
    const out = new Uint8Array(4 + body.length);
    out[0] = 0xff;
    out[1] = marker;
    out[2] = (body.length + 2) >> 8;
    out[3] = (body.length + 2) & 0xff;
    out.set(body, 4);
    return out;
  };
  const enc = (t: string) => new TextEncoder().encode(t);
  const exif = segment(0xe1, enc(`Exif\0\0MM\0*\0\0\0\x08 Make=Google Model=${CAMERA.device} ${CAMERA.gps} DateTime=2026:09:30 18:42:11`));
  const xmp = segment(0xe1, enc(`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description exif:GPSLatitude="${CAMERA.gps}"/></x:xmpmeta>`));
  const comment = segment(0xfe, enc(CAMERA.comment));
  const parts = [plain.subarray(0, 2), exif, xmp, comment, plain.subarray(2)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const SLIP = {
  employee: 'Anjali Menon',
  pan: 'ABCPM1234K',
  aadhaar: '2345 6789 0123',
  phone: '+91 98470 12345',
  email: 'anjali.menon@example.in',
  account: '50100234567891',
  net: '78,450.00',
  author: 'Meera Pillai (Payroll)',
  xmpAuthor: 'meera.pillai@payroll.example',
  comment: 'Check the HRA figure before sending',
  attachment: 'payroll-export.csv',
  attachmentText: 'emp_id,name,net\nKT0042,Anjali Menon,78450\n',
} as const;

function line(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = rgb(0.1, 0.1, 0.12)): void {
  page.drawText(text, { x, y, size, font, color });
}

/** A photo-like gradient picture, stored losslessly, with its own XMP metadata stream (as Photoshop leaves). */
function photo(doc: PDFDocument, width: number, height: number, xmpAuthor: string | null) {
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      pixels[at] = (60 + (x * 150) / width) | 0;
      pixels[at + 1] = (90 + (y * 120) / height) | 0;
      pixels[at + 2] = 150;
    }
  }
  const dict: Record<string, unknown> = {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'FlateDecode',
  };
  if (xmpAuthor !== null) {
    const xmp = doc.context.stream(xmpPacket({ creator: xmpAuthor, tool: 'Adobe Photoshop 25.1 (Windows)', title: 'ID photo' }), { Type: 'Metadata', Subtype: 'XML' });
    dict['Metadata'] = doc.context.register(xmp);
  }
  return doc.context.register(doc.context.stream(zlibSync(pixels), dict as never));
}

function xmpPacket(o: { creator: string; tool: string; title: string }): Uint8Array {
  return new TextEncoder().encode(`<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<dc:creator><rdf:Seq><rdf:li>${o.creator}</rdf:li></rdf:Seq></dc:creator>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${o.title}</rdf:li></rdf:Alt></dc:title>
<xmp:CreatorTool>${o.tool}</xmp:CreatorTool>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`);
}

export interface SlipOptions {
  /** Details, XMP, a script that runs on opening, an attachment, a comment and a photo with its own metadata. */
  readonly hidden?: boolean;
}

/**
 * One A4 payslip, laid out the way Indian payroll software prints one: the
 * company, the employee's details (PAN, Aadhaar, phone, email, bank account),
 * earnings and deductions side by side, and the net pay in figures and words.
 */
export async function salarySlipPdf(opts: SlipOptions = {}): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  page.drawRectangle({ x: 40, y: 760, width: 515, height: 50, color: rgb(0.93, 0.95, 0.98) });
  line(page, 'Kayal Technologies Pvt Ltd', 56, 788, 16, bold);
  line(page, 'Infopark Phase 2, Kakkanad, Kochi 682042', 56, 770, 9, font);
  line(page, 'Payslip for September 2026', 380, 788, 11, bold);

  const details: Array<[string, string]> = [
    ['Employee name', SLIP.employee],
    ['Employee ID', 'KT0042'],
    ['Designation', 'Senior Accountant'],
    ['PAN', SLIP.pan],
    ['Aadhaar', SLIP.aadhaar],
    ['Phone', SLIP.phone],
    ['Email', SLIP.email],
    ['Bank account', SLIP.account],
  ];
  details.forEach(([k, v], i) => {
    const y = 730 - i * 18;
    line(page, k, 56, y, 10, font, rgb(0.35, 0.35, 0.4));
    line(page, v, 190, y, 10, bold);
  });

  // Earnings and deductions, side by side.
  const top = 570;
  page.drawRectangle({ x: 40, y: top - 4, width: 515, height: 20, color: rgb(0.85, 0.88, 0.93) });
  line(page, 'Earnings', 56, top + 2, 10, bold);
  line(page, 'Amount', 230, top + 2, 10, bold);
  line(page, 'Deductions', 320, top + 2, 10, bold);
  line(page, 'Amount', 490, top + 2, 10, bold);
  const earnings: Array<[string, string]> = [
    ['Basic', '45,000.00'],
    ['HRA', '18,000.00'],
    ['Special allowance', '16,250.00'],
    ['Conveyance', '1,600.00'],
  ];
  const deductions: Array<[string, string]> = [
    ['Provident fund', '1,800.00'],
    ['Professional tax', '200.00'],
    ['Income tax (TDS)', '400.00'],
  ];
  for (let i = 0; i < 4; i++) {
    const y = top - 22 - i * 18;
    const e = earnings[i];
    const d = deductions[i];
    if (e) {
      line(page, e[0], 56, y, 10, font);
      line(page, e[1], 230, y, 10, font);
    }
    if (d) {
      line(page, d[0], 320, y, 10, font);
      line(page, d[1], 490, y, 10, font);
    }
  }
  line(page, 'Gross earnings 80,850.00', 56, top - 110, 10, bold);
  line(page, 'Total deductions 2,400.00', 320, top - 110, 10, bold);
  page.drawRectangle({ x: 40, y: top - 160, width: 515, height: 30, color: rgb(0.93, 0.97, 0.93) });
  line(page, `Net pay ${SLIP.net}`, 56, top - 150, 13, bold);
  line(page, 'Rupees Seventy Eight Thousand Four Hundred Fifty only', 230, top - 150, 9, font);
  line(page, 'This is a computer generated payslip and needs no signature.', 56, 80, 8, font, rgb(0.4, 0.4, 0.45));

  if (opts.hidden) {
    // An ID photo in the corner, carrying its own XMP from the editor that made it.
    const ref = photo(doc, 120, 150, SLIP.xmpAuthor);
    page.node.setXObject(PDFName.of('IdPhoto'), ref);
    page.node.addContentStream(doc.context.register(doc.context.stream('q 72 0 0 90 470 620 cm /IdPhoto Do Q')));
    // A phone photo of the employee, Exif and all.
    const jpeg = await doc.embedJpg(await phoneJpeg());
    page.drawImage(jpeg, { x: 470, y: 520, width: 64, height: 80 });
    // A stored thumbnail of the page, as some scanners and editors keep.
    page.node.set(PDFName.of('Thumb'), doc.context.register(doc.context.stream(zlibSync(new Uint8Array(30 * 42 * 3).fill(200)), { Width: 30, Height: 42, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' } as never)));
    // Private data an editing program leaves on a page.
    page.node.set(PDFName.of('PieceInfo'), doc.context.obj({ Illustrator: { Private: PDFString.of(`Edited by ${SLIP.author}`) } }));

    doc.setTitle('Payslip September 2026 - Anjali Menon');
    doc.setAuthor(SLIP.author);
    doc.setSubject('Salary slip');
    doc.setKeywords(['payslip', 'confidential']);
    doc.setCreator('Tally.ERP 9');
    doc.setProducer('Tally PDF Writer 3.1');
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(doc.context.stream(xmpPacket({ creator: SLIP.xmpAuthor, tool: 'Tally.ERP 9', title: 'Payslip September 2026' }), { Type: 'Metadata', Subtype: 'XML' })));

    // A script that runs when the file opens, and one on the page.
    const js = doc.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert("Payroll");') });
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(js));
    page.node.set(PDFName.of('AA'), doc.context.obj({ O: { S: 'JavaScript', JS: PDFString.of('this.print();') } }));

    await doc.attach(new TextEncoder().encode(SLIP.attachmentText), SLIP.attachment, { mimeType: 'text/csv', description: 'Payroll export' });

    const note = doc.context.register(
      doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [500, 520, 520, 540], Contents: PDFHexString.fromText(SLIP.comment), T: PDFString.of('Meera') }),
    );
    const link = doc.context.register(
      doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [56, 60, 300, 75], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://example.in/payroll') } }),
    );
    page.node.set(PDFName.of('Annots'), doc.context.obj([note, link]));
  }
  return fresh(await doc.save({ useObjectStreams: true }));
}

const CLAUSES_V1: string[][] = [
  [
    'LEAVE AND LICENCE AGREEMENT',
    'This agreement is made at Kochi on the first day of October 2026 between Joseph Mathew, the licensor, and Anjali Menon, the licensee.',
    '1. Premises. The licensor allows the licensee to use Flat 4B, Rose Gardens, Panampilly Nagar, Kochi, for residence only.',
    '2. Term. The licence runs for eleven months from the first of October 2026.',
    '3. Rent. The licensee shall pay a monthly rent of 18000 rupees on or before the fifth day of each month.',
  ],
  [
    '4. Deposit. The licensee has paid a refundable deposit of 54000 rupees, to be returned within thirty days of handing back the keys.',
    '5. Maintenance. The licensee shall keep the flat clean and pay the electricity and water bills.',
    '6. Pets. Pets are not allowed in the premises.',
    '7. Notice. Either party may end this licence with one month notice in writing.',
  ],
  [
    '8. Repairs. The licensor shall carry out structural repairs at his own cost.',
    '9. Visitors. The licensee shall not let any other person live in the flat.',
    'Signed at Kochi in the presence of two witnesses.',
    'Licensor: Joseph Mathew            Licensee: Anjali Menon',
  ],
];

/** The second version: rent and notice changed, pets now allowed, clause 9 gone, a new clause 10. */
const CLAUSES_V2: string[][] = [
  CLAUSES_V1[0]!.map((c) => c.replace('18000', '19500')),
  [
    CLAUSES_V1[1]![0]!,
    CLAUSES_V1[1]![1]!,
    '6. Pets. Pets are allowed in the premises.',
    '7. Notice. Either party may end this licence with two months notice in writing.',
  ],
  [
    CLAUSES_V1[2]![0]!,
    '10. Parking. One covered parking space is included.',
    CLAUSES_V1[2]![2]!,
    CLAUSES_V1[2]![3]!,
  ],
];

/** Wraps `text` to `width` points in `font` at `size`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

/** A three-page lease, version 1 or 2. */
export async function leasePdf(version: 1 | 2): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const pages = version === 1 ? CLAUSES_V1 : CLAUSES_V2;
  pages.forEach((clauses, p) => {
    const page = doc.addPage(A4);
    let y = 770;
    for (const [i, clause] of clauses.entries()) {
      const heading = p === 0 && i === 0;
      const f = heading ? bold : font;
      const size = heading ? 16 : 12;
      for (const l of wrap(clause, f, size, 480)) {
        line(page, l, 60, y, size, f);
        y -= size * 1.5;
      }
      y -= 10;
    }
    line(page, `Page ${p + 1} of 3`, 270, 40, 9, font);
  });
  return fresh(await doc.save({ useObjectStreams: true }));
}

/** The report's table, row by row, for checking an extraction. */
export const REPORT_ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ['Kochi', '1,240', '18.5%'],
  ['Thrissur', '860', '12.1%'],
  ['Kozhikode', '1,015', '15.0%'],
  ['Thiruvananthapuram', '1,390', '21.4%'],
];

/** Two A4 pages: headings, paragraphs, a table and a photo on page 1; a closing section on page 2. */
export async function reportPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const one = doc.addPage(A4);
  line(one, 'Quarterly Sales Review', 56, 780, 20, bold);
  const para = 'Sales across the four districts grew steadily this quarter, led by Thiruvananthapuram, while Thrissur held level after the monsoon.';
  let y = 750;
  for (const l of wrap(para, font, 11, 480)) {
    line(one, l, 56, y, 11, font);
    y -= 15;
  }
  line(one, 'District', 56, 680, 11, bold);
  line(one, 'Orders', 250, 680, 11, bold);
  line(one, 'Share', 380, 680, 11, bold);
  REPORT_ROWS.forEach(([d, o, s], i) => {
    const ry = 660 - i * 18;
    line(one, d, 56, ry, 11, font);
    line(one, o, 250, ry, 11, font);
    line(one, s, 380, ry, 11, font);
  });
  const ref = photo(doc, 300, 200, null);
  one.node.setXObject(PDFName.of('Chart'), ref);
  one.node.addContentStream(doc.context.register(doc.context.stream('q 300 0 0 200 56 300 cm /Chart Do Q')));
  line(one, 'Figure 1. Orders by week.', 56, 285, 9, font);
  const two = doc.addPage(A4);
  line(two, 'Next Quarter', 56, 780, 16, bold);
  line(two, 'We will open a second warehouse in Kannur before Onam.', 56, 750, 11, font);
  return fresh(await doc.save({ useObjectStreams: true }));
}

/**
 * A scan of the payslip: its page drawn at `dpi`, a little grey and a touch
 * of grain, the way an office copier leaves it, as the only thing on an A4
 * page. No text inside: what Make searchable is for.
 */
export async function scannedSlipPdf(dpi = 200, pages = 1): Promise<Bytes> {
  const png = await pagePng(await salarySlipPdf(), 0, dpi / 72);
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const c = canvas.getContext('2d');
  c.drawImage(image, 0, 0);
  c.fillStyle = 'rgba(120, 110, 100, 0.06)';
  c.fillRect(0, 0, canvas.width, canvas.height);
  const scanned = new Uint8Array(await canvas.encode('jpeg', 88));
  const doc = await PDFDocument.create({ updateMetadata: false });
  const jpg = await doc.embedJpg(scanned);
  for (let i = 0; i < pages; i++) doc.addPage(A4).drawImage(jpg, { x: 0, y: 0, width: A4[0], height: A4[1] });
  return fresh(await doc.save());
}

/**
 * The payslip scanned with the sheet fed in sideways, the way a flatbed or a
 * copier often stores it: a landscape page holding the picture turned a
 * quarter, and /Rotate 90 so a reader shows it upright.
 */
export async function sidewaysScanPdf(dpi = 200): Promise<Bytes> {
  const png = await pagePng(await salarySlipPdf(), 0, dpi / 72);
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.height, image.width);
  const c = canvas.getContext('2d');
  // Turned a quarter anticlockwise; /Rotate 90 turns it back clockwise on screen.
  c.translate(0, canvas.height);
  c.rotate(-Math.PI / 2);
  c.drawImage(image, 0, 0);
  const doc = await PDFDocument.create({ updateMetadata: false });
  const jpg = await doc.embedJpg(new Uint8Array(await canvas.encode('jpeg', 88)));
  const page = doc.addPage([A4[1], A4[0]]);
  page.drawImage(jpg, { x: 0, y: 0, width: A4[1], height: A4[0] });
  page.setRotation(degrees(90));
  return fresh(await doc.save());
}

/** The typed payslip on a page turned a quarter (/Rotate 90): the reader sees it on its side. */
export async function turnedSlipPdf(): Promise<Bytes> {
  const doc = await PDFDocument.load(await salarySlipPdf(), { updateMetadata: false });
  doc.getPage(0).setRotation(degrees(90));
  return fresh(await doc.save());
}

/** A scanned page followed by a typed one: Make searchable should read the first and leave the second. */
export async function mixedScanPdf(): Promise<Bytes> {
  const doc = await PDFDocument.load(await scannedSlipPdf(200), { updateMetadata: false });
  const typed = await PDFDocument.load(await leasePdf(1), { updateMetadata: false });
  const [page] = await doc.copyPages(typed, [1]);
  doc.addPage(page!);
  return fresh(await doc.save());
}

/**
 * A phone photo of the payslip lying on a dark wooden table: the sheet turned
 * a few degrees and off-centre, `width` × `height` pixels, as a JPEG. When
 * `sideways`, the sheet lies across the photo (a landscape shot of a portrait page).
 */
export async function slipPhotoJpeg(width: number, height: number, sideways = false): Promise<Bytes> {
  const png = await pagePng(await salarySlipPdf(), 0, 1.4);
  const sheet = await loadImage(Buffer.from(png));
  const canvas = createCanvas(width, height);
  const c = canvas.getContext('2d');
  c.fillStyle = '#3b2a1e';
  c.fillRect(0, 0, width, height);
  // Wood grain.
  for (let y = 0; y < height; y += 7) {
    c.fillStyle = y % 21 === 0 ? 'rgba(20, 12, 6, 0.35)' : 'rgba(90, 60, 40, 0.2)';
    c.fillRect(0, y, width, 2);
  }
  c.save();
  c.translate(width / 2 + width * 0.02, height / 2 - height * 0.01);
  c.rotate(((sideways ? 90 : 0) + 4) * (Math.PI / 180));
  const along = sideways ? width : height;
  const scale = (along * 0.78) / sheet.height;
  const w = sheet.width * scale;
  const h = sheet.height * scale;
  c.drawImage(sheet, -w / 2, -h / 2, w, h);
  c.restore();
  return new Uint8Array(await canvas.encode('jpeg', 90));
}

/**
 * The upright photo of `slipPhotoJpeg(width, height)`, stored the way a phone
 * held upright stores it: the pixels on their side (`height` × `width`) and
 * an Exif Orientation of 6, "turn a quarter clockwise to show".
 */
export async function exifTurnedPhotoJpeg(width: number, height: number): Promise<Bytes> {
  const upright = await loadImage(Buffer.from(await slipPhotoJpeg(width, height)));
  const canvas = createCanvas(height, width);
  const c = canvas.getContext('2d');
  c.translate(0, width);
  c.rotate(-Math.PI / 2);
  c.drawImage(upright, 0, 0);
  const plain = new Uint8Array(await canvas.encode('jpeg', 90));
  // Exif: big-endian TIFF, one IFD entry, 0x0112 Orientation, SHORT, 1, value 6.
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0];
  const body = [...new TextEncoder().encode('Exif\0\0'), ...tiff];
  const app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const out = new Uint8Array(plain.length + app1.length);
  out.set(plain.subarray(0, 2), 0);
  out.set(app1, 2);
  out.set(plain.subarray(2), 2 + app1.length);
  return out;
}

/** A small PNG logo, for attaching. */
export function logoPng(): Bytes {
  const canvas = createCanvas(64, 64);
  const c = canvas.getContext('2d');
  c.fillStyle = '#c41a1f';
  c.fillRect(8, 8, 48, 48);
  return new Uint8Array(canvas.toBuffer('image/png'));
}
