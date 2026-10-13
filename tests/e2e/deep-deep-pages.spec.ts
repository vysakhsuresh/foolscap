/**
 * The Pages tools, driven the way a person drives them, on documents like
 * the ones people bring (tests/fixtures/documents.ts): pick the files, set
 * every option, run, save every result, and read what came out back with
 * pdf.js — the words on each page and their order, the sizes, turns and
 * crop boxes, the bookmarks and where they open, the labels, the links and
 * the form fields. Then the result line, Then…, Start over, and the phone.
 */
import { unzipSync } from 'fflate';
import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, test, type Page } from '@playwright/test';
import { annotatedPdf, idCardScanPdf, leasePdf, photoAlbumPdf, reportPdf, salarySlipPdf, sidewaysScanPdf } from '../fixtures/documents';
import { markers, outlineLines, readPdf, type ReadPdf } from '../fixtures/pdf-read';
import { pagesPdf, stampsIn } from '../fixtures/pdfs';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => useDownloads(context));

type Doc = { readonly name: string; readonly bytes: Uint8Array };

async function pick(page: Page, files: readonly Doc[]): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files.map((f) => ({ name: f.name, mimeType: 'application/pdf', buffer: Buffer.from(f.bytes) })));
  const items = page.getByTestId('file-item');
  await expect(items).toHaveCount(files.length);
  for (let i = 0; i < files.length; i++) await expect(items.nth(i)).toHaveAttribute('data-pages', /\d+/);
}

/** Saves result `n` and reads it back. */
async function saved(page: Page, n = 0): Promise<{ name: string; bytes: Uint8Array; read: ReadPdf }> {
  const item = page.getByTestId('result-item').nth(n);
  await centre(page, item.getByTestId('save-button'));
  const { name, bytes } = await downloadFrom(page, item.getByTestId('save-button'));
  expect(stampsIn(bytes)).toEqual([]);
  return { name, bytes, read: await readPdf(bytes) };
}

