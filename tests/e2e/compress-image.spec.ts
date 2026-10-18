/**
 * Resize photo to KB in the real browser, under the production CSP: the
 * photo is decoded, turned, cut and saved as a JPEG by Chromium's own
 * createImageBitmap and OffscreenCanvas in the op worker, and the file that
 * downloads is checked byte by byte: its weight, its pixels, which way up it
 * is, and that the phone's location went nowhere.
 */
import { expect, test, type Page } from '@playwright/test';
import { jpegFrame } from '../../app/src/ops/images';
import { markersOf, pixelsOf, portraitJpeg, quartersJpeg, transparentPng, withExif } from '../fixtures/photos';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

async function pick(page: Page, files: Array<{ name: string; bytes: Uint8Array; mime: string }>): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files.map((f) => ({ name: f.name, mimeType: f.mime, buffer: Buffer.from(f.bytes) })));
  await expect(page.getByTestId('file-item')).toHaveCount(files.length);
  // Each row's small picture arrives a moment later and makes the row taller:
  // wait for it, so nothing moves under the next tap.
  await expect(page.getByTestId('file-thumb')).toHaveCount(files.length, { timeout: 20_000 });
}

test('a phone photo becomes a passport photo under 20 KB, without the place it was taken', async ({ page }) => {
  test.setTimeout(90_000);
  await openTool(page, 'compress-image');
  // A 12-megapixel phone photo, with the camera and the place it was taken in its EXIF.
  const photo = withExif(await portraitJpeg(3024, 4032), { make: 'Phone maker', gps: true, orientation: 1 });
  await pick(page, [{ name: 'IMG_2041.jpg', bytes: photo, mime: 'image/jpeg' }]);
  await page.getByTestId('opt-target-20').check();
  await page.getByTestId('opt-dimensions-passport').check();
  await run(page);
  const item = page.getByTestId('result-item');
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute('data-name', 'IMG_2041 (under 20 KB).jpg');
  const detail = page.getByTestId('result-detail');
  await expect(detail).toContainText('under 20 KB; passport shape, 413 × 531 px');
  await expect(detail).toContainText('location and camera details taken out');
  expect(Number(await item.getAttribute('data-size'))).toBeLessThan(20_000);

  const { name, bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  expect(name).toBe('IMG_2041 (under 20 KB).jpg');
  expect(bytes.length).toBeLessThan(20_000);
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
  expect(jpegFrame(bytes)).toMatchObject({ width: 413, height: 531 });
  expect(markersOf(bytes)).not.toContain('e1');
  expect(Buffer.from(bytes).includes('Phone maker')).toBe(false);
});

test('a photo taken sideways comes out upright, and a see-through PNG on white, each on its own', async ({ page }) => {
  test.setTimeout(60_000);
  await openTool(page, 'compress-image');
  // Stored lying down, 1600 × 1200, with EXIF saying "turn me a quarter clockwise", as phones write it.
  const sideways = withExif(await quartersJpeg(1600, 1200), { orientation: 6 });
  await pick(page, [
    { name: 'Sideways.jpg', bytes: sideways, mime: 'image/jpeg' },
    { name: 'Logo.png', bytes: await transparentPng(600, 600), mime: 'image/png' },
  ]);
  await page.getByTestId('opt-target-500').check();
  await run(page);
  const items = page.getByTestId('result-item');
  await expect(items).toHaveCount(2);
  await expect(page.getByTestId('result-detail').first()).toContainText('1200 × 1600 px, turned upright');
  await expect(page.getByTestId('result-detail').nth(1)).toContainText('now a JPEG');

  const upright = await pixelsOf((await downloadFrom(page, page.getByTestId('save-button').first())).bytes);
  expect([upright.width, upright.height]).toEqual([1200, 1600]);
  // Turned a quarter clockwise: blue (stored bottom-left) is now top-left, red top-right.
  const close = (got: number[], want: number[]) => got.every((v, i) => Math.abs(v - want[i]!) < 60);
  expect(close(upright.at(40, 40), [0, 0, 255]), `top-left ${upright.at(40, 40)}`).toBe(true);
  expect(close(upright.at(1160, 40), [255, 0, 0]), `top-right ${upright.at(1160, 40)}`).toBe(true);

  const logo = await pixelsOf((await downloadFrom(page, page.getByTestId('save-button').nth(1))).bytes);
  expect(Math.min(...logo.at(4, 4))).toBeGreaterThan(245);
  // What comes out is a picture: Then… offers the tools that take pictures.
  await page.getByTestId('then-menu').click();
  await expect(page.getByTestId('then-images-to-pdf')).toBeVisible();
});

test('pixels typed are the pixels made, and a size the form gives can be typed', async ({ page }) => {
  await openTool(page, 'compress-image');
  await pick(page, [{ name: 'Signature.jpg', bytes: await portraitJpeg(1200, 900, 3), mime: 'image/jpeg' }]);
  await page.getByTestId('opt-target-custom').check();
  await page.getByTestId('opt-target-kb').fill('1');
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await page.getByTestId('opt-target-kb').fill('12');
  await page.getByTestId('opt-photo-width').fill('9000');
  await expect(page.getByTestId('opt-dimensions-custom')).toBeChecked();
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await page.getByTestId('opt-photo-width').fill('350');
  await page.getByTestId('opt-photo-height').fill('150');
  await run(page);
  const { bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  expect(bytes.length).toBeLessThan(12_000);
  expect(jpegFrame(bytes)).toMatchObject({ width: 350, height: 150 });
});
