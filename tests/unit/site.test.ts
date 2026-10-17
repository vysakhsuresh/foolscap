/**
 * The tool list is the site's single source of truth, so what it promises
 * must exist: a page per live tool, an Op per live tool, the home page linking
 * to each, and the privacy page's quoted policy matching the one really served.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OP_IDS } from '../../app/src/ops';
import { LIVE_TOOLS, TOOLS, toolPath } from '../../app/src/ops/tools';
import * as config from '../../app/src/site/config';
import { headersFor, parseHeaders } from '../../scripts/vite-cf-headers';

const ROOT = resolve(__dirname, '../..');
const APP = join(ROOT, 'app');

describe('tools.ts', () => {
  it('has unique, URL-safe ids', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `tool id "${id}" must be lower-case letters, digits and hyphens`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every tool a title, a summary and an action that is a different sentence from the title', () => {
    for (const tool of TOOLS) {
      expect(tool.title.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.summary.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.action.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.action.toLowerCase(), `${tool.id}: the button must say what it does, not repeat the page title`).not.toBe(tool.title.toLowerCase());
    }
  });

  it('has at least the three stage-1 tools live', () => {
    const live = LIVE_TOOLS.map((t) => t.id);
    expect(live).toEqual(expect.arrayContaining(['merge', 'split', 'organise']));
  });

  it('every live tool has an Op, and every Op belongs to a live tool (a viewer has none)', () => {
    expect([...OP_IDS].sort()).toEqual(LIVE_TOOLS.filter((t) => t.viewer !== true).map((t) => t.id).sort());
  });

  it('every live tool has an HTML entry whose body names it', () => {
    for (const tool of LIVE_TOOLS) {
      const path = join(APP, 'tools', tool.id, 'index.html');
      expect(existsSync(path), `${tool.id} is live but app/tools/${tool.id}/index.html is missing`).toBe(true);
      const html = readFileSync(path, 'utf8');
      expect(html, `app/tools/${tool.id}/index.html needs <body data-tool="${tool.id}">`).toMatch(
        new RegExp(`<body\\b[^>]*\\sdata-tool="${tool.id}"`),
      );
    }
  });

  it('the home page names and links every live tool in its static HTML', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8');
    for (const tool of LIVE_TOOLS) {
      expect(html, `app/index.html must mention "${tool.title}"`).toContain(tool.title);
      expect(html, `app/index.html must link to ${toolPath(tool.id)}`).toContain(`href="${toolPath(tool.id)}"`);
    }
  });
});

describe('site/config.ts', () => {
  it('TOOL_PAGE_CSP and AD_PAGE_CSP are the policies _headers really serves', () => {
    const blocks = parseHeaders(readFileSync(join(APP, 'public', '_headers'), 'utf8'));
    const constant = (config as unknown as Record<string, unknown>)['TOOL_PAGE_CSP'];
    expect(
      constant,
      'app/src/site/config.ts must export TOOL_PAGE_CSP: the literal Content-Security-Policy value from app/public/_headers, which the privacy page quotes.',
    ).toBeTypeOf('string');
    expect(headersFor(blocks, '/tools/merge/')['Content-Security-Policy']).toBe(constant);
    expect(headersFor(blocks, '/private/')['Content-Security-Policy']).toBe(constant);
    expect(headersFor(blocks, '/')['Content-Security-Policy']).toBe(config.AD_PAGE_CSP);
  });

  it('names the site without promising a domain it does not have', () => {
    expect(config.SITE_NAME).toBe('Foolscap');
    if (config.SITE_ORIGIN !== null) expect(config.SITE_ORIGIN).toMatch(/^https:\/\/[^/]+$/);
  });
});

describe('the page-side op table', () => {
  it('matches every op: arity, and what the worker loads at start', async () => {
    const { OP_IDS, getOp } = await import('../../app/src/ops');
    const { OP_META } = await import('../../app/src/ops/meta');
    expect(Object.keys(OP_META).sort()).toEqual([...OP_IDS].sort());
    for (const id of OP_IDS) {
      const op = getOp(id);
      expect(OP_META[id], id).toEqual({ arity: op.arity, ...(op.engine ? { engine: true } : {}), ...(op.ocr ? { ocr: true } : {}) });
    }
  });
});

describe('the _headers emulator behaves like Cloudflare', () => {
  it('joins a header two blocks set, and `!` detaches one', () => {
    const blocks = parseHeaders('/*\n  X-A: one\n  X-B: keep\n/x/*\n  X-A: two\n/x/y\n  ! X-B\n');
    expect(headersFor(blocks, '/x/z')).toEqual({ 'X-A': 'one, two', 'X-B': 'keep' });
    expect(headersFor(blocks, '/x/y')).toEqual({ 'X-A': 'one, two' });
    expect(headersFor(blocks, '/other')).toEqual({ 'X-A': 'one', 'X-B': 'keep' });
  });
});

describe('ads', () => {
  it('load only on the real address', async () => {
    const { adsAllowedOn, ADSENSE_SRC } = await import('../../app/src/ui/ads');
    expect(adsAllowedOn('foolscap.co.in')).toBe(true);
    expect(adsAllowedOn('www.foolscap.co.in')).toBe(true);
    for (const host of ['localhost', '127.0.0.1', 'vysakhsuresh.github.io', 'foolscap.pages.dev', 'evilfoolscap.co.in']) expect(adsAllowedOn(host), host).toBe(false);
    expect(ADSENSE_SRC).toBe(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.ADSENSE.client}`);
  });

  it('ads.txt names the same publisher', () => {
    const ads = readFileSync(join(APP, 'public', 'ads.txt'), 'utf8');
    expect(ads).toContain(`google.com, ${config.ADSENSE.client.replace('ca-', '')}, DIRECT, f08c47fec0942fa0`);
  });
});

describe('the theme', () => {
  it('public/theme.js reads the key the switch writes, and paints the light ground the tokens use', async () => {
    const { THEME_KEY, THEME_COLOUR } = await import('../../app/src/ui/theme');
    const early = readFileSync(join(APP, 'public', 'theme.js'), 'utf8');
    expect(early).toContain(`'${THEME_KEY}'`);
    expect(early).toContain(THEME_COLOUR.light);
    const tokens = readFileSync(join(APP, 'src', 'ui', 'tokens.css'), 'utf8');
    expect(tokens).toContain(`--bg: ${THEME_COLOUR.dark};`);
    expect(tokens).toContain(`--bg: ${THEME_COLOUR.light};`);
  });

  it('every page loads it as a plain script in its <head>, before any module, with the switch in its header', () => {
    const pages = [join(APP, 'index.html'), join(APP, '404.html'), join(APP, 'private', 'index.html'), join(APP, 'guides', 'index.html'), ...LIVE_TOOLS.map((t) => join(APP, 'tools', t.id, 'index.html'))];
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      const early = html.indexOf('<script src="/theme.js"></script>');
      expect(early, file).toBeGreaterThan(0);
      expect(early, file).toBeLessThan(html.indexOf('<script type="module"'));
      expect(early, file).toBeLessThan(html.indexOf('</head>'));
      expect(html, file).toContain('<meta name="color-scheme" content="dark">');
      expect(html, file).toContain('data-testid="theme-toggle"');
    }
  });
});

describe('what a search result shows', () => {
  const pages = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (!e.isDirectory() || ['src', 'public'].includes(e.name)) return [];
      const sub = join(dir, e.name);
      return [...(existsSync(join(sub, 'index.html')) ? [join(sub, 'index.html')] : []), ...pages(sub)];
    });

  it('every indexable page has a title of at most 60 characters and a description of 110 to 160, none shared', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const file of [join(APP, 'index.html'), ...pages(APP)]) {
      const html = readFileSync(file, 'utf8');
      if (html.includes('name="robots" content="noindex"')) continue;
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
      const description = (/<meta name="description" content="([^"]*)">/.exec(html)?.[1] ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      expect(title.length, `${file}: "${title}"`).toBeLessThanOrEqual(60);
      expect(description.length, `${file}: description`).toBeGreaterThanOrEqual(110);
      expect(description.length, `${file}: description`).toBeLessThanOrEqual(160);
      expect(titles.has(title), `${file}: title used twice`).toBe(false);
      expect(descriptions.has(description), `${file}: description used twice`).toBe(false);
      titles.add(title);
      descriptions.add(description);
      expect(html.match(/<h1\b/g)?.length ?? 0, `${file}: one h1`).toBe(1);
      expect(html, `${file}: canonical`).toMatch(/<link rel="canonical" href="https:\/\/foolscap\.co\.in\/[^"]*">/);
      expect(html, `${file}: no WebApplication block (Google's app report wants ratings we will not invent)`).not.toContain('"WebApplication"');
    }
  });

  it('the pages.dev copy is never indexed', () => {
    const blocks = parseHeaders(readFileSync(join(APP, 'public', '_headers'), 'utf8'));
    expect(blocks.find((b) => b.pattern === 'https://:project.pages.dev/*')?.headers['X-Robots-Tag']).toBe('noindex');
  });
});

describe('on a host that cannot send headers (GitHub Pages)', () => {
  it('each page carries the policy _headers gives its path, without frame-ancestors', async () => {
    const { metaFor, pagePath } = await import('../../scripts/vite-rebase-html');
    const blocks = parseHeaders(readFileSync(join(APP, 'public', '_headers'), 'utf8'));
    const tool = metaFor(blocks, pagePath('/tools/merge/index.html')).join('\n');
    expect(tool).toContain(config.TOOL_PAGE_CSP.replace("; frame-ancestors 'none'", ''));
    expect(tool).not.toContain('frame-ancestors');
    expect(tool).toContain('<meta name="referrer" content="no-referrer">');
    const home = metaFor(blocks, pagePath('/index.html')).join('\n');
    expect(home).toContain(config.AD_PAGE_CSP.replace("; frame-ancestors 'none'", ''));
    expect(metaFor(blocks, pagePath('/guides/merge-pdf-files/index.html')).join('\n')).toContain('https:');
  });
});
