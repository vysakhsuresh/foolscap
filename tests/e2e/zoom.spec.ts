/**
 * Zoom, wherever a page is worked on: the eight page-editor tools, Read,
 * Organise's thumbnails and Scan's corners. Buttons on every screen, two
 * fingers on a phone, Ctrl-wheel and the keyboard on a laptop — and nothing
 * placed while zoomed lands anywhere but where it was put.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { pagesPdf } from '../fixtures/pdfs';
import { added, extent, notWhite } from '../fixtures/mark-inspect';
import { salarySlipPdf } from '../fixtures/mark-samples';
import { photo } from '../fixtures/realistic';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

async function pick(page: Page, name: string, bytes: Uint8Array, mime = 'application/pdf'): Promise<void> {
  await page.getByTestId('file-input').setInputFiles([{ name, mimeType: mime, buffer: Buffer.from(bytes) }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
}

const widthOf = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())?.width ?? 0;

/** Two fingers on the screen at a and b, moved apart (or together) to a2 and b2, as Chrome's touch input. */
async function pinch(page: Page, cdp: CDPSession, at: { x: number; y: number }, from: number, to: number): Promise<void> {
  const points = (d: number) => [
    { x: at.x - d / 2, y: at.y, id: 1 },
    { x: at.x + d / 2, y: at.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
  for (let k = 1; k <= 8; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + ((to - from) * k) / 8) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Two fingers moved together by (dx, dy): a pan. */
async function pan(page: Page, cdp: CDPSession, at: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  const points = (k: number) => [
    { x: at.x - 40 + dx * k, y: at.y + dy * k, id: 1 },
    { x: at.x + 40 + dx * k, y: at.y + dy * k, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  for (let k = 1; k <= 8; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(k / 8) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** The middle of the visible part of `testid`, in the window. */
async function middleOf(page: Page, testid: string): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId(testid).boundingBox())!;
  // What of it shows: inside the window, and inside the frame a zoomed page scrolls in.
  const frame = await page.getByTestId(testid).evaluate((el) => {
    const r = (el.closest('.editor__stage') ?? el).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  const view = page.viewportSize()!;
  const left = Math.max(box.x, frame.left, 0);
  const right = Math.min(box.x + box.width, frame.right, view.width);
  const top = Math.max(box.y, frame.top, 0);
  const bottom = Math.min(box.y + box.height, frame.bottom, view.height);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

test.describe('the page editor', () => {
  test('zooms with its buttons; a box drawn zoomed in lands exactly where it was drawn on the page', async ({ page }) => {
    const input = await salarySlipPdf();
    await openTool(page, 'mark-up');
    await pick(page, 'Payslip.pdf', input);
    await expect(page.getByTestId('editor-zoom')).toHaveText('100%');
    await expect(page.getByTestId('editor-zoom-out')).toBeDisabled();
    const fitted = await widthOf(page, 'editor-page');
    await page.getByTestId('editor-zoom-in').click();
    await page.getByTestId('editor-zoom-in').click();
    await expect(page.getByTestId('editor-zoom')).toHaveText('150%');
    await expect(page.getByTestId('page-editor')).toHaveAttribute('data-zoomed', 'true');
    expect(Math.abs((await widthOf(page, 'editor-page')) - fitted * 1.5)).toBeLessThan(2);
    // Scroll the zoomed page so its right half is in view, then box a spot there.
    await page.getByTestId('opt-tool-rect').check();
    const target = { x: 0.62, y: 0.4, w: 0.2, h: 0.06 };
    await page.locator('.editor__stage').evaluate((stage, t) => {
      document.documentElement.style.setProperty('scroll-behavior', 'auto');
      const sheet = stage.querySelector<HTMLElement>('.editor__page')!;
      stage.scrollLeft = (t.x + t.w / 2) * sheet.offsetWidth - stage.clientWidth / 2;
      stage.scrollTop = (t.y + t.h / 2) * sheet.offsetHeight - stage.clientHeight / 2;
      stage.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, target);
    await page.waitForTimeout(300);
    const sheet = (await page.getByTestId('editor-page').boundingBox())!;
    await page.mouse.move(sheet.x + sheet.width * target.x, sheet.y + sheet.height * target.y);
    await page.mouse.down();
    await page.mouse.move(sheet.x + sheet.width * (target.x + target.w), sheet.y + sheet.height * (target.y + target.h), { steps: 6 });
    await page.mouse.up();
    // Back to fit: the box is still on the same spot of the page.
    await page.getByTestId('editor-zoom').click();
    await expect(page.getByTestId('editor-zoom')).toHaveText('100%');
    await expect(page.getByTestId('page-editor')).toHaveAttribute('data-zoomed', 'false');
    await run(page);
    const out = await downloadFrom(page, page.getByTestId('save-button').first());
    const box = extent(await added(input, out.bytes, 0, 1), notWhite)!;
    expect(box).not.toBeNull();
    expect(Math.abs(box.x - target.x)).toBeLessThan(0.012);
    expect(Math.abs(box.y - target.y)).toBeLessThan(0.012);
    expect(Math.abs(box.x + box.w - (target.x + target.w))).toBeLessThan(0.012);
    expect(Math.abs(box.y + box.h - (target.y + target.h))).toBeLessThan(0.012);
  });

  test('zooms with Ctrl and the wheel about the pointer, and with + − and 0 on the keyboard', async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'a wheel and a keyboard');
    await openTool(page, 'sign');
    await pick(page, 'Payslip.pdf', await salarySlipPdf());
    await expect(page.getByTestId('editor-zoom')).toHaveText('100%');
    await page.getByTestId('editor-page').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const at = await middleOf(page, 'editor-page');
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('editor-zoom')).not.toHaveText('100%');
    const zoomed = Number((await page.getByTestId('editor-zoom').textContent())!.replace('%', ''));
    expect(zoomed).toBeGreaterThan(150);
    // The page did not scroll away from under the pointer: the point there is still on the page.
    const sheet = (await page.getByTestId('editor-page').boundingBox())!;
    expect(at.x).toBeGreaterThan(sheet.x);
    expect(at.x).toBeLessThan(sheet.x + sheet.width);
    await page.getByTestId('editor-layer').focus();
    await page.keyboard.press('0');
    await expect(page.getByTestId('editor-zoom')).toHaveText('100%');
    await page.keyboard.press('+');
    await expect(page.getByTestId('editor-zoom')).toHaveText('125%');
    await page.keyboard.press('-');
    await expect(page.getByTestId('editor-zoom')).toHaveText('100%');
    // Nothing was put on the page by any of that.
    await expect(page.getByTestId('editor-undo')).toBeDisabled();
  });

  test('two fingers zoom on a phone, and the first finger’s touch does not leave text on the page', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'touch');
    await openTool(page, 'add-text');
    await pick(page, 'Payslip.pdf', await salarySlipPdf());
    await expect(page.getByTestId('editor-zoom')).toHaveText('100%');
    // Words typed, so one finger on the page would place them.
    await page.getByTestId('opt-text').fill('Approved');
    await page.getByTestId('editor-page').scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    const at = await middleOf(page, 'editor-page');
    await pinch(page, cdp, at, 60, 200);
    await expect(page.getByTestId('editor-zoom')).not.toHaveText('100%');
    expect(Number((await page.getByTestId('editor-zoom').textContent())!.replace('%', ''))).toBeGreaterThan(200);
    await expect(page.getByTestId('page-editor')).toHaveAttribute('data-zoomed', 'true');
    await expect(page.locator('.editor__item')).toHaveCount(0);
    await expect(page.getByTestId('editor-undo')).toBeDisabled();
    await expect(page.getByTestId('editor-hint')).toContainText('Two fingers move the page');
    // Two fingers moved together carry the page with them, at the same size.
    const size = await page.getByTestId('editor-zoom').textContent();
    const left = await page.locator('.editor__stage').evaluate((st) => st.scrollLeft);
    await pan(page, cdp, await middleOf(page, 'editor-page'), 80, 0);
    await expect(page.getByTestId('editor-zoom')).toHaveText(size!);
    expect(await page.locator('.editor__stage').evaluate((st) => st.scrollLeft)).toBeLessThan(left - 40);
    await expect(page.locator('.editor__item')).toHaveCount(0);
    // And together again: back to the fitted page, never smaller.
    await pinch(page, cdp, await middleOf(page, 'editor-page'), 240, 20);
    await expect(page.getByTestId('editor-zoom')).toHaveText('100%');
    // One finger still places the words.
    await page.getByTestId('editor-page').scrollIntoViewIfNeeded();
    const sheet = (await page.getByTestId('editor-page').boundingBox())!;
    await page.touchscreen.tap(sheet.x + sheet.width * 0.3, sheet.y + sheet.height * 0.3);
    await expect(page.locator('.editor__item')).toHaveCount(1);
  });
});

test.describe('Read', () => {
  test('Ctrl and the wheel zoom the document and draw it again at the new size', async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'a wheel');
    await openTool(page, 'read');
    await pick(page, 'Three.pdf', await pagesPdf(3));
    await expect(page.locator('[data-testid="reader-page"][data-drawn="true"]').first()).toBeVisible();
    const before = (await page.getByTestId('reader-page').first().boundingBox())!.width;
    const at = await middleOf(page, 'reader-pages');
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('reader-zoom')).not.toHaveText('100%');
    await expect.poll(async () => (await page.getByTestId('reader-page').first().boundingBox())!.width).toBeGreaterThan(before * 1.5);
    await expect(page.locator('[data-testid="reader-pages"]')).not.toHaveAttribute('style', /transform/);
  });

  test('two fingers zoom the document on a phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'touch');
    await openTool(page, 'read');
    await pick(page, 'Three.pdf', await pagesPdf(3));
    await expect(page.locator('[data-testid="reader-page"][data-drawn="true"]').first()).toBeVisible();
    const before = (await page.getByTestId('reader-page').first().boundingBox())!.width;
    const cdp = await page.context().newCDPSession(page);
    await pinch(page, cdp, await middleOf(page, 'reader-pages'), 60, 180);
    await expect(page.getByTestId('reader-zoom')).not.toHaveText('100%');
    await expect.poll(async () => (await page.getByTestId('reader-page').first().boundingBox())!.width).toBeGreaterThan(before * 1.8);
  });
});

