/**
 * What every page loads: the stylesheets. The header, nav, footer and the Get
 * help panel are static HTML (the panel opens with the popover attribute), so
 * every page reads and works before any script runs.
 */
import './tokens.css';
import './components.css';

export function mountShell(): void {
  // Nothing to mount yet; kept as the one place page-wide behaviour will go.
}
