/**
 * Open a file. Drop anything — PDFs, photos, Word or Excel, a whole folder —
 * and the page looks at it on this device and says what can be done with
 * it. Tapping a suggestion carries the files to that tool (by id, through
 * the workspace, as "Then…" does). Saved recipes run here too, and this is
 * where "Share → Foolscap" on a phone and "Open with Foolscap" on a computer
 * land.
 *
 * The page handles documents, so it is served with the strict policy, never
 * the home page's ad policy: nothing but this site's own code can run here.
 */
import { createDocumentStore, createWorkspace, type FoolscapFile, type Workspace } from '../files';
import { listenForLaunchedFiles } from '../files/launch';
import { toolById, toolPath, type ToolId } from '../ops/tools';
import { SCAN_COVER } from '../pdf/page-cover';
import { PdfError, type PdfEngine } from '../pdf/types';
import { HANDOFF_KEY } from '../site/config';
import { devlog } from '../ui/devlog';
import { el, icon } from '../ui/dom';
import { bindDropZone } from '../ui/drop-zone';
import { formatSize, plural } from '../ui/format';
import { mountShell } from '../ui/shell';
import '../ui/flow.css';
import { officeByName, suggest, type FileFacts } from '../ui/suggest';
import { TOOL_ICONS } from '../ui/tool-icons';
import { mountRecipes, type RecipesPanel } from '../ui/recipes';
import { imageThumb, pdfThumb, type Box } from '../ui/thumbs';

mountShell();

interface Opened {
  readonly file: FoolscapFile;
  readonly facts: FileFacts;
}

const body = document.querySelector<HTMLElement>('[data-slot="body"]');
const zone = document.querySelector<HTMLElement>('[data-testid="drop-zone"]');
const input = document.querySelector<HTMLInputElement>('[data-testid="file-input"]');
const folder = document.querySelector<HTMLInputElement>('[data-testid="folder-input"]');
if (body && zone && input) void mount(body, zone, input, folder);

function loadEngine(): Promise<PdfEngine> {
  return new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 500 });
    else requestAnimationFrame(() => resolve());
  }).then(() => import('../pdf/engine').then((m) => m.createEngine()));
}

