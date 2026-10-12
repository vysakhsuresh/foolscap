/**
 * The awkward files real people pick, for the gauntlet (tests/unit/gauntlet.test.ts):
 * empty, not a PDF, cut short, locked, a scan, pages on their side, mixed
 * paper, a page whose visible box sits away from the origin, a form, notes
 * and links, and a long document. Built with pdf-lib on the fly, like the
 * rest of the fixtures, so nothing binary is committed.
 */
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';
import { zlibSync } from 'fflate';
import { formPdf, noisePng, pagesPdf, paperPhotoPng, pictureOnlyPdf, rotatedPdf, type Bytes } from './pdfs';

const enc = (s: string): Bytes => new TextEncoder().encode(s);

/** The first `fraction` of a real PDF: what an interrupted download leaves. */
export async function truncatedPdf(fraction = 0.6): Promise<Bytes> {
  const whole = await pagesPdf(6);
  return whole.slice(0, Math.floor(whole.length * fraction));
}

/** Plain words, named .pdf by somebody. */
export const textBytes = (): Bytes => enc('Dear Sir,\nPlease find the lease attached.\n');

/** One A4 page that is only a picture of a page: a scan. */
export const scanPdf = (): Promise<Bytes> => pictureOnlyPdf(paperPhotoPng(300, 400));

/** Four pages with /Rotate 0, 90, 180 and 270. */
export const rotated = (): Promise<Bytes> => rotatedPdf([0, 90, 180, 270]);

/** A4 portrait, Letter landscape, a 100 pt square and a poster, each with a line of text. */
export async function mixedSizesPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [w, h] of [
    [595.28, 841.89],
    [792, 612],
    [100, 100],
    [2384, 3370],
  ] as const) {
    const page = doc.addPage([w, h]);
    page.drawText(`Page ${w} by ${h}`, { x: 10, y: h / 2, size: Math.max(6, Math.min(24, w / 20)), font, color: rgb(0.1, 0.1, 0.1) });
  }
  return new Uint8Array(await doc.save());
}

/**
 * A page whose MediaBox starts at (100, 200), with a smaller CropBox inside
 * it, and a second rotated one: everything placed in fractions of "the page
 * as the reader sees it" has to be offset to land where it was put.
 */
export async function offsetBoxPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const rotation of [0, 90]) {
    const page = doc.addPage([612, 792]);
    page.setMediaBox(100, 200, 612, 792);
    page.setCropBox(150, 250, 500, 700);
    page.drawText('Inside the crop box, offset from the origin', { x: 160, y: 900, size: 12, font });
    page.drawRectangle({ x: 160, y: 300, width: 200, height: 100, color: rgb(0.2, 0.4, 0.8) });
    page.setRotation(degrees(rotation));
  }
  return new Uint8Array(await doc.save());
}

/** A page with a sticky note, a link and a highlight: annotations a tool must carry or count. */
export async function annotatedPdf(): Promise<Bytes> {
  const doc = await PDFDocument.load(await pagesPdf(2), { updateMetadata: false });
  const { context } = doc;
  const page = doc.getPage(0);
  const note = context.register(
    context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 300, 70, 320], Contents: PDFString.of('Check this clause'), T: PDFString.of('Ravi') }),
  );
  const link = context.register(
    context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [20, 20, 120, 40], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://example.com/') } }),
  );
  const mark = context.register(
    context.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [20, 320, 120, 340], QuadPoints: [20, 340, 120, 340, 20, 320, 120, 320], C: [1, 1, 0] }),
  );
  page.node.set(PDFName.of('Annots'), context.obj([note, link, mark]));
  return new Uint8Array(await doc.save());
}

/** Opens for anyone (an empty user password) but carries printing and copying restrictions. */
export async function restrictedPdf(): Promise<Bytes> {
  const doc = await PDFDocument.load(await pagesPdf(2), { updateMetadata: false });
  doc.encrypt({ userPassword: '', ownerPassword: 'owner-secret', permissions: { printing: false, copying: false } });
  return new Uint8Array(await doc.save());
}

export { formPdf };

const LOREM =
  'The tenant shall pay the rent on or before the fifth day of every month. The landlord shall keep the roof and the outer walls in good repair. Either party may end this agreement with two months notice in writing.';

/** A photo-like RGB picture, stored with Flate as scanners and phones write it. */
function photoStream(doc: PDFDocument, width: number, height: number, seed: number) {
  const pixels = new Uint8Array(width * height * 3);
  let s = seed;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const at = (y * width + x) * 3;
      pixels[at] = ((x * 180) / width + (s & 31)) | 0;
      pixels[at + 1] = ((y * 160) / height + ((s >> 5) & 31)) | 0;
      pixels[at + 2] = (90 + ((s >> 10) & 31)) | 0;
    }
  }
  return doc.context.register(
    doc.context.stream(zlibSync(pixels), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    }),
  );
}

/**
 * What an ordinary report looks like: A4 pages of typed paragraphs, a heading
 * on each, and a photo on every fourth page. Forty pages by default.
 */
export async function reportPdf(pages = 40): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const words = LOREM.split(' ');
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`Section ${p + 1}: terms and conditions`, { x: 56, y: 780, size: 16, font: bold });
    let y = 750;
    const hasPhoto = p % 4 === 1;
    if (hasPhoto) {
      const name = PDFName.of(`Photo${p}`);
      page.node.setXObject(name, photoStream(doc, 480, 320, p + 1));
      page.node.addContentStream(doc.context.register(doc.context.stream(`q 360 0 0 240 117 480 cm /Photo${p} Do Q`)));
      y = 460;
    }
    for (let line = 0; y > 60; line++, y -= 14) {
      const start = (line * 11 + p) % words.length;
      const text = Array.from({ length: 12 }, (_, k) => words[(start + k) % words.length]).join(' ');
      page.drawText(text, { x: 56, y, size: 10, font });
    }
  }
  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}

/** A small Word file, made with the app's own writer. */
export async function docxBytes(): Promise<Bytes> {
  const { toDocx } = await import('../../app/src/convert/docx');
  return new Uint8Array(
    toDocx({
      title: 'Notes',
      page: { width: 595.28, height: 841.89, margin: 56 },
      blocks: [
        { kind: 'paragraph', heading: 1, runs: [{ text: 'Meeting notes', size: 18, bold: true }] },
        { kind: 'paragraph', runs: [{ text: 'Rent goes up by five per cent from April. ', size: 11 }, { text: 'വാടക', size: 11 }] },
      ],
    }),
  );
}

/** A small Excel file, made with the app's own writer. */
export async function xlsxBytes(): Promise<Bytes> {
  const { toXlsx } = await import('../../app/src/convert/xlsx');
  return new Uint8Array(
    toXlsx({
      sheets: [
        {
          name: 'Rent',
          rows: [
            ['Month', 'Amount'],
            ['April', '12000'],
            ['May', '12000'],
          ],
        },
      ],
    }),
  );
}

export { noisePng, paperPhotoPng };

/** A JPEG of a few kilobytes, from the canvas the gauntlet installs (so only call it after that). */
export async function smallJpeg(): Promise<Bytes> {
  const canvas = new OffscreenCanvas(64, 48);
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#336699';
    context.fillRect(0, 0, 64, 48);
  }
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })).arrayBuffer());
}
