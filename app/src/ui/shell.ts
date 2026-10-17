/**
 * What every page loads: the stylesheets. The header, nav, footer and the Get
 * help panel are static HTML (the panel opens with the popover attribute), so
 * every page reads and works before any script runs.
 */
import './tokens.css';
import './components.css';
import './content.css';
import { tuckWhileScrolling } from './pinned';

export function mountShell(): void {
  keepForOffline();
  tuckWhileScrolling();
}

/**
 * Registers the service worker (dist/sw.js), which keeps this site's own
 * files so every tool works with no connection and the site can be installed
 * as an app. After the page has loaded, so it never slows the first visit;
 * not at all when the visitor has asked their phone to save data, because
 * keeping the tools is a few megabytes.
 */
function keepForOffline(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData === true) return;
  const register = () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
