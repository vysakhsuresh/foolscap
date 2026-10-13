/**
 * The Convert family, driven the way a person drives it, with the documents
 * people bring: a report with headings, a table and a photo; a salary slip;
 * a lease; a bank statement; phone photos of every shape; a Word letter and
 * an Excel budget written the way Office writes them. Every option is
 * chosen, every result is downloaded, and what is inside is checked: the
 * words, the numbers, the pages and their order, where things landed on the
 * page, the sizes, and that the result says what really happened.
 *
 * The option-by-option checks run on the laptop; the main flow of each tool
 * also runs at 360px on the phone project.
 */
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encryptedPdf, pagesPdf, pdfInfo, rotatedPdf } from '../fixtures/pdfs';
import { near, openPdf, pagePixels, pdfTexts, pixelsOf, sheetRows, unzipParts, xmlParagraphs } from '../fixtures/inspect';
import {
  RED_GIF,
  bmp,
  fakeHeic,
  heavyReportPdf,
  householdXlsx,
  leasePdf,
  photo,
  photoAlbumPdf,
  reportPdf,
  salarySlipPdf,
  sidewaysPhonePhoto,
  sitePlanPdf,
  slidesPdf,
  storedOddlyPdf,
  wordLetterDocx,
} from '../fixtures/realistic';
import { bankStatementPdf } from '../fixtures/statement';
import { collectErrors, downloadFrom, openTool, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

const laptopOnly = (project: string) => test.skip(project === 'phone', 'Every option is checked on the laptop; the phone runs the main flows.');

interface Pick {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly type?: string;
}

async function pickOnly(page: Page, files: readonly Pick[]): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files.map((f) => ({ name: f.name, mimeType: f.type ?? 'application/pdf', buffer: Buffer.from(f.bytes) })));
  await expect(page.getByTestId('file-item')).toHaveCount(files.length);
}

async function pick(page: Page, files: readonly Pick[]): Promise<void> {
  await pickOnly(page, files);
  // Each PDF is opened for its page count before the run button wakes up.
  await expect(page.getByTestId('run-button')).toBeEnabled({ timeout: 20_000 });
}

async function runTool(page: Page, timeout = 60_000): Promise<void> {
  const button = page.getByTestId('run-button');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout });
}

async function save(page: Page, index = 0): Promise<{ name: string; bytes: Uint8Array }> {
  return downloadFrom(page, page.getByTestId('save-button').nth(index));
}

const KB = 1000;

// =====================================================================
// Compress
// =====================================================================

test.describe('compress', () => {
  test('balanced makes a photo-heavy report much smaller, keeps its words and photos, and says how much', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await openTool(page, 'compress');
    const input = await heavyReportPdf();
    await expect(page.getByTestId('opt-level-balanced')).toBeChecked();
    await pick(page, [{ name: 'Site visit.pdf', bytes: input }]);
    await runTool(page, 90_000);
    const item = page.getByTestId('result-item');
    await expect(item).toHaveAttribute('data-name', 'Site visit (compressed).pdf');
    await expect(item).toHaveAttribute('data-pages', '2');
    const detail = await page.getByTestId('result-detail').textContent();
    expect(detail).toMatch(/2\.3 MB → .*, \d+% smaller, 2 photos made lighter/);
    const { bytes } = await save(page);
    expect(bytes.length).toBeLessThan(input.length * 0.5);
    // The result says the size it really is.
    const said = Number(/(\d+)% smaller/.exec(detail ?? '')?.[1]);
    expect(Math.abs(said - Math.round((1 - bytes.length / input.length) * 100))).toBeLessThanOrEqual(1);
    const texts = await pdfTexts(bytes);
    expect(texts[0]).toContain('Site visit, day 1');
    expect(texts[1]).toContain('The new pipeline runs along the canal');
    // The photo is still where it was, red band on top.
    const pixels = await pagePixels(bytes, 1, 400);
    expect(near(pixels.at(0.5, 1 - (380 + 320 - 8) / 841.89), [208, 16, 16], 60)).toBe(true);
    expect(errors.pageErrors).toEqual([]);
  });

  test('light, balanced and strong each squeeze harder than the one before', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(180_000);
    const input = await heavyReportPdf();
    const sizes: number[] = [];
    for (const level of ['light', 'balanced', 'strong'] as const) {
      await openTool(page, 'compress');
      await page.getByTestId(`opt-level-${level}`).check();
      await pick(page, [{ name: 'Visit.pdf', bytes: input }]);
      await runTool(page, 90_000);
      const { bytes } = await save(page);
      sizes.push(bytes.length);
      expect((await pdfTexts(bytes))[0]).toContain('Site visit, day 1');
    }
    expect(sizes[0]!).toBeLessThan(input.length);
    expect(sizes[1]!).toBeLessThan(sizes[0]!);
    expect(sizes[2]!).toBeLessThan(sizes[1]!);
  });

  test('to a size: under 100 KB with the words kept, and the result really is under it', async ({ page }) => {
    test.setTimeout(150_000);
    await openTool(page, 'compress');
    await page.getByTestId('opt-level-target').check();
    await page.getByTestId('opt-target-100').check();
    await pick(page, [{ name: 'Visit.pdf', bytes: await heavyReportPdf() }]);
    await runTool(page, 120_000);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Visit (under 100 KB).pdf');
    await expect(page.getByTestId('result-detail')).toContainText('under 100 KB; text untouched');
    const { bytes } = await save(page);
    expect(bytes.length).toBeLessThanOrEqual(100 * KB);
    expect((await pdfTexts(bytes))[1]).toContain('The new pipeline runs along the canal');
  });

  test('to a size the words cannot fit: says so and hands back nothing, and with pictures allowed gets there and says the words are now pictures', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(180_000);
    const plan = await sitePlanPdf();
    await openTool(page, 'compress');
    await page.getByTestId('opt-level-target').check();
    await page.getByTestId('opt-target-custom').check();
    // Too small to type: the button stays asleep and says why.
    await page.getByTestId('opt-target-kb').fill('5');
    await pickOnly(page, [{ name: 'Site plan.pdf', bytes: plan }]);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type a size of at least 10 KB.');
    await page.getByTestId('opt-target-kb').fill('200');
    await runTool(page, 120_000);
    await expect(page.getByTestId('result-item')).toHaveCount(0);
    await expect(page.getByTestId('failure-item')).toContainText('Site plan.pdf: This file is already as small as it gets with its words kept as text');
    await expect(page.getByTestId('failure-item')).toContainText('tick "Let pages become pictures"');
    // Now let the page become a picture.
    await page.getByTestId('opt-allow-pictures').check();
    await runTool(page, 120_000);
    await expect(page.getByTestId('result-detail')).toContainText('under 200 KB; pages are now pictures at');
    const { bytes, name } = await save(page);
    expect(name).toBe('Site plan (under 200 KB).pdf');
    expect(bytes.length).toBeLessThanOrEqual(200 * KB);
    expect((await pdfInfo(bytes)).pageCount).toBe(1);
    // The words are pictures now: none to select.
    expect((await pdfTexts(bytes))[0]).toBe('');
    // The drawing is still there: blue lines all over the middle of the page.
    const pixels = await pagePixels(bytes, 0, 400);
    let blue = 0;
    for (let y = 0.3; y < 0.7; y += 0.02) for (let x = 0.2; x < 0.8; x += 0.02) if (pixels.at(x, y)[2] > pixels.at(x, y)[0] + 30) blue++;
    expect(blue).toBeGreaterThan(50);
  });

  test('a file already under the size is left alone, and a locked file stays locked with its password', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(120_000);
    await openTool(page, 'compress');
    await page.getByTestId('opt-level-target').check();
    await page.getByTestId('opt-target-500').check();
    await pick(page, [{ name: 'Small.pdf', bytes: await pagesPdf(2) }]);
    await runTool(page);
    await expect(page.getByTestId('failure-item')).toContainText('Small.pdf: This file is already');
    await expect(page.getByTestId('failure-item')).toContainText('under 500 KB. Nothing to do.');

    // A locked photo-heavy file: unlocked to work on, locked again with the same password.
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(await heavyReportPdf(), { updateMetadata: false });
    doc.encrypt({ userPassword: 'chai', ownerPassword: 'chai-owner' });
    const locked = new Uint8Array(await doc.save());
    await openTool(page, 'compress');
    await page.getByTestId('file-input').setInputFiles([{ name: 'Locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(locked) }]);
    await page.getByTestId('file-password').fill('chai');
    await page.getByTestId('file-unlock').click();
    await runTool(page, 90_000);
    await expect(page.getByTestId('result-detail')).toContainText('still locked with the same password');
    const { bytes } = await save(page);
    expect(bytes.length).toBeLessThan(locked.length);
    expect((await pdfInfo(bytes)).encrypted).toBe(true);
    expect((await pdfTexts(bytes, 'chai'))[0]).toContain('Site visit, day 1');
    await expect(openPdf(bytes)).rejects.toThrow();
  });
});

