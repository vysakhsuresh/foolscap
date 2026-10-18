/**
 * Pictures the way people's photos and signatures really are, for Resize
 * photo to KB: phone portraits with sensor noise against a wall, a busy
 * outdoor scene, a pen signature photographed on paper, a logo with a
 * see-through background, and the EXIF a phone writes (which way up, the
 * camera, where it was taken). Drawn with @napi-rs/canvas, pdf.js's own
 * Node canvas: tests may name libraries, the seam rule applies to app/ only.
 */
import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';

/** A repeatable random sequence, so a failing size is the same size next run. */
function random(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Sensor noise: every pixel nudged by up to ±`amount` in each channel. */
function grain(g: SKRSContext2D, width: number, height: number, amount: number, seed: number): void {
  const rand = random(seed);
  const image = g.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 2 * amount;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n * 0.9));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n * 1.1));
  }
  g.putImageData(image, 0, 0);
}

/** A head-and-shoulders photo against a light wall, as a phone takes it: JPEG at quality 92 with sensor noise (or a PNG of it, as a screenshot is). */
export async function portraitJpeg(width: number, height: number, seed = 7, as: 'jpeg' | 'png' = 'jpeg'): Promise<Uint8Array> {
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  const wall = g.createLinearGradient(0, 0, width * 0.3, height);
  wall.addColorStop(0, '#e9e6df');
  wall.addColorStop(1, '#c9c4ba');
  g.fillStyle = wall;
  g.fillRect(0, 0, width, height);
  const cx = width / 2;
  const u = Math.min(width, height) / 100;
  // Shoulders and a shirt with a collar.
  g.fillStyle = '#2d4a6b';
  g.beginPath();
  g.ellipse(cx, height * 0.98, u * 46, u * 30, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = '#f2f2f2';
  g.beginPath();
  g.moveTo(cx - u * 10, height * 0.7);
  g.lineTo(cx, height * 0.8);
  g.lineTo(cx + u * 10, height * 0.7);
  g.fill();
  // Neck, face with light from the left, hair.
  g.fillStyle = '#b07a55';
  g.fillRect(cx - u * 7, height * 0.55, u * 14, height * 0.16);
  const skin = g.createRadialGradient(cx - u * 8, height * 0.4, u * 2, cx, height * 0.42, u * 26);
  skin.addColorStop(0, '#e9b48f');
  skin.addColorStop(1, '#a8714c');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(cx, height * 0.42, u * 17, u * 22, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d1410';
  g.beginPath();
  g.ellipse(cx, height * 0.31, u * 19, u * 12, 0, Math.PI, 0);
  g.fill();
  // Eyes, brows, nose, mouth.
  for (const side of [-1, 1]) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(cx + side * u * 7, height * 0.4, u * 3.2, u * 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3b2416';
    g.beginPath();
    g.arc(cx + side * u * 7, height * 0.4, u * 1.3, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = u * 0.9;
    g.strokeStyle = '#2a1a10';
    g.beginPath();
    g.moveTo(cx + side * u * 4, height * 0.37);
    g.lineTo(cx + side * u * 10, height * 0.365);
    g.stroke();
  }
  g.strokeStyle = '#8d5638';
  g.lineWidth = u * 0.7;
  g.beginPath();
  g.moveTo(cx, height * 0.41);
  g.lineTo(cx - u * 1.5, height * 0.46);
  g.lineTo(cx + u * 1, height * 0.465);
  g.stroke();
  g.strokeStyle = '#8c3b35';
  g.lineWidth = u;
  g.beginPath();
  g.moveTo(cx - u * 5, height * 0.5);
  g.quadraticCurveTo(cx, height * 0.515, cx + u * 5, height * 0.5);
  g.stroke();
  grain(g, width, height, 9, seed);
  return new Uint8Array(as === 'png' ? await canvas.encode('png') : await canvas.encode('jpeg', 92));
}

/** An outdoor photo full of detail: sky, buildings, trees and leaves. The hardest kind to make small. */
export async function sceneJpeg(width: number, height: number, seed = 11): Promise<Uint8Array> {
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  const rand = random(seed);
  const sky = g.createLinearGradient(0, 0, 0, height * 0.5);
  sky.addColorStop(0, '#5d8fc9');
  sky.addColorStop(1, '#cfe0ee');
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);
  for (let i = 0; i < 40; i++) {
    const w = (0.04 + rand() * 0.1) * width;
    const h = (0.15 + rand() * 0.35) * height;
    g.fillStyle = `hsl(${20 + rand() * 30}, ${20 + rand() * 30}%, ${40 + rand() * 40}%)`;
    g.fillRect(rand() * width, height * 0.75 - h, w, h);
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `hsl(${90 + rand() * 50}, ${30 + rand() * 40}%, ${18 + rand() * 30}%)`;
    g.beginPath();
    g.arc(rand() * width, height * (0.55 + rand() * 0.45), (0.004 + rand() * 0.02) * width, 0, Math.PI * 2);
    g.fill();
  }
  grain(g, width, height, 14, seed);
  return new Uint8Array(await canvas.encode('jpeg', 92));
}

/** A pen signature photographed on white paper: a little shadow across it, dark blue strokes. */
export async function signatureJpeg(width: number, height: number, seed = 3): Promise<Uint8Array> {
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  const rand = random(seed);
  const paper = g.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, '#f7f6f2');
  paper.addColorStop(1, '#dedbd4');
  g.fillStyle = paper;
  g.fillRect(0, 0, width, height);
  g.strokeStyle = '#1b2a6b';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, height / 60);
  g.beginPath();
  let x = width * 0.08;
  g.moveTo(x, height * 0.6);
  while (x < width * 0.9) {
    const step = width * (0.03 + rand() * 0.05);
    g.bezierCurveTo(x + step * 0.3, height * (0.2 + rand() * 0.2), x + step * 0.7, height * (0.6 + rand() * 0.3), x + step, height * (0.45 + rand() * 0.2));
    x += step;
  }
  g.stroke();
  g.beginPath();
  g.moveTo(width * 0.1, height * 0.78);
  g.quadraticCurveTo(width * 0.5, height * 0.86, width * 0.85, height * 0.74);
  g.stroke();
  grain(g, width, height, 6, seed);
  return new Uint8Array(await canvas.encode('jpeg', 92));
}

