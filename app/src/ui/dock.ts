/**
 * On a phone, a tool page's three bottom controls are one row under the
 * thumb: the way home, the main button, Get help. Floating circles cover
 * whatever happens to be under them (a signature pad, an option, the button
 * itself), so they join the button instead, at its height and on its centre
 * line. The row is pinned to the bottom of the screen however far the page is
 * scrolled, and the page keeps its height free at the end (`--dock-h`), so
 * the footer is never under it.
 *
 * Where a tool has no main button (Read, Summarise) and on a laptop, the two
 * circles stay where they are, in the bottom corners.
 */
export function dockWithRun(runArea: HTMLElement, button: HTMLElement): void {
  const home = document.querySelector<HTMLElement>('.home-fab__nav');
  const help = document.querySelector<HTMLElement>('[data-testid="help-orb"]');
  if (!home || !help) return;
  const homeHome = { parent: home.parentElement, next: home.nextSibling };
  const helpHome = { parent: help.parentElement, next: help.nextSibling };
  const narrow = window.matchMedia('(max-width: 819px)');

  // The room the page keeps for the row: its own height, which changes when its note does.
  const room = new ResizeObserver(() => {
    if (runArea.classList.contains('run--dock')) document.body.style.setProperty('--dock-h', `${Math.ceil(runArea.getBoundingClientRect().height)}px`);
  });
  room.observe(runArea);

  const apply = () => {
    const dock = narrow.matches && !runArea.hidden;
    if (dock === runArea.classList.contains('run--dock')) return;
    runArea.classList.toggle('run--dock', dock);
    document.body.classList.toggle('has-dock', dock);
    if (!dock) document.body.style.removeProperty('--dock-h');
    if (dock) {
      runArea.insertBefore(home, button);
      button.after(help);
    } else {
      homeHome.parent?.insertBefore(home, homeHome.next);
      helpHome.parent?.insertBefore(help, helpHome.next);
    }
  };
  narrow.addEventListener('change', apply);
  new MutationObserver(apply).observe(runArea, { attributes: true, attributeFilter: ['hidden'] });
  apply();
}
