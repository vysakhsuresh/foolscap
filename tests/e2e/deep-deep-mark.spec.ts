/**
 * The Mark up family, tested the way a person uses it: real-looking
 * documents in, every option a person can choose, and the result read back
 * and looked at — the words on the page, where the marks landed, their
 * colour, the form's answers — not just "a file came out".
 */
import { expect, test, type Page } from '@playwright/test';
import { encryptedPdf, pagesPdf, pdfInfo } from '../fixtures/pdfs';
import { annualReportPdf, turnedPagesPdf } from '../fixtures/mark-samples';
import { added, extent, look, mean, notWhite, openPdf, share, type Word } from '../fixtures/mark-inspect';
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
