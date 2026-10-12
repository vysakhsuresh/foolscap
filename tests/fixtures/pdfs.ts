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
import { zlibSync } from 'fflate';

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

/** A 1×1 baseline JPEG: the smallest file with a frame header a PDF library can read. */
export const TINY_JPEG: Bytes = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='),
  (c) => c.charCodeAt(0),
);

/** A PNG of random pixels: nothing can compress it, so it gives a file real weight. */
export function noisePng(size: number): Bytes {
  const pixels = new Uint8Array(size * size * 3);
  for (let i = 0; i < pixels.length; i += 65536) crypto.getRandomValues(pixels.subarray(i, i + 65536));
  const stride = size * 3;
  const rows = new Uint8Array((stride + 1) * size);
  for (let r = 0; r < size; r++) rows.set(pixels.subarray(r * stride, r * stride + stride), r * (stride + 1) + 1);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = (crcTable[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, size);
  new DataView(ihdr.buffer).setUint32(4, size);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(rows)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** `n` pages each holding a noise image: about 200 KB a page, for Split by size. */
export async function heavyPdf(n = 8): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < n; i++) {
    const image = await doc.embedPng(noisePng(260 + i));
    doc.addPage([300, 300]).drawImage(image, { x: 0, y: 0, width: 300, height: 300 });
  }
  return fresh(await doc.save());
}

/** Two pages: a JPEG on the first (used again on the second) and a pixel image on the first. */
export async function imagesPdf(): Promise<Bytes> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const jpeg = await doc.embedJpg(TINY_JPEG);
  const png = await doc.embedPng(noisePng(16));
  const one = doc.addPage([200, 200]);
  one.drawImage(jpeg, { x: 0, y: 0, width: 50, height: 50 });
  one.drawImage(png, { x: 60, y: 0, width: 50, height: 50 });
  doc.addPage([200, 200]).drawImage(jpeg, { x: 0, y: 0, width: 50, height: 50 });
  return fresh(await doc.save());
}
