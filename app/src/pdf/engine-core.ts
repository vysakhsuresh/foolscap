/**
 * The engine's body, shared by the page (engine.ts) and the op worker
 * (engine-worker.ts). The two differ only in what a canvas is and how pdf.js's
 * own worker is reached, so those come in as a `Host`; everything about
 * opening, drawing, reading text and turning failures into words is here once.
 *
 * The recipe in types.ts is followed to the letter because pdf.js has several
 * ways to do each step and only one of them keeps the promises.
 */
import './shims';
import {
  AbortException,
  getDocument,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
  OPS,
  RenderingCancelledException,
  Util,
  VerbosityLevel,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PDFWorker,
} from 'pdfjs-dist';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import { PDFJS_ASSETS } from './pdfjs-version';
import { multiply, unitBox, type Matrix } from './content-stream';
import { PdfError, type Area, type FormField, type LayoutItem, type OutlineItem, type PdfComment, type PageInfo, type PdfEngine, type PdfView } from './types';

interface RawOutline {
  readonly title?: unknown;
  readonly dest?: unknown;
  readonly items?: readonly RawOutline[];
}

/** What pdf.js's getFieldObjects gives for one widget, as far as filling it needs. */
interface RawField {
  readonly type?: string;
  readonly value?: unknown;
  readonly editable?: boolean;
  readonly hidden?: boolean;
  readonly multiline?: boolean;
  readonly multipleSelection?: boolean;
  readonly exportValues?: unknown;
  readonly items?: ReadonlyArray<{ readonly exportValue?: unknown; readonly displayValue?: unknown }>;
  readonly charLimit?: unknown;
  readonly page?: number;
}

type DocumentInitParameters = NonNullable<Parameters<typeof getDocument>[0]>;

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface Host {
  /** pdf.js's worker, made once by the caller and shared by every document. */
  readonly worker: PDFWorker;
  readonly maxRenderPixels: number;
  /** Extra getDocument options: a worker host needs its own factories. */
  readonly options: Partial<DocumentInitParameters>;
  canvas(width: number, height: number): AnyCanvas;
  encode(canvas: AnyCanvas, type: 'image/png' | 'image/jpeg', quality: number): Promise<Blob>;
}

