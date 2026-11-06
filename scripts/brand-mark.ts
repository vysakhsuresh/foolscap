/**
 * The mark: a sheet of foolscap, blue ruled lines across it and the red
 * margin lines every Indian exam sheet carries. Down the side and across the
 * top, those margin lines already make an F; one more stroke finishes it.
 * Drawn flat in Sheaf's colours (navy, cream, its magenta), because Foolscap
 * is Sheaf on the web.
 *
 * One drawing, used everywhere: the header (scripts/gen-pages.ts), the share
 * pictures (scripts/gen-og.ts) and every icon file (scripts/gen-brand.ts).
 * Below about 40 pixels the ruled lines only blur, so small sizes drop them
 * and draw the F a little bolder.
 */
export const BRAND = {
  navy: '#101A2B',
  paper: '#F7F5EF',
  rule: '#A9BCDD',
  margin: '#E0257A',
} as const;

export interface MarkOptions {
  /** Unique within the page: the sheet's clip path is named after it. */
  readonly id: string;
  /** 'tile': the sheet on Sheaf's navy, rounded. 'square': the same, full bleed, for an icon a platform rounds itself. 'none': the sheet alone. */
  readonly ground?: 'tile' | 'square' | 'none';
  /** Small sizes: no ruled lines, a bolder F, a larger sheet. */
  readonly small?: boolean;
  /** Shrinks the drawing towards the middle (a maskable icon keeps it inside the safe circle). */
  readonly scale?: number;
  /** Extra attributes for the <svg> element (class, size, aria). */
  readonly attrs?: string;
}

export function markSvg({ id, ground = 'tile', small = false, scale = 1, attrs = 'xmlns="http://www.w3.org/2000/svg"' }: MarkOptions): string {
  // The sheet: foolscap's tall proportion, 8 by 13 near enough.
  const [x, y, w, h] = small ? [21, 8, 58, 84] : [25, 11, 50, 78];
  const stem = x + (small ? 13 : 12);
  const top = y + (small ? 16 : 14);
  const mid = y + h * (small ? 0.47 : 0.495);
  const weight = small ? 9 : 6;
  const rules = small ? '' : [36, 45, 54, 63, 72, 81].map((ry) => `<path d="M${x} ${ry}H${x + w}" stroke="${BRAND.rule}" stroke-width="1.6"/>`).join('');
  const back =
    ground === 'tile'
      ? `<rect width="100" height="100" rx="22" fill="${BRAND.navy}"/>`
      : ground === 'square'
        ? `<rect width="100" height="100" fill="${BRAND.navy}"/>`
        : '';
  // On a light page the sheet alone needs an edge, or cream vanishes into white.
  const edge = ground === 'none' ? `<rect x="${x - 0.75}" y="${y - 0.75}" width="${w + 1.5}" height="${h + 1.5}" rx="5.75" fill="none" stroke="${BRAND.navy}" stroke-opacity=".28" stroke-width="1.5"/>` : '';
  const body =
    `${edge}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${BRAND.paper}"/>` +
    `<g clip-path="url(#${id})">${rules}` +
    `<path d="M${stem} ${y}V${y + h}M${stem} ${top}H${x + w}" stroke="${BRAND.margin}" stroke-width="${weight}"/>` +
    `<path d="M${stem} ${mid}H${x + w * (small ? 0.74 : 0.74)}" stroke="${BRAND.margin}" stroke-width="${weight}" stroke-linecap="round"/></g>`;
  const placed = scale === 1 ? body : `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${body}</g>`;
  return `<svg ${attrs} viewBox="0 0 100 100"><defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/></clipPath></defs>${back}${placed}</svg>`;
}

/**
 * The F alone, in the margin's magenta, for the way home: the round button is
 * its ground (near-black in the dark theme, white in the light one), so it
 * needs no sheet of its own.
 */
export function letterSvg(attrs = 'xmlns="http://www.w3.org/2000/svg"'): string {
  return `<svg ${attrs} viewBox="0 0 100 100"><path d="M34 17V85M28 23H74" fill="none" stroke="${BRAND.margin}" stroke-width="12"/><path d="M34 50H63" fill="none" stroke="${BRAND.margin}" stroke-width="12" stroke-linecap="round"/></svg>`;
}
