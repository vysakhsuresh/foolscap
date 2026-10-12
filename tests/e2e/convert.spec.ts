/**
 * The converters in the browser: PDF to Word (including a scan), Excel,
 * PowerPoint and EPUB, each downloaded and opened as the zip it should be.
 */
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { pagesPdf, pictureOnlyPdf } from '../fixtures/pdfs';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

async function pick(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.getByTestId('file-input').setInputFiles([{ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
}

for (const [tool, ext, inside] of [
  ['pdf-to-word', 'docx', 'word/document.xml'],
  ['pdf-to-excel', 'xlsx', 'xl/workbook.xml'],
  ['pdf-to-powerpoint', 'pptx', 'ppt/presentation.xml'],
  ['pdf-to-epub', 'epub', 'mimetype'],
] as const) {
  test(`${tool} makes a .${ext} that opens as one`, async ({ page }) => {
    await openTool(page, tool);
    await pick(page, 'Notes.pdf', await pagesPdf(2));
    await run(page);
    const item = page.getByTestId('result-item');
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute('data-name', `Notes.${ext}`);
    const { name, bytes } = await downloadFrom(page, page.getByTestId('save-button'));
    expect(name).toBe(`Notes.${ext}`);
    expect(Object.keys(unzipSync(bytes))).toContain(inside);
  });
}

test('pdf to word reads the words in a scanned page', async ({ page }) => {
  test.setTimeout(180_000);
  await openTool(page, 'pdf-to-word');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#fbfbf8';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#111';
    c.font = '64px Arial, Helvetica, sans-serif';
    c.fillText('RENT AGREEMENT', 120, 260);
    return canvas.toDataURL('image/png');
  });
  await pick(page, 'Scan.pdf', await pictureOnlyPdf(new Uint8Array(Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'))));
  await expect(page.getByTestId('opt-scans')).toBeChecked();
  await run(page);
  await expect(page.getByTestId('result-detail')).toContainText('1 scanned page read from the picture', { timeout: 150_000 });
});

test('word to pdf lays out a .docx, Malayalam included', async ({ page }) => {
  const { toDocx } = await import('../../app/src/convert/docx');
  await openTool(page, 'office-to-pdf');
  const docx = toDocx({
    blocks: [
      { kind: 'paragraph', heading: 1, runs: [{ text: 'Wedding invitation', size: 20, bold: true }] },
      { kind: 'paragraph', runs: [{ text: 'സ്വാഗതം — you are warmly invited.', size: 12 }] },
    ],
  });
  await page.getByTestId('file-input').setInputFiles([{ name: 'Invite.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(docx) }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await run(page);
  const item = page.getByTestId('result-item');
  await expect(item).toHaveAttribute('data-name', 'Invite.pdf');
  await expect(item).toHaveAttribute('data-pages', '1');
});
