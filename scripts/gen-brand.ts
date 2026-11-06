/**
 * Every brand file, drawn from the one mark in scripts/brand-mark.ts. The
 * favicons and install icons match the site's header: the ruled lines and the
 * red F with no sheet, on nothing at all in a browser tab and on the site's
 * dark ground on a phone. The share pictures keep the mark on its navy tile
 * (brand/mark.svg, which gen-og.ts reads), as does the home page's own. Committed like the pages; run after
 * changing the mark:
 *
 *   npm run brand
 *
 * Needs Playwright's Chromium, as gen-og.ts does.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { TOOLS } from '../app/src/ops/tools.ts';
import { SITE_NAME, SITE_ORIGIN } from '../app/src/site/config.ts';
import { markSvg, RULE_ON_DARK, siteMarkSvg, TAB_RULE_ON_DARK } from './brand-mark.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'app', 'public');
const BRAND_DIR = resolve(PUBLIC, 'brand');

/** The site's dark ground: a phone fills an icon's empty corners with black, so the icon brings its own. */
const GROUND = '#0a0c10';
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

// The vector files: the tiled mark for share pictures; for browser tabs the lines and the F alone,
// their ink following the browser's own light or dark.
writeFileSync(resolve(BRAND_DIR, 'mark.svg'), `${markSvg({ id: 'm' })}\n`);
writeFileSync(resolve(PUBLIC, 'favicon.svg'), `${siteMarkSvg({ detail: 'tiny', adaptive: true, attrs: XMLNS })}\n`);
rmSync(resolve(BRAND_DIR, 'mark-line.svg'), { force: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(svg: string, size: number): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`);
  return page.screenshot({ type: 'png', omitBackground: true });
}

const tile = siteMarkSvg({ ground: { colour: GROUND, round: true }, attrs: XMLNS });
writeFileSync(resolve(BRAND_DIR, 'icon-512.png'), await png(tile, 512));
writeFileSync(resolve(BRAND_DIR, 'icon-192.png'), await png(tile, 192));
// A platform that rounds the icon itself gets it full bleed; a maskable one keeps the drawing inside the safe circle.
writeFileSync(resolve(BRAND_DIR, 'apple-touch-icon.png'), await png(siteMarkSvg({ ground: { colour: GROUND, round: false }, scale: 0.86, attrs: XMLNS }), 180));
writeFileSync(resolve(BRAND_DIR, 'icon-maskable-512.png'), await png(siteMarkSvg({ ground: { colour: GROUND, round: false }, scale: 0.72, attrs: XMLNS }), 512));
// The PNG favicons cannot follow the browser's light or dark, so their lines take the ink that reads on both.
const favicon = (s: number) => siteMarkSvg({ detail: s >= 48 ? 'small' : 'tiny', attrs: XMLNS }).replaceAll(RULE_ON_DARK, TAB_RULE_ON_DARK);
const favicons = await Promise.all([16, 32, 48].map(async (s) => ({ s, bytes: await png(favicon(s), s) })));
writeFileSync(resolve(BRAND_DIR, 'favicon-48.png'), favicons[2]!.bytes);

// favicon.ico: the three sizes, each stored as PNG, which every current browser reads.
const head = Buffer.alloc(6 + 16 * favicons.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(favicons.length, 4);
let offset = head.length;
favicons.forEach(({ s, bytes }, i) => {
  const at = 6 + 16 * i;
  head.writeUInt8(s, at);
  head.writeUInt8(s, at + 1);
  head.writeUInt16LE(1, at + 4);
  head.writeUInt16LE(32, at + 6);
  head.writeUInt32LE(bytes.length, at + 8);
  head.writeUInt32LE(offset, at + 12);
  offset += bytes.length;
});
writeFileSync(resolve(PUBLIC, 'favicon.ico'), Buffer.concat([head, ...favicons.map((f) => f.bytes)]));

// The home page's share picture.
const font = readFileSync(resolve(PUBLIC, 'fonts', 'space-grotesk-latin.woff2')).toString('base64');
const host = SITE_ORIGIN === null ? 'foolscap' : new URL(SITE_ORIGIN).hostname;
const live = TOOLS.filter((t) => t.status === 'live').length;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Space Grotesk'; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 300 700; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body { font-family: 'Space Grotesk', sans-serif; color: #f1f5f9; background: radial-gradient(circle at 85% -10%, #1a2540 0%, #0a0c10 55%); position: relative; overflow: hidden; }
.wrap { height: 100%; padding: 72px 80px 66px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 26px; font-size: 76px; font-weight: 700; letter-spacing: -0.03em; }
.brand svg { width: 112px; height: 112px; filter: drop-shadow(0 10px 30px rgba(224, 37, 122, .25)); }
h1 { margin-top: 64px; font-size: 76px; line-height: 1.08; font-weight: 700; letter-spacing: -0.025em; max-width: 1040px; }
h1 b { background: linear-gradient(90deg, #22d3ee, #4facfe 50%, #a78bfa); -webkit-background-clip: text; color: transparent; }
.foot { margin-top: auto; display: flex; justify-content: space-between; font-size: 29px; color: #cbd5e1; }
.foot span::before { content: '✓ '; color: #34d399; font-weight: 700; }
.foot span { margin-right: 30px; }
.host { color: #f1f5f9; font-weight: 600; }
</style></head><body><div class="wrap">
<div class="brand">${markSvg({ id: 'og' })}<span>${SITE_NAME}</span></div>
<h1>PDF tools that <b>can’t upload</b> your files.</h1>
<div class="foot"><div><span>Free</span><span>No sign-up</span><span>No watermark</span><span>${live} tools</span></div><div class="host">${host}</div></div>
</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
writeFileSync(resolve(BRAND_DIR, 'og.png'), await page.screenshot({ type: 'png' }));
await browser.close();
console.log('brand: mark, favicons, install icons and the home share picture written');
