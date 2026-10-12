/**
 * The files people really pick, on real tool pages: an empty file, something
 * that is not a PDF, a damaged PDF, and a locked one (wrong password, then
 * the right one). Each page says what happened in words, keeps working, and
 * only lets the run start once there is something it can run on.
 */
import { expect, test, type Page } from '@playwright/test';
import type { ToolId } from '../../app/src/ops/tools';
import { bloatedPdf, corruptBytes, encryptedPdf, noisePng, pagesPdf } from '../fixtures/pdfs';
import { collectErrors, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

interface Pick {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mime?: string;
}

async function drop(page: Page, files: readonly Pick[]): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(
    files.map((f) => ({ name: f.name, mimeType: f.mime ?? 'application/pdf', buffer: Buffer.from(f.bytes) })),
  );
}

const notice = (page: Page) => page.locator('.notice');
const runButton = (page: Page) => page.getByTestId('run-button');
const runNote = (page: Page) => page.locator('.run__note');

const empty: Pick = { name: 'Empty.pdf', bytes: new Uint8Array(0) };
const letter: Pick = { name: 'Letter.pdf', bytes: new TextEncoder().encode('Dear Sir, please find the lease attached.'), mime: 'text/plain' };

const PDF_TOOLS: readonly ToolId[] = ['merge', 'compress', 'sign', 'pdf-to-excel', 'remove-password'];

for (const id of PDF_TOOLS) {
  test(`${id}: an empty file and a file that is not a PDF are turned away in words`, async ({ page }) => {
    const errors = collectErrors(page);
    await openTool(page, id);
    await drop(page, [empty]);
    await expect(notice(page)).toContainText('Empty.pdf: This file is empty.');
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await expect(runButton(page)).toBeDisabled();

    await drop(page, [letter]);
    await expect(notice(page)).toContainText("Letter.pdf: This isn't a PDF.");
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await expect(runButton(page)).toBeDisabled();
    expect(errors.pageErrors).toEqual([]);
  });

  test(`${id}: a locked PDF asks for its password, says when it is wrong, and opens with the right one`, async ({ page }) => {
    const errors = collectErrors(page);
    await openTool(page, id);
    const files: Pick[] = [{ name: 'Locked.pdf', bytes: await encryptedPdf('tea') }];
    if (id === 'merge') files.push({ name: 'Second.pdf', bytes: await pagesPdf(2) });
    await drop(page, files);
    const item = page.getByTestId('file-item').first();
    await expect(item).toContainText('This file is locked with a password.');
    await expect(runButton(page)).toBeDisabled();
    await expect(runNote(page)).toContainText('Type the password for the locked file, then tap Unlock.');

    await item.getByTestId('file-password').fill('coffee');
    await item.getByTestId('file-unlock').click();
    await expect(item).toContainText("That password didn't open it.");
    await expect(runButton(page)).toBeDisabled();

    await item.getByTestId('file-password').fill('tea');
    await item.getByTestId('file-unlock').click();
    await expect(item).toHaveAttribute('data-pages', '2');
    await expect(item).not.toContainText('locked');
    if (id === 'sign') {
      // Nothing is drawn yet, so the page says what to do rather than running.
      await expect(runButton(page)).toBeDisabled();
      await expect(runNote(page)).not.toBeEmpty();
    } else {
      await run(page);
      await expect(page.getByTestId('result')).toBeVisible();
      await expect(page.getByTestId('result')).not.toContainText(/undefined|Error|Cannot read/);
    }
    expect(errors.pageErrors).toEqual([]);
  });
}

test('compress: a damaged PDF in a batch is named and the good one still comes out', async ({ page }) => {
  const errors = collectErrors(page);
  await openTool(page, 'compress');
  await drop(page, [
    { name: 'Broken.pdf', bytes: corruptBytes() },
    { name: 'Report.pdf', bytes: await bloatedPdf() },
  ]);
  await expect(page.getByTestId('file-item')).toHaveCount(2);
  await expect(page.getByTestId('file-item').first()).toContainText("This PDF is damaged and couldn't be read.");
  await expect(page.getByTestId('file-item').nth(1)).toHaveAttribute('data-pages', '1');
  await run(page);
  await expect(page.getByTestId('failure-item')).toHaveCount(1);
  await expect(page.getByTestId('failure-item')).toContainText("This PDF is damaged and couldn't be read.");
  await expect(page.getByTestId('result-item')).toHaveCount(1);
  expect(errors.pageErrors).toEqual([]);
});

test('compress: a damaged PDF on its own cannot be run, and the page says why', async ({ page }) => {
  await openTool(page, 'compress');
  await drop(page, [{ name: 'Broken.pdf', bytes: corruptBytes() }]);
  await expect(page.getByTestId('file-item').first()).toContainText("This PDF is damaged and couldn't be read.");
  await expect(runButton(page)).toBeDisabled();
  await expect(runNote(page)).toContainText("This file couldn't be read. Pick another one.");
});

test('sign: a file that is turned away does not throw out the PDF already there', async ({ page }) => {
  const errors = collectErrors(page);
  await openTool(page, 'sign');
  await drop(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(2) }]);
  await expect(page.getByTestId('file-item').first()).toHaveAttribute('data-pages', '2');
  await drop(page, [letter]);
  await expect(notice(page)).toContainText("Letter.pdf: This isn't a PDF.");
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await expect(page.getByTestId('file-item').first()).toHaveAttribute('data-name', 'Lease.pdf');
  await expect(page.getByTestId('page-editor')).toBeVisible();
  expect(errors.pageErrors).toEqual([]);
});

test('images to PDF: empty files, PDFs and words are turned away; the photos still make a PDF', async ({ page }) => {
  const errors = collectErrors(page);
  await openTool(page, 'images-to-pdf');
  await drop(page, [{ name: 'Empty.jpg', bytes: new Uint8Array(0), mime: 'image/jpeg' }]);
  await expect(notice(page)).toContainText('Empty.jpg: This file is empty.');
  await expect(runButton(page)).toBeDisabled();

  await drop(page, [
    { name: 'Lease.pdf', bytes: await pagesPdf(1) },
    { name: 'Note.jpg', bytes: new TextEncoder().encode('not a picture'), mime: 'image/jpeg' },
    { name: 'Photo.png', bytes: noisePng(40), mime: 'image/png' },
  ]);
  await expect(notice(page)).toContainText("Lease.pdf: This isn't a photo or picture this tool can read.");
  await expect(notice(page)).toContainText('Note.jpg');
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await run(page);
  await expect(page.getByTestId('result-item')).toHaveCount(1);
  await expect(page.getByTestId('result-detail')).toContainText('1 image');
  expect(errors.pageErrors).toEqual([]);
});
