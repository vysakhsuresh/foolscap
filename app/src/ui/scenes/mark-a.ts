import { box, lines, page } from './kit.ts';

/** Mark up, first half: stories of a mark landing on a page. */
export const MARK_A_SCENES = {
  // Watermark: a rubber stamp comes down on the page at a slant, presses, lifts, and leaves its label.
  watermark:
    page(4, 2, 16, 20) +
    `<g class="p s-watermark-mark"><g transform="rotate(-30 12 13.5)">${box(7, 10.9, 10, 5.2, '', 1)}<path d="M9.5 13.5h5"/></g></g>` +
    `<g class="p s-watermark-stamp" opacity="0"><path d="M13.2 10.5V7.8c0-.9.6-.9.6-2.1a1.8 1.8 0 0 0-3.6 0c0 1.2.6 1.2.6 2.1v2.7"/><path d="M16.8 12a1.5 1.5 0 0 0-1.5-1.5H8.7A1.5 1.5 0 0 0 7.2 12v.9a.6.6 0 0 0 .6.6h8.4a.6.6 0 0 0 .6-.6z"/></g>`,

  // Page numbers: two pages, and a number is written at each foot in turn, 1 then 2.
  'page-numbers':
    page(1.5, 2.5, 9.5, 19) + lines(3.5, 7.5, 5.5, 2.5, [1, 1, 0.6]) +
    page(13, 2.5, 9.5, 19) + lines(15, 7.5, 5.5, 2.5, [1, 1, 0.6]) +
    `<path class="p s-page-numbers-1" pathLength="1" d="M5.3 16.4l1.2-1v4.1"/>` +
    `<path class="p s-page-numbers-2" pathLength="1" d="M16.5 16.4a1.3 1.3 0 0 1 2.6 0c0 1.1-2.6 1.9-2.6 3.1h2.7"/>`,

  // Sign: a pen writes a looping signature on the line at the foot of the page.
  sign:
    page(4, 2, 16, 20) + lines(7, 7, 10, 3, [1, 0.8]) +
    `<path d="M7 19h10"/>` +
    `<path class="p s-sign-name" pathLength="1" d="M7.5 16.5c.8-1.2 1.6-3.6 2.6-3.6s-.6 4.4.4 4.4 1.4-2.6 2.2-2.6-.2 2.2.6 2.2 1.2-1.6 2-1.6.4 1.2 1.2 1.2"/>` +
    `<g class="p s-sign-pen" opacity="0"><path d="M16.5 16.5l.1-1.8 2.4-3.2a1 1 0 0 1 1.6 1.2l-2.4 3.2z" fill="currentColor" fill-opacity="0.3"/></g>`,

  // Mark up: a highlighter sweeps along a line leaving a band, then a ring is drawn round a word.
  'mark-up':
    page(4, 2, 16, 20) + lines(7, 6.5, 10, 4, [0.8, 1]) +
    `<path d="M7 16.5h1.5M13 16.5h2.8"/>` +
    `<g class="p s-mark-up-band"><rect x="6" y="9" width="12" height="3" fill="currentColor" fill-opacity="0.35" stroke="none"/></g>` +
    `<path class="p s-mark-up-ring" pathLength="1" d="M17.31 14.76A3.8 2.7 0 1 0 11.96 18.57A3.9 2.8 0 1 0 16.35 14.08"/>` +
    `<g class="p s-mark-up-pen" opacity="0"><g transform="translate(6.5 10.5) rotate(35)"><path d="M-1.6-3L-.9 0h1.8l.7-3zM-1.6-3v-4h3.2v4" fill="currentColor" fill-opacity="0.3"/></g></g>`,

  // Edit text: a word is selected, deleted, and a different word typed in its place.
  'edit-text':
    page(4, 2, 16, 20) + lines(7, 6, 10, 3.8, [0.8, 1]) +
    `<path d="M7 14.5h2.5M7 19.2h6"/>` +
    `<g class="p s-edit-text-sel" opacity="0"><rect x="10.2" y="12.5" width="8" height="4" fill="currentColor" fill-opacity="0.35" stroke="none"/></g>` +
    `<path class="p s-edit-text-old" opacity="0" d="M11.5 14.5h5.5"/>` +
    `<path class="p s-edit-text-new" pathLength="1" d="M11.5 14.5h2.5"/>` +
    `<path class="p s-edit-text-cur" d="M15.7 12.3h1.6M16.5 12.3v4.4M15.7 16.7h1.6"/>`,

  // Add text: a tap on the empty part of the page opens a text box and a new line types in.
  'add-text':
    page(4, 2, 16, 20) + lines(7, 6.5, 10, 3, [1, 0.6]) +
    `<circle class="p s-add-text-tap" opacity="0" cx="8" cy="16" r="3" fill="currentColor" fill-opacity="0.2"/>` +
    `<g class="p s-add-text-box">${box(6, 13, 11.5, 6, '', 1)}</g>` +
    `<path class="p s-add-text-line" pathLength="1" d="M8 16h4.5"/>` +
    `<path class="p s-add-text-cur" opacity="0" d="M15 14.3v3.4"/>`,
} as const;
