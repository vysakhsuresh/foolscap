/**
 * Documents that look like the ones people actually bring: an annual report
 * with a contents page, links, bookmarks, photos, a table and roman-numbered
 * front pages; an Indian salary slip; a leave-and-licence agreement on US
 * Letter with a form to sign on its last page; a scanned ID card; a page
 * scanned sideways. Every page says which page it is ("Report page 5") in
 * real text, so a test can tell where each page went by reading the words
 * back with pdf.js (see pdf-read.ts).
 *
 * Everything is made up: the society, the company and the people do not exist.
 */
import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type PDFRef } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import { noisePng } from './pdfs';

export type Bytes = Uint8Array<ArrayBuffer>;

export const A4: [number, number] = [595.28, 841.89];
export const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
export const LETTER: [number, number] = [612, 792];

const fresh = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

interface Ink {
  readonly page: PDFPage;
  readonly font: PDFFont;
  readonly bold: PDFFont;
}

function text(ink: Ink, words: string, x: number, y: number, size = 11, bold = false): void {
  ink.page.drawText(words, { x, y, size, font: bold ? ink.bold : ink.font, color: rgb(0.12, 0.12, 0.14) });
}

/** A paragraph wrapped to `width`, returning the y below it. */
function paragraph(ink: Ink, words: string, x: number, y: number, width: number, size = 11): number {
  let line = '';
  let at = y;
  for (const word of words.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ink.font.widthOfTextAtSize(next, size) > width && line) {
      text(ink, line, x, at, size);
      at -= size * 1.45;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) text(ink, line, x, at, size);
  return at - size * 2;
}

/** A photo-like picture: a smooth gradient with grain, stored losslessly so it has real weight. */
export function gradientPhoto(width: number, height: number, tint: [number, number, number] = [200, 150, 90]): Uint8Array {
  const pixels = new Uint8Array(width * height * 3);
  const grain = new Uint8Array(pixels.length);
  for (let i = 0; i < grain.length; i += 65536) crypto.getRandomValues(grain.subarray(i, i + 65536));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      pixels[at] = Math.min(255, ((tint[0] * x) / width + (grain[at]! & 31)) | 0);
      pixels[at + 1] = Math.min(255, ((tint[1] * y) / height + (grain[at + 1]! & 31)) | 0);
      pixels[at + 2] = Math.min(255, (tint[2] + (grain[at + 2]! & 31)) | 0);
    }
  }
  return pixels;
}

/** Puts raw RGB pixels on a page as an image, deflated. */
function placePhoto(doc: PDFDocument, page: PDFPage, pixels: Uint8Array, w: number, h: number, box: { x: number; y: number; width: number; height: number }, name: string): void {
  const image = doc.context.stream(zlibSync(pixels), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: w,
    Height: h,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'FlateDecode',
  });
  page.node.setXObject(PDFName.of(name), doc.context.register(image));
  page.node.addContentStream(doc.context.register(doc.context.stream(`q ${box.width} 0 0 ${box.height} ${box.x} ${box.y} cm /${name} Do Q`)));
}

const LOREM = [
  'The society closed the year with more members than it has ever had, and with every loan from the district bank repaid on time.',
  'Coir from the Alappuzha units went to buyers in Kochi, Chennai and Dubai, and the new retting tanks halved the time the husks spend in water.',
  'Members voted at the general body meeting to keep the dividend at eight per cent and to set aside the rest for the new drying yard.',
];

export interface ReportOptions {
  /** Pixels on a side of each of the two photos; 0 leaves them out. Each weighs about side² × 3 bytes. */
  readonly photo?: number;
  /** A "Back to contents" link at the foot of every chapter page, as long reports have. */
  readonly backLinks?: boolean;
}

/**
 * Eight pages: cover, contents (with links to the chapters), chapters with
 * headings, paragraphs, a table and two photos, a landscape chart page, an
 * appendix. Bookmarks nest two deep, one is closed, and one opens a web
 * page rather than a page. The first two pages are labelled i and ii, the
 * rest 1 to 6. Title and author are set. Page n says "Report page n".
 */
