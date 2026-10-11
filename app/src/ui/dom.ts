/** A small element builder, so components read as markup rather than as a pile of createElement calls. */

type Child = Node | string | null | undefined | false;

export interface Attrs {
  readonly class?: string;
  readonly text?: string;
  readonly testid?: string;
  readonly attrs?: Readonly<Record<string, string | undefined>>;
  readonly on?: Readonly<Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  if (attrs.testid) node.dataset['testid'] = attrs.testid;
  if (attrs.attrs) {
    for (const [name, value] of Object.entries(attrs.attrs)) {
      if (value !== undefined) node.setAttribute(name, value);
    }
  }
  if (attrs.on) {
    for (const [type, handler] of Object.entries(attrs.on)) {
      if (handler) node.addEventListener(type, handler as EventListener);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Inline SVG from a path string; `currentColor` strokes so it follows the text colour. */
export function icon(paths: string, size = 24): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = paths;
  return svg;
}

export const ICONS = {
  up: '<path d="M12 19V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="M12 5v14m6-6-6 6-6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  left: '<path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

export function clear(node: Element): void {
  while (node.firstChild) node.firstChild.remove();
}
