/**
 * The shell at both widths: the home page lists the tools honestly, nothing
 * overflows sideways, every control is big enough for a thumb, the display
 * font arrived, and a tool page says which store it is using.
 */
import { expect, test } from '@playwright/test';
import { ALL_PAGES, TOOL_IDS, openPage, openTool } from './helpers';

const MIN_TARGET = 44;
/**
 * A link inside running text cannot be 44px tall without breaking the line
 * it sits in; WCAG's target-size rule exempts inline links for that reason.
 * They still need a line tall enough to hit: 24px, which a paragraph's line
 * height gives for free and a footer's small print has to be given.
 */
const MIN_INLINE_LINK_HEIGHT = 24;

test('the home page links each live tool and lists the rest as coming soon', async ({ page }) => {
  await openPage(page, '/');
  for (const id of TOOL_IDS) {
    const card = page.getByTestId(`tool-card-${id}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', `/tools/${id}/`);
    expect(await card.evaluate((el) => el.tagName)).toBe('A');
  }
  const soon = page.locator('[data-testid^="tool-card-"][data-status="soon"]');
  expect(await soon.count()).toBeGreaterThan(0);
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
    await expect(page.getByTestId('drop-zone')).toBeVisible();

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
for (const path of ['/', '/private/', '/tools/merge/']) {
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
