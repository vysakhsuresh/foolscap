/**
 * The policy is served on every path, blocks what it says it blocks, and is
 * quoted verbatim on the privacy page — so what a visitor reads there is what
 * their browser enforces.
 */
import { expect, test } from '@playwright/test';
import { ALL_PAGES, collectErrors, openPage, openTool } from './helpers';

const HEADER = 'content-security-policy';

test('the same policy is served for pages and for assets', async ({ page }) => {
  await openTool(page, 'merge');
  const script = await page.locator('script[src^="/assets/"]').first().getAttribute('src');
  expect(script, 'the tool page loads a module from /assets/').toBeTruthy();

  const policies = new Map<string, string>();
  for (const path of ['/', '/private/', '/tools/merge/', script ?? '']) {
    const response = await page.request.get(path);
    expect(response.ok(), `${path} responds`).toBe(true);
    policies.set(path, response.headers()[HEADER] ?? '');
  }
  const values = [...policies.values()];
  expect(values[0], 'a Content-Security-Policy header is served').toBeTruthy();
  for (const [path, value] of policies) expect(value, `${path} carries the same policy`).toBe(values[0]);
  expect(values[0]).toContain("connect-src 'self'");
  expect(values[0]).not.toContain('unsafe-inline');
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