export function createEngineOn(host: Host): PdfEngine {
  const { worker } = host;
  return {
    ready: worker.promise,
    maxRenderPixels: host.maxRenderPixels,

    async open(data, opts) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
      // getDocument transfers the buffer to the worker, so anything we want to
      // know about the bytes afterwards has to be read before the call.
      const byteLength = bytes.byteLength;
      const header = bytes.slice(0, 1024 + 5);
      const signal = opts?.signal;
      if (signal?.aborted) throw cancelled();

      const task = getDocument({
        data: bytes,
        worker,
        useWorkerFetch: true,
        cMapUrl: PDFJS_ASSETS + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: PDFJS_ASSETS + 'standard_fonts/',
        wasmUrl: PDFJS_ASSETS + 'wasm/',
        iccUrl: PDFJS_ASSETS + 'iccs/',
        verbosity: VerbosityLevel.ERRORS,
        ...host.options,
        ...(opts?.password === undefined ? {} : { password: opts.password }),
      });

      const onAbort = () => void task.destroy();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const doc = await task.promise;
        return view(host, task, doc);
      } catch (error) {
        if (signal?.aborted) throw cancelled(error);
        throw toOpenError(error, header, byteLength);
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

function view(host: Host, task: PDFDocumentLoadingTask, initial: PDFDocumentProxy): PdfView {
  let doc: PDFDocumentProxy | null = initial;

  const live = (): PDFDocumentProxy => {
    if (doc === null) throw new Error('This document has been closed.');
    return doc;
  };

  const pageAt = async (index: number): Promise<PDFPageProxy> => {
    const current = live();
    if (!Number.isInteger(index) || index < 0 || index >= current.numPages) {
      throw new Error(`Page index ${index} is out of range (0 to ${current.numPages - 1}).`);
    }
    return current.getPage(index + 1);
  };

  /**
   * Draws a page `width` device pixels wide (clamped to the host's pixel
   * budget) and hands the canvas to `use` before it is released.
   */
  const draw = async <T>(
    index: number,
    width: number,
    signal: AbortSignal | undefined,
    use: (canvas: AnyCanvas) => Promise<T>,
  ): Promise<T> => {
    if (signal?.aborted) throw cancelled();
    const page = await pageAt(index);
    let canvas: AnyCanvas | null = null;
    try {
      // getViewport defaults to the page's own /Rotate, so a landscape scan
      // stored sideways comes out the way a reader shows it.
      const natural = page.getViewport({ scale: 1 });
      let scale = Math.max(1, width) / natural.width;
      if (natural.width * natural.height * scale * scale > host.maxRenderPixels) {
        scale = Math.sqrt(host.maxRenderPixels / (natural.width * natural.height));
      }
      const viewport = page.getViewport({ scale });

      canvas = host.canvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        throw new PdfError("This page couldn't be drawn. Try closing other tabs.", 'unknown');
      }
      // pdf.js types the context as the DOM one; an OffscreenCanvas context
      // draws the same calls, which is all pdf.js makes.
      const canvasContext = context as unknown as CanvasRenderingContext2D;

      const task = page.render({ canvasContext, canvas: canvas as HTMLCanvasElement, viewport });
      const onAbort = () => task.cancel();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        await task.promise;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
      return await use(canvas);
    } catch (error) {
      throw toRenderError(error);
    } finally {
      // Release the canvas's backing store now rather than when the GC gets
      // to it: Safari counts canvas memory against a tight per-page budget.
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      // Without this pdf.js keeps every decoded image and font of every page
      // it has drawn, which on a 600-page scan is the whole scan.
      page.cleanup();
    }
  };

  return {
    get pageCount() {
      return live().numPages;
    },

    async page(index): Promise<PageInfo> {
      const page = await pageAt(index);
      const [x1, y1, x2, y2] = page.view;
      return {
        index,
        width: Math.abs((x2 ?? 0) - (x1 ?? 0)),
        height: Math.abs((y2 ?? 0) - (y1 ?? 0)),
        rotation: normaliseRotation(page.rotate),
      };
    },

    async render(index, { width, signal }) {
      return draw(index, width, signal, async (canvas) => createImageBitmap(canvas));
    },

    async encode(index, { width, format, quality = 0.9, signal, cover }) {
      return draw(index, width, signal, async (canvas) => {
        if (cover !== undefined && cover.length > 0) {
          const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
          if (context === null) throw new PdfError("This page couldn't be drawn. Try closing other tabs.", 'unknown');
          context.fillStyle = '#000000';
          for (const area of cover) {
            // Rounded outwards, so no sliver of a covered letter survives at the edge.
            const x = Math.floor(area.x * canvas.width);
            const y = Math.floor(area.y * canvas.height);
            context.fillRect(x, y, Math.ceil((area.x + area.w) * canvas.width) - x, Math.ceil((area.y + area.h) * canvas.height) - y);
          }
        }
        const blob = await host.encode(canvas, format === 'png' ? 'image/png' : 'image/jpeg', quality);
        return new Uint8Array(await blob.arrayBuffer());
      });
    },

    async text(index) {
      const page = await pageAt(index);
      try {
        const content = await page.getTextContent();
        let out = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          out += item.str;
          if (item.hasEOL) out += '\n';
        }
        return out.replace(/[ \t]+\n/g, '\n').trimEnd();
      } catch (error) {
        throw toRenderError(error);
      } finally {
        page.cleanup();
      }
    },

    async layout(index) {
      const page = await pageAt(index);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        // The fonts' real names ("ABCDEF+Arial-BoldMT") say bold and italic;
        // they are known once the page's drawing instructions have been read.
        const names = new Map<string, string>();
        try {
          await page.getOperatorList();
          for (const item of content.items) {
            if (!('fontName' in item) || names.has(item.fontName)) continue;
            const font: unknown = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : null;
            const name = font !== null && typeof font === 'object' && 'name' in font && typeof font.name === 'string' ? font.name : '';
            names.set(item.fontName, name);
          }
        } catch {
          // Without the names, everything reads as regular weight. The words are what matter.
        }
        const items: LayoutItem[] = [];
        for (const item of content.items) {
          if (!('str' in item) || item.str.length === 0) continue;
          const m = Util.transform(viewport.transform, item.transform);
          const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = m;
          // Left to right only: rotated and vertical text would scramble the lines.
          if (a <= 0 || Math.abs(b) > a * 0.1) continue;
          const real = names.get(item.fontName) ?? '';
          const style = content.styles[item.fontName]?.fontFamily;
          items.push({
            str: item.str,
            x,
            y,
            width: item.width,
            height: Math.hypot(c, d) || item.height,
            fontName: real || item.fontName,
            bold: /bold|black|heavy|semibold|demi/i.test(real),
            italic: /italic|oblique/i.test(real),
            family: style === 'monospace' || /mono|courier|consol/i.test(real) ? 'mono' : style === 'serif' || /times|serif|georgia|garamond|cambria/i.test(real) ? 'serif' : 'sans',
          });
        }
        return { width: viewport.width, height: viewport.height, items };
      } catch (error) {
        throw toRenderError(error);
      } finally {
        page.cleanup();
      }
    },

    async images(index) {
      const page = await pageAt(index);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const list = await page.getOperatorList();
        const out: Area[] = [];
        let ctm: Matrix = [1, 0, 0, 1, 0, 0];
        const stack: Matrix[] = [];
        let forms = 0;
        for (let k = 0; k < list.fnArray.length; k++) {
          const fn = list.fnArray[k];
          const args = list.argsArray[k] as unknown[] | null;
          if (fn === OPS.beginAnnotation) break;
          if (fn === OPS.save) stack.push(ctm);
          else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
          else if (fn === OPS.transform && args && args.length >= 6) ctm = multiply(args.slice(0, 6) as unknown as Matrix, ctm);
          else if (fn === OPS.paintFormXObjectBegin) {
            forms++;
            stack.push(ctm);
            const m = args?.[0];
            if (Array.isArray(m) && m.length === 6) ctm = multiply(m as unknown as Matrix, ctm);
          } else if (fn === OPS.paintFormXObjectEnd) {
            forms = Math.max(0, forms - 1);
            ctm = stack.pop() ?? ctm;
          } else if (forms === 0 && (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject)) {
            const [x0, y0, x1, y1] = unitBox(ctm);
            const [ax, ay] = viewport.convertToViewportPoint(x0, y0);
            const [bx, by] = viewport.convertToViewportPoint(x1, y1);
            const x = Math.min(ax, bx) / viewport.width;
            const y = Math.min(ay, by) / viewport.height;
            const w = Math.abs(bx - ax) / viewport.width;
            const h = Math.abs(by - ay) / viewport.height;
            // A picture too small to see (a dot, a rule drawn as an image) is not offered.
            if (w > 0.01 && h > 0.01) out.push({ page: index, x, y, w, h });
          }
        }
        return out;
      } catch (error) {
        throw toRenderError(error);
      } finally {
        page.cleanup();
      }
    },

    async comments() {
      const current = live();
      const out: PdfComment[] = [];
      const KINDS: Record<string, string> = {
        Text: 'Note',
        FreeText: 'Text box',
        Highlight: 'Highlight',
        Underline: 'Underline',
        StrikeOut: 'Strike-through',
        Squiggly: 'Squiggle',
        Square: 'Box',
        Circle: 'Circle',
        Line: 'Line',
        Polygon: 'Shape',
        PolyLine: 'Line',
        Ink: 'Drawing',
        Stamp: 'Stamp',
        Caret: 'Insert',
        FileAttachment: 'Attached file',
        Sound: 'Sound',
      };
      // Two thousand pages is plenty to look through; past that the list says what it found.
      for (let index = 0; index < Math.min(current.numPages, 2000); index++) {
        const page = await pageAt(index);
        try {
          for (const raw of await page.getAnnotations({ intent: 'display' })) {
            const a = raw as { subtype?: string; contentsObj?: { str?: string }; titleObj?: { str?: string } };
            const kind = KINDS[a.subtype ?? ''];
            if (kind === undefined) continue;
            const text = (a.contentsObj?.str ?? '').trim();
            const author = (a.titleObj?.str ?? '').trim();
            out.push({ page: index, kind, text, ...(author ? { author } : {}) });
          }
        } catch {
          // A page whose comments cannot be read is passed over, not the whole list.
        } finally {
          page.cleanup();
        }
      }
      return out;
    },

    async outline() {
      const current = live();
      const raw = (await current.getOutline()) as readonly RawOutline[] | null;
      if (raw === null) return [];
      let budget = 2000; // a runaway outline is cut off rather than walked forever
      const pageOf = async (dest: unknown): Promise<number | null> => {
        try {
          const explicit = typeof dest === 'string' ? await current.getDestination(dest) : dest;
          if (!Array.isArray(explicit)) return null;
          const target: unknown = explicit[0];
          if (typeof target === 'number') return target;
          if (target !== null && typeof target === 'object') return await current.getPageIndex(target as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
          return null;
        } catch {
          return null;
        }
      };
      const walk = async (nodes: readonly RawOutline[], depth: number): Promise<OutlineItem[]> => {
        const out: OutlineItem[] = [];
        for (const node of nodes) {
          if (--budget < 0) break;
          const title = typeof node.title === 'string' ? node.title.replace(/\s+/g, ' ').trim() : '';
          out.push({
            title: title.length > 0 ? title : 'Untitled',
            page: await pageOf(node.dest),
            items: depth < 6 && Array.isArray(node.items) ? await walk(node.items, depth + 1) : [],
          });
        }
        return out;
      };
      return walk(raw, 0);
    },

    async fields() {
      // Typed as a record; pdf.js 6 actually sends a Map. Take either.
      const objects = (await live().getFieldObjects()) as unknown as Map<string, readonly RawField[]> | Record<string, readonly RawField[]> | null;
      if (objects === null) return [];
      const entries = objects instanceof Map ? [...objects.entries()] : Object.entries(objects);
      const out: FormField[] = [];
      for (const [name, widgets] of entries) {
        // The field itself comes first with no type; its widgets follow.
        const usable = widgets.filter((w) => typeof w.type === 'string' && w.type !== '' && w.editable !== false && w.hidden !== true);
        const first = usable[0];
        if (first === undefined) continue;
        const page = typeof first.page === 'number' ? first.page : 0;
        const value = typeof first.value === 'string' ? first.value : '';
        switch (first.type) {
          case 'text':
            out.push({
              kind: 'text',
              name,
              value,
              multiline: first.multiline === true,
              page,
              ...(typeof first.charLimit === 'number' && first.charLimit > 0 ? { maxLength: first.charLimit } : {}),
            });
            break;
          case 'checkbox':
            out.push({ kind: 'check', name, checked: value !== '' && value !== 'Off', page });
            break;
          case 'radiobutton': {
            const options = [...new Set(usable.map((w) => (typeof w.exportValues === 'string' ? w.exportValues : '')).filter(Boolean))];
            if (options.length > 0) out.push({ kind: 'choice', name, value: options.includes(value) ? value : '', options, page });
            break;
          }
          case 'combobox':
          case 'listbox': {
            if (first.multipleSelection === true) break;
            // People read the display text ("Tamil Nadu"), and pdf-lib selects by it;
            // the export value ("TN") is only what the form stores.
            const items = (first.items ?? []).flatMap((item) => {
              const shown = typeof item.displayValue === 'string' && item.displayValue.length > 0 ? item.displayValue : item.exportValue;
              return typeof shown === 'string' && shown.length > 0 ? [{ shown, stored: item.exportValue }] : [];
            });
            const options = items.map((i) => i.shown);
            const current = items.find((i) => i.stored === value || i.shown === value)?.shown ?? '';
            if (options.length > 0) out.push({ kind: 'choice', name, value: current, options, page });
            break;
          }
        }
      }
      return out.sort((a, b) => a.page - b.page);
    },

    async close() {
      if (doc === null) return;
      doc = null;
      // Destroying the loading task frees the document in the worker. The
      // worker itself is ours, not the task's, so it survives for the next open.
      await task.destroy();
    },
  };
}

