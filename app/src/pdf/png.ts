/**
 * A minimal PNG writer, for images that live in a PDF as raw pixels.
 *
 * A PDF's Flate image with a PNG predictor (10 to 15) is already exactly a
 * PNG's IDAT payload: zlib-compressed scanlines each led by a filter byte. So
 * those are copied across untouched. Unpredicted pixels get a 0 filter byte
 * per row and are compressed here. Names no PDF library.
 */
import { zlibSync } from 'fflate';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export interface PngSpec {
  readonly width: number;
  readonly height: number;
  /** 1 for grey, 3 for RGB. */
  readonly channels: 1 | 3;
}

/** Builds a PNG around IDAT data that is already zlib(filtered scanlines). */
export function pngFromIdat(spec: PngSpec, idat: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, spec.width);
  view.setUint32(4, spec.height);
  header[8] = 8; // bit depth
  header[9] = spec.channels === 3 ? 2 : 0; // colour type: RGB or grey
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Builds a PNG from raw, unfiltered 8-bit pixels. Returns null if the byte count does not match. */
export function pngFromPixels(spec: PngSpec, pixels: Uint8Array): Uint8Array | null {
  const stride = spec.width * spec.channels;
  if (pixels.length < stride * spec.height) return null;
  const filtered = new Uint8Array((stride + 1) * spec.height);
  for (let row = 0; row < spec.height; row++) {
    filtered[row * (stride + 1)] = 0;
    filtered.set(pixels.subarray(row * stride, row * stride + stride), row * (stride + 1) + 1);
  }
  return pngFromIdat(spec, zlibSync(filtered, { level: 6 }));
}
