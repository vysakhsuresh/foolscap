/**
 * "Share → Foolscap" on a phone: the share sheet posts the files to /open/,
 * the service worker answers it (the post never reaches the network) and
 * hands the files to the Open a file page. Service workers are allowed here
 * only, as in offline-app.spec.ts.
 */
import { expect, test } from '@playwright/test';
import { pagesPdf } from '../fixtures/pdfs';
import { waitReady } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('files shared to Foolscap open on the Open a file page, and the post goes nowhere', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/open/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  // Anything that reaches the network goes through here: a post must never.
  let posted = false;
  await context.route('**/open/**', (route) => {
    if (route.request().method() === 'POST') posted = true;
    return route.continue();
  });
  const bytes = Array.from(await pagesPdf(2));
  // As the share sheet does: a multipart post of the files to the share target.
  const landed = await page.evaluate(async (raw) => {
    const form = new FormData();
    form.append('files', new File([new Uint8Array(raw)], 'Shared.pdf', { type: 'application/pdf' }));
    const answer = await fetch('/open/', { method: 'POST', body: form });
    return answer.url;
  }, bytes);
  expect(landed).toMatch(/\/open\/\?shared$/);
  // The service worker answered it: the network never saw a post.
  expect(posted).toBe(false);
  await page.goto('/open/?shared');
  await waitReady(page);
  await expect(page.getByTestId('open-file')).toHaveCount(1);
  await expect(page.getByTestId('open-file')).toContainText('Shared.pdf');
  // The address is plain again, so a reload does not ask twice.
  await expect(page).toHaveURL(/\/open\/$/);
  await expect(page.getByTestId('suggestions').locator('button').first()).toBeVisible();
});
