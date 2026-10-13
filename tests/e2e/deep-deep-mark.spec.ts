/**
 * The Mark up family, tested the way a person uses it: real-looking
 * documents in, every option a person can choose, and the result read back
 * and looked at — the words on the page, where the marks landed, their
 * colour, the form's answers — not just "a file came out".
 */
import { expect, test, type Page } from '@playwright/test';
import { encryptedPdf, pagesPdf, pdfInfo } from '../fixtures/pdfs';
import { annualReportPdf, applicationFormPdf, brochurePdf, leasePdf, whitePaintedPdf, orangePng, salarySlipPdf, logoPng, photoJpeg, sidewaysPhotoJpeg, turnedPagesPdf } from '../fixtures/mark-samples';
import { added, extent, isBlue, isGreen, isInk, isRed, isWhite, look, pixel, mean, notWhite, openPdf, share, type Box, type Word } from '../fixtures/mark-inspect';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

type Upload = { name: string; bytes: Uint8Array; mime?: string };

async function pick(page: Page, files: Upload[]): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files.map((f) => ({ name: f.name, mimeType: f.mime ?? 'application/pdf', buffer: Buffer.from(f.bytes) })));
  await expect(page.getByTestId('file-item')).toHaveCount(files.length);
  // Every file has been opened and counted.
  await expect(page.locator('[data-testid="file-item"] .file-item__meta').first()).toContainText(/page/);
}

/** Runs, and saves the `n`th result. */
async function runAndSave(page: Page, n = 0): Promise<{ name: string; bytes: Uint8Array }> {
  await run(page);
  return downloadFrom(page, page.getByTestId('save-button').nth(n));
}

/** Draws a signature-like scribble across the pad. */
async function scribble(page: Page): Promise<void> {
  const pad = await page.getByTestId('signature-pad').boundingBox();
  if (!pad) throw new Error('no pad');
  await page.mouse.move(pad.x + pad.width * 0.15, pad.y + pad.height * 0.6);
  await page.mouse.down();
  for (let k = 1; k <= 24; k++) await page.mouse.move(pad.x + pad.width * (0.15 + k * 0.03), pad.y + pad.height * (0.6 + 0.25 * Math.sin(k * 0.9)), { steps: 2 });
  await page.mouse.up();
}

/** Where on screen a point of the page in the editor is, from fractions of the page. */
async function onPage(page: Page, fx: number, fy: number): Promise<[number, number]> {
  // As a person would: scroll the page into the middle of the screen first.
  const layer = page.getByTestId('editor-layer');
  await layer.evaluate((el) => {
    // The site scrolls smoothly; a test that reads where the page is cannot wait on an animation.
    document.documentElement.style.setProperty('scroll-behavior', 'auto');
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  // Wait out any scrolling still under way (focusing a box scrolls smoothly).
  let box = await layer.boundingBox();
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(60);
    const again = await layer.boundingBox();
    if (again && box && again.y === box.y && again.x === box.x) break;
    box = again;
  }
  if (!box) throw new Error('no page');
  return [box.x + box.width * fx, box.y + box.height * fy];
}

async function tapPage(page: Page, fx: number, fy: number): Promise<void> {
  const [x, y] = await onPage(page, fx, fy);
  await page.mouse.click(x, y);
}

async function dragPage(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const [x0, y0] = await onPage(page, from[0], from[1]);
  const [x1, y1] = await onPage(page, to[0], to[1]);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
}

/** Steps the editor to page `n` (one-based). */
async function editorTo(page: Page, n: number): Promise<void> {
  const where = page.getByTestId('editor-where');
  await expect(where).toHaveText(/^Page \d+ of \d+$/);
  let current = Number(/Page (\d+)/.exec((await where.textContent()) ?? '')?.[1] ?? '1');
  while (current !== n) {
    const forward = current < n;
    await page.getByTestId(forward ? 'editor-next' : 'editor-prev').click();
    current += forward ? 1 : -1;
    await expect(where).toHaveText(new RegExp(`^Page ${current} of`));
  }
}

const centre = (b: Box): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];

/** The words on page `index` of `output` that were not on it in `input`, with the page's size as seen. */
async function newWords(input: Uint8Array, output: Uint8Array, index: number, password?: string): Promise<{ words: Word[]; width: number; height: number }> {
  const a = await openPdf(input, password);
  const b = await openPdf(output, password);
  try {
    const before = new Map<string, number>();
    for (const w of await a.words(index)) before.set(w.text, (before.get(w.text) ?? 0) + 1);
    const words: Word[] = [];
    for (const w of await b.words(index)) {
      const left = before.get(w.text) ?? 0;
      if (left > 0) before.set(w.text, left - 1);
      else words.push(w);
    }
    const { width, height } = await b.size(index);
    return { words, width, height };
  } finally {
    await a.close();
    await b.close();
  }
}

/** A neutral grey, lighter than ink: what a watermark is drawn in. */
const watermarkGrey = (r: number, g: number, b: number) => Math.abs(r - g) < 12 && Math.abs(g - b) < 14 && r > 120 && r < 248;

test.describe('watermark', () => {
  test('stamps DRAFT across the middle of every page of a report, keeping its words', async ({ page }) => {
    const { bytes } = await annualReportPdf();
    await openTool(page, 'watermark');
    await expect(page.getByTestId('opt-text')).toHaveValue('DRAFT');
    await expect(page.getByTestId('opt-strength-medium')).toBeChecked();
    await expect(page.getByTestId('opt-layout-once')).toBeChecked();
    await pick(page, [{ name: 'Annual report.pdf', bytes }]);
    const out = await runAndSave(page);
    expect(out.name).toBe('Annual report watermarked.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('"DRAFT" across 3 pages');
    const pdf = await openPdf(out.bytes);
    expect(pdf.pageCount).toBe(3);
    for (let i = 0; i < 3; i++) {
      const words = await pdf.words(i);
      const draft = words.filter((w) => w.text === 'DRAFT');
      expect(draft, `page ${i + 1}`).toHaveLength(1);
      expect(draft[0]!.angle).toBe(45);
      expect(await pdf.text(i)).toContain(`Page ${i + 1}`);
      const box = extent(await added(bytes, out.bytes, i), notWhite);
      expect(box).not.toBeNull();
      // Centred, and inside the page.
      expect(Math.abs(box!.x + box!.w / 2 - 0.5)).toBeLessThan(0.08);
      expect(Math.abs(box!.y + box!.h / 2 - 0.5)).toBeLessThan(0.08);
      expect(box!.x).toBeGreaterThan(0.01);
      expect(box!.x + box!.w).toBeLessThan(0.99);
    }
    await pdf.close();
  });

  test('strong is darker than light, and long words always stay inside the page', async ({ page }) => {
    const darkness: number[] = [];
    const input = await pagesPdf(1);
    for (const strength of ['light', 'strong'] as const) {
      await openTool(page, 'watermark');
      await pick(page, [{ name: 'Blank.pdf', bytes: input }]);
      await page.getByTestId('opt-text').fill('MALABAR MOTORS PRIVATE LIMITED');
      await page.getByTestId(`opt-strength-${strength}`).check();
      const out = await runAndSave(page);
      const diff = await added(input, out.bytes, 0, 1);
      const box = extent(diff, notWhite);
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThan(0);
      expect(box!.y).toBeGreaterThan(0);
      expect(box!.x + box!.w).toBeLessThan(1);
      expect(box!.y + box!.h).toBeLessThan(1);
      // How dark the letters are where they cross plain paper.
      darkness.push(255 - mean(diff, { x: 0, y: 0, w: 1, h: 0.5 }, notWhite)[0]);
    }
    expect(darkness[1]!).toBeGreaterThan(darkness[0]! * 2.5);
  });

  test('repeated all over covers the whole page, corners included', async ({ page }) => {
    await openTool(page, 'watermark');
    await pick(page, [{ name: 'Lease copy.pdf', bytes: (await annualReportPdf()).bytes }]);
    await page.getByTestId('opt-text').fill('COPY');
    await page.getByTestId('opt-layout-tiled').check();
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('"COPY" repeated across 3 pages');
    const pdf = await openPdf(out.bytes);
    const words = await pdf.words(0);
    expect(words.filter((w) => w.text === 'COPY').length).toBeGreaterThan(20);
    const picture = await pdf.render(0, 0.5);
    for (const [x, y] of [[0, 0], [0.75, 0], [0, 0.75], [0.75, 0.75]] as const) {
      expect(share(picture, { x, y, w: 0.25, h: 0.25 }, watermarkGrey), `corner ${x},${y}`).toBeGreaterThan(0.005);
    }
    await pdf.close();
  });

  test('on pages turned sideways or upside down it still reads diagonally, the right way up', async ({ page }) => {
    await openTool(page, 'watermark');
    const input = await turnedPagesPdf();
    await pick(page, [{ name: 'Scans.pdf', bytes: input }]);
    const out = await runAndSave(page);
    const pdf = await openPdf(out.bytes);
    for (let i = 0; i < 4; i++) {
      const draft = (await pdf.words(i)).find((w) => w.text === 'DRAFT');
      expect(draft?.angle, `page ${i + 1}`).toBe(45);
      const box = extent(await added(input, out.bytes, i, 0.4), notWhite);
      expect(Math.abs(box!.x + box!.w / 2 - 0.5)).toBeLessThan(0.08);
      expect(Math.abs(box!.y + box!.h / 2 - 0.5)).toBeLessThan(0.08);
    }
    await pdf.close();
  });

  test('a batch gets one watermarked file each, and a locked file stays locked', async ({ page }) => {
    await openTool(page, 'watermark');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'Quote.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pagesPdf(2)) },
      { name: 'Statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await encryptedPdf('kochi')) },
    ]);
    await page.getByTestId('file-password').fill('kochi');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('run-button')).toBeEnabled();
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(2);
    await expect(page.getByTestId('result-detail').nth(1)).toHaveText('"DRAFT" across 2 pages, still locked with the same password');
    const locked = await downloadFrom(page, page.getByTestId('save-button').nth(1));
    expect((await pdfInfo(locked.bytes)).encrypted).toBe(true);
    const pdf = await openPdf(locked.bytes, 'kochi');
    expect(await pdf.text(0)).toContain('DRAFT');
    await pdf.close();
  });

  test('in red, straight across, on the pages typed only', async ({ page }) => {
    const { bytes } = await annualReportPdf();
    await openTool(page, 'watermark');
    await pick(page, [{ name: 'Report.pdf', bytes }]);
    await page.getByTestId('opt-text').fill('VOID');
    await page.getByTestId('opt-wm-colour-red').check();
    await page.getByTestId('opt-layout-straight').check();
    await page.getByTestId('opt-pages').fill('2-3');
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('"VOID" across pages 2-3');
    const pdf = await openPdf(out.bytes);
    expect(await pdf.text(0)).not.toContain('VOID');
    for (const i of [1, 2]) {
      const word = (await pdf.words(i)).find((w) => w.text === 'VOID');
      expect(word?.angle, `page ${i + 1}`).toBe(0);
      const diff = await added(bytes, out.bytes, i);
      const [r, g, b] = mean(diff, { x: 0, y: 0, w: 1, h: 1 }, notWhite);
      expect(r).toBeGreaterThan(g + 20);
      expect(r).toBeGreaterThan(b + 20);
    }
    expect(extent(await added(bytes, out.bytes, 0), notWhite)).toBeNull();
    await pdf.close();
  });

  test('pages typed that are not in the file are refused in words', async ({ page }) => {
    await openTool(page, 'watermark');
    await pick(page, [{ name: 'Two pages.pdf', bytes: await pagesPdf(2) }]);
    await page.getByTestId('opt-pages').fill('7-9');
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('This file has 2 pages; none of the pages typed are in it.');
  });

  test('any language: Malayalam and Russian go on as a picture of the words', async ({ page }) => {
    const input = await pagesPdf(2);
    for (const words of ['കരട്', 'ЧЕРНОВИК']) {
      await openTool(page, 'watermark');
      await pick(page, [{ name: 'Notice.pdf', bytes: input }]);
      await page.getByTestId('opt-text').fill(words);
      const out = await runAndSave(page);
      await expect(page.getByTestId('result-detail')).toHaveText(`"${words}" across 2 pages`);
      await look(out.bytes, 0, `watermark-${words}`);
      for (const i of [0, 1]) {
        const box = extent(await added(input, out.bytes, i, 1), notWhite);
        expect(box, `${words} on page ${i + 1}`).not.toBeNull();
        expect(Math.abs(box!.x + box!.w / 2 - 0.5)).toBeLessThan(0.1);
        expect(box!.w).toBeGreaterThan(0.3);
      }
    }
  });

  test('needs words before it runs', async ({ page }) => {
    await openTool(page, 'watermark');
    await pick(page, [{ name: 'Quote.pdf', bytes: await pagesPdf(1) }]);
    await page.getByTestId('opt-text').fill('   ');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type the watermark text.');
  });
});


