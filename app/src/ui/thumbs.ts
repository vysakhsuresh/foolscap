/**
 * Small pictures of a file: the first page of a PDF, drawn by the page-thread
 * engine, or an image decoded straight from the workspace's Blob. Always a
 * canvas, never a blob URL (those belong to the exporter alone), sized to fit
 * a box of CSS pixels and drawn at the screen's density, capped at 2×.
 */
import type { PdfView } from '../pdf/types';
import { el } from './dom';

/** A box in CSS pixels the picture must fit inside. */
export interface Box {
  readonly width: number;
  readonly height: number;
}

const MAX_DPR = 2;
const dpr = (): number => Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));

/** The CSS size of something `w`×`h` shrunk (or grown) to fit `box`, keeping its shape. */
export function fit(w: number, h: number, box: Box): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: box.width, height: box.height };
  const scale = Math.min(box.width / w, box.height / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function toCanvas(bitmap: ImageBitmap, box: Box, testid: string): HTMLCanvasElement {
  const canvas = el('canvas', { class: 'thumb__picture', testid, attrs: { 'aria-hidden': 'true' } });
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const size = fit(canvas.width, canvas.height, box);
  canvas.style.setProperty('width', `${size.width}px`);
  canvas.style.setProperty('height', `${size.height}px`);
  return canvas;
}

/** The first page of an open document. */
export async function pdfThumb(view: PdfView, box: Box, testid: string): Promise<HTMLCanvasElement> {
  const info = await view.page(0);
  const quarter = info.rotation === 90 || info.rotation === 270;
  const w = quarter ? info.height : info.width;
  const h = quarter ? info.width : info.height;
  const width = Math.max(1, Math.round(fit(w, h, box).width * dpr()));
  return toCanvas(await view.render(0, { width }), box, testid);
}

/** An image, decoded small where the browser can, full size and scaled where it cannot. */
export async function imageThumb(blob: Blob, box: Box, testid: string): Promise<HTMLCanvasElement> {
  const resizeWidth = Math.max(1, Math.round(box.width * dpr()));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { resizeWidth, resizeQuality: 'medium' });
  } catch {
    bitmap = await createImageBitmap(blob);
  }
  return toCanvas(bitmap, box, testid);
}

/** What stands in for a picture: the file's type in letters ("PDF", "DOCX"). */
export function typeLabel(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
  return /^[A-Z0-9]{1,5}$/.test(ext) ? ext : 'FILE';
}
