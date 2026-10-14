/**
 * Zoom, the same in every tool that shows a page: − and + buttons with the
 * size between them (tap it to fit the page again), two fingers to pinch, and
 * Ctrl or ⌘ with the wheel (a laptop trackpad's pinch arrives as that).
 *
 * The pinch is read in the capture phase, before the page's own handlers see
 * the touch, so a second finger turns whatever the first one started into a
 * zoom; `begin` is where the page undoes it.
 */
import { el } from './dom';

export interface ZoomButtons {
  readonly root: HTMLElement;
  /** Shows `zoom` on the label and greys out a button at either end. */
  show(zoom: number, min: number, max: number): void;
}

export function zoomButtons(prefix: string, on: { readonly out: () => void; readonly fit: () => void; readonly in: () => void }): ZoomButtons {
  const out = el('button', { class: 'button button--ghost button--small zoom__step', testid: `${prefix}-zoom-out`, text: '−', attrs: { type: 'button', 'aria-label': 'Zoom out' } });
  const label = el('button', { class: 'button button--ghost button--small zoom__size', testid: `${prefix}-zoom`, text: '100%', attrs: { type: 'button', 'aria-label': 'Fit the page' } });
  const zin = el('button', { class: 'button button--ghost button--small zoom__step', testid: `${prefix}-zoom-in`, text: '+', attrs: { type: 'button', 'aria-label': 'Zoom in' } });
  out.addEventListener('click', on.out);
  label.addEventListener('click', on.fit);
  zin.addEventListener('click', on.in);
  return {
    root: el('div', { class: 'zoom', attrs: { role: 'group', 'aria-label': 'Zoom' } }, [out, label, zin]),
    show(zoom, min, max) {
      label.textContent = `${Math.round(zoom * 100)}%`;
      out.disabled = zoom <= min + 0.001;
      zin.disabled = zoom >= max - 0.001;
    },
  };
}

/** The next step up or down from `zoom` in `steps`, or `zoom` itself at the end. */
export function stepZoom(steps: readonly number[], zoom: number, way: 1 | -1): number {
  return way > 0 ? (steps.find((z) => z > zoom + 0.001) ?? zoom) : ([...steps].reverse().find((z) => z < zoom - 0.001) ?? zoom);
}

export interface ZoomGestures {
  /** The first finger touched down: remember what the page looked like, in case it becomes a pinch. */
  readonly touch?: () => void;
  /** A second finger landed: stop whatever the first one started. */
  readonly begin: () => void;
  /** `scale` since the pinch began, about the fingers' midpoint (client pixels). */
  readonly move: (scale: number, x: number, y: number) => void;
  /** The fingers lifted. */
  readonly end: () => void;
  /** Ctrl or ⌘ with the wheel: zoom by `factor` about the pointer. */
  readonly wheel: (factor: number, x: number, y: number) => void;
}

/**
 * Watches `surface` for pinches and Ctrl-wheel. Returns the function that
 * stops watching. `pinch: false` leaves two fingers to the page (a grid that
 * drags pages with them) and listens to the wheel only.
 */
export function watchZoomGestures(surface: HTMLElement, on: ZoomGestures, opts: { readonly pinch?: boolean } = {}): () => void {
  const pinches = opts.pinch !== false;
  const fingers = new Map<number, { x: number; y: number }>();
  /** Fingers that took part in a pinch: theirs until they lift, never the page's. */
  const held = new Set<number>();
  let pinching = false;
  let start = 1;
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const middle = (): [number, number] => {
    const [a, b] = [...fingers.values()];
    return a && b ? [(a.x + b.x) / 2, (a.y + b.y) / 2] : [0, 0];
  };
  const down = (ev: PointerEvent) => {
    if (ev.pointerType !== 'touch') return;
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (fingers.size === 1) on.touch?.();
    if (fingers.size === 2 && !pinching) {
      pinching = true;
      start = Math.max(1, spread());
      for (const id of fingers.keys()) held.add(id);
      on.begin();
    }
    if (held.has(ev.pointerId)) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  };
  const move = (ev: PointerEvent) => {
    const finger = fingers.get(ev.pointerId);
    if (!finger) return;
    finger.x = ev.clientX;
    finger.y = ev.clientY;
    if (pinching && fingers.size >= 2) {
      const [x, y] = middle();
      on.move(spread() / start, x, y);
    }
    if (held.has(ev.pointerId)) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  };
  const up = (ev: PointerEvent) => {
    if (!fingers.delete(ev.pointerId)) return;
    if (pinching && fingers.size < 2) {
      pinching = false;
      on.end();
    }
    if (held.delete(ev.pointerId)) ev.stopPropagation();
  };
  const wheel = (ev: WheelEvent) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    // Lines and pages are counted as pixels; a trackpad pinch sends small steps, a wheel big ones.
    const pixels = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
    on.wheel(Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.01), ev.clientX, ev.clientY);
  };
  if (pinches) {
    surface.addEventListener('pointerdown', down, { capture: true });
    surface.addEventListener('pointermove', move, { capture: true });
    surface.addEventListener('pointerup', up, { capture: true });
    surface.addEventListener('pointercancel', up, { capture: true });
  }
  surface.addEventListener('wheel', wheel, { passive: false });
  return () => {
    surface.removeEventListener('pointerdown', down, { capture: true });
    surface.removeEventListener('pointermove', move, { capture: true });
    surface.removeEventListener('pointerup', up, { capture: true });
    surface.removeEventListener('pointercancel', up, { capture: true });
    surface.removeEventListener('wheel', wheel);
  };
}

/**
 * Keeps the point of `content` that was under `from` (client pixels) under
 * `to` (the same place, unless the fingers moved) after `content` changed
 * size, by scrolling: the point a pinch or wheel zooms about stays where the
 * fingers are. `before` is content's rect before the change; the scrollers
 * are tried in turn (the page's own frame, then the window), each taking
 * what the last could not.
 */
export function holdPoint(
  scrollers: ReadonlyArray<HTMLElement | Window>,
  content: HTMLElement,
  before: DOMRect,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number } = from,
): void {
  const fx = before.width > 0 ? (from.x - before.left) / before.width : 0.5;
  const fy = before.height > 0 ? (from.y - before.top) / before.height : 0.5;
  for (const scroller of scrollers) {
    const after = content.getBoundingClientRect();
    const dx = after.left + fx * after.width - to.x;
    const dy = after.top + fy * after.height - to.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    scroller.scrollBy({ left: dx, top: dy, behavior: 'instant' });
  }
}
