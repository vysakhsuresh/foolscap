/**
 * The picked files, one row each: a small picture of the first page (or the
 * image itself), the name and what the engine found out, and the controls.
 *
 * Where the order matters (Merge and every tool that takes several files),
 * a row moves four ways: dragged with a mouse, dragged with a finger after
 * holding it a moment (so a swipe still scrolls), its up and down buttons,
 * and the keyboard through those buttons. Rows shift as it goes, the page
 * scrolls under it near the screen's edges, Escape puts it back, and every
 * move is said aloud in a polite live line. The page's own `entries` array
 * stays the one truth: a drag only reports where the row ended up.
 */
import type { FoolscapFile } from '../files/types';
import type { PdfErrorCode } from '../pdf/types';
import { ICONS, clear, el, icon } from './dom';
import { DRAG_SLOP, HOLD_MS, TOUCH_SLOP, dropIndex, edgeScroll, moved } from './drag';
import { formatSize, plural } from './format';
import { typeLabel } from './thumbs';

/** One picked file as the page knows it: the FoolscapFile plus what the engine found out. */
export interface Entry {
  readonly file: FoolscapFile;
  pages?: number;
  error?: string;
  errorCode?: PdfErrorCode;
  password?: string;
  /** The first page or the image, small; drawn once and moved from row to row as the list is redrawn. */
  thumb?: HTMLCanvasElement;
}

export interface FileListHandlers {
  move(index: number, delta: -1 | 1): void;
  /** A row was dragged from `from` to `to`; the page moves its entry and redraws. */
  reorder(from: number, to: number): void;
  remove(index: number): void;
  password(index: number, password: string): void;
}

export interface FileList {
  /** The list, its hint and its live line, to put on the page. */
  readonly root: HTMLElement;
  /** Redraws the rows. Cheap enough for a list a person can read; no diffing. Waits while a row is being dragged. */
  render(entries: readonly Entry[], reorderable: boolean): void;
}

/** The thumbnail box in CSS pixels, a portrait page's shape. tool.ts draws to it. */
export const FILE_THUMB = { width: 40, height: 54 } as const;

const needsPassword = (entry: Entry) => entry.errorCode === 'encrypted' || entry.errorCode === 'wrong-password';

interface Drag {
  readonly row: HTMLElement;
  readonly from: number;
  readonly pointerId: number;
  readonly touch: boolean;
  readonly startX: number;
  readonly startY: number;
  /** Where in the row the pointer took hold, so the row stays under it. */
  readonly grab: number;
  x: number;
  y: number;
  /** How far the row is drawn from where the list puts it. */
  shift: number;
  active: boolean;
  hold: number | null;
  frame: number | null;
}

