/**
 * The strict policy is served on every tool page and every asset, blocks what
 * it says it blocks, and is quoted verbatim on the privacy page — so what a
 * visitor reads there is what their browser enforces. The home page and the
 * guides, which carry ads and take no files, get the ad policy and only that.
 */
import { expect, test } from '@playwright/test';
import { AD_PAGE_CSP, TOOL_PAGE_CSP } from '../../app/src/site/config';
import { GUIDES } from '../../app/src/site/guides';
import { ALL_PAGES, collectErrors, openPage, openTool } from './helpers';

const HEADER = 'content-security-policy';

test('tool pages and their assets get the strict policy; only the home page and guides get the ad policy', async ({ page }) => {
  await openTool(page, 'merge');
  const script = await page.locator('script[src^="/assets/"]').first().getAttribute('src');
  expect(script, 'the tool page loads a module from /assets/').toBeTruthy();

  for (const path of ['/private/', '/tools/merge/', '/tools/sign/', '/about/', script ?? '', '/sw.js', '/fonts/space-grotesk-latin.woff2']) {
    const response = await page.request.get(path);
    expect(response.ok(), `${path} responds`).toBe(true);
    expect(response.headers()[HEADER], `${path} carries the strict policy`).toBe(TOOL_PAGE_CSP);
  }
  for (const path of ['/', '/guides/', `/guides/${GUIDES[0]?.slug ?? ''}/`]) {
    const response = await page.request.get(path);
    expect(response.ok(), `${path} responds`).toBe(true);
    expect(response.headers()[HEADER], `${path} carries the ad policy, once`).toBe(AD_PAGE_CSP);
  }
  expect(TOOL_PAGE_CSP).toContain("connect-src 'self'");
  expect(TOOL_PAGE_CSP).not.toContain('unsafe-inline');
});

test('a tool page cannot reach another origin', async ({ page }) => {
  await openTool(page, 'merge');
  const outcome = await page.evaluate(() =>
    fetch('https://example.com/').then(
      () => 'resolved',
      () => 'rejected',
    ),
  );
  expect(outcome).toBe('rejected');
});

test('the privacy page quotes the policy exactly as served', async ({ page }) => {
  const response = await page.request.get('/private/');
  const served = response.headers()[HEADER];
  await openPage(page, '/private/');
  const quoted = await page.getByTestId('privacy-csp').innerText();
  expect(quoted.trim()).toBe(served?.trim());
  await expect(page.getByTestId('privacy-offline')).toBeVisible();
});

for (const path of ALL_PAGES) {
  test(`${path} loads with no page error and no console error`, async ({ page }) => {
    const errors = collectErrors(page);
    await openPage(page, path);
    await page.waitForLoadState('networkidle');
    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
  });
}
