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
import { measureLabel, type Area, type Mark, type PdfView, type Rgb } from '../pdf/types';
import { el } from './dom';
import { choices, field, note, select as selectField } from './fields';

export type EditorMode = 'sign' | 'add-text' | 'mark-up' | 'remove-areas' | 'add-image';

/** Everything Mark up can put on a page. */
export type MarkTool = 'highlight' | 'underline' | 'strike' | 'pen' | 'rect' | 'ellipse' | 'arrow' | 'line' | 'measure' | 'note' | 'stamp' | 'textbox' | 'link';

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
  | { kind: 'picture'; area: MutableArea; bytes: Uint8Array; format: 'jpeg' | 'png'; src: string; el: HTMLElement }
  | { kind: 'text'; area: MutableArea; text: string; size: number; color: Rgb; boxed: boolean; el: HTMLElement }
  | { kind: 'highlight'; area: MutableArea; color: Rgb; style: 'marker' | 'underline' | 'strike'; el: HTMLElement }
  | { kind: 'shape'; area: MutableArea; shape: 'rect' | 'ellipse'; color: Rgb; el: HTMLElement }
  | { kind: 'note'; area: MutableArea; text: string; color: Rgb; el: HTMLElement }
  | { kind: 'stamp'; area: MutableArea; text: string; color: Rgb; el: HTMLElement }
  | { kind: 'link'; area: MutableArea; url: string; el: HTMLElement }
  | { kind: 'cover'; area: MutableArea; el: HTMLElement }
  | { kind: 'ink'; page: number; points: number[]; width: number; color: Rgb; el: SVGPolylineElement }
  | {
      kind: 'line';
      page: number;
      from: [number, number];
      to: [number, number];
      end: 'none' | 'arrow' | 'measure';
      width: number;
      color: Rgb;
      el: SVGGElement;
      label: HTMLElement | null;
    };

/** Drawn in the SVG layer, not as boxes: they can be undone, not moved. */
type Vector = Extract<Item, { kind: 'ink' | 'line' }>;
type Boxed = Exclude<Item, Vector>;
const isVector = (item: Item): item is Vector => item.kind === 'ink' || item.kind === 'line';
const pageOfItem = (item: Item): number => (isVector(item) ? item.page : item.area.page);

