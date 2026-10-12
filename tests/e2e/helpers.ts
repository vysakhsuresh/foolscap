/**
 * What every spec needs: open a page and wait until it is really ready, put a
 * fixture into the file input, and read a download back as bytes.
 */
import { readFileSync } from 'node:fs';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { LIVE_TOOLS, type ToolId } from '../../app/src/ops/tools';
import { GUIDES } from '../../app/src/site/guides';
import { pdfInfo, type Bytes, type PdfInfo } from '../fixtures/pdfs';

export const ORIGIN = 'http://127.0.0.1:4173';
export const TOOL_IDS: readonly ToolId[] = LIVE_TOOLS.map((t) => t.id);
/** The reading pages; the guides are sampled (seo.spec.ts opens every one). */
export const READING_PAGES = ['/guides/', ...GUIDES.slice(0, 3).map((g) => `/guides/${g.slug}/`), '/about/', '/terms/', '/contact/', '/404.html'];
export const ALL_PAGES = ['/', '/private/', ...READING_PAGES, ...TOOL_IDS.map((id) => `/tools/${id}/`)];

/** A tool page, once the engine and the job runner have both come up. Nothing is fetched after this. */
export async function openTool(page: Page, id: ToolId): Promise<void> {
  await page.goto(`/tools/${id}/`);
  await waitReady(page);
}

export async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('body[data-ready="true"]')).toBeAttached({ timeout: 30_000 });
}

/** Any page: loaded, with the shell drawn. */
export async function openPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('load');
  await expect(page.getByTestId('site-footer')).toBeVisible();
  if (path.startsWith('/tools/')) await waitReady(page);
}

export interface Fixture {
  readonly name: string;
  readonly bytes: Bytes;
}

/** Through the one door a document may enter: the <input type=file>. */
export async function upload(page: Page, files: readonly Fixture[]): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(
    files.map((f) => ({ name: f.name, mimeType: 'application/pdf', buffer: Buffer.from(f.bytes) })),
  );
}

/**
 * Chromium has showSaveFilePicker and showDirectoryPicker, and headless has no
 * dialog to show them in, so the Exporter would wait on a picker nobody can
 * answer. Removing them puts it on the download path, which is also what
 * Firefox, Safari and Android Chrome get. Call before the first navigation.
 */
export async function useDownloads(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    delete window.showSaveFilePicker;
    delete window.showDirectoryPicker;
  });
}

/** Clicks `trigger` and returns the bytes of the download it starts. */
export async function downloadFrom(page: Page, trigger: Locator): Promise<{ name: string; bytes: Uint8Array }> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

export async function downloadPdf(page: Page, trigger: Locator): Promise<{ name: string; info: PdfInfo; bytes: Uint8Array }> {
  const { name, bytes } = await downloadFrom(page, trigger);
  return { name, bytes, info: await pdfInfo(bytes) };
}

/** Runs the tool and waits for the result panel. */
export async function run(page: Page): Promise<void> {
  const button = page.getByTestId('run-button');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
}

/** Errors the page reports: thrown exceptions and console errors, collected from now on. */
export function collectErrors(page: Page): { readonly pageErrors: string[]; readonly consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

/** Every http(s) request the page makes from now on, by URL. */
export function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) urls.push(request.url());
  });
  return urls;
}

/**
 * Whether every thumbnail in the grid has really been drawn: a canvas with
 * more than one colour in it, or an image that decoded to a size.
 */
export async function thumbnailsRendered(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const thumbs = [...document.querySelectorAll('[data-testid="page-thumb"]')];
    if (thumbs.length === 0) return false;
    return thumbs.every((thumb) => {
      if (thumb instanceof HTMLImageElement) return thumb.complete && thumb.naturalWidth > 0;
      if (!(thumb instanceof HTMLCanvasElement)) return false;
      if (thumb.width === 0 || thumb.height === 0) return false;
      const context = thumb.getContext('2d');
      if (!context) return false;
      const { data } = context.getImageData(0, 0, thumb.width, thumb.height);
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 7) {
        seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
        if (seen.size > 1) return true;
      }
      return false;
    });
  });
}
