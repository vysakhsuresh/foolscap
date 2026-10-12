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
  const keep = check('save-answers', 'Also save my answers as a file', false, onChange, 'Next time, choose that file below and the same form fills itself in.');
  // Answers saved earlier, from this site (.json) or from Acrobat (.xfdf): read here, never kept.
  const loader = el('input', { class: 'visually-hidden', testid: 'form-load', attrs: { id: 'form-load', type: 'file', accept: '.json,.xfdf,application/json,application/vnd.adobe.xfdf' } });
  const loadWords = el('span', { class: 'picture-pick__words', text: 'Fill it from saved answers (.json or .xfdf)' });
  const loadSaid = el('span', { class: 'field__hint', testid: 'form-load-said' });
  const loadBox = el('label', { class: 'picture-pick', attrs: { for: 'form-load' } }, [el('span', { class: 'picture-pick__stack' }, [loadWords, loadSaid]), loader]);
  const root = el('section', { class: 'form-panel', attrs: { 'aria-label': 'The form' } }, [loadBox, list, seal.root, keep.root]);
  root.hidden = true;
  let state: 'empty' | 'loading' | 'none' | 'ready' = 'empty';
  /** Each field's name, what it held when the file was opened, and what it holds now. */
  let read: Array<{ readonly name: string; readonly was: string | boolean; now(): string | boolean; set(value: string | boolean): boolean }> = [];

  loader.addEventListener('change', () => {
    const file = loader.files?.[0];
    loader.value = '';
    if (!file) return;
    void file.text().then(
      (text) => {
        const answers = parseAnswers(text);
        if (answers === null) {
          loadSaid.textContent = "That file isn't a set of saved answers.";
          return;
        }
        let filled = 0;
        for (const entry of read) if (entry.name in answers && entry.set(answers[entry.name]!)) filled++;
        loadSaid.textContent = filled === 0 ? 'None of those answers belong to this form.' : `Filled ${filled} ${filled === 1 ? 'answer' : 'answers'} from the file. Check them, then tap Fill it in.`;
        onChange();
      },
      () => {
        loadSaid.textContent = "That file couldn't be read.";
      },
    );
  });

  return {
    root,
    async load(view) {
      state = 'loading';
      root.hidden = false;
      list.replaceChildren(note('Reading the form…'));
      seal.root.hidden = true;
      keep.root.hidden = true;
      loadBox.hidden = true;
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
              ? el('textarea', { class: 'input', testid, attrs: { id, rows: '3', spellcheck: 'true', ...max }, on: { input: onChange } })
              : el('input', { class: 'input', testid, attrs: { id, type: 'text', autocomplete: 'off', spellcheck: 'true', ...max }, on: { input: onChange } });
            input.value = f.value;
            list.append(
              el('label', { class: 'field' }, [
                el('span', { class: 'field__label', text: label }),
                input,
                f.maxLength === undefined ? null : el('span', { class: 'field__hint', text: `Up to ${f.maxLength} characters.` }),
              ]),
            );
            read.push({
              name: f.name,
              was: f.value,
              now: () => input.value,
              set: (v) => {
                if (typeof v !== 'string') return false;
                input.value = f.maxLength === undefined ? v : v.slice(0, f.maxLength);
                return true;
              },
            });
            break;
          }
          case 'check': {
            const input = el('input', { testid, attrs: { type: 'checkbox', ...(f.checked ? { checked: '' } : {}) }, on: { change: onChange } });
            list.append(el('label', { class: 'check' }, [input, el('span', { class: 'check__label', text: label })]));
            read.push({
              name: f.name,
              was: f.checked,
              now: () => input.checked,
              set: (v) => {
                input.checked = v === true || v === 'Yes' || v === 'On' || v === 'true';
                return true;
              },
            });
            break;
          }
          case 'choice': {
            const input = el(
              'select',
              { class: 'input', testid, attrs: { id }, on: { change: onChange } },
              [el('option', { text: '—', attrs: { value: '' } }), ...f.options.map((o) => el('option', { text: o, attrs: { value: o, ...(o === f.value ? { selected: '' } : {}) } }))],
            );
            list.append(el('label', { class: 'field' }, [el('span', { class: 'field__label', text: label }), input]));
            read.push({
              name: f.name,
              was: f.value,
              now: () => input.value,
              set: (v) => {
                if (typeof v !== 'string' || (v !== '' && !f.options.includes(v))) return false;
                input.value = v;
                return true;
              },
            });
            break;
          }
        }
      });
      seal.root.hidden = false;
      keep.root.hidden = false;
      loadBox.hidden = false;
      state = 'ready';
      onChange();
    },
    // Only the answers that changed travel: a field left alone is left exactly as it was.
    params: () => ({
      values: Object.fromEntries(read.flatMap((r) => (r.now() === r.was ? [] : [[r.name, r.now()]]))),
      seal: seal.checked(),
      ...(keep.checked() ? { answers: Object.fromEntries(read.map((r) => [r.name, r.now()])) } : {}),
    }),
    problem() {
      switch (state) {
        case 'empty':
        case 'loading':
          return 'Reading the form…';
        case 'none':
          return 'This PDF has no fields to fill in.';
        case 'ready':
          return read.some((r) => r.now() !== r.was) || seal.checked() || keep.checked() ? null : 'Type your answers first.';
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

/**
 * Saved answers, by field name: this site's own .json ({ fields: {...} }, or
 * a plain object), or an XFDF file as Acrobat exports it. Null for anything else.
 */
export function parseAnswers(text: string): Record<string, string | boolean> | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const source = parsed !== null && typeof parsed === 'object' && 'fields' in parsed ? (parsed as { fields: unknown }).fields : parsed;
      if (source === null || typeof source !== 'object' || Array.isArray(source)) return null;
      const out: Record<string, string | boolean> = {};
      for (const [name, value] of Object.entries(source)) if (typeof value === 'string' || typeof value === 'boolean') out[name] = value;
      return out;
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith('<')) {
    const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
    if (doc.querySelector('parsererror')) return null;
    const out: Record<string, string | boolean> = {};
    // XFDF nests fields by name segments: <field name="a"><field name="b"> is "a.b".
    const visit = (node: Element, prefix: string) => {
      for (const child of Array.from(node.children)) {
        if (child.localName !== 'field') continue;
        const name = prefix + (child.getAttribute('name') ?? '');
        const value = Array.from(child.children).find((c) => c.localName === 'value');
        if (value) out[name] = value.textContent ?? '';
        visit(child, `${name}.`);
      }
    };
    const fields = Array.from(doc.getElementsByTagName('*')).find((e) => e.localName === 'fields');
    if (!fields) return null;
    visit(fields, '');
    return out;
  }
  return null;
}

