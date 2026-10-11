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
import { ArityError, OpCancelled, type MergeParams, type Outcome, type SplitParams } from '../ops/op';
import { LIVE_TOOLS, toolById, toolPath, type ToolId } from '../ops/tools';
import { PdfError, type PdfEngine } from '../pdf/types';
import { HANDOFF_KEY } from '../site/config';
import { devlog } from '../ui/devlog';
import { el } from '../ui/dom';
import { bindDropZone } from '../ui/drop-zone';
import { renderFileList, type Entry } from '../ui/file-list';
import { createPageGrid, type PageGrid } from '../ui/page-grid';
import { createProgress } from '../ui/progress';
import { TOO_LARGE, renderResult } from '../ui/result';
import { mountShell } from '../ui/shell';
import { createSplitOptions, type SplitOptions } from '../ui/split-options';

mountShell();

const toolId = document.body.dataset['tool'] as ToolId | undefined;
const meta = toolId && LIVE_TOOLS.some((t) => t.id === toolId) ? toolById(toolId) : null;
const body = document.querySelector<HTMLElement>('[data-slot="body"]');
const zone = document.querySelector<HTMLElement>('[data-testid="drop-zone"]');
const input = document.querySelector<HTMLInputElement>('[data-testid="file-input"]');

if (meta && body && zone && input) {
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

async function mount(id: ToolId, body: HTMLElement, zone: HTMLElement, input: HTMLInputElement): Promise<void> {
  const tool = toolById(id);
  const several = tool.input === 'several-pdfs';

  // ---- Static parts of the page below the drop zone ----
  const notice = el('div', { class: 'notice', attrs: { role: 'status', 'aria-live': 'polite' } });
  notice.hidden = true;
  const fileList = el('ol', { class: 'file-list', testid: 'file-list', attrs: { 'aria-label': 'Your files' } });
  const optionsSlot = el('div');
  const runButton = el('button', { class: 'button button--block', testid: 'run-button', text: tool.action, attrs: { type: 'button', disabled: '' } });
  const runNote = el('p', { class: 'run__note' });
  const runArea = el('div', { class: 'run' }, [runButton, runNote]);
  const progressSlot = el('div');
  const resultSlot = el('div');
  body.append(notice, fileList, optionsSlot, runArea, progressSlot, resultSlot);
  body.classList.add('tool__body');

  const say = (text: string, kind: 'error' | 'ok' | 'info' = 'info') => {
    notice.textContent = text;
    notice.className = `notice${kind === 'error' ? ' notice--error' : kind === 'ok' ? ' notice--ok' : ''}`;
    notice.hidden = text.length === 0;
  };

  // ---- Tool-specific options ----
  let split: SplitOptions | null = null;
  let grid: PageGrid | null = null;
  if (id === 'split') {
    split = createSplitOptions(() => refresh());
    optionsSlot.append(split.root);
  }
  if (id === 'organise') {
    grid = createPageGrid(() => refresh());
    optionsSlot.append(grid.root);
  }

  // ---- State ----
  const entries: Entry[] = [];
  let job: JobHandle | null = null;
  let ws: Workspace | null = null;
  let runner: JobRunner | null = null;
  const enginePromise = loadEngine();

  const nameOf = (fileId: string): string => entries.find((e) => e.file.id === fileId)?.file.name ?? '';

  function runnable(): boolean {
    if (job || !runner) return false;
    if (several) return entries.length >= 2;
    if (entries.length !== 1) return false;
    if (grid) return grid.count() > 0;
    return true;
  }

  function refresh(): void {
    renderFileList(fileList, entries, several, {
      move: (index, delta) => {
        const to = index + delta;
        const a = entries[index];
        const b = entries[to];
        if (!a || !b) return;
        entries[index] = b;
        entries[to] = a;
        refresh();
      },
      remove: (index) => void removeEntry(index),
      password: (index, password) => void unlock(index, password),
    });
    runButton.disabled = !runnable();
    if (several && entries.length === 1) runNote.textContent = 'Add at least one more PDF to merge.';
    else if (grid && entries.length === 1 && grid.count() === 0) runNote.textContent = 'Every page is deleted. Restore at least one.';
    else runNote.textContent = '';
  }

  async function removeEntry(index: number): Promise<void> {
    const entry = entries[index];
    if (!entry || !ws) return;
    entries.splice(index, 1);
    refresh();
    if (grid && entries.length === 0) await grid.destroy();
    await ws.remove(entry.file).catch(() => undefined);
  }

  /** Opens the file once on the page-thread engine for its page count (and, for organise, its grid). */
  async function inspect(entry: Entry): Promise<void> {
    if (!ws) return;
    try {
      const engine = await enginePromise;
      const blob = await ws.read(entry.file);
      const view = await engine.open(blob, entry.password === undefined ? {} : { password: entry.password });
      entry.pages = view.pageCount;
      delete entry.error;
      delete entry.errorCode;
      if (grid && entries[0] === entry) await grid.load(view);
      else await view.close();
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

  async function addFiles(files: readonly File[]): Promise<void> {
    if (!ws) return;
    say('');
    clearResult();
    if (!several) {
      // One-pdf tools replace: a second drop means "this one instead".
      while (entries.length > 0) await removeEntry(0);
      files = files.slice(0, 1);
    }
    const store = createDocumentStore(ws);
    const results = await store.import(files);
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
      case 'split':
        return (split?.params() ?? { mode: 'single' }) satisfies SplitParams;
      case 'organise':
        return grid?.params() ?? { pages: [] };
      default:
        return {};
    }
  }

  async function pageCounts(outcomes: readonly Outcome[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (!ws) return counts;
    const engine = await enginePromise;
    for (const outcome of outcomes) {
      if (outcome.kind !== 'produced') continue;
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
    // The grid holds a pdf.js document; let it go before the page does.
    void grid?.destroy();
    location.href = toolPath(target);
  }

  async function startOver(): Promise<void> {
    clearResult();
    say('');
    entries.length = 0;
    refresh();
    await grid?.destroy();
    await ws?.clear();
    zone.focus();
  }

  function showOutcomes(outcomes: readonly Outcome[], counts: ReadonlyMap<string, number>): void {
    if (!ws) return;
    const workspace = ws;
    const exporter = createExporter(workspace);
    clearResult();
    resultSlot.append(
      renderResult(outcomes, {
        tool,
        exporter,
        nameOf,
        pages: counts,
        handoff: workspace.backend === 'opfs' ? handoff : null,
        startOver: () => void startOver(),
      }),
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
    let handle: JobHandle;
    try {
      handle = runner.run(id, entries.map((e) => e.file), params(), {
        onProgress: (p) => progress.update(p),
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
  bindDropZone(zone, input, (files) => void addFiles(files));

  // ---- Bring the machinery up ----
  const handoffIds = takeHandoff();
  const workspace = await createWorkspace();
  ws = workspace;
  document.body.dataset['storageBackend'] = workspace.backend;
  const jobRunner = createJobRunner(workspace);
  runner = jobRunner;

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

  window.addEventListener('pagehide', () => void grid?.destroy());

  try {
    await Promise.all([workspace.ready, jobRunner.ready, enginePromise.then((e) => e.ready)]);
    document.body.dataset['ready'] = 'true';
  } catch (error) {
    devlog('ready', error);
    say('This browser could not start the tools. Try a current version of Chrome, Edge, Firefox or Safari.', 'error');
  }
}
