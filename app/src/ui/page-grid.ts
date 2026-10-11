/**
 * The organise grid: one tile per page, thumbnails drawn lazily as tiles
 * scroll into view, and the output described by the tiles' order and state.
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
  rendered: boolean;
  readonly root: HTMLElement;
  readonly thumb: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly number: HTMLElement;
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

export function createPageGrid(onChange: () => void): PageGrid {
  const root = el('ol', { class: 'page-grid', testid: 'page-grid', attrs: { 'aria-label': 'Pages' } });
  let view: PdfView | null = null;
  let tiles: Tile[] = [];
  let abort = new AbortController();
  let observer: IntersectionObserver | null = null;
  const pending: Tile[] = [];
  let inFlight = 0;

  const rotationOf = (tile: Tile): Rotation => (((tile.base + tile.turns * 90) % 360) + 360) % 360 as Rotation;

  function sync(): void {
    tiles.forEach((tile, position) => {
      tile.root.dataset['rotation'] = String(rotationOf(tile));
      tile.root.dataset['deleted'] = tile.deleted ? 'true' : 'false';
      tile.root.setAttribute(
        'aria-label',
        `Page ${tile.source + 1}, now at position ${position + 1}${tile.deleted ? ', deleted' : ''}${tile.turns % 4 ? `, turned ${(tile.turns % 4) * 90} degrees` : ''}`,
      );
      tile.up.disabled = position === 0;
      tile.down.disabled = position === tiles.length - 1;
      tile.toggle.dataset['testid'] = tile.deleted ? 'page-restore' : 'page-delete';
      tile.toggle.setAttribute('aria-label', tile.deleted ? 'Restore page' : 'Delete page');
      tile.toggle.replaceChildren(icon(tile.deleted ? ICONS.restore : ICONS.trash));
      applyTurns(tile);
    });
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

  function move(tile: Tile, delta: -1 | 1): void {
    const from = tiles.indexOf(tile);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= tiles.length) return;
    const other = tiles[to];
    if (!other) return;
    tiles[to] = tile;
    tiles[from] = other;
    if (delta === -1) other.root.before(tile.root);
    else other.root.after(tile.root);
    sync();
    tile.root.querySelector<HTMLButtonElement>(delta === -1 ? '[data-testid="page-move-up"]' : '[data-testid="page-move-down"]')?.focus();
  }

  function makeTile(source: number, base: Rotation): Tile {
    const canvas = el('canvas', { class: 'page-thumb', testid: 'page-thumb', attrs: { width: '1', height: '1', 'aria-hidden': 'true' } });
    canvas.hidden = true;
    const number = el('span', { class: 'page-tile__number', text: String(source + 1) });
    const thumb = el('div', { class: 'page-tile__thumb' }, [canvas, number]);
    const button = (testid: string, label: string, glyph: string, onClick: () => void) =>
      el('button', { class: 'icon-button', testid, attrs: { type: 'button', 'aria-label': label }, on: { click: onClick } }, [icon(glyph)]);
    const tile: Tile = {
      source,
      base,
      turns: 0,
      deleted: false,
      rendered: false,
      root: el('li', { class: 'page-tile', testid: 'page-tile', attrs: { 'data-source': String(source) } }),
      thumb,
      canvas,
      number,
      up: button('page-move-up', 'Move earlier', ICONS.left, () => move(tile, -1)),
      down: button('page-move-down', 'Move later', ICONS.right, () => move(tile, 1)),
      toggle: button('page-delete', 'Delete page', ICONS.trash, () => {
        tile.deleted = !tile.deleted;
        sync();
      }),
    };
    const rotate = button('page-rotate', 'Rotate a quarter turn', ICONS.rotate, () => {
      tile.turns = (tile.turns + 1) % 4;
      sync();
    });
    tile.root.append(thumb, el('div', { class: 'page-tile__controls' }, [tile.up, rotate, tile.toggle, tile.down]));
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
    observer?.disconnect();
    observer = null;
    pending.length = 0;
    tiles = [];
    clear(root);
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
      root.append(...tiles.map((t) => t.root));
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
