/**
 * The light theme: the switch in the header, the choice kept across pages and
 * reloads, the header still fitting a 360px phone, and every word on the
 * light pages readable — measured, not assumed.
 *
 * The contrast check below walks every element that holds text, works out
 * what is really behind it (each translucent layer up to an opaque one, every
 * stop of a gradient), and needs 4.5:1, or 3:1 for large text. Words drawn
 * in a gradient are checked stop by stop. Disabled controls, things faded
 * out, and the document's own pages (white paper in both themes) are left
 * out, as WCAG leaves them out.
 */
import { expect, test, type Page } from '@playwright/test';
import { GUIDES } from '../../app/src/site/guides';
import { pagesPdf } from '../fixtures/pdfs';
import { openPage, openTool, upload } from './helpers';

const KEY = 'foolscap.theme';
const GUIDE = `/guides/${GUIDES[0]?.slug ?? ''}/`;

async function useLight(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, 'light');
    } catch {
      // A test without storage just sees dark, and fails below.
    }
  }, KEY);
}

/** Every text element whose contrast falls short, as "what: ratio (fg on bg)". */
async function contrastFailures(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate((root) => {
    type Rgba = [number, number, number, number];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return ['no canvas'];
    const cache = new Map<string, Rgba>();
    // The browser parses any CSS colour (rgb, color(srgb …), color-mix results) by painting it.
    const parse = (css: string): Rgba => {
      const hit = cache.get(css);
      if (hit) return hit;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
      const out: Rgba = [r, g, b, a / 255];
      cache.set(css, out);
      return out;
    };
    const over = (top: Rgba, base: Rgba): Rgba => {
      const a = top[3];
      return [top[0] * a + base[0] * (1 - a), top[1] * a + base[1] * (1 - a), top[2] * a + base[2] * (1 - a), 1];
    };
    const lum = ([r, g, b]: Rgba) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const STOP = /rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}\b/gi;
    const stopsOf = (image: string): Rgba[] => (image.match(STOP) ?? []).map(parse).filter((c) => c[3] > 0.05);
    /** A background's image layers, top first. */
    const layersOf = (image: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let start = 0;
      for (let i = 0; i < image.length; i++) {
        if (image[i] === '(') depth++;
        else if (image[i] === ')') depth--;
        else if (image[i] === ',' && depth === 0) {
          out.push(image.slice(start, i));
          start = i + 1;
        }
      }
      out.push(image.slice(start));
      return out.map((l) => l.trim()).filter((l) => l && l !== 'none');
    };
    /**
     * The stops behind the text. A gradient border is drawn as a gradient on
     * the border box under a one-colour layer on the padding box (.proof,
     * .callout): only the top layer is behind the words then.
     */
    const backgroundStops = (s: CSSStyleDeclaration): Rgba[] => {
      const layers = layersOf(s.backgroundImage);
      const top = layers[0] ? stopsOf(layers[0]) : [];
      const solidTop = top.length > 0 && top.every((c) => c.join() === top[0]?.join()) && /padding-box/.test(s.backgroundClip);
      return solidTop ? top.slice(0, 1) : stopsOf(s.backgroundImage);
    };
    const clipsText = (s: CSSStyleDeclaration) => s.backgroundClip === 'text' || s.getPropertyValue('-webkit-background-clip') === 'text';

    /** Every colour that may be behind `el`'s text: one per combination of gradient stops. */
    const behind = (el: Element): Rgba[] => {
      const layers: CSSStyleDeclaration[] = [];
      for (let at: Element | null = el; at; at = at.parentElement) {
        const s = getComputedStyle(at);
        layers.push(s);
        if (parse(s.backgroundColor)[3] >= 0.99 && !/gradient/.test(s.backgroundImage)) break;
      }
      let candidates: Rgba[] = [parse(getComputedStyle(document.documentElement).backgroundColor)];
      if (candidates[0]?.[3] === 0) candidates = [[255, 255, 255, 1]];
      for (const s of layers.reverse()) {
        if (clipsText(s)) continue;
        const colour = parse(s.backgroundColor);
        if (colour[3] > 0) candidates = candidates.map((c) => over(colour, c));
        const stops = /gradient/.test(s.backgroundImage) ? backgroundStops(s) : [];
        if (stops.length > 0) candidates = stops.flatMap((stop) => candidates.map((c) => over(stop, c))).slice(0, 64);
      }
      return candidates;
    };
    const opacityOf = (el: Element) => {
      let o = 1;
      for (let at: Element | null = el; at; at = at.parentElement) o *= Number(getComputedStyle(at).opacity);
      return o;
    };
    const SKIP = '.editor__page, .reader__page, .pad, canvas, svg, .visually-hidden, [disabled], [aria-disabled="true"], option, noscript, script, style';
    const fails: string[] = [];
    const scopeEl = document.querySelector(root) ?? document.body;
    for (const el of scopeEl.querySelectorAll('*')) {
      const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('').trim();
      if (!text || el.closest(SKIP)) continue;
      if (el.closest('[hidden]') || !el.checkVisibility({ checkVisibilityCSS: true })) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1 || opacityOf(el) < 0.99) continue;
      const s = getComputedStyle(el);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      // Words drawn in a gradient: the element itself, or a parent clipping its background to text.
      const clipper = [el, el.parentElement].find((e): e is Element => !!e && clipsText(getComputedStyle(e)));
      const fgs = clipper ? stopsOf(getComputedStyle(clipper).backgroundImage) : [parse(s.color)];
      const bgs = behind(clipper?.parentElement ?? el);
      let worst = Infinity;
      let pair = '';
      for (const fg of fgs)
        for (const bg of bgs) {
          const r = ratio(over(fg, bg), bg);
          if (r < worst) {
            worst = r;
            pair = `rgb(${fg.slice(0, 3).map(Math.round).join(' ')}) on rgb(${bg.slice(0, 3).map(Math.round).join(' ')})`;
          }
        }
      if (worst < need) {
        const name = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
        fails.push(`${name} "${text.slice(0, 30)}": ${worst.toFixed(2)} < ${need} (${pair})`);
      }
    }
    return fails;
  }, scope);
}

