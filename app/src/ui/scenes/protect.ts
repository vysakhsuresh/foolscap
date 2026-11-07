import { box, lines, page } from './kit.ts';

/*
 * The padlock both password stories share: a body on the page and a shackle
 * in two pieces, the left leg (which never leaves the body) and the arc with
 * the right leg, which swings about the top of the left leg (9.5, 10).
 * Closed, the arc's right leg goes down into the body; open, it is swung up
 * 30 degrees, as an unlocked padlock is drawn.
 */
const BODY = box(7.5, 12.5, 9, 7.5, '', 1.5);
const LEG = '<path d="M9.5 12.5V10"/>';
const ARC_SHUT = 'M9.5 10a2.5 2.5 0 0 1 5 0v2.5';
const ARC_OPEN = 'M9.5 10a2.5 2.5 0 0 1 4.33-2.5l1.25 2.17';
const SHEET = page(4, 2, 16, 20);

export const PROTECT_SCENES = {
  // Add a password: the page alone, an open padlock drops onto it, its shackle snaps shut.
  'add-password':
    SHEET +
    `<g class="p s-add-password-lock">${BODY}${LEG}<path class="p s-add-password-arc" d="${ARC_SHUT}"/></g>`,

  // Remove a password: a page with its padlock shut; the shackle springs open.
  'remove-password':
    SHEET +
    `<g class="p s-remove-password-lock">${BODY}${LEG}<path class="p s-remove-password-arc" d="${ARC_OPEN}"/></g>`,

  // Digital signature: a page of writing; a seal with ribbons is pressed onto it; a tick draws inside.
  'digital-sign':
    page(4, 2, 16, 20) +
    lines(7.5, 6.5, 7, 2.5, [0.9, 0.6]) +
    `<g class="p s-digital-sign-seal">` +
    `<circle cx="12" cy="14.5" r="3.6" fill="currentColor" fill-opacity="0.2"/>` +
    `<path d="M10.2 17.6 9.4 20.5M13.8 17.6l.8 2.9"/>` +
    `<path class="p s-digital-sign-tick" pathLength="1" d="M10.4 14.6l1.1 1.1 2.2-2.3"/>` +
    `</g>`,

  // Remove areas: a box is drawn round one line, the words inside it go, the box fills solid.
  'remove-areas':
    page(4, 2, 16, 20) +
    lines(7.5, 6.5, 6.5, 1, [1]) +
    lines(7.5, 16.5, 9, 3, [1, 0.6]) +
    `<path class="p s-remove-areas-words" opacity="0" d="M8.5 11.5h7"/>` +
    `<rect class="p s-remove-areas-fill" x="6.5" y="9.5" width="11" height="4" rx="1" fill="currentColor" stroke="none"/>` +
    `<rect class="p s-remove-areas-mark" pathLength="1" x="6.5" y="9.5" width="11" height="4" rx="1"/>`,

  // Clean hidden data: a tag sits on the page; the brush swings across it and the tag is swept away.
  'document-details':
    page(2.5, 2, 13, 20) +
    lines(5, 8.5, 7.5, 3, [1, 0.8]) +
    `<g class="p s-document-details-tag" opacity="0"><path d="M7.5 14.5h4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-4L5 17z"/><path d="M8 17h.01"/></g>` +
    `<g class="p s-document-details-brush"><path d="M19.5 2.5v9"/><path d="M17.5 11.5h4l1 9.5h-6z"/><path d="M19.5 15V21"/></g>`,

  // Attachments: a small file slides onto the page and sinks into it; a paperclip clips onto the page's edge.
  attachments:
    page(4, 4, 16, 18.5) +
    lines(7, 16.5, 10, 3, [1, 0.6]) +
    `<g class="p s-attachments-file" opacity="0">${page(10, 6.5, 6.5, 8)}</g>` +
    `<path class="p s-attachments-clip" d="M10 5v4.75a1.25 1.25 0 0 1-2.5 0V3.5a2.5 2.5 0 0 1 5 0v5"/>`,
} as const;