// =====================================================================
// PDF to images
// =====================================================================

test.describe('pdf to images', () => {
  test('every page as a PNG at 150 dpi, in order, the right size, the photo on page 2', async ({ page }) => {
    test.setTimeout(90_000);
    await openTool(page, 'pdf-to-images');
    await expect(page.getByTestId('opt-format-png')).toBeChecked();
    await expect(page.getByTestId('opt-dpi-150')).toBeChecked();
    await pick(page, [{ name: 'Report.pdf', bytes: (await reportPdf()).bytes }]);
    await runTool(page);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveAttribute('data-name', 'Report page 1.png');
    await expect(items.nth(2)).toHaveAttribute('data-name', 'Report page 3.png');
    await expect(page.getByTestId('result-detail').nth(1)).toContainText('Page 2 as a 150 dpi PNG');
    const second = await pixelsOf((await save(page, 1)).bytes);
    // A4 at 150 dpi: 1240 × 1754.
    expect(second.width).toBe(1240);
    expect(Math.abs(second.height - 1754)).toBeLessThanOrEqual(1);
    // The photo's red band sits an eighth of the way down page 2, and not on page 1.
    expect(near(second.at(0.5, 118 / 841.89), [208, 16, 16], 60)).toBe(true);
    const first = await pixelsOf((await save(page, 0)).bytes);
    expect(near(first.at(0.5, 118 / 841.89), [208, 16, 16], 60)).toBe(false);
    // Save all: one zip with all three, by name.
    const zip = await downloadFrom(page, page.getByTestId('save-all-button'));
    expect(zip.name).toBe('PDF to images.zip');
    expect(Object.keys(unzipSync(zip.bytes)).sort()).toEqual(['Report page 1.png', 'Report page 2.png', 'Report page 3.png']);
  });

  test('JPEG, 72 and 300 dpi, a page range, a sideways page, and a range past the end', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(120_000);
    await openTool(page, 'pdf-to-images');
    await page.getByTestId('opt-format-jpeg').check();
    await page.getByTestId('opt-dpi-300').check();
    await page.getByTestId('opt-pages').fill('3');
    await pick(page, [{ name: 'Report.pdf', bytes: (await reportPdf()).bytes }]);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveCount(1);
    await expect(page.getByTestId('result-detail')).toContainText('Page 3 as a 300 dpi JPEG');
    const big = await save(page);
    expect(big.name).toBe('Report page 3.jpg');
    expect([big.bytes[0], big.bytes[1]]).toEqual([0xff, 0xd8]);
    expect((await pixelsOf(big.bytes)).width).toBe(2480);

    // A page stored sideways comes out the way a reader shows it: wider than tall.
    await page.getByTestId('start-over').click();
    await page.getByTestId('opt-dpi-72').check();
    await page.getByTestId('opt-pages').fill('2-');
    await pick(page, [{ name: 'Turned.pdf', bytes: await rotatedPdf([0, 90]) }]);
    await runTool(page);
    const turned = await pixelsOf((await save(page)).bytes);
    expect(turned.width).toBe(400);
    expect(turned.height).toBe(310);

    await page.getByTestId('start-over').click();
    await page.getByTestId('opt-pages').fill('9-12');
    await pick(page, [{ name: 'Short.pdf', bytes: await pagesPdf(3) }]);
    await runTool(page);
    await expect(page.getByTestId('failure-item')).toContainText('Type the pages, like 1-3, 7, 12-');
  });

  test('Then… hands the pictures to Images to PDF, which puts them back together in order', async ({ page }) => {
    test.setTimeout(120_000);
    await openTool(page, 'pdf-to-images');
    await page.getByTestId('opt-dpi-72').check();
    await pick(page, [{ name: 'Notes.pdf', bytes: await pagesPdf(3) }]);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveCount(3);
    await page.getByTestId('then-menu').click();
    await page.getByTestId('then-images-to-pdf').click();
    await page.waitForURL('**/tools/images-to-pdf/');
    await expect(page.getByTestId('file-item')).toHaveCount(3);
    await expect(page.getByTestId('file-item').first()).toContainText('Notes page 1.png');
    await page.getByTestId('opt-paper-fit').check();
    await page.getByTestId('opt-margin-none').check();
    await runTool(page);
    const { bytes, name } = await save(page);
    expect(name).toBe('Notes page 1 and 2 more.pdf');
    const info = await pdfInfo(bytes);
    expect(info.pageCount).toBe(3);
    // Pages kept their order: each is a little wider than the one before (300, 310, 320 points across).
    const ratios = info.sizes.map(([w, h]) => w / h);
    expect(ratios[0]!).toBeLessThan(ratios[1]!);
    expect(ratios[1]!).toBeLessThan(ratios[2]!);
  });
});

