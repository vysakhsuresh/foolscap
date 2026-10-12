/**
 * Writes every page's HTML from one template and the tool list.
 *
 * Sixteen tool pages written by hand drift: a different word here, a missing
 * attribute there, and a site starts to feel like a pile of pages. So the
 * tool pages and the home page's tool list are generated from
 * app/src/ops/tools.ts, and the shell (header, footer, Get help) is written
 * into every page, the privacy page included, from the one copy below. The
 * output is committed: the pages read correctly with no script, and a search
 * engine sees every tool.
 *
 *   node scripts/gen-pages.ts            (also runs on predev and prebuild)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, KEYWORDS, TOOLS, type GroupId, type ToolMeta } from '../app/src/ops/tools.ts';
import { ADSENSE, HELP } from '../app/src/site/config.ts';
import { GROUP_ICONS, TOOL_ICONS } from '../app/src/ui/tool-icons.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'app');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = (body: string, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const live = TOOLS.filter((t) => t.status === 'live');
const groupOf = (id: GroupId) => GROUPS.find((g) => g.id === id) ?? { id, title: id, blurb: '' };

// ---- The shell: one copy, every page ----

// The mark: a page with its corner folded, and an F cut out of it so the
// tile's colour shows through. Legible at 16 pixels in a browser tab.
const MARK =
  '<svg class="mark" data-testid="mark" viewBox="0 0 64 64" width="40" height="40" aria-hidden="true" focusable="false"><defs><linearGradient id="mark-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00f2fe"/><stop offset=".5" stop-color="#4facfe"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#mark-g)"/><path d="M19 11h18l11 11v27a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5Z" fill="#fff"/><path d="M37 11v7a4 4 0 0 0 4 4h7Z" fill="#c7d2fe"/><rect x="22" y="25" width="6" height="22" rx="3" fill="url(#mark-g)"/><rect x="22" y="25" width="18" height="6" rx="3" fill="url(#mark-g)"/><rect x="22" y="34.5" width="13" height="5.5" rx="2.75" fill="url(#mark-g)"/></svg>';

const CUP =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h12v5a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6V9ZM16 10.5h1.5a2.75 2.75 0 0 1 0 5.5H16M8 3c0 1.2 1 1.6 1 3M12 3c0 1.2 1 1.6 1 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function header(current: 'tools' | 'privacy'): string {
  const t = current === 'tools' ? ' aria-current="page"' : '';
  const p = current === 'privacy' ? ' aria-current="page"' : '';
  return `<header class="site-header" data-testid="site-header">
    <div class="wrap site-header__row">
      <a class="brand" href="/">${MARK}<span>Foolscap</span></a>
      <nav class="site-nav" data-testid="site-nav" aria-label="Site">
        <a href="/#tools"${t}>Tools</a>
        <a href="/private/"${p}>Privacy</a>
      </nav>
      <a class="support" data-testid="support" href="${HELP.coffee}" target="_blank" rel="noopener" aria-label="Buy me a coffee">${CUP}<span class="support__text">Buy me a coffee</span></a>
    </div>
  </header>`;
}

const FOOTER = `<footer class="site-footer" data-testid="site-footer">
    <div class="wrap site-footer__row">
      <p>© 2026 Foolscap · from <a href="https://layerbit.co.in" rel="noopener">Layerbit</a></p>
      <p class="site-footer__links"><a href="/private/">Privacy</a><button class="linklike" type="button" popovertarget="help-panel">Get help</button><a href="${HELP.coffee}" target="_blank" rel="noopener">Buy me a coffee</a></p>
    </div>
  </footer>
  <button class="help-orb" type="button" popovertarget="help-panel" data-testid="help-orb" aria-label="Get help">
    <span class="help-orb__label" aria-hidden="true">GET HELP</span>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="help-orb__ring" cx="12" cy="12" r="11.5" fill="none" stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="3 6" opacity="0.5"/><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="#38bdf8" fill-opacity="0.1" stroke="#38bdf8" stroke-width="2" stroke-linejoin="round"/><rect class="help-orb__bar" x="8" y="8.5" width="1.6" height="5" rx="0.8" fill="#00f2fe"/><rect class="help-orb__bar" x="11.2" y="7" width="1.6" height="8" rx="0.8" fill="#38bdf8"/><rect class="help-orb__bar" x="14.4" y="8.5" width="1.6" height="5" rx="0.8" fill="#00f2fe"/></svg>
  </button>
  <div class="help-panel" id="help-panel" popover data-testid="help-panel" role="dialog" aria-labelledby="help-title">
    <button class="help-panel__close" type="button" popovertarget="help-panel" popovertargetaction="hide" aria-label="Close">×</button>
    <h2 id="help-title">Get help with Foolscap</h2>
    <p>Ask us anything. Please don’t send us your documents — we never need them to help.</p>
    <a class="help-option" data-testid="help-email" href="mailto:${HELP.email}?subject=Foolscap%20help"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18v12H3zM3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Send us an email</a>
    <a class="help-option help-option--whatsapp" data-testid="help-whatsapp" href="${HELP.whatsapp}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 9.5c.3 1.8 2.2 4 4 4.6l1.2-1.1 1.8.8c0 1-.9 1.7-2 1.7-3 0-5.9-2.9-5.9-5.9 0-1.1.7-2 1.7-2l.8 1.8Z" fill="currentColor"/></svg>Chat on WhatsApp</a>
  </div>`;

function head(title: string, description: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a0c10">
  <meta name="google-adsense-account" content="${ADSENSE.client}">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icon.svg">
  <script type="module" src="${script}"></script>
</head>`;
}

const PROMISE = 'In your browser; nothing is uploaded. Free, no sign-up, no limits, no watermark.';

// ---- Tool pages ----

function dropZone(tool: ToolMeta): { title: string; hint: string; accept: string; multiple: boolean } {
  switch (tool.input) {
    case 'images':
      return { title: 'Drop your photos here, or tap to pick them', hint: 'JPEG, PNG, WebP or GIF. They stay on this device.', accept: 'image/*', multiple: true };
    case 'camera':
      return { title: 'Take a photo of each page, or pick photos', hint: 'One photo per page, in order. They stay on this device.', accept: 'image/*', multiple: true };
    case 'several-pdfs':
      return { title: 'Drop your PDFs here, or tap to pick them', hint: 'They stay on this device. No size limit.', accept: 'application/pdf,.pdf', multiple: true };
    default:
      return { title: 'Drop a PDF here, or tap to pick one', hint: 'It stays on this device. No size limit.', accept: 'application/pdf,.pdf', multiple: false };
  }
}

function toolPage(tool: ToolMeta): string {
  const group = groupOf(tool.group);
  const zone = dropZone(tool);
  const siblings = live.filter((t) => t.group === tool.group && t.id !== tool.id);
  const related = siblings
    .map((t) => `<a class="related__item" href="/tools/${t.id}/">${svg(TOOL_ICONS[t.id], 'related__icon')}<span>${esc(t.title)}</span></a>`)
    .join('\n        ');
  return `${head(`${tool.title} — Foolscap`, `${tool.summary}. ${PROMISE}`, '/src/pages/tool.ts')}
<body data-tool="${tool.id}" data-group="${tool.group}" data-page="tool">
  ${header('tools')}
  <main class="wrap tool" data-app>
    <header class="tool__head">
      <a class="crumb" href="/#${group.id}">${svg(GROUP_ICONS[group.id], 'crumb__icon')}<span>${esc(group.title)}</span></a>
      <h1 class="tool__title" data-testid="tool-title">${esc(tool.title)}</h1>
      <p class="tool__summary">${esc(tool.summary)}. Nothing is uploaded: the work happens on this device.</p>
    </header>
    <label class="drop-zone" data-testid="drop-zone" for="file-input" tabindex="0" role="button" aria-describedby="drop-hint">
      ${svg(TOOL_ICONS[tool.id], 'drop-zone__icon')}
      <span class="drop-zone__title">${zone.title}</span>
      <span class="drop-zone__hint" id="drop-hint">${zone.hint}</span>
      <input class="visually-hidden" id="file-input" data-testid="file-input" type="file" accept="${zone.accept}"${zone.multiple ? ' multiple' : ''} tabindex="-1">
    </label>
    <div data-slot="body"></div>
    <nav class="related" aria-labelledby="related-title">
      <h2 class="related__title" id="related-title">${siblings.length > 0 ? `More in ${esc(group.title)}` : 'More tools'}</h2>
      <div class="related__list">
        ${related}
        <a class="related__item related__item--all" href="/#tools"><span>All tools</span><span aria-hidden="true">→</span></a>
      </div>
    </nav>
  </main>
  ${FOOTER}
</body>
</html>
`;
}

// ---- Home ----

function card(tool: ToolMeta): string {
  const keywords = esc(`${tool.title} ${tool.summary} ${KEYWORDS[tool.id] ?? ''}`.toLowerCase());
  const icon = `<span class="tool-card__icon">${svg(TOOL_ICONS[tool.id])}</span>`;
  if (tool.status === 'live') {
    return `<a class="tool-card" href="/tools/${tool.id}/" data-testid="tool-card-${tool.id}" data-keywords="${keywords}">${icon}<span class="tool-card__title">${esc(tool.title)}</span><span class="tool-card__summary">${esc(tool.summary)}</span></a>`;
  }
  return `<div class="tool-card tool-card--soon" data-testid="tool-card-${tool.id}" data-status="soon" data-keywords="${keywords}">${icon}<span class="tool-card__title">${esc(tool.title)} <span class="badge">Soon</span></span><span class="tool-card__summary">${esc(tool.summary)}</span></div>`;
}

function homeTools(): string {
  const families = GROUPS.map((group) => {
    const tools = TOOLS.filter((t) => t.group === group.id);
    const ordered = [...tools.filter((t) => t.status === 'live'), ...tools.filter((t) => t.status !== 'live')];
    return `<section class="family" id="${group.id}" data-group="${group.id}" aria-labelledby="family-${group.id}">
        <div class="family__head">
          <span class="family__icon">${svg(GROUP_ICONS[group.id])}</span>
          <div>
            <h2 class="family__title" id="family-${group.id}">${esc(group.title)}</h2>
            <p class="family__blurb">${esc(group.blurb)}</p>
          </div>
        </div>
        <div class="tool-grid">
          ${ordered.map(card).join('\n          ')}
        </div>
      </section>`;
  }).join('\n      ');
  const jumps = GROUPS.map((g) => `<a class="family-jump" href="#${g.id}" data-group="${g.id}">${svg(GROUP_ICONS[g.id])}<span>${esc(g.title)}</span></a>`).join('');
  return `<!-- tools:start (generated by scripts/gen-pages.ts) -->
    <section class="section section--tight" id="tools" aria-labelledby="tools-title">
      <h2 class="visually-hidden" id="tools-title">Tools</h2>
      <div class="finder" data-finder hidden>
        <label class="finder__box">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input class="finder__input" type="search" data-testid="tool-search" placeholder="Find a tool: try “join” or “lock”" aria-label="Find a tool" autocomplete="off" enterkeyhint="go">
        </label>
        <p class="finder__empty" data-finder-empty hidden>Nothing matches that yet. <button class="linklike" type="button" popovertarget="help-panel">Tell us what you need</button></p>
      </div>
      <nav class="family-jumps" aria-label="Tool families">${jumps}</nav>
      ${families}
    </section>
    <!-- tools:end -->`;
}

// ---- Write ----

function writeIfChanged(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

let changed = 0;

// Tool pages: one per live tool; a folder for a tool that is not live goes.
const toolsDir = resolve(APP, 'tools');
for (const tool of live) if (writeIfChanged(resolve(toolsDir, tool.id, 'index.html'), toolPage(tool))) changed++;
for (const dir of existsSync(toolsDir) ? readdirSync(toolsDir) : []) {
  if (!live.some((t) => t.id === dir)) {
    rmSync(resolve(toolsDir, dir), { recursive: true, force: true });
    changed++;
  }
}

// Home: the tool list between its markers, and the shell.
const ADSENSE_META = `<meta name="google-adsense-account" content="${ADSENSE.client}">`;
const shell = (html: string, current: 'tools' | 'privacy') =>
  (html.includes('google-adsense-account') ? html : html.replace('<meta name="theme-color" content="#0a0c10">', `<meta name="theme-color" content="#0a0c10">\n  ${ADSENSE_META}`))
    .replace(/<header class="site-header"[\s\S]*?<\/header>/, header(current))
    .replace(/<footer class="site-footer"[\s\S]*?<\/footer>[\s\S]*?(<\/body>)/, `${FOOTER}\n$1`);

const homePath = resolve(APP, 'index.html');
let home = readFileSync(homePath, 'utf8');
if (home.includes('<!-- tools:start')) home = home.replace(/<!-- tools:start[\s\S]*?<!-- tools:end -->/, homeTools());
else home = home.replace(/<section class="section section--tight" id="tools"[\s\S]*?<\/section>\s*(?=<section)/, `${homeTools()}\n\n    `);
if (writeIfChanged(homePath, shell(home, 'tools'))) changed++;

const privatePath = resolve(APP, 'private', 'index.html');
if (writeIfChanged(privatePath, shell(readFileSync(privatePath, 'utf8'), 'privacy'))) changed++;

console.log(`pages: ${live.length} tool pages, home and privacy checked; ${changed} file${changed === 1 ? '' : 's'} written`);
