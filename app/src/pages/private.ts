import { mountShell } from '../ui/shell';
import { TOOL_PAGE_CSP } from '../site/config';

mountShell();

// The HTML carries the policy too, for readers without scripts; the config
// constant is the one the README and the header are checked against.
const csp = document.querySelector('[data-testid="privacy-csp"]');
if (csp) csp.textContent = TOOL_PAGE_CSP;
