/**
 * The shell at both widths: the home page lists the tools honestly, nothing
 * overflows sideways, every control is big enough for a thumb, the display
 * font arrived, and a tool page says which store it is using.
 */
import { expect, test } from '@playwright/test';
import { TOOLS, toolById } from '../../app/src/ops/tools';
import { encryptedPdf, pagesPdf } from '../fixtures/pdfs';
import { GUIDES } from '../../app/src/site/guides';
import { ALL_PAGES, TOOL_IDS, openPage, openTool } from './helpers';

const MIN_TARGET = 44;
/**
 * A link inside running text cannot be 44px tall without breaking the line
 * it sits in; WCAG's target-size rule exempts inline links for that reason.
 * They still need a line tall enough to hit: 24px, which a paragraph's line
 * height gives for free and a footer's small print has to be given.
 */
const MIN_INLINE_LINK_HEIGHT = 24;

test('the home page links each live tool, and any tool not ready is not a link', async ({ page }) => {
  await openPage(page, '/');
  for (const id of TOOL_IDS) {
    const card = page.getByTestId(`tool-card-${id}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', `/tools/${id}/`);
    expect(await card.evaluate((el) => el.tagName)).toBe('A');
  }
  const soon = page.locator('[data-testid^="tool-card-"][data-status="soon"]');
  expect(await soon.count()).toBe(TOOLS.length - TOOL_IDS.length);
  const tags = await soon.evaluateAll((els) => els.map((el) => el.tagName));
  expect(tags.every((tag) => tag !== 'A'), 'a tool that is not ready is not a link').toBe(true);
  await expect(page.getByTestId('trust-pills')).toBeVisible();
  await expect(page.getByTestId('mark')).toBeVisible();
});

for (const path of ALL_PAGES) {
  test(`${path} does not scroll sideways`, async ({ page }) => {
    await openPage(page, path);
    const overflow = await page.evaluate(() => ({
      html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.html, 'the document is wider than the viewport').toBeLessThanOrEqual(0);
    expect(overflow.body, 'the body is wider than the viewport').toBeLessThanOrEqual(0);
    await expect(page.getByTestId('site-header')).toBeVisible();
    await expect(page.getByTestId('site-nav')).toBeAttached();
    await expect(page.getByTestId('site-footer')).toBeVisible();
  });
}

for (const id of TOOL_IDS) {
  test(`/tools/${id}/ has thumb-sized controls, the display font and a storage backend`, async ({ page }) => {
    await openTool(page, id);
    await expect(page.getByTestId('tool-title')).toBeVisible();
    // A template makes a file from what is typed: it has no drop zone, on purpose.
    if (toolById(id).input === 'none') await expect(page.getByTestId('drop-zone')).toHaveCount(0);
    else await expect(page.getByTestId('drop-zone')).toBeVisible();

    const backend = await page.locator('body').getAttribute('data-storage-backend');
    expect(['opfs', 'memory']).toContain(backend);

    const fontLoaded = await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check("12px 'Space Grotesk'")));
    expect(fontLoaded, 'Space Grotesk is loaded, not just declared').toBe(true);

    const small = await page.evaluate(
      ({ min, inlineMin }) => {
        const controls = [...document.querySelectorAll<HTMLElement>('a, button, label[for], [role="button"]')];
        const problems: string[] = [];
        for (const el of controls) {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          if (!visible) continue;
          const inline = el.tagName === 'A' && style.display === 'inline' && el.closest('p, li, small, figcaption, dd') !== null;
          const ok = inline ? rect.height >= inlineMin : rect.width >= min && rect.height >= min;
          if (!ok) {
            const label = el.dataset['testid'] ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
            problems.push(`${el.tagName.toLowerCase()} "${label}" is ${Math.round(rect.width)}×${Math.round(rect.height)}`);
          }
        }
        return problems;
      },
      { min: MIN_TARGET, inlineMin: MIN_INLINE_LINK_HEIGHT },
    );
    expect(small, `controls under ${MIN_TARGET}×${MIN_TARGET}px`).toEqual([]);
  });
}

// The owner's rules for the shell: links are never underlined, Buy me a coffee
// goes to Layerbit's page, and Get help opens Email and WhatsApp with no script.
for (const path of ['/', '/private/', '/tools/merge/', '/guides/', `/guides/${GUIDES[0]?.slug ?? ''}/`, '/about/']) {
  test(`${path} underlines no link and carries Support and Get help`, async ({ page }) => {
    await page.goto(path);
    const underlined = await page.$$eval('a', (as) =>
      as.filter((a) => getComputedStyle(a).textDecorationLine.includes('underline')).map((a) => a.textContent?.trim()),
    );
    expect(underlined, 'no link is underlined').toEqual([]);

    await expect(page.getByTestId('support')).toHaveAttribute('href', 'https://www.buymeacoffee.com/layerbit');

    await expect(page.getByTestId('help-panel')).toBeHidden();
    await page.getByTestId('help-orb').click();
    await expect(page.getByTestId('help-panel')).toBeVisible();
    await expect(page.getByTestId('help-email')).toHaveAttribute('href', /^mailto:ceo@layerbit\.co\.in\?subject=/);
    await expect(page.getByTestId('help-whatsapp')).toHaveAttribute('href', 'https://wa.me/916282595823');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-panel')).toBeHidden();
  });
}

test('a button does not jitter when the pointer rests on its bottom edge', async ({ page }) => {
  await openTool(page, 'merge');
  await page.getByTestId('file-input').setInputFiles([
    { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pagesPdf(1)) },
    { name: 'b.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pagesPdf(1)) },
  ]);
  const button = page.getByTestId('run-button');
  await expect(button).toBeEnabled();
  await button.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 1);
  await page.waitForTimeout(600);
  const tops: number[] = [];
  for (let i = 0; i < 6; i++) {
    tops.push((await button.boundingBox())!.y);
    await page.waitForTimeout(100);
  }
  expect(new Set(tops).size, `the button moved: ${tops.join(', ')}`).toBe(1);
});

test('every tool page has a way home, bottom-left, that lands where you left the home page', async ({ page }) => {
  await openPage(page, '/');
  const card = page.getByTestId('tool-card-sign');
  await card.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const leftAt = await page.evaluate(() => window.scrollY);
  expect(leftAt).toBeGreaterThan(200);
  await card.click();
  await expect(page).toHaveURL(/\/tools\/sign\/$/);

  const fab = page.getByTestId('home-fab');
  await expect(fab).toBeVisible();
  const box = (await fab.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeLessThan(40);
  // At the bottom on a laptop; on a phone just above the pinned button.
  expect(viewport.height - (box.y + box.height)).toBeLessThan(viewport.width < 820 ? 120 : 40);
  // The mark sits in the middle of the circle.
  const mark = (await fab.locator('svg').boundingBox())!;
  expect(Math.abs(mark.x + mark.width / 2 - (box.x + box.width / 2))).toBeLessThan(1.5);
  // And the main button keeps the whole width it is given.
  const run = (await page.getByTestId('run-button').boundingBox())!;
  if (viewport.width < 820) expect(run.width).toBeGreaterThan(viewport.width - 40);
  // It stays there as the page scrolls.
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  expect((await fab.boundingBox())!.y).toBeCloseTo(box.y, 0);

  await fab.click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(leftAt - 40);
  await expect(page.getByTestId('tool-card-sign')).toBeInViewport();
});

test('arriving at a tool from elsewhere, the way home still finds its card', async ({ page }) => {
  await openTool(page, 'ocr');
  await page.evaluate(() => sessionStorage.clear());
  await page.getByTestId('home-fab').click();
  await expect(page.getByTestId('tool-card-ocr')).toBeInViewport();
  await expect(page.getByTestId('tool-card-ocr')).toHaveClass(/is-back/);
});

test('Buy me a coffee stays on screen as the page scrolls', async ({ page }) => {
  await openPage(page, '/');
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await expect(page.getByTestId('support')).toBeInViewport();
  const cup = page.locator('[data-testid="support"] svg path');
  expect((await cup.getAttribute('d'))!.match(/M\d+(\.\d+)? 2\.5c/g)).toHaveLength(3);
});

test('the mark and the icons are served from this site', async ({ page, request }) => {
  await openPage(page, '/');
  // The mark is drawn inline, so it is there before any image could load.
  expect(await page.getByTestId('mark').evaluate((el) => el.tagName.toLowerCase())).toBe('svg');
  await expect(page.getByTestId('mark')).toBeVisible();
  for (const path of ['/favicon.ico', '/favicon.svg', '/brand/mark.svg', '/brand/apple-touch-icon.png', '/brand/icon-192.png', '/brand/icon-512.png', '/manifest.webmanifest']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
  }
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.icons.length).toBeGreaterThan(1);
});

test('a PDF dropped anywhere on a tool page is taken, not only on the box', async ({ page }) => {
  await openTool(page, 'merge');
  const bytes = [...(await pagesPdf(1))];
  const transfer = await page.evaluateHandle((data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], 'Dropped.pdf', { type: 'application/pdf' }));
    return dt;
  }, bytes);
  await page.dispatchEvent('[data-testid="tool-title"]', 'dragenter', { dataTransfer: transfer });
  await expect(page.getByTestId('drop-zone')).toHaveClass(/is-over/);
  await page.dispatchEvent('[data-testid="tool-title"]', 'drop', { dataTransfer: transfer });
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await expect(page.getByTestId('drop-zone')).not.toHaveClass(/is-over/);
});

test('Enter in the finder opens the first tool that matches', async ({ page }) => {
  await openPage(page, '/');
  await page.getByTestId('tool-search').fill('lock');
  await page.getByTestId('tool-search').press('Enter');
  await expect(page).toHaveURL(/\/tools\/add-password\/$/);
});

test('a locked file must be unlocked before the tool runs, and the box says so', async ({ page }) => {
  await openTool(page, 'watermark');
  await page.getByTestId('file-input').setInputFiles([{ name: 'Locked.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await encryptedPdf('tea', 1)) }]);
  await expect(page.getByTestId('file-password')).toBeVisible();
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await expect(page.locator('.run__note')).toHaveText('Type the password for the locked file, then tap Unlock.');
  await page.getByTestId('file-password').fill('tea');
  await page.getByTestId('file-unlock').click();
  await expect(page.getByTestId('run-button')).toBeEnabled();
});

test('the drop box is one control: the keyboard reaches the file picker itself', async ({ page }) => {
  await openTool(page, 'merge');
  await page.getByTestId('file-input').focus();
  await expect(page.getByTestId('file-input')).toBeFocused();
  expect(await page.getByTestId('drop-zone').getAttribute('role')).toBeNull();
});
