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

/** Tool → Lucide icon name. */
const TOOLS = {
  merge: 'combine',
  split: 'split',
  organise: 'layout-grid',
  'extract-pages': 'file-output',
  'insert-pages': 'file-plus-2',
  crop: 'crop',
  'split-by-size': 'scissors-line-dashed',
  compress: 'shrink',
  'images-to-pdf': 'images',
  'pdf-to-images': 'file-image',
  'n-up': 'grid-2x2',
  'extract-images': 'image-down',
  watermark: 'stamp',
  'page-numbers': 'hash',
  sign: 'signature',
  'mark-up': 'highlighter',
  'add-text': 'type',
  'fill-form': 'text-cursor-input',
  'header-footer': 'panel-top-bottom-dashed',
  'add-password': 'lock',
  'remove-password': 'lock-open',
  'remove-areas': 'eraser',
  'document-details': 'info',
  read: 'book-open',
  scan: 'scan-line',
  ocr: 'scan-text',
  'extract-text': 'file-text',
};

const GROUPS = { pages: 'files', convert: 'arrow-left-right', mark: 'pen-line', protect: 'shield-check', read: 'book-open-text' };

function inner(name) {
  const svg = readFileSync(resolve(ICONS, `${name}.svg`), 'utf8');
  const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  return body.replace(/\s*\n\s*/g, '').replace(/\s+\/>/g, '/>').trim();
}

const entry = (key, name) => `  ${/^[a-z]+$/.test(key) ? key : `'${key}'`}: icon(${JSON.stringify(inner(name))}), // ${name}`;

const out = `// Written by scripts/gen-icons.mjs from lucide-static ${version} (ISC). Do not edit; change the names there.
/**
 * One Lucide icon per tool and per family, on Lucide's 24-unit grid, stroked
 * in currentColor so each family's colour draws its own icons. The page
 * generator (scripts/gen-pages.ts) writes them into the static HTML.
 */
import type { GroupId, ToolId } from '../ops/tools';

const icon = (body: string) =>
  \`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${body}</g>\`;

export const TOOL_ICONS: Record<ToolId, string> = {
${Object.entries(TOOLS).map(([k, n]) => entry(k, n)).join('\n')}
};

export const GROUP_ICONS: Record<GroupId, string> = {
${Object.entries(GROUPS).map(([k, n]) => entry(k, n)).join('\n')}
};
`;
writeFileSync(resolve(ROOT, 'app/src/ui/tool-icons.ts'), out);
console.log(`icons: ${Object.keys(TOOLS).length} tools and ${Object.keys(GROUPS).length} families from lucide-static ${version}`);
