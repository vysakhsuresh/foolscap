/**
 * The file list and the Done box, with real pointers: a small picture of each
 * file, dragging a file to change the order (a mouse at once, a finger after a
 * hold, a swipe still scrolls, Escape puts it back), a preview of what came
 * out, and Send, which hands the share sheet the files and fetches nothing.
 */
import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { noisePng, pagesPdf, paperPhotoPng, sourceIndices } from '../fixtures/pdfs';
import { ORIGIN, downloadPdf, openTool, recordRequests, run, upload, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => useDownloads(context));

const phoneOnly = (info: TestInfo) => test.skip(info.project.name !== 'phone', 'a finger is the phone’s');

/** Whether every element with this testid is a canvas with more than one colour drawn in it. */
async function drawn(page: Page, testid: string): Promise<boolean> {
  return page.evaluate((id) => {
    const canvases = [...document.querySelectorAll(`[data-testid="${id}"]`)];
    if (canvases.length === 0) return false;
    return canvases.every((c) => {
      if (!(c instanceof HTMLCanvasElement) || c.width === 0 || c.height === 0) return false;
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
        if (seen.size > 1) return true;
      }
      return false;
    });
  }, testid);
}

const names = (page: Page) => page.getByTestId('file-item').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-name')));

async function twoFiles(page: Page): Promise<void> {
  await openTool(page, 'merge');
  await upload(page, [
    { name: 'three.pdf', bytes: await pagesPdf(3) },
    { name: 'two.pdf', bytes: await pagesPdf(2) },
  ]);
  await expect(page.getByTestId('file-item').nth(1)).toHaveAttribute('data-pages', '2');
  await expect(page.getByTestId('file-thumb')).toHaveCount(2);
  // Both rows in view and still, so what is measured is where the pointer lands.
  await page.getByTestId('file-list').evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

/** A point on a row's name, at the row's middle height: on the row, clear of its buttons. Scroll first, then measure. */
async function grip(page: Page, index: number): Promise<{ x: number; y: number; height: number }> {
  const row = page.getByTestId('file-item').nth(index);
  const name = (await row.locator('.file-item__name').boundingBox())!;
  const box = (await row.boundingBox())!;
  return { x: name.x + Math.min(30, name.width / 2), y: box.y + box.height / 2, height: box.height };
}

async function mergedOrder(page: Page): Promise<number[]> {
  await run(page);
  const result = page.getByTestId('result-item');
  await expect(result).toHaveAttribute('data-pages', '5');
  const { info } = await downloadPdf(page, result.getByTestId('save-button'));
  return sourceIndices(info);
}

test.describe('the file list', () => {
  test('shows a small picture of each PDF’s first page, and of each image', async ({ page }) => {
    await twoFiles(page);
    await expect.poll(() => drawn(page, 'file-thumb')).toBe(true);
    await expect(page.getByTestId('file-drag-handle')).toHaveCount(2);
    await expect(page.getByTestId('file-list-hint')).toBeVisible();

    await openTool(page, 'images-to-pdf');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'Receipt.png', mimeType: 'image/png', buffer: Buffer.from(paperPhotoPng(120, 160)) },
      { name: 'Chart.png', mimeType: 'image/png', buffer: Buffer.from(noisePng(40)) },
    ]);
    await expect(page.getByTestId('file-thumb')).toHaveCount(2);
    await expect.poll(() => drawn(page, 'file-thumb')).toBe(true);
  });

  test('one file has no handle and no hint: there is nothing to reorder', async ({ page }) => {
    await openTool(page, 'merge');
    await upload(page, [{ name: 'only.pdf', bytes: await pagesPdf(2) }]);
    await expect(page.getByTestId('file-thumb')).toHaveCount(1);
    await expect(page.getByTestId('file-drag-handle')).toHaveCount(0);
    await expect(page.getByTestId('file-list-hint')).toBeHidden();
  });

  test('a mouse drags the first file below the second, and the merge follows the new order', async ({ page }) => {
    await twoFiles(page);
    const a = await grip(page, 0);
    const b = await grip(page, 1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(a.x, a.y + ((b.y + b.height * 0.3 - a.y) * k) / 10);
    await expect(page.getByTestId('file-item').nth(1)).toHaveClass(/file-item--dragging/);
    await page.mouse.up();
    await expect.poll(() => names(page)).toEqual(['two.pdf', 'three.pdf']);
    await expect(page.getByTestId('file-list-status')).toHaveText('three.pdf moved to position 2 of 2.');
    await expect(page.locator('.file-item--dragging')).toHaveCount(0);
    // The pictures travel with their rows.
    await expect(page.getByTestId('file-thumb')).toHaveCount(2);
    expect(await mergedOrder(page)).toEqual([0, 1, 0, 1, 2]);
  });

  test('Escape puts a dragged file back where it was', async ({ page }) => {
    await twoFiles(page);
    const a = await grip(page, 0);
    const b = await grip(page, 1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(a.x, a.y + ((b.y + b.height * 0.3 - a.y) * k) / 10);
    await expect.poll(() => names(page)).toEqual(['two.pdf', 'three.pdf']);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect.poll(() => names(page)).toEqual(['three.pdf', 'two.pdf']);
    await expect(page.getByTestId('file-list-status')).toContainText('Move cancelled');
    expect(await mergedOrder(page)).toEqual([0, 1, 2, 0, 1]);
  });

  test('the arrows still move a file, and keep the keyboard on the file moved', async ({ page }) => {
    await twoFiles(page);
    await page.getByTestId('file-item').nth(0).getByTestId('file-move-down').click();
    await expect.poll(() => names(page)).toEqual(['two.pdf', 'three.pdf']);
    await expect(page.getByTestId('file-list-status')).toHaveText('three.pdf moved to position 2 of 2.');
    // At the bottom its down arrow is off, so the up arrow has the focus.
    await expect(page.getByTestId('file-item').nth(1).getByTestId('file-move-up')).toBeFocused();
  });

  test('a finger holds a file a moment, then drags it', async ({ page }, info) => {
    phoneOnly(info);
    await twoFiles(page);
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const a = await grip(page, 0);
    const b = await grip(page, 1);
    await touch('touchStart', a.x, a.y);
    await page.waitForTimeout(600);
    await expect(page.getByTestId('file-item').nth(0)).toHaveClass(/file-item--dragging/);
    for (let k = 1; k <= 10; k++) await touch('touchMove', a.x, a.y + ((b.y + b.height * 0.3 - a.y) * k) / 10);
    await touch('touchEnd', 0, 0);
    await expect.poll(() => names(page)).toEqual(['two.pdf', 'three.pdf']);
    await expect(page.getByTestId('file-list-status')).toHaveText('three.pdf moved to position 2 of 2.');
    expect(await mergedOrder(page)).toEqual([0, 1, 0, 1, 2]);
  });

  test('a quick swipe over the files scrolls; it never moves one', async ({ page }, info) => {
    phoneOnly(info);
    await twoFiles(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const a = await grip(page, 0);
    await touch('touchStart', a.x, a.y);
    for (let k = 1; k <= 8; k++) await touch('touchMove', a.x, a.y + k * 20);
    await touch('touchEnd', 0, 0);
    // Longer than a hold, so a drag that had wrongly started would show.
    await page.waitForTimeout(500);
    await expect(page.locator('.file-item--dragging')).toHaveCount(0);
    expect(await names(page)).toEqual(['three.pdf', 'two.pdf']);
  });
});

test.describe('the Done box', () => {
  test('previews a merged PDF’s first page', async ({ page }) => {
    await twoFiles(page);
    await run(page);
    await expect(page.getByTestId('result-preview')).toHaveCount(1);
    await expect.poll(() => drawn(page, 'result-preview')).toBe(true);
  });

  test('previews images as themselves, the first six of a batch only, the rest by type', async ({ page }) => {
    await openTool(page, 'pdf-to-images');
    await upload(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(8) }]);
    await page.getByTestId('opt-dpi-72').check();
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(8);
    await expect(page.getByTestId('result-preview')).toHaveCount(6);
    await expect.poll(() => drawn(page, 'result-preview')).toBe(true);
    await expect(page.getByTestId('result-type')).toHaveCount(2);
    await expect(page.getByTestId('result-type').first()).toHaveText('PNG');
  });

  test('shows a text result as a tidy type tile', async ({ page }) => {
    await openTool(page, 'extract-text');
    await upload(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(2) }]);
    await run(page);
    await expect(page.getByTestId('result-type')).toHaveText('TXT');
    await expect(page.getByTestId('result-preview')).toHaveCount(0);
  });
});

