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
  RenderingCancelledException,
  VerbosityLevel,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PDFWorker,
} from 'pdfjs-dist';
import { isMemoryFailure, normaliseRotation, notReadable, tooLarge } from './common';
import { PDFJS_ASSETS } from './pdfjs-version';
import { PdfError, type FormField, type OutlineItem, type PageInfo, type PdfEngine, type PdfView } from './types';

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
  readonly items?: ReadonlyArray<{ readonly exportValue?: unknown }>;
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
            out.push({ kind: 'text', name, value, multiline: first.multiline === true, page });
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
            const options = (first.items ?? []).map((item) => item.exportValue).filter((v): v is string => typeof v === 'string' && v.length > 0);
            if (options.length > 0) out.push({ kind: 'choice', name, value: options.includes(value) ? value : '', options, page });
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