// =====================================================================
// Extract images
// =====================================================================

test.describe('extract images', () => {
  test('saves the JPEG byte for byte, the lossless one as PNG, and decodes palette, CMYK and one-bit pictures too', async ({ page }) => {
    test.setTimeout(90_000);
    await openTool(page, 'extract-images');
    const album = await photoAlbumPdf();
    await pick(page, [{ name: 'Album.pdf', bytes: album.bytes }]);
    await runTool(page);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveAttribute('data-name', 'Album image 1 (page 1).jpg');
    await expect(page.getByTestId('result-detail').nth(0)).toContainText('640 × 480 JPEG');
    const jpeg = await save(page, 0);
    expect(Buffer.compare(Buffer.from(jpeg.bytes), Buffer.from(album.jpeg))).toBe(0);
    const png = await save(page, 1);
    expect(png.name).toBe('Album image 2 (page 1).png');
    const pixels = await pixelsOf(png.bytes);
    expect([pixels.width, pixels.height]).toEqual([300, 200]);
    expect(near(pixels.at(0.5, 0.02), [208, 16, 16])).toBe(true);
    expect(near(pixels.at(0.02, 0.5), [16, 48, 208])).toBe(true);

    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('result')).toHaveCount(0);
    await pick(page, [{ name: 'Odd.pdf', bytes: await storedOddlyPdf() }]);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveCount(3);
    await expect(page.getByTestId('failure-item')).toHaveCount(0);
    await expect(page.getByTestId('result-detail').first()).toContainText('60 × 40 PNG, 1 KB, from page 1, decoded as a reader shows it');
    const logo = await pixelsOf((await save(page, 0)).bytes);
    expect(near(logo.at(0.1, 0.5), [255, 0, 0], 10)).toBe(true);
    expect(near(logo.at(0.9, 0.5), [255, 255, 255], 10)).toBe(true);
    const print = await pixelsOf((await save(page, 1)).bytes);
    expect(print.at(0.5, 0.5)[0]).toBeLessThan(60);
    expect(print.at(0.5, 0.5)[2]).toBeGreaterThan(180);
    const scan = await pixelsOf((await save(page, 2)).bytes);
    expect(near(scan.at(0.5, 0.2), [0, 0, 0], 10)).toBe(true);
    expect(near(scan.at(0.5, 0.8), [255, 255, 255], 10)).toBe(true);
  });

  test('a PDF with no pictures says so in words', async ({ page }, info) => {
    laptopOnly(info.project.name);
    await openTool(page, 'extract-images');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf() }]);
    await runTool(page);
    await expect(page.getByTestId('failure-item')).toContainText('Lease.pdf: This PDF has no images that can be saved on their own.');
  });
});

// =====================================================================
// Images to PDF
// =====================================================================

const PHOTOS: readonly Pick[] = [
  { name: 'Upright.jpg', bytes: sidewaysPhonePhoto(), type: 'image/jpeg' },
  { name: 'Wide.jpg', bytes: photo(1600, 1000), type: 'image/jpeg' },
  { name: 'Sticker.png', bytes: photo(400, 600, { format: 'png', transparent: true }), type: 'image/png' },
  { name: 'Shared.webp', bytes: photo(600, 800, { format: 'webp' }), type: 'image/webp' },
  { name: 'Scanner.bmp', bytes: bmp(300, 400), type: 'image/bmp' },
  { name: 'Dot.gif', bytes: RED_GIF, type: 'image/gif' },
];

