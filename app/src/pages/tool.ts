/**
 * One module for every tool page. The HTML carries the title, the summary and
 * a working file input; this adds the list, the options, the run and the
 * result, and wires the file layer, the engine and the job runner together.
 *
 * Load order, which the offline proof depends on: the workspace is probed and
 * the job runner's worker made right away; the engine module is imported after
 * first paint; `data-ready` goes on <body> once all three are ready, and
 * nothing is fetched after that.
 */
import { createDocumentStore, createExporter, createWorkspace, type FoolscapFile, type Workspace } from '../files';
import { JobCrashed, createJobRunner, type JobHandle, type JobRunner } from '../jobs';
import { createJobPool, type JobPool } from '../jobs/pool';
import { opMeta } from '../ops/meta';
import { ArityError, OpCancelled, type MergeParams, type Outcome } from '../ops/op';
import { LIVE_TOOLS, toolById, toolPath, type ToolId } from '../ops/tools';
import { PdfError, type PdfEngine, type PdfView } from '../pdf/types';
import { HANDOFF_KEY } from '../site/config';
import { devlog } from '../ui/devlog';
import { el } from '../ui/dom';
import { bindDropZone } from '../ui/drop-zone';
import { FILE_THUMB, createFileList, type Entry } from '../ui/file-list';
import type { EditorMode } from '../ui/page-editor';
import { createPageGrid, type PageGrid } from '../ui/page-grid';
import type { ScanPanel } from '../ui/scan-panel';
import { watchNetwork, type NetworkWatch } from '../ui/network-proof';
import { createProgress } from '../ui/progress';
import { TOO_LARGE, renderResult } from '../ui/result';
import { mountShell } from '../ui/shell';
import { dockWithRun } from '../ui/dock';
import '../ui/flow.css';
import { imageThumb, pdfThumb, type Box } from '../ui/thumbs';
import { createToolOptions, type ToolOptions } from '../ui/tool-options';

mountShell();

const EDITORS: ReadonlySet<ToolId> = new Set<ToolId>(['sign', 'add-text', 'mark-up', 'remove-areas', 'add-image', 'edit-text', 'create-form', 'edit-images']);

const toolId = document.body.dataset['tool'] as ToolId | undefined;
const meta = toolId && LIVE_TOOLS.some((t) => t.id === toolId) ? toolById(toolId) : null;
const body = document.querySelector<HTMLElement>('[data-slot="body"]');
const zone = document.querySelector<HTMLElement>('[data-testid="drop-zone"]');
const input = document.querySelector<HTMLInputElement>('[data-testid="file-input"]');

if (meta && body && ((zone && input) || meta.input === 'none')) {
  void mount(meta.id, body, zone, input);
}

/** The engine module is imported after first paint: it is the biggest script and nothing above the fold needs it. */
function loadEngine(): Promise<PdfEngine> {
  return new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 500 });
    else requestAnimationFrame(() => resolve());
  }).then(() => import('../pdf/engine').then((m) => m.createEngine()));
}

/** Reads and removes the handoff: ids only, never names. Anything malformed is ignored. */
function takeHandoff(): string[] {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Remembers this tool as recently used, for the home page's row: tool ids only, never a file. */
function remember(id: ToolId): void {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem('foolscap.recent') ?? '[]');
    const ids = Array.isArray(kept) ? kept.filter((x): x is string => typeof x === 'string' && x !== id) : [];
    localStorage.setItem('foolscap.recent', JSON.stringify([id, ...ids].slice(0, 6)));
  } catch {
    // No storage, no row: nothing else depends on it.
  }
}

