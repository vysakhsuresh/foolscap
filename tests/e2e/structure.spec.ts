/**
 * The structure tools and the reader's print and read-aloud, end to end in
 * the browser under the production CSP. One test per behaviour, so a failure
 * names what broke.
 */
import { expect, test, type Page } from '@playwright/test';
import { AES_EC384 } from '../fixtures/certificates';
import { bloatedPdf, outlinedPdf, pagesPdf, pdfInfo } from '../fixtures/pdfs';
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

test('page background colours the pages', async ({ page }) => {
  await openTool(page, 'background');
  await pick(page, [{ name: 'Notes.pdf', bytes: await pagesPdf(2) }]);
  await page.getByTestId('opt-colour-#eaf6ee').check();
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '2');
  await expect(page.getByTestId('result-detail')).toContainText('All 2 pages given a #EAF6EE background');
});

test('page labels numbers the front pages in roman', async ({ page }) => {
  await openTool(page, 'page-labels');
  await pick(page, [{ name: 'Thesis.pdf', bytes: await pagesPdf(4) }]);
  await page.getByTestId('opt-front').fill('2');
  await results(page);
  await expect(page.getByTestId('result-detail')).toContainText('Pages labelled i to ii, then 1 onwards');
});

test('attachments puts any file inside a PDF, then takes it out again', async ({ page }) => {
  await openTool(page, 'attachments');
  await pick(page, [
    { name: 'Invoice.pdf', bytes: await pagesPdf(1) },
    { name: 'Costs.csv', bytes: new TextEncoder().encode('tea,40\n'), mime: 'text/csv' },
  ]);
  await results(page);
  await expect(page.getByTestId('result-detail')).toContainText('1 file attached inside');
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));

  await openTool(page, 'attachments');
  await pick(page, [{ name: 'Invoice with attachments.pdf', bytes }]);
  await page.getByTestId('opt-mode-extract').check();
  const items = await results(page);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('data-name', 'Costs.csv');
  const back = await downloadFrom(page, page.getByTestId('save-button'));
  expect(new TextDecoder().decode(back.bytes)).toBe('tea,40\n');
});

test('bookmarks shows the outline, takes edits and a new entry, and saves them', async ({ page }) => {
  await openTool(page, 'bookmarks');
  await pick(page, [{ name: 'Manual.pdf', bytes: await outlinedPdf(4) }]);
  await expect(page.getByTestId('bookmark-title-0')).toHaveValue('Introduction');
  await expect(page.getByTestId('bookmark-title-1')).toHaveValue('Terms');
  await page.getByTestId('bookmark-title-1').fill('Terms and conditions');
  await page.getByTestId('bookmark-add').click();
  await expect(page.getByTestId('bookmark-title-2')).toBeFocused();
  await page.getByTestId('bookmark-title-2').fill('Signatures');
  await page.getByTestId('bookmark-page-2').fill('4');
  await page.getByTestId('bookmark-in-2').click();
  await page.getByTestId('bookmark-page-2').fill('9');
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await expect(page.locator('.run__note')).toContainText('Bookmark 3 needs a page between 1 and 4.');
  await page.getByTestId('bookmark-page-2').fill('4');
  await results(page);
  await expect(page.getByTestId('result-detail')).toContainText('3 bookmarks');
});

test('split can cut at each chapter bookmark', async ({ page }) => {
  await openTool(page, 'split');
  await pick(page, [{ name: 'Lease.pdf', bytes: await outlinedPdf(4) }]);
  await page.getByTestId('split-mode-bookmarks').check();
  const items = await results(page);
  await expect(items).toHaveCount(2);
  await expect(items.first()).toHaveAttribute('data-name', 'Lease 01 Introduction.pdf');
});

test('clean hidden data is the default, and strips the details', async ({ page }) => {
  await openTool(page, 'document-details');
  await expect(page.getByTestId('opt-mode-clean')).toBeChecked();
  await pick(page, [{ name: 'CV.pdf', bytes: await pagesPdf(1, { title: 'Secret plan', producer: 'Corporate Writer 9' }) }]);
  await results(page);
  await expect(page.getByTestId('result-detail')).toContainText('Removed the title, author and hidden metadata');
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  const info = await pdfInfo(bytes);
  expect(info.title).toBeUndefined();
});

