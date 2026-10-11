/**
 * Test documents, built on the fly with pdf-lib so nothing binary is
 * committed. Tests may name the library: the seam rule applies to app/ only.
 *
 * Every page has a size no other page shares (width 300 + 10 × index), so a
 * document's page order is checkable after any operation by reading the sizes
 * back. See README.md beside this file for what the fixtures deliberately do
 * not contain.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';

export type Bytes = Uint8Array<ArrayBuffer>;

export interface PagesOptions {
  readonly producer?: string;
  readonly creator?: string;
  readonly title?: string;
}

export function pageWidth(index: number): number {
  return 300 + 10 * index;
}

export const PAGE_HEIGHT = 400;

/**
 * `n` pages, each with its one-based number in Helvetica and a coloured band
 * whose height grows with the page, so a thumbnail of any page has more than
 * one colour in it whether or not a font was drawn.
 */
export async function pagesPdf(n: number, opts: PagesOptions = {}): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) {
    const width = pageWidth(i);
    const page = doc.addPage([width, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: 0, width, height: 40 + 10 * (i % 10), color: rgb(0.1, 0.3, 0.8) });
    page.drawText(`${i + 1}`, { x: 24, y: PAGE_HEIGHT - 80, size: 48, font, color: rgb(0.1, 0.1, 0.1) });
  }
  if (opts.producer !== undefined) doc.setProducer(opts.producer);
  if (opts.creator !== undefined) doc.setCreator(opts.creator);
  if (opts.title !== undefined) doc.setTitle(opts.title);
  return fresh(await doc.save({ useObjectStreams: true }));
}

/** One page per entry, each carrying that /Rotate; sizes as in `pagesPdf`. */
export async function rotatedPdf(rotations: readonly number[]): Promise<Bytes> {
  const doc = await PDFDocument.load(await pagesPdf(rotations.length), { updateMetadata: false });
  rotations.forEach((rotation, i) => doc.getPage(i).setRotation(degrees(rotation)));
  return fresh(await doc.save({ useObjectStreams: true }));
}

/** Two pages, locked with `userPassword` (AES-256 via pdf-lib's encrypt). */
export async function encryptedPdf(userPassword: string, n = 2): Promise<Bytes> {
  const doc = await PDFDocument.load(await pagesPdf(n), { updateMetadata: false });
  doc.encrypt({ userPassword, ownerPassword: `${userPassword}-owner` });
  return fresh(await doc.save({ useObjectStreams: true }));
}

/** A PDF header followed by junk: it passes the "%PDF-" sniff and fails to parse. */
export function corruptBytes(): Bytes {
  return fresh(new TextEncoder().encode(`%PDF-1.7\n${'x'.repeat(3000)}\n%%EOF\n`));
}

/** A PNG signature and padding: not a PDF at all. */
export function notAPdf(): Bytes {
  const bytes = new Uint8Array(2048);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256;
  return bytes;
}

/** Many small pages, for progress and page-count checks. */
export function bigPdf(pages = 300): Promise<Bytes> {
  return pagesPdf(pages);
}

export interface PdfInfo {
  readonly pageCount: number;
  /** [width, height] per page, as the page declares them. */
  readonly sizes: ReadonlyArray<readonly [number, number]>;
  /** /Rotate per page, normalised to 0, 90, 180 or 270. */
  readonly rotations: readonly number[];
  readonly producer: string | undefined;
  readonly creator: string | undefined;
  readonly title: string | undefined;
  readonly encrypted: boolean;
}

/** What a test needs to know about an output, read back with pdf-lib. */
export async function pdfInfo(bytes: Uint8Array): Promise<PdfInfo> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const pages = doc.getPages();
  return {
    pageCount: doc.getPageCount(),
    sizes: pages.map((page) => {
      const { width, height } = page.getSize();
      return [width, height] as const;
    }),
    rotations: pages.map((page) => (((page.getRotation().angle % 360) + 360) % 360)),
    producer: doc.getProducer(),
    creator: doc.getCreator(),
    title: doc.getTitle(),
    encrypted: doc.isEncrypted,
  };
}

/** The source indices a document's pages came from, recovered from their widths. */
export function sourceIndices(info: PdfInfo): number[] {
  return info.sizes.map(([width]) => Math.round((width - 300) / 10));
}

/** The bytes contain none of the strings rule 7 forbids. */
export function stampsIn(bytes: Uint8Array): string[] {
  const text = new TextDecoder('latin1').decode(bytes);
  return ['pdf-lib', 'Foolscap', 'Sheaf'].filter((stamp) => text.includes(stamp));
}

/** A copy in its own buffer: pdf-lib may hand back a view, and Blob and File want a plain ArrayBuffer. */
function fresh(bytes: Uint8Array): Bytes {
  return new Uint8Array(bytes);
}
