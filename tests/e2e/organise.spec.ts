import { expect, test } from '@playwright/test';
import { pagesPdf, sourceIndices } from '../fixtures/pdfs';
import { downloadPdf, openTool, run, thumbnailsRendered, upload, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => useDownloads(context));

test('shows every page, then deletes, rotates, reorders and saves the result', async ({ page }) => {
  await openTool(page, 'organise');
  await upload(page, [{ name: 'scan.pdf', bytes: await pagesPdf(4) }]);

  const tiles = page.getByTestId('page-tile');
  await expect(tiles).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect(tiles.nth(i)).toHaveAttribute('data-source', `${i}`);
    await expect(tiles.nth(i)).toHaveAttribute('data-rotation', '0');
    await tiles.nth(i).scrollIntoViewIfNeeded();
  }
  await expect(page.getByTestId('page-thumb')).toHaveCount(4);
  await expect.poll(() => thumbnailsRendered(page), { timeout: 20_000 }).toBe(true);

  // Delete page 2: the tile stays, marked, and the control turns into Restore.
  const second = page.locator('[data-testid="page-tile"][data-source="1"]');
  await second.getByTestId('page-delete').click();
  await expect(second).toHaveAttribute('data-deleted', 'true');
  await expect(second.getByTestId('page-restore')).toBeVisible();
  await expect(second.getByTestId('page-delete')).toHaveCount(0);

  // Rotate page 3 twice.
  const third = page.locator('[data-testid="page-tile"][data-source="2"]');
  await third.getByTestId('page-rotate').click();
  await expect(third).toHaveAttribute('data-rotation', '90');
  await third.getByTestId('page-rotate').click();
  await expect(third).toHaveAttribute('data-rotation', '180');

  // Move page 4 to the front, one step at a time.
  const fourth = page.locator('[data-testid="page-tile"][data-source="3"]');
  for (let position = 3; position > 0; position--) {
    await fourth.getByTestId('page-move-up').click();
    await expect(tiles.nth(position - 1)).toHaveAttribute('data-source', '3');
  }
  await expect(tiles.nth(0)).toHaveAttribute('data-source', '3');

  await run(page);
  const result = page.getByTestId('result-item');
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('data-pages', '3');
  await expect(result).not.toHaveAttribute('data-name', 'scan.pdf');

  const { info } = await downloadPdf(page, result.getByTestId('save-button'));
  expect(sourceIndices(info)).toEqual([3, 0, 2]);
  expect(info.rotations).toEqual([0, 0, 180]);
  expect(info.producer).toBeUndefined();

  // Start over, change nothing, and the detail says so.
  await page.getByTestId('start-over').click();
  await expect(page.getByTestId('page-tile')).toHaveCount(0);
  await upload(page, [{ name: 'scan.pdf', bytes: await pagesPdf(4) }]);
  await expect(page.getByTestId('page-tile')).toHaveCount(4);
  await run(page);
  await expect(page.getByTestId('result-item')).toHaveAttribute('data-pages', '4');
  await expect(page.getByTestId('result-detail')).toHaveText(/^Same 4 pages/);
});
