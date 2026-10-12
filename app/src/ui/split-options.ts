import type { SplitParams } from '../ops/op';
import { el } from './dom';

export interface SplitOptions {
  readonly root: HTMLElement;
  params(): SplitParams;
}

/** The three ways to split, as radio choices with their input beside them. */
export function createSplitOptions(onChange: () => void): SplitOptions {
  const radio = (value: SplitParams['mode'], checked: boolean) =>
    el('input', {
      testid: `split-mode-${value}`,
      attrs: { type: 'radio', name: 'split-mode', value, ...(checked ? { checked: '' } : {}) },
      on: { change: onChange },
    });

  const every = radio('every', true);
  const single = radio('single', false);
  const ranges = radio('ranges', false);
  const bookmarks = radio('bookmarks', false);

  const everyInput = el('input', {
    class: 'input',
    testid: 'split-every',
    attrs: { type: 'number', min: '1', step: '1', value: '1', inputmode: 'numeric', 'aria-label': 'Pages per file' },
    on: {
      input: () => {
        every.checked = true;
        onChange();
      },
    },
  });
  const rangesInput = el('input', {
    class: 'input',
    testid: 'split-ranges',
    attrs: { type: 'text', placeholder: '1-3, 7, 12-', autocomplete: 'off', 'aria-label': 'Page ranges' },
    on: {
      input: () => {
        ranges.checked = true;
        onChange();
      },
    },
  });

  const choice = (input: HTMLInputElement, title: string, hint: string, field?: HTMLElement) =>
    el('label', { class: 'choice' }, [
      input,
      el('span', {}, [el('span', { class: 'choice__title', text: title }), el('br'), el('span', { class: 'choice__hint', text: hint })]),
      field ? el('span', { class: 'choice__field' }, [field]) : null,
    ]);

  const root = el('fieldset', { class: 'options' }, [
    el('legend', { class: 'options__title', text: 'How to split' }),
    choice(every, 'Every few pages', 'A 10-page file split every 3 gives files of 3, 3, 3 and 1 pages.', everyInput),
    choice(single, 'One page per file', 'Every page becomes its own PDF.'),
    choice(ranges, 'By page ranges', 'One file per range, in the order you type them.', rangesInput),
    choice(bookmarks, 'At each chapter', 'One file per top-level bookmark, named after it.'),
  ]);

  return {
    root,
    params() {
      if (single.checked) return { mode: 'single' };
      if (ranges.checked) return { mode: 'ranges', ranges: rangesInput.value };
      if (bookmarks.checked) return { mode: 'bookmarks' };
      return { mode: 'every', every: Number(everyInput.value) };
    },
  };
}