export async function reportPdf(opts: ReportOptions = {}): Promise<Bytes> {
  const photo = opts.photo ?? 160;
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sizes: Array<[number, number]> = [A4, A4, A4, A4, A4, A4, A4_LANDSCAPE, A4];
  const pages = sizes.map((size) => doc.addPage(size));
  const inks = pages.map((page) => ({ page, font, bold }));
  inks.forEach((ink, i) => {
    const { width } = ink.page.getSize();
    text(ink, `Report page ${i + 1}`, width / 2 - 40, 30, 9);
  });

  const [cover, contents, overview, highlights, finances, accounts, outlook, appendix] = inks as [Ink, Ink, Ink, Ink, Ink, Ink, Ink, Ink];
  cover.page.drawRectangle({ x: 0, y: 700, width: A4[0], height: 141.89, color: rgb(0.13, 0.33, 0.27) });
  text(cover, 'Malabar Coir Cooperative Society', 60, 600, 24, true);
  text(cover, 'Annual Report 2025-26', 60, 560, 18);
  text(cover, 'Presented to the general body, Alappuzha, 14 September 2026', 60, 520, 11);

  text(contents, 'Contents', 60, 760, 20, true);
  const entries: Array<[string, number]> = [
    ['1 Overview', 3],
    ['2 Finances', 5],
    ['3 Outlook', 7],
    ['Appendix', 8],
  ];
  const links: PDFRef[] = [];
  entries.forEach(([title, target], i) => {
    const y = 700 - i * 30;
    text(contents, `${title} ${'.'.repeat(60)} ${target - 2}`, 60, y, 12);
    const link = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [58, y - 4, 520, y + 14],
      Border: [0, 0, 0],
      Dest: [pages[target - 1]!.ref, 'XYZ', null, 800, null],
    });
    links.push(doc.context.register(link));
  });
  contents.page.node.set(PDFName.of('Annots'), doc.context.obj(links));
  if (opts.backLinks === true) {
    for (const page of pages.slice(2)) {
      const back = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 20, 140, 40], Border: [0, 0, 0], Dest: [pages[1]!.ref, 'Fit'] });
      page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(back)]));
    }
  }

  text(overview, '1 Overview', 60, 760, 20, true);
  let y = 720;
  for (const p of LOREM) y = paragraph(overview, p, 60, y, 470);
  text(overview, 'Members at the end of the year: 1,284', 60, y, 12, true);

  text(highlights, '1.1 Highlights', 60, 760, 16, true);
  paragraph(highlights, 'The drying yard at Kanjikuzhi was finished in March. The photograph below shows the first batch of fibre laid out on it.', 60, 720, 470);
  if (photo > 0) placePhoto(doc, highlights.page, gradientPhoto(photo, photo), photo, photo, { x: 60, y: 300, width: 360, height: 360 }, 'Yard');

  text(finances, '2 Finances', 60, 760, 20, true);
  const rows: Array<[string, string, string]> = [
    ['Item', '2024-25 (Rs.)', '2025-26 (Rs.)'],
    ['Sales of coir yarn', '1,82,40,000.00', '2,04,15,500.00'],
    ['Sales of mats', '64,10,250.00', '71,92,800.00'],
    ['Wages paid', '96,35,000.00', '1,02,48,600.00'],
    ['Surplus', '18,62,410.00', '23,07,950.00'],
  ];
  rows.forEach((row, r) => {
    const ry = 700 - r * 26;
    finances.page.drawLine({ start: { x: 60, y: ry - 8 }, end: { x: 535, y: ry - 8 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
    text(finances, row[0], 64, ry, 11, r === 0);
    text(finances, row[1], 300, ry, 11, r === 0);
    text(finances, row[2], 430, ry, 11, r === 0);
  });

  text(accounts, '2.1 Table of accounts', 60, 760, 16, true);
  paragraph(accounts, 'The accounts were audited by the Co-operative Audit Department. Opening balance Rs. 41,20,000.00, closing balance Rs. 64,27,950.00.', 60, 720, 470);
  if (photo > 0) placePhoto(doc, accounts.page, gradientPhoto(photo, photo, [90, 160, 210]), photo, photo, { x: 60, y: 260, width: 300, height: 300 }, 'Unit');

  text(outlook, '3 Outlook', 60, 540, 20, true);
  outlook.page.drawRectangle({ x: 60, y: 120, width: 700, height: 360, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
  [120, 180, 240, 300, 330].forEach((h, i) => outlook.page.drawRectangle({ x: 100 + i * 130, y: 120, width: 80, height: h, color: rgb(0.13, 0.33, 0.27) }));
  text(outlook, 'Sales forecast, lakh rupees, 2026-27 to 2030-31', 60, 500, 12);

  text(appendix, 'Appendix', 60, 760, 20, true);
  paragraph(appendix, 'Board of directors: K. Raghavan (President), Sreeja Thomas (Secretary), Abdul Rasheed, Mini Varghese, P. K. Soman.', 60, 720, 470);

  // Bookmarks: Cover, Contents, 1 Overview > 1.1 Highlights, 2 Finances (closed) > 2.1 Table of accounts, 3 Outlook, Appendix, Society website (a web link).
  const { context } = doc;
  const outlines = context.nextRef();
  type Spec = { title: string; page?: number; uri?: string; closed?: boolean; kids?: Spec[] };
  const tree: Spec[] = [
    { title: 'Cover', page: 1 },
    { title: 'Contents', page: 2 },
    { title: '1 Overview', page: 3, kids: [{ title: '1.1 Highlights', page: 4 }] },
    { title: '2 Finances', page: 5, closed: true, kids: [{ title: '2.1 Table of accounts', page: 6 }] },
    { title: '3 Outlook', page: 7 },
    { title: 'Appendix', page: 8 },
    { title: 'Society website', uri: 'https://example.org/coir' },
  ];
  const build = (list: Spec[], parent: PDFRef): number => {
    const refs = list.map(() => context.nextRef());
    let count = 0;
    list.forEach((spec, i) => {
      const dict = context.obj({});
      dict.set(PDFName.of('Title'), PDFHexString.fromText(spec.title));
      dict.set(PDFName.of('Parent'), parent);
      if (spec.page !== undefined) dict.set(PDFName.of('Dest'), context.obj([pages[spec.page - 1]!.ref, 'XYZ', 0, 780, 0]));
      if (spec.uri !== undefined) dict.set(PDFName.of('A'), context.obj({ S: 'URI', URI: PDFString.of(spec.uri) }));
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]!);
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]!);
      context.assign(refs[i]!, dict);
      count++;
      if (spec.kids) {
        const inner = build(spec.kids, refs[i]!);
        dict.set(PDFName.of('Count'), PDFNumber.of(spec.closed ? -inner : inner));
        if (!spec.closed) count += inner;
      }
    });
    const parentDict = context.lookup(parent);
    if (parentDict && 'set' in parentDict) {
      (parentDict as import('@cantoo/pdf-lib').PDFDict).set(PDFName.of('First'), refs[0]!);
      (parentDict as import('@cantoo/pdf-lib').PDFDict).set(PDFName.of('Last'), refs[refs.length - 1]!);
    }
    return count;
  };
  context.assign(outlines, context.obj({ Type: 'Outlines' }));
  const total = build(tree, outlines);
  (context.lookup(outlines) as import('@cantoo/pdf-lib').PDFDict).set(PDFName.of('Count'), PDFNumber.of(total));
  doc.catalog.set(PDFName.of('Outlines'), outlines);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));

  // Labels: i, ii, then 1, 2, 3 ...
  doc.catalog.set(
    PDFName.of('PageLabels'),
    context.obj({ Nums: [0, context.obj({ S: 'r' }), 2, context.obj({ S: 'D' })] }),
  );
  doc.setTitle('Annual Report 2025-26');
  doc.setAuthor('Malabar Coir Cooperative Society');
  doc.setSubject('Annual report to the general body');
  return fresh(await doc.save());
}

