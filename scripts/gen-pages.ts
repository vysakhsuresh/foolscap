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
import { GROUPS, KEYWORDS, SEARCH_NAMES, TOOLS, type GroupId, type ToolMeta } from '../app/src/ops/tools.ts';
import { ADSENSE, DESCRIPTION, HELP, MADE_BY, SHARE_URL, SITE_NAME, SITE_ORIGIN } from '../app/src/site/config.ts';
import { GUIDES, type Guide } from '../app/src/site/guides.ts';
import { TOOL_COPY } from '../app/src/site/tool-copy.ts';
import { GROUP_ICONS, TOOL_ICONS } from '../app/src/ui/tool-icons.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, 'app');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = (body: string, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const live = TOOLS.filter((t) => t.status === 'live');
const groupOf = (id: GroupId) => GROUPS.find((g) => g.id === id) ?? { id, title: id, blurb: '' };

// ---- The shell: one copy, every page ----

// The mark: a page whose top edge is a jester's cap, bells on its three
// points, drawn as one line. The name is the fool's cap the paper once carried
// as a watermark; the drawing says it in one shape. Inline, so it costs no
// request; the same drawing is in app/public/brand/ for icons.
const CAP_DRAWING = (ink: string) =>
  `<g fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 29 C 16 18, 9 10, 4.5 19 C 11 15, 20 16, 24.5 22 C 27 15, 29.5 10, 32 6.5 C 34.5 10, 37 15, 39.5 22 C 44 16, 53 15, 59.5 19 C 55 10, 48 18, 46 29 V52 Q46 57 41 57 H23 Q18 57 18 52 Z"/><path d="M25 39 H39 M25 47.5 H35"/></g><g fill="${ink}"><circle cx="4.5" cy="20" r="4"/><circle cx="32" cy="6.5" r="4"/><circle cx="59.5" cy="20" r="4"/></g>`;