test('add a password can restrict printing without a password', async ({ page }) => {
  await openTool(page, 'add-password');
  await pick(page, [{ name: 'Brochure.pdf', bytes: await pagesPdf(1) }]);
  await page.getByTestId('opt-lock-restrict').check();
  await expect(page.getByTestId('opt-password')).toBeHidden();
  await page.getByTestId('opt-allow-printing').uncheck();
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-name', 'Brochure restricted.pdf');
  // It opens without asking for anything.
  await expect(items.first()).toHaveAttribute('data-pages', '1');
});

test('page numbers can Bates-number a batch as one sequence', async ({ page }) => {
  await openTool(page, 'page-numbers');
  await pick(page, [
    { name: 'A.pdf', bytes: await pagesPdf(2) },
    { name: 'B.pdf', bytes: await pagesPdf(2) },
  ]);
  await page.getByTestId('opt-format').selectOption('bates');
  await page.getByTestId('opt-prefix').fill('CASE-');
  await page.getByTestId('opt-digits').fill('4');
  await results(page);
  await expect(page.getByTestId('result-detail').nth(1)).toContainText('Bates numbered CASE-0003 to CASE-0004');
});

test('insert pages can replace pages in place', async ({ page }) => {
  await openTool(page, 'insert-pages');
  await pick(page, [
    { name: 'Contract.pdf', bytes: await pagesPdf(4) },
    { name: 'Signed.pdf', bytes: await pagesPdf(1) },
  ]);
  await page.getByTestId('opt-replace').fill('3');
  await expect(page.getByTestId('opt-where-replace')).toBeChecked();
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-pages', '4');
  await expect(page.getByTestId('result-detail')).toContainText('Page 3 replaced with 1 page');
});

test('compress can aim for a size an upload form asks for', async ({ page }) => {
  await openTool(page, 'compress');
  const bytes = await bloatedPdf();
  await pick(page, [{ name: 'Form.pdf', bytes }]);
  await page.getByTestId('opt-level-target').check();
  await page.getByTestId('opt-target-custom').check();
  const limit = Math.ceil(bytes.length / 1000 / 2);
  await page.getByTestId('opt-target-kb').fill(String(limit));
  const items = await results(page);
  expect(Number(await items.first().getAttribute('data-size'))).toBeLessThanOrEqual(limit * 1000);
  await expect(page.getByTestId('result-detail')).toContainText(`under ${limit} KB`);
});

test('the reader prints every page as a picture, and reads aloud only with an on-device voice', async ({ page }) => {
  await openTool(page, 'read');
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset['printed'] = 'yes';
    };
  });
  await pick(page, [{ name: 'Book.pdf', bytes: await pagesPdf(3) }]);
  await expect(page.getByTestId('reader-page')).toHaveCount(3);
  await page.getByTestId('reader-print').click();
  await expect(page.locator('body[data-printed="yes"]')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('[data-testid="print-sheets"] img')).toHaveCount(3);

  await page.getByTestId('reader-aloud').click();
  // Either it is reading, or it says why it will not: never a voice that sends the words away.
  await expect
    .poll(async () => (await page.getByTestId('reader-aloud').getAttribute('aria-pressed')) === 'true' || /voices that work over the internet/.test((await page.getByTestId('reader-status').textContent()) ?? ''))
    .toBe(true);
});

test('digital signature seals the PDF with a certificate file and its password', async ({ page }) => {
  await openTool(page, 'digital-sign');
  await pick(page, [{ name: 'Agreement.pdf', bytes: await pagesPdf(2) }]);
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await page.getByTestId('opt-certificate').setInputFiles([{ name: 'me.pfx', mimeType: 'application/x-pkcs12', buffer: Buffer.from(AES_EC384, 'base64') }]);
  await expect(page.getByTestId('certificate-picked')).toHaveText('Certificate ready. Type its password below.');
  await page.getByTestId('opt-cert-password').fill('wrong');
  await run(page);
  await expect(page.getByTestId('failure-item')).toContainText("That password didn't open the certificate.");
  await page.getByTestId('opt-cert-password').fill('pässword');
  const items = await results(page);
  await expect(items.first()).toHaveAttribute('data-name', 'Agreement (signed).pdf');
  await expect(page.getByTestId('result-detail')).toContainText('Signed by Kerala Test Co');
});

async function layerBox(page: Page) {
  await page.getByTestId('editor-layer').evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  return (await page.getByTestId('editor-layer').boundingBox())!;
}

