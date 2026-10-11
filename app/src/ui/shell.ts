/**
 * What every page does after it loads: the stylesheets, and the one footer
 * link that depends on config. The header, nav and footer are static HTML so
 * the page reads right before any script runs.
 */
import './tokens.css';
import './components.css';
import { FEEDBACK_EMAIL, SITE_NAME } from '../site/config';

export function mountShell(): void {
  const slot = document.querySelector('[data-feedback]');
  if (slot && FEEDBACK_EMAIL) {
    const a = document.createElement('a');
    // The mail carries nothing but a subject: no file name, no page count, nothing typed.
    a.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`${SITE_NAME} feedback`)}`;
    a.textContent = 'Something’s wrong?';
    slot.append(' · ', a);
  }
}
