import { box, lines, page } from './kit.ts';

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** A picture as the icons draw one: a frame, a small sun and a mountain line. */
const picture = (x: number, y: number, w: number, h: number): string =>
  box(x, y, w, h, '', 1) +
  `<circle cx="${n(x + w * 0.28)}" cy="${n(y + h * 0.34)}" r="0.9"/>` +
  `<path d="M${n(x + w * 0.3)} ${n(y + h)}l${n(w * 0.36)} -${n(h * 0.5)} ${n(w * 0.34)} ${n(h * 0.5)}"/>`;

/** The page shape filled with a soft tint and no outline, for a page that takes a colour. */
const tint = (x: number, y: number, w: number, h: number, cls: string): string => {
  const outline = /<path d="([^"]+)"/.exec(page(x, y, w, h))?.[1] ?? '';
  return `<path class="${cls}" d="${outline}" fill="currentColor" fill-opacity="0.3" stroke="none"/>`;
};

/** The second half of Mark up: pictures, forms, and what goes round the words. */
export const MARK_B_SCENES = {
  // Edit pictures: a small picture already on the page is pulled by its corner
  // with the pointer, moving down and growing into its new place. At rest: the
  // picture in its new place, the pointer still holding its corner.
  'edit-images':
    page(4, 2, 16, 20) +
    lines(7, 19.5, 6, 0, [1]) +
    `<g class="p s-edit-images-pic">${picture(6.5, 9, 8, 6.5)}</g>` +
    `<path class="p s-edit-images-grip" d="M14.5 15.5l1.3 3.9.8-1.8 1.8-.8z" fill="currentColor" stroke-width="1.2"/>`,

  // Add image: a picture is set down onto the page from above, tilted, and
  // settles in the space under the words.
  'add-image':
    page(4, 2, 16, 20) +
    lines(7, 6, 6, 2.5, [1, 0.7]) +
    `<g class="p s-add-image-pic">${picture(7, 11.5, 10, 7.5)}</g>`,

  // Fill in a form: the empty box is typed into, left to right, then the
  // checkbox is ticked (its corner opens for the tick to pass through). At
  // rest: the filled form.
  'fill-form':
    page(4, 2, 16, 20) +
    lines(7, 6, 4.5, 0, [1]) +
    box(7, 9, 10, 4.5, '', 1) +
    `<path class="p s-fill-form-text" pathLength="1" d="M9 11.25h5"/>` +
    `<path class="p s-fill-form-caret" opacity="0" d="M10 9.9v2.7"/>` +
    `<path d="M11 18.4V20H7V16h2.4"/>` +
    `<path class="p s-fill-form-shut" opacity="0" d="M9.4 16H11v2.4"/>` +
    `<path class="p s-fill-form-tick" pathLength="1" d="M8.4 17.8l1.5 1.5 3.6-4"/>` +
    lines(15, 18, 2.5, 0, [1]),

  // Page background: a plain page fills with a soft colour that rises up it
  // under the words. At rest: the coloured page.
  background:
    tint(4, 2, 16, 20, 'p s-background-tint') +
    page(4, 2, 16, 20) +
    lines(7, 9.5, 10, 2.5, [1, 1, 1, 0.6]),

  // Create a form: a printed form's blank lines become boxes, one by one: the
  // long blank grows into a text box, the short one into a checkbox. At rest:
  // the fillable form, its boxes empty.
  'create-form':
    page(4, 2, 16, 20) +
    lines(7, 6, 4.5, 0, [1]) +
    `<path d="M7 13.5h10"/>` +
    `<path class="p s-create-form-field" pathLength="1" d="M7 13.5V9H17V13.5"/>` +
    `<path d="M7 20h4"/>` +
    `<path class="p s-create-form-check" pathLength="1" d="M7 20V16H11V20"/>` +
    lines(15, 18, 2.5, 0, [1]),

  // Header and footer: a band opens across the top of the page carrying a
  // line (the header), then one across the bottom (the footer), leaving the
  // body text between them alone.
  'header-footer':
    `<g class="p s-header-footer-head"><path d="M5.5 2H14.88L20 7.12V8H4V3.5A1.5 1.5 0 0 1 5.5 2z" fill="currentColor" fill-opacity="0.3" stroke="none"/><path d="M7 5h5"/></g>` +
    `<g class="p s-header-footer-foot"><path d="M4 17.5H20V20.5A1.5 1.5 0 0 1 18.5 22H5.5A1.5 1.5 0 0 1 4 20.5z" fill="currentColor" fill-opacity="0.3" stroke="none"/><path d="M9.5 19.75h5"/></g>` +
    page(4, 2, 16, 20) +
    lines(7, 10.5, 10, 2.25, [1, 1, 0.6]),
} as const;
