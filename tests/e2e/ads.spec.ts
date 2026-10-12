/**
 * The ads load on the real domain only, and only on the pages allowed to
 * carry them: the home page and the guides. The real address is pointed at
 * the preview server so the pages run as they will in production, and
 * Google's script is answered with a stub, so nothing leaves the test.
 */
import { expect, test, type Page } from '@playwright/test';
import { SITE_ORIGIN } from '../../app/src/site/config';
import { GUIDES } from '../../app/src/site/guides';
import { collectErrors } from './helpers';

const host = new URL(SITE_ORIGIN ?? 'https://foolscap.co.in').hostname;
test.use({ baseURL: `http://${host}`, launchOptions: { args: [`--host-resolver-rules=MAP ${host} 127.0.0.1:4173`] } });

async function visit(page: Page, path: string): Promise<string[]> {
  const ads: string[] = [];
  await page.route(/googlesyndication\.com|doubleclick\.net|adtrafficquality\.google|fundingchoicesmessages\.google\.com/, (route) => {
    ads.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__adsLoaded = true;' });
  });
  await page.goto(path);
  await page.waitForLoadState('load');
  return ads;
}

test('the home page and a guide load Google’s ad script, with no policy errors', async ({ page }) => {
  for (const path of ['/', `/guides/${GUIDES[0]?.slug ?? ''}/`]) {
    const errors = collectErrors(page);
    const ads = await visit(page, path);
    await expect.poll(() => page.evaluate(() => (window as Window & { __adsLoaded?: boolean }).__adsLoaded === true), { message: path }).toBe(true);
    expect(ads.some((u) => u.includes('adsbygoogle.js?client=ca-pub-')), path).toBe(true);
    expect(errors.pageErrors, path).toEqual([]);
    // The test serves the real address over http, where Chrome notes that it ignores Cross-Origin-Opener-Policy; production is https.
    expect(errors.consoleErrors.filter((e) => !e.includes('Cross-Origin-Opener-Policy header has been ignored')), path).toEqual([]);
  }
});

test('tool pages, privacy, about and terms never ask Google for anything', async ({ page }) => {
  for (const path of ['/tools/merge/', '/tools/compress/', '/private/', '/about/', '/terms/', '/contact/']) {
    const ads = await visit(page, path);
    await page.waitForTimeout(300);
    expect(ads, path).toEqual([]);
  }
});
