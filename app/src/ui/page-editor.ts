/**
 * One page at a time, drawn large, with a layer on top you can touch: the
 * shared editor behind Sign, Add text, Mark up and Remove areas. What you put
 * on it is kept as fractions of the page as you see it (top-left origin), so
 * the surgeon in the worker can draw it at any scale and any /Rotate.
 *
 * Gestures, kept to the two anybody already knows: tap to put something
 * down, drag to draw or move. Whatever is selected gets a × to take it off.
 */
import type { MarksParams, RemoveAreasParams } from '../ops/op';
import type { Area, Mark, PdfView, Rgb } from '../pdf/types';
import { el } from './dom';
import { choices, note } from './fields';

export type EditorMode = 'sign' | 'add-text' | 'mark-up' | 'remove-areas';

export interface PageEditor {
  readonly root: HTMLElement;
  /** Takes ownership of `view`; closes it on `destroy()` or the next `load()`. */
  load(view: PdfView): Promise<void>;
  params(): MarksParams | RemoveAreasParams;
  /** Why the run cannot start yet, or null. */
  problem(): string | null;
  destroy(): Promise<void>;
}

type Item =
  | { kind: 'image'; area: MutableArea; png: Uint8Array; src: string; el: HTMLElement }
  | { kind: 'text'; area: MutableArea; text: string; size: number; color: Rgb; el: HTMLElement }
  | { kind: 'highlight'; area: MutableArea; color: Rgb; el: HTMLElement }
  | { kind: 'cover'; area: MutableArea; el: HTMLElement }
  | { kind: 'ink'; page: number; points: number[]; width: number; color: Rgb; el: SVGPolylineElement };

