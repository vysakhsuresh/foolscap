/**
 * The whole site, driven the way a person drives it, over the real-world
 * corpus (tests/realworld/build.sh): Open a file on every document, every
 * tool on a spread of documents from real producers, a whole folder, a
 * recipe, the reader and the drawing tools. Nothing here stops at the first
 * problem: every run is written to $REALWORLD_DIR/browser/*.jsonl and the
 * test fails at the end with the list, so one pass shows everything.
 *
 *   REALWORLD_DIR=/path E2E_PORT=4181 npx playwright test tests/e2e/realworld-browser.spec.ts
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { LIVE_TOOLS, type ToolId } from '../../app/src/ops/tools';
import { openPdf } from '../fixtures/inspect';
import { ORIGIN, openTool, useDownloads, waitReady } from './helpers';

const DIR = process.env['REALWORLD_DIR'] ?? '';
const ON = DIR !== '' && existsSync(join(DIR, 'pdf'));
const OUT = join(DIR, 'browser');
const PASSWORDS: Record<string, string> = { 'lo-report-locked.pdf': 'x' };

/** A spread: browsers, LibreOffice, scanners, phones, ReportLab, poppler, incremental saves, scripts. */
const SPREAD = [
  'chrome-invoice-gst.pdf', 'chrome-bank-statement.pdf', 'chrome-hindi-notice.pdf', 'chrome-malayalam-letter.pdf',
  'lo-report.pdf', 'lo-malayalam-leave.pdf', 'lo-study-pdfa-tagged.pdf', 'lo-report-restricted.pdf', 'lo-deck.pdf',
  'scan-salary-slip-ocr.pdf', 'scan-statement-image.pdf', 'im-salary-jp2.pdf', 'im-salary-cmyk.pdf', 'im-phone-invoice-oriented.pdf',
  'rl-mixed-sizes.pdf', 'rl-handbook-rotated.pdf', 'rl-bank-statement-long.pdf', 'incr-salary-slip-annotated.pdf',
  'cairo-chrome-invoice-gst.pdf', 'lo-report-locked.pdf',
];

type Run = { tool: string; docs: string[]; ms: number; produced: number; failed: string[]; skipped: string[]; problems: string[]; detail?: string };

function pdfPath(name: string): string {
  for (const d of ['pdf', 'private', 'corpus']) if (existsSync(join(DIR, d, name))) return join(DIR, d, name);
  throw new Error(`no ${name}`);
}

function mime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    } as Record<string, string>
  )[ext] ?? 'application/octet-stream';
}

function asFile(path: string) {
  return { name: basename(path), mimeType: mime(path), buffer: readFileSync(path) };
}

function record(file: string, entry: object): void {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(join(OUT, file), JSON.stringify(entry) + '\n');
}

/** Everything that went wrong on a page: script errors, console errors, a request to anywhere else. */
function watch(page: Page): () => string[] {
  const found: string[] = [];
  page.on('pageerror', (e) => found.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) found.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(ORIGIN)) found.push(`left the site: ${r.url()}`);
  });
  return () => found.splice(0);
}

/** Unlocks every locked row it knows the password for, once every file has been read. */
async function unlock(page: Page): Promise<void> {
  await expect(page.locator('.run__note')).not.toHaveText(/^Reading the file/, { timeout: 120_000 });
  for (const row of await page.getByTestId('file-item').all()) {
    const name = (await row.textContent()) ?? '';
    const known = Object.entries(PASSWORDS).find(([n]) => name.includes(n));
    const box = row.getByTestId('file-password');
    if (known && (await box.count()) > 0) {
      await box.fill(known[1]);
      await row.getByTestId('file-unlock').click();
      await expect(row.getByTestId('file-password')).toHaveCount(0, { timeout: 20_000 });
    }
  }
}

