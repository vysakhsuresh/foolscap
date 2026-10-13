/**
 * The home page's one piece of behaviour: the finder. The tool list itself is
 * static HTML (scripts/gen-pages.ts), so the page works and reads with no
 * script; this only filters it as you type.
 */
import { loadAds } from '../ui/ads';
import { mountJumps } from '../ui/jumps';
import { mountShell } from '../ui/shell';

mountShell();
loadAds();

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
    } else if (event.key === 'Enter' && document.activeElement === input && input.value.trim()) {
      // Enter opens the first tool that matches: "merge" ⏎ and you are there.
      const first = document.querySelector<HTMLAnchorElement>('.family:not([hidden]) a.tool-card:not([hidden])');
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
}

// ---- Coming back from a tool ----
// Every tool page has a way home at its bottom-left, to "/#from-<tool>". It
// lands where you left the home page, not at its top: the scroll position is
// kept for this tab (a number, nothing else), and if that spot no longer shows
// the tool you came from, its card is brought into view instead. Either way
// the card glows once, so your eye lands on it.
const SCROLL_KEY = 'foolscap:home-y';

window.addEventListener('pagehide', () => {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)));
  } catch {
    // Private mode may refuse; coming back then finds the card instead.
  }
});

function cameBack(): void {
  const match = /^#from-([a-z-]+)$/.exec(location.hash);
  if (!match) return;
  history.replaceState(null, '', location.pathname + location.search);
  const card = document.querySelector<HTMLElement>(`[data-testid="tool-card-${match[1]}"]`);
  let saved: number | null = null;
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    saved = raw === null ? null : Number(raw);
  } catch {
    saved = null;
  }
  if (saved !== null && Number.isFinite(saved)) window.scrollTo({ top: saved, behavior: 'instant' });
  if (!card) return;
  const box = card.getBoundingClientRect();
  if (box.top < 0 || box.bottom > window.innerHeight) card.scrollIntoView({ block: 'center', behavior: 'instant' });
  card.classList.add('is-back');
  card.addEventListener('animationend', () => card.classList.remove('is-back'), { once: true });
}

cameBack();

// ---- The finder, once it has scrolled away ----
// A round search button takes its place at the bottom-left, and goes again
// as soon as the box at the top is back in view. Tapping it brings the box
// back and puts the cursor in it, so the keyboard opens straight away.
const searchFab = document.querySelector<HTMLButtonElement>('[data-search-fab]');
if (finder && input && searchFab && 'IntersectionObserver' in window) {
  searchFab.hidden = false;
  const show = (on: boolean) => searchFab.classList.toggle('is-shown', on);
  new IntersectionObserver(([entry]) => {
    if (!entry) return;
    // Only once it has gone off the top: above the box, there is nothing to replace.
    show(!entry.isIntersecting && entry.boundingClientRect.top < 0);
  }).observe(finder);
  searchFab.addEventListener('click', () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    input.focus({ preventScroll: true });
    finder.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'instant' });
  });
}

mountJumps();
