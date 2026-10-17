import type { Exporter, FoolscapFile, SaveOutcome, ShareOutcome } from '../files/types';
import type { Outcome } from '../ops/op';
import { LIVE_TOOLS, type ToolId, type ToolMeta } from '../ops/tools';
import { SHARE_URL } from '../site/config';
import { el } from './dom';
import { formatSize, plural } from './format';
import { typeLabel, type Box } from './thumbs';

export const TOO_LARGE = "This file is too big for this device's memory. Try splitting it first.";

/** The preview box in CSS pixels, a portrait page's shape. */
export const RESULT_THUMB: Box = { width: 52, height: 70 };
/** A big batch previews its first few; the rest show their type, which is all a glance needs. */
export const MAX_PREVIEWS = 6;

export interface ResultDeps {
  readonly tool: ToolMeta;
  readonly exporter: Exporter;
  /** The page owns the id→name map; outcomes carry ids. */
  nameOf(id: string): string;
  /** Page counts of the outputs, by id, where the engine could read them. */
  readonly pages: ReadonlyMap<string, number>;
  /** A small picture of a PDF's first page or of an image, drawn on demand; null for anything else. */
  preview(file: FoolscapFile, box: Box): Promise<HTMLCanvasElement | null>;
  /** Null when files cannot survive navigation (the memory backend): no "Then…". */
  readonly handoff: ((tool: ToolId, files: readonly FoolscapFile[]) => void) | null;
  startOver(): void;
}

const saveWords = (outcome: SaveOutcome): { text: string; error: boolean } => {
  switch (outcome.kind) {
    case 'saved':
      return { text: 'Saved.', error: false };
    case 'downloaded':
      return { text: 'Downloading. Look in your downloads folder.', error: false };
    case 'cancelled':
      return { text: 'Not saved.', error: false };
    case 'failed':
      return { text: outcome.reason, error: true };
  }
};

const shareWords = (outcome: ShareOutcome): { text: string; error: boolean } => {
  switch (outcome.kind) {
    case 'shared':
      return { text: 'Sent.', error: false };
    case 'cancelled':
      return { text: 'Not sent.', error: false };
    case 'unsupported':
      return { text: 'This browser cannot send files. Save it instead.', error: true };
    case 'failed':
      return { text: outcome.reason, error: true };
  }
};

/** What a failed or skipped outcome says on screen: the files it concerns, then the reason. */
export function failureText(outcome: Outcome & { kind: 'failed' | 'skipped' }, nameOf: (id: string) => string): string {
  const names = outcome.inputIds.map(nameOf).filter((n) => n.length > 0);
  const reason = outcome.kind === 'failed' && outcome.code === 'too-large' ? TOO_LARGE : outcome.reason;
  return names.length > 0 ? `${names.join(', ')}: ${reason}` : reason;
}

