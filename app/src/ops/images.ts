/**
 * Reading images for Images to PDF: what kind a file is, which way up a phone
 * photo was taken, and turning anything a PDF cannot hold directly into JPEG
 * or PNG. The decoding uses the browser's own image decoder in the worker
 * (createImageBitmap and OffscreenCanvas), so nothing extra is downloaded.
 */

export type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'heic' | 'avif';

/** What a tool that takes pictures says about a file that is not one. */
export const NOT_AN_IMAGE = "This isn't an image this tool can read. Use JPEG, PNG, WebP, GIF or BMP.";

/** What it says when the browser cannot decode a kind of picture it recognised. */
export const UNREADABLE_IMAGE: Partial<Record<ImageKind, string>> = {
  heic: "This browser can't read iPhone HEIC photos. On the iPhone, share the photo as JPEG (Settings › Camera › Formats › Most Compatible), then add it again.",
  avif: "This browser can't read AVIF images. Save it as JPEG or PNG first.",
};

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

/**
 * The size a picture is seen at, given how it is stored and its EXIF
 * orientation: 5 to 8 stand it on its side.
 */
export function orientedSize(orientation: number, width: number, height: number): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

/**
 * The canvas transform (a, b, c, d, e, f) that draws a picture stored
 * `width` × `height` the way its EXIF orientation says it is seen. The
 * picture is decoded as stored first (asStored), so this is the one place
 * it is turned, in every browser and in Node alike.
 */
export function orientationTransform(orientation: number, width: number, height: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, width, 0];
    case 3:
      return [-1, 0, 0, -1, width, height];
    case 4:
      return [1, 0, 0, -1, 0, height];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, height, 0];
    case 7:
      return [0, -1, -1, 0, height, width];
    case 8:
      return [0, -1, 1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

interface Segment {
  readonly marker: number;
  /** Where it starts, at its 0xFF. */
  readonly at: number;
  /** Its whole length, marker included; for SOS, everything to the end of the file. */
  readonly length: number;
}

/**
 * The segments of a JPEG up to where its picture data starts (SOS).
 * `complete` says whether SOS was reached; anything malformed stops the walk.
 */
function jpegSegments(bytes: Uint8Array): { segments: Segment[]; complete: boolean } {
  const segments: Segment[] = [];
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return { segments, complete: false };
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    // Fill bytes: any number of 0xFF may come before a marker.
    while (bytes[offset + 1] === 0xff && offset + 2 < bytes.length) offset++;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda) {
      segments.push({ marker, at: offset, length: bytes.length - offset });
      return { segments, complete: true };
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    segments.push({ marker, at: offset, length: 2 + length });
    offset += 2 + length;
  }
  return { segments, complete: false };
}

/** A JPEG's frame: its stored size, its number of colour channels, and which kind of coding (the SOFn marker). */
export function jpegFrame(bytes: Uint8Array): { width: number; height: number; components: number; marker: number } | null {
  for (const { marker, at } of jpegSegments(bytes).segments) {
    if (marker < 0xc0 || marker > 0xcf || marker === 0xc4 || marker === 0xc8 || marker === 0xcc) continue;
    if (at + 10 > bytes.length) return null;
    const u16 = (i: number) => ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    return { height: u16(at + 5), width: u16(at + 7), components: bytes[at + 9] ?? 0, marker };
  }
  return null;
}

const latin = (bytes: Uint8Array, from: number, length: number): string => String.fromCharCode(...bytes.subarray(from, Math.min(bytes.length, from + length)));

/** Whether a TIFF block (the format EXIF is written in) records a place: a GPS latitude or longitude. */
function tiffHasPlace(bytes: Uint8Array, start: number, end: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (at: number, size: number) => at >= start && at + size <= Math.min(end, bytes.length);
  if (!fits(start, 8)) return false;
  const little = view.getUint16(start) === 0x4949;
  const entries = (ifd: number): Array<{ tag: number; value: number }> => {
    if (!fits(ifd, 2)) return [];
    const out: Array<{ tag: number; value: number }> = [];
    const count = Math.min(view.getUint16(ifd, little), 512);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (!fits(entry, 12)) break;
      out.push({ tag: view.getUint16(entry, little), value: view.getUint32(entry + 8, little) });
    }
    return out;
  };
  const gps = entries(start + view.getUint32(start + 4, little)).find((e) => e.tag === 0x8825);
  return gps !== undefined && entries(start + gps.value).some((e) => e.tag === 0x0002 || e.tag === 0x0004);
}

