/**
 * The light/dark switch in the header of every page.
 *
 * public/theme.js has already put `data-theme` on <html> before the first
 * paint, from what this switch stored; this only flips it. Dark is the brand
 * and the default, whatever the system says: the switch is one tap and is
 * remembered. What is kept is the word 'light' or 'dark' under THEME_KEY —
 * never anything a visitor typed or a file they opened.
 */
export type Theme = 'light' | 'dark';

/** Must match public/theme.js (tests/unit/site.test.ts checks). */
export const THEME_KEY = 'foolscap.theme';

/** The browser's own bar colour for each theme: the ground. */
export const THEME_COLOUR: Readonly<Record<Theme, string>> = { dark: '#0a0c10', light: '#f6f7fb' };

export function currentTheme(): Theme {
  return document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset['theme'] = theme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOUR[theme]);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    button.setAttribute('aria-pressed', String(theme === 'light'));
    button.title = theme === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme';
  }
}

function remember(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage refused: the switch still works for this page.
  }
}

export function mountThemeToggle(): void {
  // Without theme.js (an old cached page), there is nothing to read the choice back: set it here.
  if (!document.documentElement.dataset['theme']) {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      stored = null;
    }
    applyTheme(stored === 'light' ? 'light' : 'dark');
  } else {
    applyTheme(currentTheme());
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    button.addEventListener('click', () => {
      const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
      applyTheme(next);
      remember(next);
    });
  }
  // Another tab switched: follow it, so two open tabs never disagree.
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) applyTheme(event.newValue);
  });
}