interface MutableArea {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SVG = 'http://www.w3.org/2000/svg';
const MAX_DPR = 2;
/** The tallest the page may be drawn, as a share of the window: room is left to scroll past it on a phone. */
const MAX_HEIGHT = 0.68;

const INKS: Record<'black' | 'blue', Rgb> = { black: [0.08, 0.08, 0.1], blue: [0.07, 0.25, 0.75] };
const PENS: Record<'black' | 'blue' | 'red', Rgb> = { black: [0.08, 0.08, 0.1], blue: [0.07, 0.25, 0.75], red: [0.8, 0.1, 0.12] };
const MARKERS: Record<'yellow' | 'green' | 'pink', Rgb> = { yellow: [1, 0.9, 0.2], green: [0.55, 0.95, 0.45], pink: [1, 0.6, 0.8] };
const SIZES: Record<'small' | 'medium' | 'large', number> = { small: 0.024, medium: 0.034, large: 0.05 };
const TEXT_FONT = 'Helvetica, Arial, sans-serif';

/** What the built-in PDF font can draw (Windows-1252). Anything else goes in as a picture of the words. */
const WIN_ANSI = /^[\n\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/;

const css = (rgbValue: Rgb, alpha = 1): string =>
  `rgba(${Math.round(rgbValue[0] * 255)}, ${Math.round(rgbValue[1] * 255)}, ${Math.round(rgbValue[2] * 255)}, ${alpha})`;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function createPageEditor(mode: EditorMode, onChange: () => void): PageEditor {
  let view: PdfView | null = null;
  let current = 0;
  let pageAspect = 1; // height / width, as seen
  const aspects = new Map<number, number>();
  let items: Item[] = [];
  let selected: Item | null = null;
  let renderToken = 0;

  // ---- The page ----
  const canvas = el('canvas', { class: 'editor__canvas', attrs: { 'aria-hidden': 'true' } });
  const ink = document.createElementNS(SVG, 'svg');
  ink.setAttribute('class', 'editor__ink');
  ink.setAttribute('viewBox', '0 0 1000 1000');
  ink.setAttribute('preserveAspectRatio', 'none');
  ink.setAttribute('aria-hidden', 'true');
  const layer = el('div', { class: 'editor__layer', testid: 'editor-layer', attrs: { role: 'application', 'aria-label': 'The page. Tap or drag on it.' } });
  const sheet = el('div', { class: 'editor__page', testid: 'editor-page' }, [canvas, ink, layer]);
  const stage = el('div', { class: 'editor__stage' }, [sheet]);

  // ---- The bar: pages and undo ----
  const prev = el('button', { class: 'button button--ghost button--small editor__step', testid: 'editor-prev', text: '‹', attrs: { type: 'button', 'aria-label': 'Previous page' } });
  const next = el('button', { class: 'button button--ghost button--small editor__step', testid: 'editor-next', text: '›', attrs: { type: 'button', 'aria-label': 'Next page' } });
  const where = el('span', { class: 'editor__where', testid: 'editor-where', attrs: { 'aria-live': 'polite' } });
  const undo = el('button', { class: 'button button--ghost button--small', testid: 'editor-undo', text: 'Undo', attrs: { type: 'button' } });
  const bar = el('div', { class: 'editor__bar' }, [prev, where, next, undo]);
  const hint = el('p', { class: 'editor__hint', testid: 'editor-hint' });

  // ---- The tools above the page, by mode ----
  const tools = el('div', { class: 'editor__tools' });
  const root = el('section', { class: 'editor', testid: 'page-editor', attrs: { 'data-mode': mode, 'aria-label': 'Page editor' } }, [tools, bar, stage, hint]);
  root.hidden = true;

  // Sign: a pad to draw on.
  let signature: { png: Uint8Array; src: string; aspect: number } | null = null;
  let inkChoice: ReturnType<typeof choices<'black' | 'blue'>> | null = null;
  // Add text.
  let textBox: HTMLTextAreaElement | null = null;
  let sizeChoice: ReturnType<typeof choices<'small' | 'medium' | 'large'>> | null = null;
  let penChoice: ReturnType<typeof choices<'black' | 'blue' | 'red'>> | null = null;
  // Mark up.
  let toolChoice: ReturnType<typeof choices<'highlight' | 'pen'>> | null = null;
  let markerChoice: ReturnType<typeof choices<'yellow' | 'green' | 'pink'>> | null = null;

  if (mode === 'sign') {
    const pad = el('canvas', { class: 'pad__canvas', testid: 'signature-pad', attrs: { width: '900', height: '300', 'aria-label': 'Draw your signature here' } });
    const clear = el('button', { class: 'button button--ghost button--small', testid: 'signature-clear', text: 'Clear', attrs: { type: 'button' } });
    inkChoice = choices<'black' | 'blue'>('ink', 'Ink', [{ value: 'black', title: 'Black' }, { value: 'blue', title: 'Blue' }], 'blue', () => undefined, 'pills');
    const padBox = el('div', { class: 'pad' }, [
      el('div', { class: 'pad__head' }, [el('span', { class: 'field__label', text: 'Draw your signature' }), clear]),
      el('div', { class: 'pad__area' }, [pad, el('span', { class: 'pad__line', attrs: { 'aria-hidden': 'true' } })]),
    ]);
    tools.append(padBox, inkChoice.root);
    bindPad(pad, () => inkChoice?.value() ?? 'blue', (made) => {
      signature = made;
      onChange();
      sync();
    });
    clear.addEventListener('click', () => {
      const c = pad.getContext('2d');
      c?.clearRect(0, 0, pad.width, pad.height);
      signature = null;
      onChange();
      sync();
    });
  } else if (mode === 'add-text') {
    textBox = el('textarea', { class: 'input', testid: 'opt-text', attrs: { id: 'opt-text', rows: '2', placeholder: 'Your name, a date, an answer…' } });
    const label = el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'What to write' }), textBox]);
    sizeChoice = choices<'small' | 'medium' | 'large'>('size', 'Size', [{ value: 'small', title: 'Small' }, { value: 'medium', title: 'Medium' }, { value: 'large', title: 'Large' }], 'medium', () => restyleSelected(), 'pills');
    penChoice = choices<'black' | 'blue' | 'red'>('color', 'Colour', [{ value: 'black', title: 'Black' }, { value: 'blue', title: 'Blue' }, { value: 'red', title: 'Red' }], 'black', () => restyleSelected(), 'pills');
    tools.append(label, el('div', { class: 'field-row' }, [sizeChoice.root, penChoice.root]));
    textBox.addEventListener('input', () => {
      if (selected?.kind === 'text' && textBox) {
        selected.text = textBox.value;
        paintText(selected);
        onChange();
      }
    });
  } else if (mode === 'mark-up') {
    toolChoice = choices<'highlight' | 'pen'>('tool', 'Tool', [{ value: 'highlight', title: 'Highlighter' }, { value: 'pen', title: 'Pen' }], 'highlight', () => sync(), 'pills');
    markerChoice = choices<'yellow' | 'green' | 'pink'>('marker', 'Highlighter colour', [{ value: 'yellow', title: 'Yellow' }, { value: 'green', title: 'Green' }, { value: 'pink', title: 'Pink' }], 'yellow', () => undefined, 'pills');
    penChoice = choices<'black' | 'blue' | 'red'>('pen', 'Pen colour', [{ value: 'black', title: 'Black' }, { value: 'blue', title: 'Blue' }, { value: 'red', title: 'Red' }], 'blue', () => undefined, 'pills');
    tools.append(el('div', { class: 'field-row' }, [toolChoice.root, markerChoice.root, penChoice.root]));
  } else {
    tools.append(
      note('Drag across anything that should go: a number, a name, a photo. Every page you mark becomes a picture of itself with those parts painted out, so the hidden words cannot be copied, searched or recovered. Its other text stops being selectable too.'),
    );
  }

  function sync(): void {
    const n = view?.pageCount ?? 0;
    where.textContent = n > 0 ? `Page ${current + 1} of ${n}` : '';
    prev.disabled = current <= 0;
    next.disabled = current >= n - 1;
    prev.hidden = next.hidden = n <= 1;
    undo.disabled = items.length === 0;
    hint.textContent = hintText();
    if (mode === 'mark-up') root.dataset['tool'] = toolChoice?.value() ?? 'highlight';
  }

  function hintText(): string {
    switch (mode) {
      case 'sign':
        return signature === null ? 'Draw your signature in the box, then tap the page where it goes.' : 'Tap the page to put your signature there. Drag it to move it; drag its corner to resize.';
      case 'add-text':
        return 'Tap the page where the words go. Tap them again to change them, or drag to move them.';
      case 'mark-up':
        return toolChoice?.value() === 'pen' ? 'Draw on the page with your finger or mouse.' : 'Drag across the words to highlight them.';
      case 'remove-areas':
        return 'Drag across each part that should go.';
    }
  }

  // ---- Drawing the current page ----

  async function show(index: number): Promise<void> {
    if (!view) return;
    current = clamp(index, 0, view.pageCount - 1);
    select(null);
    const token = ++renderToken;
    const info = await view.page(current);
    const sideways = info.rotation === 90 || info.rotation === 270;
    const w = sideways ? info.height : info.width;
    const h = sideways ? info.width : info.height;
    pageAspect = h / w;
    aspects.set(current, pageAspect);
    const room = Math.max(240, stage.clientWidth || root.clientWidth || 320);
    const cssW = Math.floor(Math.min(room, 760, (window.innerHeight * MAX_HEIGHT) / pageAspect));
    sheet.style.setProperty('width', `${cssW}px`);
    sheet.style.setProperty('height', `${Math.round(cssW * pageAspect)}px`);
    sheet.style.setProperty('--page-w', `${cssW}px`);
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    try {
      const bitmap = await view.render(current, { width: Math.round(cssW * dpr) });
      if (token !== renderToken) {
        bitmap.close();
        return;
      }
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
    } catch {
      // The page stays blank; the marks can still be placed and the op will say if the file is unreadable.
    }
    placeAll();
    sync();
  }

  function placeAll(): void {
    layer.replaceChildren();
    ink.replaceChildren();
    for (const item of items) {
      const page = item.kind === 'ink' ? item.page : item.area.page;
      if (page !== current) continue;
      if (item.kind === 'ink') ink.append(item.el);
      else {
        layer.append(item.el);
        position(item);
        if (item.kind === 'text') paintText(item);
      }
    }
  }

  function position(item: Exclude<Item, { kind: 'ink' }>): void {
    const { x, y, w, h } = item.area;
    item.el.style.setProperty('left', `${x * 100}%`);
    item.el.style.setProperty('top', `${y * 100}%`);
    if (item.kind !== 'text') {
      item.el.style.setProperty('width', `${w * 100}%`);
      item.el.style.setProperty('height', `${h * 100}%`);
    }
  }

  function paintText(item: Extract<Item, { kind: 'text' }>): void {
    const body = item.el.querySelector<HTMLElement>('.editor__words');
    if (body) body.textContent = item.text.length > 0 ? item.text : ' ';
    item.el.style.setProperty('--size', String(item.size));
    item.el.style.setProperty('color', css(item.color));
    // The text box's size follows its words.
    const box = sheet.getBoundingClientRect();
    const own = item.el.getBoundingClientRect();
    if (box.width > 0) {
      item.area.w = own.width / box.width;
      item.area.h = own.height / box.height;
    }
  }

  function restyleSelected(): void {
    if (selected?.kind !== 'text') return;
    selected.size = SIZES[sizeChoice?.value() ?? 'medium'];
    selected.color = PENS[penChoice?.value() ?? 'black'];
    paintText(selected);
    onChange();
  }

  function select(item: Item | null): void {
    if (selected && selected.kind !== 'ink') selected.el.classList.remove('is-selected');
    selected = item;
    if (item && item.kind !== 'ink') item.el.classList.add('is-selected');
    if (item?.kind === 'text' && textBox) textBox.value = item.text;
  }

  function remove(item: Item): void {
    items = items.filter((i) => i !== item);
    item.el.remove();
    if (selected === item) selected = null;
    onChange();
    sync();
  }

  // ---- Making items ----

  function boxElement(kind: string, label: string): HTMLElement {
    const box = el('div', { class: `editor__item editor__item--${kind}`, testid: `editor-item`, attrs: { 'data-kind': kind, tabindex: '0', role: 'group', 'aria-label': label } });
    const x = el('button', { class: 'editor__remove', testid: 'editor-remove', text: '×', attrs: { type: 'button', 'aria-label': `Remove this ${label.toLowerCase()}` } });
    box.append(x);
    return box;
  }

  function addItem(item: Item): void {
    items.push(item);
    if (item.kind === 'ink') ink.append(item.el);
    else {
      layer.append(item.el);
      position(item);
      if (item.kind === 'text') paintText(item);
      wireItem(item);
    }
    select(item);
    onChange();
    sync();
  }

  function wireItem(item: Exclude<Item, { kind: 'ink' }>): void {
    const remover = item.el.querySelector<HTMLButtonElement>('.editor__remove');
    remover?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      remove(item);
    });
    remover?.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    item.el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        remove(item);
      }
    });
    item.el.addEventListener('focus', () => select(item));
    const handle = item.el.querySelector<HTMLElement>('.editor__resize');
    item.el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      select(item);
      if (item.kind === 'text') textBox?.focus({ preventScroll: true });
      const resizing = handle !== null && ev.target === handle;
      drag(ev, item.el, (dx, dy, start) => {
        if (resizing && item.kind === 'image') {
          const w = clamp(start.w + dx, 0.05, 1 - item.area.x);
          item.area.w = w;
          item.area.h = (w * start.h) / start.w;
        } else {
          item.area.x = clamp(start.x + dx, 0, 1 - item.area.w);
          item.area.y = clamp(start.y + dy, 0, 1 - item.area.h);
        }
        position(item);
      });
    });
  }

  /** Follows one pointer from `ev` until it lifts; `move` gets the travel in page fractions. */
  function drag(ev: PointerEvent, target: Element, move: (dx: number, dy: number, start: MutableArea) => void, end?: () => void): void {
    const box = sheet.getBoundingClientRect();
    const owner = selected && selected.kind !== 'ink' ? selected : null;
    const start: MutableArea = owner ? { ...owner.area } : { page: current, x: 0, y: 0, w: 0, h: 0 };
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    target.setPointerCapture?.(ev.pointerId);
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      move((e.clientX - x0) / box.width, (e.clientY - y0) / box.height, start);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      target.removeEventListener('pointermove', onMove as EventListener);
      target.removeEventListener('pointerup', onUp as EventListener);
      target.removeEventListener('pointercancel', onUp as EventListener);
      end?.();
      onChange();
    };
    target.addEventListener('pointermove', onMove as EventListener);
    target.addEventListener('pointerup', onUp as EventListener);
    target.addEventListener('pointercancel', onUp as EventListener);
  }

  const pointAt = (ev: PointerEvent): [number, number] => {
    const box = sheet.getBoundingClientRect();
    return [clamp((ev.clientX - box.left) / box.width, 0, 1), clamp((ev.clientY - box.top) / box.height, 0, 1)];
  };

  layer.addEventListener('pointerdown', (ev) => {
    if (!view || ev.button > 0) return;
    ev.preventDefault();
    const [px, py] = pointAt(ev);
    select(null);
    switch (mode) {
      case 'sign': {
        if (signature === null) {
          hint.textContent = 'Draw your signature in the box first.';
          return;
        }
        const w = 0.32;
        const h = (w / signature.aspect) / pageAspect;
        const area: MutableArea = { page: current, x: clamp(px - w / 2, 0, 1 - w), y: clamp(py - h / 2, 0, 1 - h), w, h };
        const box = boxElement('image', 'Signature');
        box.prepend(el('img', { class: 'editor__img', attrs: { src: signature.src, alt: '' } }));
        box.append(el('span', { class: 'editor__resize', attrs: { 'aria-hidden': 'true' } }));
        addItem({ kind: 'image', area, png: signature.png, src: signature.src, el: box });
        return;
      }
      case 'add-text': {
        const text = textBox?.value.trim() ? textBox.value : 'Your text';
        if (textBox && !textBox.value.trim()) textBox.value = text;
        const box = boxElement('text', 'Text');
        box.prepend(el('span', { class: 'editor__words' }));
        const item: Item = { kind: 'text', area: { page: current, x: px, y: py, w: 0, h: 0 }, text, size: SIZES[sizeChoice?.value() ?? 'medium'], color: PENS[penChoice?.value() ?? 'black'], el: box };
        addItem(item);
        // Keep it on the page once its real width is known.
        item.area.x = clamp(item.area.x, 0, Math.max(0, 1 - item.area.w));
        item.area.y = clamp(item.area.y, 0, Math.max(0, 1 - item.area.h));
        position(item);
        textBox?.focus({ preventScroll: true });
        textBox?.select();
        return;
      }
      case 'mark-up':
        if (toolChoice?.value() === 'pen') {
          const line = document.createElementNS(SVG, 'polyline');
          const color = PENS[penChoice?.value() ?? 'blue'];
          line.setAttribute('class', 'editor__stroke');
          line.setAttribute('stroke', css(color));
          const item: Extract<Item, { kind: 'ink' }> = { kind: 'ink', page: current, points: [px, py], width: 0.004, color, el: line };
          const redraw = () => line.setAttribute('points', pairs(item.points));
          redraw();
          line.style.setProperty('stroke-width', `calc(var(--page-w) * ${item.width})`);
          items.push(item);
          ink.append(line);
          drag(ev, layer, (dx, dy) => {
            const x = clamp(px + dx, 0, 1);
            const y = clamp(py + dy, 0, 1);
            const lx = item.points[item.points.length - 2] ?? x;
            const ly = item.points[item.points.length - 1] ?? y;
            if (Math.hypot(x - lx, (y - ly) * pageAspect) < 0.003) return;
            item.points.push(x, y);
            redraw();
          }, () => sync());
          onChange();
          return;
        }
        rect(ev, px, py, 'highlight');
        return;
      case 'remove-areas':
        rect(ev, px, py, 'cover');
    }
  });

  /** Drag out a rectangle from (px, py); a tap that makes no area makes nothing. */
  function rect(ev: PointerEvent, px: number, py: number, kind: 'highlight' | 'cover'): void {
    const color = MARKERS[markerChoice?.value() ?? 'yellow'];
    const box = boxElement(kind, kind === 'cover' ? 'Area to remove' : 'Highlight');
    if (kind === 'highlight') box.style.setProperty('background-color', css(color, 0.45));
    const area: MutableArea = { page: current, x: px, y: py, w: 0, h: 0 };
    const item: Item = kind === 'cover' ? { kind, area, el: box } : { kind, area, color, el: box };
    layer.append(box);
    position(item);
    drag(ev, layer, (dx, dy) => {
      const x2 = clamp(px + dx, 0, 1);
      const y2 = clamp(py + dy, 0, 1);
      area.x = Math.min(px, x2);
      area.y = Math.min(py, y2);
      area.w = Math.abs(x2 - px);
      area.h = Math.abs(y2 - py);
      position(item);
    }, () => {
      if (area.w < 0.008 || area.h < 0.004) {
        box.remove();
        return;
      }
      items.push(item);
      wireItem(item);
      select(item);
      sync();
    });
  }

  prev.addEventListener('click', () => void show(current - 1));
  next.addEventListener('click', () => void show(current + 1));
  undo.addEventListener('click', () => {
    const last = items[items.length - 1];
    if (!last) return;
    if (last.kind !== 'ink' && last.area.page !== current) void show(last.area.page);
    else if (last.kind === 'ink' && last.page !== current) void show(last.page);
    remove(last);
  });

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => void show(current), 200);
  };
  window.addEventListener('resize', onResize);

  // ---- Out ----

  function marks(): Mark[] {
    const out: Mark[] = [];
    for (const item of items) {
      switch (item.kind) {
        case 'image':
          out.push({ kind: 'image', area: { ...item.area }, png: item.png });
          break;
        case 'highlight':
          out.push({ kind: 'highlight', area: { ...item.area }, color: item.color });
          break;
        case 'ink':
          out.push({ kind: 'ink', page: item.page, points: [...item.points], width: item.width, color: item.color });
          break;
        case 'text': {
          if (item.text.trim().length === 0) break;
          if (WIN_ANSI.test(item.text)) {
            out.push({ kind: 'text', area: { ...item.area }, text: item.text, size: item.size, color: item.color });
          } else {
            // Malayalam, Hindi, Arabic, emoji: the browser shapes them, and they go in as a picture of the words.
            const picture = textPicture(item.text, item.size, item.color, pageWidthPx(), aspects.get(item.area.page) ?? pageAspect);
            if (picture) out.push({ kind: 'image', area: { ...item.area, w: picture.w, h: picture.h }, png: picture.png });
          }
          break;
        }
        case 'cover':
          break;
      }
    }
    return out;
  }

  const pageWidthPx = (): number => sheet.getBoundingClientRect().width || 600;

  return {
    root,
    async load(next) {
      await view?.close();
      view = next;
      items = [];
      selected = null;
      root.hidden = false;
      await show(0);
    },
    params() {
      if (mode === 'remove-areas') {
        const areas: Area[] = items.filter((i): i is Extract<Item, { kind: 'cover' }> => i.kind === 'cover').map((i) => ({ ...i.area }));
        return { areas };
      }
      return { marks: marks() };
    },
    problem() {
      if (!view) return 'Opening the page…';
      if (items.length > 0) return null;
      switch (mode) {
        case 'sign':
          return signature === null ? 'Draw your signature, then tap the page where it goes.' : 'Tap the page where your signature goes.';
        case 'add-text':
          return 'Tap the page where the words go.';
        case 'mark-up':
          return 'Highlight or draw on the page first.';
        case 'remove-areas':
          return 'Drag across what should go.';
      }
    },
    async destroy() {
      window.removeEventListener('resize', onResize);
      root.hidden = true;
      items = [];
      layer.replaceChildren();
      ink.replaceChildren();
      const v = view;
      view = null;
      await v?.close();
    },
  };
}

