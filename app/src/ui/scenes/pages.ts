import { lines, page } from './kit.ts';

/** A page with its sheet washed in the family colour: the one being picked, or a full file. */
const tinted = (svg: string): string => svg.replace('<path d=', '<path fill="currentColor" fill-opacity=".25" d=');

/** A ribbon bookmark hanging from y: open at the top, notched at the foot. */
const ribbon = (x: number, y: number, w: number, h: number, cls: string): string =>
  `<path class="${cls}" fill="currentColor" fill-opacity=".3" d="M${x} ${y}v${h}l${w / 2}-1.6 ${w / 2} 1.6v-${h}"/>`;

/** Page-number glyphs drawn as strokes, 6 units tall, from the top-left corner x, y. */
const glyph = {
  one: (x: number, y: number) => `M${x} ${y + 1.5}l1.6-1.5v6`,
  two: (x: number, y: number) => `M${x} ${y + 1.7}a1.7 1.7 0 0 1 3.4 0c0 1.8-3.4 2.6-3.4 4.3h3.4`,
  three: (x: number, y: number) => `M${x} ${y}h3.2l-1.7 2.3a1.85 1.85 0 1 1-1.5 3`,
  i: (x: number, y: number) => `M${x} ${y}v.01M${x} ${y + 2.6}v3.4`,
};

export const PAGES_SCENES = {
  // Merge: two files slide in until they touch, then fuse into one page. Rest: the one page.
  merge:
    `<g class="p s-merge-a" opacity="0">${page(1.5, 5.5, 9, 13)}${lines(3.5, 11, 5, 2.5, [1, 0.7])}</g>` +
    `<g class="p s-merge-b" opacity="0">${page(13.5, 5.5, 9, 13)}${lines(15.5, 11, 5, 2.5, [1, 0.7])}</g>` +
    `<g class="p s-merge-one">${page(6, 2.5, 12, 19)}${lines(8.5, 10, 7, 3, [1, 1, 1, 0.6])}</g>`,

  // Split: one file, a cut drawn down its middle, two files part along it. Rest: two files and the cut.
  split:
    `<g class="p s-split-a">${page(1.5, 5.5, 8.5, 13)}${lines(3.5, 11, 4.5, 2.5, [1, 0.7])}</g>` +
    `<g class="p s-split-b">${page(14, 5.5, 8.5, 13)}${lines(16, 11, 4.5, 2.5, [1, 0.7])}</g>` +
    `<path class="p s-split-cut" d="M12 2.5v19" stroke-dasharray="2 2.5"/>`,

  // Organise: three pages; the picked one lifts, its neighbour slides under, it drops into the new place.
  // Rest: the new order, with the hop it made drawn above.
  organise:
    `<g class="p s-organise-b">${page(1.5, 12.5, 6, 8.5)}</g>` +
    `<g class="p s-organise-a">${tinted(page(9, 12.5, 6, 8.5))}</g>` +
    page(16.5, 12.5, 6, 8.5) +
    `<path class="p s-organise-hop" pathLength="1" d="M4.5 10.5C4.5 4.5 12 4.5 12 10.5"/>` +
    `<path class="p s-organise-head" d="m9.8 8.3 2.2 2.2 2.2-2.2"/>`,

  // Extract: a row of pages; the middle one is ticked, drops out of the row and becomes a file of its own.
  'extract-pages':
    page(1.5, 1.5, 6, 8.5) +
    page(16.5, 1.5, 6, 8.5) +
    `<g class="p s-extract-pages-out">${tinted(page(7.75, 11, 8.5, 12))}` +
    `<path class="p s-extract-pages-tick" pathLength="1" d="m9.75 17.25 2 2 3-3.75"/></g>`,

  // Insert: two pages part to open a gap, a new page drops into it. Rest: the new page in its place.
  'insert-pages':
    `<g class="p s-insert-pages-a">${page(1.5, 8, 6, 8.5)}</g>` +
    `<g class="p s-insert-pages-b">${page(16.5, 8, 6, 8.5)}</g>` +
    `<g class="p s-insert-pages-new">${page(9, 8, 6, 8.5)}<path d="M12 11v3.5M10.25 12.75h3.5"/></g>`,

  // Crop: crop corners close in on a page; the margins fall away, leaving the trimmed page.
  crop:
    `<g class="p s-crop-big" opacity="0">${page(3, 1.5, 18, 21)}</g>` +
    `<g class="p s-crop-small">${page(6.5, 5.5, 11, 13)}</g>` +
    lines(8.5, 10, 7, 2.5, [1, 1, 0.6]) +
    `<path class="p s-crop-tl" d="M4.5 7.5V3.5h4"/>` +
    `<path class="p s-crop-br" d="M19.5 16.5v4h-4"/>`,

  // Bookmarks: ribbons drop onto the top of a page, one and then another.
  bookmarks:
    page(4, 2, 16, 20) +
    lines(7, 16.5, 10, 2.5, [1, 0.6]) +
    ribbon(7, 2, 3, 9.5, 'p s-bookmarks-a') +
    ribbon(11.5, 2, 3, 6.5, 'p s-bookmarks-b'),

  // Page labels: three pages numbered 1 2 3 turn over to i ii 1.
  'page-labels':
    page(1.5, 1.5, 6, 9) + page(9, 1.5, 6, 9) + page(16.5, 1.5, 6, 9) +
    `<path class="p s-page-labels-old" opacity="0" d="${glyph.one(3.7, 15)}${glyph.two(10.3, 15)}${glyph.three(17.85, 15)}"/>` +
    `<path class="p s-page-labels-new" d="${glyph.i(4.5, 15)}${glyph.i(10.6, 15)}${glyph.i(13.4, 15)}${glyph.one(18.7, 15)}"/>`,

  // Split by size: one wide, full file is cut at thirds into three equal files.
  'split-by-size':
    `<g class="p s-split-by-size-one" opacity="0">${tinted(page(3, 7, 18, 10))}</g>` +
    `<path class="p s-split-by-size-cuts" opacity="0" d="M9 4v16M15 4v16" stroke-dasharray="2 2"/>` +
    `<g class="p s-split-by-size-a">${tinted(page(1.5, 7, 6, 10))}</g>` +
    `<g class="p s-split-by-size-b">${tinted(page(9, 7, 6, 10))}</g>` +
    `<g class="p s-split-by-size-c">${tinted(page(16.5, 7, 6, 10))}</g>`,
} as const;
