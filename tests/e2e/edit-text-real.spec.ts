/**
 * Edit text on the two kinds of document that broke it in a real person's
 * hands: an ERP purchase order (cells told apart only by their lines, words
 * in a Windows font, an item name made longer), and a letter that came off a
 * scanner (its words are pixels until they are read).
 */
import { expect, test, type Page } from '@playwright/test';
import { ruledOrderPdf, scannedLetterPdf } from '../fixtures/edit-samples';
import { added, isInk, openPdf, share, type Picture } from '../fixtures/mark-inspect';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

async function pick(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.getByTestId('file-input').setInputFiles([{ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) }]);
  await expect(page.getByTestId('file-item')).toHaveCount(1);
  await expect(page.locator('[data-testid="file-item"] .file-item__meta').first()).toContainText(/page/);
}

async function tapPage(page: Page, fx: number, fy: number): Promise<void> {
  const layer = page.getByTestId('editor-layer');
  await layer.evaluate((el) => {
    document.documentElement.style.setProperty('scroll-behavior', 'auto');
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  let box = await layer.boundingBox();
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(60);
    const again = await layer.boundingBox();
    if (again && box && again.y === box.y && again.x === box.x) break;
    box = again;
  }
  if (!box) throw new Error('no page');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** The share of pixel rows between top and bottom (fractions) where an upright line at x (a fraction) shows: 1 when it is whole. */
function lineShown(picture: Picture, x: number, top: number, bottom: number): number {
  const cx = Math.round(x * picture.width);
  const y0 = Math.round(top * picture.height);
  const y1 = Math.round(bottom * picture.height);
  let shown = 0;
  for (let y = y0; y < y1; y++) {
    let ink = false;
    for (let dx = -3; dx <= 3 && !ink; dx++) {
      const i = (y * picture.width + cx + dx) * 4;
      ink = isInk(picture.data[i] ?? 255, picture.data[i + 1] ?? 255, picture.data[i + 2] ?? 255);
    }
    if (ink) shown++;
  }
  return y1 > y0 ? shown / (y1 - y0) : 0;
}

async function runAndSave(page: Page): Promise<Uint8Array> {
  await run(page);
  return (await downloadFrom(page, page.getByTestId('save-button').first())).bytes;
}

test('a purchase order: one cell is changed, in the file’s own font, and stays inside its lines', async ({ page }) => {
  const order = await ruledOrderPdf();
  const cell = order.cells.description;
  await openTool(page, 'edit-text');
  await pick(page, 'PO.pdf', order.bytes);
  await expect(page.locator('.editor__line-hint').first()).toBeAttached();
  await tapPage(page, (cell.x0 + 20) / order.width, (order.baseline - order.size * 0.35) / order.height);
  // Only this cell: the brand beside it, a few points away across a line, is not part of it.
  await expect(page.getByTestId('opt-words')).toHaveValue('O/I Moringa Leaf Powder 100g');
  const longer = 'O/I Moringa Leaf Powder Organic Premium 250g Pack';
  await page.getByTestId('opt-words').fill(longer);
  const out = await runAndSave(page);
  await expect(page.getByTestId('result-detail')).toHaveText('1 change made');
  const pdf = await openPdf(out);
  try {
    const words = await pdf.words(0);
    const written = words.find((w) => w.text === longer)!;
    expect(written).toBeDefined();
    expect(Math.abs(written.x - cell.x0)).toBeLessThan(1);
    expect(Math.abs(written.y - order.baseline)).toBeLessThan(1);
    // Squeezed or made smaller, never across the line that ends the cell.
    expect(written.x + written.width).toBeLessThan(order.rules[3]!);
    expect((await pdf.fonts(0)).find((f) => f.text === longer)?.font).toBe('MicrosoftSansSerif');
    // The brand is untouched and the cell's lines are whole.
    expect(words.find((w) => w.text === 'ORGANIC IND')).toBeDefined();
    const picture = await pdf.render(0, 3);
    for (const x of [order.rules[2]!, order.rules[3]!]) {
      expect(lineShown(picture, x / order.width, (order.rowTop + 1) / order.height, (order.rowBottom - 1) / order.height)).toBe(1);
    }
  } finally {
    await pdf.close();
  }
});

test('a scanned letter: its words are read, and only the changed ones are repainted, bold where they were bold', async ({ page }) => {
  test.setTimeout(180_000);
  const letter = await scannedLetterPdf();
  await openTool(page, 'edit-text');
  await pick(page, 'Letter.pdf', letter.bytes);
  const read = page.getByTestId('read-scan');
  await expect(read).toBeVisible();
  await expect(page.getByTestId('editor-hint')).toContainText('picture of paper');
  // Tapping before reading says what to do.
  await tapPage(page, letter.salutation.x, letter.salutation.y);
  await expect(page.getByTestId('editor-hint')).toContainText('Read the words on this page');
  await read.click();
  await expect(page.locator('.editor__line-hint').first()).toBeAttached({ timeout: 120_000 });
  await expect(read).toBeHidden();
  await tapPage(page, letter.salutation.x, letter.salutation.y);
  await expect(page.getByTestId('opt-words')).toHaveValue(/Valued Customer/);
  const was = await page.getByTestId('opt-words').inputValue();
  await page.getByTestId('opt-words').fill(was.replace('Valued', 'Esteemed'));
  // A table cell on its own, though the reader saw the column lines too.
  await tapPage(page, letter.cell.x, letter.cell.y);
  await expect(page.getByTestId('opt-words')).toHaveValue(/^PEPERO ASSORTED/);
  const cell = await page.getByTestId('opt-words').inputValue();
  await page.getByTestId('opt-words').fill(cell.replace('ASSORTED', 'MIXED'));
  const out = await runAndSave(page);
  await expect(page.getByTestId('result-detail')).toHaveText('2 changes made');
  const pdf = await openPdf(out);
  try {
    const words = await pdf.words(0);
    expect(words.map((w) => w.text).join(' ')).toContain('Esteemed Customer');
    expect(words.map((w) => w.text).join(' ')).toMatch(/MIXED/);
    const fonts = await pdf.fonts(0);
    expect(fonts.find((f) => f.text.includes('Esteemed'))?.font).toMatch(/Helvetica-Bold$/);
    expect(fonts.find((f) => f.text.includes('MIXED'))?.font).toMatch(/Helvetica$/);
    // Nothing above the name or below the table changed, and the table's column lines are whole.
    const diff = await added(letter.bytes, out, 0, 1);
    expect(share(diff, { x: 0, y: 0, w: 1, h: letter.salutation.y - 0.02 }, isInk)).toBe(0);
    expect(share(diff, { x: 0, y: letter.tableBottom + 0.01, w: 1, h: 1 - letter.tableBottom - 0.01 }, isInk)).toBe(0);
    const picture = await pdf.render(0, 2);
    for (const x of letter.rules.slice(0, 3)) {
      expect(lineShown(picture, x, letter.tableTop + 0.002, letter.tableBottom - 0.002)).toBeGreaterThan(0.98);
    }
    // "M/s:" before the change is the original picture: not rewritten.
    expect(words.some((w) => w.text.startsWith('M/s'))).toBe(false);
  } finally {
    await pdf.close();
  }
});
