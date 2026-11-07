/**
 * Every tool's icon, as a small story of what the tool does to a document
 * (merge: two pages slide into one; add a password: a padlock drops onto
 * the page and snaps shut). Each is drawn on Lucide's 24-unit grid from the
 * pieces in kit.ts; its motion is in the family's stylesheet beside it and
 * plays only while the icon is on screen (ui/motion.ts). Still, each icon is
 * the story's last frame: the tool's result.
 */
import type { ToolId } from '../../ops/tools.ts';
import { CONVERT_A_SCENES } from './convert-a.ts';
import { CONVERT_B_SCENES } from './convert-b.ts';
import { MARK_A_SCENES } from './mark-a.ts';
import { MARK_B_SCENES } from './mark-b.ts';
import { PAGES_SCENES } from './pages.ts';
import { PROTECT_SCENES } from './protect.ts';
import { READ_SCENES } from './read.ts';

export const SCENES: Record<ToolId, string> = {
  ...PAGES_SCENES,
  ...CONVERT_A_SCENES,
  ...CONVERT_B_SCENES,
  ...MARK_A_SCENES,
  ...MARK_B_SCENES,
  ...PROTECT_SCENES,
  ...READ_SCENES,
};

/** A tool's icon, ready to sit inside an <svg viewBox="0 0 24 24">: its story in the family's colour. */
export const TOOL_ART = Object.fromEntries(
  Object.entries(SCENES).map(([id, body]) => [
    id,
    `<g class="act act-t-${id}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
  ]),
) as Record<ToolId, string>;