async function dragAcross(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = await layerBox(page);
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from[0] + to[0]) / 2), box.y + box.height * ((from[1] + to[1]) / 2), { steps: 4 });
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 4 });
  await page.mouse.up();
}

async function tapAt(page: Page, at: [number, number]): Promise<void> {
  const box = await layerBox(page);
  await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1]);
}

test('mark up has the whole kit: shapes, arrows, measure, notes, stamps, text boxes and links', async ({ page }) => {
  await openTool(page, 'mark-up');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(1) }]);
  await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 1');
  await page.getByTestId('opt-tool-underline').check();
  await dragAcross(page, [0.1, 0.1], [0.5, 0.13]);
  await page.getByTestId('opt-tool-rect').check();
  await dragAcross(page, [0.1, 0.2], [0.4, 0.3]);
  await page.getByTestId('opt-tool-ellipse').check();
  await dragAcross(page, [0.5, 0.2], [0.8, 0.3]);
  await page.getByTestId('opt-tool-arrow').check();
  await dragAcross(page, [0.1, 0.4], [0.5, 0.45]);
  await page.getByTestId('opt-tool-measure').check();
  await dragAcross(page, [0.1, 0.5], [0.9, 0.5]);
  await expect(page.getByTestId('editor-measure')).toContainText('mm');
  await page.getByTestId('opt-tool-note').check();
  await page.getByTestId('opt-words').fill('Ask about the deposit');
  await tapAt(page, [0.8, 0.6]);
  await page.getByTestId('opt-tool-stamp').check();
  await page.getByTestId('opt-stamp').selectOption('PAID');
  await tapAt(page, [0.5, 0.75]);
  await page.getByTestId('opt-tool-textbox').check();
  await page.getByTestId('opt-words').fill('See clause 4');
  await tapAt(page, [0.1, 0.85]);
  await page.getByTestId('opt-tool-link').check();
  await dragAcross(page, [0.1, 0.92], [0.3, 0.96]);
  await expect(page.getByTestId('editor-hint')).toContainText('web address first');
  await page.getByTestId('opt-link').fill('https://example.org');
  await dragAcross(page, [0.1, 0.92], [0.3, 0.96]);
  await run(page);
  await expect(page.getByTestId('result-detail')).toHaveText(
    '1 underline, 1 box, 1 circle, 1 arrow, 1 measurement, 1 note, 1 stamp, 1 text box and 1 link',
  );
});

test('add image places a chosen picture on the page', async ({ page }) => {
  await openTool(page, 'add-image');
  await pick(page, [{ name: 'Letter.pdf', bytes: await pagesPdf(1) }]);
  await expect(page.getByTestId('run-button')).toBeDisabled();
  const png = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 60;
    const x = c.getContext('2d')!;
    x.fillStyle = '#c41a1f';
    x.fillRect(10, 10, 100, 40);
    return c.toDataURL('image/png').split(',')[1]!;
  }), 'base64');
  await page.getByTestId('opt-picture').setInputFiles([{ name: 'logo.png', mimeType: 'image/png', buffer: png }]);
  await expect(page.getByTestId('editor-hint')).toContainText('Tap the page to put the picture there');
  await tapAt(page, [0.5, 0.3]);
  await expect(page.getByTestId('editor-item')).toHaveCount(1);
  await run(page);
  await expect(page.getByTestId('result-detail')).toHaveText('1 picture placed');
});

test('read lists the comments in a document and jumps to them', async ({ page }) => {
  await openTool(page, 'mark-up');
  await pick(page, [{ name: 'Lease.pdf', bytes: await pagesPdf(2) }]);
  await page.getByTestId('editor-next').click();
  await page.getByTestId('opt-tool-note').check();
  await page.getByTestId('opt-words').fill('Check the rent figure');
  await tapAt(page, [0.5, 0.5]);
  await run(page);
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  await openTool(page, 'read');
  await pick(page, [{ name: 'Lease marked up.pdf', bytes }]);
  await expect(page.getByTestId('reader-page')).toHaveCount(2);
  await page.getByTestId('reader-comments-toggle').click();
  const comment = page.getByTestId('reader-comment');
  await expect(comment).toHaveCount(1);
  await expect(comment).toContainText('Note · page 2');
  await expect(comment).toContainText('Check the rent figure');
});
