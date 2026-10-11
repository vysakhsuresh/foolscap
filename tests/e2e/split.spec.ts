import { unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { pagesPdf, pdfInfo, sourceIndices } from '../fixtures/pdfs';
import { downloadFrom, downloadPdf, openTool, run, upload, useDownloads } from './helpers';

test.beforeEach(async ({ context, page }) => {
  await useDownloads(context);
  await openTool(page, 'split');
  await upload(page, [{ name: 'statement.pdf', bytes: await pagesPdf(5) }]);
  await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '5');
});

test('every 2 pages gives three parts of 2, 2 and 1, and "save all" zips them under their names', async ({ page }) => {
  await page.getByTestId('split-mode-every').check();
  await page.getByTestId('split-every').fill('2');
  await run(page);

  const results = page.getByTestId('result-item');
  await expect(results).toHaveCount(3);
  await expect(results.nth(0)).toHaveAttribute('data-pages', '2');
  await expect(results.nth(1)).toHaveAttribute('data-pages', '2');
  await expect(results.nth(2)).toHaveAttribute('data-pages', '1');
  await expect(page.getByTestId('failure-item')).toHaveCount(0);

  const names = await results.evaluateAll((items) => items.map((item) => item.getAttribute('data-name') ?? ''));
  expect(new Set(names).size).toBe(3);
  expect(names).not.toContain('statement.pdf');

  const { name, bytes } = await downloadFrom(page, page.getByTestId('save-all-button'));
  expect(name).toMatch(/\.zip$/);
  const entries = unzipSync(bytes);
  expect(Object.keys(entries).sort()).toEqual([...names].sort());
  const last = entries[names[2] ?? ''];
  expect(last).toBeDefined();
  expect(sourceIndices(await pdfInfo(last!))).toEqual([4]);
});

test('single pages gives five parts', async ({ page }) => {
  await page.getByTestId('split-mode-single').check();
  await run(page);
  const results = page.getByTestId('result-item');
  await expect(results).toHaveCount(5);
  for (let i = 0; i < 5; i++) await expect(results.nth(i)).toHaveAttribute('data-pages', '1');
  const { info } = await downloadPdf(page, results.nth(2).getByTestId('save-button'));
  expect(sourceIndices(info)).toEqual([2]);
});

test('ranges "1-2, 5" gives two parts of 2 and 1 pages', async ({ page }) => {
  await page.getByTestId('split-mode-ranges').check();
  await page.getByTestId('split-ranges').fill('1-2, 5');
  await run(page);
  const results = page.getByTestId('result-item');
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toHaveAttribute('data-pages', '2');
  await expect(results.nth(1)).toHaveAttribute('data-pages', '1');
  const { info } = await downloadPdf(page, results.nth(1).getByTestId('save-button'));
  expect(sourceIndices(info)).toEqual([4]);
  expect(info.producer).toBeUndefined();
});