export function createFileList(on: FileListHandlers): FileList {
  const list = el('ol', { class: 'file-list', testid: 'file-list', attrs: { 'aria-label': 'Your files' } });
  const hint = el('p', {
    class: 'file-list__hint',
    testid: 'file-list-hint',
    text: 'Drag a file to change the order (on a phone, hold it a moment first), or use its arrows.',
  });
  hint.hidden = true;
  const status = el('p', { class: 'visually-hidden', testid: 'file-list-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const root = el('div', { class: 'file-list-wrap' }, [list, hint, status]);

  let shown: readonly Entry[] = [];
  /** The order matters and there is more than one file: rows have arrows and can be dragged. */
  let movable = false;
  /** The rows in the order they stand on screen, which during a drag runs ahead of `shown`. */
  let rows: HTMLElement[] = [];
  let drag: Drag | null = null;
  let waiting = false;
  /** The files already on screen: only a newcomer rises in. */
  let seen = new Set<string>();

  const say = (text: string) => {
    // Cleared first, so the same words twice are still read out.
    status.textContent = '';
    queueMicrotask(() => (status.textContent = text));
  };
  const nameAt = (index: number) => shown[index]?.file.name ?? 'The file';

  function render(entries: readonly Entry[], reorderable: boolean): void {
    shown = entries;
    movable = reorderable && entries.length > 1;
    if (drag?.active) {
      waiting = true;
      return;
    }
    if (drag) endDrag(false);
    draw();
  }

  function draw(): void {
    waiting = false;
    const entries = shown;
    // A password half-typed into one row must survive another row being
    // unlocked, which redraws the whole list: keep what was typed, and where
    // the caret was, by file. A focused arrow keeps its focus the same way,
    // so the keyboard can move a file several places in a row.
    const typed = new Map<string, string>();
    let focused: { id: string; start: number | null; end: number | null } | null = null;
    let button: { id: string; testid: string } | null = null;
    for (const box of list.querySelectorAll<HTMLInputElement>('[data-testid="file-password"]')) {
      const id = box.closest<HTMLElement>('[data-id]')?.dataset['id'];
      if (id === undefined) continue;
      if (box.value !== '') typed.set(id, box.value);
      if (box === document.activeElement) focused = { id, start: box.selectionStart, end: box.selectionEnd };
    }
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && list.contains(active)) {
      const id = active.closest<HTMLElement>('[data-id]')?.dataset['id'];
      const testid = active.dataset['testid'];
      if (id !== undefined && testid !== undefined) button = { id, testid };
    }
    clear(list);
    hint.hidden = !movable;
    const before = seen;
    seen = new Set(entries.map((e) => e.file.id));
    rows = entries.map((entry, index) => {
      const row = drawRow(entry, index, entries.length, typed.get(entry.file.id), !before.has(entry.file.id));
      list.append(row);
      const box = row.querySelector<HTMLInputElement>('[data-testid="file-password"]');
      if (box && focused?.id === entry.file.id) {
        box.focus();
        if (focused.start !== null && box.value !== '') box.setSelectionRange(focused.start, focused.end ?? focused.start);
      }
      return row;
    });
    if (button) {
      const row = rows.find((r) => r.dataset['id'] === button.id);
      const same = row?.querySelector<HTMLButtonElement>(`[data-testid="${button.testid}"]`);
      // At the top or the bottom the arrow just used is disabled: the other one takes the focus.
      const other = row?.querySelector<HTMLButtonElement>(
        button.testid === 'file-move-up' ? '[data-testid="file-move-down"]' : '[data-testid="file-move-up"]',
      );
      if (same && !same.disabled) same.focus();
      else if (other && !other.disabled && button.testid.startsWith('file-move')) other.focus();
    }
  }

  function drawRow(entry: Entry, index: number, count: number, kept: string | undefined, fresh: boolean): HTMLElement {
    const { file } = entry;
    const meta: string[] = [formatSize(file.size)];
    if (entry.pages !== undefined) meta.push(plural(entry.pages, 'page'));
    else if (!entry.error && file.kind === 'pdf') meta.push('Counting pages…');

    const controls = el('div', { class: 'file-item__controls' }, [
      movable
        ? el('button', {
            class: 'icon-button',
            testid: 'file-move-up',
            attrs: { type: 'button', 'aria-label': 'Move up', ...(index === 0 ? { disabled: '' } : {}) },
            on: {
              click: () => {
                on.move(index, -1);
                say(`${file.name} moved to position ${index} of ${count}.`);
              },
            },
          }, [icon(ICONS.up)])
        : null,
      movable
        ? el('button', {
            class: 'icon-button',
            testid: 'file-move-down',
            attrs: { type: 'button', 'aria-label': 'Move down', ...(index === count - 1 ? { disabled: '' } : {}) },
            on: {
              click: () => {
                on.move(index, 1);
                say(`${file.name} moved to position ${index + 2} of ${count}.`);
              },
            },
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

    // The picture, once drawn; until then (or when it cannot be) the file's type in letters.
    const thumb = el('div', { class: 'thumb file-item__thumb' }, [
      entry.thumb ?? el('span', { class: 'thumb__type', text: typeLabel(file.name) }),
    ]);

    const row = el(
      'li',
      {
        class: ['file-item', movable ? 'file-item--movable' : '', fresh ? 'file-item--new' : '']
          .filter(Boolean)
          .join(' '),
        testid: 'file-item',
        attrs: {
          'data-id': file.id,
          'data-name': file.name,
          'data-size': String(file.size),
          ...(entry.pages === undefined ? {} : { 'data-pages': String(entry.pages) }),
        },
      },
      [
        movable
          ? el('span', { class: 'file-item__grip', testid: 'file-drag-handle', attrs: { 'aria-hidden': 'true', title: 'Drag to move' } }, [icon(GRIP, 18)])
          : null,
        thumb,
        el('div', { class: 'file-item__main' }, [
          el('span', { class: 'file-item__name', text: file.name }),
          el('span', { class: 'file-item__meta', text: meta.join(' · ') }),
          entry.error ? el('span', { class: 'file-item__error', text: entry.error }) : null,
        ]),
        controls,
        passwordRow,
      ],
    );
    const box = passwordRow?.querySelector<HTMLInputElement>('input');
    // Not the password just tried and refused: that one starts again empty.
    if (box && kept !== undefined && kept !== entry.password) box.value = kept;
    if (movable) {
      row.addEventListener('pointerdown', (ev) => onPointerDown(row, ev));
      row.addEventListener('touchmove', stopScroll, { passive: false });
      // Holding a finger on a picture would otherwise open the browser's own menu.
      row.addEventListener('contextmenu', (ev) => {
        if (drag) ev.preventDefault();
      });
    }
    return row;
  }

  // ---- Dragging ----

  function onPointerDown(row: HTMLElement, ev: PointerEvent): void {
    if (drag || ev.button !== 0 || !ev.isPrimary || !movable) return;
    // The buttons and the password box stay what they are.
    if ((ev.target as Element).closest('button, input, a')) return;
    const from = rows.indexOf(row);
    if (from === -1) return;
    const touch = ev.pointerType !== 'mouse';
    const rect = row.getBoundingClientRect();
    const d: Drag = {
      row,
      from,
      pointerId: ev.pointerId,
      touch,
      startX: ev.clientX,
      startY: ev.clientY,
      grab: ev.clientY - rect.top,
      x: ev.clientX,
      y: ev.clientY,
      shift: 0,
      active: false,
      hold: null,
      frame: null,
    };
    drag = d;
    if (touch) d.hold = window.setTimeout(() => drag === d && beginDrag(d), HOLD_MS);
    // On the window, not the row: the row moves in the list as it is dragged, and a moved element loses its pointer capture.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKey);
  }

  function beginDrag(d: Drag): void {
    d.active = true;
    d.row.classList.add('file-item--dragging');
    list.classList.add('file-list--dragging');
    say(`Moving ${nameAt(d.from)}. Let go where it should go.`);
    if (d.touch) navigator.vibrate?.(15);
    lastFrame = 0;
    tick();
  }

  /** Puts the row where the pointer is, in the list and on screen. */
  function track(d: Drag): void {
    const from = rows.indexOf(d.row);
    const middles = rows.map((r) => {
      const rect = r.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const to = dropIndex(middles, from, d.y);
    if (to !== from) {
      rows = moved(rows, from, to);
      list.insertBefore(d.row, rows[to + 1] ?? null);
    }
    follow(d);
  }

  /** Draws the row under the pointer, wherever the list has put it. */
  function follow(d: Drag): void {
    const natural = d.row.getBoundingClientRect().top - d.shift;
    d.shift = d.y - d.grab - natural;
    d.row.style.setProperty('transform', `translateY(${d.shift.toFixed(1)}px)`);
  }

  let lastFrame = 0;
  function tick(now: number = performance.now()): void {
    const d = drag;
    if (!d || !d.active) return;
    const dt = lastFrame === 0 ? 16 : now - lastFrame;
    lastFrame = now;
    const by = edgeScroll(d.y, window.innerHeight, dt);
    if (by !== 0) {
      window.scrollBy({ top: by, behavior: 'instant' });
      track(d);
    }
    d.frame = requestAnimationFrame(tick);
  }

  function endDrag(commit: boolean): void {
    const d = drag;
    drag = null;
    if (!d) return;
    unlisten();
    if (d.hold !== null) clearTimeout(d.hold);
    if (d.frame !== null) cancelAnimationFrame(d.frame);
    if (!d.active) return;
    d.row.classList.remove('file-item--dragging');
    list.classList.remove('file-list--dragging');
    d.row.style.removeProperty('transform');
    const to = rows.indexOf(d.row);
    const name = nameAt(d.from);
    if (commit && to !== -1 && to !== d.from) {
      // The page moves the entry and redraws; a redraw that waited on the drag happens there too.
      on.reorder(d.from, to);
      say(`${name} moved to position ${to + 1} of ${rows.length}.`);
    } else {
      // Put back as it was: the page's order never changed.
      draw();
      say(commit ? `${name} stayed where it was.` : `Move cancelled. ${name} is back where it was.`);
    }
    if (waiting) draw();
  }

  function onPointerMove(ev: PointerEvent): void {
    const d = drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    d.x = ev.clientX;
    d.y = ev.clientY;
    const far = Math.hypot(d.x - d.startX, d.y - d.startY);
    if (!d.active) {
      // A finger that moves before the hold is up is scrolling, not dragging.
      if (d.touch && far > TOUCH_SLOP) endDrag(false);
      else if (!d.touch && far > DRAG_SLOP) beginDrag(d);
      return;
    }
    ev.preventDefault();
    track(d);
  }

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.pointerId === drag?.pointerId) endDrag(true);
  };
  const onPointerCancel = (ev: PointerEvent) => {
    if (ev.pointerId === drag?.pointerId) endDrag(false);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && drag?.active) {
      ev.preventDefault();
      endDrag(false);
    }
  };
  function unlisten(): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKey);
  }

  // A finger already dragging must not also scroll the page.
  const stopScroll = (ev: TouchEvent) => {
    if (drag?.active) ev.preventDefault();
  };

  return { root, render };
}

/** Six dots: the mark for "this can be picked up". */
const GRIP =
  '<g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g>';
