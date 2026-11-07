/**
 * Writes app/src/ui/tool-icons.ts from Lucide (ISC), the open-source icon
 * set Layerbit uses, so the two sites share one drawing hand. Each icon's
 * elements are copied as they are; the page decides colour and line weight.
 * Lucide's licence is in licenses/lucide-ISC.txt.
 *
 *   node scripts/gen-icons.mjs   (output committed; rerun after changing a name)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = resolve(ROOT, 'node_modules/lucide-static/icons');
const { version } = JSON.parse(readFileSync(resolve(ROOT, 'node_modules/lucide-static/package.json'), 'utf8'));

const GROUPS = { pages: 'files', convert: 'arrow-left-right', mark: 'pen-line', protect: 'shield-check', read: 'book-open-text' };

function inner(name) {
  const svg = readFileSync(resolve(ICONS, `${name}.svg`), 'utf8');
  const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  // pathLength="1" lets ui/motion.css draw any part of an icon on, whatever its real length.
  return body
    .replace(/\s*\n\s*/g, '')
    .replace(/\s+\/>/g, '/>')
    .replace(/<(path|rect|circle|line|polyline|ellipse|polygon)\b/g, '<$1 pathLength="1"')
    .trim();
}

/** `act` names the drawing for ui/motion.css: t-<tool> or g-<family>. */
const entry = (key, name, act) => `  ${/^[a-z]+$/.test(key) ? key : `'${key}'`}: icon('${act}', ${JSON.stringify(inner(name))}), // ${name}`;

const out = `// Written by scripts/gen-icons.mjs from lucide-static ${version} (ISC). Do not edit; change the names there.
/**
 * One Lucide icon per family, on Lucide's 24-unit grid, stroked in
 * currentColor so each family's colour draws its own. The page generator
 * (scripts/gen-pages.ts) writes them into the static HTML. Each carries a
 * class naming it (act-g-pages…) for ui/motion.css. The tools' own icons are
 * drawn stories: ui/scenes/.
 */
import type { GroupId } from '../ops/tools';

const icon = (act: string, body: string) =>
  \`<g class="act act-\${act}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${body}</g>\`;

export const GROUP_ICONS: Record<GroupId, string> = {
${Object.entries(GROUPS).map(([k, n]) => entry(k, n, `g-${k}`)).join('\n')}
};
`;
writeFileSync(resolve(ROOT, 'app/src/ui/tool-icons.ts'), out);
console.log(`icons: ${Object.keys(GROUPS).length} families from lucide-static ${version}`);
