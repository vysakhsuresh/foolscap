/**
 * Bookmarks: the document's own outline, read with pdf.js on the page and
 * shown as a list to rename, reorder, nest and delete. Nothing touches the
 * file until the button is pressed; the whole list then goes to the worker.
 *
 * The list is flat with a depth on each row, which is how people think of a
 * table of contents ("this one sits under that one"), and turned into a tree
 * only when it is sent.
 */
import type { BookmarksParams } from '../ops/op';
import type { OutlineItem, PdfView } from '../pdf/types';
import { el } from './dom';
import { note } from './fields';

export interface BookmarksPanel {
  readonly root: HTMLElement;
  /** Reads the outline and closes `view`. */
  load(view: PdfView): Promise<void>;
  params(): BookmarksParams;
  problem(): string | null;
  destroy(): Promise<void>;
}

interface Row {
  title: string;
  /** Zero-based; null for a bookmark that opens a web page or something else, not a page. */
  page: number | null;
  depth: number;
  /** Where the row came from in the document's own bookmarks, so the writer can keep what it cannot show. */
  was?: OutlineItem['was'];
}

const MAX_DEPTH = 4;

/** The tree as rows, depth-first. `was` counts every entry, nested ones included, in the same order. */
export function flatten(items: readonly OutlineItem[], depth = 0, out: Row[] = []): Row[] {
  for (const item of items) {
    const index = out.length;
    out.push({ title: item.title, page: item.page, depth: Math.min(depth, MAX_DEPTH), was: item.was ?? { index, title: item.title, page: item.page } });
    flatten(item.items, depth + 1, out);
  }
  return out;
}

/** Rows back into a tree. A row deeper than the one before it by more than one is treated as one deeper. */
export function toTree(rows: readonly Row[]): OutlineItem[] {
  type Node = { title: string; page: number | null; items: Node[]; was?: NonNullable<OutlineItem['was']> };
  const root: Node[] = [];
  const stack: Node[][] = [root];
  for (const row of rows) {
    const depth = Math.min(row.depth, stack.length - 1);
    stack.length = depth + 1;
    const node: Node = { title: row.title, page: row.page, items: [], ...(row.was ? { was: row.was } : {}) };
    stack[depth]?.push(node);
    stack.push(node.items);
  }
  return root;
}