test.describe('Send', () => {
  test('is hidden where the browser cannot share files', async ({ page }) => {
    await page.addInitScript(() => {
      // Delete from the prototype, where the browser keeps them, so the page sees neither.
      delete (Navigator.prototype as { canShare?: unknown }).canShare;
      delete (Navigator.prototype as { share?: unknown }).share;
    });
    await twoFiles(page);
    await run(page);
    await expect(page.getByTestId('save-button')).toBeVisible();
    await expect(page.getByTestId('share-button')).toBeHidden();
    await expect(page.getByTestId('share-all')).toHaveCount(0);
  });

  test('hands the share sheet the files themselves, one or all, and fetches nothing', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shared: Array<Array<{ name: string; type: string; size: number; isFile: boolean }>> };
      w.shared = [];
      Object.defineProperty(Navigator.prototype, 'canShare', {
        configurable: true,
        value: (data: { files?: unknown[] }) => Array.isArray(data.files) && data.files.every((f) => f instanceof File),
      });
      Object.defineProperty(Navigator.prototype, 'share', {
        configurable: true,
        value: async (data: { files?: File[] }) => {
          w.shared.push((data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size, isFile: f instanceof File })));
        },
      });
    });
    await openTool(page, 'pdf-to-images');
    await upload(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(2) }]);
    await page.getByTestId('opt-dpi-72').check();
    await run(page);
    const requests = recordRequests(page);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(2);
    await expect(items.first().getByTestId('share-button')).toBeVisible();
    await expect(items.first().getByTestId('share-button')).toHaveText('Send');
    await items.first().getByTestId('share-button').click();
    await expect(items.first().locator('.result-item__status')).toHaveText('Sent.');
    await expect(page.getByTestId('share-all')).toHaveText('Send all 2');
    await page.getByTestId('share-all').click();
    const shared = await page.evaluate(() => (window as unknown as { shared: unknown }).shared);
    const size0 = Number(await items.nth(0).getAttribute('data-size'));
    const size1 = Number(await items.nth(1).getAttribute('data-size'));
    expect(shared).toEqual([
      [{ name: 'Lease page 1.png', type: 'image/png', size: size0, isFile: true }],
      [
        { name: 'Lease page 1.png', type: 'image/png', size: size0, isFile: true },
        { name: 'Lease page 2.png', type: 'image/png', size: size1, isFile: true },
      ],
    ]);
    expect(requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
  });
});