test.describe('images to pdf', () => {
  test('six kinds of picture, one to a page on A4 in the order listed, a phone photo the right way up', async ({ page }) => {
    test.setTimeout(120_000);
    await openTool(page, 'images-to-pdf');
    await expect(page.getByTestId('opt-paper-a4')).toBeChecked();
    await expect(page.getByTestId('opt-margin-small')).toBeChecked();
    await pick(page, PHOTOS);
    await runTool(page, 90_000);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Upright and 5 more.pdf');
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-pages', '6');
    await expect(page.getByTestId('result-detail')).toHaveText('6 images, one to a page, on A4');
    const { bytes } = await save(page);
    const info = await pdfInfo(bytes);
    // The wide photo gets a sideways page; the rest are upright.
    expect(info.sizes.map(([w, h]) => (w > h ? 'wide' : 'tall'))).toEqual(['tall', 'wide', 'tall', 'tall', 'tall', 'tall']);
    for (const [w, h] of info.sizes) expect([Math.round(Math.min(w, h)), Math.round(Math.max(w, h))]).toEqual([595, 842]);
    // The phone held upright: red band on top, blue on the left, once turned the way EXIF says.
    const upright = await pagePixels(bytes, 0, 300);
    const top = upright.at(0.5, (18 + 2) / 841.89 + (841.89 - 36 - (595.28 - 36) * (800 / 600)) / 2 / 841.89);
    expect(near(top, [208, 16, 16], 60)).toBe(true);
    // The margin stays paper white.
    expect(near(upright.at(0.5, 4 / 841.89), [255, 255, 255], 8)).toBe(true);
    // Transparent parts come out as paper, not black.
    const sticker = await pagePixels(bytes, 2, 300);
    expect(near(sticker.at(0.5, 0.5), [255, 255, 255], 8)).toBe(true);
    // BMP and GIF were read, not skipped.
    expect(near((await pagePixels(bytes, 4, 300)).at(0.5, 0.1), [208, 16, 16], 40)).toBe(true);
    expect(near((await pagePixels(bytes, 5, 300)).at(0.5, 0.5), [255, 0, 0], 40)).toBe(true);
  });

  test('page the shape of each image, Letter with a large margin, and the order changed with the arrows', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(120_000);
    await openTool(page, 'images-to-pdf');
    await page.getByTestId('opt-paper-fit').check();
    await page.getByTestId('opt-margin-none').check();
    await pick(page, PHOTOS.slice(0, 2));
    // Move the wide one up: it goes first.
    await page.getByTestId('file-move-up').nth(1).click();
    await expect(page.getByTestId('file-item').first()).toContainText('Wide.jpg');
    await runTool(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 images, one to a page, each page the shape of its image');
    const fit = await pdfInfo((await save(page)).bytes);
    expect(fit.sizes[0]!.map(Math.round)).toEqual([842, Math.round((842 * 1000) / 1600)]);
    expect(fit.sizes[1]!.map(Math.round)).toEqual([Math.round((842 * 600) / 800), 842]);

    await page.getByTestId('start-over').click();
    await page.getByTestId('opt-paper-letter').check();
    await page.getByTestId('opt-margin-large').check();
    await pick(page, [PHOTOS[3]!]);
    await runTool(page);
    const { bytes, name } = await save(page);
    expect(name).toBe('Shared.pdf');
    expect((await pdfInfo(bytes)).sizes[0]).toEqual([612, 792]);
    // 36 points of margin all round: white at 30 points in from the left, picture at 40.
    const pixels = await pagePixels(bytes, 0, 612);
    expect(near(pixels.at(30 / 612, 0.5), [255, 255, 255], 8)).toBe(true);
    expect(near(pixels.at(40 / 612, 0.5), [16, 48, 208], 60)).toBe(true);
  });

  test('a separate PDF for each image, and an iPhone HEIC photo turned away in words while the rest go through', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(120_000);
    await openTool(page, 'images-to-pdf');
    await page.getByTestId('opt-separate').check();
    await pick(page, [PHOTOS[0]!, { name: 'IMG_0042.HEIC', bytes: fakeHeic(), type: 'image/heic' }, PHOTOS[4]!]);
    await runTool(page, 90_000);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-name', 'Upright.pdf');
    await expect(items.nth(1)).toHaveAttribute('data-name', 'Scanner.pdf');
    await expect(page.getByTestId('failure-item')).toContainText("IMG_0042.HEIC: This browser can't read iPhone HEIC photos");
    for (const i of [0, 1]) expect((await pdfInfo((await save(page, i)).bytes)).pageCount).toBe(1);
  });
});

// =====================================================================
// Pages per sheet
// =====================================================================

/** Where each page number is on a sheet: the x and y of its baseline, by the number printed. */
async function numbersOn(bytes: Uint8Array, sheet: number): Promise<Map<string, { x: number; y: number }>> {
  const view = await openPdf(bytes);
  try {
    const layout = await view.layout(sheet);
    return new Map(layout.items.filter((i) => /^\d+$/.test(i.str.trim())).map((i) => [i.str.trim(), { x: i.x / layout.width, y: i.y / layout.height }]));
  } finally {
    await view.close();
  }
}

test.describe('pages per sheet', () => {
  test('two upright pages side by side on a sideways A4, in order, the last sheet half full', async ({ page }) => {
    test.setTimeout(90_000);
    await openTool(page, 'n-up');
    await expect(page.getByTestId('opt-per-sheet-2')).toBeChecked();
    await pick(page, [{ name: 'Notes.pdf', bytes: await pagesPdf(5) }]);
    await runTool(page);
    await expect(page.getByTestId('result-detail')).toHaveText('5 pages on 3 sheets of A4 turned sideways');
    const { bytes, name } = await save(page);
    expect(name).toBe('Notes 2-up.pdf');
    const info = await pdfInfo(bytes);
    expect(info.sizes).toEqual([
      [841.89, 595.28],
      [841.89, 595.28],
      [841.89, 595.28],
    ]);
    const one = await numbersOn(bytes, 0);
    expect([...one.keys()].sort()).toEqual(['1', '2']);
    expect(one.get('1')!.x).toBeLessThan(0.5);
    expect(one.get('2')!.x).toBeGreaterThan(0.5);
    expect([...(await numbersOn(bytes, 2)).keys()]).toEqual(['5']);
  });

  test('four on Letter across then down; slides stacked on an upright sheet; six, eight, nine and sixteen', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(180_000);
    await openTool(page, 'n-up');
    await page.getByTestId('opt-per-sheet-4').check();
    await page.getByTestId('opt-paper-letter').check();
    await pick(page, [{ name: 'Notes.pdf', bytes: await pagesPdf(4) }]);
    await runTool(page);
    const four = (await save(page)).bytes;
    expect((await pdfInfo(four)).sizes).toEqual([[612, 792]]);
    const at = await numbersOn(four, 0);
    expect(at.get('1')!.x).toBeLessThan(0.5);
    expect(at.get('1')!.y).toBeLessThan(0.5);
    expect(at.get('2')!.x).toBeGreaterThan(0.5);
    expect(at.get('2')!.y).toBeLessThan(0.5);
    expect(at.get('3')!.x).toBeLessThan(0.5);
    expect(at.get('3')!.y).toBeGreaterThan(0.5);
    expect(at.get('4')!.x).toBeGreaterThan(0.5);

    // Wide slides two to a sheet: one above the other on an upright page, so they come out bigger.
    await page.getByTestId('start-over').click();
    await page.getByTestId('opt-per-sheet-2').check();
    await page.getByTestId('opt-paper-a4').check();
    await pick(page, [{ name: 'Deck.pdf', bytes: await slidesPdf(4) }]);
    await runTool(page);
    await expect(page.getByTestId('result-detail')).toHaveText('4 pages on 2 sheets of A4');
    const stacked = (await save(page)).bytes;
    expect((await pdfInfo(stacked)).sizes[0]).toEqual([595.28, 841.89]);
    const titles = await pdfTexts(stacked);
    expect(titles[0]!.indexOf('Slide 1')).toBeLessThan(titles[0]!.indexOf('Slide 2'));

    for (const [per, sheets] of [
      ['6', 3],
      ['8', 2],
      ['9', 2],
      ['16', 1],
    ] as const) {
      await page.getByTestId('start-over').click();
      await page.getByTestId(`opt-per-sheet-${per}`).check();
      await pick(page, [{ name: 'Long.pdf', bytes: await pagesPdf(14) }]);
      await runTool(page);
      const out = await save(page);
      expect(out.name).toBe(`Long ${per}-up.pdf`);
      expect((await pdfInfo(out.bytes)).pageCount).toBe(sheets);
      expect([...(await numbersOn(out.bytes, 0)).keys()].map(Number).sort((a, b) => a - b)[0]).toBe(1);
    }
  });
});

