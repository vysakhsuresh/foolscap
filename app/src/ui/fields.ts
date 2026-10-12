/**
 * The building blocks every tool's settings are made of, so sixteen tools look
 * and behave like one product. Each input carries `data-testid="opt-<name>"`
 * (a radio: `opt-<name>-<value>`), which is what the e2e tests select by.
 */
import { el } from './dom';

export interface Choice<V extends string> {
  readonly value: V;
  readonly title: string;
  readonly hint?: string;
  /** An input that belongs to this choice; typing in it selects the choice. */
  readonly field?: HTMLElement;
}

export interface ChoiceGroup<V extends string> {
  readonly root: HTMLElement;
  value(): V;
}

/**
 * Radio choices. `cards` for choices that need a sentence of explanation,
 * `pills` for short ones that sit in a row.
 */
export function choices<V extends string>(
  name: string,
  legend: string,
  options: ReadonlyArray<Choice<V>>,
  initial: V,
  onChange: () => void,
  style: 'cards' | 'pills' = 'cards',
): ChoiceGroup<V> {
  const radios = options.map((option) =>
    el('input', {
      testid: `opt-${name}-${option.value}`,
      attrs: { type: 'radio', name: `opt-${name}`, value: option.value, ...(option.value === initial ? { checked: '' } : {}) },
      on: { change: onChange },
    }),
  );
  options.forEach((option, i) => {
    option.field?.addEventListener('input', () => {
      const radio = radios[i];
      if (radio) radio.checked = true;
      onChange();
    });
  });
  const items = options.map((option, i) =>
    style === 'pills'
      ? el('label', { class: 'pill-choice' }, [radios[i] ?? null, el('span', { text: option.title })])
      : el('label', { class: 'choice' }, [
          radios[i] ?? null,
          el('span', {}, [
            el('span', { class: 'choice__title', text: option.title }),
            option.hint ? el('br') : null,
            option.hint ? el('span', { class: 'choice__hint', text: option.hint }) : null,
          ]),
          option.field ? el('span', { class: 'choice__field' }, [option.field]) : null,
        ]),
  );
  const root = el('fieldset', { class: style === 'pills' ? 'options options--pills' : 'options' }, [
    el('legend', { class: 'options__title', text: legend }),
    style === 'pills' ? el('div', { class: 'pill-row' }, items) : null,
    ...(style === 'pills' ? [] : items),
  ]);
  return {
    root,
    value: () => (radios.find((r) => r.checked)?.value ?? initial) as V,
  };
}

export interface FieldOptions {
  readonly label: string;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly type?: 'text' | 'number' | 'password' | 'color';
  readonly min?: number;
  readonly max?: number;
  readonly autocomplete?: string;
  /** A bare input with an aria-label, to sit inside a choice card. */
  readonly bare?: boolean;
  /** Words that end up on the page: underline misspellings as you type. */
  readonly spellcheck?: boolean;
}

export interface Field {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  value(): string;
  number(): number;
}

export function field(name: string, opts: FieldOptions, onChange: () => void): Field {
  const id = `opt-${name}`;
  const type = opts.type ?? 'text';
  const input = el('input', {
    class: type === 'color' ? 'input input--color' : 'input',
    testid: id,
    attrs: {
      id,
      type,
      autocomplete: opts.autocomplete ?? 'off',
      ...(opts.value !== undefined ? { value: opts.value } : {}),
      ...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
      ...(type === 'number' ? { inputmode: 'numeric', step: '1' } : {}),
      ...(opts.min !== undefined ? { min: String(opts.min) } : {}),
      ...(opts.max !== undefined ? { max: String(opts.max) } : {}),
      ...(opts.bare ? { 'aria-label': opts.label } : {}),
      // Words people write onto a page are checked by the browser's own spell checker.
      ...(opts.spellcheck ? { spellcheck: 'true' } : {}),
    },
    on: { input: onChange },
  });
  // The label wraps its input: tapping the word focuses the box, and the
  // whole block is one target rather than a small label and a box.
  const root = opts.bare
    ? input
    : el('label', { class: 'field' }, [
        el('span', { class: 'field__label', text: opts.label }),
        input,
        opts.hint ? el('span', { class: 'field__hint', text: opts.hint }) : null,
      ]);
  return { root, input, value: () => input.value, number: () => Number(input.value) };
}

export interface Check {
  readonly root: HTMLElement;
  checked(): boolean;
}

export function check(name: string, label: string, checked: boolean, onChange: () => void, hint?: string): Check {
  const input = el('input', {
    testid: `opt-${name}`,
    attrs: { type: 'checkbox', ...(checked ? { checked: '' } : {}) },
    on: { change: onChange },
  });
  const root = el('label', { class: 'check' }, [
    input,
    el('span', {}, [el('span', { class: 'check__label', text: label }), hint ? el('span', { class: 'choice__hint', text: ` ${hint}` }) : null]),
  ]);
  return { root, checked: () => input.checked };
}

export interface Select<V extends string> {
  readonly root: HTMLElement;
  value(): V;
}

export function select<V extends string>(
  name: string,
  label: string,
  options: ReadonlyArray<{ readonly value: V; readonly title: string }>,
  initial: V,
  onChange: () => void,
): Select<V> {
  const id = `opt-${name}`;
  const input = el(
    'select',
    { class: 'input', testid: id, attrs: { id }, on: { change: onChange } },
    options.map((o) => el('option', { text: o.title, attrs: { value: o.value, ...(o.value === initial ? { selected: '' } : {}) } })),
  );
  const root = el('label', { class: 'field' }, [el('span', { class: 'field__label', text: label }), input]);
  return { root, value: () => input.value as V };
}

/** A plain-English note under the settings: what this tool will and will not do. */
export function note(text: string): HTMLElement {
  return el('p', { class: 'options__note', text });
}

export function group(children: ReadonlyArray<HTMLElement | null>): HTMLElement {
  return el('div', { class: 'options-stack' }, children);
}
