import { box, lines, page } from './kit.ts';

/** A path that can be drawn on (rule: pathLength 1, dashes set in the stylesheet). */
const drawn = (cls: string, d: string): string => `<path class="p ${cls}" pathLength="1" d="${d}"/>`;

/** A bold W, drawn as one line, for a Word document. */
const W = (x: number, y: number, w: number, h: number): string => {
  const n = (v: number): number => Math.round(v * 100) / 100;
  const a = n(w * 0.19), b = n(w * 0.31), c = n(h * 0.75);
  return `<path d="M${x} ${y}l${a} ${h} ${b}-${c} ${b} ${c} ${a}-${h}"/>`;
};

/** Convert, first half: each story ends on what the tool gives back. */
export const CONVERT_A_SCENES = {
  // Compress: a big page appears, two arrows press in from the sides and squeeze it into a small page.
  compress:
    `<g class="p s-compress-big" opacity="0">${page(5.5, 3, 13, 18)}${lines(8.5, 10, 7, 3, [1, 1, 1, 0.6])}</g>` +
    `<g class="p s-compress-small">${page(8, 6.5, 8, 11)}${lines(10, 11.5, 4, 2.5, [1, 0.6])}</g>` +
    `<path class="p s-compress-l" d="M3 12h3.5M4.5 10l2 2-2 2"/>` +
    `<path class="p s-compress-r" d="M21 12h-3.5M19.5 10l-2 2 2 2"/>`,

  // Resize photo to KB: a big photo shrinks into the little photo box on a form.
  'compress-image':
    `<g class="p s-compress-image-form">${page(4, 2, 16, 20)}${lines(6, 16.5, 12, 3, [1, 0.6])}</g>` +
    `<g class="p s-compress-image-small"><rect x="6" y="4.5" width="7" height="8.75" rx="1" fill="currentColor" fill-opacity="0.2"/><circle cx="9.5" cy="7.8" r="1.55"/><path d="M6.9 13.25a2.6 2.6 0 0 1 5.2 0"/></g>` +
    `<g class="p s-compress-image-big" opacity="0"><rect x="4" y="2" width="16" height="20" rx="2" fill="currentColor" fill-opacity="0.2"/><circle cx="12" cy="9.5" r="3.5"/><path d="M6 22a6 6 0 0 1 12 0"/></g>`,

  // PDF to Word: a page of text flips over and comes back as a document marked W.
  'pdf-to-word':
    `<g class="p s-pdf-to-word-pdf" opacity="0">${page(4.5, 2, 15, 20)}${lines(7.5, 10, 9, 3, [1, 1, 1, 0.6])}</g>` +
    `<g class="p s-pdf-to-word-doc">${page(4.5, 2, 15, 20)}${W(7.5, 7.5, 9, 6)}${lines(7.5, 17, 9, 3, [1, 0.6])}</g>`,

  // PDF to Excel: a page of figures in rows flips over and comes back as a grid of cells.
  'pdf-to-excel':
    `<g class="p s-pdf-to-excel-pdf" opacity="0">${page(4.5, 2, 15, 20)}<path d="M7.5 10.5h4.5M14.5 10.5h2M7.5 14h4.5M14.5 14h2M7.5 17.5h4.5M14.5 17.5h2"/></g>` +
    `<g class="p s-pdf-to-excel-sheet"><path d="M3 8.5V5.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3z" fill="currentColor" fill-opacity="0.25" stroke="none"/>${box(3, 3.5, 18, 17, '', 2)}<path d="M3 8.5h18M3 14.5h18M9 3.5v17M15 3.5v17"/></g>`,

  // PDF to PowerPoint: a page turns on its side, becomes a slide on a screen, and the stand draws in under it.
  'pdf-to-powerpoint':
    `<g class="p s-pdf-to-powerpoint-pdf" opacity="0">${page(5.5, 3, 13, 17)}${lines(8, 10, 8, 3, [1, 1, 0.6])}</g>` +
    `<g class="p s-pdf-to-powerpoint-screen"><path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="M7 7.5h5M8 12.5v-1M12 12.5v-2M16 12.5V8"/></g>` +
    drawn('s-pdf-to-powerpoint-stand', 'M7 21l5-5 5 5'),

  // PDF to EPUB: a wide page narrows into a phone, and its text flows again as more, shorter lines.
  'pdf-to-epub':
    `<g class="p s-pdf-to-epub-pdf" opacity="0">${page(4, 2, 16, 20)}${lines(7, 10, 10, 3, [1, 1, 0.7])}</g>` +
    `<g class="p s-pdf-to-epub-phone">${box(6.5, 2, 11, 20, '', 2.5)}<path d="M12 18.5h.01"/></g>` +
    drawn('s-pdf-to-epub-t s-pdf-to-epub-t1', 'M9 6.5h6') +
    drawn('s-pdf-to-epub-t s-pdf-to-epub-t2', 'M9 9.5h4.5') +
    drawn('s-pdf-to-epub-t s-pdf-to-epub-t3', 'M9 12.5h6') +
    drawn('s-pdf-to-epub-t s-pdf-to-epub-t4', 'M9 15.5h3'),

  // Word or Excel to PDF: a W document flips over into a page of text, which steps forward with the original behind it.
  'office-to-pdf':
    `<g class="p s-office-to-pdf-back"><path d="M10 17H3.5A1.5 1.5 0 0 1 2 15.5v-13A1.5 1.5 0 0 1 3.5 1h7.34L15 5.16V8M10.84 1v4.16H15"/>${W(3.5, 4, 6, 5)}</g>` +
    `<g class="p s-office-to-pdf-doc" opacity="0">${page(6, 4.5, 12, 15)}${W(8.5, 9, 7, 5)}</g>` +
    `<g class="p s-office-to-pdf-pdf">${page(10, 8, 12, 15)}${lines(12.5, 15, 7, 3, [1, 0.6])}</g>`,
} as const;
