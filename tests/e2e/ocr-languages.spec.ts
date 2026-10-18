/**
 * Make searchable in a language other than English, in the browser, under
 * the production CSP. A "scan" is drawn by the browser itself with a system
 * font that has Devanagari (FreeSans, from GNU FreeFont, in this container),
 * so the picture holds real Hindi letters and nothing else.
 *
 * What is proved: the Hindi model is not fetched when the page opens, only
 * when Hindi is picked and run, and only from this site; the words come back
 * in the PDF itself, searchable; and with the network gone, picking a language that was
 * never fetched fails in words while English still works.
 */
import { openPdf } from '../fixtures/inspect';
import { expect, test, type Page } from '@playwright/test';
import { pictureOnlyPdf, type Bytes } from '../fixtures/pdfs';
import { ORIGIN, downloadFrom, openTool, recordRequests, upload, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

/** A one-page picture-only PDF with these lines drawn on it, A4 at 150 dpi. */
async function scanOf(page: Page, lines: readonly string[], font: string): Promise<Bytes> {
  const dataUrl = await page.evaluate(
    ({ lines, font }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const c = canvas.getContext('2d')!;
      c.fillStyle = '#fbfbf8';
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = '#111';
      c.font = font;
      lines.forEach((line, i) => c.fillText(line, 120, 260 + i * 120));
      return canvas.toDataURL('image/png');
    },
    { lines, font },
  );
  return pictureOnlyPdf(new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')));
}

const HINDI_MODEL = /\/tesseract\/[^/]+\/lang\/hin\.traineddata\.gz$/;

test('reads Hindi, fetching its model from this site only once Hindi is picked, and makes the PDF searchable in Hindi', async ({ page }) => {
  test.setTimeout(180_000);
  const requests = recordRequests(page);
  await openTool(page, 'ocr');
  expect(requests.filter((url) => HINDI_MODEL.test(url)), 'the Hindi model must not load with the page').toEqual([]);
  const fonts = await page.evaluate(() => document.fonts.check('64px FreeSans', 'नमस्ते'));
  test.skip(!fonts, 'No system font with Devanagari here');

  await page.getByTestId('opt-ocr-lang-1').selectOption('hin');
  await expect(page.getByTestId('ocr-downloads')).toContainText('The Hindi reader is downloaded from this site the first time you use it');

  await upload(page, [{ name: 'Letter.pdf', bytes: await scanOf(page, ['भारत सरकार', 'नमस्ते दुनिया'], '72px FreeSans') }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId('result-detail')).toContainText('read on 1 page. You can now search, select and copy them');

  const { name, bytes } = await downloadFrom(page, page.getByTestId('save-button'));
  expect(name).toBe('Letter (searchable).pdf');
  const view = await openPdf(bytes);
  const text = await view.text(0);
  await view.close();
  expect(text).toContain('भारत');
  expect(text).toContain('नमस्ते');

  const fetched = requests.filter((url) => HINDI_MODEL.test(url));
  expect(fetched.length, 'the Hindi model is fetched when Hindi is first used').toBeGreaterThan(0);
  expect(requests.filter((url) => !url.startsWith(`${ORIGIN}/`)), 'every request stays on this site').toEqual([]);
});

test('with the network gone, a language never fetched fails in words, and English still reads', async ({ page, context }) => {
  test.setTimeout(180_000);
  await openTool(page, 'ocr');
  const scan = await scanOf(page, ['OFFLINE READING'], '64px Arial, Helvetica, sans-serif');
  await context.setOffline(true);

  await page.getByTestId('opt-ocr-lang-1').selectOption('tam');
  await upload(page, [{ name: 'Scan.pdf', bytes: scan }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('failure-item')).toContainText("The Tamil reader couldn't be downloaded", { timeout: 60_000 });

  await page.getByTestId('start-over').click();
  await page.getByTestId('opt-ocr-lang-1').selectOption('eng');
  await upload(page, [{ name: 'Scan.pdf', bytes: scan }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('result-detail')).toContainText('read on 1 page', { timeout: 150_000 });
});