test.describe('page numbers', () => {
  test('numbers every page of a report at the bottom, in the middle, on portrait and landscape pages alike', async ({ page }) => {
    const { bytes } = await annualReportPdf();
    await openTool(page, 'page-numbers');
    await expect(page.getByTestId('opt-position')).toHaveValue('bottom-center');
    await expect(page.getByTestId('opt-format')).toHaveValue('n');
    await expect(page.getByTestId('opt-start')).toHaveValue('1');
    await pick(page, [{ name: 'Annual report.pdf', bytes }]);
    const out = await runAndSave(page);
    expect(out.name).toBe('Annual report numbered.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('Numbered 1 to 3');
    for (let i = 0; i < 3; i++) {
      const { words, width, height } = await newWords(bytes, out.bytes, i);
      expect(words.map((w) => w.text)).toEqual([String(i + 1)]);
      const w = words[0]!;
      expect(w.upright).toBe(true);
      expect(Math.abs(w.x + w.width / 2 - width / 2)).toBeLessThan(2);
      expect(w.y).toBeGreaterThan(height - 40);
      expect(w.y).toBeLessThan(height - 15);
    }
  });

  for (const [position, horizontal, vertical] of [
    ['bottom-right', 'right', 'bottom'],
    ['bottom-left', 'left', 'bottom'],
    ['top-center', 'center', 'top'],
    ['top-right', 'right', 'top'],
    ['top-left', 'left', 'top'],
  ] as const) {
    test(`can sit ${position}, upright on pages turned any way`, async ({ page }) => {
      const input = await turnedPagesPdf();
      await openTool(page, 'page-numbers');
      await pick(page, [{ name: 'Scans.pdf', bytes: input }]);
      await page.getByTestId('opt-position').selectOption(position);
      await page.getByTestId('opt-format').selectOption('page-n-of-total');
      const out = await runAndSave(page);
      for (let i = 0; i < 4; i++) {
        const { words, width, height } = await newWords(input, out.bytes, i);
        expect(words.map((w) => w.text).join(' '), `page ${i + 1}`).toBe(`Page ${i + 1} of 4`);
        const left = Math.min(...words.map((w) => w.x));
        const right = Math.max(...words.map((w) => w.x + w.width));
        const y = words[0]!.y;
        expect(words.every((w) => w.upright)).toBe(true);
        if (horizontal === 'left') expect(left).toBeLessThan(60);
        if (horizontal === 'right') expect(right).toBeGreaterThan(width - 60);
        if (horizontal === 'center') expect(Math.abs((left + right) / 2 - width / 2)).toBeLessThan(3);
        if (vertical === 'top') expect(y).toBeLessThan(50);
        else expect(y).toBeGreaterThan(height - 40);
        expect(left).toBeGreaterThan(5);
        expect(right).toBeLessThan(width - 5);
      }
    });
  }

  test('leaves a cover unnumbered and starts where it is told, "of" counting the numbered pages', async ({ page }) => {
    const input = await pagesPdf(4);
    await openTool(page, 'page-numbers');
    await pick(page, [{ name: 'Thesis.pdf', bytes: input }]);
    await page.getByTestId('opt-format').selectOption('n-of-total');
    await page.getByTestId('opt-start').fill('5');
    await page.getByTestId('opt-skip-first').check();
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Pages 2 to 4 numbered 5 to 7; cover left blank');
    expect((await newWords(input, out.bytes, 0)).words).toEqual([]);
    for (const [i, n] of [[1, 5], [2, 6], [3, 7]] as const) {
      expect((await newWords(input, out.bytes, i)).words.map((w) => w.text).join(' ')).toBe(`${n} of 7`);
    }
  });

  test('an emptied first-number box is caught rather than numbering from 0', async ({ page }) => {
    await openTool(page, 'page-numbers');
    await pick(page, [{ name: 'Deck.pdf', bytes: await pagesPdf(2) }]);
    await page.getByTestId('opt-start').fill('');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type the first number: a whole number from 0 to 100,000.');
    await page.getByTestId('opt-start').fill('0');
    await expect(page.getByTestId('run-button')).toBeEnabled();
  });

  test('Bates numbers run through a batch as one sequence, in the order the files were added', async ({ page }) => {
    const a = await pagesPdf(3);
    const b = (await annualReportPdf()).bytes;
    await openTool(page, 'page-numbers');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'Exhibit A.pdf', mimeType: 'application/pdf', buffer: Buffer.from(a) },
      { name: 'Exhibit B.pdf', mimeType: 'application/pdf', buffer: Buffer.from(b) },
    ]);
    await expect(page.getByTestId('file-item')).toHaveCount(2);
    await page.getByTestId('opt-format').selectOption('bates');
    await expect(page.getByTestId('opt-skip-first')).toBeHidden();
    await page.getByTestId('opt-prefix').fill('ACME-');
    await page.getByTestId('opt-position').selectOption('bottom-right');
    await run(page);
    const items = page.getByTestId('result-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-name', 'Exhibit A (Bates ACME-000001).pdf');
    await expect(items.nth(1)).toHaveAttribute('data-name', 'Exhibit B (Bates ACME-000004).pdf');
    await expect(page.getByTestId('result-detail').nth(0)).toHaveText('Bates numbered ACME-000001 to ACME-000003');
    await expect(page.getByTestId('result-detail').nth(1)).toHaveText('Bates numbered ACME-000004 to ACME-000006');
    const second = await downloadFrom(page, page.getByTestId('save-button').nth(1));
    for (let i = 0; i < 3; i++) {
      const { words, width } = await newWords(b, second.bytes, i);
      expect(words.map((w) => w.text)).toEqual([`ACME-${String(4 + i).padStart(6, '0')}`]);
      expect(words[0]!.x + words[0]!.width).toBeGreaterThan(width - 40);
    }
  });
});