/**
 * What a picture carries besides its pixels, in the words a result uses:
 * 'location' when it records where it was taken, 'details' for anything
 * else (camera, date, software, comments), 'none' when it carries nothing,
 * and 'unknown' for kinds this does not read (HEIC, AVIF).
 */
export function hiddenDetails(bytes: Uint8Array, kind: ImageKind): 'location' | 'details' | 'none' | 'unknown' {
  if (kind === 'heic' || kind === 'avif') return 'unknown';
  let place = false;
  let other = false;
  const note = (hasPlace: boolean) => {
    if (hasPlace) place = true;
    else other = true;
  };
  // XMP is UTF-8 text, up to 64 KB of it.
  const xmpPlace = (from: number, length: number) => /GPSLatitude|GPSLongitude/.test(new TextDecoder().decode(bytes.subarray(from, from + length)));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (kind === 'jpeg') {
    for (const { marker, at, length } of jpegSegments(bytes).segments) {
      if (marker === 0xe1) note(latin(bytes, at + 4, 6) === 'Exif\0\0' ? tiffHasPlace(bytes, at + 10, at + length) : xmpPlace(at + 4, length - 4));
      else if (marker === 0xe2) {
        if (latin(bytes, at + 4, 12) !== 'ICC_PROFILE\0') note(false);
      } else if ((marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe) note(false);
    }
  } else if (kind === 'png') {
    for (let at = 8; at + 12 <= bytes.length; ) {
      const length = view.getUint32(at);
      const type = latin(bytes, at + 4, 4);
      if (type === 'IEND' || at + 12 + length > bytes.length) break;
      if (type === 'eXIf') note(tiffHasPlace(bytes, at + 8, at + 8 + length));
      else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt' || type === 'tIME') note(type === 'iTXt' && xmpPlace(at + 8, length));
      at += 12 + length;
    }
  } else if (kind === 'webp') {
    for (let at = 12; at + 8 <= bytes.length; ) {
      const type = latin(bytes, at, 4);
      const length = view.getUint32(at + 4, true);
      if (at + 8 + length > bytes.length) break;
      if (type === 'EXIF') note(tiffHasPlace(bytes, latin(bytes, at + 8, 6) === 'Exif\0\0' ? at + 14 : at + 8, at + 8 + length));
      else if (type === 'XMP ') note(xmpPlace(at + 8, length));
      at += 8 + length + (length % 2);
    }
  }
  return place ? 'location' : other ? 'details' : 'none';
}

/**
 * The same JPEG with everything but the picture taken out: EXIF (camera,
 * date, place, its small preview), XMP, IPTC, comments and a phone's extra
 * pictures. The colour profile and Adobe's colour marker stay, because the
 * picture would look different without them. The picture data is copied
 * byte for byte, so nothing is lost. Null when the file cannot be walked.
 */
export function withoutDetails(bytes: Uint8Array): { bytes: Uint8Array; removed: boolean } | null {
  const { segments, complete } = jpegSegments(bytes);
  if (!complete) return null;
  const keep = segments.filter(({ marker, at }) => {
    if (marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe) return false;
    if (marker === 0xe2) return latin(bytes, at + 4, 12) === 'ICC_PROFILE\0';
    return true;
  });
  if (keep.length === segments.length) return { bytes, removed: false };
  const out = new Uint8Array(2 + keep.reduce((sum, s) => sum + s.length, 0));
  out[0] = 0xff;
  out[1] = 0xd8;
  let at = 2;
  for (const s of keep) {
    out.set(bytes.subarray(s.at, s.at + s.length), at);
    at += s.length;
  }
  return { bytes: out, removed: true };
}
