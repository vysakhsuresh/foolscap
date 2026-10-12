/**
 * Every batch-2 tool, end to end in the browser, under the production CSP:
 * pick files through the real input, set the tool's own settings, run, and
 * check what comes out. One test per tool, so a failure names the tool.
 */
import { expect, test, type Page } from '@playwright/test';
import { TINY_JPEG, encryptedPdf, heavyPdf, imagesPdf, formPdf, noisePng, outlinedPdf, pagesPdf, paperPhotoPng, pdfInfo, photoPdf, pictureOnlyPdf, typedPdf } from '../fixtures/pdfs';
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

test('compress shrinks a photo stored losslessly, and the result still opens', async ({ page }) => {
  await openTool(page, 'compress');
  const bytes = await photoPdf(1200);
  await pick(page, [{ name: 'Brochure.pdf', bytes }]);
  const items = await results(page);
  await expect(items).toHaveCount(1);
  await expect(page.getByTestId('result-detail')).toContainText('1 photo made lighter');
  const size = Number(await items.first().getAttribute('data-size'));
  expect(size).toBeLessThan(bytes.length / 2);
  await expect(items.first()).toHaveAttribute('data-pages', '1');
});

test('compress says so when a file cannot get smaller', async ({ page }) => {
  await openTool(page, 'compress');
  await pick(page, [{ name: 'Small.pdf', bytes: await pagesPdf(2) }]);
  await run(page);
  await expect(page.getByTestId('failure-item')).toContainText('already about as small');
});

test('PDF to images saves the pages typed, as PNGs that hand on to Images to PDF', async ({ page }) => {
  await openTool(page, 'pdf-to-images');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(4) }]);
  await page.getByTestId('opt-pages').fill('2-3');
  await page.getByTestId('opt-dpi-72').check();
  const items = await results(page);
  await expect(items).toHaveCount(2);
  await expect(page.getByTestId('result-detail').first()).toContainText('Page 2 as a 72 dpi PNG');
  const { bytes, name } = await downloadFrom(page, page.getByTestId('save-button').first());
  expect(name).toBe('Lease page 2.png');
  expect([...bytes.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  // 310 points wide at 72 dpi is 310 pixels.
  expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(16)).toBe(310);
  await page.getByTestId('then-menu').click();
  await expect(page.getByTestId('then-images-to-pdf')).toBeVisible();
});

test('PDF to images makes JPEGs too', async ({ page }) => {
  await openTool(page, 'pdf-to-images');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(1) }]);
  await page.getByTestId('opt-format-jpeg').check();
  await results(page);
  const { bytes, name } = await downloadFrom(page, page.getByTestId('save-button').first());
  expect(name).toBe('Lease page 1.jpg');
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
});

test('extract text writes the words to a .txt', async ({ page }) => {
  await openTool(page, 'extract-text');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(2) }]);
  const items = await results(page);
  await expect(items).toHaveCount(1);
  const { bytes, name } = await downloadFrom(page, page.getByTestId('save-button'));
  expect(name).toBe('Lease.txt');
  const text = new TextDecoder().decode(bytes);
  expect(text).toContain('--- Page 2 ---');
  await expect(page.getByTestId('then-menu')).toHaveCount(0);
});

// ---- The page editor tools: drawn with a real pointer ----

async function dragOn(page: Page, target: string, from: [number, number], to: [number, number]): Promise<void> {
  await page.getByTestId(target).evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = await page.getByTestId(target).boundingBox();
  if (!box) throw new Error(`${target} is not on screen`);
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
  await page.mouse.up();
}

async function tapOn(page: Page, target: string, at: [number, number]): Promise<void> {
  await page.getByTestId(target).evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = await page.getByTestId(target).boundingBox();
  if (!box) throw new Error(`${target} is not on screen`);
  await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1]);
}