test('Organise: the thumbnails grow and shrink, and are drawn again at their new size', async ({ page }) => {
  await openTool(page, 'organise');
  await pick(page, 'Four.pdf', await pagesPdf(4));
  const thumb = page.getByTestId('page-thumb').first();
  await expect(thumb).toBeVisible();
  const before = (await thumb.boundingBox())!.width;
  const pixels = await thumb.evaluate((c) => (c as HTMLCanvasElement).width);
  await page.getByTestId('grid-zoom-in').click();
  await expect(page.getByTestId('grid-zoom')).toHaveText('150%');
  await expect.poll(async () => (await thumb.boundingBox())!.width).toBeGreaterThan(before * 1.2);
  await expect.poll(() => thumb.evaluate((c) => (c as HTMLCanvasElement).width)).toBeGreaterThan(pixels);
  await page.getByTestId('grid-zoom').click();
  await expect(page.getByTestId('grid-zoom')).toHaveText('100%');
  await expect.poll(async () => Math.round((await thumb.boundingBox())!.width)).toBe(Math.round(before));
});

test('Scan: a magnifier shows the corner being dragged, and goes when it is let go', async ({ page }) => {
  await openTool(page, 'scan');
  await pick(page, 'IMG_1.jpg', photo(900, 1200), 'image/jpeg');
  await expect(page.locator('[data-testid="scan-card"][data-found]')).toHaveCount(1);
  const handle = page.getByTestId('scan-handle-0');
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 40, { steps: 5 });
  await expect(page.getByTestId('scan-loupe')).toBeVisible();
  // Something of the photo is in it.
  const lit = await page.getByTestId('scan-loupe').evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 200) bright++;
    return bright / (data.length / 4);
  });
  expect(lit).toBeGreaterThan(0.2);
  await page.mouse.up();
  await expect(page.getByTestId('scan-loupe')).toBeHidden();
});
