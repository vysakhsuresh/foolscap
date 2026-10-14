/**
 * What testing with documents from real producers found, run in the browser
 * the way a person runs it (the unit tests in tests/unit/realworld.test.ts
 * cover the same files in Node). The browser matters here: it is pdf.js's
 * own worker, as built, that reads the Malayalam; and it is Chromium's image
 * decoder that turns a photo by its EXIF flag unless the flag is put aside.
 */
import { PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { openPdf } from '../fixtures/inspect';
import { MALAYALAM_LINES, MARKED_WORD, actualTextPdf, exifPhotoPdf, markWidthPdf, officeDocx, pdfaPdf } from '../fixtures/real-producers';
import { collectErrors, downloadFrom, openTool, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'laptop', 'checked once, on the laptop');
});

async function pick(page: Page, name: string, bytes: Uint8Array, type = 'application/pdf', ready = true): Promise<void> {
  await page.getByTestId('file-input').setInputFiles([{ name, mimeType: type, buffer: Buffer.from(bytes) }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  if (ready) await expect(page.getByTestId('run-button')).toBeEnabled({ timeout: 20_000 });
}

async function runTool(page: Page): Promise<void> {
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
}

test('Extract text reads Malayalam from Chrome and LibreOffice as words, not pieces', async ({ page }) => {
  const errors = collectErrors(page);
  await openTool(page, 'extract-text');
  await pick(page, 'Letter.pdf', await actualTextPdf());
  await runTool(page);
  const text = new TextDecoder().decode((await downloadFrom(page, page.getByTestId('save-button').first())).bytes);
  for (const line of MALAYALAM_LINES) expect(text).toContain(line);

  await page.reload();
  await openTool(page, 'extract-text');
  await pick(page, 'Word.pdf', await markWidthPdf());
  await runTool(page);
  const word = new TextDecoder().decode((await downloadFrom(page, page.getByTestId('save-button').first())).bytes);
  expect(word).toContain(MARKED_WORD);
  expect(errors.pageErrors).toEqual([]);
});

test('Compress leaves a phone photo stored with its EXIF flag the shape it is drawn', async ({ page }) => {
  await openTool(page, 'compress');
  await pick(page, 'Photo.pdf', await exifPhotoPdf());
  await runTool(page);
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button').first());
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const images = [...doc.context.enumerateIndirectObjects()].flatMap(([, o]) => (o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image' ? [o] : []));
  expect(images).toHaveLength(1);
  const width = Number(images[0]!.dict.lookup(PDFName.of('Width'))?.toString());
  const height = Number(images[0]!.dict.lookup(PDFName.of('Height'))?.toString());
  expect(width).toBeGreaterThan(height);
});

test('Add a password locks a PDF/A file, and says it is no longer an archive copy', async ({ page }) => {
  await openTool(page, 'add-password');
  await pick(page, 'Certificate.pdf', await pdfaPdf(), 'application/pdf', false);
  await page.getByTestId('opt-password').fill('tea');
  await page.getByTestId('opt-confirm').fill('tea');
  await runTool(page);
  await expect(page.getByTestId('result-detail')).toContainText('archive copy (PDF/A)');
});

test('Word to PDF keeps a LibreOffice file’s headings, its first header, and the photo in a table cell', async ({ page }) => {
  await openTool(page, 'office-to-pdf');
  await pick(page, 'Resume.docx', officeDocx(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await runTool(page);
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button').first());
  const view = await openPdf(bytes);
  try {
    const text = await view.text(0);
    expect(text).toContain('Malabar Builders (fictional)');
    expect(text).not.toMatch(/•\s*Arun Das/);
  } finally {
    await view.close();
  }
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const images = [...doc.context.enumerateIndirectObjects()].filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image');
  expect(images.length).toBeGreaterThanOrEqual(1);
});