/** Scrolled to the middle of the screen, clear of the pinned corners (Buy me a coffee, Get help). */
async function centre(page: Page, target: ReturnType<Page['getByTestId']>): Promise<void> {
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

async function lock(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.encrypt({ userPassword: password, ownerPassword: `${password}-owner` });
  return new Uint8Array(await doc.save());
}

const report = async (): Promise<Doc> => ({ name: 'Annual report.pdf', bytes: await reportPdf() });
const lease = async (): Promise<Doc> => ({ name: 'Lease.pdf', bytes: await leasePdf() });
const slip = async (): Promise<Doc> => ({ name: 'Payslip.pdf', bytes: await salarySlipPdf() });

const REPORT_OUTLINE = [
  'Cover→1',
  'Contents→2',
  '1 Overview→3',
  '  1.1 Highlights→4',
  '2 Finances→5',
  '  2.1 Table of accounts→6',
  '3 Outlook→7',
  'Appendix→8',
  'Society website→https://example.org/coir',
];

// ---------------------------------------------------------------- Merge

test.describe('merge', () => {
  test('three documents in the order set with the arrows: pages, bookmarks, links and the form all come through', async ({ page }) => {
    await openTool(page, 'merge');
    await pick(page, [await report(), await lease(), await slip()]);
    // The payslip to the front, in two taps.
    const items = page.getByTestId('file-item');
    await items.nth(2).getByTestId('file-move-up').click();
    await items.nth(1).getByTestId('file-move-up').click();
    await expect(items.nth(0)).toHaveAttribute('data-name', 'Payslip.pdf');
    await expect(items.nth(1)).toHaveAttribute('data-name', 'Annual report.pdf');
    await run(page);
    const result = page.getByTestId('result-item');
    await expect(result).toHaveCount(1);
    await expect(result).toHaveAttribute('data-pages', '13');
    await expect(result).toHaveAttribute('data-name', 'Payslip + 2 more.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('13 pages from 3 files');
    const { read } = await saved(page);
    expect(markers(read, 'Payslip|Report|Lease')).toEqual([1, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4]);
    expect(read.pages[0]!.text).toContain('Net pay Rs. 62,250.00');
    expect(read.pages[0]!.width).toBe(595.28);
    expect(read.pages[9]!.width).toBe(612);
    expect(read.pages[7]!.width).toBe(841.89);
    // The report's bookmarks open the report's pages, one page further on now.
    expect(outlineLines(read.outline)).toEqual(REPORT_OUTLINE.map((l) => l.replace(/→(\d)$/, (_, n: string) => `→${Number(n) + 1}`)));
    expect(read.outline[2]!.kind).toBe('XYZ');
    expect(read.pages[2]!.annotations.map((a) => a.dest)).toEqual([3, 5, 7, 8]);
    expect([...read.formFields].sort()).toEqual(['signed_on', 'witnessed']);
    expect(read.fields).toEqual({ signed_on: '20/09/2026', witnessed: 'Yes' });
    expect(read.title).toBe('Payslip + 2 more');
  });

  test('a locked file is unlocked on its row, and the merge says it has no password', async ({ page }) => {
    await openTool(page, 'merge');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'Locked report.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await lock(await reportPdf(), 'kochi2026')) },
      { name: 'Payslip.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await salarySlipPdf()) },
    ]);
    const first = page.getByTestId('file-item').first();
    await expect(first.getByTestId('file-password')).toBeVisible();
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await first.getByTestId('file-password').fill('wrong');
    await first.getByTestId('file-unlock').click();
    await expect(first).toContainText("That password didn't open it. Check it and try again.");
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await first.getByTestId('file-password').fill('kochi2026');
    await first.getByTestId('file-unlock').click();
    await expect(first).toHaveAttribute('data-pages', '8');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('9 pages from 2 files. The merged file has no password');
    const { bytes, read } = await saved(page);
    expect((await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })).isEncrypted).toBe(false);
    expect(markers(read, 'Report|Payslip')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1]);
  });

  test('taking a file out leaves one, and the page says another is needed', async ({ page }) => {
    await openTool(page, 'merge');
    await pick(page, [await report(), await slip()]);
    await expect(page.getByTestId('run-button')).toBeEnabled();
    await page.getByTestId('file-item').nth(1).getByTestId('file-remove').click();
    await expect(page.getByTestId('file-item')).toHaveCount(1);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Add at least one more PDF to merge.');
  });

  test('Then… carries the merged file into Organise, and Start over clears the page', async ({ page }) => {
    await openTool(page, 'merge');
    await pick(page, [await slip(), await lease()]);
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-pages', '5');
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('result')).toHaveCount(0);
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await expect(page.getByTestId('run-button')).toBeDisabled();

    await pick(page, [await slip(), await lease()]);
    await run(page);
    await page.getByTestId('then-menu').click();
    await page.getByTestId('then-organise').click();
    await page.waitForURL('**/tools/organise/');
    await expect(page.locator('body[data-ready="true"]')).toBeAttached({ timeout: 30_000 });
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-name', 'Payslip + 1 more.pdf');
    await expect(page.getByTestId('page-tile')).toHaveCount(5);
  });
});

// ---------------------------------------------------------------- Split