const pairs = (points: readonly number[]): string => {
  let out = '';
  for (let i = 0; i + 1 < points.length; i += 2) out += `${((points[i] ?? 0) * 1000).toFixed(1)},${((points[i + 1] ?? 0) * 1000).toFixed(1)} `;
  return out;
};

/** The signature pad: draws with the pointer, and on each lift hands back the drawing trimmed to its ink. */
function bindPad(pad: HTMLCanvasElement, color: () => 'black' | 'blue', made: (s: { png: Uint8Array; src: string; aspect: number }) => void): void {
  const context = pad.getContext('2d');
  if (!context) return;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  let last: [number, number] | null = null;
  const at = (ev: PointerEvent): [number, number] => {
    const box = pad.getBoundingClientRect();
    return [((ev.clientX - box.left) / box.width) * pad.width, ((ev.clientY - box.top) / box.height) * pad.height];
  };
  pad.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    pad.setPointerCapture?.(ev.pointerId);
    last = at(ev);
    context.strokeStyle = css(INKS[color()]);
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(last[0], last[1]);
    context.lineTo(last[0] + 0.1, last[1] + 0.1);
    context.stroke();
  });
  pad.addEventListener('pointermove', (ev) => {
    if (last === null) return;
    const point = at(ev);
    context.beginPath();
    context.moveTo(last[0], last[1]);
    context.lineTo(point[0], point[1]);
    context.stroke();
    last = point;
  });
  const lift = () => {
    if (last === null) return;
    last = null;
    const trimmed = trim(pad);
    if (trimmed) made(trimmed);
  };
  pad.addEventListener('pointerup', lift);
  pad.addEventListener('pointercancel', lift);
}

