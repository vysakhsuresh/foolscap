import '../ui/tokens.css';
import { LIVE_TOOLS, toolPath } from '../ops/tools';

const list = document.querySelector('[data-tools]');
if (list) {
  for (const tool of LIVE_TOOLS) {
    const a = document.createElement('a');
    a.href = toolPath(tool.id);
    a.textContent = tool.title;
    list.append(a);
  }
}