/** One A4 page: an Indian payslip, with earnings, deductions and the net pay in words. */
export async function salarySlipPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  const ink = { page, font, bold };
  page.drawRectangle({ x: 40, y: 740, width: 515, height: 60, color: rgb(0.93, 0.95, 0.98) });
  text(ink, 'Kayal Software Services Pvt. Ltd. (demo)', 52, 776, 14, true);
  text(ink, 'Payslip for September 2026', 52, 754, 11);
  const details: Array<[string, string]> = [
    ['Employee', 'Anjali Menon'],
    ['Employee ID', 'KSS-0427'],
    ['PAN', 'ABCPM1234D'],
    ['UAN', '100987654321'],
    ['Bank account', 'XXXXXXXX4321'],
    ['Days paid', '30'],
  ];
  details.forEach(([k, v], i) => {
    text(ink, k, 52, 700 - i * 18, 10);
    text(ink, v, 180, 700 - i * 18, 10, true);
  });
  const earnings: Array<[string, string]> = [
    ['Basic', '45,000.00'],
    ['House rent allowance', '18,000.00'],
    ['Special allowance', '9,500.00'],
  ];
  const deductions: Array<[string, string]> = [
    ['Provident fund', '5,400.00'],
    ['Professional tax', '200.00'],
    ['Income tax (TDS)', '4,650.00'],
  ];
  text(ink, 'Earnings', 52, 570, 11, true);
  text(ink, 'Deductions', 310, 570, 11, true);
  earnings.forEach(([k, v], i) => {
    text(ink, k, 52, 548 - i * 20, 10);
    text(ink, v, 220, 548 - i * 20, 10);
  });
  deductions.forEach(([k, v], i) => {
    text(ink, k, 310, 548 - i * 20, 10);
    text(ink, v, 480, 548 - i * 20, 10);
  });
  page.drawLine({ start: { x: 40, y: 480 }, end: { x: 555, y: 480 }, thickness: 1 });
  text(ink, 'Gross earnings 72,500.00', 52, 460, 10, true);
  text(ink, 'Total deductions 10,250.00', 310, 460, 10, true);
  text(ink, 'Net pay Rs. 62,250.00', 52, 420, 14, true);
  text(ink, '(Rupees sixty-two thousand two hundred and fifty only)', 52, 400, 10);
  text(ink, 'Payslip page 1', 260, 30, 9);
  doc.setTitle('Payslip September 2026');
  return fresh(await doc.save());
}

