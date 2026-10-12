import { el, icon } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { TOOL_ICONS } from '../ui/tool-icons';
import { GROUPS, TOOLS, toolPath, type ToolMeta } from '../ops/tools';

mountShell();

function liveCard(tool: ToolMeta): HTMLElement {
  const glyph = TOOL_ICONS[tool.id];
  return el('a', { class: 'tool-card', testid: `tool-card-${tool.id}`, attrs: { href: toolPath(tool.id), 'data-tone': tool.id } }, [
    el('span', { class: 'tool-card__icon' }, glyph ? [icon(glyph, 28)] : []),
    el('span', { class: 'tool-card__title', text: tool.title }),
    el('span', { class: 'tool-card__summary', text: tool.summary }),
    el('span', { class: 'tool-card__go', text: 'Open →' }),
  ]);
}

// Not a link: a tool that does not work yet should not look like one you can tap.
function soonChip(tool: ToolMeta): HTMLElement {
  return el('li', { class: 'chip', testid: `tool-card-${tool.id}`, text: tool.title, attrs: { 'data-status': 'soon', title: tool.summary } });
}

// The three live cards are already in the HTML so the page works without
// scripts; this replaces that block with the full list rather than adding to it.
const slot = document.querySelector('[data-tools]');
if (slot) {
  const soon = TOOLS.filter((t) => t.status === 'soon');
  const fresh = el('div', { attrs: { 'data-tools': '' } });
  fresh.append(el('div', { class: 'tool-grid' }, TOOLS.filter((t) => t.status === 'live').map(liveCard)));
  const groups = el('div', { class: 'soon__groups' });
  for (const group of GROUPS) {
    const tools = soon.filter((t) => t.group === group.id);
    if (tools.length === 0) continue;
    groups.append(el('div', {}, [el('h3', { class: 'group-title', text: group.title }), el('ul', { class: 'chips' }, tools.map(soonChip))]));
  }
  fresh.append(
    el('section', { class: 'soon glass', attrs: { 'aria-labelledby': 'soon-title' } }, [
      el('div', { class: 'soon__head' }, [
        el('h2', { class: 'soon__title', text: 'Coming next', attrs: { id: 'soon-title' } }),
        el('span', { class: 'badge', text: `${soon.length} more tools · all free` }),
      ]),
      groups,
    ]),
  );
  slot.replaceWith(fresh);
}