async function mount(id: ToolId, body: HTMLElement, zone: HTMLElement | null, input: HTMLInputElement | null): Promise<void> {
  const tool = toolById(id);
  remember(id);
  const several = tool.input !== 'one-pdf';
  // A viewer (Read) has no Op: it takes one file and shows it.
  const arity = tool.viewer ? ({ kind: 'one' } as const) : opMeta(id).arity;
  const takesImages = tool.input === 'images' || tool.input === 'camera';
  const noun = takesImages ? 'image' : tool.input === 'office' ? 'file' : 'PDF';

  // ---- Static parts of the page below the drop zone ----
  const notice = el('div', { class: 'notice', attrs: { role: 'status', 'aria-live': 'polite' } });
  notice.hidden = true;
  const fileList = createFileList({
    move: (index, delta) => {
      const to = index + delta;
      const a = entries[index];
      const b = entries[to];
      if (!a || !b) return;
      entries[index] = b;
      entries[to] = a;
      refresh();
    },
    reorder: (from, to) => {
      const [entry] = entries.splice(from, 1);
      if (!entry) return;
      entries.splice(Math.max(0, Math.min(entries.length, to)), 0, entry);
      refresh();
    },
    remove: (index) => void removeEntry(index),
    password: (index, password) => void unlock(index, password),
  });
  const optionsSlot = el('div');
  const runButton = el('button', { class: 'button button--block', testid: 'run-button', text: tool.action, attrs: { type: 'button', disabled: '' } });
  const runNote = el('p', { class: 'run__note' });
  const runArea = el('div', { class: 'run' }, [runButton, runNote]);
  const progressSlot = el('div');
  const resultSlot = el('div');
  body.append(notice, fileList.root, optionsSlot, runArea, progressSlot, resultSlot);
  body.classList.add('tool__body');

  const say = (text: string, kind: 'error' | 'ok' | 'info' = 'info') => {
    notice.textContent = text;
    notice.className = `notice${kind === 'error' ? ' notice--error' : kind === 'ok' ? ' notice--ok' : ''}`;
    notice.hidden = text.length === 0;
  };

  // ---- Tool-specific options ----
  let grid: PageGrid | null = null;
  let options: ToolOptions | null = null;
  // A panel that needs the document itself: the page editor, or the form.
  let scanner: ScanPanel | null = null;
  let panel: { root: HTMLElement; load(view: PdfView): Promise<void>; params(): unknown; problem(): string | null; destroy(): Promise<void> } | null = null;
  if (id === 'organise') {
    grid = createPageGrid(() => refresh());
    optionsSlot.append(grid.root);
  } else if (EDITORS.has(id)) {
    // The panels are big and each serves one or two tools, so they are fetched
    // here rather than carried in every tool page's first script. Still before
    // the page says it is ready, so the offline proof holds.
    const { createPageEditor } = await import('../ui/page-editor');
    panel = createPageEditor(id as EditorMode, () => refresh(), {
      // Edit text on a scan: the page's picture is read by the worker's OCR reader.
      readScan: (png, width, height) => (runner ? runner.read(png, width, height) : Promise.reject(new Error('Not ready yet.'))),
    });
    optionsSlot.append(panel.root);
  } else if (id === 'read') {
    const { createReader } = await import('../ui/reader');
    panel = createReader((target) => {
      const file = entries[0]?.file;
      if (!file || ws?.backend !== 'opfs') {
        say('This browser cannot pass the file along. Open the tool you want and pick the file there.', 'error');
        return;
      }
      handoff(target, [file]);
    });
    optionsSlot.append(panel.root);
    runArea.hidden = true;
  } else if (id === 'summarise') {
    const { createAiPanel } = await import('../ui/ai-panel');
    panel = createAiPanel();
    optionsSlot.append(panel.root);
    runArea.hidden = true;
  } else if (id === 'scan') {
    const { createScanPanel } = await import('../ui/scan-panel');
    scanner = createScanPanel(() => refresh());
    optionsSlot.append(scanner.root);
  } else if (id === 'bookmarks') {
    const { createBookmarksPanel } = await import('../ui/bookmarks-panel');
    panel = createBookmarksPanel(() => refresh());
    optionsSlot.append(panel.root);
  } else if (id === 'fill-form') {
    const { createFormPanel } = await import('../ui/form-panel');
    panel = createFormPanel(() => refresh());
    optionsSlot.append(panel.root);
  } else {
    options = createToolOptions(id, () => refresh());
    if (options) optionsSlot.append(options.root);
  }

  // ---- State ----
  const entries: Entry[] = [];
  let job: JobHandle | null = null;
  let ws: Workspace | null = null;
  let runner: JobRunner | null = null;
  let pool: JobPool | null = null;
  let network: NetworkWatch | null = null;
  const enginePromise = loadEngine();

  const nameOf = (fileId: string): string => entries.find((e) => e.file.id === fileId)?.file.name ?? '';

  /** Why the run cannot start, in words, or '' when it can (or when there is nothing to say yet). */
  function blocker(): string {
    const n = entries.length;
    // A template takes no file: what is typed is all it needs.
    if (tool.input === 'none') return options?.problem(0) ?? '';
    if (n === 0) return '';
    if (arity.kind === 'together' && n < arity.min) {
      const more = arity.min - n;
      return id === 'merge' ? 'Add at least one more PDF to merge.' : `Add ${more} more ${noun}${more === 1 ? '' : 's'}.`;
    }
    if (arity.kind === 'one' && n !== 1) return `${tool.title} works on one file at a time.`;
    // A locked file is asked for its password on its own row; running first would only fail.
    const locked = entries.filter((e) => e.errorCode === 'encrypted' || e.errorCode === 'wrong-password').length;
    if (locked > 0 && (arity.kind !== 'each' || locked === n)) {
      return locked === 1 ? 'Type the password for the locked file, then tap Unlock.' : 'Type the passwords for the locked files, then tap Unlock.';
    }
    if (entries.every((e) => e.error !== undefined && e.errorCode !== 'encrypted' && e.errorCode !== 'wrong-password')) {
      return n === 1 ? "This file couldn't be read. Pick another one." : 'None of these files could be read.';
    }
    if (grid && grid.count() === 0) return 'Every page is deleted. Restore at least one.';
    if (panel && n === 1 && entries[0]?.pages !== undefined) return panel.problem() ?? '';
    if (scanner) return scanner.problem() ?? '';
    return options?.problem(n) ?? '';
  }

  function runnable(): boolean {
    if (job || !runner || (entries.length === 0 && tool.input !== 'none')) return false;
    return blocker() === '';
  }

  function refresh(): void {
    fileList.render(entries, several);
    if (scanner && ws) scanner.sync(entries.map((e) => e.file), ws);
    runButton.disabled = !runnable();
    runNote.textContent = blocker();
  }

  async function removeEntry(index: number): Promise<void> {
    const entry = entries[index];
    if (!entry || !ws) return;
    entries.splice(index, 1);
    refresh();
    if (grid && entries.length === 0) await grid.destroy();
    if (panel && entries.length === 0) await panel.destroy();
    await ws.remove(entry.file).catch(() => undefined);
  }

  /** Opens the file once on the page-thread engine for its page count (and, for organise, its grid). */
  /** The row's small picture of the first page, drawn once the page count is on screen. */
  async function thumbOf(entry: Entry, view: PdfView): Promise<void> {
    if (entry.thumb) return;
    refresh();
    try {
      entry.thumb = await pdfThumb(view, FILE_THUMB, 'file-thumb');
    } catch (error) {
      // The row keeps its "PDF" tile; nothing else depends on the picture.
      devlog('thumb', error);
    }
  }

  async function inspect(entry: Entry): Promise<void> {
    if (!ws) return;
    if (entry.file.kind === 'image') {
      try {
        entry.thumb ??= await imageThumb(await ws.read(entry.file), FILE_THUMB, 'file-thumb');
      } catch (error) {
        devlog('thumb', error);
      }
      refresh();
      return;
    }
    if (entry.file.kind !== 'pdf') return;
    try {
      const engine = await enginePromise;
      const blob = await ws.read(entry.file);
      const view = await engine.open(blob, entry.password === undefined ? {} : { password: entry.password });
      entry.pages = view.pageCount;
      delete entry.error;
      delete entry.errorCode;
      // The grid and the panels own the view from here, and keep it open while they show it.
      if (grid && entries[0] === entry) {
        await grid.load(view);
        await thumbOf(entry, view);
      } else if (panel && entries[0] === entry) {
        await panel.load(view);
        await thumbOf(entry, view);
      } else {
        if (options?.load && entries[0] === entry) await options.load(view).catch((error: unknown) => devlog('options', error));
        await thumbOf(entry, view);
        await view.close();
      }
    } catch (error) {
      if (error instanceof PdfError) {
        entry.error = error.message;
        entry.errorCode = error.code;
      } else {
        entry.error = "This file couldn't be read. Try picking it again.";
        devlog('inspect', error);
      }
    }
    refresh();
  }

  async function unlock(index: number, password: string): Promise<void> {
    const entry = entries[index];
    if (!entry) return;
    entry.password = password;
    await inspect(entry);
  }

  async function addFiles(files: readonly File[], fromFolder = false): Promise<void> {
    if (!ws) return;
    say('');
    clearResult();
    // A folder holds all sorts: only what this tool takes is picked up from it, and the rest is counted.
    let skipped = 0;
    if (fromFolder) {
      const wanted = takesImages ? /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i : tool.input === 'office' ? /\.(docx|xlsx)$/i : tool.input === 'pdf-and-files' ? /./ : /\.pdf$/i;
      const kept = files.filter((f) => wanted.test(f.name) && !f.name.startsWith('.'));
      skipped = files.length - kept.length;
      files = kept;
      if (files.length === 0) {
        say(`Nothing in that folder is ${takesImages ? 'a picture' : tool.input === 'office' ? 'a Word or Excel file' : 'a PDF'}.`, 'error');
        return;
      }
    }
    if (!several) files = files.slice(0, 1);
    const store = createDocumentStore(ws, takesImages ? 'image' : tool.input === 'pdf-and-files' || tool.input === 'office' ? 'any' : 'pdf');
    const results = await store.import(files);
    // One-pdf tools replace: a second drop means "this one instead". A drop
    // that is refused (empty, not a PDF) leaves the file already there alone.
    if (!several && results.some((result) => result.ok)) while (entries.length > 0) await removeEntry(0);
    const problems: string[] = [];
    const added: Entry[] = [];
    for (const result of results) {
      if (result.ok) {
        const entry: Entry = { file: result.file };
        entries.push(entry);
        added.push(entry);
      } else {
        problems.push(`${result.name}: ${result.reason}`);
      }
    }
    if (problems.length > 0) say(problems.join(' '), 'error');
    else if (skipped > 0) say(`${added.length} from the folder; ${skipped} other ${skipped === 1 ? 'file was' : 'files were'} left out.`);
    refresh();
    for (const entry of added) await inspect(entry);
  }

  async function adopt(files: readonly FoolscapFile[]): Promise<void> {
    const kept = several ? files : files.slice(0, 1);
    for (const file of kept) entries.push({ file });
    if (!several && files.length > 1 && ws) {
      say(`${tool.title} works on one file at a time, so the first one was kept.`);
      await Promise.all(files.slice(1).map((f) => ws?.remove(f).catch(() => undefined)));
    }
    refresh();
    for (const entry of entries) await inspect(entry);
  }

  function clearResult(): void {
    resultSlot.replaceChildren();
  }

  function params(): unknown {
    switch (id) {
      case 'merge':
        return {} satisfies MergeParams;
      case 'organise':
        return grid?.params() ?? { pages: [] };
      default:
        return scanner?.params() ?? panel?.params() ?? options?.params() ?? {};
    }
  }

  async function pageCounts(outcomes: readonly Outcome[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (!ws) return counts;
    const engine = await enginePromise;
    for (const outcome of outcomes) {
      if (outcome.kind !== 'produced' || outcome.file.kind !== 'pdf') continue;
      try {
        const view = await engine.open(await ws.read(outcome.file));
        counts.set(outcome.file.id, view.pageCount);
        await view.close();
      } catch (error) {
        devlog('count', error);
      }
    }
    return counts;
  }

  function handoff(target: ToolId, files: readonly FoolscapFile[]): void {
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(files.map((f) => f.id)));
    } catch {
      say('This browser would not let the files travel to the next tool. Save them, then open it yourself.', 'error');
      return;
    }
    // The grid and the editor hold a pdf.js document; let it go before the page does.
    void grid?.destroy();
    void panel?.destroy();
    location.href = toolPath(target);
  }

  async function startOver(): Promise<void> {
    clearResult();
    say('');
    entries.length = 0;
    refresh();
    await grid?.destroy();
    await panel?.destroy();
    await ws?.clear();
    input?.focus();
  }

  /** A result's first page or picture, drawn after the result is on screen. Null for anything else. */
  async function preview(workspace: Workspace, file: FoolscapFile, box: Box): Promise<HTMLCanvasElement | null> {
    if (file.kind === 'image') return imageThumb(await workspace.read(file), box, 'result-preview');
    if (file.kind !== 'pdf') return null;
    const engine = await enginePromise;
    const view = await engine.open(await workspace.read(file));
    try {
      return await pdfThumb(view, box, 'result-preview');
    } finally {
      await view.close();
    }
  }

  function showOutcomes(outcomes: readonly Outcome[], counts: ReadonlyMap<string, number>): void {
    if (!ws) return;
    const workspace = ws;
    const exporter = createExporter(workspace);
    clearResult();
    const proof = network?.stop() ?? null;
    network = null;
    resultSlot.append(
      renderResult(outcomes, {
        tool,
        exporter,
        nameOf,
        pages: counts,
        preview: (file, box) => preview(workspace, file, box),
        handoff: workspace.backend === 'opfs' ? handoff : null,
        startOver: () => void startOver(),
      }),
      ...(proof ? [proof] : []),
    );
    resultSlot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function run(): Promise<void> {
    if (!runner || !ws || job) return;
    say('');
    clearResult();
    const passwords = new Map<string, string>();
    for (const entry of entries) if (entry.password !== undefined) passwords.set(entry.file.id, entry.password);

    const progress = createProgress(() => job?.cancel());
    const watch = watchNetwork();
    network = watch;
    let handle: JobHandle;
    try {
      handle = (pool ?? runner).run(id, entries.map((e) => e.file), params(), {
        onProgress: (p) => progress.update(p),
        onRequests: (n) => watch.add(n),
        ...(passwords.size > 0 ? { passwords } : {}),
      });
    } catch (error) {
      say(error instanceof ArityError ? error.message : 'That could not be started. Try again.', 'error');
      return;
    }
    job = handle;
    progress.update({ done: 0, total: 0, label: 'Starting…' });
    progressSlot.replaceChildren(progress.root);
    refresh();

    try {
      const outcomes = await handle.done;
      const counts = await pageCounts(outcomes);
      showOutcomes(outcomes, counts);
    } catch (error) {
      if (error instanceof OpCancelled) {
        say('Stopped. Nothing was saved.');
      } else if (error instanceof JobCrashed) {
        showOutcomes([{ kind: 'failed', inputIds: entries.map((e) => e.file.id), reason: TOO_LARGE, code: 'too-large' }], new Map());
      } else {
        devlog('run', error);
        say('Something went wrong and the job stopped. Try again, or try a smaller file.', 'error');
      }
    } finally {
      job = null;
      progressSlot.replaceChildren();
      refresh();
    }
  }

  runButton.addEventListener('click', () => void run());
  dockWithRun(runArea, runButton);
  if (zone && input) bindDropZone(zone, input, (files) => void addFiles(files));
  const folderInput = document.querySelector<HTMLInputElement>('[data-testid="folder-input"]');
  folderInput?.addEventListener('change', () => {
    const files = folderInput.files ? [...folderInput.files] : [];
    folderInput.value = '';
    if (files.length > 0) void addFiles(files, true);
  });

  // ---- Bring the machinery up ----
  const handoffIds = takeHandoff();
  const workspace = await createWorkspace();
  ws = workspace;
  document.body.dataset['storageBackend'] = workspace.backend;
  const jobRunner = createJobRunner(workspace, {
    engine: !tool.viewer && opMeta(id).engine === true,
    ocr: !tool.viewer && opMeta(id).ocr === true,
  });
  runner = jobRunner;
  // A big batch for a tool that works on each file alone is shared between workers.
  const workerOptions = { engine: !tool.viewer && opMeta(id).engine === true, ocr: !tool.viewer && opMeta(id).ocr === true };
  pool = createJobPool(jobRunner, () => createJobRunner(workspace, workerOptions));

  // Nothing stays behind from a previous visit, except the files a "Then…" just handed over.
  if (handoffIds.length > 0) {
    await workspace.clearExcept(handoffIds);
    const all = await workspace.list();
    const byId = new Map(all.map((f) => [f.id, f]));
    const files = handoffIds.map((fid) => byId.get(fid)).filter((f): f is FoolscapFile => f !== undefined);
    await adopt(files);
  } else {
    await workspace.clear();
  }
  refresh();

  window.addEventListener('pagehide', () => {
    void grid?.destroy();
    void panel?.destroy();
  });

  try {
    await Promise.all([workspace.ready, jobRunner.ready, enginePromise.then((e) => e.ready)]);
    document.body.dataset['ready'] = 'true';
  } catch (error) {
    devlog('ready', error);
    say('This browser could not start the tools. Try a current version of Chrome, Edge, Firefox or Safari.', 'error');
  }
}