function cancelled(cause?: unknown): PdfError {
  return new PdfError('Stopped.', 'cancelled', cause === undefined ? undefined : { cause });
}

/**
 * Everything pdf.js's worker throws reaches us re-created as one of a handful
 * of exception classes (see wrapReason in pdf.js), so instanceof is reliable.
 */
function toOpenError(error: unknown, header: Uint8Array, byteLength: number): PdfError {
  if (error instanceof PdfError) return error;
  if (error instanceof PasswordException) {
    return error.code === PasswordResponses.INCORRECT_PASSWORD
      ? new PdfError("That password didn't open it. Check it and try again.", 'wrong-password', {
          cause: error,
        })
      : new PdfError('This file is locked with a password.', 'encrypted', { cause: error });
  }
  if (isMemoryFailure(error)) return tooLarge(byteLength, error);
  if (error instanceof InvalidPDFException) return notReadable(header, error);
  if (error instanceof AbortException) return cancelled(error);
  return new PdfError("This PDF couldn't be read.", 'unknown', { cause: error });
}

function toRenderError(error: unknown): PdfError {
  if (error instanceof PdfError) return error;
  if (error instanceof RenderingCancelledException || error instanceof AbortException) {
    return cancelled(error);
  }
  if (isMemoryFailure(error)) {
    return new PdfError("This page is too big to draw on this device's memory.", 'too-large', {
      cause: error,
    });
  }
  return new PdfError("This page couldn't be drawn.", 'unknown', { cause: error });
}
