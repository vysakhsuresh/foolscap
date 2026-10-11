import { el } from '../ui/dom';
import { mountShell } from '../ui/shell';
import { GROUPS, TOOLS, toolPath, type ToolMeta } from '../ops/tools';

mountShell();

function liveCard(tool: ToolMeta): HTMLElement {
  return el('a', { class: 'tool-card', testid: `tool-card-${tool.id}`, attrs: { href: toolPath(tool.id) } }, [
    el('span', { class: 'tool-card__title', text: tool.title }),
    el('span', { class: 'tool-card__summary', text: tool.summary }),
    el('span', { class: 'tool-card__go', text: 'Open →' }),
  ]);
}

function soonCard(tool: ToolMeta): HTMLElement {
  return el('div', { class: 'tool-card tool-card--soon', testid: `tool-card-${tool.id}`, attrs: { 'data-status': 'soon' } }, [
    el('span', { class: 'tool-card__title' }, [tool.title, el('span', { class: 'badge', text: 'Soon' })]),
    el('span', { class: 'tool-card__summary', text: tool.summary }),
  ]);
}

// The three live cards are already in the HTML so the page works without
// scripts; this replaces that block with the full list rather than adding to it.
const slot = document.querySelector('[data-tools]');
if (slot) {
  const fresh = el('div', { attrs: { 'data-tools': '' } });
  fresh.append(el('div', { class: 'tool-grid' }, TOOLS.filter((t) => t.status === 'live').map(liveCard)));
  fresh.append(el('p', { class: 'section__sub', text: 'More tools are on the way. They are listed here so you know what is coming, not to sell you anything.' }));
  for (const group of GROUPS) {
    const soon = TOOLS.filter((t) => t.group === group.id && t.status === 'soon');
    if (soon.length === 0) continue;
    fresh.append(el('h3', { class: 'group-title', text: group.title }));
    fresh.append(el('div', { class: 'tool-grid' }, soon.map(soonCard)));
  }
  slot.replaceWith(fresh);
}