// =====================================================================
// Archive copy (PDF/A)
// =====================================================================

test('pdf/a: colour profile, archive details and the PDF/A mark go in, the words stay, the password goes, and the missing fonts are named honestly', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'pdf-a');
  await pick(page, [{ name: 'Report.pdf', bytes: (await reportPdf()).bytes }]);
  await runTool(page);
  await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Report (PDF-A).pdf');
  await expect(page.getByTestId('result-detail')).toContainText('PDF/A-2b archive copy: colour profile and archive details added');
  await expect(page.getByTestId('result-detail')).toContainText('2 fonts the file uses are not inside it');
  const { bytes } = await save(page);
  const raw = Buffer.from(bytes).toString('latin1');
  expect(raw).toContain('/OutputIntents');
  expect(raw).toContain('GTS_PDFA1');
  expect(raw).toMatch(/pdfaid:part\s*=?\s*["'>]?2/);
  expect((await pdfTexts(bytes))[0]).toContain('Annual Report 2025');

  await page.getByTestId('start-over').click();
  await page.getByTestId('file-input').setInputFiles([{ name: 'Locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await encryptedPdf('tea', 2)) }]);
  await page.getByTestId('file-password').fill('tea');
  await page.getByTestId('file-unlock').click();
  await runTool(page);
  await expect(page.getByTestId('result-detail')).toContainText('the password is gone, as archives must open for anyone');
  const open = (await save(page)).bytes;
  expect((await pdfInfo(open)).encrypted).toBe(false);
  expect((await pdfInfo(open)).pageCount).toBe(2);
});

// =====================================================================
// Rent receipts
// =====================================================================

test.describe('rent receipts', () => {
  async function fill(page: Page, values: Record<string, string>): Promise<void> {
    for (const [name, value] of Object.entries(values)) await page.getByTestId(`opt-${name}`).fill(value);
  }

  test('three months paid in cash: one receipt a month, two to a page, amounts in figures and words, the stamp reminder', async ({ page }) => {
    test.setTimeout(90_000);
    await openTool(page, 'rent-receipts');
    // Nothing typed yet: the button says what is missing.
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type the tenant’s name.');
    await fill(page, { tenant: 'Anjali Menon', landlord: 'Joseph Mathew', address: 'Flat 4B, Rose Gardens, Kakkanad, Kochi 682030', rent: '18500', start: '2026-11', months: '3', pan: 'abcpm1234k' });
    await page.getByTestId('opt-mode').selectOption('Cash');
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Rent receipts November 2026 to January 2027.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('3 receipts, November 2026 to January 2027, two to a page on 2 pages: print, sign, and hand them in');
    const { bytes } = await save(page);
    const pages = await pdfTexts(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('November 2026');
    expect(pages[0]).toContain('December 2026');
    expect(pages[1]).toContain('January 2027');
    expect(pages[1]).not.toContain('February');
    for (const text of pages) {
      expect(text).toContain('Anjali Menon');
      expect(text).toContain('Joseph Mathew');
      expect(text).toContain('Rs. 18,500 (Rupees Eighteen Thousand Five Hundred only)');
      expect(text).toContain('ABCPM1234K');
      expect(text).toContain('Affix a revenue stamp here');
      expect(text).toContain('Cash');
    }
    expect(pages.join(' ').match(/RENT RECEIPT/g)).toHaveLength(3);
  });

  test('every field is checked before the run, paise are written in words, and a missing PAN over a lakh a year is pointed out', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(90_000);
    await openTool(page, 'rent-receipts');
    const note = page.locator('.run__note');
    await fill(page, { tenant: 'Anjali Menon' });
    await expect(note).toHaveText('Type the owner’s name.');
    await fill(page, { landlord: 'Joseph Mathew' });
    await expect(note).toHaveText('Type the address.');
    await fill(page, { address: '12 MG Road, Kochi' });
    await expect(note).toHaveText('Type the monthly rent.');
    await fill(page, { rent: '9000.50', months: '25' });
    await expect(note).toHaveText('Choose between 1 and 24 months.');
    await fill(page, { months: '12', pan: 'ABC123' });
    await expect(note).toHaveText('A PAN looks like ABCPK1234F.');
    await fill(page, { pan: '', start: '2026-04' });
    await expect(page.getByTestId('run-button')).toBeEnabled();
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Rent receipts April 2026 to March 2027.pdf');
    await expect(page.getByTestId('result-detail')).toContainText("The rent is over ₹1 lakh a year, so your employer will ask for the owner's PAN");
    const pages = await pdfTexts((await save(page)).bytes);
    expect(pages).toHaveLength(6);
    expect(pages[0]).toContain('Rs. 9,000.50 (Rupees Nine Thousand and Fifty Paise only)');
    expect(pages[0]).toContain('Bank transfer');
    expect(pages[0]).not.toContain('revenue stamp');
    expect(pages[5]).toContain('March 2027');
  });
});

// =====================================================================
// PDF to Word, Excel, EPUB and a web page
// =====================================================================

test.describe('pdf to word', () => {
  test('a report: headings with their numbers, the list, the table, the photo; page numbers and running headers left out', async ({ page }) => {
    test.setTimeout(90_000);
    const report = await reportPdf();
    await openTool(page, 'pdf-to-word');
    await pick(page, [{ name: 'Annual report.pdf', bytes: report.bytes }]);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Annual report.docx');
    await expect(page.getByTestId('result-detail')).toHaveText('Word document: 3 pages, 5 headings, 1 table, 1 picture');
    const parts = unzipParts((await save(page)).bytes);
    const xml = parts.text('word/document.xml');
    const paragraphs = xmlParagraphs(xml);
    const styled = (style: string) => [...xml.matchAll(new RegExp(`<w:p>(?:(?!</w:p>).)*?<w:pStyle w:val="${style}"/>(?:(?!</w:p>).)*?</w:p>`, 'gs'))].map((m) => xmlParagraphs(m[0]).join(''));
    expect(styled('Heading1')).toEqual([report.title]);
    expect(styled('Heading2')).toEqual(report.headings);
    expect(styled('ListParagraph')).toEqual(report.bullets);
    for (const sentence of report.sentences) expect(paragraphs.some((p) => p.includes(sentence))).toBe(true);
    // The table, cell by cell.
    const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => [...m[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((c) => xmlParagraphs(c[0]).join(' ')));
    expect(rows).toEqual(report.table.map((r) => [...r]));
    // The photo, cut from the page, in its place after its heading and before its caption.
    expect(parts.names.filter((n) => n.startsWith('word/media/'))).toHaveLength(1);
    const order = xml.indexOf('3. The new plant') < xml.indexOf('<w:drawing>') && xml.indexOf('<w:drawing>') < xml.indexOf(report.caption);
    expect(order).toBe(true);
    const picture = await pixelsOf(parts.bytes(parts.names.find((n) => n.startsWith('word/media/'))!)!);
    expect(near(picture.at(0.5, 0.03), [208, 16, 16], 60)).toBe(true);
    // No page furniture in the text.
    expect(paragraphs.join(' ')).not.toMatch(/Page \d of 3/);
    expect(paragraphs.join(' ')).not.toContain('Kerala Water Cooperative - Annual Report 2025');
    // Bold came across.
    expect(xml).toMatch(/<w:b\/>[\s\S]{0,200}Annual Report 2025/);
  });

  test('a salary slip: its details and its earnings as two tables, every figure in its own cell', async ({ page }, info) => {
    laptopOnly(info.project.name);
    const slip = await salarySlipPdf();
    await openTool(page, 'pdf-to-word');
    await pick(page, [{ name: 'Payslip Sep 2026.pdf', bytes: slip.bytes }]);
    await runTool(page);
    await expect(page.getByTestId('result-detail')).toContainText('2 tables');
    const xml = unzipParts((await save(page)).bytes).text('word/document.xml');
    const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((t) => [...t[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => [...m[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((c) => xmlParagraphs(c[0]).join(' '))));
    expect(tables).toHaveLength(2);
    expect(tables[0]![0]).toEqual(['Employee name', 'Anjali Menon', 'Employee ID', 'TPS-0421']);
    expect(tables[1]![0]).toEqual(['Earnings', 'Amount (Rs.)', 'Deductions', 'Amount (Rs.)']);
    expect(tables[1]![1]).toEqual(['Basic', '45,000.00', 'Provident Fund', '5,400.00']);
    expect(tables[1]![4]).toEqual(['Conveyance', '1,600.00', '', '']);
    expect(tables[1]![5]).toEqual(['Total Earnings', '81,400.00', 'Total Deductions', '12,450.00']);
    expect(xmlParagraphs(xml)).toContain('Net Pay: Rs. 68,950.00');
  });

  test('a lease: a clause the page break cut in two is one paragraph again, and the numbered clauses are a list', async ({ page }, info) => {
    laptopOnly(info.project.name);
    await openTool(page, 'pdf-to-word');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf() }]);
    await runTool(page);
    const xml = unzipParts((await save(page)).bytes).text('word/document.xml');
    const paragraphs = xmlParagraphs(xml);
    expect(paragraphs.some((p) => p.includes('may be renewed by mutual consent.'))).toBe(true);
    const items = [...xml.matchAll(/<w:p>(?:(?!<\/w:p>).)*?<w:numPr>(?:(?!<\/w:p>).)*?<\/w:p>/gs)].map((m) => xmlParagraphs(m[0]).join(''));
    expect(items).toHaveLength(6);
    expect(items[0]).toMatch(/^The tenant shall pay a monthly rent of Rs\. 15,000/);
  });
});

test.describe('pdf to excel', () => {
  test('a bank statement: one sheet of transactions whose amounts add up to the statement totals, and the details kept apart', async ({ page }) => {
    test.setTimeout(120_000);
    const statement = await bankStatementPdf([2024, 4], [2024, 9]);
    await openTool(page, 'pdf-to-excel');
    await expect(page.getByTestId('opt-scans')).toBeChecked();
    await pick(page, [{ name: 'Statement.pdf', bytes: statement.bytes }]);
    await runTool(page, 90_000);
    await expect(page.getByTestId('result-detail')).toContainText('Spreadsheet: 2 sheets');
    const parts = unzipParts((await save(page)).bytes);
    expect(parts.text('xl/workbook.xml')).toMatch(/<sheet name="Table"[\s\S]*<sheet name="Other details"/);
    const rows = sheetRows(parts, 1);
    expect(rows[0]).toEqual(['Date', 'Narration', 'Chq/Ref No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance']);
    const body = rows.slice(1).filter((r) => r.length > 0);
    // The opening balance, then every transaction.
    expect(body).toHaveLength(statement.transactions + 1);
    const sum = (k: number) => Math.round(body.reduce((n, r) => n + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0) * 100) / 100;
    expect(sum(4)).toBeCloseTo(statement.withdrawals, 2);
    expect(sum(5)).toBeCloseTo(statement.deposits, 2);
    expect(body[body.length - 1]![6]).toBeCloseTo(statement.closing, 2);
    const details = sheetRows(parts, 2).map((r) => r.join(' | '));
    expect(details).toContain('Account holder | ANJALI MENON');
  });

  test('a salary slip: earnings and deductions in their own columns, the amounts numbers', async ({ page }, info) => {
    laptopOnly(info.project.name);
    const slip = await salarySlipPdf();
    await openTool(page, 'pdf-to-excel');
    await page.getByTestId('opt-scans').uncheck();
    await pick(page, [{ name: 'Payslip.pdf', bytes: slip.bytes }]);
    await runTool(page);
    const rows = sheetRows(unzipParts((await save(page)).bytes), 1).filter((r) => r.length > 0);
    const earnings = rows.findIndex((r) => r[0] === 'Earnings');
    expect(rows[earnings + 1]).toEqual(['Basic', 45000, 'Provident Fund', 5400]);
    expect(rows[earnings + 5]).toEqual(['Total Earnings', slip.gross, 'Total Deductions', slip.totalDeductions]);
    const earned = rows.slice(earnings + 1, earnings + 5).reduce((n, r) => n + (r[1] as number), 0);
    expect(earned).toBe(slip.gross);
  });
});

test.describe('pdf to epub and web page', () => {
  test('an e-book cut into chapters at the sections, with its contents list and the photo', async ({ page }) => {
    test.setTimeout(90_000);
    const report = await reportPdf();
    await openTool(page, 'pdf-to-epub');
    await expect(page.getByTestId('opt-format-epub')).toBeChecked();
    await pick(page, [{ name: 'Annual report.pdf', bytes: report.bytes }]);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Annual report.epub');
    await expect(page.getByTestId('result-detail')).toHaveText('An e-book whose text reflows on any reader, 3 pages of text and 1 picture');
    const { bytes } = await save(page);
    // The mimetype first and stored, as every reader insists.
    expect(Buffer.from(bytes.subarray(30, 38)).toString('latin1')).toBe('mimetype');
    const parts = unzipParts(bytes);
    expect(parts.text('mimetype')).toBe('application/epub+zip');
    const chapters = parts.names.filter((n) => /chapter\d+\.xhtml$/.test(n));
    expect(chapters.length).toBe(5);
    const nav = parts.text(parts.names.find((n) => n.endsWith('nav.xhtml'))!);
    for (const heading of report.headings) expect(nav).toContain(heading);
    expect(parts.names.some((n) => /\.(jpe?g|png)$/.test(n))).toBe(true);
    const all = chapters.map((c) => parts.text(c)).join('');
    for (const sentence of report.sentences) expect(all).toContain(sentence);
    expect(all).not.toMatch(/Page \d of 3/);
  });

  test('a web page: one file with the headings, the table and the photo inside it', async ({ page }, info) => {
    laptopOnly(info.project.name);
    const report = await reportPdf();
    await openTool(page, 'pdf-to-epub');
    await page.getByTestId('opt-format-html').check();
    await pick(page, [{ name: 'Annual report.pdf', bytes: report.bytes }]);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Annual report.html');
    const html = Buffer.from((await save(page)).bytes).toString('utf8');
    expect(html).toContain(`<h1>${report.title}</h1>`);
    for (const h of report.headings) expect(html).toContain(`<h2>${h}</h2>`);
    expect(html).toContain('<td>18,42,000.00</td>');
    expect(html).toMatch(/<img [^>]*src="data:image\/jpeg;base64,/);
  });
});

// =====================================================================
// PDF to PowerPoint
// =====================================================================

test.describe('pdf to powerpoint', () => {
  test('editable slides: the words in text boxes in their own colours over the page without them, and in the notes', async ({ page }) => {
    test.setTimeout(90_000);
    await openTool(page, 'pdf-to-powerpoint');
    await expect(page.getByTestId('opt-editable')).toBeChecked();
    await pick(page, [{ name: 'Review.pdf', bytes: await slidesPdf(3) }]);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Review.pptx');
    await expect(page.getByTestId('result-detail')).toHaveText("3 slides, with 6 text boxes to edit over each page's pictures and shapes");
    const parts = unzipParts((await save(page)).bytes);
    // 960 × 540 points is PowerPoint's own 16:9.
    expect(parts.text('ppt/presentation.xml')).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    const slide = parts.text('ppt/slides/slide2.xml');
    expect(xmlParagraphs(slide)).toEqual(['Slide 2: Quarterly review', 'Point 2 — revenue is up in every district.']);
    // The title is white on its blue bar, and bold; the point is near-black.
    const title = /<a:rPr[^>]*b="1"[^>]*>(?:(?!<\/a:rPr>).)*?<a:srgbClr val="([0-9A-F]{6})"/s.exec(slide);
    expect(title?.[1]).toMatch(/^F[0-9A-F]F[0-9A-F]F[0-9A-F]$/);
    // The background is the page without its words: the blue bar is there, the white title is not.
    const background = await pixelsOf(parts.bytes('ppt/media/image2.jpeg')!);
    expect(near(background.at(0.02, 0.05), [26, 64, 140], 40)).toBe(true);
    expect(near(background.at(0.15, 0.08), [26, 64, 140], 40)).toBe(true);
    expect(xmlParagraphs(parts.text('ppt/notesSlides/notesSlide2.xml'))).toEqual(['Slide 2: Quarterly review', 'Point 2 — revenue is up in every district.']);
  });

  test('pictures of the pages, exactly as they look, when the text box option is off', async ({ page }, info) => {
    laptopOnly(info.project.name);
    await openTool(page, 'pdf-to-powerpoint');
    await page.getByTestId('opt-editable').uncheck();
    await pick(page, [{ name: 'Report.pdf', bytes: (await reportPdf()).bytes }]);
    await runTool(page);
    await expect(page.getByTestId('result-detail')).toHaveText('3 slides, each page as it looks; its words are in the speaker notes');
    const parts = unzipParts((await save(page)).bytes);
    expect(parts.text('ppt/slides/slide1.xml')).not.toContain('txBox');
    // Page 2 as it looks, words and all: the photo's red band and the heading's dark letters are both in the picture.
    const pic = await pixelsOf(parts.bytes('ppt/media/image2.jpeg')!);
    expect(near(pic.at(0.5, 118 / 841.89), [208, 16, 16], 60)).toBe(true);
    let dark = 0;
    // "3. The new plant" at the top of page 2.
    for (let x = 0.07; x < 0.22; x += 0.002) if (pic.at(x, 75 / 841.89)[0] < 100) dark++;
    expect(dark).toBeGreaterThan(3);
    expect(xmlParagraphs(parts.text('ppt/notesSlides/notesSlide1.xml')).join(' ')).toContain('Annual Report 2025');
  });
});

// =====================================================================
// Word or Excel to PDF
// =====================================================================

test.describe('word or excel to pdf', () => {
  test('a Word letter: header and footer on every page with real page numbers, the list, the table, the link, the footnote and the Malayalam', async ({ page }) => {
    test.setTimeout(90_000);
    await openTool(page, 'office-to-pdf');
    await page.getByTestId('file-input').setInputFiles([{ name: 'Rent notice.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(wordLetterDocx()) }]);
    await expect(page.getByTestId('file-item')).toHaveCount(1);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Rent notice.pdf');
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-pages', '2');
    const { bytes } = await save(page);
    const pages = await pdfTexts(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Rose Gardens Residents Association');
    expect(pages[0]).toContain('Notice of rent revision Dear Anjali,');
    expect(pages[0]).toContain('Rent notice Page 1 of 2');
    expect(pages[1]).toContain('Rose Gardens Residents Association');
    expect(pages[1]).toContain('Page 2 of 2');
    // The header at the top of each page, the footer at the foot, the page number at the right.
    const view = await openPdf(bytes);
    try {
      for (const i of [0, 1]) {
        const layout = await view.layout(i);
        const header = layout.items.find((it) => it.str.startsWith('Rose'));
        const number = layout.items.find((it) => it.str.startsWith('Page'));
        expect(header!.y / layout.height).toBeLessThan(0.08);
        expect(number!.y / layout.height).toBeGreaterThan(0.92);
        expect(number!.x / layout.width).toBeGreaterThan(0.7);
      }
    } finally {
      await view.close();
    }
    expect(pages[0]).toContain('1. The rent goes up by five per cent.');
    expect(pages[0]).toContain('Maintenance 1200 1200');
    expect(pages[0]).toContain('more than now.[1]');
    expect(pages[1]).toContain('[1] Approved at the general body meeting on 14 March.');
    // The Malayalam line is drawn by the browser: a picture of real letters, not boxes or question marks.
    expect(pages[1]).not.toContain('?');
    const malayalam = await pagePixels(bytes, 1, 600);
    const second = await openPdf(bytes);
    const regards = (await second.layout(1)).items.find((it) => it.str.startsWith('With'))!;
    await second.close();
    // The line above "With regards" is the Malayalam one: ink across it, from the left margin on.
    let ink = 0;
    for (let y = regards.y - 26; y < regards.y - 12; y += 1) for (let x = 0.12; x < 0.5; x += 0.005) if (malayalam.at(x, y / 841.9)[0] < 128) ink++;
    expect(ink).toBeGreaterThan(20);
    // The link is a real link.
    const links = await openPdf(bytes);
    expect(await links.links(0)).toContain('https://example.org/rent');
    await links.close();
  });

  test('an Excel workbook: a sheet a page, dates and amounts as Excel shows them, the wide sheet sideways', async ({ page }, info) => {
    laptopOnly(info.project.name);
    test.setTimeout(90_000);
    await openTool(page, 'office-to-pdf');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'Budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(householdXlsx()) },
      { name: 'Old.doc', mimeType: 'application/msword', buffer: Buffer.from('ÐÏ\u0011à not really a doc') },
    ]);
    await expect(page.getByTestId('file-item')).toHaveCount(2);
    await runTool(page);
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Budget.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('3 pages from the spreadsheet, each sheet as a table');
    await expect(page.getByTestId('failure-item')).toContainText("Old.doc: This isn't a Word (.docx) or Excel (.xlsx) file.");
    const { bytes } = await save(page);
    const info2 = await pdfInfo(bytes);
    expect(info2.sizes.every(([w, h]) => w > h)).toBe(true);
    const pages = await pdfTexts(bytes);
    expect(pages[0]).toContain('Budget');
    expect(pages[0]).toContain('Rent 15,000.00 09/04/2026 75.00%');
    expect(pages[0]).toContain('Total 20,000.50');
    expect(pages[1]).toContain('Payments');
    expect(pages[2]).toContain('Expense Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb Mar');
    expect(pages[2]).toContain('Electricity 2,100 2,135');
  });
});

// =====================================================================
// The page itself
// =====================================================================

test('start over clears the files, the result and the button, and the next file works', async ({ page }) => {
  await openTool(page, 'n-up');
  await pick(page, [{ name: 'One.pdf', bytes: await pagesPdf(2) }]);
  await runTool(page);
  await page.getByTestId('start-over').click();
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByTestId('file-item')).toHaveCount(0);
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await pick(page, [{ name: 'Two.pdf', bytes: await pagesPdf(4) }]);
  await runTool(page);
  await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'Two 2-up.pdf');
});

test('on a phone the options, the pinned button and the result all fit the screen and can be used', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'The phone layout');
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  for (const tool of ['compress', 'images-to-pdf', 'n-up', 'pdf-to-images', 'rent-receipts', 'pdf-to-powerpoint', 'office-to-pdf'] as const) {
    await openTool(page, tool);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(360);
  }
  await openTool(page, 'images-to-pdf');
  await pick(page, PHOTOS.slice(0, 2));
  const button = page.getByTestId('run-button');
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  // Pinned under the thumb, inside the screen, and nothing on top of it.
  expect(box!.y + box!.height).toBeLessThanOrEqual(780);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[data-testid="run-button"]') !== null, [box!.x + box!.width / 2, box!.y + box!.height / 2]);
  expect(hit).toBe(true);
  await page.getByTestId('opt-margin-none').check();
  await button.click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('save-button').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('save-button')).toBeInViewport();
  const { name } = await save(page);
  expect(name).toBe('Upright and 1 more.pdf');
  expect(errors.pageErrors).toEqual([]);
});