/**
 * Four pages of US Letter: a leave and licence agreement, its clauses, a
 * schedule, and a signature page that is a real form (the date and a
 * "witnessed" box). Page n says "Lease page n".
 */
export async function leasePdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clauses = [
    'The Licensor hereby grants to the Licensee a licence to use the flat at 4B, Lakeview Apartments, Kadavanthra, Kochi 682020 for residence only.',
    'The licence is for eleven months from 1 October 2026. The monthly licence fee is Rs. 22,000.00, payable on or before the fifth day of each month.',
    'The Licensee has paid a refundable security deposit of Rs. 66,000.00, which will be returned without interest when the flat is handed back.',
    'Either party may end this agreement by giving one month notice in writing.',
  ];
  for (let i = 0; i < 4; i++) {
    const page = doc.addPage(LETTER);
    const ink = { page, font, bold };
    text(ink, `Lease page ${i + 1}`, 270, 30, 9);
    if (i === 0) {
      text(ink, 'Leave and Licence Agreement', 72, 700, 20, true);
      paragraph(ink, 'This agreement is made at Kochi on 20 September 2026 between Thomas Kurian (the Licensor) and Farhan Ali (the Licensee).', 72, 650, 468);
    } else if (i === 1) {
      text(ink, 'Terms', 72, 700, 16, true);
      let y = 670;
      clauses.forEach((c, k) => (y = paragraph(ink, `${k + 1}. ${c}`, 72, y, 468)));
    } else if (i === 2) {
      text(ink, 'Schedule: fittings in the flat', 72, 700, 16, true);
      ['Ceiling fans: 4', 'Tube lights: 6', 'Geyser: 1', 'Wardrobes: 2', 'Gas connection: 1'].forEach((line, k) => text(ink, line, 72, 660 - k * 20, 11));
    } else {
      text(ink, 'Signatures', 72, 700, 16, true);
      text(ink, 'Signed on (date):', 72, 640, 11);
      text(ink, 'Witnessed:', 72, 590, 11);
      const form = doc.getForm();
      const date = form.createTextField('signed_on');
      date.addToPage(page, { x: 180, y: 632, width: 160, height: 22 });
      date.setText('20/09/2026');
      form.createCheckBox('witnessed').addToPage(page, { x: 180, y: 584, width: 16, height: 16 });
      form.getCheckBox('witnessed').check();
    }
  }
  doc.setTitle('Leave and Licence Agreement');
  return fresh(await doc.save());
}

/** A scanned ID card: one card-sized page that is only a picture, with no text on it at all. */
export async function idCardScanPdf(): Promise<Bytes> {
  const w = 428;
  const h = 270;
  const pixels = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 3;
      const bar = y > 60 && y % 30 < 10 && x > 160 && x < 400;
      const face = x > 24 && x < 140 && y > 60 && y < 220;
      const v = bar ? 40 : face ? 120 : 230;
      pixels[at] = v;
      pixels[at + 1] = face ? 100 : v;
      pixels[at + 2] = bar ? 60 : v - 10;
    }
  }
  const doc = await PDFDocument.create({ updateMetadata: false });
  // ID-1 card: 85.6 × 54 mm.
  const page = doc.addPage([242.65, 153.07]);
  placePhoto(doc, page, pixels, w, h, { x: 0, y: 0, width: 242.65, height: 153.07 }, 'Card');
  return fresh(await doc.save());
}