const RECT_TOOLS = new Set<MarkTool>(['highlight', 'underline', 'strike', 'rect', 'ellipse', 'link']);
const LINE_TOOLS = new Set<MarkTool>(['arrow', 'line', 'measure']);
const STAMPS = ['APPROVED', 'PAID', 'RECEIVED', 'DRAFT', 'CONFIDENTIAL', 'URGENT', 'COPY', 'VOID'] as const;
/** Readers open a link only to these. */
const LINKABLE = /^(https?:\/\/|mailto:|tel:)\S+$/i;

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
  let dragging = false;

  // ---- The page ----
  const canvas = el('canvas', { class: 'editor__canvas', attrs: { 'aria-hidden': 'true' } });
  const ink = document.createElementNS(SVG, 'svg');
  ink.setAttribute('class', 'editor__ink');
  ink.setAttribute('viewBox', '0 0 1000 1000');
  ink.setAttribute('preserveAspectRatio', 'none');
  ink.setAttribute('aria-hidden', 'true');
  const layer = el('div', {
    class: 'editor__layer',
    testid: 'editor-layer',
    attrs: { role: 'application', tabindex: '0', 'aria-label': 'The page. Tap or drag on it, or press Enter to put something in the middle; arrow keys move what is selected.' },
  });
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
  let toolChoice: ReturnType<typeof choices<MarkTool>> | null = null;
  let markerChoice: ReturnType<typeof choices<'yellow' | 'green' | 'pink'>> | null = null;
  let stampChoice: ReturnType<typeof selectField<(typeof STAMPS)[number]>> | null = null;
  let linkField: ReturnType<typeof field> | null = null;
  let wordsRow: HTMLElement | null = null;
  // Add image: the picture chosen, ready to place.
  let chosen: { bytes: Uint8Array; format: 'jpeg' | 'png'; src: string; aspect: number } | null = null;
  /** Each page's size in points as seen, for measurements. */
  const pagePoints = new Map<number, { w: number; h: number }>();

  if (mode === 'sign') {
    const pad = el('canvas', { class: 'pad__canvas', testid: 'signature-pad', attrs: { width: '900', height: '300', 'aria-label': 'Draw your signature here' } });
    const clear = el('button', { class: 'button button--ghost button--small', testid: 'signature-clear', text: 'Clear', attrs: { type: 'button' } });
    inkChoice = choices<'black' | 'blue'>('ink', 'Ink', [{ value: 'black', title: 'Black' }, { value: 'blue', title: 'Blue' }], 'blue', () => undefined, 'pills');
    const padBox = el('div', { class: 'pad' }, [
      el('div', { class: 'pad__head' }, [el('span', { class: 'field__label', text: 'Draw your signature' }), clear]),
      el('div', { class: 'pad__area' }, [pad, el('span', { class: 'pad__line', attrs: { 'aria-hidden': 'true' } })]),
    ]);
    // Or typed: the name in a handwriting face, drawn on the same pad. For a
    // keyboard, a screen reader, or a hand that would rather not.
    const typed = el('input', {
      class: 'input',
      testid: 'signature-typed',
      attrs: { id: 'signature-typed', type: 'text', autocomplete: 'name', placeholder: 'Or type your name' },
    });
    tools.append(padBox, el('label', { class: 'field' }, [el('span', { class: 'visually-hidden', text: 'Or type your name' }), typed]), inkChoice.root);
    const take = (made: { png: Uint8Array; src: string; aspect: number } | null) => {
      signature = made;
      onChange();
      sync();
    };
    bindPad(pad, () => inkChoice?.value() ?? 'blue', (made) => {
      typed.value = '';
      take(made);
    });
    typed.addEventListener('input', () => {
      const c = pad.getContext('2d');
      if (!c) return;
      c.clearRect(0, 0, pad.width, pad.height);
      const name = typed.value.trim();
      if (name.length === 0) {
        take(null);
        return;
      }
      let size = 110;
      c.fillStyle = css(INKS[inkChoice?.value() ?? 'blue']);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      do {
        c.font = `italic 500 ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", "URW Chancery L", cursive`;
        size -= 6;
      } while (c.measureText(name).width > pad.width * 0.9 && size > 24);
      c.fillText(name, pad.width / 2, pad.height * 0.55);
      take(trim(pad));
    });
    clear.addEventListener('click', () => {
      const c = pad.getContext('2d');
      c?.clearRect(0, 0, pad.width, pad.height);
      typed.value = '';
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
    toolChoice = choices<MarkTool>(
      'tool',
      'Tool',
      [
        { value: 'highlight', title: 'Highlight' },
        { value: 'underline', title: 'Underline' },
        { value: 'strike', title: 'Strike out' },
        { value: 'pen', title: 'Pen' },
        { value: 'rect', title: 'Box' },
        { value: 'ellipse', title: 'Circle' },
        { value: 'arrow', title: 'Arrow' },
        { value: 'line', title: 'Line' },
        { value: 'measure', title: 'Measure' },
        { value: 'note', title: 'Note' },
        { value: 'textbox', title: 'Text box' },
        { value: 'stamp', title: 'Stamp' },
        { value: 'link', title: 'Link' },
      ],
      'highlight',
      () => sync(),
      'pills',
    );
    markerChoice = choices<'yellow' | 'green' | 'pink'>('marker', 'Highlighter colour', [{ value: 'yellow', title: 'Yellow' }, { value: 'green', title: 'Green' }, { value: 'pink', title: 'Pink' }], 'yellow', () => undefined, 'pills');
    penChoice = choices<'black' | 'blue' | 'red'>('pen', 'Colour', [{ value: 'black', title: 'Black' }, { value: 'blue', title: 'Blue' }, { value: 'red', title: 'Red' }], 'blue', () => restyleSelected(), 'pills');
    textBox = el('textarea', { class: 'input', testid: 'opt-words', attrs: { id: 'opt-words', rows: '2', placeholder: 'What the note or box says' } });
    wordsRow = el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Words' }), textBox]);
    stampChoice = selectField<(typeof STAMPS)[number]>('stamp', 'Stamp', STAMPS.map((v) => ({ value: v, title: v.charAt(0) + v.slice(1).toLowerCase() })), 'APPROVED', () => undefined);
    linkField = field('link', { label: 'Web address, email or phone', placeholder: 'https://… or mailto:… or tel:…' }, () => sync());
    tools.append(toolChoice.root, el('div', { class: 'field-row' }, [markerChoice.root, penChoice.root]), wordsRow, stampChoice.root, linkField.root);
    textBox.addEventListener('input', () => {
      if (!textBox) return;
      if (selected?.kind === 'text') {
        selected.text = textBox.value;
        paintText(selected);
        onChange();
      } else if (selected?.kind === 'note') {
        selected.text = textBox.value;
        selected.el.setAttribute('title', textBox.value);
        onChange();
      }
    });
  } else if (mode === 'add-image') {
    const input = el('input', { class: 'visually-hidden', testid: 'opt-picture', attrs: { id: 'opt-picture', type: 'file', accept: 'image/*' } });
    const preview = el('img', { class: 'picture-pick__preview', attrs: { alt: '' } });
    preview.hidden = true;
    const words = el('span', { class: 'picture-pick__words', text: 'Choose a photo, a logo or a stamp' });
    const pickLabel = el('label', { class: 'picture-pick', attrs: { for: 'opt-picture' } }, [preview, words, input]);
    tools.append(pickLabel, note('The picture goes onto the page as it is. A PNG with a see-through background keeps it; photos are kept sharp but light.'));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      words.textContent = 'Getting it ready…';
      void readPicture(file).then(
        (made) => {
          chosen = made;
          preview.src = made.src;
          preview.hidden = false;
          words.textContent = 'Now tap the page where it goes. Choose again to change it.';
          onChange();
          sync();
        },
        () => {
          words.textContent = "That picture couldn't be read. Try a JPEG or PNG.";
        },
      );
    });
  } else {
    tools.append(
      note('Drag across anything that should go: a number, a name, a photo. Every page you mark becomes a picture of itself with those parts painted out, so the hidden words cannot be copied, searched or recovered. Its other text stops being selectable, and any form answers on that page go too.'),
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
    if (mode === 'mark-up') {
      const tool = toolChoice?.value() ?? 'highlight';
      root.dataset['tool'] = tool;
      if (markerChoice) markerChoice.root.hidden = tool !== 'highlight';
      if (penChoice) penChoice.root.hidden = tool === 'highlight' || tool === 'link';
      if (wordsRow) wordsRow.hidden = tool !== 'note' && tool !== 'textbox' && selected?.kind !== 'note' && selected?.kind !== 'text';
      if (stampChoice) stampChoice.root.hidden = tool !== 'stamp';
      if (linkField) linkField.root.hidden = tool !== 'link';
    }
  }

  function hintText(): string {
    switch (mode) {
      case 'sign':
        return signature === null ? 'Draw your signature in the box, then tap the page where it goes.' : 'Tap the page to put your signature there. Drag it to move it; drag its corner to resize.';
      case 'add-text':
        return 'Tap the page where the words go. Tap them again to change them, or drag to move them.';
      case 'mark-up':
        switch (toolChoice?.value() ?? 'highlight') {
          case 'pen':
            return 'Draw on the page with your finger or mouse.';
          case 'highlight':
            return 'Drag across the words to highlight them.';
          case 'underline':
            return 'Drag across the words to underline them.';
          case 'strike':
            return 'Drag across the words to strike them out.';
          case 'rect':
          case 'ellipse':
            return 'Drag across what to ring.';
          case 'arrow':
            return 'Drag from where the arrow starts to what it points at.';
          case 'line':
            return 'Drag from one end of the line to the other.';
          case 'measure':
            return 'Drag from one point to another: the length on paper is written beside it.';
          case 'note':
            return 'Type the note above, then tap the page where it goes. Readers show it as a comment.';
          case 'textbox':
            return 'Type the words above, then tap the page where the box goes.';
          case 'stamp':
            return 'Pick a stamp, then tap the page where it goes. Drag its corner to size it.';
          case 'link':
            return LINKABLE.test(linkField?.value().trim() ?? '') ? 'Drag across the words or picture the link should sit on.' : 'Type the web address first, then drag across where the link goes.';
        }
        return '';
      case 'add-image':
        return chosen === null ? 'Choose a picture above, then tap the page where it goes.' : 'Tap the page to put the picture there. Drag it to move it; drag its corner to resize.';
      case 'remove-areas':
        return 'Drag across each part that should go.';
    }
  }

  // ---- Drawing the current page ----

  /** The width the page is drawn at, in CSS pixels, for a page of this shape. */
  const layoutWidth = (aspect: number): number =>
    Math.floor(Math.min(Math.max(240, stage.clientWidth || root.clientWidth || 320), 760, (window.innerHeight * MAX_HEIGHT) / aspect));
  let drawnWidth = 0;

  /**
   * Draws page `index`. `keep` holds on to the selection: a re-draw because
   * the window changed size (a phone's address bar sliding away does that)
   * must not take the words you are typing away from the text you placed.
   */
  async function show(index: number, keep = false): Promise<void> {
    if (!view) return;
    const target = clamp(index, 0, view.pageCount - 1);
    current = target;
    const held = keep ? selected : null;
    if (!keep) select(null);
    const token = ++renderToken;
    const info = await view.page(target);
    // A later show() has started since: its page, not this one, decides the shape.
    if (token !== renderToken) return;
    const sideways = info.rotation === 90 || info.rotation === 270;
    const w = sideways ? info.height : info.width;
    const h = sideways ? info.width : info.height;
    pageAspect = h / w;
    aspects.set(target, pageAspect);
    pagePoints.set(target, { w, h });
    const cssW = layoutWidth(pageAspect);
    drawnWidth = cssW;
    sheet.style.setProperty('width', `${cssW}px`);
    sheet.style.setProperty('height', `${Math.round(cssW * pageAspect)}px`);
    sheet.style.setProperty('--page-w', `${cssW}px`);
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    try {
      const bitmap = await view.render(target, { width: Math.round(cssW * dpr) });
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
    if (held && items.includes(held)) select(held);
    sync();
  }

  function placeAll(): void {
    layer.replaceChildren();
    ink.replaceChildren();
    for (const item of items) {
      if (pageOfItem(item) !== current) continue;
      if (isVector(item)) {
        ink.append(item.el);
        if (item.kind === 'line' && item.label) {
          layer.append(item.label);
          drawLine(item);
        }
      } else {
        layer.append(item.el);
        position(item);
        if (item.kind === 'text') paintText(item);
      }
    }
  }

  function position(item: Boxed): void {
    const { x, y, w, h } = item.area;
    item.el.style.setProperty('left', `${x * 100}%`);
    item.el.style.setProperty('top', `${y * 100}%`);
    if (item.kind !== 'text' && item.kind !== 'note') {
      item.el.style.setProperty('width', `${w * 100}%`);
      item.el.style.setProperty('height', `${h * 100}%`);
    }
  }

  function paintText(item: Extract<Item, { kind: 'text' }>): void {
    const body = item.el.querySelector<HTMLElement>('.editor__words');
    if (body) body.textContent = item.text.length > 0 ? item.text : ' ';
    item.el.style.setProperty('--size', String(item.size));
    item.el.style.setProperty('color', css(item.color));
    item.el.classList.toggle('editor__item--boxed', item.boxed);
    // The text box's size follows its words.
    const box = sheet.getBoundingClientRect();
    const own = item.el.getBoundingClientRect();
    if (box.width > 0) {
      item.area.w = own.width / box.width;
      item.area.h = own.height / box.height;
    }
  }

  function restyleSelected(): void {
    const pen = PENS[penChoice?.value() ?? 'black'];
    if (selected?.kind === 'text') {
      if (sizeChoice) selected.size = SIZES[sizeChoice.value()];
      selected.color = pen;
      paintText(selected);
      onChange();
    } else if (selected?.kind === 'shape' || selected?.kind === 'stamp' || selected?.kind === 'note') {
      selected.color = pen;
      selected.el.style.setProperty('--ink', css(pen));
      onChange();
    }
  }

  function select(item: Item | null): void {
    if (selected && !isVector(selected)) selected.el.classList.remove('is-selected');
    selected = item;
    if (item && !isVector(item)) item.el.classList.add('is-selected');
    if ((item?.kind === 'text' || item?.kind === 'note') && textBox) textBox.value = item.text;
    if (mode === 'mark-up') sync();
  }

  function remove(item: Item): void {
    items = items.filter((i) => i !== item);
    item.el.remove();
    if (item.kind === 'line') item.label?.remove();
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
    if (isVector(item)) ink.append(item.el);
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

  function wireItem(item: Boxed): void {
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
        layer.focus();
        return;
      }
      const step = ev.shiftKey ? 0.05 : 0.01;
      const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
      const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
      if (dx === 0 && dy === 0) return;
      ev.preventDefault();
      item.area.x = clamp(item.area.x + dx, 0, Math.max(0, 1 - item.area.w));
      item.area.y = clamp(item.area.y + dy, 0, Math.max(0, 1 - item.area.h));
      position(item);
      onChange();
    });
    item.el.addEventListener('focus', () => select(item));
    const handle = item.el.querySelector<HTMLElement>('.editor__resize');
    item.el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      select(item);
      if (item.kind === 'text' || item.kind === 'note') textBox?.focus({ preventScroll: true });
      const resizing = handle !== null && ev.target === handle;
      drag(ev, item.el, (dx, dy, start) => {
        if (resizing && (item.kind === 'image' || item.kind === 'picture' || item.kind === 'stamp')) {
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
    const owner = selected && !isVector(selected) ? selected : null;
    const start: MutableArea = owner ? { ...owner.area } : { page: current, x: 0, y: 0, w: 0, h: 0 };
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    target.setPointerCapture?.(ev.pointerId);
    dragging = true;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      move((e.clientX - x0) / box.width, (e.clientY - y0) / box.height, start);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      target.removeEventListener('pointermove', onMove as EventListener);
      target.removeEventListener('pointerup', onUp as EventListener);
      target.removeEventListener('pointercancel', onUp as EventListener);
      dragging = false;
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

  /** Puts a signature, a picture, text, a note or a stamp at (px, py). False when there is nothing to put down yet. */
  function placeAt(px: number, py: number): boolean {
    const tool = mode === 'mark-up' ? (toolChoice?.value() ?? 'highlight') : null;
    if (mode === 'sign' || mode === 'add-image') {
      const made = mode === 'sign' ? signature : chosen;
      if (made === null) {
        hint.textContent = mode === 'sign' ? 'Draw or type your signature in the box first.' : 'Choose a picture first.';
        return false;
      }
      const w = mode === 'sign' ? 0.32 : 0.4;
      const h = Math.min(0.9, (w / made.aspect) / pageAspect);
      const area: MutableArea = { page: current, x: clamp(px - w / 2, 0, 1 - w), y: clamp(py - h / 2, 0, 1 - h), w, h };
      const box = boxElement('image', mode === 'sign' ? 'Signature' : 'Picture');
      box.prepend(el('img', { class: 'editor__img', attrs: { src: made.src, alt: '' } }));
      box.append(el('span', { class: 'editor__resize', attrs: { 'aria-hidden': 'true' } }));
      if (mode === 'sign' && signature) addItem({ kind: 'image', area, png: signature.png, src: signature.src, el: box });
      else if (chosen) addItem({ kind: 'picture', area, bytes: chosen.bytes, format: chosen.format, src: chosen.src, el: box });
      return true;
    }
    if (mode === 'add-text' || tool === 'textbox') {
      const fallback = tool === 'textbox' ? 'Note this' : 'Your text';
      const text = textBox?.value.trim() ? textBox.value : fallback;
      if (textBox && !textBox.value.trim()) textBox.value = text;
      const box = boxElement('text', tool === 'textbox' ? 'Text box' : 'Text');
      box.prepend(el('span', { class: 'editor__words' }));
      const color = tool === 'textbox' ? PENS[penChoice?.value() ?? 'blue'] : PENS[penChoice?.value() ?? 'black'];
      const size = tool === 'textbox' ? SIZES.small : SIZES[sizeChoice?.value() ?? 'medium'];
      const item: Item = { kind: 'text', area: { page: current, x: px, y: py, w: 0, h: 0 }, text, size, color, boxed: tool === 'textbox', el: box };
      addItem(item);
      // Keep it on the page once its real width is known.
      item.area.x = clamp(item.area.x, 0, Math.max(0, 1 - item.area.w));
      item.area.y = clamp(item.area.y, 0, Math.max(0, 1 - item.area.h));
      position(item);
      textBox?.focus({ preventScroll: true });
      textBox?.select();
      return true;
    }
    if (tool === 'note') {
      const text = textBox?.value.trim() ? textBox.value : 'Note';
      if (textBox && !textBox.value.trim()) textBox.value = text;
      const w = 0.05;
      const h = w / pageAspect;
      const color = PENS[penChoice?.value() ?? 'blue'];
      const box = boxElement('note', 'Note');
      box.setAttribute('title', text);
      box.style.setProperty('--ink', css(color));
      addItem({ kind: 'note', area: { page: current, x: clamp(px, 0, 1 - w), y: clamp(py, 0, 1 - h), w, h }, text, color, el: box });
      textBox?.focus({ preventScroll: true });
      textBox?.select();
      return true;
    }
    if (tool === 'stamp') {
      const text = stampChoice?.value() ?? 'APPROVED';
      const w = Math.min(0.5, 0.06 + text.length * 0.026);
      const h = (w * 0.3) / pageAspect;
      const color = PENS[penChoice?.value() ?? 'red'];
      const box = boxElement('stamp', 'Stamp');
      box.prepend(el('span', { class: 'editor__stamp-words', text }));
      box.append(el('span', { class: 'editor__resize', attrs: { 'aria-hidden': 'true' } }));
      box.style.setProperty('--ink', css(color));
      addItem({ kind: 'stamp', area: { page: current, x: clamp(px - w / 2, 0, 1 - w), y: clamp(py - h / 2, 0, 1 - h), w, h }, text, color, el: box });
      return true;
    }
    return false;
  }

  layer.addEventListener('pointerdown', (ev) => {
    if (!view || ev.button > 0) return;
    ev.preventDefault();
    const [px, py] = pointAt(ev);
    select(null);
    switch (mode) {
      case 'sign':
      case 'add-text':
      case 'add-image':
        placeAt(px, py);
        return;
      case 'mark-up': {
        const tool = toolChoice?.value() ?? 'highlight';
        if (tool === 'pen') {
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
        if (RECT_TOOLS.has(tool)) {
          if (tool === 'link' && !LINKABLE.test(linkField?.value().trim() ?? '')) {
            hint.textContent = 'Type the web address first: https://…, mailto:… or tel:…';
            linkField?.input.focus();
            return;
          }
          rect(ev, px, py, tool as RectKind);
          return;
        }
        if (LINE_TOOLS.has(tool)) {
          lineDrag(ev, px, py, tool === 'arrow' ? 'arrow' : tool === 'measure' ? 'measure' : 'none');
          return;
        }
        placeAt(px, py);
        return;
      }
      case 'remove-areas':
        rect(ev, px, py, 'cover');
    }
  });

  // The keyboard: Enter on the page puts something in its middle; the arrow
  // keys then move whatever is selected (Shift for bigger steps).
  layer.addEventListener('keydown', (ev) => {
    if (!view || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    select(null);
    if (mode === 'sign' || mode === 'add-text' || mode === 'add-image') {
      placeAt(0.5, 0.5);
      return;
    }
    const tool = mode === 'mark-up' ? (toolChoice?.value() ?? 'highlight') : null;
    if (tool === 'pen') {
      hint.textContent = 'The pen needs a finger or a mouse. Every other tool works from the keyboard.';
      return;
    }
    if (tool !== null && LINE_TOOLS.has(tool)) {
      const item = makeLine(0.3, 0.5, tool === 'arrow' ? 'arrow' : tool === 'measure' ? 'measure' : 'none');
      item.to = [0.7, 0.5];
      drawLine(item);
      items.push(item);
      onChange();
      sync();
      return;
    }
    if (tool !== null && !RECT_TOOLS.has(tool)) {
      placeAt(0.45, 0.45);
      return;
    }
    if (tool === 'link' && !LINKABLE.test(linkField?.value().trim() ?? '')) {
      hint.textContent = 'Type the web address first: https://…, mailto:… or tel:…';
      return;
    }
    const kind: RectKind = mode === 'remove-areas' ? 'cover' : ((tool ?? 'highlight') as RectKind);
    const item = makeRect(kind, { page: current, x: 0.3, y: 0.45, w: 0.4, h: 0.06 });
    addItem(item);
    item.el.focus();
  });

  type RectKind = 'highlight' | 'underline' | 'strike' | 'rect' | 'ellipse' | 'link' | 'cover';

  /** A box-shaped item of `kind` over `area`, styled for the screen. */
  function makeRect(kind: RectKind, area: MutableArea): Boxed {
    switch (kind) {
      case 'cover':
        return { kind: 'cover', area, el: boxElement('cover', 'Area to remove') };
      case 'highlight':
      case 'underline':
      case 'strike': {
        const color = kind === 'highlight' ? MARKERS[markerChoice?.value() ?? 'yellow'] : PENS[penChoice?.value() ?? 'red'];
        const box = boxElement(kind === 'highlight' ? 'highlight' : kind, kind === 'highlight' ? 'Highlight' : kind === 'underline' ? 'Underline' : 'Strike-through');
        if (kind === 'highlight') box.style.setProperty('background-color', css(color, 0.45));
        else box.style.setProperty('--ink', css(color));
        return { kind: 'highlight', area, color, style: kind === 'highlight' ? 'marker' : kind, el: box };
      }
      case 'rect':
      case 'ellipse': {
        const color = PENS[penChoice?.value() ?? 'red'];
        const box = boxElement(kind, kind === 'rect' ? 'Box' : 'Circle');
        box.style.setProperty('--ink', css(color));
        return { kind: 'shape', area, shape: kind, color, el: box };
      }
      case 'link': {
        const url = linkField?.value().trim() ?? '';
        const box = boxElement('link', 'Link');
        box.setAttribute('title', url);
        return { kind: 'link', area, url, el: box };
      }
    }
  }

  /** Drag out a rectangle from (px, py); a tap that makes no area makes nothing. */
  function rect(ev: PointerEvent, px: number, py: number, kind: RectKind): void {
    const area: MutableArea = { page: current, x: px, y: py, w: 0, h: 0 };
    const item = makeRect(kind, area);
    const box = item.el;
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
      const thin = kind === 'underline' || kind === 'strike';
      if (area.w < 0.008 || (!thin && area.h < 0.004)) {
        box.remove();
        return;
      }
      // An underline dragged flat still needs a line's height to sit in.
      if (thin && area.h < 0.012) {
        area.y = Math.max(0, area.y - 0.012);
        area.h = 0.014;
        position(item);
      }
      items.push(item);
      wireItem(item);
      select(item);
      sync();
    });
  }

  function makeLine(px: number, py: number, end: 'none' | 'arrow' | 'measure'): Extract<Item, { kind: 'line' }> {
    const g = document.createElementNS(SVG, 'g');
    const color = PENS[penChoice?.value() ?? 'red'];
    g.setAttribute('stroke', css(color));
    g.setAttribute('class', 'editor__line');
    g.style.setProperty('stroke-width', `max(2px, calc(var(--page-w) * 0.004))`);
    const label = end === 'measure' ? el('span', { class: 'editor__measure', testid: 'editor-measure' }) : null;
    if (label) label.style.setProperty('color', css(color));
    return { kind: 'line', page: current, from: [px, py], to: [px, py], end, width: 0.004, color, el: g, label };
  }

  /** Paints a line item's SVG (and its measurement) from its two ends. Arrowheads are worked out in true proportions. */
  function drawLine(item: Extract<Item, { kind: 'line' }>): void {
    const [ax, ay] = item.from;
    const [bx, by] = item.to;
    const segs: Array<[number, number, number, number]> = [[ax, ay, bx, by]];
    // In a space where both axes are the same length on screen.
    const dx = bx - ax;
    const dy = (by - ay) * pageAspect;
    const length = Math.hypot(dx, dy);
    if (length > 0 && item.end !== 'none') {
      const angle = Math.atan2(dy, dx);
      if (item.end === 'arrow') {
        const head = 0.025;
        for (const turn of [Math.PI * 0.84, -Math.PI * 0.84]) segs.push([bx, by, bx + head * Math.cos(angle + turn), by + (head * Math.sin(angle + turn)) / pageAspect]);
      } else {
        const tick = 0.012;
        for (const [px, py] of [[ax, ay], [bx, by]] as const) {
          const nx = -Math.sin(angle) * tick;
          const ny = (Math.cos(angle) * tick) / pageAspect;
          segs.push([px - nx, py - ny, px + nx, py + ny]);
        }
      }
    }
    item.el.replaceChildren(
      ...segs.map(([x1, y1, x2, y2]) => {
        const l = document.createElementNS(SVG, 'line');
        l.setAttribute('x1', (x1 * 1000).toFixed(1));
        l.setAttribute('y1', (y1 * 1000).toFixed(1));
        l.setAttribute('x2', (x2 * 1000).toFixed(1));
        l.setAttribute('y2', (y2 * 1000).toFixed(1));
        return l;
      }),
    );
    if (item.label) {
      const size = pagePoints.get(item.page) ?? { w: 595, h: 842 };
      item.label.textContent = measureLabel(Math.hypot((bx - ax) * size.w, (by - ay) * size.h));
      item.label.style.setProperty('left', `${((ax + bx) / 2) * 100}%`);
      item.label.style.setProperty('top', `${((ay + by) / 2) * 100}%`);
    }
  }

  /** Drag out a line from (px, py); a tap that makes no line makes nothing. */
  function lineDrag(ev: PointerEvent, px: number, py: number, end: 'none' | 'arrow' | 'measure'): void {
    const item = makeLine(px, py, end);
    ink.append(item.el);
    if (item.label) layer.append(item.label);
    drag(ev, layer, (dx, dy) => {
      item.to = [clamp(px + dx, 0, 1), clamp(py + dy, 0, 1)];
      drawLine(item);
    }, () => {
      if (Math.hypot(item.to[0] - px, (item.to[1] - py) * pageAspect) < 0.01) {
        item.el.remove();
        item.label?.remove();
        return;
      }
      items.push(item);
      onChange();
      sync();
    });
  }

  prev.addEventListener('click', () => void show(current - 1));
  next.addEventListener('click', () => void show(current + 1));
  undo.addEventListener('click', () => {
    const last = items[items.length - 1];
    if (!last) return;
    if (pageOfItem(last) !== current) void show(pageOfItem(last));
    remove(last);
  });

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Only when the page would really be drawn at a new size, and never mid-drag.
      if (dragging || layoutWidth(pageAspect) === drawnWidth) return;
      void show(current, true);
    }, 200);
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
        case 'picture':
          out.push({ kind: 'picture', area: { ...item.area }, bytes: item.bytes, format: item.format });
          break;
        case 'highlight':
          out.push({ kind: 'highlight', area: { ...item.area }, color: item.color, ...(item.style === 'marker' ? {} : { style: item.style }) });
          break;
        case 'ink':
          out.push({ kind: 'ink', page: item.page, points: [...item.points], width: item.width, color: item.color });
          break;
        case 'line':
          out.push({ kind: 'line', page: item.page, from: [...item.from], to: [...item.to], color: item.color, width: item.width, end: item.end });
          break;
        case 'shape':
          out.push({ kind: 'shape', area: { ...item.area }, shape: item.shape, color: item.color, width: 0.003 });
          break;
        case 'note':
          if (item.text.trim()) out.push({ kind: 'note', area: { ...item.area }, text: item.text, color: item.color });
          break;
        case 'stamp':
          out.push({ kind: 'stamp', area: { ...item.area }, text: item.text, color: item.color });
          break;
        case 'link':
          out.push({ kind: 'link', area: { ...item.area }, url: item.url });
          break;
        case 'text': {
          if (item.text.trim().length === 0) break;
          if (WIN_ANSI.test(item.text)) {
            // A line longer than the page runs off its edge, as the editor shows; the box itself is capped.
            out.push({ kind: 'text', area: { ...item.area, w: Math.min(item.area.w, 1), h: Math.min(item.area.h, 1) }, text: item.text, size: item.size, color: item.color, ...(item.boxed ? { boxed: true } : {}) });
          } else {
            // Malayalam, Hindi, Arabic, emoji: the browser shapes them, and they go in as a picture of the words.
            const picture = textPicture(item.text, item.size, item.color, pageWidthPx(), aspects.get(item.area.page) ?? pageAspect, item.boxed);
            if (picture) out.push({ kind: 'image', area: { ...item.area, w: Math.min(picture.w, 1), h: Math.min(picture.h, 1) }, png: picture.png });
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
          return 'Pick a tool, then mark the page.';
        case 'remove-areas':
          return 'Drag across what should go.';
        case 'add-image':
          return chosen === null ? 'Choose a picture, then tap the page where it goes.' : 'Tap the page where the picture goes.';
      }
      return null;
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
function textPicture(text: string, size: number, color: Rgb, pageWidthPx: number, aspect: number, boxed = false): { png: Uint8Array; w: number; h: number } | null {
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
  if (boxed) {
    context.fillStyle = 'rgb(255, 254, 247)';
    context.fillRect(0, 0, out.width, out.height);
    context.strokeStyle = css(color);
    context.lineWidth = Math.max(2, px * 0.06);
    context.strokeRect(0, 0, out.width, out.height);
  }
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

/** The longest side a placed picture keeps: sharp in print, light in the file. */
const PICTURE_MAX = 2000;

/**
 * A chosen photo or picture, turned the right way up (a phone's EXIF turn is
 * honoured), shrunk to at most PICTURE_MAX on its long side, and kept as
 * JPEG, or as PNG when it may be see-through.
 */
async function readPicture(file: File): Promise<{ bytes: Uint8Array; format: 'jpeg' | 'png'; src: string; aspect: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, PICTURE_MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const clear = /png|gif|webp|svg/i.test(file.type);
    const src = clear ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
    return { bytes: fromDataUrl(src), format: clear ? 'png' : 'jpeg', src, aspect: canvas.width / canvas.height };
  } finally {
    bitmap.close();
  }
}