/** The pad's drawing cut to its ink plus a little air, as PNG bytes and a data URL to show it. */
function trim(pad: HTMLCanvasElement): { png: Uint8Array; src: string; aspect: number } | null {
  const context = pad.getContext('2d');
  if (!context) return null;
  const { width, height } = pad;
  const data = context.getImageData(0, 0, width, height).data;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad8 = 8;
  x0 = Math.max(0, x0 - pad8);
  y0 = Math.max(0, y0 - pad8);
  x1 = Math.min(width - 1, x1 + pad8);
  y1 = Math.min(height - 1, y1 + pad8);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')?.drawImage(pad, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const src = out.toDataURL('image/png');
  return { png: fromDataUrl(src), src, aspect: out.width / out.height };
}

/** Words in a script the PDF font cannot draw, drawn by the browser instead, at three times the page's size on screen. */
function textPicture(text: string, size: number, color: Rgb, pageWidthPx: number, aspect: number): { png: Uint8Array; w: number; h: number } | null {
  const scale = 3;
  const px = size * pageWidthPx * scale;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.font = `${px}px ${TEXT_FONT}`;
  const width = Math.max(1, ...lines.map((l) => Math.ceil(probe.measureText(l).width)));
  const lineHeight = px * 1.25;
  const out = document.createElement('canvas');
  out.width = width + 2;
  out.height = Math.ceil(lineHeight * lines.length);
  const context = out.getContext('2d');
  if (!context) return null;
  context.font = `${px}px ${TEXT_FONT}`;
  context.fillStyle = css(color);
  context.textBaseline = 'middle';
  lines.forEach((line, i) => context.fillText(line, 1, lineHeight * (i + 0.5)));
  const total = pageWidthPx * scale;
  return { png: fromDataUrl(out.toDataURL('image/png')), w: out.width / total, h: out.height / (total * aspect) };
}

function fromDataUrl(url: string): Uint8Array {
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
