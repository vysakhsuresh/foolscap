import { box, lines, page } from './kit.ts';

/** A soft highlight: the family's colour, faint, with no outline. */
const tint = (x: number, y: number, w: number, h: number, cls: string, o = 0.25): string =>
  box(x, y, w, h, cls, 1).replace('<rect', `<rect fill="currentColor" fill-opacity="${o}" stroke="none"`);

/** One half of an open book, left (-1) or right (1) of the spine at x = 12. */
const half = (s: 1 | -1): string => {
  const x = (d: number) => 12 + s * d;
  const sw = s > 0 ? 1 : 0;
  return `<path d="M12 6.5C${x(1.2)} 5.2 ${x(2.8)} 4.5 ${x(4.5)} 4.5H${x(8)}a1.5 1.5 0 0 ${sw} ${s * 1.5} 1.5V17a1.5 1.5 0 0 ${sw} ${-s * 1.5} 1.5H${x(4.5)}C${x(2.8)} 18.5 ${x(1.2)} 19.2 12 20.5"/>`;
};

/** The read family: reading a document, and capturing one. */
export const READ_SCENES = {
  // Compare: two versions side by side. A band runs down both, row by row, and
  // stops at the row that differs; the changed word on the newer page is marked.
  compare:
    page(1.5, 3, 9, 18) +
    page(13.5, 3, 9, 18) +
    tint(2.5, 10.5, 19, 5, 'p s-compare-band', 0.32) +
    tint(17.9, 10.5, 3.6, 5, 'p s-compare-word', 0.35) +
    `<path d="M3.5 8.5h5M3.5 13h5M3.5 17.5h3"/>` +
    `<path d="M15.5 8.5h5M15.5 13h1.2M15.5 17.5h3"/><path class="p s-compare-new" d="M19.2 13h1.3"/>`,

  // Read: a closed document opens like a book, then a page turns.
  read:
    `<g class="p s-read-book">` +
    `<g class="p s-read-cover">${half(-1)}${lines(5, 9, 4.5, 3, [1, 1, 0.6])}</g>` +
    `<path d="M12 6.5V20.5"/>${half(1)}` +
    `<g class="p s-read-next">${lines(14.5, 9, 4.5, 3, [1, 0.7, 1])}</g>` +
    `<g class="p s-read-leaf" opacity="0">${half(1)}${lines(14.5, 9, 4.5, 3, [1, 1, 0.6])}</g>` +
    `</g>`,

  // Summarise: a page full of lines folds down into two short key points, and the
  // on-device AI's sparkle twinkles as it happens.
  summarise:
    page(1.5, 2.5, 12.5, 19) +
    `<g class="p s-summarise-full" opacity="0">${lines(4, 9, 7.5, 3, [1, 1, 1, 0.6])}</g>` +
    `<g class="p s-summarise-k1"><path d="M4.5 10.5h.01"/><path d="M7.5 10.5h4"/></g>` +
    `<g class="p s-summarise-k2"><path d="M4.5 15.5h.01"/><path d="M7.5 15.5h3"/></g>` +
    `<path class="p s-summarise-spark" fill="currentColor" fill-opacity="0.25" d="M19.5 3.25Q20.05 5.95 22.75 6.5Q20.05 7.05 19.5 9.75Q18.95 7.05 16.25 6.5Q18.95 5.95 19.5 3.25Z"/>`,

  // Scan: a photographed sheet sits crooked in the camera's corners; the corners
  // close in, and the sheet turns straight and fills the frame.
  scan:
    `<g class="p s-scan-frame"><path d="M2.5 7.5v-3a2 2 0 0 1 2-2h3M16.5 2.5h3a2 2 0 0 1 2 2v3M21.5 16.5v3a2 2 0 0 1-2 2h-3M7.5 21.5h-3a2 2 0 0 1-2-2v-3"/></g>` +
    `<g class="p s-scan-sheet">${page(6.5, 5, 11, 14)}${lines(8.5, 11, 6, 3.5, [1, 0.7])}</g>`,

  // Make searchable: a picture of words (dots) is read by a line sweeping down;
  // behind it the words are real lines, and a magnifier says they can be found.
  ocr:
    `<path d="M16 11V6l-4-4H4.5A1.5 1.5 0 0 0 3 3.5v16A1.5 1.5 0 0 0 4.5 21H12.5"/><path d="M12 2v4h4"/>` +
    `<path class="p s-ocr-corner" opacity="0" d="M16 11v8.5a1.5 1.5 0 0 1-1.5 1.5H12.5"/>` +
    `<path class="p s-ocr-dots" opacity="0" stroke-dasharray="0 2.6" d="M5.5 8.5h7.5M5.5 11.5h7.5M5.5 14.5h6M5.5 17.5h4.5"/>` +
    `<path class="p s-ocr-r1" d="M5.5 8.5h7.5"/><path class="p s-ocr-r2" d="M5.5 11.5h7.5"/>` +
    `<path class="p s-ocr-r3" d="M5.5 14.5h6"/><path class="p s-ocr-r4" d="M5.5 17.5h4.5"/>` +
    `<path class="p s-ocr-beam" opacity="0" d="M1.5 4h16"/>` +
    `<g class="p s-ocr-find"><circle cx="17.5" cy="16.5" r="3"/><path d="M19.7 18.7L22 21"/></g>`,

  // Extract text: the words lift out of the page one line at a time and line up
  // beside it as plain text; the page keeps its own.
  'extract-text':
    page(1.5, 2.5, 11, 19) +
    lines(3.5, 9.5, 6, 3.5, [1, 1, 0.6]) +
    `<path class="p s-extract-text-l1" d="M15.5 9.5h6"/>` +
    `<path class="p s-extract-text-l2" d="M15.5 13h6"/>` +
    `<path class="p s-extract-text-l3" d="M15.5 16.5h3.6"/>`,
} as const;
