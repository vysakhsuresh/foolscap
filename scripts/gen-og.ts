/**
 * The picture a link shows when it is shared (WhatsApp, Facebook, LinkedIn,
 * X): one per tool and per guide, 1200 × 630, with the page's own title on
 * its family's colours, so a shared guide reads as that guide, not as a
 * generic logo. Drawn by Chromium from a small HTML card with the site's own
 * face, saved as JPEG under app/public/og/, and committed like the pages
 * (scripts/gen-pages.ts points each page's og:image at its picture when it
 * exists). Run after adding a tool or a guide:
 *
 *   npm run og
 *
 * Needs Playwright's Chromium, which the e2e tests use already. Only pictures
 * whose words changed are drawn again.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { GROUPS, SEARCH_NAMES, TOOLS, type GroupId } from '../app/src/ops/tools.ts';
import { SITE_NAME, SITE_ORIGIN } from '../app/src/site/config.ts';
import { GUIDES } from '../app/src/site/guides.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'app', 'public', 'og');
const STAMPS = resolve(OUT, 'stamps.json');

const COLOURS: Record<GroupId, readonly [string, string]> = {
  pages: ['#00f2fe', '#4facfe'],
  convert: ['#ff9a62', '#ff6ec7'],
  mark: ['#b69bff', '#f08bff'],
  protect: ['#c4f05a', '#34d399'],
  read: ['#ffe066', '#ffb84d'],
};

const MARK = readFileSync(resolve(ROOT, 'app', 'public', 'brand', 'mark.svg'), 'utf8');
const FONT = readFileSync(resolve(ROOT, 'app', 'public', 'fonts', 'space-grotesk-latin.woff2')).toString('base64');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const host = SITE_ORIGIN === null ? 'foolscap' : new URL(SITE_ORIGIN).hostname;

interface Card {
  readonly key: string;
  readonly kicker: string;
  readonly title: string;
  readonly line: string;
  readonly group: GroupId;
}

const live = TOOLS.filter((t) => t.status === 'live');
const groupTitle = (id: GroupId) => GROUPS.find((g) => g.id === id)?.title ?? '';
const cards: Card[] = [
  ...live.map((t) => ({ key: `tools-${t.id}`, kicker: groupTitle(t.group), title: SEARCH_NAMES[t.id], line: `${t.summary}.`, group: t.group })),
  ...GUIDES.map((g) => {
    const tool = live.find((t) => t.id === g.tool);
    return { key: `guides-${g.slug}`, kicker: 'Guide', title: g.h1, line: g.description, group: tool?.group ?? 'pages' };
  }),
];

function html(c: Card): string {
  const [a, b] = COLOURS[c.group];
  const size = c.title.length > 70 ? 54 : c.title.length > 48 ? 62 : c.title.length > 28 ? 74 : 92;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Space Grotesk'; src: url(data:font/woff2;base64,${FONT}) format('woff2'); font-weight: 300 700; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body { font-family: 'Space Grotesk', sans-serif; color: #f1f5f9; background: #0a0c10; position: relative; overflow: hidden; }
.glow { position: absolute; inset: -40% -10% auto auto; width: 900px; height: 900px; border-radius: 50%; background: radial-gradient(circle, ${a}44 0%, ${b}22 35%, transparent 70%); }
.glow2 { position: absolute; left: -250px; bottom: -420px; width: 800px; height: 800px; border-radius: 50%; background: radial-gradient(circle, ${b}2a 0%, transparent 65%); }
.wrap { position: relative; height: 100%; padding: 64px 72px 56px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 18px; font-size: 38px; font-weight: 700; letter-spacing: -0.01em; }
.brand svg { width: 64px; height: 64px; }
.kicker { margin-top: 54px; font-size: 26px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; background: linear-gradient(90deg, ${a}, ${b}); -webkit-background-clip: text; color: transparent; }
h1 { margin-top: 14px; font-size: ${size}px; line-height: 1.06; font-weight: 700; letter-spacing: -0.02em; max-width: 1040px; }
p { margin-top: 22px; font-size: 28px; line-height: 1.35; color: #94a3b8; max-width: 1000px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; font-size: 26px; color: #cbd5e1; }
.facts span { margin-right: 28px; }
.facts span::before { content: '✓ '; color: ${b}; font-weight: 700; }
.host { font-weight: 600; color: #f1f5f9; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: linear-gradient(90deg, ${a}, ${b}); }
</style></head><body><div class="glow"></div><div class="glow2"></div><div class="wrap">
<div class="brand">${MARK}<span>${esc(SITE_NAME)}</span></div>
<div class="kicker">${esc(c.kicker)}</div>
<h1>${esc(c.title)}</h1>
<p>${esc(c.line)}</p>
<div class="foot"><div class="facts"><span>Free</span><span>Nothing uploaded</span><span>No sign-up</span></div><div class="host">${esc(host)}</div></div>
</div><div class="bar"></div></body></html>`;
}

mkdirSync(OUT, { recursive: true });
const stamps: Record<string, string> = existsSync(STAMPS) ? JSON.parse(readFileSync(STAMPS, 'utf8')) : {};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
let drawn = 0;
for (const c of cards) {
  const markup = html(c);
  const stamp = createHash('sha1').update(markup).digest('hex').slice(0, 16);
  const file = resolve(OUT, `${c.key}.jpg`);
  if (stamps[c.key] === stamp && existsSync(file)) continue;
  await page.setContent(markup, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 84 }));
  stamps[c.key] = stamp;
  drawn++;
}
await browser.close();
writeFileSync(STAMPS, `${JSON.stringify(Object.fromEntries(Object.entries(stamps).sort(([x], [y]) => x.localeCompare(y))), null, 2)}\n`);
console.log(`og: ${cards.length} pictures, ${drawn} drawn`);
