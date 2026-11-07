import { lines, page } from './kit.ts';

/** The reference scene: how one story is put together. */
export const EXAMPLE_SCENES = {
  // Merge: two pages slide together and become one.
  // Still (and at rest), the icon is the result: one page. The two source pages
  // are opacity 0 in the markup, so they exist only while the story plays.
  merge:
    `<g class="p s-merge-a" opacity="0">${page(1.5, 5.5, 9, 13)}${lines(3.5, 11, 5, 2.5, [1, 0.7])}</g>` +
    `<g class="p s-merge-b" opacity="0">${page(13.5, 5.5, 9, 13)}${lines(15.5, 11, 5, 2.5, [1, 0.7])}</g>` +
    `<g class="p s-merge-one">${page(6, 2.5, 12, 19)}${lines(8.5, 10, 7, 3, [1, 1, 1, 0.6])}</g>`,
} as const;