test('sign: draw a signature, tap the page, and it is placed there', async ({ page }) => {
  await openTool(page, 'sign');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(2) }]);
  await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 2');
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await dragOn(page, 'signature-pad', [0.2, 0.6], [0.8, 0.4]);
  await page.getByTestId('editor-next').click();
  await expect(page.getByTestId('editor-where')).toHaveText('Page 2 of 2');
  await tapOn(page, 'editor-layer', [0.7, 0.85]);
  await expect(page.getByTestId('editor-item')).toHaveCount(1);
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
  await expect(page.getByTestId('result-detail')).toHaveText('Signed on page 2');
});

test('add text: tap the page and type, in English or Malayalam', async ({ page }) => {
  await openTool(page, 'add-text');
  await pick(page, [{ name: 'Form.pdf', bytes: await pagesPdf(1) }]);
  await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 1');
  await page.getByTestId('opt-text').fill('Anjali Menon');
  await tapOn(page, 'editor-layer', [0.2, 0.3]);
  await page.getByTestId('opt-text').fill('Kochi');
  await expect(page.getByTestId('editor-item')).toHaveText(/Kochi/);
  await page.getByTestId('opt-text').fill('ക്ഷണം');
  await tapOn(page, 'editor-layer', [0.2, 0.6]);
  await expect(page.getByTestId('editor-item')).toHaveCount(2);
  await results(page);
  await expect(page.getByTestId('result-detail')).toHaveText('2 pieces of text added');
});

test('mark up: highlight and draw, and undo takes the last one back', async ({ page }) => {
  await openTool(page, 'mark-up');
  await pick(page, [{ name: 'Notes.pdf', bytes: await pagesPdf(1) }]);
  await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 1');
  await dragOn(page, 'editor-layer', [0.1, 0.2], [0.6, 0.25]);
  await page.getByTestId('opt-tool-pen').check();
  await dragOn(page, 'editor-layer', [0.1, 0.5], [0.7, 0.7]);
  await dragOn(page, 'editor-layer', [0.1, 0.8], [0.7, 0.9]);
  await page.getByTestId('editor-undo').click();
  await results(page);
  await expect(page.getByTestId('result-detail')).toHaveText('1 highlight and 1 pen stroke');
});

test('remove areas turns the marked pages into pictures, so no text is left on them', async ({ page }) => {
  await openTool(page, 'remove-areas');
  await pick(page, [{ name: 'Statement.pdf', bytes: await pagesPdf(2) }]);
  await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 2');
  await dragOn(page, 'editor-layer', [0.02, 0.05], [0.5, 0.35]);
  await page.getByTestId('editor-next').click();
  await expect(page.getByTestId('editor-where')).toHaveText('Page 2 of 2');
  await dragOn(page, 'editor-layer', [0.02, 0.05], [0.5, 0.35]);
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
  await expect(page.getByTestId('result-detail')).toContainText('2 areas removed. 2 pages are now pictures');
  if ((await page.getByTestId('then-menu').count()) === 0) return; // memory backend: no handoff
  // The proof: hand the result to Extract text, which finds no words left at all.
  await page.getByTestId('then-menu').click();
  await page.getByTestId('then-extract-text').click();
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await run(page);
  await expect(page.getByTestId('failure-item')).toContainText('probably a scan');
});

test('fill in a form: the fields are listed, filled, and the answers saved', async ({ page }) => {
  await openTool(page, 'fill-form');
  await pick(page, [{ name: 'Application.pdf', bytes: await formPdf() }]);
  await expect(page.getByTestId('form-field-name')).toBeVisible();
  await page.getByTestId('form-field-name').fill('Anjali Menon');
  await page.getByTestId('form-field-agree').check();
  await page.getByTestId('form-field-city').selectOption('Dubai');
  await results(page);
  await expect(page.getByTestId('result-detail')).toHaveText('3 answers, still editable');
});

test('fill in a form says so when a PDF has no fields', async ({ page }) => {
  await openTool(page, 'fill-form');
  await pick(page, [{ name: 'Plain.pdf', bytes: await pagesPdf(1) }]);
  await expect(page.getByTestId('form-none')).toBeVisible();
  await expect(page.getByTestId('run-button')).toBeDisabled();
});

// ---- Read ----

