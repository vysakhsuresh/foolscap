/**
 * On a phone, a tool page's three bottom controls are one row under the
 * thumb: the way home, the main button, Get help. Floating circles cover
 * whatever happens to be under them (a signature pad, an option, the button
 * itself), so they join the button instead, at its height and on its centre
 * line. The row is the pinned run area, so it is never over the page.
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

  const apply = () => {
    const dock = narrow.matches && !runArea.hidden;
    if (dock === runArea.classList.contains('run--dock')) return;
    runArea.classList.toggle('run--dock', dock);
    document.body.classList.toggle('has-dock', dock);
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
