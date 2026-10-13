/**
 * A row of family chips (home page, guides) that scrolls sideways when the
 * screen is too narrow for all of them. A fade and an arrow on the side that
 * has more say so, and the arrow moves the row along.
 */
export function mountJumps(): void {
  for (const wrap of document.querySelectorAll<HTMLElement>('[data-jumps]')) {
    const row = wrap.querySelector<HTMLElement>('.family-jumps');
    const more = wrap.querySelector<HTMLButtonElement>('[data-jumps-more]');
    if (!row || !more) continue;
    const update = () => {
      const left = row.scrollLeft > 4;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 4;
      wrap.classList.toggle('has-left', left);
      wrap.classList.toggle('has-right', right);
      more.hidden = !right;
    };
    row.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(row);
    more.addEventListener('click', () => {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollBy({ left: row.clientWidth * 0.7, behavior: smooth ? 'smooth' : 'instant' });
    });
    update();
  }
}