export function renderResult(outcomes: readonly Outcome[], deps: ResultDeps): HTMLElement {
  const produced = outcomes.filter((o): o is Outcome & { kind: 'produced' } => o.kind === 'produced');
  const failed = outcomes.filter((o): o is Outcome & { kind: 'failed' | 'skipped' } => o.kind !== 'produced');
  const files = produced.map((o) => o.file);

  const status = el('p', { class: 'result-item__status', attrs: { role: 'status' } });
  const say = (words: { text: string; error: boolean }, target: HTMLElement = status) => {
    target.textContent = words.text;
    target.classList.toggle('result-item__status--error', words.error);
    target.hidden = false;
  };
  status.hidden = true;

  // The picture slot of each result: its type in letters until (and unless) a preview is drawn.
  const slots: Array<{ file: FoolscapFile; slot: HTMLElement }> = [];
  // Send buttons, shown once the browser says it can send that file.
  const sends: Array<{ file: FoolscapFile; button: HTMLButtonElement }> = [];

  const items = produced.map((outcome) => {
    const { file } = outcome;
    const pages = deps.pages.get(file.id);
    const itemStatus = el('p', { class: 'result-item__status' });
    itemStatus.hidden = true;
    const slot = el('div', { class: 'thumb result-item__preview' }, [el('span', { class: 'thumb__type', testid: 'result-type', text: typeLabel(file.name) })]);
    slots.push({ file, slot });
    const send = el('button', {
      class: 'button button--ghost button--small',
      testid: 'share-button',
      text: 'Send',
      attrs: { type: 'button' },
      on: { click: async () => say(shareWords(await deps.exporter.share([file])), itemStatus) },
    });
    send.hidden = true;
    sends.push({ file, button: send });
    return el(
      'li',
      {
        class: 'result-item',
        testid: 'result-item',
        attrs: {
          'data-id': file.id,
          'data-name': file.name,
          'data-size': String(file.size),
          ...(pages === undefined ? {} : { 'data-pages': String(pages) }),
        },
      },
      [
        slot,
        el('div', { class: 'file-item__main' }, [
          el('span', { class: 'result-item__name', text: file.name }),
          el('span', { class: 'file-item__meta', text: [pages === undefined ? null : plural(pages, 'page'), formatSize(file.size)].filter(Boolean).join(' · ') }),
          el('span', { class: 'result-item__detail', testid: 'result-detail', text: outcome.detail }),
        ]),
        el('div', { class: 'result-item__buttons' }, [
          el('button', {
            class: 'button button--small',
            testid: 'save-button',
            text: 'Save',
            attrs: { type: 'button' },
            on: { click: async () => say(saveWords(await deps.exporter.save(file)), itemStatus) },
          }),
          send,
        ]),
        itemStatus,
      ],
    );
  });

  const failures = failed.map((outcome) =>
    el('li', {
      class: 'failure-item',
      testid: 'failure-item',
      text: failureText(outcome, deps.nameOf),
      attrs: { ...(outcome.kind === 'failed' && outcome.code !== undefined ? { 'data-code': outcome.code } : {}) },
    }),
  );

  const actions = el('div', { class: 'result__actions' });
  if (files.length > 1) {
    actions.append(
      el('button', {
        class: 'button button--small',
        testid: 'save-all-button',
        text: `Save all ${files.length}`,
        attrs: { type: 'button' },
        on: { click: async () => say(saveWords(await deps.exporter.saveAll(files, `${deps.tool.title}.zip`))) },
      }),
    );
  }
  // "Then…" offers only the tools that take what came out: PDFs to the PDF
  // tools, images to Images to PDF, text to nothing.
  const kinds = new Set(files.map((f) => f.kind));
  const takes = (t: ToolMeta) =>
    kinds.has('text') || kinds.has('other') ? false : kinds.has('image') ? t.input === 'images' || t.input === 'camera' : t.input === 'one-pdf' || t.input === 'several-pdfs' || t.input === 'pdf-and-files';
  const others = kinds.size === 1 ? LIVE_TOOLS.filter((t) => t.id !== deps.tool.id && takes(t)) : [];
  if (files.length > 0 && deps.handoff && others.length > 0) {
    const menu = el('div', { class: 'then__menu', attrs: { role: 'menu' } }, others.map((t) =>
      el('button', {
        testid: `then-${t.id}`,
        attrs: { type: 'button', role: 'menuitem' },
        on: { click: () => deps.handoff?.(t.id, files) },
      }, [t.title, el('span', { attrs: { 'aria-hidden': 'true' }, text: '→' })]),
    ));
    menu.hidden = true;
    const toggle = el('button', {
      class: 'button button--ghost button--small',
      testid: 'then-menu',
      text: 'Then…',
      attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      on: {
        click: () => {
          menu.hidden = !menu.hidden;
          toggle.setAttribute('aria-expanded', String(!menu.hidden));
        },
      },
    });
    actions.append(el('div', { class: 'then' }, [toggle, menu]));
  }
  actions.append(
    el('button', {
      class: 'button button--ghost button--small',
      testid: 'start-over',
      text: 'Start over',
      attrs: { type: 'button' },
      on: { click: () => deps.startOver() },
    }),
  );

  const title = files.length === 0 ? 'That didn’t work' : files.length === 1 ? 'Done' : `Done: ${plural(files.length, 'file')}`;
  const root = el('section', { class: 'result', testid: 'result', attrs: { 'aria-live': 'polite', 'aria-label': 'Result' } }, [
    el('h2', { class: 'result__title', text: title }),
    items.length > 0 ? el('ul', { class: 'result__list' }, items) : null,
    failures.length > 0 ? el('ul', { class: 'result__list' }, failures) : null,
    actions,
    status,
    // A plain link: nothing is sent until it is tapped, and it carries the site's address, never the file.
    files.length > 0
      ? el('p', { class: 'result__tell' }, [
          'Useful? ',
          el('a', { testid: 'result-tell', text: 'Tell a friend on WhatsApp', attrs: { href: SHARE_URL, target: '_blank', rel: 'noopener' } }),
        ])
      : null,
  ]);

  // Send only where the browser can hand that file to another app (on a phone,
  // straight into WhatsApp or mail); each button appears once the browser says so.
  for (const { file, button } of sends) {
    void deps.exporter.canShare([file]).then((ok) => (button.hidden = !ok));
  }
  if (files.length > 1) {
    void deps.exporter.canShare(files).then((ok) => {
      if (!ok) return;
      const saveAll = actions.querySelector('[data-testid="save-all-button"]');
      const sendAll = el('button', {
        class: 'button button--ghost button--small',
        testid: 'share-all',
        text: `Send all ${files.length}`,
        attrs: { type: 'button' },
        on: { click: async () => say(shareWords(await deps.exporter.share(files))) },
      });
      if (saveAll) saveAll.after(sendAll);
      else actions.prepend(sendAll);
    });
  }

  // Pictures last, one at a time, once the box is on screen: the buttons never wait for them.
  void (async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    for (const { file, slot } of slots.slice(0, MAX_PREVIEWS)) {
      if (!root.isConnected) return;
      try {
        const picture = await deps.preview(file, RESULT_THUMB);
        if (picture) slot.replaceChildren(picture);
      } catch {
        // The type stays in the slot; a result that cannot be drawn can still be saved.
      }
    }
  })();

  return root;
}
