/**
 * The pieces every tool's scene is drawn from, so forty-six small stories
 * share one hand: Lucide's line on a 24-unit grid, stroked in the family's
 * colour. Each helper returns SVG markup; `cls` names the part for the
 * scene's stylesheet (give every moving part the class `p` as well, which
 * gives it the shared timing in base.css).
 */

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** A sheet of paper with its top-right corner folded, as Lucide draws a file, at any size. */
export function page(x: number, y: number, w: number, h: number, cls = ''): string {
  const f = Math.min(w, h) * 0.32;
  const r = Math.min(1.5, w * 0.14);
  const outline = `M${n(x + r)} ${n(y)}H${n(x + w - f)}L${n(x + w)} ${n(y + f)}V${n(y + h - r)}a${n(r)} ${n(r)} 0 0 1-${n(r)} ${n(r)}H${n(x + r)}a${n(r)} ${n(r)} 0 0 1-${n(r)}-${n(r)}V${n(y + r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)}-${n(r)}z`;
  const fold = `M${n(x + w - f)} ${n(y)}V${n(y + f)}H${n(x + w)}`;
  return `<g${cls ? ` class="${cls}"` : ''}><path d="${outline}"/><path d="${fold}"/></g>`;
}

/** A plain rectangle with soft corners: a card, a box, a screen. */
export function box(x: number, y: number, w: number, h: number, cls = '', r = 1.5): string {
  return `<rect${cls ? ` class="${cls}"` : ''} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}"/>`;
}

/**
 * Lines of text, one under another, of the lengths given as fractions of
 * `w` (the last line of a paragraph is shorter). One path, or one path per
 * line when `each` is set, so lines can move one by one.
 */
export function lines(x: number, y: number, w: number, gap: number, lengths: readonly number[], cls = '', each = false): string {
  const seg = (l: number, i: number) => `M${n(x)} ${n(y + gap * i)}h${n(w * l)}`;
  if (!each) return `<path${cls ? ` class="${cls}"` : ''} d="${lengths.map(seg).join('')}"/>`;
  return lengths.map((l, i) => `<path class="${cls ? `${cls} ` : ''}${cls ? `${cls}-${i + 1}` : ''}" d="${seg(l, i)}"/>`).join('');
}
