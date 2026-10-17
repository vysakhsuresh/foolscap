/**
 * The ways into the tools that are not one tool: Open a file (drop anything,
 * get told what to do with it), recipes (steps saved once, run on many
 * files), a whole folder at once, batches shared between workers, the proof
 * under every result, recent tools and the compact home page on a phone.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { scanPdf } from '../fixtures/awkward';
import { encryptedPdf, pagesPdf } from '../fixtures/pdfs';
import { downloadFrom, openTool, run, useDownloads, waitReady } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

type Pick = { name: string; bytes: Uint8Array; mime?: string };
const files = (list: readonly Pick[]) => list.map((f) => ({ name: f.name, mimeType: f.mime ?? 'application/pdf', buffer: Buffer.from(f.bytes) }));

async function openPage(page: Page): Promise<void> {
  await page.goto('/open/');
  await waitReady(page);
}

async function suggestions(page: Page): Promise<string[]> {
  await expect(page.getByTestId('suggestions').locator('button').first()).toBeVisible({ timeout: 20_000 });
  return page.getByTestId('suggestions').locator('button').evaluateAll((b) => b.map((x) => (x.getAttribute('data-testid') ?? '').replace('suggest-', '')));
}

test.describe('Open a file', () => {
  test('is reached from the home page, and says what to do with a locked PDF and with a scan', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('open-card').click();
    await expect(page).toHaveURL(/\/open\/$/);
    await waitReady(page);
    await page.getByTestId('file-input').setInputFiles(files([{ name: 'Statement.pdf', bytes: await encryptedPdf('flat4b') }]));
    expect((await suggestions(page))[0]).toBe('remove-password');
    await expect(page.getByTestId('open-file')).toContainText('locked');
    await page.getByTestId('open-again').click();
    await expect(page.getByTestId('open-ideas')).toBeHidden();
    await page.getByTestId('file-input').setInputFiles(files([{ name: 'Scan.pdf', bytes: await scanPdf() }]));
    expect((await suggestions(page))[0]).toBe('ocr');
    await expect(page.getByTestId('open-file')).toContainText('a scan');
  });

  test('two PDFs: Merge is offered first, and tapping it carries both files there, ready to run', async ({ page }) => {
    await openPage(page);
    await page.getByTestId('file-input').setInputFiles(files([
      { name: 'a.pdf', bytes: await pagesPdf(2) },
      { name: 'b.pdf', bytes: await pagesPdf(3) },
    ]));
    expect((await suggestions(page))[0]).toBe('merge');
    await page.getByTestId('suggest-merge').click();
    await expect(page).toHaveURL(/\/tools\/merge\/$/);
    await waitReady(page);
    await expect(page.getByTestId('file-item')).toHaveCount(2);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('5 pages from 2 files');
  });

  test('photos and a Word file each go to the tool that takes them', async ({ page }) => {
    await openPage(page);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'photo.png', mimeType: 'image/png', buffer: png },
      { name: 'Letter.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK\u0003\u0004 not really a docx') },
    ]);
    const tools = await suggestions(page);
    expect(tools).toContain('images-to-pdf');
    expect(tools).toContain('office-to-pdf');
    expect(tools).not.toContain('merge');
  });

  test('"Open with Foolscap" on a computer: files from the launch queue open as if dropped', async ({ page }) => {
    const bytes = Buffer.from(await pagesPdf(1)).toString('base64');
    await page.addInitScript((b64) => {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const handle = { kind: 'file', name: 'Opened.pdf', getFile: async () => new File([raw], 'Opened.pdf', { type: 'application/pdf' }) };
      Object.defineProperty(window, 'launchQueue', { value: { setConsumer: (consumer: (p: { files: unknown[] }) => void) => setTimeout(() => consumer({ files: [handle] }), 300) } });
    }, bytes);
    await openPage(page);
    await expect(page.getByTestId('open-file')).toHaveCount(1);
    await expect(page.getByTestId('open-file')).toContainText('Opened.pdf');
    expect((await suggestions(page))[0]).toBe('sign');
  });
});

test.describe('recipes', () => {
  test('one is made from two steps, kept after a reload, and run on three PDFs in one tap', async ({ page }) => {
    test.setTimeout(120_000);
    await openPage(page);
    await page.getByTestId('recipe-new').click();
    await page.getByTestId('opt-recipe-name').fill('Smaller and numbered');
    await page.getByTestId('opt-recipe-tool').selectOption('compress');
    await page.getByTestId('recipe-add-step').click();
    await page.getByTestId('opt-recipe-tool').selectOption('page-numbers');
    await page.getByTestId('recipe-add-step').click();
    await expect(page.getByTestId('recipe-step')).toHaveCount(2);
    await page.getByTestId('recipe-save').click();
    await expect(page.getByTestId('recipe')).toHaveCount(1);
    await expect(page.getByTestId('recipe')).toContainText('Compress → Page numbers');

    await page.reload();
    await waitReady(page);
    await expect(page.getByTestId('recipe')).toHaveCount(1);
    await expect(page.getByTestId('recipe-run')).toBeDisabled();
    await page.getByTestId('file-input').setInputFiles(files([
      { name: 'one.pdf', bytes: await pagesPdf(2) },
      { name: 'two.pdf', bytes: await pagesPdf(1) },
      { name: 'three.pdf', bytes: await pagesPdf(3) },
    ]));
    await expect(page.getByTestId('recipe-run')).toHaveText('Run on 3 PDFs');
    await page.getByTestId('recipe-run').click();
    await expect(page.getByTestId('result-item')).toHaveCount(3, { timeout: 60_000 });
    await expect(page.getByTestId('network-proof')).toBeVisible();
    const out = await downloadFrom(page, page.getByTestId('save-button').first());
    const { openPdf } = await import('../fixtures/mark-inspect');
    const pdf = await openPdf(out.bytes);
    // Numbered: the page number is on the page now.
    expect(await pdf.text(0)).toMatch(/\b1\b/);
    await pdf.close();
  });

  test('a recipe that locks files asks for the password each time and never keeps it', async ({ page }) => {
    await openPage(page);
    await page.getByTestId('recipe-new').click();
    await page.getByTestId('opt-recipe-name').fill('Lock them');
    await page.getByTestId('opt-recipe-tool').selectOption('add-password');
    await page.getByTestId('recipe-add-step').click();
    await page.getByTestId('opt-password').fill('flat4b');
    await page.getByTestId('opt-confirm').fill('flat4b');
    await page.getByTestId('recipe-save').click();
    await expect(page.getByTestId('recipe')).toHaveCount(1);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('flat4b');
    await page.getByTestId('file-input').setInputFiles(files([{ name: 'a.pdf', bytes: await pagesPdf(1) }]));
    await page.getByTestId('recipe-run').click();
    await expect(page.getByTestId('recipe-said')).toContainText('Type the password');
    await page.getByTestId('recipe').locator('input[type="password"]').fill('secret9');
    await page.getByTestId('recipe-run').click();
    await expect(page.getByTestId('result-item')).toHaveCount(1, { timeout: 60_000 });
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('secret9');
  });

  test('a Word step has to be the last', async ({ page }) => {
    await openPage(page);
    await page.getByTestId('recipe-new').click();
    await page.getByTestId('opt-recipe-name').fill('Wrong way round');
    await page.getByTestId('opt-recipe-tool').selectOption('pdf-to-word');
    await page.getByTestId('recipe-add-step').click();
    await page.getByTestId('opt-recipe-tool').selectOption('compress');
    await page.getByTestId('recipe-add-step').click();
    await page.getByTestId('recipe-save').click();
    await expect(page.getByTestId('recipe-problem')).toContainText('last step');
    await expect(page.getByTestId('recipe')).toHaveCount(0);
  });
});

test.describe('batches', () => {
  test('a whole folder: only what the tool takes is picked up, and the rest is counted', async ({ page }, info) => {
    await openTool(page, 'merge');
    // A real folder on disk, as a person picks one.
    const dir = info.outputPath('invoices');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'a.pdf'), await pagesPdf(1));
    writeFileSync(join(dir, 'b.pdf'), await pagesPdf(2));
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    await page.getByTestId('folder-input').setInputFiles(dir);
    await expect(page.getByTestId('file-item')).toHaveCount(2);
    await expect(page.locator('.notice')).toHaveText('2 from the folder; 1 other file was left out.');
  });

  test('many files for a tool that works on each alone come back whole and in order, with the proof under them', async ({ page }) => {
    test.setTimeout(120_000);
    await openTool(page, 'page-numbers');
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    await page.getByTestId('file-input').setInputFiles(files(await Promise.all(names.map(async (n, i) => ({ name: `${n}.pdf`, bytes: await pagesPdf(i + 1) })))));
    await expect(page.getByTestId('file-item')).toHaveCount(6);
    await run(page);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(6, { timeout: 60_000 });
    const texts = await items.allTextContents();
    names.forEach((n, i) => expect(texts[i]?.startsWith(`${n} `), `result ${i + 1}: ${texts[i]}`).toBe(true));
    await expect(page.getByTestId('network-proof')).toBeVisible();
  });

  test('a tool page whose worker was ready first makes no network request while it works', async ({ page }) => {
    await openTool(page, 'merge');
    await page.getByTestId('file-input').setInputFiles(files([
      { name: 'a.pdf', bytes: await pagesPdf(1) },
      { name: 'b.pdf', bytes: await pagesPdf(1) },
    ]));
    await expect(page.getByTestId('file-item')).toHaveCount(2);
    await run(page);
    await expect(page.getByTestId('network-proof')).toHaveAttribute('data-requests', '0');
    await expect(page.getByTestId('network-proof')).toContainText('Network requests while it worked: 0');
  });
});

test.describe('home', () => {
  test('the tools used last are at the top, most recent first', async ({ page }) => {
    await openTool(page, 'merge');
    await openTool(page, 'compress');
    await page.goto('/');
    const recent = page.getByTestId('recent-tools');
    await expect(recent).toBeVisible();
    await expect(recent.locator('a').first()).toHaveAttribute('data-testid', 'recent-compress');
    await expect(recent.locator('a').nth(1)).toHaveAttribute('data-testid', 'recent-merge');
    await recent.locator('a').first().click();
    await expect(page).toHaveURL(/\/tools\/compress\/$/);
  });

  test('on a phone, two tools to a row, each about a thumb high', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'a phone layout');
    await page.goto('/');
    const a = (await page.getByTestId('tool-card-merge').boundingBox())!;
    const b = (await page.getByTestId('tool-card-split').boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(a.height).toBeLessThan(150);
    // The summary is still there for a screen reader and the finder.
    await expect(page.getByTestId('tool-card-merge').locator('.tool-card__summary')).toHaveText(/Join several PDFs/);
  });
});
