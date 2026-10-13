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

/** The words typed, lower-cased. */
function wordsOf(typed: string): string[] {
  return typed.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Every word typed must appear in the card's words, so "lock" finds Add a
 * password and "pass" finds both password tools.
 */
function matches(card: HTMLElement, words: readonly string[]): boolean {
  const haystack = card.dataset['keywords'] ?? '';
  return words.every((w) => haystack.includes(w));
}

function filter(): void {
  const words = wordsOf(input?.value ?? '');
  let shown = 0;
  for (const family of families) {
    let inFamily = 0;
    for (const card of family.querySelectorAll<HTMLElement>('.tool-card')) {
      const match = matches(card, words);
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
// A round search button takes its place at the bottom-left, as on
// layerbit.co.in. Tapped, it opens into a search box right there — the page
// does not move — and the tools that match appear just above it: tap one, or
// press Enter for the first. It goes again once the box at the top is back.
const pill = document.querySelector<HTMLElement>('[data-search-pill]');
const pillOpen = pill?.querySelector<HTMLButtonElement>('.search-pill__open');
const pillInput = pill?.querySelector<HTMLInputElement>('.search-pill__input');
const pillClose = pill?.querySelector<HTMLButtonElement>('.search-pill__close');
const pillResults = pill?.querySelector<HTMLUListElement>('[data-pill-results]');
if (finder && pill && pillOpen && pillInput && pillClose && pillResults && 'IntersectionObserver' in window) {
  pill.hidden = false;
  const cards = [...document.querySelectorAll<HTMLAnchorElement>('a.tool-card')];
  const isOpen = () => pill.classList.contains('is-open');

  const render = () => {
    const words = wordsOf(pillInput.value);
    pillResults.replaceChildren();
    if (words.length === 0) {
      pillResults.hidden = true;
      return;
    }
    // Tools whose own name holds what was typed come first: "pdf to" puts
    // PDF to Word ahead of Merge, which only matches through its keywords.
    const typed = words.join(' ');
    const rank = (card: HTMLElement) => {
      const title = (card.querySelector('.tool-card__title')?.textContent ?? '').toLowerCase();
      if (title.startsWith(typed)) return 0;
      if (title.includes(typed)) return 1;
      if (words.every((w) => title.split(/\W+/).some((t) => t.startsWith(w)))) return 2;
      return 3;
    };
    const found = cards
      .filter((card) => matches(card, words))
      .map((card, i) => ({ card, i, r: rank(card) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map(({ card }) => card)
      .slice(0, 6);
    if (found.length === 0) {
      const none = document.createElement('li');
      none.className = 'search-pill__none';
      none.textContent = 'No tool matches that yet.';
      pillResults.append(none);
    }
    for (const card of found) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'search-pill__result';
      link.href = card.href;
      const icon = card.querySelector('.tool-card__icon svg')?.cloneNode(true);
      if (icon) link.append(icon);
      const name = document.createElement('span');
      name.textContent = card.querySelector('.tool-card__title')?.textContent ?? '';
      link.append(name);
      link.dataset['group'] = card.closest<HTMLElement>('.family')?.dataset['group'] ?? '';
      item.append(link);
      pillResults.append(item);
    }
    pillResults.hidden = false;
  };

  const open = () => {
    pill.classList.add('is-open');
    pillOpen.setAttribute('aria-expanded', 'true');
    pillInput.tabIndex = 0;
    pillClose.tabIndex = 0;
    // Focused straight away, inside the tap, so a phone opens its keyboard.
    pillInput.focus({ preventScroll: true });
  };
  const close = () => {
    pill.classList.remove('is-open');
    pillOpen.setAttribute('aria-expanded', 'false');
    pillInput.value = '';
    pillInput.tabIndex = -1;
    pillClose.tabIndex = -1;
    render();
  };

  pillOpen.addEventListener('click', () => (isOpen() ? pillInput.focus({ preventScroll: true }) : open()));
  pillClose.addEventListener('click', () => {
    close();
    pillOpen.focus({ preventScroll: true });
  });
  pillInput.addEventListener('input', render);
  pillInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
      pillOpen.focus({ preventScroll: true });
    } else if (event.key === 'Enter') {
      const first = pillResults.querySelector<HTMLAnchorElement>('a');
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
  // A tap anywhere else closes it when nothing has been typed.
  document.addEventListener('pointerdown', (event) => {
    if (isOpen() && !pill.contains(event.target as Node) && pillInput.value.trim() === '') close();
  });

  // A phone's keyboard covers the bottom of the screen without moving what
  // is pinned there, so the box would open behind it. The visual viewport
  // says how much is covered: the pill rides up by that much, and its list
  // keeps to the room that is left.
  const vv = window.visualViewport;
  const fitAboveKeyboard = () => {
    if (!vv) return;
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    pill.style.setProperty('--keyboard', `${Math.round(covered)}px`);
    pill.style.setProperty('--room', `${Math.round(vv.height)}px`);
  };
  // (Chrome on Android also shrinks this page with its keyboard — the
  // viewport tag asks it to, interactive-widget=resizes-content — so there
  // nothing is covered and the pill simply sits above the keys.)
  vv?.addEventListener('resize', fitAboveKeyboard);
  vv?.addEventListener('scroll', fitAboveKeyboard);
  window.addEventListener('resize', fitAboveKeyboard);
  // A keyboard slides up over a few hundred milliseconds, and not every
  // browser reports where it stopped: look again once it has.
  pillInput.addEventListener('focus', () => {
    for (const wait of [100, 300, 600, 1000]) window.setTimeout(fitAboveKeyboard, wait);
  });
  fitAboveKeyboard();

  new IntersectionObserver(([entry]) => {
    if (!entry) return;
    // Only once the box has gone off the top: above it, there is nothing to replace.
    const away = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    pill.classList.toggle('is-shown', away);
    if (!away && isOpen()) close();
  }).observe(finder);
}

mountJumps();
