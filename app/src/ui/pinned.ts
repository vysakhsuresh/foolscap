/**
 * The things pinned over the page step out of the way while it is read.
 *
 * Buy me a coffee is pinned top-right, so as a page scrolls under it, it can
 * sit on top of a file's × or a result's Save. The way home and Get help,
 * where they float in the bottom corners (a reading page, or a tool with no
 * main button), sit over the words being read. All of them step aside while
 * the page is scrolled down, and come back the moment it is scrolled up, near
 * the top, at the very end (where the footer leaves them room), or reached
 * with the keyboard: the same way a phone's browser bar behaves. The corner
 * circles only do this on a phone or tablet (styles), where the page runs
 * under them; on a laptop they sit in the margin.
 */
export function tuckWhileScrolling(): void {
  const pinned = ['[data-testid="support"]', '[data-testid="home-fab"]', '[data-testid="help-orb"]']
    .map((q) => document.querySelector<HTMLElement>(q))
    .filter((e): e is HTMLElement => e !== null);
  if (pinned.length === 0) return;
  let last = window.scrollY;
  let queued = false;
  // A circle docked beside the main button is part of the page, not over it.
  const loose = (e: HTMLElement) => e.closest('.run--dock') === null;
  const corner = (e: HTMLElement) => e.dataset['testid'] !== 'support';
  const set = (tucked: boolean, atEnd = false) => {
    // At the very end the footer leaves the corner circles room; the coffee stays up out of the way.
    for (const e of pinned) e.classList.toggle('is-tucked', tucked && loose(e) && !(atEnd && corner(e)));
  };
  const update = () => {
    queued = false;
    const y = window.scrollY;
    const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 4;
    // At the very top the header has room for them. A little below it the
    // coffee would sit on the page's first lines, so it steps aside from the
    // first few pixels down. Small jitters change nothing.
    if (y < 8) set(false);
    else if (y > last + 6) set(true, atEnd);
    else if (y < last - 6) set(false);
    else if (atEnd) set(pinned.some((e) => e.classList.contains('is-tucked')), true);
    else return;
    last = y;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  for (const e of pinned) e.addEventListener('focus', () => set(false));
}