async function mount(body: HTMLElement, zone: HTMLElement, input: HTMLInputElement, folder: HTMLInputElement | null): Promise<void> {
  const notice = el('div', { class: 'notice', attrs: { role: 'status', 'aria-live': 'polite' } });
  notice.hidden = true;
  const looking = el('p', { class: 'open__looking', testid: 'open-looking', attrs: { role: 'status', 'aria-live': 'polite' } });
  const list = el('ul', { class: 'open__files', testid: 'open-files', attrs: { 'aria-label': 'Your files' } });
  const ideas = el('div', { class: 'suggest-grid', testid: 'suggestions' });
  const ideasTitle = el('h2', { class: 'section__title open__title', text: 'What to do with it' });
  const again = el('button', { class: 'button button--ghost button--small', testid: 'open-again', text: 'Start over', attrs: { type: 'button' } });
  const ideasBox = el('section', { class: 'open__ideas', testid: 'open-ideas', attrs: { 'aria-label': 'Suggestions' } }, [
    el('div', { class: 'open__ideas-head' }, [ideasTitle, again]),
    ideas,
    el('p', { class: 'open__all' }, [el('a', { attrs: { href: '/#tools' }, text: 'Or pick any tool →' })]),
  ]);
  ideasBox.hidden = true;
  const recipesSlot = el('div');
  body.append(notice, looking, list, ideasBox, recipesSlot);

  const say = (text: string, kind: 'error' | 'info' = 'info') => {
    notice.textContent = text;
    notice.className = `notice${kind === 'error' ? ' notice--error' : ''}`;
    notice.hidden = text.length === 0;
  };

  let ws: Workspace | null = null;
  let opened: Opened[] = [];
  let recipes: RecipesPanel | null = null;
  const enginePromise = loadEngine();

  /** A result's first page, small, for the Done box under a recipe. */
  async function preview(workspace: Workspace, file: FoolscapFile, box: Box): Promise<HTMLCanvasElement | null> {
    if (file.kind === 'image') return imageThumb(await workspace.read(file), box, 'result-preview');
    if (file.kind !== 'pdf') return null;
    const view = await (await enginePromise).open(await workspace.read(file));
    try {
      return await pdfThumb(view, box, 'result-preview');
    } finally {
      await view.close();
    }
  }

  /** What a file is, read on this device: pages, a lock, a scan, a form. */
  async function factsOf(file: FoolscapFile): Promise<FileFacts> {
    if (file.kind === 'image') return { kind: 'image', size: file.size };
    if (file.kind !== 'pdf') return { kind: officeByName(file.name) ? 'office' : 'other', size: file.size };
    if (!ws) return { kind: 'pdf', size: file.size };
    try {
      const engine = await enginePromise;
      const view = await engine.open(await ws.read(file));
      try {
        const pages = view.pageCount;
        const layout = await view.layout(0).catch(() => null);
        const scanned = layout !== null && (layout.pictureCover ?? 0) >= SCAN_COVER && (layout.items.length === 0 || (layout.hiddenText ?? 0) >= 0.8);
        const forms = (await view.fields().catch(() => [])).length > 0;
        return { kind: 'pdf', size: file.size, pages, ...(scanned ? { scanned: true } : {}), ...(forms ? { forms: true } : {}) };
      } finally {
        await view.close();
      }
    } catch (error) {
      if (error instanceof PdfError && (error.code === 'encrypted' || error.code === 'wrong-password')) return { kind: 'pdf', size: file.size, locked: true };
      devlog('open', error);
      return { kind: 'pdf', size: file.size, unreadable: true };
    }
  }

  function describe(o: Opened): string {
    const f = o.facts;
    const bits = [formatSize(f.size)];
    if (f.pages !== undefined) bits.push(plural(f.pages, 'page'));
    if (f.locked) bits.push('locked');
    if (f.scanned) bits.push('a scan');
    if (f.forms) bits.push('a form');
    if (f.unreadable) bits.push("couldn't be read");
    if (f.kind === 'image') bits.push('picture');
    if (f.kind === 'office') bits.push('Word or Excel');
    return bits.join(' · ');
  }

  function render(): void {
    list.replaceChildren(
      ...opened.slice(0, 12).map((o) =>
        el('li', { class: 'open__file', testid: 'open-file' }, [el('span', { class: 'open__name', text: o.file.name }), el('span', { class: 'open__meta', text: describe(o) })]),
      ),
      ...(opened.length > 12 ? [el('li', { class: 'open__file open__file--more', text: `and ${plural(opened.length - 12, 'more file')}` })] : []),
    );
    const found = suggest(opened.map((o) => o.facts));
    ideas.replaceChildren(
      ...found.map((s) => {
        const tool = toolById(s.tool);
        const card = el('button', { class: 'tool-card suggest', testid: `suggest-${s.tool}`, attrs: { type: 'button', 'data-group': tool.group } }, [
          el('span', { class: 'tool-card__icon' }, [icon(TOOL_ICONS[s.tool])]),
          el('span', { class: 'tool-card__title', text: tool.title }),
          el('span', { class: 'tool-card__summary', text: s.why }),
        ]);
        card.addEventListener('click', () => go(s.tool, s.takes.map((i) => opened[i]?.file).filter((f): f is FoolscapFile => f !== undefined)));
        return card;
      }),
    );
    ideasBox.hidden = opened.length === 0;
    ideasTitle.textContent = opened.length === 1 ? 'What to do with it' : `What to do with these ${opened.length}`;
    if (found.length === 0 && opened.length > 0) say('Nothing here is a PDF, a picture or a Word or Excel file. Pick a tool from the list instead.');
    recipes?.files(opened.map((o) => o.file));
  }

  /** Carries the files to a tool, by id: the tool page finds them in the workspace. */
  function go(target: ToolId, files: readonly FoolscapFile[]): void {
    if (ws?.backend !== 'opfs') {
      say(`This browser cannot carry files between pages. ${toolById(target).title} opens next: pick the file there.`);
      setTimeout(() => (location.href = toolPath(target)), 1600);
      return;
    }
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(files.map((f) => f.id)));
    } catch {
      say('This browser would not let the files travel to the tool. Open it and pick them there.', 'error');
      return;
    }
    location.href = toolPath(target);
  }

  async function add(files: readonly File[]): Promise<void> {
    if (!ws || files.length === 0) return;
    say('');
    looking.textContent = `Looking at ${plural(files.length, 'file')} on this device…`;
    const store = createDocumentStore(ws, 'any');
    const results = await store.import(files);
    const problems = results.filter((r) => !r.ok).map((r) => (r.ok ? '' : `${r.name}: ${r.reason}`));
    for (const r of results) {
      if (!r.ok) continue;
      opened.push({ file: r.file, facts: await factsOf(r.file) });
      looking.textContent = `Looked at ${opened.length} of ${files.length}…`;
    }
    looking.textContent = '';
    if (problems.length > 0) say(problems.join(' '), 'error');
    render();
    if (opened.length > 0) ideasBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function startOver(): Promise<void> {
    opened = [];
    say('');
    render();
    await ws?.clear();
    input.focus();
  }
  again.addEventListener('click', () => void startOver());

  bindDropZone(zone, input, (files) => void add(files));
  folder?.addEventListener('change', () => {
    // A whole folder: every file in it, and in the folders inside it.
    const files = folder.files ? [...folder.files] : [];
    folder.value = '';
    void add(files);
  });

  ws = await createWorkspace();
  await ws.clear();
  recipes = mountRecipes(recipesSlot, ws, () => opened.map((o) => o.file), (file, box) => preview(ws, file, box));
  // Arriving from "Share → Foolscap" or "Open with Foolscap": the files come in as if dropped.
  listenForLaunchedFiles((files) => void add(files));
  try {
    await Promise.all([ws.ready, enginePromise.then((e) => e.ready)]);
    document.body.dataset['ready'] = 'true';
  } catch (error) {
    devlog('ready', error);
    say('This browser could not start the tools. Try a current version of Chrome, Edge, Firefox or Safari.', 'error');
  }
}
