/**
 * Recipes: a named list of steps, each a tool and its settings, run on many
 * files at once ("compress, number the pages, lock with a password"). Kept in
 * this browser's localStorage, which holds the tools and settings only: never
 * a file, a file's name, or a password (a recipe that locks files asks for the
 * password each time it runs).
 */
import type { ToolId } from '../ops/tools';

export interface RecipeStep {
  readonly tool: RecipeTool;
  readonly params: unknown;
}

export interface Recipe {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly RecipeStep[];
}

/**
 * The tools a recipe can use: those that take PDFs, need nothing but their
 * settings, and work the same on any file. Drawing tools (sign, mark up) are
 * about one page of one file, and unlocking needs each file's own password.
 */
export const RECIPE_TOOLS = [
  'merge',
  'compress',
  'ocr',
  'page-numbers',
  'header-footer',
  'watermark',
  'background',
  'crop',
  'n-up',
  'pdf-a',
  'add-password',
  'pdf-to-word',
  'pdf-to-excel',
  'extract-text',
] as const satisfies readonly ToolId[];

export type RecipeTool = (typeof RECIPE_TOOLS)[number];

/** Steps whose results are not PDFs: nothing can come after them. */
export const ENDS_A_RECIPE: ReadonlySet<RecipeTool> = new Set<RecipeTool>(['pdf-to-word', 'pdf-to-excel', 'extract-text']);

export const STORE_KEY = 'foolscap.recipes';

const isRecipeTool = (value: unknown): value is RecipeTool => typeof value === 'string' && (RECIPE_TOOLS as readonly string[]).includes(value);

/** Settings with every secret taken out: what may be written down. */
export function storable(step: RecipeStep): RecipeStep {
  if (step.tool !== 'add-password' || step.params === null || typeof step.params !== 'object') return step;
  return { tool: step.tool, params: { ...(step.params as Record<string, unknown>), password: '' } };
}

/** Whether running this recipe needs a password typed first. */
export function needsPassword(recipe: Recipe): boolean {
  return recipe.steps.some((s) => s.tool === 'add-password' && (s.params as { mode?: string } | null)?.mode !== 'restrict');
}

/** Why a list of steps cannot be saved as it is, or null. */
export function problemWith(name: string, steps: readonly RecipeStep[]): string | null {
  if (name.trim() === '') return 'Give the recipe a name.';
  if (steps.length === 0) return 'Add at least one step.';
  const seen = new Set<RecipeTool>();
  for (const [i, step] of steps.entries()) {
    if (seen.has(step.tool)) return 'Each tool can be a step once.';
    seen.add(step.tool);
    if (ENDS_A_RECIPE.has(step.tool) && i < steps.length - 1) return 'Turning PDFs into Word, Excel or text has to be the last step: nothing else works on those files.';
  }
  return null;
}

/** The recipes kept in this browser, any that do not make sense dropped. */
export function readRecipes(raw: string | null): Recipe[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((r): Recipe[] => {
      if (r === null || typeof r !== 'object') return [];
      const { id, name, steps } = r as { id?: unknown; name?: unknown; steps?: unknown };
      if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(steps)) return [];
      const kept = steps.flatMap((s): RecipeStep[] => {
        const step = s as { tool?: unknown; params?: unknown } | null;
        return step && isRecipeTool(step.tool) ? [storable({ tool: step.tool, params: step.params ?? {} })] : [];
      });
      return kept.length > 0 && problemWith(name, kept) === null ? [{ id, name: name.slice(0, 80), steps: kept }] : [];
    });
  } catch {
    return [];
  }
}

export function writeRecipes(recipes: readonly Recipe[]): string {
  return JSON.stringify(recipes.map((r) => ({ id: r.id, name: r.name, steps: r.steps.map(storable) })));
}
