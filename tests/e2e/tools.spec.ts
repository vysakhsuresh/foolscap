/**
 * Every batch-2 tool, end to end in the browser, under the production CSP:
 * pick files through the real input, set the tool's own settings, run, and
 * check what comes out. One test per tool, so a failure names the tool.
 */
import { expect, test, type Page } from '@playwright/test';
import { TINY_JPEG, encryptedPdf, heavyPdf, imagesPdf, noisePng, pagesPdf, pdfInfo } from '../fixtures/pdfs';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

async function pick(page: Page, files: Array<{ name: string; bytes: Uint8Array; mime?: string }>): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(
    files.map((f) => ({ name: f.name, mimeType: f.mime ?? 'application/pdf', buffer: Buffer.from(f.bytes) })),
  );
  await expect(page.getByTestId('file-item')).toHaveCount(files.length);
}

async function results(page: Page) {
  await run(page);
  return page.getByTestId('result-item');
}

test('extract pages keeps the pages typed', async ({ page }) => {
  await openTool(page, 'extract-pages');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(5) }]);
  await page.getByTestId('opt-pages').fill('2-3');
  const items = await results(page);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
  await expect(page.getByTestId('result-detail')).toContainText('2 pages kept of 5');
});

test('extract pages can remove instead, and refuses an empty page list in words', async ({ page }) => {
  await openTool(page, 'extract-pages');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(5) }]);
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await page.getByTestId('opt-pages').fill('1');
  await page.getByTestId('opt-mode-remove').check();
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '4');
});

test('insert pages puts the second file into the first', async ({ page }) => {
  await openTool(page, 'insert-pages');
  await pick(page, [
    { name: 'Report.pdf', bytes: await pagesPdf(3) },
    { name: 'Annex.pdf', bytes: await pagesPdf(2) },
  ]);
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '5');
});

test('crop trims every page and keeps them all', async ({ page }) => {
  await openTool(page, 'crop');
  await pick(page, [{ name: 'Scan.pdf', bytes: await pagesPdf(3) }]);
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '3');
  await expect(page.getByTestId('result-detail')).toContainText('10 mm trimmed');
});

test('split by size makes parts under the limit', async ({ page }) => {
  await openTool(page, 'split-by-size');
  await pick(page, [{ name: 'Photos.pdf', bytes: await heavyPdf(8) }]);
  await page.getByTestId('opt-megabytes').fill('1');
  const items = await results(page);
  expect(await items.count()).toBeGreaterThan(1);
  for (const size of await items.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-size'))))) {
    expect(size).toBeLessThanOrEqual(1_000_000);
  }
});

test('images to PDF makes one page per image', async ({ page }) => {
  await openTool(page, 'images-to-pdf');
  await pick(page, [
    { name: 'Receipt.jpg', bytes: TINY_JPEG, mime: 'image/jpeg' },
    { name: 'Chart.png', bytes: noisePng(40), mime: 'image/png' },
  ]);
  const items = await results(page);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  expect((await pdfInfo(bytes)).sizes[0]).toEqual([595.28, 841.89]);
});

test('images to PDF turns a PDF away in words', async ({ page }) => {
  await openTool(page, 'images-to-pdf');
  await page.getByTestId('file-input').setInputFiles([{ name: 'Not a photo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pagesPdf(1)) }]);
  await expect(page.locator('.notice')).toContainText("isn't a photo");
});

test('pages per sheet puts two pages on each sheet', async ({ page }) => {
  await openTool(page, 'n-up');
  await pick(page, [{ name: 'Notes.pdf', bytes: await pagesPdf(4) }]);
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
});

test('extract images saves each image as its own file', async ({ page }) => {
  await openTool(page, 'extract-images');
  await pick(page, [{ name: 'Brochure.pdf', bytes: await imagesPdf() }]);
  const items = await results(page);
  await expect(items).toHaveCount(2);
  const names = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-name')).sort());
  expect(names).toEqual(['Brochure image 1 (page 1).jpg', 'Brochure image 2 (page 1).png']);
  await expect(page.getByTestId('then-menu')).toHaveCount(1);
});

test('watermark stamps every page', async ({ page }) => {
  await openTool(page, 'watermark');
  await pick(page, [{ name: 'Draft.pdf', bytes: await pagesPdf(2) }]);
  await results(page);
  await expect(page.getByTestId('result-detail')).toContainText('"DRAFT" across 2 pages');
});

test('watermark says plainly when the text has letters it cannot draw yet', async ({ page }) => {
  await openTool(page, 'watermark');
  await pick(page, [{ name: 'Draft.pdf', bytes: await pagesPdf(1) }]);
  await page.getByTestId('opt-text').fill('കരട്');
  await run(page);
  await expect(page.getByTestId('failure-item')).toHaveAttribute('data-code', 'unsupported-text');
});

test('page numbers numbers the pages', async ({ page }) => {
  await openTool(page, 'page-numbers');
  await pick(page, [{ name: 'Deck.pdf', bytes: await pagesPdf(3) }]);
  await page.getByTestId('opt-format').selectOption('n-of-total');
  await results(page);
  await expect(page.getByTestId('result-detail')).toContainText('Numbered 1 to 3');
});

test('header and footer needs some text, then stamps it', async ({ page }) => {
  await openTool(page, 'header-footer');
  await pick(page, [{ name: 'Minutes.pdf', bytes: await pagesPdf(2) }]);
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await page.getByTestId('opt-footer').fill('Page {page} of {total}');
  await results(page);
  await expect(page.getByTestId('result-detail')).toContainText('Footer on 2 pages');
});

test('add a password locks the file, after the password is typed twice', async ({ page }) => {
  await openTool(page, 'add-password');
  await pick(page, [{ name: 'Salary slip.pdf', bytes: await pagesPdf(1) }]);
  await page.getByTestId('opt-password').fill('tiger42');
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await page.getByTestId('opt-confirm').fill('tiger42');
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-name', 'Salary slip locked.pdf');
});

test('remove a password asks for it, then unlocks the file', async ({ page }) => {
  await openTool(page, 'remove-password');
  await page.getByTestId('file-input').setInputFiles([{ name: 'Statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await encryptedPdf('open-sesame', 2)) }]);
  await page.getByTestId('file-password').fill('open-sesame');
  await page.getByTestId('file-unlock').click();
  await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '2');
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  expect((await pdfInfo(bytes)).encrypted).toBe(false);
});

test('document details removes the hidden details', async ({ page }) => {
  await openTool(page, 'document-details');
  await pick(page, [{ name: 'CV.pdf', bytes: await pagesPdf(1, { title: 'Secret plan', producer: 'Corporate Writer 9' }) }]);
  await results(page);
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  const info = await pdfInfo(bytes);
  expect(info.title).toBeUndefined();
  expect(info.producer).toBeUndefined();
});

test('the home finder narrows the tools as you type', async ({ page }) => {
  await page.goto('/');
  const search = page.getByTestId('tool-search');
  await search.fill('lock');
  await expect(page.getByTestId('tool-card-add-password')).toBeVisible();
  await expect(page.getByTestId('tool-card-merge')).toBeHidden();
  await search.fill('zzzz nothing');
  await expect(page.locator('[data-finder-empty]')).toBeVisible();
  await search.fill('');
  await expect(page.getByTestId('tool-card-merge')).toBeVisible();
});