const CAP_GRADIENT = (id: string) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".55" stop-color="#4facfe"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>`;
const MARK = `<svg class="mark" data-testid="mark" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true" focusable="false">${CAP_GRADIENT('mark-g')}<rect width="64" height="64" rx="15" fill="url(#mark-g)"/><g transform="translate(8.5 9) scale(.74)">${CAP_DRAWING('#fff')}</g></svg>`;

// Buy me a coffee's cup: Lucide's coffee, the same drawing and size as on layerbit.co.in.
const CUP =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/></g></svg>';

// The tab icon, the home-screen icon and the install manifest, on every page.
const ICONS = `<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/brand/favicon-48.png" type="image/png" sizes="48x48">
  <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">`;

// Back to the tools, from the bottom-left of every tool page, to the spot you left.
const HOME_FAB = (id: string) =>
  `<nav class="home-fab__nav" aria-label="Back to all tools"><a class="home-fab" data-testid="home-fab" href="/#from-${id}" aria-label="All tools"><svg class="home-fab__mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${CAP_GRADIENT('fab-g')}${CAP_DRAWING('url(#fab-g)')}</svg><span class="home-fab__label">All tools</span></a></nav>`;


type Section = 'tools' | 'guides' | 'privacy' | 'none';

function header(current: Section): string {
  const t = current === 'tools' ? ' aria-current="page"' : '';
  const g = current === 'guides' ? ' aria-current="page"' : '';
  const p = current === 'privacy' ? ' aria-current="page"' : '';
  return `<header class="site-header" data-testid="site-header">
    <div class="wrap site-header__row">
      <a class="brand" href="/">${MARK}<span>Foolscap</span></a>
      <nav class="site-nav" data-testid="site-nav" aria-label="Site">
        <a href="/#tools"${t}>Tools</a>
        <a href="/guides/"${g}>Guides</a>
        <a href="/private/"${p}>Privacy</a>
      </nav>
      <a class="support" data-testid="support" href="${HELP.coffee}" target="_blank" rel="noopener" aria-label="Buy me a coffee">${CUP}<span class="support__text">Buy me a coffee</span></a>
    </div>
  </header>`;
}

// "Tell a friend" (SHARE_URL): a plain wa.me link with the site's address in
// it. Nothing is fetched or sent until it is tapped, and it carries nothing
// from the page.

const FOOTER = `<footer class="site-footer" data-testid="site-footer">
    <div class="wrap site-footer__row">
      <p>© 2026 Foolscap · from <a href="https://layerbit.co.in" rel="noopener">Layerbit</a></p>
      <p class="site-footer__links"><a href="/guides/">Guides</a><a href="/about/">About</a><a href="/private/">Privacy</a><a href="/terms/">Terms</a><a href="/contact/">Contact</a><button class="linklike" type="button" popovertarget="help-panel">Get help</button><a href="${HELP.coffee}" target="_blank" rel="noopener">Buy me a coffee</a><a class="share-link" data-testid="share-whatsapp" href="${SHARE_URL}" target="_blank" rel="noopener">Tell a friend on WhatsApp</a></p>
    </div>
  </footer>
  <button class="help-orb" type="button" popovertarget="help-panel" data-testid="help-orb" aria-label="Get help">
    <span class="help-orb__label" aria-hidden="true">GET HELP</span>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="#38bdf8" fill-opacity="0.1" stroke="#38bdf8" stroke-width="2" stroke-linejoin="round"/><rect class="help-orb__bar" x="8" y="8.5" width="1.6" height="5" rx="0.8" fill="#00f2fe"/><rect class="help-orb__bar" x="11.2" y="7" width="1.6" height="8" rx="0.8" fill="#38bdf8"/><rect class="help-orb__bar" x="14.4" y="8.5" width="1.6" height="5" rx="0.8" fill="#00f2fe"/></svg>
  </button>
  <div class="help-panel" id="help-panel" popover data-testid="help-panel" role="dialog" aria-labelledby="help-title">
    <button class="help-panel__close" type="button" popovertarget="help-panel" popovertargetaction="hide" aria-label="Close">×</button>
    <h2 id="help-title">Get help with Foolscap</h2>
    <p>Ask us anything. Please don’t send us your documents — we never need them to help.</p>
    <a class="help-option" data-testid="help-email" href="mailto:${HELP.email}?subject=Foolscap%20help"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18v12H3zM3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Send us an email</a>
    <a class="help-option help-option--whatsapp" data-testid="help-whatsapp" href="${HELP.whatsapp}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 9.5c.3 1.8 2.2 4 4 4.6l1.2-1.1 1.8.8c0 1-.9 1.7-2 1.7-3 0-5.9-2.9-5.9-5.9 0-1.1.7-2 1.7-2l.8 1.8Z" fill="currentColor"/></svg>Chat on WhatsApp</a>
  </div>`;

interface HeadOptions {
  /** The page's path from the root, '/tools/merge/'. Null for a page with no address of its own (404). */
  readonly path: string | null;
  readonly script: string;
  /** Structured data for search engines, one object per type. */
  readonly ld?: readonly object[] | undefined;
  readonly noindex?: boolean | undefined;
  /** Open Graph type: 'website', or 'article' for a guide. */
  readonly kind?: 'website' | 'article' | undefined;
}

/** What a search result shows of a title before it cuts it. */
const TITLE_MAX = 60;

const absolute = (path: string) => `${SITE_ORIGIN ?? ''}${path}`;
const OG_IMAGE = '/brand/og.png';

/** JSON for a <script type="application/ld+json"> block: no "<" can close the tag early. */
const ldJson = (data: object) => JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c');

/**
 * What search engines and link previews read: the canonical address, Open
 * Graph and Twitter cards, and structured data. Written between markers so
 * the hand-written pages (home, privacy) get the same block, regenerated.
 */
function seo(title: string, description: string, o: Pick<HeadOptions, 'path' | 'ld' | 'noindex' | 'kind'>): string {
  const lines = ['<!-- seo:start (generated by scripts/gen-pages.ts) -->'];
  if (o.noindex) lines.push('<meta name="robots" content="noindex">');
  if (SITE_ORIGIN !== null && o.path !== null) lines.push(`<link rel="canonical" href="${absolute(o.path)}">`);
  lines.push(
    `<meta property="og:type" content="${o.kind ?? 'website'}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    '<meta property="og:locale" content="en_IN">',
  );
  if (SITE_ORIGIN !== null) {
    if (o.path !== null) lines.push(`<meta property="og:url" content="${absolute(o.path)}">`);
    lines.push(
      `<meta property="og:image" content="${absolute(OG_IMAGE)}">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta property="og:image:alt" content="${SITE_NAME}: PDF tools that can’t upload your files">`,
    );
  }
  lines.push('<meta name="twitter:card" content="summary_large_image">');
  for (const data of o.ld ?? []) lines.push(`<script type="application/ld+json">${ldJson(data)}</script>`);
  lines.push('<!-- seo:end -->');
  return lines.join('\n  ');
}

function head(title: string, description: string, o: HeadOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a0c10">
  <meta name="google-adsense-account" content="${ADSENSE.client}">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${seo(title, description, o)}
  ${ICONS}
  <script type="module" src="${o.script}"></script>
</head>`;
}

/** Plain text with `[words](/tools/id/)` links, as HTML. Only links inside this site are made. */
function rich(text: string): string {
  let out = '';
  let at = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\((\/(?:tools|guides)\/[a-z0-9-]+\/)\)/g)) {
    out += esc(text.slice(at, m.index)) + `<a href="${m[2]}">${esc(m[1] ?? '')}</a>`;
    at = (m.index ?? 0) + m[0].length;
  }
  return out + esc(text.slice(at));
}

/** The same text with the link syntax dropped, for meta tags and structured data. */
const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

const ORGANIZATION = { '@type': 'Organization', name: SITE_NAME, url: absolute('/'), logo: absolute('/brand/icon-512.png'), parentOrganization: { '@type': 'Organization', name: MADE_BY.name, url: MADE_BY.url } };

