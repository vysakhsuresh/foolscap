/**
 * Fill in a form: the document's own fields, read with pdf.js on the page and
 * shown as a plain form here, in page order. Typing here never touches the
 * file; the answers go to the worker when the button is pressed.
 */
import type { FillFormParams } from '../ops/op';
import { toolPath } from '../ops/tools';
import type { FormField, PdfView } from '../pdf/types';
import { el } from './dom';
import { check, note } from './fields';

export interface FormPanel {
  readonly root: HTMLElement;
  /** Reads the fields and closes `view`. */
  load(view: PdfView): Promise<void>;
  params(): FillFormParams;
  problem(): string | null;
  destroy(): Promise<void>;
}

/** "applicant.full_name" → "Applicant full name": a field's name is often all the label there is. */
export function labelFor(name: string): string {
  const words = name.replace(/[._\-[\]]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : 'Field';
}

export function createFormPanel(onChange: () => void): FormPanel {
  const list = el('div', { class: 'options-stack form-fields', testid: 'form-fields' });
  const seal = check('seal', 'Seal the answers', false, onChange, 'Flattens them into the page so they can no longer be changed. Leave it off to keep the form fillable.');
  const root = el('section', { class: 'form-panel', attrs: { 'aria-label': 'The form' } }, [list, seal.root]);
  root.hidden = true;
  let state: 'empty' | 'loading' | 'none' | 'ready' = 'empty';
  /** Each field's name, what it held when the file was opened, and what it holds now. */
  let read: Array<{ readonly name: string; readonly was: string | boolean; now(): string | boolean }> = [];

  return {
    root,
    async load(view) {
      state = 'loading';
      root.hidden = false;
      list.replaceChildren(note('Reading the form…'));
      seal.root.hidden = true;
      let fields: readonly FormField[] = [];
      try {
        fields = await view.fields();
      } finally {
        await view.close();
      }
      read = [];
      list.replaceChildren();
      if (fields.length === 0) {
        state = 'none';
        list.append(
          el('p', { class: 'options__note', testid: 'form-none' }, [
            'This PDF has no fields to fill in. To write on it anyway, use ',
            el('a', { text: 'Add text', attrs: { href: toolPath('add-text') } }),
            '.',
          ]),
        );
        onChange();
        return;
      }
      fields.forEach((f, i) => {
        const id = `form-${i}`;
        const label = labelFor(f.name);
        const testid = `form-field-${f.name}`;
        switch (f.kind) {
          case 'text': {
            const max = f.maxLength === undefined ? {} : { maxlength: String(f.maxLength) };
            const input = f.multiline
              ? el('textarea', { class: 'input', testid, attrs: { id, rows: '3', ...max }, on: { input: onChange } })
              : el('input', { class: 'input', testid, attrs: { id, type: 'text', autocomplete: 'off', ...max }, on: { input: onChange } });
            input.value = f.value;
            list.append(
              el('label', { class: 'field' }, [
                el('span', { class: 'field__label', text: label }),
                input,
                f.maxLength === undefined ? null : el('span', { class: 'field__hint', text: `Up to ${f.maxLength} characters.` }),
              ]),
            );
            read.push({ name: f.name, was: f.value, now: () => input.value });
            break;
          }
          case 'check': {
            const input = el('input', { testid, attrs: { type: 'checkbox', ...(f.checked ? { checked: '' } : {}) }, on: { change: onChange } });
            list.append(el('label', { class: 'check' }, [input, el('span', { class: 'check__label', text: label })]));
            read.push({ name: f.name, was: f.checked, now: () => input.checked });
            break;
          }
          case 'choice': {
            const input = el(
              'select',
              { class: 'input', testid, attrs: { id }, on: { change: onChange } },
              [el('option', { text: '—', attrs: { value: '' } }), ...f.options.map((o) => el('option', { text: o, attrs: { value: o, ...(o === f.value ? { selected: '' } : {}) } }))],
            );
            list.append(el('label', { class: 'field' }, [el('span', { class: 'field__label', text: label }), input]));
            read.push({ name: f.name, was: f.value, now: () => input.value });
            break;
          }
        }
      });
      seal.root.hidden = false;
      state = 'ready';
      onChange();
    },
    // Only the answers that changed travel: a field left alone is left exactly as it was.
    params: () => ({
      values: Object.fromEntries(read.flatMap((r) => (r.now() === r.was ? [] : [[r.name, r.now()]]))),
      seal: seal.checked(),
    }),
    problem() {
      switch (state) {
        case 'empty':
        case 'loading':
          return 'Reading the form…';
        case 'none':
          return 'This PDF has no fields to fill in.';
        case 'ready':
          return read.some((r) => r.now() !== r.was) || seal.checked() ? null : 'Type your answers first.';
      }
    },
    async destroy() {
      state = 'empty';
      read = [];
      list.replaceChildren();
      root.hidden = true;
    },
  };
}
