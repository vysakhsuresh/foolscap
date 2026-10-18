/**
 * Alignment, checked on every page rather than looked at once: nothing runs
 * off the side, the phone's bottom row is one line, and at the end of every
 * page nothing pinned sits on top of the words or the links.
 */
import { expect, test, type Page } from '@playwright/test';
import { pagesPdf } from '../fixtures/pdfs';
import { ALL_PAGES, openTool, waitReady } from './helpers';

async function overlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
    };
    const pinned = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && shown(e) && !e.closest('[popover]'));
    const content = [...document.querySelectorAll('h1,h2,h3,p,li,label,a,button,input,select,textarea,summary')].filter(shown);
    const found: string[] = [];
    for (const f of pinned) {
      const fr = f.getBoundingClientRect();
      for (const c of content) {
        if (f.contains(c) || c.contains(f)) continue;
        const cr = c.getBoundingClientRect();
        const x = Math.min(fr.right, cr.right) - Math.max(fr.left, cr.left);
        const y = Math.min(fr.bottom, cr.bottom) - Math.max(fr.top, cr.top);
        if (x > 4 && y > 4) found.push(`${f.getAttribute('data-testid') ?? f.className} over "${(c.textContent ?? '').trim().slice(0, 30)}"`);
      }
    }
    return found;
  });
}

test('no page scrolls sideways, and at the end of every page nothing pinned covers what is there', async ({ page }) => {
  test.setTimeout(240_000);
  for (const path of ALL_PAGES) {
    await page.goto(path);
    if ((path.startsWith('/tools/') && path !== '/tools/') || path === '/open/') await waitReady(page);
    const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(width[0], `${path} scrolls sideways`).toBeLessThanOrEqual((width[1] ?? 0) + 1);
    // Scrolled down to the end the way a person does, so anything that steps aside has.
    await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        window.scrollBy({ top: document.documentElement.scrollHeight / 5, behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
    });
    await page.waitForTimeout(350);
    expect(await overlaps(page), `${path} at the end`).toEqual([]);
  }
});

test('just below the top of a page, Buy me a coffee is out of the way of the first lines', async ({ page }) => {
  for (const path of ['/', '/tools/merge/', '/tools/sign/', '/guides/merge-pdf-files/', '/privacy/']) {
    await page.goto(path);
    if (path.startsWith('/tools/')) await waitReady(page);
    // A thumb's first small push down the page.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy({ top: 20, behavior: 'instant' }));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    await page.waitForTimeout(350);
    const covered = await page.evaluate(() => {
      const pill = document.querySelector('[data-testid="support"]');
      if (!pill) return [];
      const s = getComputedStyle(pill);
      const fr = pill.getBoundingClientRect();
      if (Number(s.opacity) <= 0.05 || fr.bottom <= 0) return [];
      return [...document.querySelectorAll('main h1, main h2, main p, main li, main a, main button, main label')]
        .filter((c) => {
          const cr = c.getBoundingClientRect();
          return Math.min(fr.right, cr.right) - Math.max(fr.left, cr.left) > 4 && Math.min(fr.bottom, cr.bottom) - Math.max(fr.top, cr.top) > 4;
        })
        .map((c) => (c.textContent ?? '').trim().slice(0, 30));
    });
    expect(covered, path).toEqual([]);
  }
});

test('on a phone, home, the main button and Get help are one row on one centre line, on every tool with a main button', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a phone layout');
  for (const id of ['merge', 'compress', 'sign', 'edit-text', 'organise', 'rent-receipts', 'scan'] as const) {
    await openTool(page, id);
    const input = page.getByTestId('file-input');
    if ((await input.count()) > 0 && id !== 'scan') {
      const one = { name: 'Salary slip October 2026.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pagesPdf(2)) };
      await input.setInputFiles((await input.getAttribute('multiple')) !== null ? [one, { ...one, name: 'Lease.pdf' }] : [one]);
      await expect(page.getByTestId('file-item').first()).toBeVisible();
    }
    const [home, run, help] = await Promise.all(['home-fab', 'run-button', 'help-orb'].map(async (t) => (await page.getByTestId(t).boundingBox())!));
    const mid = (r: { y: number; height: number }) => r.y + r.height / 2;
    expect(Math.abs(mid(home!) - mid(run!)), id).toBeLessThan(1);
    expect(Math.abs(mid(help!) - mid(run!)), id).toBeLessThan(1);
    expect(Math.round(home!.height), id).toBe(Math.round(run!.height));
    expect(home!.x + home!.width, id).toBeLessThan(run!.x);
    expect(run!.x + run!.width, id).toBeLessThan(help!.x);
    // Its words stay on one line.
    const lines = await page.getByTestId('run-button').evaluate((b) => {
      const range = document.createRange();
      range.selectNodeContents(b);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines, `${id}: the button's words wrap`).toBe(1);
  }
});

test('on a phone, every box on a tool page spans the column, so the right edge is one line', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a phone layout');
  for (const id of ['sign', 'edit-text', 'rent-receipts', 'add-password'] as const) {
    await openTool(page, id);
    const input = page.getByTestId('file-input');
    if ((await input.count()) > 0) await input.setInputFiles([{ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pagesPdf(1)) }]);
    await page.waitForTimeout(600);
    const short = await page.evaluate(() => {
      // Each box is measured against what holds it: the column, or the card it sits in.
      const inner = (e: Element) => {
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
      };
      // The nearest box with padding or an edge of its own, else the column.
      const holder = (e: Element): Element => {
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (p.matches('[data-slot="body"]')) return p;
          const s = getComputedStyle(p);
          if (parseFloat(s.paddingRight) > 0 || parseFloat(s.borderRightWidth) > 0) return p;
        }
        return document.body;
      };
      return [...document.querySelectorAll('[data-slot="body"] input.input:not([type="color"]):not([type="search"]), [data-slot="body"] textarea.input')]
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .filter((e) => !e.closest('.reader__bar, .zoom, .editor__nav, .recipe-builder__add'))
        .map((e) => ({ id: e.getAttribute('data-testid') ?? e.id, gap: Math.round(inner(holder(e)) - e.getBoundingClientRect().right) }))
        .filter((e) => e.gap > 2 && e.gap < 120);
    });
    expect(short, id).toEqual([]);
  }
});