const breadcrumbs = (trail: ReadonlyArray<readonly [string, string]>) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: absolute(path) })),
});

const faqLd = (faq: ReadonlyArray<{ readonly q: string; readonly a: string }>) => ({
  '@type': 'FAQPage',
  mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: plain(q), acceptedAnswer: { '@type': 'Answer', text: plain(a) } })),
});

function faqHtml(faq: ReadonlyArray<{ readonly q: string; readonly a: string }>): string {
  return `<div class="faq">
        ${faq.map(({ q, a }) => `<details class="faq__item"><summary>${esc(q)}</summary><p>${rich(a)}</p></details>`).join('\n        ')}
      </div>`;
}

const PROMISE = 'In your browser; nothing is uploaded. Free, no sign-up, no limits, no watermark.';

// ---- Tool pages ----

function dropZone(tool: ToolMeta): { title: string; hint: string; accept: string; multiple: boolean } {
  switch (tool.input) {
    case 'images':
      return { title: 'Drop your photos here, or tap to pick them', hint: 'JPEG, PNG, WebP or GIF. They stay on this device.', accept: 'image/*', multiple: true };
    case 'camera':
      return { title: 'Take a photo of each page, or pick photos', hint: 'One photo per page, in order. They stay on this device.', accept: 'image/*', multiple: true };
    case 'office':
      return {
        title: 'Drop Word or Excel files here, or tap to pick them',
        hint: '.docx and .xlsx. They stay on this device.',
        accept: '.docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        multiple: true,
      };
    case 'pdf-and-files':
      return { title: 'Drop the PDF, then the files to go inside it', hint: 'Any kind of file. They stay on this device.', accept: '', multiple: true };
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
  const path = `/tools/${tool.id}/`;
  // Search results cut a title at about 60 characters: the longest form that fits.
  const name = SEARCH_NAMES[tool.id];
  const title =
    [`${name} online, free and private — Foolscap`, `${name}, free and private — Foolscap`, `${name}, free — Foolscap`, `${name} — Foolscap`].find((t) => t.length <= TITLE_MAX) ?? name.slice(0, TITLE_MAX);
  // Search results show about 160 characters of a description: the promise shortens before the summary does.
  const description = [
    `${SEARCH_NAMES[tool.id]} in your browser. ${tool.summary}. Nothing is uploaded: free, no sign-up, no limits, no watermark.`,
    `${SEARCH_NAMES[tool.id]} in your browser. ${tool.summary}. Free, and nothing is uploaded.`,
    `${tool.summary}. Free, in your browser, and nothing is uploaded.`,
  ].find((d) => d.length <= 160) ?? `${tool.summary}. Nothing is uploaded.`;
  const copy = TOOL_COPY[tool.id];
  const guides = GUIDES.filter((g) => g.tool === tool.id || g.related.includes(tool.id)).sort((a, b) => Number(b.tool === tool.id) - Number(a.tool === tool.id)).slice(0, 4);
  // No WebApplication block: Google's software-app report insists on ratings or
  // reviews, and we will not invent either.
  const ld: object[] = [breadcrumbs([['Home', '/'], [tool.title, path]])];
  if (copy) {
    ld.push({ '@type': 'HowTo', name: `How to use ${SEARCH_NAMES[tool.id]}`, step: copy.steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text: plain(text) })) });
  }
  if (copy) ld.push(faqLd(copy.faq));
  const help =
    copy || guides.length > 0
      ? `<section class="tool-help" aria-labelledby="tool-help-title">
      <h2 class="tool-help__title" id="tool-help-title">About ${esc(tool.title)}</h2>
      ${
        copy
          ? [
              `<p class="tool-help__about">${rich(copy.about)}</p>`,
              copy.steps.length > 0 ? `<h3 class="tool-help__subtitle">How to use it</h3>\n      <ol class="tool-help__steps">${copy.steps.map((step) => `<li>${rich(step)}</li>`).join('')}</ol>` : '',
              copy.notes.length > 0 ? `<h3 class="tool-help__subtitle">Good to know</h3>\n      ${copy.notes.map((note) => `<p class="tool-help__about">${rich(note)}</p>`).join('\n      ')}` : '',
              `<h3 class="tool-help__subtitle">Questions people ask</h3>\n      ${faqHtml(copy.faq)}`,
            ]
              .filter(Boolean)
              .join('\n      ')
          : ''
      }
      ${
        guides.length > 0
          ? `<h3 class="tool-help__subtitle">Guides</h3>
      <ul class="guide-links">
        ${guides.map((g) => `<li><a href="/guides/${g.slug}/">${esc(g.h1)}</a></li>`).join('\n        ')}
      </ul>`
          : ''
      }
    </section>`
      : '';
  return `${head(title, description, { path, script: '/src/pages/tool.ts', ld })}
<body data-tool="${tool.id}" data-group="${tool.group}" data-page="tool">
  ${header('tools')}
  <main class="wrap tool" data-app>
    <header class="tool__head">
      <a class="crumb" href="/#${group.id}">${svg(GROUP_ICONS[group.id], 'crumb__icon')}<span>${esc(group.title)}</span></a>
      <h1 class="tool__title" data-testid="tool-title">${esc(tool.title)}</h1>
      <p class="tool__summary">${esc(tool.summary)}. Nothing is uploaded: the work happens on this device.</p>
    </header>
    ${
      tool.input === 'none'
        ? ''
        : `<label class="drop-zone" data-testid="drop-zone" for="file-input">
      ${svg(TOOL_ICONS[tool.id], 'drop-zone__icon')}
      <span class="drop-zone__title">${zone.title}</span>
      <span class="drop-zone__hint" id="drop-hint">${zone.hint}</span>
      <input class="visually-hidden" id="file-input" data-testid="file-input" type="file"${zone.accept ? ` accept="${zone.accept}"` : ''}${zone.multiple ? ' multiple' : ''} aria-describedby="drop-hint">
    </label>`
    }
    <div data-slot="body"></div>
    <nav class="related" aria-labelledby="related-title">
      <h2 class="related__title" id="related-title">${siblings.length > 0 ? `More in ${esc(group.title)}` : 'More tools'}</h2>
      <div class="related__list">
        ${related}
        <a class="related__item related__item--all" href="/#tools"><span>All tools</span><span aria-hidden="true">→</span></a>
      </div>
    </nav>
    ${help}
  </main>
  ${FOOTER}
  ${HOME_FAB(tool.id)}
</body>
</html>
`;
}

