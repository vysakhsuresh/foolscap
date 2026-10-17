/**
 * What every drag-to-reorder on the site shares: the organise grid's tiles
 * and the file list's rows. A mouse drags at once; a finger holds a moment
 * first, so a swipe still scrolls the page.
 */

/** How long a finger rests on an item before it lifts to be dragged; a swipe sooner than this scrolls. */
export const HOLD_MS = 350;
/** How far a mouse moves with its button down before that is a drag rather than a click. */
export const DRAG_SLOP = 6;
/** How far a finger may wander while it is held before that is a scroll, not a hold. */
export const TOUCH_SLOP = 10;
/** How near the top or bottom of the screen a dragged item starts the page scrolling. */
export const EDGE = 90;

/**
 * How far the page scrolls this frame while an item is held at `y`: nothing
 * away from the edges, and near one, faster the nearer, up to about a screen
 * a second, whatever the frame rate. Negative scrolls up.
 */
export function edgeScroll(y: number, viewHeight: number, dt: number): number {
  const top = EDGE - y;
  const bottom = y - (viewHeight - EDGE);
  const closeness = Math.min(1, Math.max(top, bottom, 0) / EDGE);
  if (closeness <= 0) return 0;
  const perSecond = 250 + closeness * Math.max(900, viewHeight * 1.5);
  return (top > 0 ? -1 : 1) * Math.ceil((perSecond * Math.min(64, Math.max(0, dt))) / 1000);
}

/**
 * Where an item dragged in a one-column list lands: the number of the OTHER
 * rows whose middle is above the pointer. Stable as rows shift, because moving
 * the dragged row past one moves that one's middle away from the pointer.
 */
export function dropIndex(middles: readonly number[], dragged: number, y: number): number {
  let to = 0;
  middles.forEach((middle, i) => {
    if (i !== dragged && y > middle) to += 1;
  });
  return to;
}

/** A copy of `items` with the one at `from` moved to `to`. */
export function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, item as T);
  return out;
}
