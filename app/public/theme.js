/*
 * The theme, set before the page paints.
 *
 * A plain script, not a module, so it runs while the <head> is being read: a
 * module runs after the first paint, and a light page would flash dark first.
 * It is a file of this site, not inline, because the pages' policy forbids
 * inline scripts.
 *
 * Dark is the brand and the default. A visitor who picks light keeps it under
 * 'foolscap.theme' ('light' or 'dark'): the one setting this site remembers,
 * and nothing anybody typed. app/src/ui/theme.ts is the switch in the header.
 */
(function () {
  var theme = 'dark';
  try {
    if (window.localStorage.getItem('foolscap.theme') === 'light') theme = 'light';
  } catch (e) {
    // Storage refused (a private window, a blocked site): dark, as ever.
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (theme !== 'light') return;
  var scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', 'light');
  var colour = document.querySelector('meta[name="theme-color"]');
  if (colour) colour.setAttribute('content', '#f6f7fb');
})();