const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const MORE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** A row of family chips that scrolls sideways on a phone, with an arrow while more are off to the right (ui/jumps.ts). */
const jumpRow = (label: string, chips: string) => `<div class="family-jumps__wrap" data-jumps>
        <nav class="family-jumps" aria-label="${label}">${chips}</nav>
        <button class="family-jumps__more" type="button" data-jumps-more data-testid="jumps-more" aria-label="Show more" hidden>${MORE_ICON}</button>
      </div>`;

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
      ${jumpRow('Tool families', jumps)}
      <button class="search-fab" type="button" data-search-fab data-testid="search-fab" aria-label="Find a tool" hidden>${SEARCH_ICON}</button>
      ${families}
    </section>
    <!-- tools:end -->`;
}

// ---- Reading pages: guides, About, Terms, Contact, not found ----

interface ArticleOptions {
  readonly title: string;
  readonly description: string;
  readonly path: string | null;
  readonly section: Section;
  readonly body: string;
  readonly ld?: readonly object[];
  readonly noindex?: boolean;
  readonly kind?: 'website' | 'article';
  /** Only the guides carry ads (AD_PAGES in site/config.ts); the policy on every other path refuses them. */
  readonly ads?: boolean;
  /** Where the way home says you came from: the home page lands where you left it. */
  readonly from: string;
}

function articlePage(o: ArticleOptions): string {
  return `${head(o.title, o.description, { path: o.path, script: '/src/pages/article.ts', ld: o.ld, noindex: o.noindex, kind: o.kind })}
<body data-page="article"${o.ads ? ' data-ads="on"' : ''}>
  ${header(o.section)}
  <main class="wrap">
    ${o.body}
  </main>
  ${FOOTER}
  ${HOME_FAB(o.from)}
