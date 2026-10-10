import '../ui/tokens.css';
import { toolById, type ToolId } from '../ops/tools';

const id = document.body.dataset['tool'] as ToolId | undefined;
if (id) {
  const meta = toolById(id);
  const h = document.querySelector('h1');
  if (h) h.textContent = meta.title;
}