test.describe('header and footer', () => {
  test('fills in the file name, page and total, and keeps header and footer where each was put', async ({ page }) => {
    const { bytes } = await annualReportPdf();
    await openTool(page, 'header-footer');
    await pick(page, [{ name: 'Annual report.pdf', bytes }]);
    await page.getByTestId('opt-header').fill('Kochi Transit Users Forum - CONFIDENTIAL');
    await page.getByTestId('opt-align-left').check();
    await page.getByTestId('opt-footer').fill('{name} – page {page} of {total}');
    await page.getByTestId('opt-footer-align-right').check();
    const out = await runAndSave(page);
    expect(out.name).toBe('Annual report with header and footer.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('Header and footer on 3 pages');
    for (let i = 0; i < 3; i++) {
      const { words, width, height } = await newWords(bytes, out.bytes, i);
      const top = words.filter((w) => w.y < height / 2);
      const bottom = words.filter((w) => w.y > height / 2);
      expect(top.map((w) => w.text).join(' ')).toBe('Kochi Transit Users Forum - CONFIDENTIAL');
      expect(bottom.map((w) => w.text).join(' ')).toBe(`Annual report – page ${i + 1} of 3`);
      expect(Math.min(...top.map((w) => w.x))).toBeLessThan(40);
      expect(Math.max(...bottom.map((w) => w.x + w.width))).toBeGreaterThan(width - 40);
      expect(Math.max(...bottom.map((w) => w.x + w.width))).toBeLessThan(width - 5);
      expect(top[0]!.y).toBeLessThan(45);
      expect(bottom[0]!.y).toBeGreaterThan(height - 35);
    }
  });

  test('puts today’s date in, and can leave a cover page plain', async ({ page }) => {
    const input = await pagesPdf(3);
    await openTool(page, 'header-footer');
    await pick(page, [{ name: 'Minutes.pdf', bytes: input }]);
    await page.getByTestId('opt-header').fill('Minutes of {date}');
    await page.getByTestId('opt-skip-first').check();
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Header on pages 2 to 3; the first page left plain');
    const d = new Date();
    const today = `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
    expect((await newWords(input, out.bytes, 0)).words).toEqual([]);
    expect((await newWords(input, out.bytes, 2)).words.map((w) => w.text).join(' ')).toBe(`Minutes of ${today}`);
  });

  test('a long header is made smaller to fit the page, never cut off', async ({ page }) => {
    const input = await pagesPdf(1);
    await openTool(page, 'header-footer');
    await pick(page, [{ name: 'Narrow.pdf', bytes: input }]);
    const long = 'This document is the property of Malabar Motors Private Limited and must not be copied or shared';
    await page.getByTestId('opt-header').fill(long);
    const out = await runAndSave(page);
    const { words, width } = await newWords(input, out.bytes, 0);
    expect(words.map((w) => w.text).join(' ')).toBe(long);
    expect(Math.min(...words.map((w) => w.x))).toBeGreaterThan(0);
    expect(Math.max(...words.map((w) => w.x + w.width))).toBeLessThan(width);
  });

  test('a file named in Malayalam still gets its {name}, and a header in Hindi goes on too', async ({ page }) => {
    const input = await pagesPdf(2);
    await openTool(page, 'header-footer');
    await pick(page, [{ name: 'വാടക കരാർ.pdf', bytes: input }]);
    await page.getByTestId('opt-header').fill('गोपनीय');
    await page.getByTestId('opt-footer').fill('{name} – {page}/{total}');
    const out = await runAndSave(page);
    // (Headless Chromium names any non-ASCII download "download"; the page's own name is the one to check.)
    await expect(page.getByTestId('result-item')).toHaveAttribute('data-name', 'വാടക കരാർ with header and footer.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('Header and footer on 2 pages');
    await look(out.bytes, 0, 'header-footer-malayalam');
    for (const i of [0, 1]) {
      const diff = await added(input, out.bytes, i, 1);
      expect(extent(diff, notWhite) , `page ${i + 1}`).not.toBeNull();
      expect(share(diff, { x: 0.2, y: 0, w: 0.6, h: 0.12 }, notWhite), 'header').toBeGreaterThan(0.002);
      expect(share(diff, { x: 0.2, y: 0.88, w: 0.6, h: 0.12 }, notWhite), 'footer').toBeGreaterThan(0.002);
    }
  });
});

test.describe('sign', () => {
  test('a drawn signature lands on the page and spot it was put, in blue, and nowhere else', async ({ page }) => {
    const input = await leasePdf();
    await openTool(page, 'sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Draw your signature, then tap the page where it goes.');
    await scribble(page);
    await expect(page.locator('.run__note')).toHaveText('Tap the page where your signature goes.');
    await editorTo(page, 2);
    await tapPage(page, 0.55, 0.17);
    await expect(page.getByTestId('editor-item')).toHaveCount(1);
    const out = await runAndSave(page);
    expect(out.name).toBe('Lease (signed).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('Signed on page 2');
    expect(extent(await added(input, out.bytes, 0), notWhite)).toBeNull();
    const diff = await added(input, out.bytes, 1, 1);
    const box = extent(diff, notWhite)!;
    const [cx, cy] = centre(box);
    expect(Math.abs(cx - 0.55)).toBeLessThan(0.04);
    expect(Math.abs(cy - 0.17)).toBeLessThan(0.04);
    // About a third of the page wide, as placed.
    expect(box.w).toBeGreaterThan(0.2);
    expect(box.w).toBeLessThan(0.34);
    expect(share(diff, box, isBlue)).toBeGreaterThan(0.03);
    // The words on the page are all still there.
    const pdf = await openPdf(out.bytes);
    expect(await pdf.text(1)).toContain('Tenant:');
    await pdf.close();
  });

  test('a typed name, switched to black ink after typing, signs in black, in two places', async ({ page }) => {
    const input = await leasePdf();
    await openTool(page, 'sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await page.getByTestId('signature-typed').fill('Anjali Menon');
    await page.getByTestId('opt-ink-black').check();
    await tapPage(page, 0.5, 0.85);
    await editorTo(page, 2);
    await tapPage(page, 0.6, 0.24);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Signed in 2 places across 2 pages');
    for (const [i, x, y] of [[0, 0.5, 0.85], [1, 0.6, 0.24]] as const) {
      const diff = await added(input, out.bytes, i, 1);
      const box = extent(diff, notWhite)!;
      const [cx, cy] = centre(box);
      expect(Math.abs(cx - x), `page ${i + 1}`).toBeLessThan(0.04);
      expect(Math.abs(cy - y), `page ${i + 1}`).toBeLessThan(0.04);
      expect(share(diff, box, isBlue), `no blue on page ${i + 1}`).toBe(0);
      expect(share(diff, box, isInk), `black ink on page ${i + 1}`).toBeGreaterThan(0.02);
    }
  });

  test('a placed signature can be moved and made bigger, and undo and × take signatures off', async ({ page }) => {
    const input = await leasePdf();
    await openTool(page, 'sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await scribble(page);
    await tapPage(page, 0.3, 0.3);
    await tapPage(page, 0.7, 0.7);
    await expect(page.getByTestId('editor-item')).toHaveCount(2);
    await page.getByTestId('editor-undo').click();
    await expect(page.getByTestId('editor-item')).toHaveCount(1);
    // Drag it from (0.3, 0.3) to (0.5, 0.8)…
    await dragPage(page, [0.3, 0.3], [0.5, 0.8]);
    // …then pull its corner out to make it half again as wide.
    const handle = page.locator('.editor__item.is-selected .editor__resize');
    const hb = (await handle.boundingBox())!;
    const layer = (await page.getByTestId('editor-layer').boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + layer.width * 0.16, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Signed on page 1');
    const box = extent(await added(input, out.bytes, 0, 1), notWhite)!;
    // Its top-left corner stayed where the move put it, and it grew to the right and down.
    expect(Math.abs(box.x - (0.5 - 0.16))).toBeLessThan(0.04);
    expect(box.w).toBeGreaterThan(0.38);
    expect(box.y).toBeGreaterThan(0.7);

    await page.getByTestId('start-over').click();
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await scribble(page);
    await tapPage(page, 0.5, 0.5);
    await page.getByTestId('editor-remove').click();
    await expect(page.getByTestId('editor-item')).toHaveCount(0);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await page.getByTestId('signature-clear').click();
    await expect(page.locator('.run__note')).toHaveText('Draw your signature, then tap the page where it goes.');
  });
});

test.describe('add text', () => {
  test('writes what was typed exactly where the page was tapped, at the size and colour chosen', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'add-text');
    await pick(page, [{ name: 'Form.pdf', bytes: input }]);
    await expect(page.getByTestId('opt-size-medium')).toBeChecked();
    await expect(page.getByTestId('opt-color-black')).toBeChecked();
    await page.getByTestId('opt-text').fill('Anjali Menon');
    await tapPage(page, 0.3, 0.2);
    await page.getByTestId('opt-size-large').check();
    await page.getByTestId('opt-color-red').check();
    await expect(page.locator('.editor__item--text')).toHaveCount(1);
    // A second piece, two lines, small and blue, on page 2.
    await editorTo(page, 2);
    await page.getByTestId('opt-size-small').check();
    await page.getByTestId('opt-color-blue').check();
    await tapPage(page, 0.1, 0.5);
    await page.getByTestId('opt-text').fill('Flat 4B, Rose Gardens\nKakkanad, Kochi 682030');
    const out = await runAndSave(page);
    expect(out.name).toBe('Form (with text).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('2 pieces of text added across 2 pages');
    const pdf = await openPdf(out.bytes);
    const { width, height } = await pdf.size(0);
    const name = (await pdf.words(0)).find((w) => w.text === 'Anjali Menon')!;
    expect(name).toBeDefined();
    // Large is 5% of the page's width; its top-left is where the page was tapped.
    expect(name.size).toBeCloseTo(0.05 * width, 0);
    expect(Math.abs(name.x - 0.3 * width)).toBeLessThan(4);
    expect(Math.abs(name.y - (0.2 * height + 0.97 * name.size))).toBeLessThan(4);
    expect(share(await added(input, out.bytes, 0, 1), { x: 0.28, y: 0.18, w: 0.5, h: 0.08 }, isRed)).toBeGreaterThan(0.01);
    const lines = (await pdf.words(1)).filter((w) => w.text.includes('Rose') || w.text.includes('Kakkanad'));
    expect(lines.map((w) => w.text)).toEqual(['Flat 4B, Rose Gardens', 'Kakkanad, Kochi 682030']);
    expect(lines[0]!.size).toBeCloseTo(0.024 * width, 0);
    expect(Math.abs(lines[0]!.x - 0.1 * width)).toBeLessThan(4);
    expect(lines[1]!.y - lines[0]!.y).toBeCloseTo(lines[0]!.size * 1.25, 0);
    expect(share(await added(input, out.bytes, 1, 1), { x: 0.08, y: 0.48, w: 0.6, h: 0.08 }, isBlue)).toBeGreaterThan(0.005);
    await pdf.close();
  });

  test('text already placed can be tapped and changed, and dragged somewhere else', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'add-text');
    await pick(page, [{ name: 'Form.pdf', bytes: input }]);
    await page.getByTestId('opt-text').fill('Ravi');
    await tapPage(page, 0.2, 0.3);
    await tapPage(page, 0.6, 0.6);
    await page.getByTestId('opt-text').fill('second');
    // Back to the first: tapping it selects it, and the box shows its words.
    await tapPage(page, 0.21, 0.31);
    await expect(page.getByTestId('opt-text')).toHaveValue('Ravi');
    await page.getByTestId('opt-text').fill('Ravi Kumar');
    await dragPage(page, [0.21, 0.31], [0.41, 0.11]);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 pieces of text added');
    const pdf = await openPdf(out.bytes);
    const { width, height } = await pdf.size(0);
    const words = await pdf.words(0);
    const ravi = words.find((w) => w.text === 'Ravi Kumar')!;
    expect(ravi).toBeDefined();
    expect(Math.abs(ravi.x - 0.4 * width)).toBeLessThan(5);
    expect(Math.abs(ravi.y - 0.97 * ravi.size - 0.1 * height)).toBeLessThan(5);
    expect(words.find((w) => w.text === 'second')).toBeDefined();
    expect(words.find((w) => w.text === 'Ravi')).toBeUndefined();
    await pdf.close();
  });

  test('Malayalam goes on as a picture of the words, where it was put', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'add-text');
    await pick(page, [{ name: 'Form.pdf', bytes: input }]);
    await page.getByTestId('opt-text').fill('അഞ്ജലി മേനോൻ');
    await tapPage(page, 0.25, 0.4);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 piece of text added');
    await look(out.bytes, 0, 'add-text-malayalam');
    const box = extent(await added(input, out.bytes, 0, 1), notWhite)!;
    expect(box).not.toBeNull();
    expect(Math.abs(box.x - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(box.y - 0.4)).toBeLessThan(0.03);
  });

  test('on a page turned sideways the words read the right way up, where they were put', async ({ page }) => {
    const input = await turnedPagesPdf();
    await openTool(page, 'add-text');
    await pick(page, [{ name: 'Scans.pdf', bytes: input }]);
    await editorTo(page, 2);
    await page.getByTestId('opt-text').fill('Checked');
    await tapPage(page, 0.5, 0.5);
    const out = await runAndSave(page);
    const pdf = await openPdf(out.bytes);
    const { width, height } = await pdf.size(1);
    const word = (await pdf.words(1)).find((w) => w.text === 'Checked')!;
    expect(word.upright).toBe(true);
    expect(Math.abs(word.x - 0.5 * width)).toBeLessThan(4);
    expect(Math.abs(word.y - 0.97 * word.size - 0.5 * height)).toBeLessThan(4);
    await pdf.close();
  });
});

/** A plain two-page A4 document with a little text on each page. */
async function applicationBlank(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) doc.addPage([595.28, 841.89]).drawText(`Application, page ${i + 1}`, { x: 56, y: 790, size: 12, font });
  return new Uint8Array(await doc.save());
}

/** The images a PDF holds: each one's pixel size and how it is stored. */
async function imagesIn(bytes: Uint8Array): Promise<Array<{ width: number; height: number; filter: string; mask: boolean }>> {
  const { PDFDocument, PDFName, PDFRawStream, PDFNumber } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const out: Array<{ width: number; height: number; filter: string; mask: boolean }> = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
    const n = (key: string) => (object.dict.lookup(PDFName.of(key)) as InstanceType<typeof PDFNumber>).asNumber();
    out.push({ width: n('Width'), height: n('Height'), filter: String(object.dict.lookup(PDFName.of('Filter')) ?? ''), mask: object.dict.has(PDFName.of('SMask')) });
  }
  return out;
}

test.describe('add image', () => {
  test('a landscape photo goes where the page was tapped, its shape kept, still a JPEG', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'add-image');
    await pick(page, [{ name: 'Form.pdf', bytes: input }]);
    await expect(page.locator('.run__note')).toHaveText('Choose a picture, then tap the page where it goes.');
    await page.getByTestId('opt-picture').setInputFiles({ name: 'House.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await photoJpeg(1600, 1000)) });
    await expect(page.locator('.picture-pick__words')).toHaveText('Now tap the page where it goes. Choose again to change it.');
    await tapPage(page, 0.5, 0.4);
    const out = await runAndSave(page);
    expect(out.name).toBe('Form (with picture).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('1 picture placed');
    const pdf = await openPdf(out.bytes);
    const { width, height } = await pdf.size(0);
    await pdf.close();
    const box = extent(await added(input, out.bytes, 0, 1), notWhite)!;
    expect(box.w).toBeCloseTo(0.4, 1);
    // 1600 × 1000 kept: as tall as it is wide over 1.6, on this page.
    expect((box.h * height) / (box.w * width)).toBeCloseTo(1000 / 1600, 1);
    const [cx, cy] = centre(box);
    expect(Math.abs(cx - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(cy - 0.4)).toBeLessThan(0.02);
    const images = await imagesIn(out.bytes);
    expect(images).toHaveLength(1);
    expect(images[0]!.filter).toBe('/DCTDecode');
    expect(images[0]!.width).toBe(1600);
  });

  test('a logo with a see-through background keeps it, over the words beneath', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'add-image');
    await pick(page, [{ name: 'Letterhead.pdf', bytes: input }]);
    await page.getByTestId('opt-picture').setInputFiles({ name: 'Logo.png', mimeType: 'image/png', buffer: Buffer.from(await logoPng(400)) });
    await expect(page.locator('.picture-pick__words')).toHaveText(/Now tap the page/);
    // Over the line of words at the top left.
    await tapPage(page, 0.2, 0.07);
    const out = await runAndSave(page);
    await look(out.bytes, 0, 'add-image-logo');
    const pdf = await openPdf(out.bytes);
    const picture = await pdf.render(0, 1);
    const box = extent(await added(input, out.bytes, 0, 1), notWhite)!;
    // The disc is green; outside it, in the corners of its square, the page shows through.
    expect(share(picture, { x: box.x + box.w * 0.45, y: box.y + box.h * 0.08, w: box.w * 0.1, h: box.h * 0.05 }, isGreen)).toBeGreaterThan(0.8);
    expect(share(picture, { x: box.x, y: box.y + box.h - box.h * 0.08, w: box.w * 0.08, h: box.h * 0.08 }, isWhite)).toBeGreaterThan(0.8);
    expect(await pdf.text(0)).toContain('Application, page 1');
    await pdf.close();
    const images = await imagesIn(out.bytes);
    expect(images.some((i) => i.mask)).toBe(true);
  });

  test('a phone photo taken sideways comes out the right way up', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'add-image');
    await pick(page, [{ name: 'ID.pdf', bytes: input }]);
    await page.getByTestId('opt-picture').setInputFiles({ name: 'IMG_2041.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await sidewaysPhotoJpeg(800, 600)) });
    await expect(page.locator('.picture-pick__words')).toHaveText(/Now tap the page/);
    await tapPage(page, 0.5, 0.5);
    const out = await runAndSave(page);
    const pdf = await openPdf(out.bytes);
    const { width, height } = await pdf.size(0);
    const picture = await pdf.render(0, 1);
    await pdf.close();
    const box = extent(await added(input, out.bytes, 0, 1), notWhite)!;
    // Seen 600 wide and 800 tall, red on top.
    expect((box.h * height) / (box.w * width)).toBeCloseTo(800 / 600, 1);
    expect(share(picture, { x: box.x, y: box.y, w: box.w, h: box.h * 0.45 }, isRed)).toBeGreaterThan(0.9);
    expect(share(picture, { x: box.x, y: box.y + box.h * 0.55, w: box.w, h: box.h * 0.45 }, isBlue)).toBeGreaterThan(0.9);
  });

  test('a big photo is kept sharp but light; another picture can be chosen for the next spot', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'add-image');
    await pick(page, [{ name: 'Album.pdf', bytes: input }]);
    await page.getByTestId('opt-picture').setInputFiles({ name: 'Big.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await photoJpeg(4000, 3000)) });
    await expect(page.locator('.picture-pick__words')).toHaveText(/Now tap the page/, { timeout: 20_000 });
    await tapPage(page, 0.3, 0.3);
    await page.getByTestId('opt-picture').setInputFiles({ name: 'Logo.png', mimeType: 'image/png', buffer: Buffer.from(await logoPng(300)) });
    await expect(page.locator('.picture-pick__preview')).toHaveAttribute('src', /^data:image\/png/);
    await editorTo(page, 2);
    await tapPage(page, 0.5, 0.5);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 pictures placed across 2 pages');
    const images = (await imagesIn(out.bytes)).filter((i) => !i.filter.includes('Flate') || i.width > 1);
    const photo = images.find((i) => i.filter === '/DCTDecode')!;
    expect(Math.max(photo.width, photo.height)).toBe(2000);
    expect(out.bytes.length).toBeLessThan(2_000_000);
    expect(extent(await added(input, out.bytes, 1, 0.5), isGreen)).not.toBeNull();
  });
});

const isYellow = (r: number, g: number, b: number) => r > 225 && g > 215 && b < 205;
const isMint = (r: number, g: number, b: number) => g > 235 && r < 220 && b < 210;
const isPink = (r: number, g: number, b: number) => r > 225 && g < 215 && b > 180 && b < 235;

test.describe('mark up', () => {
  test('highlighter in three colours, underline and strike-out land on the words dragged across, which stay readable', async ({ page }) => {
    const input = await leasePdf();
    await openTool(page, 'mark-up');
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await expect(page.getByTestId('opt-tool-highlight')).toBeChecked();
    await expect(page.getByTestId('opt-marker-yellow')).toBeChecked();
    await dragPage(page, [0.09, 0.115], [0.5, 0.135]);
    await page.getByTestId('opt-marker-green').check();
    await dragPage(page, [0.09, 0.2], [0.5, 0.22]);
    await page.getByTestId('opt-marker-pink').check();
    await dragPage(page, [0.09, 0.3], [0.5, 0.32]);
    await page.getByTestId('opt-tool-underline').check();
    await expect(page.getByTestId('opt-pen-blue')).toBeVisible();
    await page.getByTestId('opt-pen-red').check();
    await dragPage(page, [0.1, 0.4], [0.6, 0.41]);
    await page.getByTestId('opt-tool-strike').check();
    await page.getByTestId('opt-pen-black').check();
    await dragPage(page, [0.1, 0.5], [0.6, 0.52]);
    const out = await runAndSave(page);
    expect(out.name).toBe('Lease (marked up).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('3 highlights, 1 underline and 1 strike-through');
    const diff = await added(input, out.bytes, 0, 1);
    expect(share(diff, { x: 0.1, y: 0.118, w: 0.38, h: 0.014 }, isYellow)).toBeGreaterThan(0.5);
    expect(share(diff, { x: 0.1, y: 0.203, w: 0.38, h: 0.014 }, isMint)).toBeGreaterThan(0.3);
    expect(share(diff, { x: 0.1, y: 0.303, w: 0.38, h: 0.014 }, isPink)).toBeGreaterThan(0.3);
    const reddish = (r: number, g: number, b: number) => r > g + 60 && r > b + 60;
    const underline = extent(diff, reddish)!;
    expect(underline.y).toBeGreaterThan(0.39);
    expect(underline.y).toBeLessThan(0.42);
    expect(underline.w).toBeGreaterThan(0.45);
    // Nothing outside what was dragged.
    expect(share(diff, { x: 0, y: 0.6, w: 1, h: 0.4 }, notWhite)).toBe(0);
    // The words under the marks are still the page's own words.
    const pdf = await openPdf(out.bytes);
    expect(await pdf.text(0)).toContain('This agreement is made at Kochi');
    await pdf.close();
  });

  test('pen, box, circle, arrow, line and a measurement in mm', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'mark-up');
    await pick(page, [{ name: 'Plan.pdf', bytes: input }]);
    await page.getByTestId('opt-tool-pen').check();
    await page.getByTestId('opt-pen-red').check();
    await dragPage(page, [0.1, 0.1], [0.3, 0.2]);
    await page.getByTestId('opt-tool-rect').check();
    await page.getByTestId('opt-pen-blue').check();
    await dragPage(page, [0.5, 0.1], [0.8, 0.25]);
    await page.getByTestId('opt-tool-ellipse').check();
    await dragPage(page, [0.1, 0.35], [0.4, 0.5]);
    await page.getByTestId('opt-tool-arrow').check();
    await page.getByTestId('opt-pen-black').check();
    await dragPage(page, [0.5, 0.4], [0.9, 0.4]);
    await page.getByTestId('opt-tool-line').check();
    await dragPage(page, [0.1, 0.6], [0.9, 0.6]);
    await page.getByTestId('opt-tool-measure').check();
    await page.getByTestId('opt-pen-red').check();
    // Half the width of an A4 page: 105 mm.
    await dragPage(page, [0.25, 0.8], [0.75, 0.8]);
    await expect(page.getByTestId('editor-measure')).toHaveText(/^10[45] mm$|^10\.[45] cm$/);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 pen stroke, 1 box, 1 circle, 1 arrow, 1 line and 1 measurement');
    const diff = await added(input, out.bytes, 0, 1);
    // The pen stroke, in red, from its start to its end.
    const pen = extent({ ...diff, data: diff.data }, (r, g, b) => isRed(r, g, b))!;
    expect(pen.x).toBeLessThan(0.12);
    expect(pen.y).toBeLessThan(0.12);
    // The box: blue on its edges, nothing inside.
    expect(share(diff, { x: 0.5, y: 0.095, w: 0.3, h: 0.012 }, isBlue)).toBeGreaterThan(0.1);
    expect(share(diff, { x: 0.55, y: 0.13, w: 0.2, h: 0.08 }, notWhite)).toBe(0);
    // The circle: blue at its left and right, and empty in the middle.
    expect(share(diff, { x: 0.095, y: 0.41, w: 0.012, h: 0.03 }, isBlue)).toBeGreaterThan(0.1);
    expect(share(diff, { x: 0.2, y: 0.4, w: 0.1, h: 0.05 }, notWhite)).toBe(0);
    // The arrow has a head at its end; the line has none.
    expect(share(diff, { x: 0.86, y: 0.38, w: 0.04, h: 0.015 }, isInk)).toBeGreaterThan(0.02);
    expect(share(diff, { x: 0.86, y: 0.585, w: 0.04, h: 0.01 }, isInk)).toBe(0);
    // The measurement says 105 mm (half of A4's 210 mm), on the page itself.
    const pdf = await openPdf(out.bytes);
    expect(await pdf.text(0)).toMatch(/10[45] mm|10\.[45] cm/);
    await pdf.close();
  });

  test('notes are real comments in any script, text boxes are real text, links really open', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'mark-up');
    await pick(page, [{ name: 'Draft.pdf', bytes: input }]);
    await page.getByTestId('opt-tool-note').check();
    await page.getByTestId('opt-words').fill('ഫീസ് ചോദിക്കുക: ask about the fee');
    await tapPage(page, 0.8, 0.2);
    await page.getByTestId('opt-tool-textbox').check();
    await page.getByTestId('opt-words').fill('See clause 4');
    await tapPage(page, 0.1, 0.5);
    await page.getByTestId('opt-tool-link').check();
    await page.getByTestId('opt-link').fill('https://example.org/terms');
    await dragPage(page, [0.1, 0.7], [0.5, 0.75]);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 note, 1 text box and 1 link');
    const pdf = await openPdf(out.bytes);
    const annots = await pdf.annotations(0);
    const note = annots.find((a) => a['subtype'] === 'Text')!;
    expect(note).toBeDefined();
    expect((note['contentsObj'] as { str: string }).str).toBe('ഫീസ് ചോദിക്കുക: ask about the fee');
    const link = annots.find((a) => a['subtype'] === 'Link')!;
    expect(link['url']).toBe('https://example.org/terms');
    const { width, height } = await pdf.size(0);
    const rect = link['rect'] as number[];
    expect(rect[0]! / width).toBeCloseTo(0.1, 1);
    expect(1 - rect[3]! / height).toBeCloseTo(0.7, 1);
    expect((await pdf.words(0)).find((w) => w.text === 'See clause 4')).toBeDefined();
    await pdf.close();
  });

  for (const stamp of ['APPROVED', 'PAID', 'RECEIVED', 'DRAFT', 'CONFIDENTIAL', 'URGENT', 'COPY', 'VOID'] as const) {
    test(`the ${stamp} stamp goes on in the colour chosen, inside its frame`, async ({ page }) => {
      const input = await applicationBlank();
      await openTool(page, 'mark-up');
      await pick(page, [{ name: 'Invoice.pdf', bytes: input }]);
      await page.getByTestId('opt-tool-stamp').check();
      await page.getByTestId('opt-stamp').selectOption(stamp);
      await page.getByTestId('opt-pen-red').check();
      await tapPage(page, 0.6, 0.3);
      const out = await runAndSave(page);
      await expect(page.getByTestId('result-detail')).toHaveText('1 stamp');
      const pdf = await openPdf(out.bytes);
      const word = (await pdf.words(0)).find((w) => w.text === stamp)!;
      expect(word).toBeDefined();
      await pdf.close();
      const diff = await added(input, out.bytes, 0, 1);
      const box = extent(diff, notWhite)!;
      const [cx, cy] = centre(box);
      expect(Math.abs(cx - 0.6)).toBeLessThan(0.03);
      expect(Math.abs(cy - 0.3)).toBeLessThan(0.03);
      expect(share(diff, box, isRed)).toBeGreaterThan(0.05);
      expect(share(diff, box, isBlue)).toBe(0);
    });
  }

  test('a stamp in your own words, in any script, and a stamp made bigger by its corner', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'mark-up');
    await pick(page, [{ name: 'Bill.pdf', bytes: input }]);
    await page.getByTestId('opt-tool-stamp').check();
    await expect(page.getByTestId('opt-stamp-words')).toBeHidden();
    await page.getByTestId('opt-stamp').selectOption('custom');
    await expect(page.getByTestId('opt-stamp-words')).toBeVisible();
    // Nothing typed yet: a tap says so rather than stamping nothing.
    await tapPage(page, 0.5, 0.2);
    await expect(page.getByTestId('editor-item')).toHaveCount(0);
    await expect(page.getByTestId('editor-hint')).toHaveText('Type the stamp’s words first.');
    await page.getByTestId('opt-stamp-words').fill('Paid on 12 Oct');
    await tapPage(page, 0.5, 0.2);
    // A second one: tap, and then change its words (typing changes the stamp that is selected).
    await tapPage(page, 0.5, 0.5);
    await page.getByTestId('opt-stamp-words').fill('പണമടച്ചു');
    await expect(page.getByTestId('editor-item')).toHaveCount(2);
    await expect(page.locator('.editor__stamp-words')).toHaveText(['PAID ON 12 OCT', 'പണമടച്ചു']);
    // The first one, made half again as wide by its corner.
    await tapPage(page, 0.5, 0.2);
    const handle = page.locator('.editor__item.is-selected .editor__resize');
    const hb = (await handle.boundingBox())!;
    const layer = (await page.getByTestId('editor-layer').boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + layer.width * 0.12, hb.y + hb.height / 2, { steps: 5 });
    await page.mouse.up();
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 stamps');
    await look(out.bytes, 0, 'markup-own-stamps');
    const pdf = await openPdf(out.bytes);
    const words = (await pdf.words(0)).filter((w) => w.text === 'PAID ON 12 OCT');
    expect(words).toHaveLength(1);
    await pdf.close();
    const diff = await added(input, out.bytes, 0, 1);
    const first = extent({ ...diff }, notWhite)!;
    expect(first.y).toBeLessThan(0.2);
    // The Malayalam stamp is on the page too, as a picture, round (0.5, 0.5).
    const second = share(diff, { x: 0.3, y: 0.45, w: 0.4, h: 0.1 }, notWhite);
    expect(second).toBeGreaterThan(0.02);
  });

  test('undo takes the last mark off, and every mark’s × takes that one off', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'mark-up');
    await pick(page, [{ name: 'Plan.pdf', bytes: input }]);
    await page.getByTestId('opt-tool-rect').check();
    await dragPage(page, [0.1, 0.1], [0.3, 0.2]);
    await dragPage(page, [0.5, 0.5], [0.7, 0.6]);
    await page.getByTestId('opt-tool-pen').check();
    await dragPage(page, [0.1, 0.8], [0.6, 0.85]);
    await page.getByTestId('editor-undo').click();
    // The second box, selected, then its ×.
    await tapPage(page, 0.5, 0.55);
    await page.locator('.editor__item.is-selected [data-testid="editor-remove"]').click();
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 box');
    const diff = await added(input, out.bytes, 0, 0.5);
    expect(share(diff, { x: 0, y: 0.45, w: 1, h: 0.55 }, notWhite)).toBe(0);
  });
});

test.describe('edit text', () => {
  test('a tapped name is changed in place: same line, same start, the old words painted out', async ({ page }) => {
    const input = await salarySlipPdf();
    const before = await openPdf(input);
    const { width, height } = await before.size(0);
    const old = (await before.words(0)).find((w) => w.text === 'Anjali Menon')!;
    await before.close();
    await openTool(page, 'edit-text');
    await pick(page, [{ name: 'Payslip.pdf', bytes: input }]);
    await expect(page.locator('.editor__line-hint').first()).toBeAttached();
    await tapPage(page, (old.x + 10) / width, (old.y - old.size * 0.3) / height);
    await expect(page.getByTestId('opt-words')).toHaveValue('Anjali Menon');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Change the words first.');
    await page.getByTestId('opt-words').fill('Anjali M. Nair');
    const out = await runAndSave(page);
    expect(out.name).toBe('Payslip (edited).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('1 change made');
    const pdf = await openPdf(out.bytes);
    const fresh = (await pdf.words(0)).find((w) => w.text === 'Anjali M. Nair')!;
    expect(fresh).toBeDefined();
    expect(Math.abs(fresh.x - old.x)).toBeLessThan(1.5);
    expect(Math.abs(fresh.y - old.y)).toBeLessThan(1.5);
    expect(Math.abs(fresh.size - old.size)).toBeLessThan(0.6);
    // On the page, the old words are gone: where "Menon" ran past the new words' end is clean paper again.
    const picture = await pdf.render(0, 2);
    await pdf.close();
    const tail = { x: (fresh.x + fresh.width + 2) / width, y: (old.y - old.size * 0.8) / height, w: Math.max(0, old.width - fresh.width - 4) / width, h: (old.size * 0.9) / height };
    if (tail.w > 0) expect(share(picture, tail, isInk)).toBe(0);
    // Everything else on the slip is as it was.
    expect(share(await added(input, out.bytes, 0, 1), { x: 0, y: 0.25, w: 1, h: 0.75 }, notWhite)).toBe(0);
  });

  test('a changed amount keeps its right edge, in a table cell, and nothing else in the row moves', async ({ page }) => {
    const input = await salarySlipPdf();
    const before = await openPdf(input);
    const { width, height } = await before.size(0);
    const tds = (await before.words(0)).find((w) => w.text === '7,999.00')!;
    await before.close();
    await openTool(page, 'edit-text');
    await pick(page, [{ name: 'Payslip.pdf', bytes: input }]);
    await expect(page.locator('.editor__line-hint').first()).toBeAttached();
    await tapPage(page, (tds.x + tds.width / 2) / width, (tds.y - tds.size * 0.3) / height);
    await expect(page.getByTestId('opt-words')).toHaveValue('7,999.00');
    await page.getByTestId('opt-words').fill('12,250.00');
    const out = await runAndSave(page);
    const pdf = await openPdf(out.bytes);
    const words = await pdf.words(0);
    const fresh = words.find((w) => w.text === '12,250.00')!;
    expect(Math.abs(fresh.x + fresh.width - (tds.x + tds.width))).toBeLessThan(1);
    expect(Math.abs(fresh.y - tds.y)).toBeLessThan(1);
    // Its label on the same row is untouched.
    const label = words.find((w) => w.text === 'Income tax (TDS)')!;
    expect(label).toBeDefined();
    const picture = await pdf.render(0, 2);
    await pdf.close();
    expect(share(picture, { x: label.x / width, y: (label.y - label.size * 0.7) / height, w: label.width / width, h: (label.size * 0.6) / height }, isInk)).toBeGreaterThan(0.05);
  });

  test('a bold label is written back bold, and a Times heading in Times', async ({ page }) => {
    const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.create({ updateMetadata: false });
    const p = doc.addPage([595.28, 841.89]);
    p.drawText('Gross earnings', { x: 56, y: 700, size: 12, font: await doc.embedFont(StandardFonts.HelveticaBold) });
    p.drawText('Terms of service', { x: 56, y: 600, size: 16, font: await doc.embedFont(StandardFonts.TimesRoman) });
    p.drawText('Note in italics', { x: 56, y: 500, size: 12, font: await doc.embedFont(StandardFonts.HelveticaOblique) });
    const input = new Uint8Array(await doc.save());
    await openTool(page, 'edit-text');
    await pick(page, [{ name: 'Fonts.pdf', bytes: input }]);
    await expect(page.locator('.editor__line-hint').first()).toBeAttached();
    await tapPage(page, 70 / 595.28, (842 - 704) / 841.89);
    await expect(page.getByTestId('opt-words')).toHaveValue('Gross earnings');
    await page.getByTestId('opt-words').fill('Gross pay');
    await tapPage(page, 70 / 595.28, (842 - 605) / 841.89);
    await expect(page.getByTestId('opt-words')).toHaveValue('Terms of service');
    await page.getByTestId('opt-words').fill('Terms of use');
    await tapPage(page, 70 / 595.28, (842 - 504) / 841.89);
    await page.getByTestId('opt-words').fill('A note in italics');
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('3 changes made');
    const pdf = await openPdf(out.bytes);
    const fonts = await pdf.fonts(0);
    await pdf.close();
    expect(fonts.find((f) => f.text === 'Gross pay')?.font).toMatch(/Helvetica-Bold$/);
    expect(fonts.find((f) => f.text === 'Terms of use')?.font).toMatch(/Times-Roman$/);
    expect(fonts.find((f) => f.text === 'A note in italics')?.font).toMatch(/Helvetica-Oblique$/);
  });

  test('find and replace changes every whole match, on every page, and says where', async ({ page }) => {
    const input = await leasePdf();
    await openTool(page, 'edit-text');
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await page.getByTestId('find-replace-box').locator('summary').click();
    await page.getByTestId('opt-find').fill('Kochi');
    await page.getByTestId('opt-replace-with').fill('Ernakulam');
    await page.getByTestId('find-replace').click();
    await expect(page.getByTestId('find-replace-said')).toHaveText('Changed in 1 place, on 1 page. Each is outlined on its page; tap one to adjust it.');
    await page.getByTestId('opt-find').fill('of 2');
    await page.getByTestId('opt-replace-with').fill('of two');
    await page.getByTestId('find-replace').click();
    await expect(page.getByTestId('find-replace-said')).toHaveText('Changed in 2 places, on 2 pages. Each is outlined on its page; tap one to adjust it.');
    await page.getByTestId('opt-find').fill('Mumbai');
    await page.getByTestId('find-replace').click();
    await expect(page.getByTestId('find-replace-said')).toHaveText('“Mumbai” isn’t in the text of this document.');
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('3 changes made across 2 pages');
    const pdf = await openPdf(out.bytes);
    expect(await pdf.text(0)).toContain('This agreement is made at Ernakulam on the first day');
    expect(await pdf.text(0)).toContain('Page 1 of two');
    expect(await pdf.text(1)).toContain('Page 2 of two');
    await pdf.close();
  });

  test('clearing a line takes its words off the page; Malayalam goes in as a picture of the words', async ({ page }) => {
    const input = await salarySlipPdf();
    const before = await openPdf(input);
    const { width, height } = await before.size(0);
    const words = await before.words(0);
    const pan = words.find((w) => w.text === 'ABCPM1234K')!;
    const name = words.find((w) => w.text === 'Anjali Menon')!;
    await before.close();
    await openTool(page, 'edit-text');
    await pick(page, [{ name: 'Payslip.pdf', bytes: input }]);
    await expect(page.locator('.editor__line-hint').first()).toBeAttached();
    await tapPage(page, (pan.x + 5) / width, (pan.y - pan.size * 0.3) / height);
    await page.getByTestId('opt-words').fill('');
    await tapPage(page, (name.x + 5) / width, (name.y - name.size * 0.3) / height);
    await page.getByTestId('opt-words').fill('അഞ്ജലി മേനോൻ');
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 changes made');
    const pdf = await openPdf(out.bytes);
    const picture = await pdf.render(0, 2);
    await pdf.close();
    expect(share(picture, { x: pan.x / width, y: (pan.y - pan.size * 0.8) / height, w: pan.width / width, h: (pan.size * 0.9) / height }, isInk)).toBe(0);
    const diff = await added(input, out.bytes, 0, 2);
    expect(share(diff, { x: name.x / width, y: (name.y - name.size) / height, w: (name.width * 1.5) / width, h: (name.size * 1.4) / height }, isInk)).toBeGreaterThan(0.02);
  });
});

const isOrange = (r: number, g: number, b: number) => r > 220 && g > 110 && g < 170 && b < 60;
const A4H = 841.89;
const A4W = 595.28;
/** Where brochurePdf draws its photo and its logo, in fractions of the page from the top-left. */
const PHOTO = { x: 56 / A4W, y: (A4H - 680) / A4H, w: 300 / A4W, h: 200 / A4H };
const LOGO = { x: 400 / A4W, y: (A4H - 660) / A4H, w: 140 / A4W, h: 140 / A4H };
const inside = (b: Box, by = 0.15): Box => ({ x: b.x + b.w * by, y: b.y + b.h * by, w: b.w * (1 - 2 * by), h: b.h * (1 - 2 * by) });

test.describe('edit pictures', () => {
  test('outlines each picture; one taken out, one moved and made smaller, nothing else touched', async ({ page }) => {
    const input = await brochurePdf();
    await openTool(page, 'edit-images');
    await pick(page, [{ name: 'Brochure.pdf', bytes: input }]);
    await expect(page.locator('.editor__item--pic')).toHaveCount(2);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Move, take out or replace a picture first.');
    // The logo: tap it, then its ×.
    await tapPage(page, LOGO.x + LOGO.w / 2, LOGO.y + LOGO.h / 2);
    await page.locator('.editor__item--pic.is-selected [data-testid="editor-remove"]').click();
    await expect(page.locator('.editor__item--pic.is-deleted .editor__pic-state')).toHaveText('Taken out');
    // The photo: dragged down by a quarter of the page, then its corner pulled in.
    await dragPage(page, [PHOTO.x + PHOTO.w / 2, PHOTO.y + PHOTO.h / 2], [PHOTO.x + PHOTO.w / 2, PHOTO.y + PHOTO.h / 2 + 0.25]);
    const handle = page.locator('.editor__item.is-selected .editor__resize');
    const hb = (await handle.boundingBox())!;
    const layer = (await page.getByTestId('editor-layer').boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - layer.width * PHOTO.w * 0.5, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();
    const out = await runAndSave(page);
    expect(out.name).toBe('Brochure (pictures edited).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('1 picture taken out, 1 picture moved');
    const pdf = await openPdf(out.bytes);
    const picture = await pdf.render(0, 1);
    expect(await pdf.text(0)).toContain('Onam Sale at Lulu');
    await pdf.close();
    // The logo's place is clean paper; the photo's old place too.
    expect(share(picture, LOGO, isWhite)).toBeGreaterThan(0.99);
    expect(share(picture, { x: PHOTO.x, y: PHOTO.y, w: PHOTO.w, h: PHOTO.h * 0.9 }, isWhite)).toBeGreaterThan(0.99);
    // The photo is a quarter of the page lower, half as wide, its shape kept.
    const now = extent(await added(input, out.bytes, 0, 1), (r, g, b) => !isWhite(r, g, b) && !(r > 200 && g > 200 && b > 200))!;
    const moved = extent(picture, (r, g, b) => b > 150 && r < 150 && g > 100)!;
    expect(Math.abs(moved.x - PHOTO.x)).toBeLessThan(0.02);
    expect(Math.abs(moved.y - (PHOTO.y + 0.25))).toBeLessThan(0.02);
    expect(moved.w).toBeCloseTo(PHOTO.w * 0.5, 1);
    expect((moved.h * A4H) / (moved.w * A4W)).toBeCloseTo(200 / 300, 1);
    expect(now).not.toBeNull();
    // Still one photo in the file, not a copy.
    expect((await imagesIn(out.bytes)).filter((i) => i.filter === '/DCTDecode')).toHaveLength(1);
  });

  test('a picture swapped for another keeps the old one’s box, the new one’s shape', async ({ page }) => {
    const input = await brochurePdf();
    await openTool(page, 'edit-images');
    await pick(page, [{ name: 'Brochure.pdf', bytes: input }]);
    await expect(page.locator('.editor__item--pic')).toHaveCount(2);
    // Choosing before tapping a picture says what to do first.
    await page.getByTestId('opt-replace-picture').setInputFiles({ name: 'Offer.png', mimeType: 'image/png', buffer: Buffer.from(await orangePng(300, 200)) });
    await expect(page.getByTestId('editor-hint')).toHaveText('Tap a picture on the page first, then choose the new one.');
    await tapPage(page, LOGO.x + LOGO.w / 2, LOGO.y + LOGO.h / 2);
    await page.getByTestId('opt-replace-picture').setInputFiles({ name: 'Offer.png', mimeType: 'image/png', buffer: Buffer.from(await orangePng(300, 200)) });
    await expect(page.locator('.editor__item--pic .editor__pic-state').filter({ hasText: 'Replaced' })).toHaveCount(1);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 picture replaced');
    const pdf = await openPdf(out.bytes);
    const picture = await pdf.render(0, 1);
    await pdf.close();
    const orange = extent(picture, isOrange)!;
    // As wide as the logo's box, two-thirds as tall, centred in it.
    expect(orange.w).toBeCloseTo(LOGO.w, 1);
    expect((orange.h * A4H) / (orange.w * A4W)).toBeCloseTo(200 / 300, 1);
    expect(Math.abs(orange.y + orange.h / 2 - (LOGO.y + LOGO.h / 2))).toBeLessThan(0.01);
    // The photo beside it is untouched.
    expect(share(await added(input, out.bytes, 0, 1), inside(PHOTO), notWhite)).toBe(0);
  });

  test('× again keeps a picture after all, and a page with no pictures says so', async ({ page }) => {
    await openTool(page, 'edit-images');
    await pick(page, [{ name: 'Brochure.pdf', bytes: await brochurePdf() }]);
    await expect(page.locator('.editor__item--pic')).toHaveCount(2);
    await tapPage(page, LOGO.x + LOGO.w / 2, LOGO.y + LOGO.h / 2);
    const remove = page.locator('.editor__item--pic.is-selected [data-testid="editor-remove"]');
    await remove.click();
    await expect(page.getByTestId('run-button')).toBeEnabled();
    await remove.click();
    await expect(page.locator('.editor__item--pic.is-deleted')).toHaveCount(0);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await openTool(page, 'edit-images');
    await pick(page, [{ name: 'Letter.pdf', bytes: await applicationBlank() }]);
    await expect(page.getByTestId('editor-hint')).toHaveText('This page has no pictures to change. Go to another page, or add one with Add image.');
  });
});

/** What each field holds in a filled form, by name, as pdf.js reads it. */
async function fieldValues(bytes: Uint8Array): Promise<Record<string, unknown>> {
  const pdf = await openPdf(bytes);
  try {
    const fields = await pdf.fields();
    const out: Record<string, unknown> = {};
    for (const [name, widgets] of Object.entries(fields)) {
      const typed = widgets.filter((w) => typeof w['type'] === 'string' && w['type'] !== '');
      const first = typed[0];
      if (!first) continue;
      out[name] = first['type'] === 'radiobutton' ? (typed.find((w) => w['value'] === w['exportValues'])?.['exportValues'] ?? (first['value'] as string)) : first['value'];
    }
    return out;
  } finally {
    await pdf.close();
  }
}

test.describe('fill in a form', () => {
  test('lists every field in page order, as a person would read it, with what it already holds', async ({ page }) => {
    await openTool(page, 'fill-form');
    await pick(page, [{ name: 'Library card.pdf', bytes: await applicationFormPdf() }]);
    const labels = page.locator('[data-testid="form-fields"] .field__label, [data-testid="form-fields"] .check__label');
    await expect(labels).toHaveText(['Applicant full name', 'Pin', 'Address', 'Nationality', 'Student', 'Newsletter', 'Agree', 'Dob']);
    await expect(page.getByTestId('form-field-applicant.full_name')).toHaveValue('Ravi Kumar');
    await expect(page.getByTestId('form-field-pin')).toHaveAttribute('maxlength', '6');
    await expect(page.getByTestId('form-field-agree')).toBeChecked();
    await expect(page.getByTestId('form-field-newsletter')).not.toBeChecked();
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type your answers first.');
  });

  test('every kind of field takes its answer and the form stays fillable', async ({ page }) => {
    const input = await applicationFormPdf();
    await openTool(page, 'fill-form');
    await pick(page, [{ name: 'Library card.pdf', bytes: input }]);
    await page.getByTestId('form-field-applicant.full_name').fill('Anjali Menon');
    await page.getByTestId('form-field-pin').fill('6820301234');
    await expect(page.getByTestId('form-field-pin')).toHaveValue('682030');
    await page.getByTestId('form-field-address').fill('Flat 4B, Rose Gardens\nKakkanad, Kochi');
    await page.getByTestId('form-field-nationality').selectOption('Overseas Citizen of India');
    await page.getByTestId('form-field-student').selectOption('Yes');
    await page.getByTestId('form-field-newsletter').check();
    await page.getByTestId('form-field-agree').uncheck();
    await page.getByTestId('form-field-dob').fill('14/02/1994');
    const out = await runAndSave(page);
    expect(out.name).toBe('Library card (filled).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('7 answers, still editable');
    const values = await fieldValues(out.bytes);
    expect(values['applicant.full_name']).toBe('Anjali Menon');
    expect(values['pin']).toBe('682030');
    expect(values['address']).toBe('Flat 4B, Rose Gardens\nKakkanad, Kochi');
    expect(values['nationality']).toBe('Overseas Citizen of India');
    expect(values['student']).toBe('Yes');
    expect(values['newsletter']).not.toBe('Off');
    expect(values['agree']).toBe('Off');
    expect(values['dob']).toBe('14/02/1994');
    // And it looks filled in: the name is drawn in its box.
    const pdf = await openPdf(out.bytes);
    expect(share(await pdf.render(0, 1), { x: 180 / A4W, y: (A4H - 736) / A4H, w: 300 / A4W, h: 22 / A4H }, isInk)).toBeGreaterThan(0.01);
    await pdf.close();
  });

  test('sealed, the answers become part of the page and the fields are gone', async ({ page }) => {
    await openTool(page, 'fill-form');
    await pick(page, [{ name: 'Library card.pdf', bytes: await applicationFormPdf() }]);
    await page.getByTestId('form-field-dob').fill('14/02/1994');
    await page.getByTestId('opt-seal').check();
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 answer, sealed so the answers can no longer be changed');
    expect(Object.keys(await fieldValues(out.bytes))).toEqual([]);
    const pdf = await openPdf(out.bytes);
    expect(await pdf.text(1)).toContain('14/02/1994');
    expect(await pdf.text(0)).toContain('Ravi Kumar');
    await pdf.close();
  });

  test('answers saved as a file fill the same form in one go next time; Acrobat’s .xfdf too', async ({ page }) => {
    const input = await applicationFormPdf();
    await openTool(page, 'fill-form');
    await pick(page, [{ name: 'Library card.pdf', bytes: input }]);
    await page.getByTestId('form-field-applicant.full_name').fill('Anjali Menon');
    await page.getByTestId('form-field-nationality').selectOption('Indian');
    await page.getByTestId('form-field-newsletter').check();
    await page.getByTestId('opt-save-answers').check();
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(2);
    await expect(page.getByTestId('result-item').nth(1)).toHaveAttribute('data-name', 'Library card answers.json');
    // Name (changed), PIN, address, nationality, newsletter and the ticked agree box; the rest are blank.
    await expect(page.getByTestId('result-detail').nth(1)).toHaveText('4 answers saved: open the form here again and choose this file to fill it in one go');
    const saved = await downloadFrom(page, page.getByTestId('save-button').nth(1));
    const json = JSON.parse(new TextDecoder().decode(saved.bytes)) as { kind: string; fields: Record<string, unknown> };
    expect(json.kind).toBe('Form answers');
    expect(json.fields['applicant.full_name']).toBe('Anjali Menon');

    await openTool(page, 'fill-form');
    await pick(page, [{ name: 'Library card.pdf', bytes: input }]);
    await page.getByTestId('form-load').setInputFiles({ name: 'answers.json', mimeType: 'application/json', buffer: Buffer.from(saved.bytes) });
    await expect(page.getByTestId('form-load-said')).toHaveText('Filled 4 answers from the file. Check them, then tap Fill it in.');
    await expect(page.getByTestId('form-field-applicant.full_name')).toHaveValue('Anjali Menon');
    await expect(page.getByTestId('form-field-newsletter')).toBeChecked();

    const xfdf = `<?xml version="1.0" encoding="UTF-8"?><xfdf xmlns="http://ns.adobe.com/xfdf/"><fields><field name="applicant"><field name="full_name"><value>Meera Nair</value></field></field><field name="pin"><value>695001</value></field></fields></xfdf>`;
    await page.getByTestId('form-load').setInputFiles({ name: 'answers.xfdf', mimeType: 'application/vnd.adobe.xfdf', buffer: Buffer.from(xfdf) });
    await expect(page.getByTestId('form-load-said')).toHaveText('Filled 2 answers from the file. Check them, then tap Fill it in.');
    await expect(page.getByTestId('form-field-applicant.full_name')).toHaveValue('Meera Nair');
    const out = await runAndSave(page);
    const values = await fieldValues(out.bytes);
    expect(values['applicant.full_name']).toBe('Meera Nair');
    expect(values['pin']).toBe('695001');

    await page.getByTestId('form-load').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"fields":{"vehicle":"KL-07"}}') });
    await expect(page.getByTestId('form-load-said')).toHaveText('None of those answers belong to this form.');
    await page.getByTestId('form-load').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('hello') });
    await expect(page.getByTestId('form-load-said')).toHaveText("That file isn't a set of saved answers.");
  });

  test('answers in Malayalam, and a PDF with no fields points to Add text', async ({ page }) => {
    const input = await applicationFormPdf();
    await openTool(page, 'fill-form');
    await pick(page, [{ name: 'Library card.pdf', bytes: input }]);
    await page.getByTestId('form-field-applicant.full_name').fill('അഞ്ജലി മേനോൻ');
    await page.getByTestId('form-field-address').fill('കാക്കനാട്, കൊച്ചി');
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 answers, still editable');
    await look(out.bytes, 0, 'fill-form-malayalam');
    const values = await fieldValues(out.bytes);
    expect(values['applicant.full_name']).toBe('അഞ്ജലി മേനോൻ');
    expect(values['address']).toBe('കാക്കനാട്, കൊച്ചി');
    const pdf = await openPdf(out.bytes);
    expect(share(await pdf.render(0, 1), { x: 180 / A4W, y: (A4H - 736) / A4H, w: 300 / A4W, h: 22 / A4H }, isInk)).toBeGreaterThan(0.01);
    await pdf.close();

    await openTool(page, 'fill-form');
    await pick(page, [{ name: 'Letter.pdf', bytes: await applicationBlank() }]);
    await expect(page.getByTestId('form-none')).toContainText('This PDF has no fields to fill in. To write on it anyway, use Add text.');
    await expect(page.getByTestId('form-none').getByRole('link', { name: 'Add text' })).toHaveAttribute('href', '/tools/add-text/');
    await expect(page.getByTestId('run-button')).toBeDisabled();
  });
});

const near = (rgb: [number, number, number], hex: string, by = 6) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return Math.abs(rgb[0] - ((n >> 16) & 255)) <= by && Math.abs(rgb[1] - ((n >> 8) & 255)) <= by && Math.abs(rgb[2] - (n & 255)) <= by;
};

test.describe('page background', () => {
  for (const [swatch, hex] of [['#fbf6e9', '#FBF6E9'], ['#f2f2ee', '#F2F2EE'], ['#eaf6ee', '#EAF6EE'], ['#e8f1fb', '#E8F1FB'], ['#fbeef0', '#FBEEF0']] as const) {
    test(`${swatch} goes behind everything on every page, words and photo on top`, async ({ page }) => {
      const { bytes } = await annualReportPdf();
      await openTool(page, 'background');
      await pick(page, [{ name: 'Report.pdf', bytes }]);
      await page.getByTestId(`opt-colour-${swatch}`).check();
      const out = await runAndSave(page);
      expect(out.name).toBe('Report coloured.pdf');
      await expect(page.getByTestId('result-detail')).toHaveText(`All 3 pages given a ${hex} background`);
      const pdf = await openPdf(out.bytes);
      for (let i = 0; i < 3; i++) {
        const picture = await pdf.render(i, 0.5);
        for (const [x, y] of [[0.02, 0.02], [0.98, 0.98], [0.5, 0.97]] as const) expect(near(pixel(picture, x, y), hex), `page ${i + 1} at ${x},${y}`).toBe(true);
        expect(await pdf.text(i)).toContain(`Page ${i + 1}`);
      }
      // The photo on page one is drawn over the colour, as it was.
      const before = await openPdf(bytes);
      const photo = { x: 66 / A4W, y: (A4H - 710) / A4H, w: 380 / A4W, h: 230 / A4H };
      expect(mean(await before.render(0, 0.5), photo)).toEqual(mean(await pdf.render(0, 0.5), photo));
      await before.close();
      await pdf.close();
    });
  }

  test('your own colour, on the pages typed only', async ({ page }) => {
    const input = await pagesPdf(4);
    await openTool(page, 'background');
    await pick(page, [{ name: 'Notes.pdf', bytes: input }]);
    await expect(page.getByTestId('opt-color')).toBeHidden();
    await page.getByTestId('opt-colour-custom').check();
    await expect(page.getByTestId('opt-color')).toBeVisible();
    await page.getByTestId('opt-color').fill('#ffd8a8');
    await page.getByTestId('opt-pages').fill('2, 4');
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Pages 2, 4 given a #FFD8A8 background');
    const pdf = await openPdf(out.bytes);
    for (const [i, coloured] of [[0, false], [1, true], [2, false], [3, true]] as const) {
      expect(near(pixel(await pdf.render(i, 0.5), 0.9, 0.3), '#FFD8A8'), `page ${i + 1}`).toBe(coloured);
    }
    await pdf.close();
  });

  test('a page that paints itself white first (as browsers print) still gets its colour', async ({ page }) => {
    const input = await whitePaintedPdf();
    await openTool(page, 'background');
    await pick(page, [{ name: 'Printed.pdf', bytes: input }]);
    await page.getByTestId('opt-colour-#eaf6ee').check();
    const out = await runAndSave(page);
    const pdf = await openPdf(out.bytes);
    for (const i of [0, 1]) {
      const picture = await pdf.render(i, 0.5);
      expect(near(pixel(picture, 0.5, 0.5), '#EAF6EE'), `page ${i + 1}`).toBe(true);
      expect(await pdf.text(i)).toContain(`Printed from a browser, page ${i + 1}`);
      expect(share(picture, { x: 0.08, y: 0.08, w: 0.6, h: 0.04 }, isInk)).toBeGreaterThan(0.01);
    }
    await pdf.close();
  });

  test('pages typed that are not in the file are refused in words', async ({ page }) => {
    await openTool(page, 'background');
    await pick(page, [{ name: 'Notes.pdf', bytes: await pagesPdf(2) }]);
    await page.getByTestId('opt-pages').fill('5');
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('This file has 2 pages; none of the pages typed are in it.');
  });
});

/** Each field of a form: its kind, its box in fractions of its page as seen, and its choices. */
async function formFields(bytes: Uint8Array): Promise<Array<{ name: string; type: string; page: number; box: Box; options: string[]; multiline: boolean }>> {
  const pdf = await openPdf(bytes);
  try {
    const out: Array<{ name: string; type: string; page: number; box: Box; options: string[]; multiline: boolean }> = [];
    for (const [name, widgets] of Object.entries(await pdf.fields())) {
      for (const w of widgets) {
        if (typeof w['type'] !== 'string' || w['type'] === '') continue;
        const page = w['page'] as number;
        const { width, height } = await pdf.size(page);
        const [x0, y0, x1, y1] = w['rect'] as [number, number, number, number];
        const items = (w['items'] as Array<{ displayValue: string }> | undefined) ?? [];
        out.push({ name, type: w['type'] as string, page, box: { x: x0 / width, y: 1 - y1 / height, w: (x1 - x0) / width, h: (y1 - y0) / height }, options: items.map((i) => i.displayValue), multiline: w['multiline'] === true });
      }
    }
    return out;
  } finally {
    await pdf.close();
  }
}

test.describe('create a form', () => {
  test('finds the blanks on a printed lease, names each after its label, and the result fills in', async ({ page }) => {
    const input = await leasePdf();
    await openTool(page, 'create-form');
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await expect(page.locator('.run__note')).toHaveText('Draw a field, or tap “Find the blanks for me”.');
    await page.getByTestId('form-detect').click();
    await expect(page.getByTestId('form-detect-said')).toHaveText('Found 3 blanks, each now a field named after the words beside it. Check them: tap one to rename it or take it away.');
    const out = await runAndSave(page);
    expect(out.name).toBe('Lease (form).pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('3 text fields added: anyone can fill it in, in any PDF reader');
    const fields = await formFields(out.bytes);
    expect(fields.map((f) => f.name).sort()).toEqual(['Date', 'Owner', 'Tenant']);
    // Each sits on page 2, over its line of underscores.
    const pdf = await openPdf(input);
    const words = await pdf.words(1);
    const { width, height } = await pdf.size(1);
    await pdf.close();
    for (const f of fields) {
      expect(f.page).toBe(1);
      expect(f.type).toBe('text');
      const line = words.find((w) => w.text.startsWith(`${f.name}:`))!;
      const blankEnd = (line.x + line.width) / width;
      expect(Math.abs(f.box.x + f.box.w - blankEnd)).toBeLessThan(0.02);
      expect(Math.abs(f.box.y + f.box.h - line.y / height)).toBeLessThan(0.02);
    }

    // Then… straight into Fill in a form with the new form.
    await page.getByTestId('then-menu').click();
    await page.getByTestId('then-fill-form').click();
    await page.waitForURL(/\/tools\/fill-form\/$/);
    await expect(page.getByTestId('file-item')).toHaveCount(1);
    await page.getByTestId('form-field-Owner').fill('Joseph Mathew');
    await page.getByTestId('form-field-Tenant').fill('Anjali Menon');
    const filled = await runAndSave(page);
    const values = await fieldValues(filled.bytes);
    expect(values['Owner']).toBe('Joseph Mathew');
    expect(values['Tenant']).toBe('Anjali Menon');
  });

  test('every kind of field drawn by hand, named, with choices, where it was drawn', async ({ page }) => {
    const input = await applicationBlank();
    await openTool(page, 'create-form');
    await pick(page, [{ name: 'Survey.pdf', bytes: input }]);
    await page.getByTestId('opt-field-name').fill('Full name');
    await dragPage(page, [0.2, 0.2], [0.7, 0.24]);
    await page.getByTestId('opt-field-kind-multiline').check();
    await page.getByTestId('opt-field-name').fill('');
    await dragPage(page, [0.2, 0.3], [0.8, 0.42]);
    // Renamed after it was drawn: tap it, then type.
    await page.getByTestId('opt-field-name').fill('Address');
    await page.getByTestId('opt-field-kind-check').check();
    await page.getByTestId('opt-field-name').fill('');
    await tapPage(page, 0.25, 0.5);
    await page.getByTestId('opt-field-name').fill('Agree');
    await page.getByTestId('opt-field-kind-choice').check();
    await expect(page.getByTestId('opt-field-options')).toBeVisible();
    await page.getByTestId('opt-field-options').fill('Kochi, Chennai, Dubai');
    await page.getByTestId('opt-field-name').fill('City');
    await dragPage(page, [0.2, 0.6], [0.5, 0.63]);
    // A tap with the text tool is too small to be a field, and says so.
    await page.getByTestId('opt-field-kind-text').check();
    await tapPage(page, 0.8, 0.8);
    await expect(page.getByTestId('editor-hint')).toHaveText('Drag across the space, from one corner to the other.');
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 text field, 1 paragraph field, 1 tick box and 1 choice list added: anyone can fill it in, in any PDF reader');
    const fields = await formFields(out.bytes);
    const by = (name: string) => fields.find((f) => f.name === name)!;
    expect(by('Full name').type).toBe('text');
    expect(by('Full name').box.x).toBeCloseTo(0.2, 1);
    expect(by('Full name').box.w).toBeCloseTo(0.5, 1);
    expect(by('Address').multiline).toBe(true);
    expect(by('Address').box.h).toBeCloseTo(0.12, 1);
    expect(by('Agree').type).toBe('checkbox');
    expect(by('City').type).toBe('combobox');
    expect(by('City').options).toEqual(['Kochi', 'Chennai', 'Dubai']);
    expect(by('City').box.y).toBeCloseTo(0.6, 1);
  });

  test('two fields given one name stay two fields, and × takes one away', async ({ page }) => {
    await openTool(page, 'create-form');
    await pick(page, [{ name: 'Sheet.pdf', bytes: await applicationBlank() }]);
    await page.getByTestId('opt-field-name').fill('Phone');
    await dragPage(page, [0.2, 0.2], [0.6, 0.23]);
    await dragPage(page, [0.2, 0.3], [0.6, 0.33]);
    await dragPage(page, [0.2, 0.4], [0.6, 0.43]);
    await expect(page.locator('.editor__item--field-text')).toHaveCount(3);
    await page.locator('.editor__item.is-selected [data-testid="editor-remove"]').click();
    await expect(page.locator('.editor__item--field-text')).toHaveCount(2);
    const out = await runAndSave(page);
    const names = (await formFields(out.bytes)).map((f) => f.name).sort();
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe('Phone');
  });
});

test.describe('on a phone, and starting over', () => {
  const SAMPLE: Record<string, () => Promise<Uint8Array>> = {
    watermark: () => pagesPdf(2),
    'page-numbers': () => pagesPdf(2),
    'header-footer': () => pagesPdf(2),
    background: () => pagesPdf(2),
    sign: () => leasePdf(),
    'mark-up': () => leasePdf(),
    'edit-text': () => salarySlipPdf(),
    'add-text': () => applicationBlank(),
    'edit-images': () => brochurePdf(),
    'add-image': () => applicationBlank(),
    'fill-form': () => applicationFormPdf(),
    'create-form': () => leasePdf(),
  };
  for (const [tool, sample] of Object.entries(SAMPLE)) {
    test(`${tool}: nothing runs off a 360px screen, and the main button stays under the thumb`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone', 'phone layout');
      await openTool(page, tool as Parameters<typeof openTool>[1]);
      await pick(page, [{ name: 'Sample.pdf', bytes: await sample() }]);
      const editor = page.getByTestId('page-editor');
      if (await editor.count()) await expect(page.getByTestId('editor-where')).toHaveText(/^Page 1 of/);
      const view = page.viewportSize()!;
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // Every control the tool shows is on screen, side to side, and big enough for a thumb.
      const controls = page.locator('[data-slot="body"] :is(input:not(.visually-hidden), select, textarea, button):visible');
      for (const box of await controls.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, w: r.width, h: r.height, id: (e as HTMLElement).dataset['testid'] ?? e.tagName }; }))) {
        expect(box.x, box.id).toBeGreaterThanOrEqual(0);
        expect(box.right, box.id).toBeLessThanOrEqual(view.width + 0.5);
      }
      if (await editor.count()) {
        const sheet = (await page.getByTestId('editor-page').boundingBox())!;
        expect(sheet.x).toBeGreaterThanOrEqual(0);
        expect(sheet.x + sheet.width).toBeLessThanOrEqual(view.width);
        // Scrolled to the page, the page is in view and the button is still at the bottom of the screen.
        await page.getByTestId('editor-page').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      } else {
        await page.locator('[data-slot="body"] .options-stack, [data-slot="body"] .form-panel').first().evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      }
      // On screen without scrolling to it: pinned at the bottom, or simply there when the settings are short.
      const button = (await page.getByTestId('run-button').boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(0);
      expect(button.y + button.height).toBeLessThanOrEqual(view.height);
      expect(button.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByTestId('run-button')).toBeInViewport();
    });
  }

  test('on a phone, a signature is placed with a finger tap and the file comes out signed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'touch');
    const input = await leasePdf();
    await openTool(page, 'sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: input }]);
    await page.getByTestId('signature-typed').fill('Anjali Menon');
    const [x, y] = await onPage(page, 0.5, 0.6);
    await page.touchscreen.tap(x, y);
    await expect(page.getByTestId('editor-item')).toHaveCount(1);
    const out = await runAndSave(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Signed on page 1');
    const [cx, cy] = centre(extent(await added(input, out.bytes, 0, 1), notWhite)!);
    expect(Math.abs(cx - 0.5)).toBeLessThan(0.04);
    expect(Math.abs(cy - 0.6)).toBeLessThan(0.04);
  });

  test('start over clears the files, the result and the page, ready for the next file', async ({ page }) => {
    await openTool(page, 'watermark');
    await pick(page, [{ name: 'One.pdf', bytes: await pagesPdf(1) }]);
    await page.getByTestId('opt-text').fill('COPY');
    await run(page);
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('result')).toHaveCount(0);
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    // The settings chosen stay chosen for the next file.
    await expect(page.getByTestId('opt-text')).toHaveValue('COPY');
    await pick(page, [{ name: 'Two.pdf', bytes: await pagesPdf(2) }]);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('"COPY" across 2 pages');

    await openTool(page, 'sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf() }]);
    await page.getByTestId('signature-typed').fill('Ravi');
    await tapPage(page, 0.5, 0.5);
    await run(page);
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('page-editor')).toBeHidden();
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await pick(page, [{ name: 'Report.pdf', bytes: (await annualReportPdf()).bytes }]);
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 3');
    // The signature drawn is still there to place; the marks on the old file are not.
    await expect(page.getByTestId('editor-item')).toHaveCount(0);
    await tapPage(page, 0.5, 0.5);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Signed on page 1');
  });

  test('a stamped file can go straight on to the next tool', async ({ page }) => {
    await openTool(page, 'page-numbers');
    await pick(page, [{ name: 'Deck.pdf', bytes: await pagesPdf(3) }]);
    await run(page);
    await page.getByTestId('then-menu').click();
    await page.getByTestId('then-watermark').click();
    await page.waitForURL(/\/tools\/watermark\/$/);
    await expect(page.getByTestId('file-item')).toHaveCount(1);
    await expect(page.getByTestId('file-item')).toContainText('Deck numbered.pdf');
    const out = await runAndSave(page);
    const pdf = await openPdf(out.bytes);
    for (let i = 0; i < 3; i++) {
      const text = await pdf.text(i);
      expect(text).toContain('DRAFT');
      expect(text).toContain(String(i + 1));
    }
    await pdf.close();
  });
});
