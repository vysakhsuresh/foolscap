/**
 * The organise grid: one tile per page, thumbnails drawn lazily as tiles
 * scroll into view, and the output described by the tiles' order and state.
 *
 * Four ways to move a page, so it works for everyone: drag it (a mouse at
 * once, a finger after holding it a moment, so a swipe still scrolls), the
 * earlier and later buttons on each tile, Alt (Option) with the arrow keys,
 * Home or End on a focused tile, and Select, which picks several pages to
 * turn, delete, or send to the start or the end in one tap. Every move is
 * said aloud in a polite live line.
 *
 * Rotation on a tile is ABSOLUTE: the source page's own /Rotate plus the
 * quarter-turns the user added, modulo 360. The thumbnail already shows the
 * source rotation (the engine renders a page the way a reader shows it), so
 * only the added turns are applied with CSS.
 */
import type { OrganiseParams } from '../ops/op';
import type { PdfView, Rotation } from '../pdf/types';
import { ICONS, clear, el, icon } from './dom';

interface Tile {
  readonly source: number;
  readonly base: Rotation;
  turns: number;
  deleted: boolean;
  selected: boolean;
  rendered: boolean;
  readonly root: HTMLLIElement;
  readonly thumb: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly number: HTMLElement;
  readonly pick: HTMLInputElement;
  readonly up: HTMLButtonElement;
  readonly down: HTMLButtonElement;
  readonly toggle: HTMLButtonElement;
}

export interface PageGrid {
  readonly root: HTMLElement;
  /** Takes ownership of `view`; closes it on `destroy()` or the next `load()`. */
  load(view: PdfView): Promise<void>;
  /** The output, in tile order, deleted pages left out. */
  params(): OrganiseParams;
  /** Pages that would be in the output. */
  count(): number;
  destroy(): Promise<void>;
}

const MAX_DPR = 2;
const RENDER_CONCURRENCY = 2;
/** How long a finger rests on a page before it lifts to be dragged; a swipe sooner than this scrolls. */
const HOLD_MS = 350;
/** How far a mouse moves with its button down before that is a drag rather than a click. */
const DRAG_SLOP = 6;
/** How near the top or bottom of the screen a dragged page starts the page scrolling. */
const EDGE = 90;

