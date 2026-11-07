import { box, lines, page } from './kit.ts';

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** A photo: a frame, a small sun and one mountain. */
function photo(x: number, y: number, w: number, h: number): string {
  const sun = `<circle cx="${n(x + w * 0.3)}" cy="${n(y + h * 0.34)}" r="${n(Math.min(1.2, h * 0.16))}"/>`;
  const hill = `<path d="M${n(x + w * 0.22)} ${n(y + h)}L${n(x + w * 0.58)} ${n(y + h * 0.5)}L${n(x + w * 0.92)} ${n(y + h)}"/>`;
  return `${box(x, y, w, h, '', 1)}${sun}${hill}`;
}

/** The second half of the Convert family: what each tool does, acted out on a document. */
export const CONVERT_B_SCENES = {
  // Archive copy: the lid lifts off, a page falls into the box, the lid comes down on it.
  'pdf-a':
    `<g class="p s-pdf-a-page" opacity="0">${page(8, 1, 8, 10)}${lines(10, 5.5, 4, 2.5, [1, 0.7])}</g>` +
    `<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 13h4"/>` +
    box(2, 3, 20, 5, 'p s-pdf-a-lid', 1),

  // Rent receipts: a stack of receipts prints upward, then the rupee sign and the signing line are written on the new one.
  'rent-receipts':
    `<g class="p s-rent-receipts-slip"><path d="M7 4.5V3a1 1 0 0 1 1-1h10.5a1 1 0 0 1 1 1v13.5a1 1 0 0 1-1 1H17"/>` +
    `<path d="M4 20V6a1.5 1.5 0 0 1 1.5-1.5h10A1.5 1.5 0 0 1 17 6v14l-2.17 2-2.16-2-2.17 2-2.17-2-2.16 2z"/></g>` +
    `<path class="p s-rent-receipts-rupee" pathLength="1" d="M7.5 7.5h6M7.5 10h6M9 7.5a2.5 2.5 0 0 1 0 5H7.5l3.5 2.8"/>` +
    `<path class="p s-rent-receipts-line" pathLength="1" d="M7.5 17.5h6"/>`,

  // Images to PDF: two loose photos glide together and a page closes round them.
  'images-to-pdf':
    `<g class="p s-images-to-pdf-page">${page(4, 1.5, 16, 21)}</g>` +
    `<g class="p s-images-to-pdf-a">${photo(7, 8.5, 10, 5)}</g>` +
    `<g class="p s-images-to-pdf-b">${photo(7, 15.5, 10, 5)}</g>`,

  // PDF to images: a page of text turns over and comes back as a picture.
  'pdf-to-images':
    `<g class="p s-pdf-to-images-sheet">${page(5, 2, 14, 20)}</g>` +
    `<g class="p s-pdf-to-images-text" opacity="0">${lines(8, 9, 8, 3, [1, 1, 1, 0.6])}</g>` +
    `<g class="p s-pdf-to-images-pic"><circle cx="10" cy="10" r="2"/><path d="M5 19.5l5-5 4 4 2-2 3 3"/></g>`,

  // Pages per sheet: four full pages shrink together into the quarters of one sheet.
  'n-up':
    box(3, 2, 18, 20, 'p s-n-up-sheet') +
    `<g class="p s-n-up-pages">${page(5, 4, 6, 7)}${page(13, 4, 6, 7)}${page(5, 13, 6, 7)}${page(13, 13, 6, 7)}</g>`,

  // Extract images: the picture in a page lifts and comes out whole, leaving the text.
  'extract-images':
    `<g>${page(1.5, 2.5, 10, 19)}${lines(3.75, 8, 5.5, 2.5, [1, 0.7])}</g>` +
    `<g class="p s-extract-images-pic">${photo(13.5, 8.5, 9, 7)}</g>`,
} as const;
