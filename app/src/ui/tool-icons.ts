// Written by scripts/gen-icons.mjs from lucide-static 1.55.0 (ISC). Do not edit; change the names there.
/**
 * One Lucide icon per family, on Lucide's 24-unit grid, stroked in
 * currentColor so each family's colour draws its own. The page generator
 * (scripts/gen-pages.ts) writes them into the static HTML. Each carries a
 * class naming it (act-g-pages…) for ui/motion.css. The tools' own icons are
 * drawn stories: ui/scenes/.
 */
import type { GroupId } from '../ops/tools';

const icon = (act: string, body: string) =>
  `<g class="act act-${act}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;

export const GROUP_ICONS: Record<GroupId, string> = {
  pages: icon('g-pages', "<path pathLength=\"1\" d=\"M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8\"/><path pathLength=\"1\" d=\"M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z\"/><path pathLength=\"1\" d=\"M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1\"/>"), // files
  convert: icon('g-convert', "<path pathLength=\"1\" d=\"M8 3 4 7l4 4\"/><path pathLength=\"1\" d=\"M4 7h16\"/><path pathLength=\"1\" d=\"m16 21 4-4-4-4\"/><path pathLength=\"1\" d=\"M20 17H4\"/>"), // arrow-left-right
  mark: icon('g-mark', "<path pathLength=\"1\" d=\"M13 21h8\"/><path pathLength=\"1\" d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/>"), // pen-line
  protect: icon('g-protect', "<path pathLength=\"1\" d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path pathLength=\"1\" d=\"m9 12 2 2 4-4\"/>"), // shield-check
  read: icon('g-read', "<path pathLength=\"1\" d=\"M12 5v16\"/><path pathLength=\"1\" d=\"M16 13h2\"/><path pathLength=\"1\" d=\"M16 9h2\"/><path pathLength=\"1\" d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\"/><path pathLength=\"1\" d=\"M6 13h2\"/><path pathLength=\"1\" d=\"M6 9h2\"/>"), // book-open-text
};