export function createPageGrid(onChange: () => void): PageGrid {
  const list = el('ol', { class: 'page-grid', testid: 'page-grid', attrs: { 'aria-label': 'Pages', 'aria-describedby': 'page-grid-help' } });
  const status = el('p', { class: 'visually-hidden', testid: 'grid-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const help = el('p', {
    class: 'grid-tools__help',
    attrs: { id: 'page-grid-help' },
    text: 'Drag a page to move it (on a phone, hold it a moment first), or use the arrows under it. With the keyboard: Alt and an arrow key, or Home and End.',
  });
  const button = (testid: string, text: string, onClick: () => void) =>
    el('button', { class: 'button button--ghost button--small', testid, text, attrs: { type: 'button' }, on: { click: onClick } });
  const turnAll = button('grid-turn-all', 'Turn every page', () => {
    for (const tile of tiles) tile.turns = (tile.turns + 1) % 4;
    sync();
    say(`Every page turned a quarter turn.`);
  });
  const selectToggle = button('grid-select', 'Select pages', () => setSelecting(!selecting));
  selectToggle.setAttribute('aria-pressed', 'false');
  const count = el('span', { class: 'grid-tools__count', testid: 'grid-sel-count', attrs: { 'aria-live': 'polite' } });
  const chosen = (): Tile[] => tiles.filter((t) => t.selected);
  const selectAll = button('grid-sel-all', 'Select all', () => {
    const all = tiles.every((t) => t.selected);
    for (const tile of tiles) tile.selected = !all;
    sync();
  });
  const selTurn = button('grid-sel-turn', 'Turn', () => {
    const picked = chosen();
    for (const tile of picked) tile.turns = (tile.turns + 1) % 4;
    sync();
    say(`${pages(picked.length)} turned a quarter turn.`);
  });
  const selDelete = button('grid-sel-delete', 'Delete', () => {
    const picked = chosen();
    const restore = picked.every((t) => t.deleted);
    for (const tile of picked) tile.deleted = !restore;
    sync();
    say(`${pages(picked.length)} ${restore ? 'brought back' : 'deleted'}.`);
  });
  const selStart = button('grid-sel-start', 'Move to start', () => moveChosen('start'));
  const selEnd = button('grid-sel-end', 'Move to end', () => moveChosen('end'));
  const selectBar = el('div', { class: 'grid-tools__bar', testid: 'grid-select-bar', attrs: { role: 'group', 'aria-label': 'Selected pages' } }, [
    count,
    selectAll,
    selTurn,
    selDelete,
    selStart,
    selEnd,
  ]);
  selectBar.hidden = true;
  const toolbar = el('div', { class: 'grid-tools' }, [el('div', { class: 'grid-tools__row' }, [turnAll, selectToggle]), selectBar, help]);
  const root = el('div', { class: 'page-grid-wrap' }, [toolbar, status, list]);
  root.hidden = true;

  let view: PdfView | null = null;
  let tiles: Tile[] = [];
  let abort = new AbortController();
  let observer: IntersectionObserver | null = null;
  const pending: Tile[] = [];
  let inFlight = 0;
  let selecting = false;

  const pages = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;
  const say = (text: string) => {
    // Cleared first, so the same words twice are still read out.
    status.textContent = '';
    queueMicrotask(() => (status.textContent = text));
  };
  const rotationOf = (tile: Tile): Rotation => (((tile.base + tile.turns * 90) % 360) + 360) % 360 as Rotation;

  function setSelecting(on: boolean): void {
    selecting = on;
    if (!on) for (const tile of tiles) tile.selected = false;
    selectToggle.textContent = on ? 'Done selecting' : 'Select pages';
    selectToggle.setAttribute('aria-pressed', String(on));
    selectBar.hidden = !on;
    root.classList.toggle('page-grid-wrap--selecting', on);
    sync();
    if (on) say('Tap the pages to select them.');
  }

  function sync(): void {
    tiles.forEach((tile, position) => {
      tile.root.dataset['rotation'] = String(rotationOf(tile));
      tile.root.dataset['deleted'] = tile.deleted ? 'true' : 'false';
      tile.root.dataset['selected'] = tile.selected ? 'true' : 'false';
      tile.root.setAttribute(
        'aria-label',
        `Page ${tile.source + 1}, now at position ${position + 1}${tile.deleted ? ', deleted' : ''}${tile.turns % 4 ? `, turned ${(tile.turns % 4) * 90} degrees` : ''}`,
      );
      tile.pick.checked = tile.selected;
      tile.pick.hidden = !selecting;
      tile.up.disabled = position === 0;
      tile.down.disabled = position === tiles.length - 1;
      tile.toggle.dataset['testid'] = tile.deleted ? 'page-restore' : 'page-delete';
      tile.toggle.setAttribute('aria-label', tile.deleted ? 'Restore page' : 'Delete page');
      tile.toggle.replaceChildren(icon(tile.deleted ? ICONS.restore : ICONS.trash));
      applyTurns(tile);
    });
    const picked = chosen().length;
    count.textContent = `${picked} selected`;
    for (const b of [selTurn, selDelete, selStart, selEnd]) b.disabled = picked === 0;
    selDelete.textContent = picked > 0 && chosen().every((t) => t.deleted) ? 'Restore' : 'Delete';
    selectAll.textContent = tiles.length > 0 && tiles.every((t) => t.selected) ? 'Select none' : 'Select all';
    onChange();
  }

  /** A quarter-turn swaps the drawn width and height, so scale it back into the box. */
  function applyTurns(tile: Tile): void {
    const quarter = tile.turns % 2 !== 0;
    const box = tile.thumb.getBoundingClientRect();
    const drawn = tile.canvas.getBoundingClientRect();
    let scale = 1;
    if (quarter && drawn.width > 0 && drawn.height > 0 && box.width > 0 && box.height > 0) {
      // The canvas is laid out unrotated, so its current rect is the unrotated size.
      const unrotatedW = tile.canvas.dataset['w'] ? Number(tile.canvas.dataset['w']) : drawn.width;
      const unrotatedH = tile.canvas.dataset['h'] ? Number(tile.canvas.dataset['h']) : drawn.height;
      scale = Math.min(1, box.width / unrotatedH, box.height / unrotatedW);
    }
    tile.canvas.style.setProperty('transform', `rotate(${(tile.turns % 4) * 90}deg) scale(${scale.toFixed(3)})`);
  }

  /** Puts `tile` at position `to` in the grid, in the list and on screen. */
  function place(tile: Tile, to: number): void {
    const from = tiles.indexOf(tile);
    const target = Math.max(0, Math.min(tiles.length - 1, to));
    if (from === -1 || from === target) return;
    tiles.splice(from, 1);
    tiles.splice(target, 0, tile);
    const after = tiles[target + 1];
    if (after) list.insertBefore(tile.root, after.root);
    else list.append(tile.root);
  }

  function moved(tile: Tile): void {
    say(`Page ${tile.source + 1} moved to position ${tiles.indexOf(tile) + 1} of ${tiles.length}.`);
  }

  function move(tile: Tile, delta: -1 | 1): void {
    const from = tiles.indexOf(tile);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= tiles.length) return;
    place(tile, to);
    sync();
    moved(tile);
    tile.root.querySelector<HTMLButtonElement>(delta === -1 ? '[data-testid="page-move-up"]' : '[data-testid="page-move-down"]')?.focus();
  }

  function moveChosen(where: 'start' | 'end'): void {
    const picked = chosen();
    if (picked.length === 0) return;
    // The picked pages keep their order among themselves.
    const rest = tiles.filter((t) => !t.selected);
    tiles = where === 'start' ? [...picked, ...rest] : [...rest, ...picked];
    list.append(...tiles.map((t) => t.root));
    sync();
    say(`${pages(picked.length)} moved to the ${where}.`);
  }

  // ---- Dragging ----

  interface Drag {
    readonly tile: Tile;
    readonly pointerId: number;
    readonly touch: boolean;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
    hold: number | null;
    frame: number | null;
  }
  let drag: Drag | null = null;
  /** A drag just ended on this tile: the click that follows is not a tap. */
  let swallowClick = false;

  function beginDrag(d: Drag): void {
    d.active = true;
    d.tile.root.classList.add('page-tile--dragging');
    list.classList.add('page-grid--dragging');
    say(`Moving page ${d.tile.source + 1}. Let go where it should go.`);
    if (d.touch) navigator.vibrate?.(15);
    lastFrame = 0;
    tick();
  }

  /** The tile under the pointer, and whether the dragged one goes before or after it. */
  function track(d: Drag): void {
    const under = document
      .elementsFromPoint(d.x, d.y)
      .map((node) => node.closest<HTMLElement>('[data-testid="page-tile"]'))
      .find((node): node is HTMLElement => node !== null && node !== d.tile.root);
    const over = under ? tiles.find((t) => t.root === under) : undefined;
    if (!over) return;
    const rect = over.root.getBoundingClientRect();
    const after = d.x > rect.left + rect.width / 2;
    const from = tiles.indexOf(d.tile);
    let to = tiles.indexOf(over) + (after ? 1 : 0);
    if (to > from) to -= 1;
    if (to !== from) place(d.tile, to);
  }

  /**
   * While a page is held near the top or bottom of the screen, the page
   * scrolls under it: faster the nearer the edge, up to a screen a second,
   * whatever the frame rate.
   */
  let lastFrame = 0;
  function tick(now: number = performance.now()): void {
    const d = drag;
    if (!d || !d.active) return;
    const dt = lastFrame === 0 ? 16 : Math.min(64, now - lastFrame);
    lastFrame = now;
    const top = EDGE - d.y;
    const bottom = d.y - (window.innerHeight - EDGE);
    const closeness = Math.min(1, Math.max(top, bottom, 0) / EDGE);
    if (closeness > 0) {
      const perSecond = 250 + closeness * Math.max(900, window.innerHeight * 1.5);
      window.scrollBy({ top: (top > 0 ? -1 : 1) * Math.ceil((perSecond * dt) / 1000), behavior: 'instant' });
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
    d.tile.root.classList.remove('page-tile--dragging');
    list.classList.remove('page-grid--dragging');
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    sync();
    if (commit) moved(d.tile);
    d.tile.root.focus({ preventScroll: true });
  }

  function onPointerDown(tile: Tile, ev: PointerEvent): void {
    if (drag || ev.button !== 0 || !ev.isPrimary) return;
    // The buttons and the select box stay buttons.
    if ((ev.target as Element).closest('button, input')) return;
    const touch = ev.pointerType !== 'mouse';
    const d: Drag = { tile, pointerId: ev.pointerId, touch, startX: ev.clientX, startY: ev.clientY, x: ev.clientX, y: ev.clientY, active: false, hold: null, frame: null };
    drag = d;
    if (touch) d.hold = window.setTimeout(() => drag === d && beginDrag(d), HOLD_MS);
    // On the window, not the tile: the tile moves in the page as it is dragged, and a moved element loses its pointer capture.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.pointerId === drag?.pointerId) endDrag(true);
  };
  const onPointerCancel = (ev: PointerEvent) => {
    if (ev.pointerId === drag?.pointerId) endDrag(false);
  };
  function unlisten(): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(ev: PointerEvent): void {
    const d = drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    d.x = ev.clientX;
    d.y = ev.clientY;
    const far = Math.hypot(d.x - d.startX, d.y - d.startY);
    if (!d.active) {
      // A finger that moves before the hold is up is scrolling, not dragging.
      if (d.touch && far > 10) endDrag(false);
      else if (!d.touch && far > DRAG_SLOP) beginDrag(d);
      return;
    }
    ev.preventDefault();
    track(d);
  }

  // A finger already dragging must not also scroll the page.
  const stopScroll = (ev: TouchEvent) => {
    if (drag?.active) ev.preventDefault();
  };

  function onKey(tile: Tile, ev: KeyboardEvent): void {
    const from = tiles.indexOf(tile);
    let to: number | null = null;
    if (ev.altKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp')) to = from - 1;
    else if (ev.altKey && (ev.key === 'ArrowRight' || ev.key === 'ArrowDown')) to = from + 1;
    else if (ev.target === tile.root && ev.key === 'Home') to = 0;
    else if (ev.target === tile.root && ev.key === 'End') to = tiles.length - 1;
    else if (ev.target === tile.root && selecting && (ev.key === ' ' || ev.key === 'Enter')) {
      ev.preventDefault();
      toggleSelected(tile);
      return;
    } else if (ev.key === 'Escape' && drag?.active) {
      endDrag(false);
      return;
    }
    if (to === null) return;
    ev.preventDefault();
    if (to < 0 || to >= tiles.length || to === from) return;
    place(tile, to);
    sync();
    moved(tile);
    tile.root.focus();
  }

  function toggleSelected(tile: Tile): void {
    tile.selected = !tile.selected;
    sync();
  }

  function makeTile(source: number, base: Rotation): Tile {
    const canvas = el('canvas', { class: 'page-thumb', testid: 'page-thumb', attrs: { width: '1', height: '1', 'aria-hidden': 'true' } });
    canvas.hidden = true;
    const number = el('span', { class: 'page-tile__number', text: String(source + 1) });
    const pick = el('input', { class: 'page-tile__pick', testid: 'page-select', attrs: { type: 'checkbox', 'aria-label': `Select page ${source + 1}` } });
    pick.hidden = true;
    const thumb = el('div', { class: 'page-tile__thumb' }, [canvas, number, pick]);
    const control = (testid: string, label: string, glyph: string, onClick: () => void) =>
      el('button', { class: 'icon-button', testid, attrs: { type: 'button', 'aria-label': label }, on: { click: onClick } }, [icon(glyph)]);
    const tile: Tile = {
      source,
      base,
      turns: 0,
      deleted: false,
      selected: false,
      rendered: false,
      root: el('li', { class: 'page-tile', testid: 'page-tile', attrs: { 'data-source': String(source), tabindex: '0' } }),
      thumb,
      canvas,
      number,
      pick,
      up: control('page-move-up', 'Move earlier', ICONS.left, () => move(tile, -1)),
      down: control('page-move-down', 'Move later', ICONS.right, () => move(tile, 1)),
      toggle: control('page-delete', 'Delete page', ICONS.trash, () => {
        tile.deleted = !tile.deleted;
        sync();
        say(`Page ${tile.source + 1} ${tile.deleted ? 'deleted' : 'brought back'}.`);
      }),
    };
    pick.addEventListener('change', () => {
      tile.selected = pick.checked;
      sync();
    });
    const rotate = control('page-rotate', 'Rotate a quarter turn', ICONS.rotate, () => {
      tile.turns = (tile.turns + 1) % 4;
      sync();
    });
    tile.root.append(thumb, el('div', { class: 'page-tile__controls' }, [tile.up, rotate, tile.toggle, tile.down]));
    tile.root.addEventListener('pointerdown', (ev) => onPointerDown(tile, ev));
    tile.root.addEventListener('touchmove', stopScroll, { passive: false });
    // Holding a finger on a picture would otherwise open the browser's own menu.
    tile.root.addEventListener('contextmenu', (ev) => {
      if (drag) ev.preventDefault();
    });
    tile.root.addEventListener('keydown', (ev) => onKey(tile, ev));
    thumb.addEventListener('click', (ev) => {
      if (swallowClick || !selecting || ev.target === pick) return;
      toggleSelected(tile);
    });
    return tile;
  }

  function enqueue(tile: Tile): void {
    if (tile.rendered || pending.includes(tile)) return;
    pending.push(tile);
    void pump();
  }

  async function pump(): Promise<void> {
    while (inFlight < RENDER_CONCURRENCY && pending.length > 0) {
      const tile = pending.shift();
      if (!tile) return;
      inFlight += 1;
      void renderTile(tile).finally(() => {
        inFlight -= 1;
        void pump();
      });
    }
  }

  async function renderTile(tile: Tile): Promise<void> {
    const current = view;
    const signal = abort.signal;
    if (!current || tile.rendered || signal.aborted) return;
    tile.rendered = true;
    const cssWidth = Math.max(1, tile.thumb.clientWidth || 150);
    const width = Math.round(cssWidth * Math.min(MAX_DPR, window.devicePixelRatio || 1));
    try {
      const bitmap = await current.render(tile.source, { width, signal });
      if (signal.aborted) {
        bitmap.close();
        return;
      }
      tile.canvas.width = bitmap.width;
      tile.canvas.height = bitmap.height;
      const ctx = tile.canvas.getContext('2d');
      if (ctx) ctx.drawImage(bitmap, 0, 0);
      // Drawn into the canvas; the bitmap itself is no longer needed.
      bitmap.close();
      tile.canvas.hidden = false;
      const rect = tile.canvas.getBoundingClientRect();
      tile.canvas.dataset['w'] = String(rect.width);
      tile.canvas.dataset['h'] = String(rect.height);
      applyTurns(tile);
    } catch {
      // A page that cannot be drawn still has a tile; the number marks it. Nothing to log.
      tile.rendered = false;
      if (!signal.aborted) tile.thumb.classList.add('page-tile__thumb--failed');
    }
  }

  async function destroy(): Promise<void> {
    abort.abort();
    endDrag(false);
    observer?.disconnect();
    observer = null;
    pending.length = 0;
    tiles = [];
    clear(list);
    root.hidden = true;
    if (selecting) setSelecting(false);
    const closing = view;
    view = null;
    if (closing) await closing.close();
  }

  return {
    root,
    async load(next) {
      await destroy();
      abort = new AbortController();
      view = next;
      const infos = await Promise.all(Array.from({ length: next.pageCount }, (_, i) => next.page(i)));
      tiles = infos.map((info) => makeTile(info.index, info.rotation));
      list.append(...tiles.map((t) => t.root));
      root.hidden = false;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const tile = tiles.find((t) => t.root === entry.target);
            if (tile) {
              enqueue(tile);
              observer?.unobserve(entry.target);
            }
          }
        },
        { rootMargin: '200px' },
      );
      for (const tile of tiles) observer.observe(tile.root);
      sync();
    },
    params() {
      return { pages: tiles.filter((t) => !t.deleted).map((t) => ({ source: t.source, rotation: rotationOf(t) })) };
    },
    count() {
      return tiles.filter((t) => !t.deleted).length;
    },
    destroy,
  };
}
