import type { FoolscapFile } from '../files/types';
import type { PdfErrorCode } from '../pdf/types';
import { ICONS, clear, el, icon } from './dom';
import { formatSize, plural } from './format';

/** One picked file as the page knows it: the FoolscapFile plus what the engine found out. */
export interface Entry {
  readonly file: FoolscapFile;
  pages?: number;
  error?: string;
  errorCode?: PdfErrorCode;
  password?: string;
}

export interface FileListHandlers {
  move(index: number, delta: -1 | 1): void;
  remove(index: number): void;
  password(index: number, password: string): void;
}

const needsPassword = (entry: Entry) => entry.errorCode === 'encrypted' || entry.errorCode === 'wrong-password';

/** Redraws the list. Cheap enough for a list a person can read; no diffing. */
export function renderFileList(list: HTMLElement, entries: readonly Entry[], reorderable: boolean, on: FileListHandlers): void {
  clear(list);
  entries.forEach((entry, index) => {
    const { file } = entry;
    const meta: string[] = [formatSize(file.size)];
    if (entry.pages !== undefined) meta.push(plural(entry.pages, 'page'));
    else if (!entry.error && file.kind === 'pdf') meta.push('Counting pages…');

    const controls = el('div', { class: 'file-item__controls' }, [
      reorderable
        ? el('button', {
            class: 'icon-button',
            testid: 'file-move-up',
            attrs: { type: 'button', 'aria-label': 'Move up', ...(index === 0 ? { disabled: '' } : {}) },
            on: { click: () => on.move(index, -1) },
          }, [icon(ICONS.up)])
        : null,
      reorderable
        ? el('button', {
            class: 'icon-button',
            testid: 'file-move-down',
            attrs: { type: 'button', 'aria-label': 'Move down', ...(index === entries.length - 1 ? { disabled: '' } : {}) },
            on: { click: () => on.move(index, 1) },
          }, [icon(ICONS.down)])
        : null,
      el('button', {
        class: 'icon-button',
        testid: 'file-remove',
        attrs: { type: 'button', 'aria-label': 'Remove' },
        on: { click: () => on.remove(index) },
      }, [icon(ICONS.close)]),
    ]);

    const passwordRow = needsPassword(entry)
      ? el('div', { class: 'file-item__password' }, [
          el('input', {
            class: 'input',
            testid: 'file-password',
            attrs: { type: 'password', placeholder: 'Password', autocomplete: 'off', 'aria-label': 'Password for this file' },
            on: {
              keydown: (ev) => {
                if (ev.key === 'Enter') on.password(index, (ev.target as HTMLInputElement).value);
              },
            },
          }),
          el('button', {
            class: 'button button--ghost button--small',
            testid: 'file-unlock',
            text: 'Unlock',
            attrs: { type: 'button' },
            on: {
              click: (ev) => {
                const input = (ev.currentTarget as HTMLElement).parentElement?.querySelector('input');
                if (input) on.password(index, input.value);
              },
            },
          }),
        ])
      : null;

    list.append(
      el(
        'li',
        {
          class: 'file-item',
          testid: 'file-item',
          attrs: {
            'data-id': file.id,
            'data-name': file.name,
            'data-size': String(file.size),
            ...(entry.pages === undefined ? {} : { 'data-pages': String(entry.pages) }),
          },
        },
        [
          el('div', { class: 'file-item__main' }, [
            el('span', { class: 'file-item__name', text: file.name }),
            el('span', { class: 'file-item__meta', text: meta.join(' · ') }),
            entry.error ? el('span', { class: 'file-item__error', text: entry.error }) : null,
          ]),
          controls,
          passwordRow,
        ],
      ),
    );
  });
}
