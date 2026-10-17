/**
 * Buy me a coffee is pinned top-right, so as a page scrolls under it, it can
 * sit on top of a file's × or a result's Save. It steps up out of the way
 * while the page is scrolled down, and comes back the moment it is scrolled
 * up, near the top, or reached with the keyboard: the same way a phone's
 * browser bar behaves.
 */
export function tuckWhileScrolling(): void {
  const pill = document.querySelector<HTMLElement>('[data-testid="support"]');
  if (!pill) return;
  let last = window.scrollY;
  let queued = false;
  const update = () => {
    queued = false;
    const y = window.scrollY;
    // Near the top the header has room for it; small jitters change nothing.
    if (y < 96) pill.classList.remove('is-tucked');
    else if (y > last + 6) pill.classList.add('is-tucked');
    else if (y < last - 6) pill.classList.remove('is-tucked');
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
  pill.addEventListener('focus', () => pill.classList.remove('is-tucked'));
}
