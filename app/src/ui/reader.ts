/**
 * Read: the document, page after page, the way a reader shows it. Pages are
 * drawn as they scroll into view and let go when they scroll far away, so a
 * 600-page file reads on a cheap phone. Zoom re-draws rather than stretches,
 * so text stays sharp. Find reads each page's words once and remembers them.
 *
 * "Then…" hands the open file to any tool: read it, then sign it.
 */
import { LIVE_TOOLS, type ToolId } from '../ops/tools';
import type { OutlineItem, PdfView } from '../pdf/types';
import { el } from './dom';
import { holdPoint, watchZoomGestures } from './zoom';

export interface Reader {
  readonly root: HTMLElement;
  /** Takes ownership of `view`; closes it on `destroy()` or the next `load()`. */
  load(view: PdfView): Promise<void>;
  params(): unknown;
  problem(): string | null;
  destroy(): Promise<void>;
}

interface Slot {
  readonly index: number;
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  aspect: number;
  /** The width it was last drawn at, in CSS pixels; 0 when not drawn. */
  drawnAt: number;
  near: boolean;
}

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const MAX_DPR = 2;

export function createReader(handoff: ((target: ToolId) => void) | null): Reader {
  let view: PdfView | null = null;
  let slots: Slot[] = [];
  let zoom = 1;
  let observer: IntersectionObserver | null = null;
  let abort = new AbortController();
  const texts = new Map<number, string>();
  let findTimer: ReturnType<typeof setTimeout> | null = null;
  let hits: number[] = [];
  let hit = -1;
  let drawing = 0;
  const queue: Slot[] = [];

  // ---- The bar ----
  const contentsButton = el('button', { class: 'button button--ghost button--small', testid: 'reader-outline-toggle', text: 'Contents', attrs: { type: 'button', 'aria-expanded': 'false' } });
  const zoomOut = el('button', { class: 'button button--ghost button--small reader__icon', testid: 'reader-zoom-out', text: '−', attrs: { type: 'button', 'aria-label': 'Zoom out' } });
  const zoomLabel = el('button', { class: 'button button--ghost button--small reader__zoom', testid: 'reader-zoom', text: '100%', attrs: { type: 'button', 'aria-label': 'Fit the width' } });
  const zoomIn = el('button', { class: 'button button--ghost button--small reader__icon', testid: 'reader-zoom-in', text: '+', attrs: { type: 'button', 'aria-label': 'Zoom in' } });
  const where = el('span', { class: 'reader__where', testid: 'reader-where', attrs: { 'aria-live': 'polite' } });
  const night = el('button', { class: 'button button--ghost button--small', testid: 'reader-night', text: 'Night', attrs: { type: 'button', 'aria-pressed': 'false' } });
  const find = el('input', { class: 'input reader__find', testid: 'reader-find', attrs: { type: 'search', placeholder: 'Find a word', 'aria-label': 'Find in the document', enterkeyhint: 'search' } });
  const findPrev = el('button', { class: 'button button--ghost button--small reader__icon', testid: 'reader-find-prev', text: '‹', attrs: { type: 'button', 'aria-label': 'Previous match' } });
  const findNext = el('button', { class: 'button button--ghost button--small reader__icon', testid: 'reader-find-next', text: '›', attrs: { type: 'button', 'aria-label': 'Next match' } });
  const findCount = el('span', { class: 'reader__count', testid: 'reader-find-count', attrs: { 'aria-live': 'polite' } });
  const commentsButton = el('button', { class: 'button button--ghost button--small', testid: 'reader-comments-toggle', text: 'Comments', attrs: { type: 'button', 'aria-expanded': 'false' } });
  const printButton = el('button', { class: 'button button--ghost button--small', testid: 'reader-print', text: 'Print', attrs: { type: 'button' } });
  const aloud = el('button', { class: 'button button--ghost button--small', testid: 'reader-aloud', text: 'Read aloud', attrs: { type: 'button', 'aria-pressed': 'false' } });
  const status = el('p', { class: 'reader__status', testid: 'reader-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  status.hidden = true;
  const tell = (text: string) => {
    status.textContent = text;
    status.hidden = text === '';
  };
  // Read aloud needs speech synthesis; without it, the button is not offered at all.
  const speech = 'speechSynthesis' in window ? window.speechSynthesis : null;
  if (!speech) aloud.hidden = true;

  const thenMenu = el('div', { class: 'then__menu reader__then-menu', attrs: { role: 'menu' } });
  thenMenu.hidden = true;
  const thenButton = el('button', { class: 'button button--small', testid: 'reader-then', text: 'Then…', attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' } });
  if (handoff) {
    // Every tool that takes a PDF, Attachments (a PDF first, then files) included.
    for (const t of LIVE_TOOLS.filter((t) => t.input === 'one-pdf' || t.input === 'several-pdfs' || t.input === 'pdf-and-files').filter((t) => t.id !== 'read')) {
      thenMenu.append(
        el('button', { testid: `then-${t.id}`, attrs: { type: 'button', role: 'menuitem' }, on: { click: () => handoff(t.id) } }, [t.title, el('span', { attrs: { 'aria-hidden': 'true' }, text: '→' })]),
      );
    }
    thenButton.addEventListener('click', () => {
      thenMenu.hidden = !thenMenu.hidden;
      thenButton.setAttribute('aria-expanded', String(!thenMenu.hidden));
    });
  }
  const then = handoff ? el('div', { class: 'then reader__then' }, [thenButton, thenMenu]) : null;

  const bar = el('div', { class: 'reader__bar', testid: 'reader-bar' }, [
    el('div', { class: 'reader__group' }, [zoomOut, zoomLabel, zoomIn, then, contentsButton, commentsButton, night, aloud, printButton]),
    el('div', { class: 'reader__group reader__group--find' }, [find, findPrev, findNext, findCount]),
  ]);
  const outline = el('nav', { class: 'reader__outline', testid: 'reader-outline', attrs: { 'aria-label': 'Contents' } });
  outline.hidden = true;
  const commentList = el('section', { class: 'reader__outline reader__comments', testid: 'reader-comments', attrs: { 'aria-label': 'Comments' } });
  commentList.hidden = true;
  /** Read once, the first time the list is opened: going through every page is not free. */
  let commentsRead: Promise<void> | null = null;
  // Focusable, so the keyboard can scroll it sideways when zoomed in.
  const pages = el('div', { class: 'reader__pages', testid: 'reader-pages', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Pages' } });
  const root = el('section', { class: 'reader', testid: 'reader', attrs: { 'aria-label': 'The document' } }, [bar, status, outline, commentList, where, pages]);
  /** The pages as pictures, for the printer only: hidden on screen, the only thing shown on paper. */
  let sheets: HTMLElement | null = null;
  let printing = false;
  let speaking = false;
  let speakToken = 0;
  root.hidden = true;

  // ---- Sizing and drawing ----

  const baseWidth = (): number => Math.min(Math.max(240, pages.clientWidth || root.clientWidth || 320), 900);
  const widthNow = (): number => Math.round(baseWidth() * zoom);

  function size(slot: Slot): void {
    const w = widthNow();
    slot.root.style.setProperty('width', `${w}px`);
    slot.root.style.setProperty('height', `${Math.round(w * slot.aspect)}px`);
  }

  function pump(): void {
    while (drawing < 2 && queue.length > 0) {
      const slot = queue.shift();
      if (!slot || !slot.near || slot.drawnAt === widthNow()) continue;
      drawing++;
      void draw(slot).finally(() => {
        drawing--;
        pump();
      });
    }
  }

  async function draw(slot: Slot): Promise<void> {
    if (!view) return;
    const signal = abort.signal;
    try {
      const info = await view.page(slot.index);
      const sideways = info.rotation === 90 || info.rotation === 270;
      const aspect = (sideways ? info.width : info.height) / (sideways ? info.height : info.width);
      if (Math.abs(aspect - slot.aspect) > 0.001) {
        slot.aspect = aspect;
        size(slot);
      }
      const w = widthNow();
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const bitmap = await view.render(slot.index, { width: Math.round(w * dpr), signal });
      if (signal.aborted || !slot.near) {
        bitmap.close();
        return;
      }
      slot.canvas.width = bitmap.width;
      slot.canvas.height = bitmap.height;
      slot.canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      slot.drawnAt = w;
      slot.root.dataset['drawn'] = 'true';
    } catch {
      // A page that will not draw stays a blank sheet with its number on it.
    }
  }

  function forget(slot: Slot): void {
    slot.canvas.width = 0;
    slot.canvas.height = 0;
    slot.drawnAt = 0;
    delete slot.root.dataset['drawn'];
  }

  function setZoom(next: number): void {
    const anchor = currentPage();
    zoom = next;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= (ZOOMS[0] ?? 0.5);
    zoomIn.disabled = zoom >= (ZOOMS[ZOOMS.length - 1] ?? 3);
    root.dataset['zoomed'] = zoom > 1 ? 'true' : 'false';
    for (const slot of slots) size(slot);
    slots[anchor]?.root.scrollIntoView({ block: 'start' });
    for (const slot of slots) if (slot.near) queue.push(slot);
    pump();
  }

  function currentPage(): number {
    const mid = window.innerHeight / 3;
    let best = 0;
    for (const slot of slots) {
      if (!slot.near) continue;
      const r = slot.root.getBoundingClientRect();
      if (r.top <= mid) best = slot.index;
    }
    return best;
  }

  function updateWhere(): void {
    if (!view) return;
    where.textContent = `Page ${currentPage() + 1} of ${view.pageCount}`;
  }

  // ---- Contents ----

  function outlineList(items: readonly OutlineItem[]): HTMLElement {
    return el(
      'ul',
      {},
      items.map((item) =>
        el('li', {}, [
          item.page === null
            ? el('span', { class: 'reader__entry reader__entry--dead', text: item.title })
            : el('button', {
                class: 'reader__entry',
                testid: 'reader-entry',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    if (item.page !== null) goTo(item.page);
                    if (window.innerWidth < 720) toggleOutline(false);
                  },
                },
              }, [el('span', { text: item.title }), el('span', { class: 'reader__entry-page', text: String(item.page + 1) })]),
          item.items.length > 0 ? outlineList(item.items) : null,
        ]),
      ),
    );
  }

  function toggleOutline(open = outline.hidden): void {
    outline.hidden = !open;
    contentsButton.setAttribute('aria-expanded', String(open));
  }

  async function toggleComments(): Promise<void> {
    const open = commentList.hidden;
    commentList.hidden = !open;
    commentsButton.setAttribute('aria-expanded', String(open));
    if (!open || !view) return;
    const v = view;
    commentsRead ??= (async () => {
      commentList.replaceChildren(el('p', { class: 'options__note', text: 'Reading the comments…' }));
      const found = await v.comments().catch(() => []);
      if (view !== v) return;
      if (found.length === 0) {
        commentList.replaceChildren(el('p', { class: 'options__note', testid: 'reader-comments-none', text: 'This document has no comments, notes or highlights.' }));
        return;
      }
      commentList.replaceChildren(
        el('p', { class: 'reader__comments-count', text: `${found.length} ${found.length === 1 ? 'comment' : 'comments'}` }),
        el(
          'ul',
          {},
          found.map((c) =>
            el('li', {}, [
              el('button', { class: 'reader__entry reader__comment', testid: 'reader-comment', attrs: { type: 'button' }, on: { click: () => goTo(c.page) } }, [
                el('span', { class: 'reader__comment-head', text: `${c.kind} · page ${c.page + 1}${c.author ? ` · ${c.author}` : ''}` }),
                c.text ? el('span', { class: 'reader__comment-text', text: c.text }) : null,
              ]),
            ]),
          ),
        ),
      );
    })();
    await commentsRead;
  }

  function goTo(index: number): void {
    slots[index]?.root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---- Find ----

  let searchRun = 0;

  async function search(): Promise<void> {
    if (findTimer !== null) clearTimeout(findTimer);
    findTimer = null;
    const run = ++searchRun;
    const query = find.value.trim().toLocaleLowerCase();
    for (const slot of slots) slot.root.classList.remove('is-hit', 'is-current');
    hits = [];
    hit = -1;
    if (!view || query.length === 0) {
      findCount.textContent = '';
      return;
    }
    const v = view;
    let matches = 0;
    for (let i = 0; i < v.pageCount; i++) {
      if (run !== searchRun || view !== v) return; // searched again, or closed
      if (i % 20 === 0) findCount.textContent = `Searching… page ${i + 1} of ${v.pageCount}`;
      let text = texts.get(i);
      if (text === undefined) {
        try {
          text = (await v.text(i)).replace(/\s+/g, ' ').toLocaleLowerCase();
        } catch {
          text = '';
        }
        texts.set(i, text);
        if (run !== searchRun) return;
      }
      let from = 0;
      let here = 0;
      for (;;) {
        const at = text.indexOf(query, from);
        if (at < 0) break;
        here++;
        from = at + query.length;
      }
      if (here > 0) {
        hits.push(i);
        matches += here;
        slots[i]?.root.classList.add('is-hit');
      }
    }
    findCount.textContent =
      matches === 0 ? 'Not found' : `${matches} ${matches === 1 ? 'match' : 'matches'} on ${hits.length} ${hits.length === 1 ? 'page' : 'pages'}`;
    if (hits.length > 0) step(1);
  }

  function step(by: number): void {
    if (hits.length === 0) return;
    slots[hits[hit] ?? -1]?.root.classList.remove('is-current');
    hit = (hit + by + hits.length) % hits.length;
    const index = hits[hit] ?? 0;
    slots[index]?.root.classList.add('is-current');
    goTo(index);
  }

  find.addEventListener('input', () => {
    if (findTimer !== null) clearTimeout(findTimer);
    findTimer = setTimeout(() => void search(), 300);
  });
  find.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (hits.length > 0) step(ev.shiftKey ? -1 : 1);
      else void search();
    }
  });
  findNext.addEventListener('click', () => step(1));
  findPrev.addEventListener('click', () => step(-1));

  zoomIn.addEventListener('click', () => setZoom(ZOOMS.find((z) => z > zoom + 0.001) ?? zoom));
  zoomOut.addEventListener('click', () => setZoom([...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? zoom));
  zoomLabel.addEventListener('click', () => setZoom(1));

  // Two fingers or Ctrl-wheel: the pages are stretched as the fingers move (cheap), then
  // drawn again sharp at the new size once they stop, with the point under the fingers kept.
  let pinch: { from: { x: number; y: number }; to: { x: number; y: number }; page: HTMLElement; rect: DOMRect; scale: number } | null = null;
  let pinchFrom = 1;
  let settle: ReturnType<typeof setTimeout> | null = null;
  const lo = ZOOMS[0] ?? 0.5;
  const hi = ZOOMS[ZOOMS.length - 1] ?? 3;
  function stretch(scale: number, x: number, y: number): void {
    if (!pinch) {
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('.reader__page') ?? slots[currentPage()]?.root ?? null;
      if (!under) return;
      const box = pages.getBoundingClientRect();
      pages.style.setProperty('transform-origin', `${x - box.left}px ${y - box.top}px`);
      pinch = { from: { x, y }, to: { x, y }, page: under, rect: under.getBoundingClientRect(), scale: 1 };
    }
    const target = Math.min(hi, Math.max(lo, pinchFrom * scale));
    pinch.scale = target / zoom;
    pinch.to = { x, y };
    pages.style.setProperty('transform', `translate(${x - pinch.from.x}px, ${y - pinch.from.y}px) scale(${pinch.scale})`);
  }
  function commit(): void {
    if (settle !== null) clearTimeout(settle);
    settle = null;
    const done = pinch;
    pinch = null;
    pages.style.removeProperty('transform');
    pages.style.removeProperty('transform-origin');
    if (!done || Math.abs(done.scale - 1) < 0.01) return;
    setZoom(zoom * done.scale);
    holdPoint([pages, window], done.page, done.rect, done.from, done.to);
  }
  const unwatchZoom = watchZoomGestures(pages, {
    begin: () => {
      pinchFrom = zoom;
    },
    move: (scale, x, y) => stretch(scale, x, y),
    end: () => commit(),
    wheel: (factor, x, y) => {
      if (!pinch) pinchFrom = zoom;
      stretch((pinch ? pinch.scale * zoom : zoom) * factor / pinchFrom, x, y);
      if (settle !== null) clearTimeout(settle);
      settle = setTimeout(commit, 220);
    },
  });
  night.addEventListener('click', () => {
    const on = !root.classList.contains('reader--night');
    root.classList.toggle('reader--night', on);
    night.setAttribute('aria-pressed', String(on));
  });
  contentsButton.addEventListener('click', () => toggleOutline());
  commentsButton.addEventListener('click', () => void toggleComments());

  // ---- Print ----

  /**
   * Draws every page as a picture into a sheet only the printer sees, then
   * opens the print dialog. The PDF itself never goes anywhere: printing a
   * file through the browser's own viewer would need a blob URL, and this
   * keeps the page under its policy.
   */
  async function print(): Promise<void> {
    if (!view || printing) return;
    printing = true;
    printButton.disabled = true;
    const signal = abort.signal;
    sheets?.remove();
    const holder = el('div', { class: 'print-sheets', testid: 'print-sheets', attrs: { 'aria-hidden': 'true' } });
    try {
      const scratch = document.createElement('canvas');
      for (let i = 0; i < view.pageCount; i++) {
        if (signal.aborted) return;
        tell(`Getting page ${i + 1} of ${view.pageCount} ready to print…`);
        const bitmap = await view.render(i, { width: PRINT_WIDTH, signal });
        scratch.width = bitmap.width;
        scratch.height = bitmap.height;
        const ctx = scratch.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, bitmap.width, bitmap.height);
          ctx.drawImage(bitmap, 0, 0);
        }
        bitmap.close();
        const img = el('img', { class: 'print-sheets__page', attrs: { alt: '', src: scratch.toDataURL('image/jpeg', 0.88) } });
        img.dataset['landscape'] = String(scratch.width > scratch.height);
        holder.append(img);
      }
      scratch.width = 0;
      scratch.height = 0;
      document.body.append(holder);
      sheets = holder;
      await Promise.all([...holder.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
      tell('');
      window.print();
    } catch {
      if (!signal.aborted) tell('This document could not be got ready to print. Save it and print it from another app.');
    } finally {
      printing = false;
      printButton.disabled = false;
    }
  }

  // ---- Read aloud ----

  /** Voices that run on this device. A voice that runs online would send the words away, so it is never used. */
  function localVoice(): SpeechSynthesisVoice | null {
    const voices = speech?.getVoices().filter((v) => v.localService) ?? [];
    const lang = (document.documentElement.lang || navigator.language || 'en').toLowerCase().slice(0, 2);
    return voices.find((v) => v.default && v.lang.toLowerCase().startsWith(lang)) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? voices[0] ?? null;
  }

  /** Voices often arrive a moment after the page loads. */
  async function waitForVoices(): Promise<void> {
    if (!speech || speech.getVoices().length > 0) return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      speech.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }

  function stopSpeaking(): void {
    speakToken++;
    speaking = false;
    speech?.cancel();
    aloud.textContent = 'Read aloud';
    aloud.setAttribute('aria-pressed', 'false');
    for (const slot of slots) slot.root.classList.remove('is-reading');
  }

  async function readAloud(): Promise<void> {
    if (!view || !speech) return;
    if (speaking) {
      stopSpeaking();
      tell('');
      return;
    }
    await waitForVoices();
    const voice = localVoice();
    if (!voice) {
      tell('This browser only has voices that work over the internet, so Read aloud is off here: your document would leave the device. Chrome on Android, and Windows and Mac browsers, usually have one built in.');
      return;
    }
    const token = ++speakToken;
    speaking = true;
    aloud.textContent = 'Stop reading';
    aloud.setAttribute('aria-pressed', 'true');
    tell('');
    let spoke = false;
    for (let i = currentPage(); i < view.pageCount && token === speakToken; i++) {
      const text = await pageText(i);
      if (token !== speakToken) return;
      const parts = chunks(text);
      if (parts.length === 0) continue;
      spoke = true;
      for (const slot of slots) slot.root.classList.toggle('is-reading', slot.index === i);
      goTo(i);
      for (const part of parts) {
        if (token !== speakToken) return;
        await say(part, voice);
      }
    }
    if (token !== speakToken) return;
    stopSpeaking();
    if (!spoke) tell('There are no words to read from here on. If this is a scan, use Make searchable first, then read it aloud.');
  }

  function say(text: string, voice: SpeechSynthesisVoice): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      speech?.speak(utterance);
    });
  }

  async function pageText(index: number): Promise<string> {
    // Not the search cache: that one is folded to lower case.
    return (await view?.text(index).catch(() => '')) ?? '';
  }

  printButton.addEventListener('click', () => void print());
  aloud.addEventListener('click', () => void readAloud());

  const onScroll = () => updateWhere();
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => setZoom(zoom), 200);
  };

  async function teardown(): Promise<void> {
    stopSpeaking();
    tell('');
    sheets?.remove();
    sheets = null;
    abort.abort();
    abort = new AbortController();
    observer?.disconnect();
    observer = null;
    queue.length = 0;
    for (const slot of slots) forget(slot);
    slots = [];
    texts.clear();
    hits = [];
    pages.replaceChildren();
    outline.replaceChildren();
    commentList.replaceChildren();
    commentList.hidden = true;
    commentsButton.setAttribute('aria-expanded', 'false');
    commentsRead = null;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    const v = view;
    view = null;
    await v?.close();
  }

  return {
    root,
    async load(next) {
      await teardown();
      view = next;
      root.hidden = false;
      find.value = '';
      findCount.textContent = '';
      const first = await next.page(0).catch(() => null);
      const sideways = first !== null && (first.rotation === 90 || first.rotation === 270);
      const aspect = first ? (sideways ? first.width : first.height) / (sideways ? first.height : first.width) : Math.SQRT2;
      // Pages far off screen are let go; near ones are drawn, two at a time.
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const slot = slots[Number((entry.target as HTMLElement).dataset['page'])];
            if (!slot) continue;
            slot.near = entry.isIntersecting;
            if (slot.near) queue.push(slot);
            else forget(slot);
          }
          pump();
          updateWhere();
        },
        { rootMargin: '150% 0px' },
      );
      for (let i = 0; i < next.pageCount; i++) {
        const canvas = el('canvas', { class: 'reader__canvas', attrs: { 'aria-hidden': 'true' } });
        const slotRoot = el('div', { class: 'reader__page', testid: 'reader-page', attrs: { 'data-page': String(i), role: 'img', 'aria-label': `Page ${i + 1}` } }, [
          canvas,
          el('span', { class: 'reader__number', text: String(i + 1) }),
        ]);
        const slot: Slot = { index: i, root: slotRoot, canvas, aspect, drawnAt: 0, near: false };
        slots.push(slot);
        pages.append(slotRoot);
        size(slot);
        observer.observe(slotRoot);
      }
      setZoom(1);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);
      const items = await next.outline().catch(() => [] as readonly OutlineItem[]);
      contentsButton.hidden = items.length === 0;
      if (items.length > 0) outline.append(outlineList(items));
      updateWhere();
    },
    params: () => ({}),
    problem: () => null,
    destroy: () => {
      root.hidden = true;
      unwatchZoom();
      if (settle !== null) clearTimeout(settle);
      return teardown();
    },
  };
}

/** About 150 dpi across an A4 page: sharp on paper, light enough to hold a few hundred pages. */
const PRINT_WIDTH = 1240;

/**
 * A page's words in pieces a speech engine will finish: some stop speaking a
 * long utterance after about fifteen seconds, so each piece is a sentence or
 * two, never more than about 220 characters.
 */
export function chunks(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return [];
  const sentences = flat.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [flat];
  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    for (let piece = sentence; piece.length > 0; ) {
      const room = 220 - current.length;
      if (piece.length <= room) {
        current += piece;
        break;
      }
      if (current.trim() !== '') {
        out.push(current.trim());
        current = '';
        continue;
      }
      const cut = piece.lastIndexOf(' ', 220);
      const at = cut > 40 ? cut : 220;
      out.push(piece.slice(0, at).trim());
      piece = piece.slice(at);
    }
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}