export function createBookmarksPanel(onChange: () => void): BookmarksPanel {
  const list = el('ol', { class: 'bm-list', testid: 'bookmark-list', attrs: { 'aria-label': 'Bookmarks' } });
  const empty = note('This PDF has no bookmarks yet. Add the first one: a title, and the page it opens.');
  const add = el('button', { class: 'button button--ghost button--small', testid: 'bookmark-add', text: '+ Add a bookmark', attrs: { type: 'button' } });
  const root = el('section', { class: 'bm-panel', attrs: { 'aria-label': 'Bookmarks' } }, [empty, list, add]);
  root.hidden = true;
  let rows: Row[] = [];
  let pageCount = 0;
  let loaded = false;
  /** How many the file had, so an empty list can mean "remove them all" only when there were some. */
  let original = 0;

  const iconButton = (label: string, glyph: string, testid: string, disabled: boolean, onClick: () => void) =>
    el('button', {
      class: 'bm-row__btn',
      testid,
      text: glyph,
      attrs: { type: 'button', 'aria-label': label, title: label, ...(disabled ? { disabled: '' } : {}) },
      on: { click: onClick },
    });

  function render(focus?: { index: number; part: 'title' | 'page' }): void {
    empty.hidden = rows.length > 0;
    list.replaceChildren(
      ...rows.map((row, i) => {
        const prevDepth = i === 0 ? -1 : (rows[i - 1]?.depth ?? 0);
        const title = el('input', {
          class: 'input bm-row__title',
          testid: `bookmark-title-${i}`,
          attrs: { type: 'text', value: row.title, 'aria-label': `Bookmark ${i + 1} title`, maxlength: '300', autocomplete: 'off' },
          on: {
            input: (ev) => {
              row.title = (ev.target as HTMLInputElement).value;
              onChange();
            },
          },
        });
        // A bookmark that opens a web page keeps doing so; typing a page makes it open that page instead.
        const page = el('input', {
          class: 'input bm-row__page',
          testid: `bookmark-page-${i}`,
          attrs: {
            type: 'number',
            min: '1',
            max: String(pageCount),
            step: '1',
            inputmode: 'numeric',
            ...(row.page === null ? { placeholder: 'Link' } : { value: String(row.page + 1) }),
            'aria-label': row.page === null ? `Bookmark ${i + 1} opens a link, not a page. Type a page to open that instead` : `Bookmark ${i + 1} page`,
          },
          on: {
            input: (ev) => {
              const value = (ev.target as HTMLInputElement).value.trim();
              const n = Number(value);
              row.page = value === '' && row.was?.page === null ? null : Number.isInteger(n) && value !== '' ? n - 1 : -1;
              onChange();
            },
          },
        });
        const move = (to: number) => {
          const [item] = rows.splice(i, 1);
          if (item) rows.splice(to, 0, item);
          normalise();
          render({ index: to, part: 'title' });
          onChange();
        };
        const item = el('li', { class: 'bm-row' }, [
          el('div', { class: 'bm-row__head' }, [
            title,
            iconButton('Delete', '✕', `bookmark-delete-${i}`, false, () => {
              rows.splice(i, 1);
              normalise();
              render();
              onChange();
            }),
          ]),
          el('div', { class: 'bm-row__tools' }, [
            el('label', { class: 'bm-row__page-label' }, ['Page', page]),
            iconButton('Move out a level', '⇤', `bookmark-out-${i}`, row.depth === 0, () => {
              row.depth -= 1;
              normalise();
              render();
              onChange();
            }),
            iconButton('Move in a level, under the one above', '⇥', `bookmark-in-${i}`, row.depth > prevDepth || row.depth >= MAX_DEPTH, () => {
              row.depth += 1;
              normalise();
              render();
              onChange();
            }),
            iconButton('Move up', '↑', `bookmark-up-${i}`, i === 0, () => move(i - 1)),
            iconButton('Move down', '↓', `bookmark-down-${i}`, i === rows.length - 1, () => move(i + 1)),
          ]),
        ]);
        item.style.setProperty('--depth', String(row.depth));
        if (focus?.index === i) queueMicrotask(() => (focus.part === 'title' ? title : page).focus({ preventScroll: false }));
        return item;
      }),
    );
  }

  /** No row may sit more than one level under the one before it. */
  function normalise(): void {
    let prev = -1;
    for (const row of rows) {
      row.depth = Math.max(0, Math.min(row.depth, prev + 1, MAX_DEPTH));
      prev = row.depth;
    }
  }

  add.addEventListener('click', () => {
    const lastPage = rows.reduce((max, r) => (r.page !== null && r.page > max ? r.page : max), -1);
    rows.push({ title: 'New bookmark', page: Math.min(pageCount - 1, lastPage + 1), depth: 0 });
    render({ index: rows.length - 1, part: 'title' });
    const input = list.querySelector<HTMLInputElement>(`[data-testid="bookmark-title-${rows.length - 1}"]`);
    queueMicrotask(() => input?.select());
    onChange();
  });

  return {
    root,
    async load(view) {
      root.hidden = false;
      loaded = false;
      pageCount = view.pageCount;
      list.replaceChildren();
      empty.textContent = 'Reading the bookmarks…';
      empty.hidden = false;
      try {
        // Every entry is kept, including one that opens a web page (no page) or points past the end
        // (shown as needing a page): dropping them here would delete them from the file unasked.
        rows = flatten(await view.outline());
      } catch {
        rows = [];
      } finally {
        await view.close();
      }
      original = rows.length;
      normalise();
      empty.textContent = 'This PDF has no bookmarks yet. Add the first one: a title, and the page it opens.';
      loaded = true;
      render();
      onChange();
    },
    params: () => ({ items: toTree(rows.map((r) => ({ ...r, title: r.title.trim() }))) }),
    problem() {
      if (!loaded) return 'Reading the bookmarks…';
      const bad = rows.findIndex((r) => (r.page === null ? r.was?.page !== null : !(r.page >= 0 && r.page < pageCount)));
      if (bad >= 0) return `Bookmark ${bad + 1} needs a page between 1 and ${pageCount}.`;
      const blank = rows.findIndex((r) => r.title.trim() === '');
      if (blank >= 0) return `Bookmark ${blank + 1} needs a title.`;
      if (rows.length === 0 && original === 0) return 'Add a bookmark first.';
      return null;
    },
    async destroy() {
      rows = [];
      loaded = false;
      list.replaceChildren();
      root.hidden = true;
    },
  };
}
