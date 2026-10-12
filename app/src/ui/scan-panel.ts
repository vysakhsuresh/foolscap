/**
 * Scan: each photo as a card, with the sheet of paper found in it and four
 * round handles on its corners to put right what the finder got wrong. A
 * "Turn" button for a page photographed sideways. Then one look for the lot
 * (colour, grey, black and white) and the paper it goes on.
 */
import type { FoolscapFile, Workspace } from '../files/types';
import type { ScanParams } from '../ops/op';
import { DEFAULT_CORNERS, findPaper, type Corners } from '../ops/scan-math';
import { el } from './dom';
import { choices, group, note } from './fields';

export interface ScanPanel {
  readonly root: HTMLElement;
  /** Brings the cards in line with the files, in their order. */
  sync(files: readonly FoolscapFile[], ws: Workspace): void;
  params(): ScanParams;
  problem(): string | null;
  destroy(): void;
}

interface Card {
  readonly id: string;
  readonly root: HTMLElement;
  corners: number[];
  turn: 0 | 90 | 180 | 270;
  ready: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';
/** The finder works on a copy this wide: big enough to see a sheet, small enough to be instant. */
const PROBE = 200;

export function createScanPanel(onChange: () => void): ScanPanel {
  const look = choices<ScanParams['look']>(
    'look',
    'Look',
    [
      { value: 'colour', title: 'Colour', hint: 'Stamps, photos and coloured ink kept.' },
      { value: 'grey', title: 'Grey', hint: 'Smaller, and kind to a printer.' },
      { value: 'bw', title: 'Black and white', hint: 'Crisp text, shadows gone. Best for letters and forms.' },
    ],
    'grey',
    onChange,
  );
  const paper = choices<ScanParams['paper']>('paper', 'Paper', [{ value: 'a4', title: 'A4' }, { value: 'letter', title: 'Letter' }, { value: 'fit', title: 'As photographed' }], 'a4', onChange, 'pills');
  const list = el('ol', { class: 'scan-list', testid: 'scan-list', attrs: { 'aria-label': 'Your pages' } });
  const root = el('section', { class: 'scan', attrs: { 'aria-label': 'Your pages' } }, [
    note('Drag the round handles onto the corners of the paper. The page is straightened and cleaned up when you make the PDF.'),
    list,
    group([look.root, paper.root]),
  ]);
  root.hidden = true;
  let cards: Card[] = [];

  function card(file: FoolscapFile, ws: Workspace): Card {
    const canvas = el('canvas', { class: 'scan-card__photo', attrs: { 'aria-hidden': 'true' } });
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'scan-card__frame');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS(SVG, 'polygon');
    svg.append(shape);
    const handles = ['top left', 'top right', 'bottom right', 'bottom left'].map((name, i) =>
      el('button', { class: 'scan-card__handle', testid: `scan-handle-${i}`, attrs: { type: 'button', 'aria-label': `Move the ${name} corner (arrow keys)` } }),
    );
    const stage = el('div', { class: 'scan-card__stage' }, [canvas, svg, ...handles]);
    const number = el('span', { class: 'scan-card__number' });
    const turn = el('button', { class: 'button button--ghost button--small', testid: 'scan-turn', text: 'Turn', attrs: { type: 'button', 'aria-label': 'Turn this page a quarter' } });
    const reset = el('button', { class: 'button button--ghost button--small', testid: 'scan-reset', text: 'Find the page again', attrs: { type: 'button' } });
    const rootEl = el('li', { class: 'scan-card', testid: 'scan-card', attrs: { 'data-id': file.id } }, [stage, el('div', { class: 'scan-card__bar' }, [number, turn, reset])]);
    const c: Card = { id: file.id, root: rootEl, corners: [...DEFAULT_CORNERS], turn: 0, ready: false };
    let found: Corners | null = null;

    const paint = () => {
      shape.setAttribute('points', [0, 1, 2, 3].map((i) => `${(c.corners[i * 2] ?? 0) * 1000},${(c.corners[i * 2 + 1] ?? 0) * 1000}`).join(' '));
      handles.forEach((h, i) => {
        h.style.setProperty('left', `${(c.corners[i * 2] ?? 0) * 100}%`);
        h.style.setProperty('top', `${(c.corners[i * 2 + 1] ?? 0) * 100}%`);
      });
      turn.textContent = c.turn === 0 ? 'Turn' : `Turned ${c.turn}°`;
      rootEl.dataset['turn'] = String(c.turn);
    };

    handles.forEach((handle, i) => {
      handle.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        handle.setPointerCapture?.(ev.pointerId);
        const box = canvas.getBoundingClientRect();
        const move = (e: PointerEvent) => {
          c.corners[i * 2] = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
          c.corners[i * 2 + 1] = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
          paint();
        };
        const up = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          onChange();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
      handle.addEventListener('keydown', (ev) => {
        const step = ev.shiftKey ? 0.05 : 0.01;
        const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
        const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
        if (dx === 0 && dy === 0) return;
        ev.preventDefault();
        c.corners[i * 2] = Math.min(1, Math.max(0, (c.corners[i * 2] ?? 0) + dx));
        c.corners[i * 2 + 1] = Math.min(1, Math.max(0, (c.corners[i * 2 + 1] ?? 0) + dy));
        paint();
        onChange();
      });
    });
    turn.addEventListener('click', () => {
      c.turn = ((c.turn + 90) % 360) as Card['turn'];
      paint();
      onChange();
    });
    reset.addEventListener('click', () => {
      c.corners = [...(found ?? DEFAULT_CORNERS)];
      paint();
      onChange();
    });

    paint();
    // Draw the photo, and look for the sheet in a small copy of it.
    void (async () => {
      try {
        const bitmap = await createImageBitmap(await ws.read(file));
        const width = Math.min(720, bitmap.width);
        const height = Math.round((bitmap.height * width) / bitmap.width);
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
        stage.style.setProperty('aspect-ratio', `${width} / ${height}`);
        const probe = document.createElement('canvas');
        probe.width = PROBE;
        probe.height = Math.max(1, Math.round((PROBE * bitmap.height) / bitmap.width));
        const pctx = probe.getContext('2d', { willReadFrequently: true });
        bitmap.close();
        if (pctx) {
          pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
          const rgba = pctx.getImageData(0, 0, probe.width, probe.height).data;
          const gray = new Uint8Array(probe.width * probe.height);
          for (let p = 0; p < gray.length; p++) gray[p] = (rgba[p * 4]! * 77 + rgba[p * 4 + 1]! * 150 + rgba[p * 4 + 2]! * 29) >> 8;
          found = findPaper(gray, probe.width, probe.height);
          if (found) c.corners = [...found];
        }
        rootEl.dataset['found'] = found ? 'true' : 'false';
      } catch {
        rootEl.dataset['found'] = 'false';
      }
      c.ready = true;
      paint();
      onChange();
    })();
    return c;
  }

  return {
    root,
    sync(files, ws) {
      const byId = new Map(cards.map((c) => [c.id, c]));
      const next = files.map((f) => byId.get(f.id) ?? card(f, ws));
      cards = next;
      list.replaceChildren(...cards.map((c) => c.root));
      cards.forEach((c, i) => {
        const n = c.root.querySelector('.scan-card__number');
        if (n) n.textContent = `Page ${i + 1}`;
      });
      root.hidden = cards.length === 0;
    },
    params: () => ({ pages: cards.map((c) => ({ corners: [...c.corners], turn: c.turn })), look: look.value(), paper: paper.value() }),
    problem: () => (cards.some((c) => !c.ready) ? 'Looking for the page in each photo…' : null),
    destroy() {
      cards = [];
      list.replaceChildren();
      root.hidden = true;
    },
  };
}