test('the switch turns the site light, and the choice survives a reload and a new page', async ({ page }) => {
  await openPage(page, '/');
  const html = page.locator('html');
  // Dark is the brand and the default, whatever the system prefers.
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const toggle = page.getByTestId('theme-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-label', 'Light theme');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f6f7fb');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 247, 251)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true');

  // Another page: set before it paints, by the plain script in its <head>.
  await openTool(page, 'merge');
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 247, 251)');

  // And back again.
  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(10, 12, 16)');
});

test('a light page is light from its first paint: the theme is on <html> before any module runs', async ({ page }) => {
  await useLight(page);
  // Read the attribute the moment the body starts, before the deferred modules run.
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') document.documentElement.dataset['seenAtParse'] = document.documentElement.dataset['theme'] ?? 'none';
    });
  });
  await openPage(page, '/');
  await expect(page.locator('html')).toHaveAttribute('data-seen-at-parse', 'light');
});

test('storage refused: the site stays dark and the switch still works for the page', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
  });
  await openPage(page, '/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the switch fits the header at 360, 768 and 1280 without touching Buy me a coffee', async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await openPage(page, '/tools/merge/');
    const toggle = await page.getByTestId('theme-toggle').boundingBox();
    const coffee = await page.getByTestId('support').boundingBox();
    const nav = await page.getByTestId('site-nav').boundingBox();
    const brand = await page.locator('.brand').boundingBox();
    expect(toggle && coffee && nav && brand, `${width}px`).toBeTruthy();
    if (!toggle || !coffee || !nav || !brand) continue;
    expect(toggle.width, `${width}px`).toBeGreaterThanOrEqual(44);
    expect(toggle.height, `${width}px`).toBeGreaterThanOrEqual(44);
    expect(toggle.x + toggle.width, `${width}px: switch runs into the coffee pill`).toBeLessThanOrEqual(coffee.x);
    expect(nav.x + nav.width, `${width}px: nav runs into the switch`).toBeLessThanOrEqual(toggle.x);
    expect(brand.x + brand.width, `${width}px: name runs into the nav`).toBeLessThanOrEqual(nav.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px scrolls sideways`).toBe(true);
  }
});

test.describe('light theme contrast', () => {
  test.beforeEach(async ({ page }) => useLight(page));

  test('the home page, and Get help open over it', async ({ page }) => {
    await openPage(page, '/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await contrastFailures(page)).toEqual([]);
    await page.getByTestId('help-orb').click();
    await expect(page.getByTestId('help-panel')).toBeVisible();
    expect(await contrastFailures(page, '#help-panel')).toEqual([]);
  });

  test('a tool page with files in it (Merge)', async ({ page }) => {
    await openTool(page, 'merge');
    expect(await contrastFailures(page)).toEqual([]);
    await upload(page, [
      { name: 'one.pdf', bytes: await pagesPdf(2) },
      { name: 'two.pdf', bytes: await pagesPdf(3) },
    ]);
    await expect(page.getByTestId('file-item')).toHaveCount(2);
    await expect(page.getByTestId('run-button')).toBeEnabled();
    expect(await contrastFailures(page)).toEqual([]);
  });

  test('a guide', async ({ page }) => {
    await openPage(page, GUIDE);
    expect(await contrastFailures(page)).toEqual([]);
  });

  test("Read's night mode still darkens the pages", async ({ page }) => {
    await openTool(page, 'read');
    await upload(page, [{ name: 'a.pdf', bytes: await pagesPdf(2) }]);
    await expect(page.getByTestId('reader-page').first()).toBeVisible();
    await page.getByTestId('reader-night').click();
    await expect(page.getByTestId('reader')).toHaveClass(/reader--night/);
    const filter = await page.getByTestId('reader-page').first().locator('canvas').first().evaluate((c) => getComputedStyle(c).filter);
    expect(filter).toContain('invert');
  });
});

test('dark theme contrast holds too (home and Merge)', async ({ page }) => {
  await openPage(page, '/');
  expect(await contrastFailures(page)).toEqual([]);
  await openTool(page, 'merge');
  expect(await contrastFailures(page)).toEqual([]);
});
