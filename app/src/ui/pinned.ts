/**
 * Buy me a coffee steps out of the way while the page is read.
 *
 * It is pinned top-right, so as a page scrolls under it, it can sit on top of
 * a file's × or a result's Save. It steps aside while the page is scrolled
 * down, and comes back the moment it is scrolled up, near the top, or reached
 * with the keyboard: the same way a phone's browser bar behaves.
 *
 * The way home and Get help never do. They are how you leave a page, so they
 * stay in their bottom corners however the page is scrolled; at the very end
 * the footer leaves them room.
 */
export function tuckWhileScrolling(): void {
  const pill = document.querySelector<HTMLElement>('[data-testid="support"]');
  if (pill === null) return;
  let last = window.scrollY;
  let queued = false;
  const set = (tucked: boolean) => pill.classList.toggle('is-tucked', tucked);
  const update = () => {
    queued = false;
    const y = window.scrollY;
    // At the very top the header has room for it. A little below it the coffee
    // would sit on the page's first lines, so it steps aside from the first few
    // pixels down. Small jitters change nothing.
    if (y < 8) set(false);
    else if (y > last + 6) set(true);
    else if (y < last - 6) set(false);
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
  pill.addEventListener('focus', () => set(false));
}