</body>
</html>
`;
}

const toolTile = (t: ToolMeta) => `<a class="related__item" href="/tools/${t.id}/">${svg(TOOL_ICONS[t.id], 'related__icon')}<span>${esc(t.title)}</span></a>`;
const guideCard = (g: Guide) =>
  `<a class="guide-card" href="/guides/${g.slug}/" data-group="${toolById(g.tool).group}"><span class="guide-card__title">${esc(g.h1)}</span><span class="guide-card__summary">${esc(g.description)}</span></a>`;
const toolById = (id: ToolMeta['id']): ToolMeta => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`no tool ${id}`);
  return tool;
};

const SAFE_NOTE = `<div class="callout"><p><strong>Your file stays on your device.</strong> Foolscap does the work inside your browser, so nothing is uploaded and there is nothing for anyone to keep. <a href="/private/">How you can check</a></p></div>`;

function guidePage(g: Guide): string {
  const tool = toolById(g.tool);
  const path = `/guides/${g.slug}/`;
  const group = groupOf(tool.group);
  const others = [
    ...GUIDES.filter((o) => o !== g && o.tool === g.tool),
    ...GUIDES.filter((o) => o !== g && o.tool !== g.tool && toolById(o.tool).group === tool.group),
    ...GUIDES.filter((o) => o !== g && toolById(o.tool).group !== tool.group),
  ].slice(0, 5);
  const tools = [tool, ...g.related.map(toolById)].filter((t, i, all) => t.status === 'live' && all.indexOf(t) === i);
  const body = `<article class="prose guide" data-testid="guide" data-group="${tool.group}">
      <nav class="trail" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/guides/">Guides</a><span aria-hidden="true">/</span><span>${esc(group.title)}</span></nav>
      <h1>${esc(g.h1)}</h1>
      <p class="lead">${rich(g.intro)}</p>
      <p class="guide__cta"><a class="button" data-testid="guide-cta" href="/tools/${tool.id}/">${esc(tool.title)}<span aria-hidden="true"> →</span></a><span class="guide__promise">Free. Nothing is uploaded.</span></p>
      <h2>How to do it</h2>
      <ol class="guide__steps">
        ${g.steps.map((step) => `<li>${rich(step)}</li>`).join('\n        ')}
      </ol>
      ${g.sections.map((section) => `<h2>${esc(section.heading)}</h2>\n      ${section.paragraphs.map((p) => `<p>${rich(p)}</p>`).join('\n      ')}`).join('\n      ')}
      <h2>Questions people ask</h2>
      ${faqHtml(g.faq)}
      ${SAFE_NOTE}
      <h2>Tools for this</h2>
      <div class="related__list">
        ${tools.map(toolTile).join('\n        ')}
      </div>
      ${others.length > 0 ? `<h2>More guides</h2>\n      <ul class="guide-links">\n        ${others.map((o) => `<li><a href="/guides/${o.slug}/">${esc(o.h1)}</a></li>`).join('\n        ')}\n      </ul>` : ''}
    </article>`;
  return articlePage({
    from: 'guide',
    title: `${g.title} — ${SITE_NAME}`.length <= TITLE_MAX ? `${g.title} — ${SITE_NAME}` : g.title,
    description: g.description,
    path,
    section: 'guides',
    kind: 'article',
    ads: true,
    body,
    ld: [
      { '@type': 'HowTo', name: plain(g.h1), description: plain(g.intro), tool: { '@type': 'HowToTool', name: `${SITE_NAME} ${tool.title}` }, step: g.steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text: plain(text) })) },
      faqLd(g.faq),
      breadcrumbs([['Home', '/'], ['Guides', '/guides/'], [plain(g.h1), path]]),
    ],
  });
}

function guidesIndex(): string {
  const groups = GROUPS.map((group) => {
    const inGroup = GUIDES.filter((g) => toolById(g.tool).group === group.id);
    if (inGroup.length === 0) return '';
    return `<section class="guide-group" id="g-${group.id}" aria-labelledby="guides-${group.id}">
        <h2 id="guides-${group.id}">${esc(group.title)}</h2>
        <div class="guide-grid">
          ${inGroup.map(guideCard).join('\n          ')}
        </div>
      </section>`;
  })
    .filter(Boolean)
    .join('\n      ');
  return articlePage({
    from: 'guides',
    title: 'PDF guides: compress, unlock, convert, sign — Foolscap',
    description: `${GUIDES.length} short guides to the PDF jobs people search for most: compress to 100 KB, open an Aadhaar PDF, bank statement to Excel, sign, merge.`,
    path: '/guides/',
    section: 'guides',
    ads: true,
    body: `<div class="guides" data-testid="guides-index">
      <h1 class="guides__title">Guides</h1>
      <p class="lead">Short, straight answers to the PDF jobs people ask about most, each with the free tool that does it. Nothing you open is ever uploaded.</p>
      ${jumpRow(
        'Guide families',
        GROUPS.filter((g) => GUIDES.some((guide) => toolById(guide.tool).group === g.id))
          .map((g) => `<a class="family-jump" href="#g-${g.id}" data-group="${g.id}">${svg(GROUP_ICONS[g.id])}<span>${esc(g.title)}</span></a>`)
          .join(''),
      )}
      ${groups}
    </div>`,
    ld: [
      { '@type': 'CollectionPage', name: 'Foolscap guides', url: absolute('/guides/'), hasPart: GUIDES.map((g) => ({ '@type': 'HowTo', name: plain(g.h1), url: absolute(`/guides/${g.slug}/`) })) },
      breadcrumbs([['Home', '/'], ['Guides', '/guides/']]),
    ],
  });
}

const aboutPage = () =>
  articlePage({
    from: 'about',
    title: 'About Foolscap: free PDF tools that never upload',
    description: 'Who makes Foolscap, why the tools run in your browser instead of on a server, and how a free site with no sign-up and no limits pays for itself.',
    path: '/about/',
    section: 'none',
    body: `<article class="prose" data-testid="about">
      <h1>About Foolscap</h1>
      <p class="lead">Foolscap does to PDFs what the big PDF sites do — merge, compress, sign, unlock, convert — except the work happens inside your browser, and your file never leaves your device.</p>
      <h2>Why it exists</h2>
      <p>Most PDF sites upload your file to their server, do the work there and send it back. That is why they cap the free tier and charge for the second task: every file costs them something. It also means a stranger’s computer holds your salary slip, your lease or your bank statement for a while.</p>
      <p>Browsers are now strong enough to do the work themselves. So Foolscap is a folder of files — pages, scripts and fonts — that your browser downloads once and runs. There is no server to send anything to, which is also why there is no file-size limit, no daily limit and no account.</p>
      <h2>Who makes it</h2>
      <p>Foolscap is made by <a href="${MADE_BY.url}" rel="noopener">${MADE_BY.name}</a>, in India. It is the web version of Sheaf, our Android PDF app, and follows the same rules.</p>
      <h2>What it can do</h2>
      <p>There are ${live.length} tools, in five groups. <strong>Pages</strong> joins, splits, reorders and trims. <strong>Convert and print</strong> makes PDFs smaller, turns them into Word, Excel, PowerPoint or e-books, and turns photos and Word or Excel files into PDFs. <strong>Mark up</strong> signs, writes, highlights, numbers and stamps pages, and fills in or creates forms. <strong>Protect</strong> adds and removes passwords, removes private details for good, cleans hidden data and signs with a certificate. <strong>Read and capture</strong> opens documents, scans paper with a phone camera, makes scans searchable and compares two versions.</p>
      <p>Every tool makes a new file and leaves the one you picked untouched. Once a tool page has loaded, it keeps working with no internet connection, and the site can be installed on a phone or computer like an app.</p>
      <h2>Honest about limits</h2>
      <p>Doing the work on your device has costs as well as benefits. A very large file needs a device with enough memory, and an old phone is slower than a server would be. Some jobs that need a server or a paid licence — opening a password you do not know, signing with a USB token — are not offered at all, rather than offered badly. Where a tool cannot do something well, it says so in plain words instead of handing back a poor result.</p>
      <h2>How it stays free</h2>
      <p>The home page and the guides show adverts from Google. The tool pages never do: their security policy makes it impossible for any outside script to run where your documents are. If Foolscap saves you time, you can also <a href="${HELP.coffee}" rel="noopener">buy us a coffee</a>.</p>
      <h2>The promises</h2>
      <ul>
        <li>Free, with no paid tier.</li>
        <li>No sign-up, no account, no login.</li>
        <li>No watermark or branding on your documents.</li>
        <li>Nothing you open is uploaded, logged or kept.</li>
        <li>No limits on file size or number of files beyond what your device can do.</li>
      </ul>
      <p><a class="button" href="/#tools">Pick a tool</a></p>
    </article>`,
    ld: [{ '@type': 'AboutPage', name: 'About Foolscap', url: absolute('/about/'), about: ORGANIZATION }, breadcrumbs([['Home', '/'], ['About', '/about/']])],
  });

const termsPage = () =>
  articlePage({
    from: 'terms',
    title: 'Terms of use — Foolscap',
    description: 'The terms for using Foolscap: free PDF tools that run in your browser. What we promise, what you are responsible for, and the adverts on some pages.',
    path: '/terms/',
    section: 'none',
    body: `<article class="prose" data-testid="terms">
      <h1>Terms of use</h1>
      <p class="lead">Short and plain. By using this site you agree to these terms.</p>
      <h2>The service</h2>
      <p>Foolscap gives you tools that work on documents inside your own browser. We never receive your files, so we cannot see, keep, recover or delete them. Keep your own copy of anything important: every tool makes a new file and never changes the one you picked, but a browser or a device can still fail.</p>
      <h2>Your documents</h2>
      <p>Use the tools only on documents you have the right to work on. You are responsible for what you make with them — for example, a signature you place, a password you remove or a form you fill in. Removing a password is for files whose password you already know.</p>
      <h2>No warranty</h2>
      <p>The tools are provided free and as they are. We work hard to make them correct and test them on real documents, but we cannot promise any result is right for your purpose. Check what matters — a figure in a converted spreadsheet, a page in a merged file — before you rely on it. To the extent the law allows, we are not liable for any loss from using the site.</p>
      <h2>Adverts</h2>
      <p>The home page and the guides show adverts served by Google. Tool pages never do. How Google uses information on these pages is explained on our <a href="/private/">privacy page</a>.</p>
      <h2>Links to other sites</h2>
      <p>Some pages link to other services, such as WhatsApp, email and buymeacoffee.com. Those services have their own terms and privacy policies, and we are not responsible for them. Nothing is sent to them unless you tap the link.</p>
      <h2>Availability</h2>
      <p>We aim to keep the site available at all times, but we do not guarantee it. Because the tools run in your browser, a tool page that has already loaded, or a copy installed as an app, keeps working even when the site itself cannot be reached.</p>
      <h2>Changes</h2>
      <p>We may change these terms or the site. The current terms are always on this page.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: <a href="mailto:${HELP.email}">${HELP.email}</a>. These terms are governed by the laws of India.</p>
    </article>`,
    ld: [breadcrumbs([['Home', '/'], ['Terms', '/terms/']])],
  });

const contactPage = () =>
  articlePage({
    from: 'contact',
    title: 'Contact Foolscap — email or WhatsApp',
    description: 'Get help with Foolscap’s free PDF tools, report a problem or ask for a tool, by email or WhatsApp. Please never send us your documents.',
    path: '/contact/',
    section: 'none',
    body: `<article class="prose" data-testid="contact">
      <h1>Contact us</h1>
      <p class="lead">Ask anything, report something that went wrong, or tell us which tool you need next.</p>
      <div class="contact-options">
        <a class="help-option" href="mailto:${HELP.email}?subject=Foolscap"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18v12H3zM3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Email ${HELP.email}</a>
        <a class="help-option help-option--whatsapp" href="${HELP.whatsapp}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 9.5c.3 1.8 2.2 4 4 4.6l1.2-1.1 1.8.8c0 1-.9 1.7-2 1.7-3 0-5.9-2.9-5.9-5.9 0-1.1.7-2 1.7-2l.8 1.8Z" fill="currentColor"/></svg>Chat on WhatsApp</a>
      </div>
      <h2>Please don’t send your documents</h2>
      <p>We never need them to help, and we would rather not hold them. Foolscap is built so that your files never reach us, and sending one by email or WhatsApp would undo that. If a file is the only way to show a problem, make a copy with nothing private in it — a blank form, a page of test text — and check that the same thing happens with the copy.</p>
      <h2>When something goes wrong</h2>
      <p>A short description is enough for us to find most problems. It helps to say:</p>
      <ul>
        <li>which tool you used, for example Compress or PDF to Excel;</li>
        <li>what you expected, and what happened instead, including any message the page showed;</li>
        <li>the phone or computer and the browser you used, such as an Android phone with Chrome or a laptop with Edge;</li>
        <li>roughly how big the file was and how many pages it had.</li>
      </ul>
      <p>Before writing, it is worth trying once more after reloading the page, and making sure the browser is up to date: Foolscap needs a recent Chrome, Edge, Firefox or Safari.</p>
      <h2>Asking for a tool</h2>
      <p>Many of the tools on this site exist because someone asked. If there is a job you do with PDFs every month — a form your office sends, a report you split, a statement you convert — tell us what it is and what the result should look like. We read every request, though we can’t promise when, or whether, a tool will appear.</p>
      <h2>Quick answers</h2>
      <p>Many questions already have a page: how to <a href="/guides/compress-pdf-to-100kb/">get a PDF under 100 KB</a>, how to <a href="/guides/aadhaar-pdf-password/">open an e-Aadhaar PDF</a>, how to <a href="/guides/bank-statement-pdf-to-excel/">turn a bank statement into a spreadsheet</a>, and <a href="/guides/">all the other guides</a>. How your files are kept private is explained on the <a href="/private/">privacy page</a>.</p>
      <p>Foolscap is made by <a href="${MADE_BY.url}" rel="noopener">${MADE_BY.name}</a> in India. For anything else, including press and partnerships, the email above reaches the same people.</p>
    </article>`,
    ld: [{ '@type': 'ContactPage', name: 'Contact Foolscap', url: absolute('/contact/'), about: { ...ORGANIZATION, email: HELP.email } }, breadcrumbs([['Home', '/'], ['Contact', '/contact/']])],
  });

const notFoundPage = () =>
  articlePage({
    from: 'not-found',
    title: 'Page not found — Foolscap',
    description: 'That page is not here. Every Foolscap tool is one tap away from the home page.',
    path: null,
    section: 'none',
    noindex: true,
    body: `<article class="prose" data-testid="not-found">
      <h1>That page isn’t here</h1>
      <p class="lead">The address may have a typo, or the page has moved. Every tool is on the home page.</p>
      <p><a class="button" href="/#tools">See all tools</a></p>
      <h2>Most used</h2>
      <div class="related__list">
        ${(['merge', 'compress', 'pdf-to-excel', 'sign', 'remove-password', 'images-to-pdf'] as const).map((id) => toolTile(toolById(id))).join('\n        ')}
      </div>
    </article>`,
  });

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

// Home: the tool list and the guides between their markers, and the shell.
const ADSENSE_META = `<meta name="google-adsense-account" content="${ADSENSE.client}">`;
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The hand-written pages get the generated shell and the same search-engine block as every other page. */
function shell(html: string, current: Section, path: string, ld: readonly object[] = []): string {
  const title = unescape(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? SITE_NAME);
  const description = unescape(/<meta name="description" content="([^"]*)">/.exec(html)?.[1] ?? DESCRIPTION);
  return (html.includes('google-adsense-account') ? html : html.replace('<meta name="theme-color" content="#0a0c10">', `<meta name="theme-color" content="#0a0c10">\n  ${ADSENSE_META}`))
    .replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->\s*/, '')
    .replace(/<meta property="og:[^"]*" content="[^"]*">\s*/g, '')
    .replace(/(?:<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\s*)+/, `${seo(title, description, { path, ld })}\n  ${ICONS}\n  `)
    .replace(/<header class="site-header"[\s\S]*?<\/header>/, header(current))
    .replace(/<footer class="site-footer"[\s\S]*?<\/footer>[\s\S]*?(<\/body>)/, `${FOOTER}\n$1`);
}

function homeGuides(): string {
  return `<!-- guides:start (generated by scripts/gen-pages.ts) -->
    <section class="section" id="guides" aria-labelledby="guides-title">
      <h2 class="section__title" id="guides-title">Guides</h2>
      <div class="guide-grid">
        ${GUIDES.slice(0, 8).map(guideCard).join('\n        ')}
      </div>
      <p><a class="button button--ghost" href="/guides/">See all ${GUIDES.length} guides</a></p>
    </section>
    <!-- guides:end -->`;
}

const HOME_DESCRIPTION = `Free PDF tools in your browser: merge, compress, sign, edit, unlock, convert to Word or Excel — ${live.length} in all. Nothing is uploaded. No sign-up.`;
const HOME_LD: object[] = [
  { '@type': 'WebSite', name: SITE_NAME, url: absolute('/'), description: DESCRIPTION, inLanguage: 'en', publisher: ORGANIZATION },
  ORGANIZATION,
];

const homePath = resolve(APP, 'index.html');
let home = readFileSync(homePath, 'utf8');
if (home.includes('<!-- tools:start')) home = home.replace(/<!-- tools:start[\s\S]*?<!-- tools:end -->/, homeTools());
else home = home.replace(/<section class="section section--tight" id="tools"[\s\S]*?<\/section>\s*(?=<section)/, `${homeTools()}\n\n    `);
if (home.includes('<!-- guides:start')) home = home.replace(/<!-- guides:start[\s\S]*?<!-- guides:end -->/, homeGuides());
else home = home.replace(/(\s*)(<section class="section" aria-labelledby="how-title">)/, `$1${homeGuides()}\n\n    $2`);
home = home.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(HOME_DESCRIPTION)}">`).replace(/<body[^>]*>/, '<body data-page="home" data-ads="on">');
if (writeIfChanged(homePath, shell(home, 'tools', '/', HOME_LD))) changed++;

