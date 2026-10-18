/**
 * What search engines and link previews read, on every page the sitemap
 * lists. (The ads are checked in ads.spec.ts.)
 */
import { expect, test } from '@playwright/test';
import { SITE_ORIGIN } from '../../app/src/site/config';
import { GUIDES } from '../../app/src/site/guides';

const attr = (html: string, re: RegExp) => re.exec(html)?.[1] ?? null;

test('every page in the sitemap is there, canonical, titled, described and previewable', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  expect(urls.length).toBeGreaterThan(50);
  expect(urls).toContain(`${SITE_ORIGIN}/`);
  for (const g of GUIDES) expect(urls).toContain(`${SITE_ORIGIN}/guides/${g.slug}/`);
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const url of urls) {
    const path = url.slice((SITE_ORIGIN ?? '').length);
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(attr(html, /<link rel="canonical" href="([^"]+)">/), `${path} canonical`).toBe(url);
    expect(attr(html, /<meta property="og:url" content="([^"]+)">/), `${path} og:url`).toBe(url);
    // A tool or a guide shows its own share picture; every other page the site's.
    const own = /^\/(tools|guides)\/([a-z0-9-]+)\/$/.exec(path);
    expect(attr(html, /<meta property="og:image" content="([^"]+)">/), `${path} og:image`).toBe(own ? `${SITE_ORIGIN}/og/${own[1]}-${own[2]}.jpg` : `${SITE_ORIGIN}/brand/og.png`);
    const title = attr(html, /<title>([^<]+)<\/title>/) ?? '';
    const description = attr(html, /<meta name="description" content="([^"]+)">/) ?? '';
    expect(title.length, `${path} title "${title}"`).toBeGreaterThan(10);
    expect(title.length, `${path} title "${title}"`).toBeLessThanOrEqual(60);
    const shown = description.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    expect(shown.length, `${path} description`).toBeGreaterThanOrEqual(110);
    expect(shown.length, `${path} description`).toBeLessThanOrEqual(160);
    expect(titles.has(title), `${path} title is unique`).toBe(false);
    expect(descriptions.has(description), `${path} description is unique`).toBe(false);
    titles.add(title);
    descriptions.add(description);
    expect(html.match(/<h1\b/g)?.length ?? 0, `${path} has one h1`).toBe(1);
    expect(html).not.toContain('name="robots" content="noindex"');
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(m[1] ?? '') as Record<string, unknown>;
      expect(data['@context'], path).toBe('https://schema.org');
    }
  }
});

test('the preview image, robots.txt and the not-found page', async ({ request }) => {
  const og = await request.get('/brand/og.png');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toContain('image/png');
  expect((await og.body()).length).toBeLessThan(300_000);
  expect(await (await request.get('/robots.txt')).text()).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  const missing = await (await request.get('/404.html')).text();
  expect(missing).toContain('name="robots" content="noindex"');
  expect(missing).not.toContain('rel="canonical"');
});

test('a guide sends people straight to its tool', async ({ page }) => {
  const guide = GUIDES[0];
  if (!guide) throw new Error('no guides');
  await page.goto(`/guides/${guide.slug}/`);
  await page.getByTestId('guide-cta').click();
  await expect(page).toHaveURL(new RegExp(`/tools/${guide.tool}/$`));
});

test('Tell a friend is a plain WhatsApp link with the site address in it', async ({ page }) => {
  await page.goto('/');
  const href = (await page.getByTestId('share-whatsapp').getAttribute('href')) ?? '';
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  expect(decodeURIComponent(href)).toContain(`${SITE_ORIGIN}/`);
});
