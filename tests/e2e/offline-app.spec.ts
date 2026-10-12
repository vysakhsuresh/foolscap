/**
 * The offline app: after one visit, the whole site opens and works with the
 * connection gone, because the service worker kept this site's own files.
 */
import { expect, test } from '@playwright/test';
import { pagesPdf } from '../fixtures/pdfs';
import { run, upload, waitReady } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('after one visit, a tool opens and runs with no connection', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  // Wait until the service worker has kept everything and controls the page.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    return registration.active?.state;
  });
  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('foolscap-core-'))), { timeout: 60_000 })
    .toBe(true);

  await context.setOffline(true);
  await page.goto('/tools/merge/');
  await waitReady(page);
  await upload(page, [
    { name: 'a.pdf', bytes: await pagesPdf(2) },
    { name: 'b.pdf', bytes: await pagesPdf(1) },
  ]);
  await expect(page.getByTestId('file-item')).toHaveCount(2);
  await run(page);
  await expect(page.getByTestId('result-item')).toHaveAttribute('data-pages', '3');

  // And a page never visited before, from the kept copy.
  await page.goto('/tools/compress/');
  await waitReady(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Compress');
});
