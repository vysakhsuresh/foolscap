/**
 * The proof. Once a tool page says it is ready, the network can go, and every
 * tool still works without a single request. And on every page of the site,
 * every request from navigation onward stayed on this origin.
 */
import { expect, test } from '@playwright/test';
import { pagesPdf, pictureOnlyPdf } from '../fixtures/pdfs';
import { ALL_PAGES, ORIGIN, openPage, openTool, recordRequests, run, thumbnailsRendered, upload } from './helpers';

test('every live tool runs with the network gone, and makes no request', async ({ context }) => {
  test.setTimeout(240_000);
  const merge = await context.newPage();
  const split = await context.newPage();
  const organise = await context.newPage();
  // Two that draw and read pages with pdf.js inside the op worker.
  const images = await context.newPage();
  const text = await context.newPage();
  // And the one that reads words out of pictures, whose engine and model come from this site too.
  const ocr = await context.newPage();
  await openTool(merge, 'merge');
  await openTool(split, 'split');
  await openTool(organise, 'organise');
  await openTool(images, 'pdf-to-images');
  await openTool(text, 'extract-text');
  await openTool(ocr, 'ocr');
  const scan = await ocr.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#fbfbf8';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#111';
    c.font = '64px Arial, Helvetica, sans-serif';
    c.fillText('OFFLINE PROOF', 120, 260);
    return canvas.toDataURL('image/png');
  });

  await context.setOffline(true);
  const requests = [merge, split, organise, images, text, ocr].flatMap((page) => recordRequests(page));

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

  await upload(images, [{ name: 'e.pdf', bytes: await pagesPdf(2) }]);
  await run(images);
  await expect(images.getByTestId('result-item')).toHaveCount(2);

  await upload(text, [{ name: 'f.pdf', bytes: await pagesPdf(2) }]);
  await run(text);
  await expect(text.getByTestId('result-item')).toHaveCount(1);

  await upload(ocr, [{ name: 'g.pdf', bytes: await pictureOnlyPdf(new Uint8Array(Buffer.from(scan.slice(scan.indexOf(',') + 1), 'base64'))) }]);
  await expect(ocr.getByTestId('run-button')).toBeEnabled();
  await ocr.getByTestId('run-button').click();
  await expect(ocr.getByTestId('result-detail')).toContainText('read on 1 page', { timeout: 150_000 });

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