const privatePath = resolve(APP, 'private', 'index.html');
const privacy = shell(readFileSync(privatePath, 'utf8'), 'privacy', '/private/', [breadcrumbs([['Home', '/'], ['Privacy', '/private/']])])
  .replace(/\s*<nav class="home-fab__nav"[\s\S]*?<\/nav>/, '')
  .replace(/(\s*)<\/body>/, `$1  ${HOME_FAB('privacy')}$1</body>`);
if (writeIfChanged(privatePath, privacy)) changed++;

// The reading pages, all generated.
const guidesDir = resolve(APP, 'guides');
if (writeIfChanged(resolve(guidesDir, 'index.html'), guidesIndex())) changed++;
for (const g of GUIDES) if (writeIfChanged(resolve(guidesDir, g.slug, 'index.html'), guidePage(g))) changed++;
for (const dir of existsSync(guidesDir) ? readdirSync(guidesDir) : []) {
  if (dir !== 'index.html' && !GUIDES.some((g) => g.slug === dir)) {
    rmSync(resolve(guidesDir, dir), { recursive: true, force: true });
    changed++;
  }
}
if (writeIfChanged(resolve(APP, 'about', 'index.html'), aboutPage())) changed++;
if (writeIfChanged(resolve(APP, 'terms', 'index.html'), termsPage())) changed++;
if (writeIfChanged(resolve(APP, 'contact', 'index.html'), contactPage())) changed++;
// Cloudflare Pages serves 404.html, with a 404 status, for any address that is
// not a file. Without it, Pages would answer every unknown address with the
// home page and a 200, which search engines count against a site.
if (writeIfChanged(resolve(APP, '404.html'), notFoundPage())) changed++;

// ---- For search engines ----
// A sitemap and robots.txt's pointer to it need absolute URLs, so they wait
// for SITE_ORIGIN (site/config.ts). Without one robots.txt only allows all.
{
  const publicDir = resolve(APP, 'public');
  const paths = ['/', '/guides/', ...GUIDES.map((g) => `/guides/${g.slug}/`), ...live.map((t) => `/tools/${t.id}/`), '/about/', '/contact/', '/private/', '/terms/'];
  const robots = SITE_ORIGIN === null ? 'User-agent: *\nAllow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
  if (writeIfChanged(resolve(publicDir, 'robots.txt'), robots)) changed++;
  const sitemapPath = resolve(publicDir, 'sitemap.xml');
  if (SITE_ORIGIN === null) {
    if (existsSync(sitemapPath)) rmSync(sitemapPath);
  } else {
    const urls = paths.map((p) => `  <url><loc>${SITE_ORIGIN}${p}</loc></url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    if (writeIfChanged(sitemapPath, xml)) changed++;
  }
}

console.log(`pages: ${live.length} tool pages, ${GUIDES.length} guides, home, privacy, about, terms, contact and 404 checked; ${changed} file${changed === 1 ? '' : 's'} written`);
