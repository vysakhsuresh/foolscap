import { box, lines, page } from './kit.ts';

/*
 * The Pages family: what each tool does to a document's pages, shown on the
 * pages themselves. A row of pages always sits on the same three slots (left
 * edges 1.25, 9.25, 17.25; 5.5 wide; centres 4, 12, 20), so the gaps stay
 * open at 24px and the stories read as one family.
 */

/** A row slot's page, `h` tall from `y`. */
const slot = (i: 0 | 1 | 2, y: number, h = 8): string => page(1.25 + 8 * i, y, 5.5, h);

/** A page with its sheet washed in the family colour: the one being picked, or a full file. */
const tinted = (svg: string): string => svg.replace('<path d=', '<path fill="currentColor" fill-opacity=".25" d=');

/** A ribbon bookmark hanging from y: open at the top, notched at the foot. */
const ribbon = (x: number, y: number, w: number, h: number, cls: string): string =>
  `<path class="${cls}" fill="currentColor" fill-opacity=".3" d="M${x} ${y}v${h}l${w / 2}-1.5 ${w / 2} 1.5v-${h}"/>`;

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

  // Split: one file, a cut drawn down its middle, and two files part along it. Rest: two files and the cut.
  split:
    `<g class="p s-split-a">${page(1.5, 5.5, 8, 13)}${lines(3.5, 11, 4, 2.5, [1, 0.7])}</g>` +
    `<g class="p s-split-b">${page(14.5, 5.5, 8, 13)}${lines(16.5, 11, 4, 2.5, [1, 0.7])}</g>` +
    `<path class="p s-split-cut" d="M12 2.5v19" stroke-dasharray="2 2.5"/>`,

  // Organise: the last page lifts, the other two shift along under it, it drops in at the front.
  // Rest: the new order, with the hop it made drawn above.
  organise:
    `<g class="p s-organise-a">${tinted(slot(0, 13))}</g>` +
    `<g class="p s-organise-rest">${slot(1, 13)}${slot(2, 13)}</g>` +
    `<path class="p s-organise-hop" pathLength="1" d="M20 10.5C20 3.5 4 3.5 4 10.5"/>` +
    `<path class="p s-organise-head" d="m1.8 8.3 2.2 2.2 2.2-2.2"/>`,

  // Extract: the middle page of a row is ticked, then drops out of the row and becomes a file of its own.
  // Rest: the row with its gap, and the picked page below.
  'extract-pages':
    slot(0, 1.5) +
    slot(2, 1.5) +
    `<g class="p s-extract-pages-out">${tinted(page(8.15, 11.5, 7.7, 11.2))}` +
    `<path class="p s-extract-pages-tick" pathLength="1" d="m10 17.4 1.7 1.7 2.6-3.3"/></g>`,

  // Insert: two pages part to open a gap, a new page drops into it. Rest: the new page in its place, a plus above.
  'insert-pages':
    `<g class="p s-insert-pages-a">${slot(0, 9)}</g>` +
    `<g class="p s-insert-pages-b">${slot(2, 9)}</g>` +
    `<g class="p s-insert-pages-new">${tinted(slot(1, 9))}</g>` +
    `<path class="p s-insert-pages-plus" d="M12 2.5v4M10 4.5h4"/>`,

  // Crop: a sheet; the two arms of a crop frame lift off its edges and close in on the words,
  // and the margins fall away. Rest: the crop frame around the words.
  crop:
    `<g class="p s-crop-sheet" opacity="0">${box(4, 1.5, 16, 21)}</g>` +
    lines(9, 9.5, 6, 2.5, [1, 1, 0.6]) +
    `<path class="p s-crop-a" d="M7 2.5v15A1.5 1.5 0 0 0 8.5 19h13"/>` +
    `<path class="p s-crop-b" d="M17 21.5v-15A1.5 1.5 0 0 0 15.5 5h-13"/>`,

  // Bookmarks: one ribbon, then another, drops onto the top of the page.
  bookmarks:
    page(3.5, 2, 17, 20) +
    lines(6.5, 16.5, 11, 2.5, [1, 0.6]) +
    ribbon(5.75, 2, 2.5, 9.5, 'p s-bookmarks-a') +
    ribbon(10.25, 2, 2.5, 6.5, 'p s-bookmarks-b'),

  // Page labels: three pages numbered 1 2 3 turn over to i ii 1.
  'page-labels':
    slot(0, 2.5, 8.5) + slot(1, 2.5, 8.5) + slot(2, 2.5, 8.5) +
    `<path class="p s-page-labels-old" opacity="0" d="${glyph.one(3.2, 15)}${glyph.two(10.3, 15)}${glyph.three(18.3, 15)}"/>` +
    `<path class="p s-page-labels-new" d="${glyph.i(4, 15)}${glyph.i(10.6, 15)}${glyph.i(13.4, 15)}${glyph.one(19.2, 15)}"/>`,

  // Split by size: one wide, full file is cut at thirds into three equal files that part.
  'split-by-size':
    `<g class="p s-split-by-size-one" opacity="0">${tinted(page(3.75, 7, 16.5, 10))}</g>` +
    `<path class="p s-split-by-size-cuts" opacity="0" d="M9.25 4v16M14.75 4v16" stroke-dasharray="2 2"/>` +
    `<g class="p s-split-by-size-a">${tinted(slot(0, 7, 10))}</g>` +
    `<g class="p s-split-by-size-b">${tinted(slot(1, 7, 10))}</g>` +
    `<g class="p s-split-by-size-c">${tinted(slot(2, 7, 10))}</g>`,
} as const;