test.describe('split', () => {
  test('at each chapter: six parts named after the bookmarks, each with its own bookmarks, labels and pages; Save all zips them', async ({ page }) => {
    await openTool(page, 'split');
    await pick(page, [await report()]);
    await page.getByTestId('split-mode-bookmarks').check();
    await run(page);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(6);
    const names = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
    expect(names).toEqual([
      'Annual report 01 Cover.pdf',
      'Annual report 02 Contents.pdf',
      'Annual report 03 1 Overview.pdf',
      'Annual report 04 2 Finances.pdf',
      'Annual report 05 3 Outlook.pdf',
      'Annual report 06 Appendix.pdf',
    ]);
    await expect(page.getByTestId('result-detail')).toHaveText(['1 page', '1 page', '2 pages', '2 pages', '1 page', '1 page']);
    await centre(page, page.getByTestId('save-all-button'));
    const { bytes } = await downloadFrom(page, page.getByTestId('save-all-button'));
    const zip = unzipSync(bytes);
    expect(Object.keys(zip).sort()).toEqual([...names].sort());
    const finances = await readPdf(zip['Annual report 04 2 Finances.pdf']!);
    expect(markers(finances, 'Report')).toEqual([5, 6]);
    expect(finances.pages[0]!.text).toContain('Sales of coir yarn 1,82,40,000.00 2,04,15,500.00');
    expect(outlineLines(finances.outline)).toEqual(['2 Finances→1', '  2.1 Table of accounts→2', 'Society website→https://example.org/coir']);
    expect(finances.labels).toEqual(['3', '4']);
    const contents = zip['Annual report 02 Contents.pdf']!;
    // Its links pointed at chapters that are not in this part: no hidden copies of them, and no dead links.
    expect(contents.length).toBeLessThan(10_000);
    expect((await readPdf(contents)).pages[0]!.annotations).toEqual([]);
  });

  test('every 3 pages, one page per file, and ranges in the order typed', async ({ page }) => {
    await openTool(page, 'split');
    await pick(page, [await report()]);
    await page.getByTestId('split-every').fill('3');
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(3);
    await expect(page.getByTestId('result-detail')).toHaveText(['3 pages', '3 pages', '2 pages']);
    await expect(page.getByTestId('result-item').nth(2)).toHaveAttribute('data-name', 'Annual report part 3 of 3.pdf');
    expect(markers((await saved(page, 2)).read, 'Report')).toEqual([7, 8]);

    await page.getByTestId('split-mode-single').check();
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(8);
    const sixth = (await saved(page, 5)).read;
    expect(markers(sixth, 'Report')).toEqual([6]);
    expect(sixth.labels).toEqual(['4']);

    await page.getByTestId('split-ranges').fill('7-8, 1, 3-4, 2-3');
    await expect(page.getByTestId('split-mode-ranges')).toBeChecked();
    await run(page);
    const names = await page.getByTestId('result-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
    expect(names).toEqual(['Annual report pages 7-8.pdf', 'Annual report pages 1.pdf', 'Annual report pages 3-4.pdf', 'Annual report pages 2-3.pdf']);
    expect(markers((await saved(page, 0)).read, 'Report')).toEqual([7, 8]);
    const overlap = (await saved(page, 3)).read;
    expect(markers(overlap, 'Report')).toEqual([2, 3]);
    // The contents page keeps its one link that still has somewhere to go: chapter 1, now page 2.
    expect(overlap.pages[0]!.annotations.map((a) => a.dest)).toEqual([1]);
  });

  test('the run waits for a sensible setting, and a file with no bookmarks is told so', async ({ page }) => {
    await openTool(page, 'split');
    await pick(page, [{ name: 'Plain.pdf', bytes: await pagesPdf(4) }]);
    await page.getByTestId('split-every').fill('');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type how many pages go in each file: 1 or more.');
    await page.getByTestId('split-every').fill('0');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await page.getByTestId('split-mode-ranges').check();
    await expect(page.locator('.run__note')).toHaveText('Type the pages to split out, like 1-3, 7, 12-.');
    await page.getByTestId('split-every').fill('4');
    await expect(page.getByTestId('split-mode-every')).toBeChecked();
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('the same as the original');
    await page.getByTestId('split-mode-bookmarks').check();
    await run(page);
    await expect(page.getByTestId('failure-item')).toHaveText('Plain.pdf: This PDF has no bookmarks to split at. Add some with the Bookmarks tool, or split by pages.');
  });
});

// ---------------------------------------------------------------- Organise

test.describe('organise', () => {
  test('move the appendix to the front, turn the chart, delete a page: the order, turns, bookmarks and labels follow', async ({ page }) => {
    await openTool(page, 'organise');
    await pick(page, [await report()]);
    const tiles = page.getByTestId('page-tile');
    await expect(tiles).toHaveCount(8);
    const tile = (source: number) => page.locator(`[data-testid="page-tile"][data-source="${source}"]`);
    for (let i = 0; i < 7; i++) await tile(7).getByTestId('page-move-up').click();
    await expect(tiles.first()).toHaveAttribute('data-source', '7');
    await tile(6).getByTestId('page-rotate').click();
    await expect(tile(6)).toHaveAttribute('data-rotation', '90');
    await tile(3).getByTestId('page-delete').click();
    await expect(tile(3)).toHaveAttribute('data-deleted', 'true');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('7 pages, 1 rotated, 1 removed');
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Annual report organised.pdf');
    const { read } = await saved(page);
    expect(markers(read, 'Report')).toEqual([8, 1, 2, 3, 5, 6, 7]);
    expect(read.pages.map((p) => p.rotation)).toEqual([0, 0, 0, 0, 0, 0, 90]);
    expect(outlineLines(read.outline)).toEqual([
      'Cover→2',
      'Contents→3',
      '1 Overview→4',
      '2 Finances→5',
      '  2.1 Table of accounts→6',
      '3 Outlook→7',
      'Appendix→1',
      'Society website→https://example.org/coir',
    ]);
    expect(read.pages[2]!.annotations.map((a) => a.dest)).toEqual([3, 4, 6, 0]);
    expect(read.title).toBe('Annual Report 2025-26');
  });

  test('only reordering keeps every page as it was, and deleting every page stops the run', async ({ page }) => {
    await openTool(page, 'organise');
    await pick(page, [await lease()]);
    const tile = (source: number) => page.locator(`[data-testid="page-tile"][data-source="${source}"]`);
    await tile(0).getByTestId('page-move-down').click();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Same 4 pages, reordered');
    const { read } = await saved(page);
    expect(markers(read, 'Lease')).toEqual([2, 1, 3, 4]);
    expect([...read.formFields].sort()).toEqual(['signed_on', 'witnessed']);

    for (let s = 0; s < 4; s++) await tile(s).getByTestId('page-delete').click();
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Every page is deleted. Restore at least one.');
    await tile(2).getByTestId('page-restore').click();
    await expect(page.getByTestId('run-button')).toBeEnabled();
  });
});

// ---------------------------------------------------------------- Extract or remove pages

test.describe('extract pages', () => {
  test('keep 8, 1-2: the pages come out in the original order, with their bookmarks and labels', async ({ page }) => {
    await openTool(page, 'extract-pages');
    await pick(page, [await report()]);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type the pages, like 1-3, 7, 12-.');
    await page.getByTestId('opt-pages').fill('8, 1-2');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('3 pages kept of 8');
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Annual report pages 1-2, 8.pdf');
    const { read } = await saved(page);
    expect(markers(read, 'Report')).toEqual([1, 2, 8]);
    expect(outlineLines(read.outline)).toEqual(['Cover→1', 'Contents→2', 'Appendix→3', 'Society website→https://example.org/coir']);
    expect(read.labels).toEqual(['i', 'ii', '6']);
    // From the contents page only the link to the appendix has a page to go to.
    expect(read.pages[1]!.annotations.map((a) => a.dest)).toEqual([2]);
  });

  test('remove 2-3 and 6-: what is left, and the honest refusals', async ({ page }) => {
    await openTool(page, 'extract-pages');
    await pick(page, [await report()]);
    await page.getByTestId('opt-mode-remove').check();
    await page.getByTestId('opt-pages').fill('2-3, 6-');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('5 pages removed, 3 left');
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Annual report without pages 2-3, 6-8.pdf');
    expect(markers((await saved(page)).read, 'Report')).toEqual([1, 4, 5]);

    await page.getByTestId('opt-pages').fill('1-');
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('That would remove every page. Leave at least one.');
    await page.getByTestId('opt-mode-keep').check();
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('Those are all the pages, so nothing would change.');
    await page.getByTestId('opt-pages').fill('12-20');
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('Type the pages, like 1-3, 7, 12-');
  });

  test('a locked file gives a new file locked with the same password', async ({ page }) => {
    await openTool(page, 'extract-pages');
    await page.getByTestId('file-input').setInputFiles([{ name: 'Report.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await lock(await reportPdf(), 'coir@26')) }]);
    const item = page.getByTestId('file-item');
    await item.getByTestId('file-password').fill('coir@26');
    await item.getByTestId('file-password').press('Enter');
    await expect(item).toHaveAttribute('data-pages', '8');
    await page.getByTestId('opt-pages').fill('5-6');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 pages kept of 8, still locked with the same password');
    await centre(page, page.getByTestId('save-button'));
    const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
    await expect(readPdf(bytes)).rejects.toThrow();
    const read = await readPdf(bytes, 'coir@26');
    expect(markers(read, 'Report')).toEqual([5, 6]);
    expect(outlineLines(read.outline)).toEqual(['2 Finances→1', '  2.1 Table of accounts→2', 'Society website→https://example.org/coir']);
  });

  test('pulling the signature page out of the lease keeps its form fillable', async ({ page }) => {
    await openTool(page, 'extract-pages');
    await pick(page, [await lease()]);
    await page.getByTestId('opt-pages').fill('4');
    await run(page);
    const { read } = await saved(page);
    expect(markers(read, 'Lease')).toEqual([4]);
    expect([...read.formFields].sort()).toEqual(['signed_on', 'witnessed']);
    expect(read.fields).toEqual({ signed_on: '20/09/2026', witnessed: 'Yes' });
  });
});

// ---------------------------------------------------------------- Insert pages

test.describe('insert pages', () => {
  test('a payslip after page 2, at the start, and at the end', async ({ page }) => {
    await openTool(page, 'insert-pages');
    await pick(page, [await report()]);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Add the PDF to put in as well. The first file is the one that gets the pages.');
    await page.getByTestId('file-input').setInputFiles([{ name: 'Payslip.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await salarySlipPdf()) }]);
    await expect(page.getByTestId('file-item')).toHaveCount(2);
    await page.getByTestId('opt-after').fill('2');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 page added after page 2, 9 in all');
    const { read } = await saved(page);
    expect(markers(read, 'Report|Payslip')).toEqual([1, 2, 1, 3, 4, 5, 6, 7, 8]);
    expect(read.labels).toEqual(['i', 'ii', 'iii', '1', '2', '3', '4', '5', '6']);
    expect(outlineLines(read.outline).slice(0, 3)).toEqual(['Cover→1', 'Contents→2', '1 Overview→4']);
    expect(read.pages[1]!.annotations.map((a) => a.dest)).toEqual([3, 5, 7, 8]);

    await page.getByTestId('opt-after').fill('0');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 page added at the start, 9 in all');
    expect(markers((await saved(page)).read, 'Report|Payslip')).toEqual([1, 1, 2, 3, 4, 5, 6, 7, 8]);

    await page.getByTestId('opt-after').fill('99');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 page added at the end, 9 in all');
    expect(markers((await saved(page)).read, 'Report|Payslip')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1]);
  });

  test('two blank pages after the landscape chart are landscape too', async ({ page }) => {
    await openTool(page, 'insert-pages');
    await pick(page, [await report()]);
    await page.getByTestId('opt-blank-count').fill('2');
    await expect(page.getByTestId('opt-what-blank')).toBeChecked();
    await page.getByTestId('opt-after').fill('7');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 blank pages added after page 7, 10 in all');
    const { read } = await saved(page);
    expect(read.pages.map((p) => `${p.width}x${p.height}`).slice(6, 9)).toEqual(['841.89x595.28', '841.89x595.28', '841.89x595.28']);
    expect(read.pages[7]!.text).toBe('');
    expect(read.labels).toEqual(['i', 'ii', '1', '2', '3', '4', '5', '6', '7', '8']);
  });

  test('the signed page replaces page 4 of the lease, and the old fields go with it', async ({ page }) => {
    await openTool(page, 'insert-pages');
    await pick(page, [await lease(), await slip()]);
    await page.getByTestId('opt-replace').fill('4');
    await expect(page.getByTestId('opt-where-replace')).toBeChecked();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Page 4 replaced with 1 page, 4 in all');
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Lease with pages replaced.pdf');
    const { read } = await saved(page);
    expect(markers(read, 'Lease|Payslip')).toEqual([1, 2, 3, 1]);
    expect(read.pages[3]!.text).toContain('Payslip for September 2026');
    expect(read.formFields).toEqual([]);
    expect(read.title).toBe('Leave and Licence Agreement');
  });
});

// ---------------------------------------------------------------- Crop

test.describe('crop', () => {
  test('trim 10 mm from every edge, then only pages 2-3', async ({ page }) => {
    await openTool(page, 'crop');
    await pick(page, [await report()]);
    await expect(page.getByTestId('opt-crop-trim')).toBeChecked();
    await expect(page.getByTestId('opt-real-size')).toBeHidden();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('10 mm trimmed from every edge of 8 pages');
    const all = (await saved(page)).read;
    const less = 595.28 - (20 * 72) / 25.4;
    for (const p of all.pages) expect(Math.min(p.width, p.height)).toBeCloseTo(less, 1);
    expect(markers(all, 'Report')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(outlineLines(all.outline)).toEqual(REPORT_OUTLINE);

    await page.getByTestId('opt-pages').fill('2-3');
    await page.getByTestId('opt-mm').fill('12.5');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('12.5 mm trimmed from every edge of pages 2-3');
    const some = (await saved(page)).read;
    expect(some.pages.map((p) => Math.round(p.width))).toEqual([595, Math.round(595.28 - (25 * 72) / 25.4), Math.round(595.28 - (25 * 72) / 25.4), 595, 595, 595, 842, 595]);
  });

  test('each edge on its own, as the page is seen, on a scan stored sideways', async ({ page }) => {
    await openTool(page, 'crop');
    await pick(page, [{ name: 'Sideways.pdf', bytes: await sidewaysScanPdf() }]);
    await page.getByTestId('opt-edge-top').fill('20');
    await expect(page.getByTestId('opt-crop-edges')).toBeChecked();
    await page.getByTestId('opt-edge-right').fill('0');
    await page.getByTestId('opt-edge-bottom').fill('0');
    await page.getByTestId('opt-edge-left').fill('10');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('20 mm off the top, 0 mm right, 0 mm bottom and 10 mm left of 2 pages');
    const { read } = await saved(page);
    const mm = 72 / 25.4;
    // Seen landscape: 841.89 wide less 10 mm, 595.28 high less 20 mm.
    expect(read.pages[0]!.width).toBeCloseTo(841.89 - 10 * mm, 1);
    expect(read.pages[0]!.height).toBeCloseTo(595.28 - 20 * mm, 1);
    expect(read.pages[0]!.rotation).toBe(90);
    for (const id of ['top', 'right', 'bottom', 'left']) await page.getByTestId(`opt-edge-${id}`).fill('0');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type a margin for at least one edge.');
  });

  test('removing the white margins trims the payslip to its ink, and a card with none is told so', async ({ page }) => {
    await openTool(page, 'crop');
    await pick(page, [await slip(), { name: 'ID card.pdf', bytes: await idCardScanPdf() }]);
    await page.getByTestId('opt-crop-auto').check();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('White margins removed from 1 page');
    await expect(page.getByTestId('failure-item')).toHaveText('ID card.pdf: No white margins to remove: what is on the pages already runs to their edges, or they are blank.');
    const { bytes, read } = await saved(page);
    const crop = (await PDFDocument.load(bytes, { updateMetadata: false })).getPage(0).getCropBox();
    expect(crop.x).toBeGreaterThan(30);
    expect(crop.x).toBeLessThan(40);
    expect(crop.x + crop.width).toBeGreaterThan(555);
    expect(crop.x + crop.width).toBeLessThan(565);
    expect(read.pages[0]!.text).toContain('Net pay Rs. 62,250.00');
  });

  test('fit to A4 keeps notes, links and the filled field; a card can stay card-sized; Letter too', async ({ page }) => {
    await openTool(page, 'crop');
    await pick(page, [{ name: 'Annotated.pdf', bytes: await annotatedPdf() }, { name: 'ID card.pdf', bytes: await idCardScanPdf() }]);
    await page.getByTestId('opt-crop-a4').check();
    await expect(page.getByTestId('opt-real-size')).toBeVisible();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(['1 page put on A4', '1 page put on A4']);
    const annotated = (await saved(page, 0)).read;
    expect([annotated.pages[0]!.width, annotated.pages[0]!.height]).toEqual([595.28, 841.89]);
    expect(annotated.pages[0]!.annotations.map((a) => a.subtype)).toEqual(['Highlight', 'Text', 'Link', 'Widget']);
    expect(annotated.fields).toEqual({ tenant_name: 'Farhan Ali' });
    expect(annotated.pages[0]!.text).toContain('Please check the rent clause again.');
    const bigCard = await saved(page, 1);
    expect([bigCard.read.pages[0]!.width, bigCard.read.pages[0]!.height]).toEqual([841.89, 595.28]);

    await page.getByTestId('opt-real-size').check();
    await run(page);
    await expect(page.getByTestId('result-detail').nth(1)).toHaveText('1 page put on A4, smaller pages at their real size');
    // The card is drawn at its own 85.6 × 54 mm in the middle of the sheet: the ink sits in a small box.
    const realCard = await saved(page, 1);
    expect([realCard.read.pages[0]!.width, realCard.read.pages[0]!.height]).toEqual([841.89, 595.28]);
    expect(new TextDecoder('latin1').decode(realCard.bytes)).not.toContain('/EmbeddedPdfPage');

    await page.getByTestId('opt-crop-letter').check();
    await run(page);
    await expect(page.getByTestId('result-item').first()).toHaveAttribute('data-name', 'Annotated on Letter.pdf');
    const letter = (await saved(page, 0)).read;
    expect([letter.pages[0]!.width, letter.pages[0]!.height]).toEqual([612, 792]);
  });
});

// ---------------------------------------------------------------- Bookmarks

test.describe('bookmarks', () => {
  test('rename, delete, add and nest: the rest keep where they open, and the web link stays a web link', async ({ page }) => {
    await openTool(page, 'bookmarks');
    await pick(page, [await report()]);
    await expect(page.getByTestId('bookmark-list').locator('li')).toHaveCount(9);
    await expect(page.getByTestId('bookmark-page-8')).toHaveValue('');
    await expect(page.getByTestId('bookmark-page-8')).toHaveAttribute('placeholder', 'Link');
    await expect(page.getByTestId('bookmark-title-3')).toHaveValue('1.1 Highlights');

    await page.getByTestId('bookmark-title-2').fill('Overview of the year');
    await page.getByTestId('bookmark-delete-1').click();
    await expect(page.getByTestId('bookmark-list').locator('li')).toHaveCount(8);
    await page.getByTestId('bookmark-add').click();
    await page.getByTestId('bookmark-title-8').fill('Board of directors');
    await expect(page.getByTestId('bookmark-page-8')).toHaveValue('8');
    // Up above the web link, then in under the appendix.
    await page.getByTestId('bookmark-up-8').click();
    await page.getByTestId('bookmark-in-7').click();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText("9 bookmarks, ready in any reader's side panel");
    const { read } = await saved(page);
    expect(outlineLines(read.outline)).toEqual([
      'Cover→1',
      'Overview of the year→3',
      '  1.1 Highlights→4',
      '2 Finances→5',
      '  2.1 Table of accounts→6',
      '3 Outlook→7',
      'Appendix→8',
      '  Board of directors→8',
      'Society website→https://example.org/coir',
    ]);
    expect(read.outline[1]!.kind).toBe('XYZ');
    expect(read.outline.find((o) => o.title === '2 Finances')!.open).toBe(false);
    expect(read.outline.find((o) => o.title === 'Appendix')!.items[0]!.kind).toBe('Fit');
  });

  test('a file with none: add the first, a page past the end is caught, and an empty title is caught', async ({ page }) => {
    await openTool(page, 'bookmarks');
    await pick(page, [await slip()]);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Add a bookmark first.');
    await page.getByTestId('bookmark-add').click();
    await page.getByTestId('bookmark-page-0').fill('3');
    await expect(page.locator('.run__note')).toHaveText('Bookmark 1 needs a page between 1 and 1.');
    await page.getByTestId('bookmark-page-0').fill('1');
    await page.getByTestId('bookmark-title-0').fill('  ');
    await expect(page.locator('.run__note')).toHaveText('Bookmark 1 needs a title.');
    await page.getByTestId('bookmark-title-0').fill('Net pay');
    await run(page);
    expect(outlineLines((await saved(page)).read.outline)).toEqual(['Net pay→1']);
  });

  test('saving an empty list takes every bookmark out', async ({ page }) => {
    await openTool(page, 'bookmarks');
    await pick(page, [await report()]);
    for (let i = 8; i >= 0; i--) await page.getByTestId(`bookmark-delete-${i}`).click();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Every bookmark removed');
    expect((await saved(page)).read.outline).toEqual([]);
  });
});

// ---------------------------------------------------------------- Page labels

test.describe('page labels', () => {
  test('front pages I, II then A-1 onwards in letters; then removed', async ({ page }) => {
    await openTool(page, 'page-labels');
    await pick(page, [{ name: 'Thesis.pdf', bytes: await pagesPdf(6) }, await slip()]);
    await page.getByTestId('opt-front').fill('2');
    await page.getByTestId('opt-front-style').selectOption('Roman');
    await page.getByTestId('opt-style').selectOption('Alpha');
    await page.getByTestId('opt-start').fill('3');
    await page.getByTestId('opt-prefix').fill('App-');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(['Pages labelled I to II, then App-C to App-F', 'Page labelled I']);
    const thesis = await saved(page, 0);
    expect(thesis.read.labels).toEqual(['I', 'II', 'App-C', 'App-D', 'App-E', 'App-F']);

    await page.getByTestId('opt-mode-remove').check();
    await run(page);
    await expect(page.getByTestId('result-detail').first()).toHaveText('Page labels removed: readers show plain page numbers');
    expect((await saved(page, 0)).read.labels).toBeNull();
  });

  test('the defaults give i, ii and 1, 2, 3; nonsense numbers stop the run', async ({ page }) => {
    await openTool(page, 'page-labels');
    await pick(page, [await report()]);
    await page.getByTestId('opt-front').fill('-1');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type how many front pages, or 0 for none.');
    await page.getByTestId('opt-front').fill('3');
    await page.getByTestId('opt-start').fill('0');
    await expect(page.locator('.run__note')).toHaveText('The first number must be 1 or more.');
    await page.getByTestId('opt-start').fill('1');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Pages labelled i to iii, then 1 to 5');
    const { read } = await saved(page);
    expect(read.labels).toEqual(['i', 'ii', 'iii', '1', '2', '3', '4', '5']);
    expect(outlineLines(read.outline)).toEqual(REPORT_OUTLINE);
  });
});

// ---------------------------------------------------------------- Split by size

test.describe('split by size', () => {
  test('a 4.9 MB album into parts under 2 MB, in page order, each really under; a small file is told so', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'The sizing is the same on both; once is enough for a slow test.');
    test.setTimeout(120_000);
    await openTool(page, 'split-by-size');
    const album = await photoAlbumPdf(6, 520);
    expect(album.length).toBeGreaterThan(4_800_000);
    await pick(page, [{ name: 'Wedding album.pdf', bytes: album }]);
    await page.getByTestId('opt-megabytes').fill('2');
    await expect(page.getByTestId('opt-size-custom')).toBeChecked();
    await run(page);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(3);
    await expect(page.getByTestId('result-detail')).toHaveText([/^1\.\d MB, pages 1-2$/, /^1\.\d MB, pages 3-4$/, /^1\.\d MB, pages 5-6$/]);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { name, bytes, read } = await saved(page, i);
      expect(name).toBe(`Wedding album part ${i + 1}.pdf`);
      expect(bytes.length).toBeLessThanOrEqual(2_000_000);
      expect(Number(await items.nth(i).getAttribute('data-size'))).toBe(bytes.length);
      seen.push(...(markers(read, 'Album') as number[]));
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6]);

    await page.getByTestId('opt-size-5').check();
    await run(page);
    await expect(page.getByTestId('failure-item')).toHaveText('Wedding album.pdf: This file is already under 5 MB (4.9 MB), so there is nothing to split.');
  });

  test('a page bigger than the limit is a part of its own, and says so', async ({ page }) => {
    await openTool(page, 'split-by-size');
    await pick(page, [{ name: 'Album.pdf', bytes: await photoAlbumPdf(3, 700) }]);
    await page.getByTestId('opt-megabytes').fill('1');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText([/^1\.\d MB, page 1, bigger than 1 MB on its own$/, /^1\.\d MB, page 2, bigger than 1 MB on its own$/, /^1\.\d MB, page 3, bigger than 1 MB on its own$/]);
  });
});

// ---------------------------------------------------------------- The phone

test.describe('on a phone', () => {
  test('the pinned button sits under the thumb, in view and on top, and nothing scrolls sideways', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'Phone layout.');
    for (const id of ['merge', 'split', 'organise', 'extract-pages', 'insert-pages', 'crop', 'bookmarks', 'page-labels', 'split-by-size'] as const) {
      await openTool(page, id);
      const files = id === 'merge' || id === 'insert-pages' ? [await report(), await slip()] : [await report()];
      await pick(page, files);
      if (id === 'extract-pages') await page.getByTestId('opt-pages').fill('1-2');
      if (id === 'split-by-size') await page.getByTestId('opt-megabytes').fill('1');
      const button = page.getByTestId('run-button');
      await expect(button).toBeEnabled();
      const box = await button.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box, id).not.toBeNull();
      expect(box!.y + box!.height, `${id}: the button is in view`).toBeLessThanOrEqual(viewport.height);
      expect(box!.y, `${id}: the button is in view`).toBeGreaterThanOrEqual(0);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      const onTop = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit === el || el.contains(hit);
      });
      expect(onTop, `${id}: nothing covers the button`).toBe(true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${id}: no sideways scroll`).toBeLessThanOrEqual(0);
      if (id === 'merge' || id === 'crop' || id === 'bookmarks') {
        await button.tap();
        await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('result-item').first()).toBeVisible();
        const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(after, `${id}: no sideways scroll after the result`).toBeLessThanOrEqual(0);
      }
    }
  });
});
