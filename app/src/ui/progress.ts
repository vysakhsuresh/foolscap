import type { Progress } from '../ops/op';
import { el } from './dom';

export interface ProgressView {
  readonly root: HTMLElement;
  update(p: Progress): void;
}

/**
 * An honest bar: a label and a count while the op reports pages, an
 * indeterminate sweep while it cannot (total 0, during a save).
 */
export function createProgress(onCancel: () => void): ProgressView {
  const label = el('span', { text: 'Starting…' });
  const count = el('span', { class: 'progress__count' });
  const fill = el('div', { class: 'progress__fill' });
  const cancel = el('button', {
    class: 'button button--ghost button--small',
    testid: 'cancel-button',
    text: 'Stop',
    attrs: { type: 'button' },
    on: { click: onCancel },
  });
  const root = el(
    'section',
    {
      class: 'progress',
      testid: 'progress',
      attrs: { 'data-done': '0', 'data-total': '0', role: 'status', 'aria-live': 'polite', 'aria-label': 'Progress' },
    },
    [
      el('div', { class: 'progress__label' }, [label, count]),
      el('div', { class: 'progress__track' }, [fill]),
      el('div', { class: 'progress__footer' }, [el('p', { class: 'progress__keep', text: 'Keep this tab open until it’s done.' }), cancel]),
    ],
  );

  return {
    root,
    update(p) {
      root.dataset['done'] = String(p.done);
      root.dataset['total'] = String(p.total);
      label.textContent = p.label;
      if (p.total > 0) {
        count.textContent = `${p.done} of ${p.total}`;
        fill.style.setProperty('width', `${Math.min(100, Math.round((p.done / p.total) * 100))}%`);
      } else {
        count.textContent = '';
        fill.style.removeProperty('width');
      }
    },
  };
}