test('read: every page, contents, find, zoom, night, and Then… to another tool', async ({ page }) => {
  await openTool(page, 'read');
  await expect(page.getByTestId('run-button')).toBeHidden();
  await pick(page, [{ name: 'Lease.pdf', bytes: await outlinedPdf(6) }]);
  await expect(page.getByTestId('reader-page')).toHaveCount(6);
  await expect(page.locator('[data-testid="reader-page"][data-drawn="true"]').first()).toBeVisible();
  await expect(page.getByTestId('reader-where')).toHaveText('Page 1 of 6');

  await page.getByTestId('reader-outline-toggle').click();
  await expect(page.getByTestId('reader-entry')).toHaveCount(2);
  await page.getByTestId('reader-entry').nth(1).click();
  await expect(page.getByTestId('reader-where')).toHaveText('Page 3 of 6');

  // Each page carries its own number as its text; "5" is on page 5 only.
  await page.getByTestId('reader-find').fill('5');
  await expect(page.getByTestId('reader-find-count')).toHaveText('1 match on 1 page');
  await expect(page.locator('[data-testid="reader-page"].is-current')).toHaveAttribute('data-page', '4');

  await page.getByTestId('reader-zoom-in').click();
  await expect(page.getByTestId('reader-zoom')).toHaveText('125%');
  await page.getByTestId('reader-night').click();
  await expect(page.getByTestId('reader')).toHaveClass(/reader--night/);

  if (!(await page.getByTestId('reader-then').isVisible())) return;
  await page.getByTestId('reader-then').click();
  await page.getByTestId('then-split').click();
  await expect(page).toHaveURL(/\/tools\/split\/$/);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
});

// ---- Scan ----

test('scan finds the sheet in each photo, and makes one straightened PDF', async ({ page }) => {
  await openTool(page, 'scan');
  await page.getByTestId('file-input').setInputFiles([
    { name: 'IMG_0001.png', mimeType: 'image/png', buffer: Buffer.from(paperPhotoPng()) },
    { name: 'IMG_0002.png', mimeType: 'image/png', buffer: Buffer.from(paperPhotoPng(800, 600)) },
  ]);
  await expect(page.getByTestId('scan-card')).toHaveCount(2);
  await expect(page.locator('[data-testid="scan-card"][data-found="true"]')).toHaveCount(2);
  await page.getByTestId('scan-turn').nth(1).click();
  await page.getByTestId('opt-look-bw').check();
  const items = await results(page);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
  await expect(page.getByTestId('result-detail')).toHaveText('2 pages in black and white on A4');
});

// ---- Make searchable ----

test('make searchable reads the words in a scanned page, and Extract text then finds them', async ({ page }) => {
  test.setTimeout(180_000);
  await openTool(page, 'ocr');
  // A "scan": words drawn by the browser into a picture, at A4 and 150 dpi, with no text in the PDF.
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#fbfbf8';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#111';
    c.font = '64px Arial, Helvetica, sans-serif';
    c.fillText('INVOICE 4821', 120, 260);
    c.font = '40px Arial, Helvetica, sans-serif';
    c.fillText('Rent for October, paid in full.', 120, 380);
    return canvas.toDataURL('image/png');
  });
  const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  await pick(page, [{ name: 'Receipt scan.pdf', bytes: await pictureOnlyPdf(new Uint8Array(png)) }]);
  const button = page.getByTestId('run-button');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('result-detail')).toContainText('read on 1 page');
  if ((await page.getByTestId('then-menu').count()) === 0) return;
  await page.getByTestId('then-menu').click();
  await page.getByTestId('then-extract-text').click();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await run(page);
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  const text = new TextDecoder().decode(bytes);
  expect(text).toContain('INVOICE');
  expect(text).toContain('4821');
});

test('make searchable leaves a file that already has text alone, and says so', async ({ page }) => {
  await openTool(page, 'ocr');
  await pick(page, [{ name: 'Typed.pdf', bytes: await typedPdf() }]);
  await run(page);
  await expect(page.getByTestId('failure-item')).toContainText('already has text');
});
