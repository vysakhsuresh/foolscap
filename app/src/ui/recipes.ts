/**
 * Recipes on the Open a file page: make one from the same settings the tools
 * use, keep it in this browser, and run it on everything dropped — a folder of
 * 500 invoices goes through "compress, number the pages, lock" in one tap.
 * Each step's results become the next step's files; the in-between files are
 * let go as soon as the next step has them. Big batches are shared between
 * workers (jobs/pool.ts).
 */
import { createExporter, type FoolscapFile, type Workspace } from '../files';
import { JobCrashed, createJobRunner, type JobRunner } from '../jobs';
import { createJobPool, type JobPool } from '../jobs/pool';
import { opMeta } from '../ops/meta';
import { OpCancelled, type Outcome } from '../ops/op';
import { toolById } from '../ops/tools';
import { el } from './dom';
import { field, select } from './fields';
import { plural } from './format';
import { watchNetwork } from './network-proof';
import { createProgress } from './progress';
import {
  RECIPE_TOOLS,
  STORE_KEY,
  needsPassword,
  problemWith,
  readRecipes,
  storable,
  writeRecipes,
  type Recipe,
  type RecipeStep,
  type RecipeTool,
} from './recipe-model';
import { TOO_LARGE, renderResult } from './result';
import { createToolOptions, type ToolOptions } from './tool-options';

export interface RecipesPanel {
  /** The files on the page changed: recipes say whether they can run on them. */
  files(files: readonly FoolscapFile[]): void;
}

const load = (): Recipe[] => {
  try {
    return readRecipes(localStorage.getItem(STORE_KEY));
  } catch {
    return [];
  }
};

const keep = (recipes: readonly Recipe[]): boolean => {
  try {
    localStorage.setItem(STORE_KEY, writeRecipes(recipes));
    return true;
  } catch {
    return false;
  }
};

const stepsLine = (recipe: Recipe) => recipe.steps.map((s) => toolById(s.tool).title).join(' → ');

