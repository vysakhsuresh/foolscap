/**
 * The home page's one piece of behaviour: the finder. The tool list itself is
 * static HTML (scripts/gen-pages.ts), so the page works and reads with no
 * script; this only filters it as you type.
 */
import { mountShell } from '../ui/shell';

mountShell();

const finder = document.querySelector<HTMLElement>('[data-finder]');
const input = document.querySelector<HTMLInputElement>('[data-testid="tool-search"]');
const empty = document.querySelector<HTMLElement>('[data-finder-empty]');
const families = [...document.querySelectorAll<HTMLElement>('.family')];
const jumps = document.querySelector<HTMLElement>('.family-jumps');

function filter(): void {
  const words = (input?.value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const family of families) {
    let inFamily = 0;
    for (const card of family.querySelectorAll<HTMLElement>('.tool-card')) {
      const haystack = card.dataset['keywords'] ?? '';
      // Every word typed must match the start of some word in the card, so
      // "lock" finds Add a password and "pass" finds both password tools.
      const match = words.every((w) => haystack.includes(w));
      card.hidden = !match;
      if (match) inFamily++;
    }
    family.hidden = inFamily === 0;
    shown += inFamily;
  }
  if (empty) empty.hidden = shown > 0;
  if (jumps) jumps.hidden = words.length > 0;
}

if (finder && input) {
  finder.hidden = false;
  input.addEventListener('input', filter);
  // "/" jumps to the search box, as on most tool sites; Escape clears it.
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    } else if (event.key === 'Escape' && document.activeElement === input) {
      input.value = '';
      filter();
    }
  });
}
