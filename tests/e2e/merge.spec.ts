import { expect, test } from '@playwright/test';
import { corruptBytes, pagesPdf, sourceIndices, stampsIn } from '../fixtures/pdfs';
import { downloadPdf, openTool, run, upload, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => useDownloads(context));

test('merges two files in the order listed and saves a clean five-page PDF', async ({ page }) => {
  await openTool(page, 'merge');
  await upload(page, [
    { name: 'three.pdf', bytes: await pagesPdf(3) },
    { name: 'two.pdf', bytes: await pagesPdf(2) },
  ]);

  const items = page.getByTestId('file-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAttribute('data-pages', '3');
  await expect(items.nth(1)).toHaveAttribute('data-pages', '2');

  await run(page);
  const result = page.getByTestId('result-item');
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('data-pages', '5');
  await expect(page.getByTestId('result-detail')).toContainText('5 pages from 2 files');
  await expect(page.getByTestId('failure-item')).toHaveCount(0);

  const name = await result.getAttribute('data-name');
  expect(name).not.toBe('three.pdf');
  expect(name).not.toBe('two.pdf');

  const { info, bytes } = await downloadPdf(page, result.getByTestId('save-button'));
  expect(info.pageCount).toBe(5);
  expect(sourceIndices(info)).toEqual([0, 1, 2, 0, 1]);
  expect(info.producer).toBeUndefined();
  expect(info.creator).toBeUndefined();
  expect(stampsIn(bytes)).toEqual([]);
});

test('moving the second file up flips the order of the output', async ({ page }) => {
  await openTool(page, 'merge');
  await upload(page, [
    { name: 'three.pdf', bytes: await pagesPdf(3) },
    { name: 'two.pdf', bytes: await pagesPdf(2) },
  ]);
  const items = page.getByTestId('file-item');
  await expect(items.nth(1)).toHaveAttribute('data-pages', '2');

  await items.nth(1).getByTestId('file-move-up').click();
  await expect(items.nth(0)).toHaveAttribute('data-name', 'two.pdf');
  await expect(items.nth(1)).toHaveAttribute('data-name', 'three.pdf');

  await run(page);
  const result = page.getByTestId('result-item');
  await expect(result).toHaveAttribute('data-pages', '5');
  const { info } = await downloadPdf(page, result.getByTestId('save-button'));
  expect(sourceIndices(info)).toEqual([0, 1, 0, 1, 2]);
});

test('one unreadable file is reported and, with only one left, nothing is merged', async ({ page }) => {
  await openTool(page, 'merge');
  await upload(page, [
    { name: 'broken.pdf', bytes: corruptBytes() },
    { name: 'good.pdf', bytes: await pagesPdf(2) },
  ]);
  await expect(page.getByTestId('file-item')).toHaveCount(2);

  await run(page);
  const failure = page.getByTestId('failure-item');
  await expect(failure).toHaveCount(1);
  await expect(failure).not.toBeEmpty();
  await expect(failure).toHaveAttribute('data-code', 'corrupt');
  await expect(page.getByTestId('result-item')).toHaveCount(0);
});
