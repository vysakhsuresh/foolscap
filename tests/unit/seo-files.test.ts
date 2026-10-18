/**
 * The files search engines, link previews and AI answer engines read, kept
 * in step with the tools and guides: a new tool or guide without its share
 * picture, its sitemap date or its line in llms.txt fails here.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIVE_TOOLS } from '../../app/src/ops/tools';
import { SITE_ORIGIN } from '../../app/src/site/config';
import { GUIDES } from '../../app/src/site/guides';

const app = (path: string) => new URL(`../../app/${path}`, import.meta.url);
const read = (path: string) => readFileSync(app(path), 'utf8');

describe('what search engines and link previews read', () => {
  it('every tool and every guide has its own share picture (npm run og)', () => {
    for (const t of LIVE_TOOLS) expect(existsSync(app(`public/og/tools-${t.id}.jpg`)), t.id).toBe(true);
    for (const g of GUIDES) expect(existsSync(app(`public/og/guides-${g.slug}.jpg`)), g.slug).toBe(true);
    for (const t of LIVE_TOOLS) expect(read(`tools/${t.id}/index.html`)).toContain(`/og/tools-${t.id}.jpg`);
  });

  it('the sitemap lists every tool, every guide and the hub, each with the day it last changed', () => {
    const xml = read('public/sitemap.xml');
    const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod><\/url>/g)];
    expect(entries.length).toBe((xml.match(/<url>/g) ?? []).length);
    const urls = entries.map((m) => m[1]);
    for (const t of LIVE_TOOLS) expect(urls).toContain(`${SITE_ORIGIN}/tools/${t.id}/`);
    for (const g of GUIDES) expect(urls).toContain(`${SITE_ORIGIN}/guides/${g.slug}/`);
    expect(urls).toContain(`${SITE_ORIGIN}/tools/`);
    for (const m of entries) expect(new Date(m[2]!).getTime()).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });

  it('llms.txt names every tool and guide, with its address', () => {
    const text = read('public/llms.txt');
    for (const t of LIVE_TOOLS) expect(text).toContain(`${SITE_ORIGIN}/tools/${t.id}/`);
    for (const g of GUIDES) expect(text).toContain(`${SITE_ORIGIN}/guides/${g.slug}/`);
  });

  it('the IndexNow key file is the key, and the only one', () => {
    const keys = readdirSync(app('public')).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
    expect(keys).toHaveLength(1);
    expect(read(`public/${keys[0]}`)).toBe(keys[0]!.replace('.txt', ''));
  });

  it('a guide says who wrote it and when it last changed, in words and for search engines', () => {
    const html = read(`guides/${GUIDES[0]!.slug}/index.html`);
    expect(html).toMatch(/class="guide__meta">By <a href="\/about\/">Layerbit<\/a>[^<]*Updated <time datetime="\d{4}-\d{2}-\d{2}">/);
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"dateModified"');
  });
});
