/**
 * Reads an output back the way a reader app would, with pdf.js in Node: the
 * words on each page, each page's size and turn as shown, the bookmarks and
 * where they go, the page labels, the details, the form fields and the
 * annotations. What a test checks an output against.
 *
 * Tests may name the libraries: the seam rule applies to app/ only.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsWorkerModule } from './pdfjs-worker';

type PdfJs = typeof import('pdfjs-dist');
let loading: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    await import('../../app/src/pdf/shims');
    (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
    return import('pdfjs-dist');
  })();
  return loading;
}

export interface ReadOutline {
  readonly title: string;
  /** Zero-based page, or null for a bookmark that opens something else (a web page). */
  readonly page: number | null;
  /** The destination as pdf.js resolved it: [page, kind, ...numbers]. */
  readonly kind: string | null;
  readonly url: string | null;
  /** Whether the entry shows its children (null when it has none). */
  readonly open: boolean | null;
  readonly items: readonly ReadOutline[];
}

export interface ReadPage {
  readonly text: string;
  /** As shown: after /Rotate and the visible box. */
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  /** [x1, y1, x2, y2] of the visible box. */
  readonly view: readonly number[];
  readonly annotations: ReadonlyArray<{ readonly subtype: string; readonly rect: readonly number[]; readonly url?: string; readonly dest?: number | null; readonly fieldName?: string; readonly value?: unknown }>;
}

export interface ReadPdf {
  readonly pages: readonly ReadPage[];
  readonly outline: readonly ReadOutline[];
  readonly labels: readonly string[] | null;
  readonly title: string | undefined;
  readonly author: string | undefined;
  /** Field name → value, for every field widget on the pages (what a reader draws and lets you type into). */
  readonly fields: Readonly<Record<string, unknown>>;
  /** The names the document's form lists: a field missing here cannot be filled in most readers. */
  readonly formFields: readonly string[];
}

/** Everything a test checks, read with pdf.js. */
export async function readPdf(bytes: Uint8Array, password?: string): Promise<ReadPdf> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: bytes.slice(), verbosity: 0, ...(password ? { password } : {}) });
  const doc = await task.promise;
  try {
    const pages: ReadPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim();
      const viewport = page.getViewport({ scale: 1 });
      const annots = await page.getAnnotations();
      const annotations = [];
      for (const a of annots as Array<Record<string, unknown>>) {
        const dest = a['dest'];
        annotations.push({
          subtype: String(a['subtype']),
          rect: (a['rect'] as number[]).map((n) => Math.round(n * 100) / 100),
          ...(typeof a['url'] === 'string' ? { url: a['url'] } : {}),
          ...(dest !== undefined ? { dest: await pageOf(doc, dest) } : {}),
          ...(typeof a['fieldName'] === 'string' ? { fieldName: a['fieldName'], value: a['fieldValue'] } : {}),
        });
      }
      pages.push({
        text,
        width: Math.round(viewport.width * 100) / 100,
        height: Math.round(viewport.height * 100) / 100,
        rotation: page.rotate,
        view: page.view.map((n) => Math.round(n * 100) / 100),
        annotations,
      });
    }
    const raw = (await doc.getOutline()) ?? [];
    const walk = async (nodes: readonly Record<string, unknown>[]): Promise<ReadOutline[]> => {
      const out: ReadOutline[] = [];
      for (const node of nodes) {
        const explicit = typeof node['dest'] === 'string' ? await doc.getDestination(node['dest']) : node['dest'];
        const kind = Array.isArray(explicit) ? String((explicit[1] as { name?: string })?.name ?? explicit[1]) : null;
        const items = (node['items'] as Record<string, unknown>[]) ?? [];
        out.push({
          title: String(node['title']),
          page: await pageOf(doc, node['dest']),
          kind,
          url: typeof node['url'] === 'string' ? node['url'] : null,
          open: items.length === 0 ? null : (node['count'] as number | undefined) === undefined ? true : (node['count'] as number) > 0,
          items: await walk(items),
        });
      }
      return out;
    };
    const outline = await walk(raw as unknown as Record<string, unknown>[]);
    const labels = await doc.getPageLabels();
    const meta = await doc.getMetadata();
    const info = meta.info as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const page of pages) for (const a of page.annotations) if (a.fieldName !== undefined) fields[a.fieldName] = a.value;
    let formFields: string[] = [];
    try {
      const lib = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
      formFields = lib.getForm().getFields().map((f) => f.getName());
    } catch {
      formFields = [];
    }
    return {
      pages,
      outline,
      labels,
      title: typeof info['Title'] === 'string' ? info['Title'] : undefined,
      author: typeof info['Author'] === 'string' ? info['Author'] : undefined,
      fields,
      formFields,
    };
  } finally {
    await task.destroy();
  }
}

async function pageOf(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const target: unknown = explicit[0];
    if (typeof target === 'number') return target;
    if (target !== null && typeof target === 'object') return await doc.getPageIndex(target as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
    return null;
  } catch {
    return null;
  }
}

/** The "… page n" marker on each page, in order: [3, 4, 1] for a document whose pages came from those. */
export function markers(read: ReadPdf, word: string): Array<number | null> {
  return read.pages.map((page) => {
    const m = new RegExp(`(?:${word}) page (\\d+)`).exec(page.text);
    return m ? Number(m[1]) : null;
  });
}

/** The outline as "title→page" lines, indented by depth, for a readable comparison. */
export function outlineLines(items: readonly ReadOutline[], depth = 0): string[] {
  return items.flatMap((item) => [
    `${'  '.repeat(depth)}${item.title}→${item.page === null ? (item.url ?? 'none') : item.page + 1}`,
    ...outlineLines(item.items, depth + 1),
  ]);
}