/** A logo on a see-through background: a PNG whose corners are transparent. */
export async function transparentPng(width: number, height: number): Promise<Uint8Array> {
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, width, height);
  g.fillStyle = '#7a1f2b';
  g.beginPath();
  g.arc(width / 2, height / 2, Math.min(width, height) * 0.3, 0, Math.PI * 2);
  g.fill();
  return new Uint8Array(await canvas.encode('png'));
}

/**
 * A plain picture in four coloured quarters, stored `width` × `height`:
 * red top-left, green top-right, blue bottom-left, yellow bottom-right.
 * With an orientation in its EXIF, which quarter a viewer shows where says
 * whether it was turned right.
 */
export async function quartersJpeg(width: number, height: number): Promise<Uint8Array> {
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  const quarters: Array<[string, number, number]> = [
    ['#ff0000', 0, 0],
    ['#00ff00', width / 2, 0],
    ['#0000ff', 0, height / 2],
    ['#ffff00', width / 2, height / 2],
  ];
  for (const [colour, x, y] of quarters) {
    g.fillStyle = colour;
    g.fillRect(x, y, width / 2, height / 2);
  }
  return new Uint8Array(await canvas.encode('jpeg', 95));
}

export interface ExifOptions {
  /** 1 to 8. */
  readonly orientation?: number;
  /** A camera make, as phones write it. */
  readonly make?: string;
  /** Where it was taken: Kochi, as a phone writes it. */
  readonly gps?: boolean;
}

/** An APP1 EXIF segment as a phone writes it: big-endian TIFF, IFD0 with the orientation and make, and a GPS IFD. */
export function exifSegment(options: ExifOptions): Uint8Array {
  const tiff = new Uint8Array(512);
  const view = new DataView(tiff.buffer);
  tiff.set([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]);
  const ifd0: Array<[number, number, number, number]> = [];
  let data = 8 + 2 + 3 * 12 + 4;
  if (options.make !== undefined) {
    const text = new TextEncoder().encode(`${options.make}\0`);
    tiff.set(text, data);
    ifd0.push([0x010f, 2, text.length, data]);
    data += text.length + (text.length % 2);
  }
  if (options.orientation !== undefined) ifd0.push([0x0112, 3, 1, options.orientation << 16]);
  let gpsAt = 0;
  if (options.gps === true) {
    gpsAt = data;
    ifd0.push([0x8825, 4, 1, gpsAt]);
    data += 2 + 4 * 12 + 4;
  }
  view.setUint16(8, ifd0.length);
  ifd0.forEach(([tag, type, count, value], i) => {
    const at = 10 + i * 12;
    view.setUint16(at, tag);
    view.setUint16(at + 2, type);
    view.setUint32(at + 4, count);
    view.setUint32(at + 8, value);
  });
  if (gpsAt > 0) {
    const rationals = (at: number, values: number[]) => values.forEach((v, i) => (view.setUint32(at + i * 8, v), view.setUint32(at + i * 8 + 4, 1)));
    const lat = data;
    rationals(lat, [9, 58, 31]);
    const lon = lat + 24;
    rationals(lon, [76, 16, 2]);
    data = lon + 24;
    const gps: Array<[number, number, number, number]> = [
      [0x0001, 2, 2, 0x4e000000],
      [0x0002, 5, 3, lat],
      [0x0003, 2, 2, 0x45000000],
      [0x0004, 5, 3, lon],
    ];
    view.setUint16(gpsAt, gps.length);
    gps.forEach(([tag, type, count, value], i) => {
      const at = gpsAt + 2 + i * 12;
      view.setUint16(at, tag);
      view.setUint16(at + 2, type);
      view.setUint32(at + 4, count);
      view.setUint32(at + 8, value);
    });
  }
  const body = tiff.subarray(0, data);
  const payload = new Uint8Array(6 + body.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  payload.set(body, 6);
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  segment.set(payload, 4);
  return segment;
}

/** The same JPEG with a phone's EXIF put in straight after its start. */
export function withExif(jpeg: Uint8Array, options: ExifOptions): Uint8Array {
  const segment = exifSegment(options);
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2));
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

/** The markers of a JPEG's segments before its picture data, in order: ['e0', 'e1', 'db', …, 'da']. */
export function markersOf(jpeg: Uint8Array): string[] {
  const out: string[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1]!;
    out.push(marker.toString(16));
    if (marker === 0xda) break;
    at += 2 + ((jpeg[at + 2]! << 8) | jpeg[at + 3]!);
  }
  return out;
}

/** A picture's pixels as a viewer shows them. */
export async function pixelsOf(bytes: Uint8Array): Promise<{ width: number; height: number; at(x: number, y: number): [number, number, number] }> {
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const g = canvas.getContext('2d');
  g.drawImage(image, 0, 0);
  const data = g.getImageData(0, 0, image.width, image.height).data;
  return {
    width: image.width,
    height: image.height,
    at: (x, y) => {
      const i = (Math.floor(y) * image.width + Math.floor(x)) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    },
  };
}