export function mountRecipes(slot: HTMLElement, ws: Workspace, current: () => readonly FoolscapFile[]): RecipesPanel {
  let recipes = load();
  let files: readonly FoolscapFile[] = [];
  let pool: JobPool | null = null;
  let busy = false;

  const list = el('div', { class: 'recipe-list', testid: 'recipe-list' });
  const make = el('button', { class: 'button button--ghost', testid: 'recipe-new', text: 'Make a recipe', attrs: { type: 'button' } });
  const builderSlot = el('div');
  const progressSlot = el('div');
  const resultSlot = el('div');
  const said = el('p', { class: 'notice', testid: 'recipe-said', attrs: { role: 'status', 'aria-live': 'polite' } });
  said.hidden = true;
  const root = el('section', { class: 'recipes', testid: 'recipes', attrs: { 'aria-labelledby': 'recipes-title' } }, [
    el('div', { class: 'open__ideas-head' }, [el('h2', { class: 'section__title open__title', attrs: { id: 'recipes-title' }, text: 'Recipes' }), make]),
    el('p', { class: 'options__note', text: 'Steps you do often, saved once and run on any number of files in one tap. Kept in this browser only; a password is asked for each time, never kept.' }),
    list,
    builderSlot,
    said,
    progressSlot,
    resultSlot,
  ]);
  slot.append(root);

  const say = (text: string, error = false) => {
    said.textContent = text;
    said.className = `notice${error ? ' notice--error' : ''}`;
    said.hidden = text === '';
  };

  function renderList(): void {
    const pdfs = files.filter((f) => f.kind === 'pdf');
    list.replaceChildren(
      ...(recipes.length === 0 ? [el('p', { class: 'recipe-list__empty', text: 'No recipes yet.' })] : []),
      ...recipes.map((recipe) => {
        const run = el('button', { class: 'button button--small', testid: 'recipe-run', text: pdfs.length > 0 ? `Run on ${plural(pdfs.length, 'PDF')}` : 'Add PDFs to run it', attrs: { type: 'button' } });
        run.disabled = pdfs.length === 0 || busy;
        const remove = el('button', { class: 'button button--ghost button--small', testid: 'recipe-delete', text: 'Delete', attrs: { type: 'button', 'aria-label': `Delete the recipe ${recipe.name}` } });
        const password = needsPassword(recipe)
          ? field(`recipe-password-${recipe.id}`, { label: 'Password to lock them with', type: 'password', autocomplete: 'new-password' }, () => undefined)
          : null;
        run.addEventListener('click', () => {
          const typed = password?.value() ?? '';
          if (password && typed.length === 0) {
            say('Type the password to lock the files with first.', true);
            password.input.focus();
            return;
          }
          void runRecipe(recipe, typed);
        });
        remove.addEventListener('click', () => {
          recipes = recipes.filter((r) => r.id !== recipe.id);
          keep(recipes);
          renderList();
        });
        return el('article', { class: 'recipe', testid: 'recipe', attrs: { 'data-name': recipe.name } }, [
          el('h3', { class: 'recipe__name', text: recipe.name }),
          el('p', { class: 'recipe__steps', text: stepsLine(recipe) }),
          ...(password ? [password.root] : []),
          el('div', { class: 'recipe__actions' }, [run, remove]),
        ]);
      }),
    );
  }

  // ---- Making one ----

  function openBuilder(): void {
    const steps: Array<{ tool: RecipeTool; options: ToolOptions | null; box: HTMLElement }> = [];
    const name = field('recipe-name', { label: 'Name', placeholder: 'Invoices for the accountant' }, () => undefined);
    const stepsBox = el('ol', { class: 'recipe-steps', testid: 'recipe-steps' });
    const choose = select<RecipeTool>(
      'recipe-tool',
      'Add a step',
      RECIPE_TOOLS.map((t) => ({ value: t, title: toolById(t).title })),
      'compress',
      () => undefined,
    );
    const addStep = el('button', { class: 'button button--ghost button--small', testid: 'recipe-add-step', text: 'Add this step', attrs: { type: 'button' } });
    const save = el('button', { class: 'button', testid: 'recipe-save', text: 'Save the recipe', attrs: { type: 'button' } });
    const cancel = el('button', { class: 'button button--ghost', testid: 'recipe-cancel', text: 'Cancel', attrs: { type: 'button' } });
    const problem = el('p', { class: 'run__note', testid: 'recipe-problem' });
    const builder = el('div', { class: 'recipe-builder', testid: 'recipe-builder' }, [
      name.root,
      stepsBox,
      el('div', { class: 'recipe-builder__add' }, [choose.root, addStep]),
      problem,
      el('div', { class: 'recipe__actions' }, [save, cancel]),
    ]);
    const renumber = () => {
      stepsBox.replaceChildren(...steps.map((s) => s.box));
      steps.forEach((s, i) => {
        const title = s.box.querySelector('.recipe-step__title');
        if (title) title.textContent = `${i + 1}. ${toolById(s.tool).title}`;
      });
    };
    addStep.addEventListener('click', () => {
      const tool = choose.value();
      if (steps.some((s) => s.tool === tool)) {
        problem.textContent = `${toolById(tool).title} is already a step.`;
        return;
      }
      problem.textContent = '';
      const options = tool === 'merge' ? null : createToolOptions(tool, () => undefined);
      const removeStep = el('button', { class: 'button button--ghost button--small', text: 'Take out', attrs: { type: 'button' } });
      const box = el('li', { class: 'recipe-step', testid: 'recipe-step', attrs: { 'data-tool': tool, 'data-group': toolById(tool).group } }, [
        el('div', { class: 'recipe-step__head' }, [el('span', { class: 'recipe-step__title' }), removeStep]),
        ...(options ? [options.root] : [el('p', { class: 'options__note', text: 'Joins every file into one, in the order they were dropped.' })]),
      ]);
      const step = { tool, options, box };
      removeStep.addEventListener('click', () => {
        steps.splice(steps.indexOf(step), 1);
        renumber();
      });
      steps.push(step);
      renumber();
    });
    save.addEventListener('click', () => {
      const made: RecipeStep[] = steps.map((s) => ({ tool: s.tool, params: s.options?.params() ?? {} }));
      const wrong = problemWith(name.value(), made) ?? steps.map((s) => (s.tool === 'add-password' ? null : (s.options?.problem(2) ?? null))).find((p) => p !== null) ?? null;
      if (wrong) {
        problem.textContent = wrong;
        return;
      }
      const recipe: Recipe = { id: crypto.randomUUID(), name: name.value().trim().slice(0, 80), steps: made.map(storable) };
      recipes = [...recipes, recipe];
      if (!keep(recipes)) say('This browser would not keep the recipe (its storage is off or full). It works until you leave the page.', true);
      builderSlot.replaceChildren();
      make.hidden = false;
      renderList();
    });
    cancel.addEventListener('click', () => {
      builderSlot.replaceChildren();
      make.hidden = false;
    });
    builderSlot.replaceChildren(builder);
    make.hidden = true;
    name.input.focus();
  }
  make.addEventListener('click', openBuilder);

  // ---- Running one ----

  function workers(recipe: Recipe): JobPool {
    const engine = recipe.steps.some((s) => opMeta(s.tool).engine === true);
    const ocr = recipe.steps.some((s) => opMeta(s.tool).ocr === true);
    if (pool) return pool;
    const first: JobRunner = createJobRunner(ws, { engine, ocr });
    pool = createJobPool(first, () => createJobRunner(ws, { engine, ocr }));
    return pool;
  }

  async function runRecipe(recipe: Recipe, password: string): Promise<void> {
    const inputs = current().filter((f) => f.kind === 'pdf');
    if (inputs.length === 0 || busy) return;
    busy = true;
    say('');
    resultSlot.replaceChildren();
    renderList();
    const names = new Map<string, string>(inputs.map((f) => [f.id, f.name]));
    const run = workers(recipe);
    const network = watchNetwork();
    let cancelled = false;
    let handleCancel: (() => void) | null = null;
    const progress = createProgress(() => {
      cancelled = true;
      handleCancel?.();
    });
    progressSlot.replaceChildren(progress.root);
    let working: FoolscapFile[] = [...inputs];
    const failures: Outcome[] = [];
    const skipped: Array<Outcome & { kind: 'skipped' }> = [];
    let last: Outcome[] = [];
    try {
      for (const [k, step] of recipe.steps.entries()) {
        if (cancelled) throw new OpCancelled();
        const title = toolById(step.tool).title;
        const params = step.tool === 'add-password' ? { ...(step.params as object), password } : step.params;
        const outcomes: Outcome[] = [];
        // A tool that takes one file at a time gets them one at a time.
        const batches = opMeta(step.tool).arity.kind === 'one' ? working.map((f) => [f]) : [working];
        for (const batch of batches) {
          const handle = run.run(step.tool, batch, params, {
            onProgress: (p) => progress.update({ ...p, label: `Step ${k + 1} of ${recipe.steps.length}: ${title}. ${p.label}` }),
            onRequests: (n) => network.add(n),
          });
          handleCancel = () => handle.cancel();
          outcomes.push(...(await handle.done));
        }
        // A step with nothing to do to a file ("already about as small as it gets") passes it on
        // unchanged: the recipe goes on with it. Only a real failure takes a file out.
        const passed = outcomes.flatMap((o) => (o.kind === 'skipped' ? o.inputIds : [])).flatMap((id) => working.filter((f) => f.id === id));
        const produced = [...outcomes.flatMap((o) => (o.kind === 'produced' ? [o.file] : [])), ...passed];
        for (const f of produced) names.set(f.id, f.name);
        failures.push(...outcomes.filter((o) => o.kind === 'failed'));
        // The files between steps are let go once the next step has them; the dropped files stay.
        const between = working.filter((f) => !inputs.includes(f) && !passed.includes(f));
        await Promise.all(between.map((f) => ws.remove(f).catch(() => undefined)));
        working = produced;
        last = outcomes.filter((o) => o.kind === 'produced');
        skipped.push(...outcomes.filter((o): o is Outcome & { kind: 'skipped' } => o.kind === 'skipped'));
        if (working.length === 0) break;
      }
      // A file every step passed over is still a result: offered as it is, with the reason.
      const finals = new Set(last.flatMap((o) => (o.kind === 'produced' ? [o.file.id] : [])));
      const untouched: Outcome[] = working
        .filter((f) => !finals.has(f.id))
        .map((f) => ({ kind: 'produced', file: f, detail: skipped.find((o) => o.inputIds.includes(f.id))?.reason ?? 'Unchanged' }));
      const done = renderResult([...last, ...untouched, ...failures], {
        tool: toolById(recipe.steps[recipe.steps.length - 1]?.tool ?? 'compress'),
        exporter: createExporter(ws),
        nameOf: (id) => names.get(id) ?? '',
        pages: new Map(),
        handoff: null,
        startOver: () => resultSlot.replaceChildren(),
      });
      resultSlot.replaceChildren(done, network.stop());
      resultSlot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (error instanceof OpCancelled) say('Stopped. Nothing was saved.');
      else if (error instanceof JobCrashed) say(TOO_LARGE, true);
      else say('Something went wrong and the recipe stopped. Try again, or try fewer files.', true);
    } finally {
      busy = false;
      progressSlot.replaceChildren();
      renderList();
    }
  }

  renderList();
  return {
    files(next) {
      files = next;
      renderList();
    },
  };
}