/** Two A4 pages scanned sideways: portrait in the file, /Rotate 90, so a reader shows them landscape. */
export async function sidewaysScanPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage(A4);
    page.setRotation(degrees(90));
    page.drawText(`Sideways page ${i + 1}`, { x: 100, y: 400, size: 18, font, rotate: degrees(90) });
    page.drawRectangle({ x: 400, y: 100, width: 100, height: 600, color: rgb(0.8, 0.2, 0.2) });
  }
  return fresh(await doc.save());
}

/** `n` pages each holding an incompressible photo of `side` pixels: each page weighs about side² × 3 bytes. */
export async function photoAlbumPdf(n: number, side: number): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) {
    const page = doc.addPage(A4);
    const image = await doc.embedPng(noisePng(side + i));
    page.drawImage(image, { x: 50, y: 200, width: 495, height: 495 });
    page.drawText(`Album page ${i + 1}`, { x: 250, y: 100, size: 14, font });
  }
  return fresh(await doc.save());
}

/** A page with things that live outside its drawing: a highlight, a sticky note, a web link and a filled text field. */
export async function annotatedPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(LETTER);
  page.drawText('Annotated page 1', { x: 72, y: 700, size: 14, font });
  page.drawText('Please check the rent clause again.', { x: 72, y: 600, size: 12, font });
  const { context } = doc;
  const highlight = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: [70, 596, 290, 614],
      QuadPoints: [70, 614, 290, 614, 70, 596, 290, 596],
      C: [1, 0.9, 0.2],
      Contents: PDFHexString.fromText('Rent clause'),
    }),
  );
  const note = context.register(
    context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 600, 320, 620], Contents: PDFHexString.fromText('Ask Thomas about the deposit'), Name: 'Comment' }),
  );
  const link = context.register(
    context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 500, 300, 520], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://example.org/lease') } }),
  );
  page.node.set(PDFName.of('Annots'), context.obj([highlight, note, link]));
  const form = doc.getForm();
  const name = form.createTextField('tenant_name');
  name.addToPage(page, { x: 72, y: 400, width: 200, height: 24 });
  name.setText('Farhan Ali');
  return fresh(await doc.save());
}

/**
 * Three pages whose contents link goes by name, as LaTeX writes it: page 1
 * links to "section.2" and "section.3", which the document's name tree says
 * are pages 2 and 3, and its bookmarks go by name too. Page n says "Thesis page n".
 */
export async function namedDestsPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [0, 1, 2].map((i) => {
    const page = doc.addPage(A4);
    page.drawText(`Thesis page ${i + 1}`, { x: 72, y: 760, size: 14, font });
    return page;
  });
  const { context } = doc;
  const link = (name: string, y: number) =>
    context.register(context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, y, 300, y + 16], Border: [0, 0, 0], A: { S: 'GoTo', D: PDFString.of(name) } }));
  pages[0]!.node.set(PDFName.of('Annots'), context.obj([link('section.2', 700), link('section.3', 670)]));
  const names = context.obj({
    Names: [PDFString.of('section.2'), context.obj([pages[1]!.ref, 'XYZ', 72, 700, null]), PDFString.of('section.3'), context.obj([pages[2]!.ref, 'XYZ', 72, 650, null])],
  });
  doc.catalog.set(PDFName.of('Names'), context.obj({ Dests: context.register(names) }));
  const outlines = context.nextRef();
  const one = context.nextRef();
  const two = context.nextRef();
  context.assign(one, context.obj({ Title: PDFHexString.fromText('Methods'), Parent: outlines, Next: two, Dest: PDFString.of('section.2') }));
  context.assign(two, context.obj({ Title: PDFHexString.fromText('Results'), Parent: outlines, Prev: one, A: { S: 'GoTo', D: PDFString.of('section.3') } }));
  context.assign(outlines, context.obj({ Type: 'Outlines', First: one, Last: two, Count: 2 }));
  doc.catalog.set(PDFName.of('Outlines'), outlines);
  return fresh(await doc.save());
}
