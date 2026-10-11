/**
 * The proof. Once a tool page says it is ready, the network can go, and every
 * tool still works without a single request. And on every page of the site,
 * every request from navigation onward stayed on this origin.
 */
import { expect, test } from '@playwright/test';
import { pagesPdf } from '../fixtures/pdfs';
import { ALL_PAGES, ORIGIN, openPage, openTool, recordRequests, run, thumbnailsRendered, upload } from './helpers';

test('every live tool runs with the network gone, and makes no request', async ({ context }) => {
  const merge = await context.newPage();
  const split = await context.newPage();
  const organise = await context.newPage();
  await openTool(merge, 'merge');
  await openTool(split, 'split');
  await openTool(organise, 'organise');

  await context.setOffline(true);
  const requests = [merge, split, organise].flatMap((page) => recordRequests(page));

  await upload(merge, [
    { name: 'a.pdf', bytes: await pagesPdf(2) },
    { name: 'b.pdf', bytes: await pagesPdf(1) },
  ]);
  await expect(merge.getByTestId('file-item')).toHaveCount(2);
  await run(merge);
  await expect(merge.getByTestId('result-item')).toHaveAttribute('data-pages', '3');

  await upload(split, [{ name: 'c.pdf', bytes: await pagesPdf(3) }]);
  await split.getByTestId('split-mode-single').check();
  await run(split);
  await expect(split.getByTestId('result-item')).toHaveCount(3);

  await upload(organise, [{ name: 'd.pdf', bytes: await pagesPdf(3) }]);
  await expect(organise.getByTestId('page-tile')).toHaveCount(3);
  await expect.poll(() => thumbnailsRendered(organise), { timeout: 20_000 }).toBe(true);
  await organise.locator('[data-testid="page-tile"][data-source="0"]').getByTestId('page-rotate').click();
  await run(organise);
  await expect(organise.getByTestId('result-item')).toHaveAttribute('data-pages', '3');

  expect(requests, 'no request of any kind may follow data-ready').toEqual([]);
});

for (const path of ALL_PAGES) {
  test(`every request from ${path} goes to this origin`, async ({ page }) => {
    const requests = recordRequests(page);
    await openPage(page, path);
    await page.waitForLoadState('networkidle');
    expect(requests.length).toBeGreaterThan(0);
    const elsewhere = requests.filter((url) => !url.startsWith(`${ORIGIN}/`));
    expect(elsewhere, 'a request left the origin').toEqual([]);
  });
}
