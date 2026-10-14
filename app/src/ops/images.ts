/**
 * Reading images for Images to PDF: what kind a file is, which way up a phone
 * photo was taken, and turning anything a PDF cannot hold directly into JPEG
 * or PNG. The decoding uses the browser's own image decoder in the worker
 * (createImageBitmap and OffscreenCanvas), so nothing extra is downloaded.
 */

export type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'heic' | 'avif';

/** Recognises an image by its first bytes, not its name: a renamed file is still what it is. */
export function sniffImage(head: Uint8Array): ImageKind | null {
  const b = (i: number) => head[i] ?? -1;
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg';
  if (b(0) === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 2) === 'BM') return 'bmp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return 'heic';
  }
  return null;
}

/**
 * Where a JPEG's EXIF orientation value sits in its bytes, and what it is
 * (1 to 8), or null when it has none.
 */
function orientationAt(bytes: Uint8Array): { at: number; little: boolean; value: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && offset + 10 <= bytes.length && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      if (tiff + 8 > bytes.length) return null;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > bytes.length) return null;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) return null;
        if (view.getUint16(entry, little) === 0x0112) return { at: entry + 8, little, value: view.getUint16(entry + 8, little) };
      }
      return null;
    }
    if (marker === 0xda || length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/**
 * The EXIF orientation of a JPEG, 1 to 8, or 1 when it has none. Phones store
 * the picture as the sensor saw it and write "rotate me" here; a PDF that
 * embeds the bytes as they are would show the photo on its side.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  const found = orientationAt(bytes);
  return found !== null && found.value >= 1 && found.value <= 8 ? found.value : 1;
}

/**
 * A copy of a JPEG whose EXIF says to stand it up as it is stored. A JPEG
 * inside a PDF is drawn as stored, whatever its EXIF says, and browsers now
 * always turn a picture by its EXIF when decoding it (imageOrientation
 * 'none' became an old name for 'from-image'): a phone photo put in a PDF
 * by a program that left its EXIF in came out of Compress turned a quarter
 * and squeezed into its old box.
 */
export function asStored(bytes: Uint8Array): Uint8Array {
  const found = orientationAt(bytes);
  if (found === null || found.value === 1) return bytes;
  const copy = bytes.slice();
  new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint16(found.at, 1, found.little);
  return copy;
}

/** Whether this worker can decode images itself. False in Node, where the unit tests run. */
export function canDecode(): boolean {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
}

/**
 * Decodes with the browser (which applies EXIF orientation) and re-encodes as
 * JPEG, or PNG where transparency matters. Throws if the browser cannot read it.
 */
export async function reencode(blob: Blob, as: 'jpeg' | 'png'): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('No 2D context');
    if (as === 'jpeg') {
      // JPEG has no transparency; paper white is what a page would show behind it.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    context.drawImage(bitmap, 0, 0);
    const out = await canvas.convertToBlob(as === 'jpeg' ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' });
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

/**
 * Decodes a photo and re-encodes it as JPEG no longer than `maxSide` on its
 * long edge, for Compress. Null when the browser cannot read it.
 */
export async function shrink(
  bytes: Uint8Array,
  type: 'image/jpeg' | 'image/png',
  maxSide: number,
  quality: number,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    // The pixels as the PDF stores and draws them: any EXIF turn neutralised first (asStored).
    const stored = type === 'image/jpeg' ? asStored(bytes) : bytes;
    bitmap = await createImageBitmap(new Blob([stored as Uint8Array<ArrayBuffer>], { type }));
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    canvas.width = 0;
    canvas.height = 0;
    return { bytes: new Uint8Array(await out.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
}