/** Fills what a tool needs before it can run, with everyday answers. */
async function settle(page: Page, tool: ToolId): Promise<void> {
  const fill = async (id: string, value: string) => {
    const box = page.getByTestId(id);
    if ((await box.count()) > 0 && (await box.isVisible())) await box.fill(value);
  };
  if (tool === 'extract-pages') await fill('opt-pages', '1');
  if (tool === 'add-password') {
    await fill('opt-password', 'tea');
    await fill('opt-confirm', 'tea');
  }
  if (tool === 'split-by-size') await fill('opt-megabytes', '1');
  if (tool === 'header-footer') await fill('opt-header', 'Confidential');
  if (tool === 'rent-receipts') {
    await fill('opt-tenant', 'Anjali Menon');
    await fill('opt-landlord', 'Joseph Mathew');
    await fill('opt-address', 'Flat 4B, Rose Gardens, Kakkanad, Kochi');
  }
}

/** Runs the tool if it can, and says what came out. */
async function runAndRead(page: Page, tool: string, docs: string[], take: () => string[]): Promise<Run> {
  const started = Date.now();
  const run: Run = { tool, docs, ms: 0, produced: 0, failed: [], skipped: [], problems: [] };
  const button = page.getByTestId('run-button');
  try {
    await expect(button).toBeEnabled({ timeout: 30_000 });
  } catch {
    run.problems.push(`the main button never became ready (${(await page.locator('.run__note').textContent())?.trim() ?? ''})`);
    run.problems.push(...take());
    return run;
  }
  await button.click();
  try {
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 240_000 });
  } catch {
    run.problems.push('no result within 4 minutes');
    run.problems.push(...take());
    run.ms = Date.now() - started;
    return run;
  }
  run.ms = Date.now() - started;
  run.produced = await page.getByTestId('result-item').count();
  run.failed = (await page.getByTestId('failure-item').allTextContents()).map((t) => t.trim().replace(/\s+/g, ' ').slice(0, 220));
  run.detail = (await page.getByTestId('result-detail').allTextContents()).slice(0, 3).join(' | ').slice(0, 300);
  // The first PDF out must open and read.
  const first = page.getByTestId('result-item').first();
  if (run.produced > 0 && ((await first.getAttribute('data-name')) ?? '').toLowerCase().endsWith('.pdf')) {
    const [download] = await Promise.all([page.waitForEvent('download'), first.getByTestId('save-button').click()]);
    const path = await download.path();
    try {
      const bytes = new Uint8Array(readFileSync(path));
      // A locked input comes back locked with its own password; Add a password locks with the one typed.
      const view = await openPdf(bytes).catch(() => openPdf(bytes, tool === 'add-password' ? 'tea' : 'x'));
      if (view.pageCount < 1) run.problems.push('a result PDF has no pages');
      await view.text(0).catch((e: Error) => run.problems.push(`a result PDF cannot be read: ${e.message}`));
      await view.close();
    } catch (e) {
      run.problems.push(`a result PDF does not open: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  // Previews drawn for the first results, never blank.
  const previews = await page.getByTestId('result-preview').count();
  if (previews > 0) {
    await page.waitForTimeout(1500);
    const blank = await page.getByTestId('result-preview').evaluateAll((cs) =>
      cs.filter((c) => {
        if (!(c instanceof HTMLCanvasElement) || c.width === 0) return true;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        const seen = new Set<number>();
        for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
        return seen.size < 2;
      }).length,
    );
    if (blank > 0) run.problems.push(`${blank} result preview(s) blank`);
  }
  // Every proof line counts no requests to anywhere else (it would be a policy breach).
  if ((await page.getByTestId('network-proof').count()) === 0) run.problems.push('no network proof under the result');
  run.problems.push(...take());
  return run;
}

test.describe('the real world, in the browser', () => {
  test.skip(!ON, 'needs the real-world corpus: REALWORLD_DIR');
  test.beforeEach(async ({ context }, info) => {
    test.skip(info.project.name !== 'laptop' && !info.title.includes('phone'), 'laptop, except the phone checks');
    await useDownloads(context);
  });

  test('Open a file: every document is read and gets sensible suggestions', async ({ page }) => {
    test.setTimeout(1_200_000);
    const take = watch(page);
    const problemsSeen: string[] = [];
    const docs = [
      ...readdirSync(join(DIR, 'pdf')).filter((f) => f.endsWith('.pdf')).map((f) => join(DIR, 'pdf', f)),
      ...(existsSync(join(DIR, 'corpus')) ? readdirSync(join(DIR, 'corpus')).filter((f) => f.endsWith('.pdf')).map((f) => join(DIR, 'corpus', f)) : []),
      ...(existsSync(join(DIR, 'private')) ? readdirSync(join(DIR, 'private')).map((f) => join(DIR, 'private', f)) : []),
      ...readdirSync(join(DIR, 'img')).map((f) => join(DIR, 'img', f)),
      ...readdirSync(join(DIR, 'office')).filter((f) => /\.(docx|xlsx|pptx)$/.test(f)).map((f) => join(DIR, 'office', f)),
    ];
    await page.goto('/open/');
    await waitReady(page);
    for (const path of docs) {
      const name = basename(path);
      const started = Date.now();
      const problems: string[] = [];
      await page.getByTestId('file-input').setInputFiles([asFile(path)]);
      let ideas: string[] = [];
      try {
        await expect(page.getByTestId('suggestions').locator('button').first()).toBeVisible({ timeout: 30_000 });
        ideas = await page.getByTestId('suggestions').locator('button').evaluateAll((b) => b.map((x) => (x.getAttribute('data-testid') ?? '').replace('suggest-', '')));
      } catch {
        problems.push('no suggestions within 30 s');
      }
      const facts = ((await page.getByTestId('open-file').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
      if (name === 'lo-report-locked.pdf' && ideas[0] !== 'remove-password') problems.push(`a locked file's first idea is ${ideas[0]}`);
      if (/^(scan-statement-image|scan-admit-card-image|im-)/.test(name) && name.endsWith('.pdf') && !ideas.slice(0, 3).includes('ocr')) problems.push(`a scan, but Make searchable is not in the first three: ${ideas.slice(0, 3).join(',')}`);
      if (name === 'lo-form.pdf' && !ideas.slice(0, 3).includes('fill-form')) problems.push(`a form, but Fill in a form is not in the first three: ${ideas.slice(0, 3).join(',')}`);
      problems.push(...take());
      record('open.jsonl', { name, ms: Date.now() - started, ideas: ideas.slice(0, 5), facts: facts.slice(0, 160), problems });
      if (problems.length) problemsSeen.push(`open ${name}: ${problems.join('; ')}`);
      const again = page.getByTestId('open-again');
      if (await again.isVisible()) await again.click();
      else {
        await page.goto('/open/');
        await waitReady(page);
      }
    }
    expect(problemsSeen).toEqual([]);
  });

  const BATCH = LIVE_TOOLS.filter((t) => t.input === 'several-pdfs' && !['insert-pages', 'compare'].includes(t.id)).map((t) => t.id);
  for (const tool of BATCH) {
    test(`${tool}: twenty real documents in one batch`, async ({ page }) => {
      test.setTimeout(1_500_000);
      const take = watch(page);
      const problemsSeen: string[] = [];
      await openTool(page, tool);
      const docs = SPREAD.map(pdfPath);
      await page.getByTestId('file-input').setInputFiles(docs.map(asFile));
      await expect(page.getByTestId('file-item')).toHaveCount(docs.length, { timeout: 60_000 });
      // Every row shows its first page, or its type.
      await page.waitForTimeout(2500);
      const thumbs = await page.getByTestId('file-thumb').count();
      if (thumbs < docs.length - 1) problemsSeen.push(`${tool}: only ${thumbs} of ${docs.length} rows show a picture`);
      await unlock(page);
      await settle(page, tool);
      const run = await runAndRead(page, tool, SPREAD, take);
      record('tools.jsonl', run);
      if (run.problems.length) problemsSeen.push(`${tool}: ${run.problems.join('; ')}`);
      expect(problemsSeen).toEqual([]);
    });
  }

  const ONE = LIVE_TOOLS.filter((t) => t.input === 'one-pdf' && ['split', 'organise', 'extract-pages', 'bookmarks', 'split-by-size', 'pdf-to-images', 'extract-images'].includes(t.id)).map((t) => t.id);
  for (const tool of ONE) {
    test(`${tool}: one real document at a time`, async ({ page }) => {
      test.setTimeout(1_500_000);
      const take = watch(page);
      const problemsSeen: string[] = [];
      for (const doc of SPREAD) {
        await openTool(page, tool);
        await page.getByTestId('file-input').setInputFiles([asFile(pdfPath(doc))]);
        await expect(page.getByTestId('file-item')).toHaveCount(1, { timeout: 30_000 });
        await unlock(page);
        await settle(page, tool);
        const run = await runAndRead(page, tool, [doc], take);
        record('tools.jsonl', run);
        if (run.problems.length) problemsSeen.push(`${tool} ${doc}: ${run.problems.join('; ')}`);
      }
      expect(problemsSeen).toEqual([]);
    });
  }

  test('two-file tools: insert pages and compare, on real pairs', async ({ page }) => {
    test.setTimeout(600_000);
    const take = watch(page);
    const problemsSeen: string[] = [];
    for (const [tool, a, b] of [
      ['insert-pages', 'lo-report.pdf', 'chrome-invoice-gst.pdf'],
      ['compare', 'chrome-invoice-gst.pdf', 'cairo-chrome-invoice-gst.pdf'],
      ['compare', 'lo-study.pdf', 'lo-study-hybrid.pdf'],
      ['compare', 'chrome-salary-slip.pdf', 'incr-salary-slip-annotated.pdf'],
    ] as const) {
      await openTool(page, tool);
      await page.getByTestId('file-input').setInputFiles([asFile(pdfPath(a)), asFile(pdfPath(b))]);
      await expect(page.getByTestId('file-item')).toHaveCount(2);
      const run = await runAndRead(page, tool, [a, b], take);
      record('tools.jsonl', run);
      if (run.problems.length) problemsSeen.push(`${tool} ${a}+${b}: ${run.problems.join('; ')}`);
    }
    expect(problemsSeen).toEqual([]);
  });

  test('photos, Word, Excel and PowerPoint: images to PDF, scan, office to PDF, attachments', async ({ page }) => {
    test.setTimeout(900_000);
    const take = watch(page);
    const problemsSeen: string[] = [];
    const images = readdirSync(join(DIR, 'img')).map((f) => join(DIR, 'img', f));
    await openTool(page, 'images-to-pdf');
    await page.getByTestId('file-input').setInputFiles(images.map(asFile));
    await expect(page.getByTestId('file-item')).toHaveCount(images.length);
    let run = await runAndRead(page, 'images-to-pdf', images.map((p) => basename(p)), take);
    record('tools.jsonl', run);
    if (run.problems.length) problemsSeen.push(`images-to-pdf: ${run.problems.join('; ')}`);

    for (const photo of images.filter((p) => /photo-|wa-|grey-/.test(p))) {
      await openTool(page, 'scan');
      await page.getByTestId('file-input').setInputFiles([asFile(photo)]);
      run = await runAndRead(page, 'scan', [basename(photo)], take);
      record('tools.jsonl', run);
      if (run.problems.length) problemsSeen.push(`scan ${basename(photo)}: ${run.problems.join('; ')}`);
    }

    const office = [...readdirSync(join(DIR, 'office')), ...readdirSync(join(DIR, 'office', 'lo')).map((f) => `lo/${f}`)].filter((f) => /\.(docx|xlsx)$/.test(f)).map((f) => join(DIR, 'office', f));
    for (const doc of office) {
      await openTool(page, 'office-to-pdf');
      await page.getByTestId('file-input').setInputFiles([asFile(doc)]);
      run = await runAndRead(page, 'office-to-pdf', [doc.replace(DIR, '')], take);
      record('tools.jsonl', run);
      if (run.problems.length) problemsSeen.push(`office-to-pdf ${basename(doc)}: ${run.problems.join('; ')}`);
    }

    await openTool(page, 'attachments');
    await page.getByTestId('file-input').setInputFiles([asFile(pdfPath('lo-report.pdf')), asFile(join(DIR, 'office', 'budget.xlsx')), asFile(images[0]!)]);
    run = await runAndRead(page, 'attachments', ['lo-report.pdf', 'budget.xlsx', basename(images[0]!)], take);
    record('tools.jsonl', run);
    if (run.problems.length) problemsSeen.push(`attachments: ${run.problems.join('; ')}`);
    expect(problemsSeen).toEqual([]);
  });

  test('a whole folder of real files into Merge, one locked, then a recipe over them', async ({ page }) => {
    test.setTimeout(900_000);
    const take = watch(page);
    const problemsSeen: string[] = [];
    await openTool(page, 'merge');
    await page.getByTestId('folder-input').setInputFiles(join(DIR, 'pdf'));
    const pdfs = readdirSync(join(DIR, 'pdf')).filter((f) => f.endsWith('.pdf')).length;
    await expect(page.getByTestId('file-item')).toHaveCount(pdfs, { timeout: 120_000 });
    await unlock(page);
    let run = await runAndRead(page, 'merge', [`folder of ${pdfs}`], take);
    record('tools.jsonl', run);
    if (run.problems.length) problemsSeen.push(`merge folder: ${run.problems.join('; ')}`);

    await page.goto('/open/');
    await waitReady(page);
    await page.getByTestId('recipe-new').click();
    await page.getByTestId('opt-recipe-name').fill('Office copy');
    for (const step of ['compress', 'page-numbers', 'watermark']) {
      await page.getByTestId('opt-recipe-tool').selectOption(step);
      await page.getByTestId('recipe-add-step').click();
    }
    await page.getByTestId('recipe-save').click();
    const docs = SPREAD.filter((d) => !PASSWORDS[d]).slice(0, 12).map(pdfPath);
    await page.getByTestId('file-input').setInputFiles(docs.map(asFile));
    await expect(page.getByTestId('recipe-run')).toHaveText(`Run on ${docs.length} PDFs`, { timeout: 60_000 });
    const started = Date.now();
    await page.getByTestId('recipe-run').click();
    await expect(page.getByTestId('result-item').first()).toBeVisible({ timeout: 600_000 });
    await page.waitForTimeout(500);
    run = { tool: 'recipe', docs: docs.map((d) => basename(d)), ms: Date.now() - started, produced: await page.getByTestId('result-item').count(), failed: await page.getByTestId('failure-item').allTextContents(), skipped: [], problems: take() };
    if (run.produced + run.failed.length !== docs.length) run.problems.push(`${docs.length} in, ${run.produced} out and ${run.failed.length} failed`);
    record('tools.jsonl', run);
    if (run.problems.length) problemsSeen.push(`recipe: ${run.problems.join('; ')}`);
    expect(problemsSeen).toEqual([]);
  });

  test('Read opens every document, finds a word, and shows its pages', async ({ page }) => {
    test.setTimeout(900_000);
    const take = watch(page);
    const problemsSeen: string[] = [];
    for (const doc of [...SPREAD, 'lo-form.pdf', 'chrome-form16.pdf']) {
      await openTool(page, 'read');
      await page.getByTestId('file-input').setInputFiles([asFile(pdfPath(doc))]);
      await unlock(page);
      const problems: string[] = [];
      try {
        await expect(page.getByTestId('reader-page').first()).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1200);
        const drawn = await page.locator('.reader__canvas').first().evaluate((c) => {
          const cv = c as HTMLCanvasElement;
          if (cv.width === 0) return false;
          const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
          const seen = new Set<number>();
          for (let i = 0; i < d.length; i += 4 * 131) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
          return seen.size > 1;
        });
        if (!drawn) problems.push('first page blank');
        await page.getByTestId('reader-find').fill('the');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);
      } catch (e) {
        problems.push(`did not open: ${(e as Error).message.split('\n')[0]}`);
      }
      problems.push(...take());
      record('read.jsonl', { doc, problems, found: await page.getByTestId('reader-find-count').textContent().catch(() => '') });
      if (problems.length) problemsSeen.push(`read ${doc}: ${problems.join('; ')}`);
    }
    expect(problemsSeen).toEqual([]);
  });

  test('the drawing tools open real documents and save a mark', async ({ page }) => {
    test.setTimeout(1_200_000);
    const take = watch(page);
    const problemsSeen: string[] = [];
    const docs = ['chrome-invoice-gst.pdf', 'lo-malayalam-leave.pdf', 'scan-salary-slip-ocr.pdf', 'rl-handbook-rotated.pdf', 'rl-mixed-sizes.pdf', 'im-phone-invoice-oriented.pdf', 'incr-salary-slip-annotated.pdf', ...(existsSync(join(DIR, 'private')) ? readdirSync(join(DIR, 'private')).filter((f) => f.endsWith('.pdf')) : [])];
    const stage = () => page.locator('[data-testid="editor-page"], .editor__page').first();
    const at = async (fx: number, fy: number) => {
      const box = (await stage().boundingBox())!;
      return [box.x + box.width * fx, box.y + box.height * fy] as const;
    };
    for (const tool of ['sign', 'add-text', 'remove-areas', 'mark-up', 'edit-text'] as const) {
      for (const doc of docs) {
        await openTool(page, tool);
        await page.getByTestId('file-input').setInputFiles([asFile(pdfPath(doc))]);
        const problems: string[] = [];
        try {
          await expect(stage()).toBeVisible({ timeout: 30_000 });
          await page.waitForTimeout(800);
          await stage().scrollIntoViewIfNeeded();
          if (tool === 'sign') {
            await page.getByTestId('signature-typed').fill('Anjali Menon');
            const [x, y] = await at(0.6, 0.8);
            await page.mouse.click(x, y);
          } else if (tool === 'add-text') {
            const box = page.locator('[data-testid="opt-text"], #opt-text').first();
            if (await box.count()) await box.fill('Received with thanks');
            const [x, y] = await at(0.3, 0.3);
            await page.mouse.click(x, y);
          } else if (tool === 'remove-areas' || tool === 'mark-up') {
            const [x0, y0] = await at(0.2, 0.2);
            const [x1, y1] = await at(0.5, 0.26);
            await page.mouse.move(x0, y0);
            await page.mouse.down();
            await page.mouse.move(x1, y1, { steps: 6 });
            await page.mouse.up();
          } else if (tool === 'edit-text') {
            // The first line of words on the page, tapped and changed.
            const line = await page.evaluate(() => {
              const s = document.querySelector('[data-testid="editor-page"], .editor__page')!.getBoundingClientRect();
              return [s.width, s.height];
            });
            let changed = false;
            for (let fy = 0.08; fy < 0.6 && !changed; fy += 0.04) {
              const [x, y] = await at(0.3, fy);
              await page.mouse.click(x, y);
              const words = page.getByTestId('opt-words');
              if ((await words.inputValue().catch(() => '')).trim().length > 1) {
                await words.fill('Changed words');
                changed = true;
              }
            }
            if (!changed) problems.push(`no line could be tapped (page ${line.join('x')})`);
          }
          const run = await runAndRead(page, tool, [doc], take);
          problems.push(...run.problems);
          record('draw.jsonl', { ...run, problems });
        } catch (e) {
          problems.push(`stopped: ${(e as Error).message.split('\n')[0]}`);
          problems.push(...take());
          record('draw.jsonl', { tool, doc, problems });
        }
        if (problems.length) problemsSeen.push(`${tool} ${doc}: ${problems.join('; ')}`);
      }
    }
    expect(problemsSeen).toEqual([]);
  });

  test('on a phone: merge, compress and sign with real documents', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    test.setTimeout(600_000);
    const take = watch(page);
    const problemsSeen: string[] = [];
    for (const tool of ['merge', 'compress'] as const) {
      await openTool(page, tool);
      const docs = ['chrome-invoice-gst.pdf', 'scan-salary-slip-ocr.pdf', 'lo-malayalam-leave.pdf', 'im-salary-jp2.pdf'];
      await page.getByTestId('file-input').setInputFiles(docs.map((d) => asFile(pdfPath(d))));
      const run = await runAndRead(page, tool, docs, take);
      record('phone.jsonl', run);
      if (run.problems.length) problemsSeen.push(`phone ${tool}: ${run.problems.join('; ')}`);
    }
    expect(problemsSeen).toEqual([]);
  });
});
