/**
 * The mark: a sheet of foolscap, blue ruled lines across it and the red
 * margin lines every Indian exam sheet carries. Down the side and across the
 * top, those margin lines already make an F; one more stroke finishes it.
 * Drawn flat in Sheaf's colours (navy, cream, its magenta lifted a little
 * brighter), because Foolscap is Sheaf on the web.
 *
 * One drawing, used everywhere: the header (scripts/gen-pages.ts), the share
 * pictures (scripts/gen-og.ts) and every icon file (scripts/gen-brand.ts).
 * Below about 40 pixels the ruled lines only blur, so small sizes drop them
 * and draw the F a little bolder.
 */
export const BRAND = {
  navy: '#101A2B',
  paper: '#F7F5EF',
  rule: '#CBD6E8',
  margin: '#FF2D87',
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

/** How much of the drawing to keep: a browser tab gets three lines, a button four, anything larger five. */
type Detail = 'tiny' | 'small' | 'full';

const SHEETS: Record<Detail, { box: readonly [number, number, number, number]; stem: number; top: number; mid: number; weight: number; lines: number; first: number; inset: number; rule: number }> = {
  full: { box: [25, 11, 50, 78], stem: 12, top: 14, mid: 0.48, weight: 6.5, lines: 5, first: 13, inset: 7, rule: 2.3 },
  small: { box: [21, 6, 58, 88], stem: 13, top: 15, mid: 0.48, weight: 9, lines: 4, first: 17, inset: 9, rule: 3.4 },
  tiny: { box: [12, 8, 76, 84], stem: 16, top: 12, mid: 0.46, weight: 15, lines: 3, first: 40, inset: 5, rule: 6.5 },
};

/**
 * The ruled lines' ink: soft, so they sit behind the F rather than strike it
 * through. On a dark ground and on a light one (components.css restyles the
 * light theme). A browser tab is neither page, so the favicon takes a little
 * more ink (TAB_RULE_*), or its lines would vanish into the tab.
 */
export const RULE_ON_DARK = '#3F4B66';
export const RULE_ON_LIGHT = '#C9D3E6';
export const TAB_RULE_ON_DARK = '#6E7D9C';
export const TAB_RULE_ON_LIGHT = '#AAB8D2';

/**
 * The mark as part of the page, for the header and the way home: no tile, no
 * paper colour and no edge, so the page's own ground is the sheet (dark in the
 * dark theme, light in the light one) and all that shows is the ruled lines
 * and the red F. The colours here are the dark theme's; the light theme
 * restyles the classes (components.css). `crop` trims the drawing to the
 * sheet, for a box shaped like it.
 *
 * The icon files draw the same thing: the favicon on nothing at all (the tab
 * is its ground, and `adaptive` picks the lines' ink from the browser's own
 * light or dark), the install icons on the site's dark ground, because a phone
 * fills an icon's empty corners with black anyway.
 */
export function siteMarkSvg({
  small = false,
  detail = small ? 'small' : 'full',
  crop = false,
  attrs = '',
  ground,
  scale = 1,
  adaptive = false,
}: {
  readonly small?: boolean;
  readonly detail?: Detail;
  readonly crop?: boolean;
  readonly attrs?: string;
  /** A solid ground: rounded like an app tile, or full bleed for a platform that rounds it itself. */
  readonly ground?: { readonly colour: string; readonly round: boolean };
  /** Shrinks the drawing towards the middle (a maskable icon keeps it inside the safe circle). */
  readonly scale?: number;
  readonly adaptive?: boolean;
} = {}): string {
  const d = SHEETS[detail];
  const [x, y, w, h] = d.box;
  const stem = x + d.stem;
  const top = y + d.top;
  const mid = y + h * d.mid;
  const first = top + d.first;
  const last = y + h - d.inset;
  const rules = Array.from({ length: d.lines }, (_, i) => first + ((last - first) * i) / (d.lines - 1))
    .map((ry) => `<path class="mark__rule" d="M${x} ${ry.toFixed(1)}H${x + w}" stroke="${RULE_ON_DARK}" stroke-width="${d.rule}"/>`)
    .join('');
  const pad = 2;
  const box = crop ? `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}` : '0 0 100 100';
  const style = adaptive ? `<style>.mark__rule{stroke:${TAB_RULE_ON_DARK}}@media (prefers-color-scheme: light){.mark__rule{stroke:${TAB_RULE_ON_LIGHT}}}</style>` : '';
  const back = ground ? `<rect width="100" height="100"${ground.round ? ' rx="22"' : ''} fill="${ground.colour}"/>` : '';
  const drawing =
    `${rules}<path class="mark__f" d="M${stem} ${y}V${y + h}M${stem} ${top}H${x + w}" stroke="${BRAND.margin}" stroke-width="${d.weight}"/>` +
    `<path class="mark__f" d="M${stem} ${mid.toFixed(1)}H${(x + w * 0.74).toFixed(1)}" stroke="${BRAND.margin}" stroke-width="${d.weight}" stroke-linecap="round"/>`;
  const placed = scale === 1 ? `<g>${drawing}</g>` : `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${drawing}</g>`;
  return `<svg ${attrs} viewBox="${box}">${style}${back}${placed}</svg>`;
}
