/**
 * The Protect and Read tools, the way a person uses them: real-looking
 * documents (a payslip, a lease in two versions, a report, a scan, phone
 * photos), every option a person can choose, and the output read back to
 * check it is RIGHT — not just that a file came out. Passwords really asked
 * for and really gone, permissions really set, details really removed or
 * changed, redacted words really absent and the black really where it was
 * drawn, attachments byte for byte, signatures that verify, words read from a
 * scan where they sit on the page.
 */
import { unzipSync } from 'fflate';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import * as asn1js from 'asn1js';
import { ContentInfo, SignedData } from 'pkijs';
import { AES_EC384, EMPTY_PASSWORD_EC256 } from '../fixtures/certificates';
import { encryptedPdf, pagesPdf, pdfInfo, stampsIn } from '../fixtures/pdfs';
import { oldLockPdf, restrictedPdf } from '../fixtures/awkward';
import { darkShare, findWord, hiddenIn, meanColour, opens, pdfDetails, pdfText, renderPage } from '../fixtures/protect-inspect';
import { CAMERA, SLIP, leasePdf, logoPng, mixedScanPdf, reportPdf, salarySlipPdf, scannedSlipPdf, slipPhotoJpeg, REPORT_ROWS } from '../fixtures/protect-samples';
import { downloadFrom, openTool, run, useDownloads } from './helpers';

test.beforeEach(async ({ context }) => {
  await useDownloads(context);
});

/** The detailed checks run once, on the laptop; the phone runs its own layout checks below. */
const laptopOnly = (info: TestInfo) => test.skip(info.project.name !== 'laptop', 'checked once, on the laptop');

interface Pick {
  name: string;
  bytes: Uint8Array;
  mime?: string;
}

async function pick(page: Page, files: Pick[], expected = files.length): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files.map((f) => ({ name: f.name, mimeType: f.mime ?? 'application/pdf', buffer: Buffer.from(f.bytes) })));
  await expect(page.getByTestId('file-item')).toHaveCount(expected);
}

async function save(page: Page, index = 0): Promise<{ name: string; bytes: Uint8Array }> {
  return downloadFrom(page, page.getByTestId('save-button').nth(index));
}

/** Locked the way Add a password locks: with the app's own surgeon, which encrypts every string. */
async function lock(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const { createSurgeon } = await import('../../app/src/pdf/surgeon');
  const doc = await createSurgeon().open(bytes.slice());
  return doc.save({ encrypt: { userPassword: password, allowPrinting: true, allowCopying: true } });
}

const PERM = { print: 0x04, modify: 0x08, copy: 0x10, annotate: 0x20, forms: 0x100, assemble: 0x400, printHigh: 0x800 } as const;
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

// ============================================================ Add a password

test.describe('add a password', () => {
  test('locks a payslip with AES-256: the right password opens it, a wrong one does not, and the words are intact', async ({ page }, info) => {
    laptopOnly(info);
    const slip = await salarySlipPdf();
    await openTool(page, 'add-password');
    await expect(page.getByTestId('opt-lock-password')).toBeChecked();
    await pick(page, [{ name: 'Payslip Sep 2026.pdf', bytes: slip }]);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type the password to lock it with.');
    await page.getByTestId('opt-password').fill('Kochi@2026');
    await page.getByTestId('opt-confirm').fill('Kochi@202');
    await expect(page.locator('.run__note')).toHaveText("The two passwords don't match yet.");
    await page.getByTestId('opt-confirm').fill('Kochi@2026');
    await run(page);
    const item = page.getByTestId('result-item');
    await expect(item).toHaveAttribute('data-name', 'Payslip Sep 2026 locked.pdf');
    await expect(page.getByTestId('result-detail')).toHaveText('Locked with AES-256; printing allowed, copying allowed, editing allowed');
    const { bytes } = await save(page);
    expect(await opens(bytes)).toBe('needs-password');
    expect(await opens(bytes, 'kochi@2026')).toBe('wrong-password');
    expect(await opens(bytes, 'Kochi@2026')).toBe('opens');
    const text = await pdfText(bytes, 'Kochi@2026');
    expect(text.pages[0]).toContain(SLIP.employee);
    expect(text.pages[0]).toContain(`Net pay ${SLIP.net}`);
    // AES-256 is /V 5 /R 6.
    expect(latin1(bytes)).toMatch(/\/V 5/);
    expect(latin1(bytes)).toMatch(/\/R 6/);
    expect(stampsIn(bytes)).toEqual([]);
  });

  test('every permission choice is written into the lock', async ({ page }, info) => {
    laptopOnly(info);
    const cases: Array<{ print: boolean; copy: boolean; edit: boolean }> = [
      { print: true, copy: true, edit: true },
      { print: false, copy: true, edit: false },
      { print: true, copy: false, edit: true },
      { print: false, copy: false, edit: false },
    ];
    for (const c of cases) {
      await openTool(page, 'add-password');
      await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
      await page.getByTestId('opt-password').fill('tea');
      await page.getByTestId('opt-confirm').fill('tea');
      await page.getByTestId('opt-allow-printing').setChecked(c.print);
      await page.getByTestId('opt-allow-copying').setChecked(c.copy);
      await page.getByTestId('opt-allow-editing').setChecked(c.edit);
      await run(page);
      const words = [c.print ? 'printing allowed' : 'printing blocked', c.copy ? 'copying allowed' : 'copying blocked', c.edit ? 'editing allowed' : 'editing blocked'];
      await expect(page.getByTestId('result-detail')).toHaveText(`Locked with AES-256; ${words.join(', ')}`);
      const { bytes } = await save(page);
      const perms = (await pdfDetails(bytes, 'tea')).permissions ?? Object.values(PERM);
      expect(perms.includes(PERM.print), `print ${JSON.stringify(c)}`).toBe(c.print);
      expect(perms.includes(PERM.copy), `copy ${JSON.stringify(c)}`).toBe(c.copy);
      expect(perms.includes(PERM.modify), `modify ${JSON.stringify(c)}`).toBe(c.edit);
      expect(perms.includes(PERM.annotate), `annotate ${JSON.stringify(c)}`).toBe(c.edit);
      expect(perms.includes(PERM.forms)).toBe(true);
    }
  });

  test('a password in Malayalam, or with accents and spaces, locks and opens', async ({ page }, info) => {
    laptopOnly(info);
    for (const password of ['പാസ്‌വേഡ് 2026', 'Crème brûlée 42', ' leading and trailing ']) {
      await openTool(page, 'add-password');
      await pick(page, [{ name: 'Slip.pdf', bytes: await salarySlipPdf() }]);
      await page.getByTestId('opt-password').fill(password);
      await page.getByTestId('opt-confirm').fill(password);
      await run(page);
      const { bytes } = await save(page);
      expect(await opens(bytes), password).toBe('needs-password');
      expect(await opens(bytes, password), password).toBe('opens');
    }
  });

  test('restrict-only opens for anyone and carries the restrictions', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'add-password');
    await pick(page, [{ name: 'Brochure.pdf', bytes: await reportPdf() }]);
    // A lock starts with everything allowed; restricting starts with copying and changes off.
    await expect(page.getByTestId('opt-allow-copying')).toBeChecked();
    await expect(page.getByTestId('opt-allow-editing')).toBeChecked();
    await page.getByTestId('opt-lock-restrict').check();
    await expect(page.getByTestId('opt-password')).toBeHidden();
    await expect(page.getByTestId('opt-allow-printing')).toBeChecked();
    await expect(page.getByTestId('opt-allow-copying')).not.toBeChecked();
    await expect(page.getByTestId('opt-allow-editing')).not.toBeChecked();
    await page.getByTestId('opt-allow-printing').check();
    await page.getByTestId('opt-allow-copying').check();
    await page.getByTestId('opt-allow-editing').check();
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Everything is allowed, so there is nothing to restrict. Untick something.');
    await page.getByTestId('opt-allow-copying').uncheck();
    await page.getByTestId('opt-allow-editing').uncheck();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Opens without a password; printing allowed, copying blocked, editing blocked');
    const { name, bytes } = await save(page);
    expect(name).toBe('Brochure restricted.pdf');
    expect(await opens(bytes)).toBe('opens');
    const perms = (await pdfDetails(bytes)).permissions;
    expect(perms).not.toBeNull();
    expect(perms).toContain(PERM.print);
    expect(perms).not.toContain(PERM.copy);
    expect(perms).not.toContain(PERM.modify);
    expect((await pdfText(bytes)).pages[0]).toContain('Quarterly Sales Review');
  });

  test('several files at once each come back locked, and a locked one gets its new password', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'add-password');
    await pick(page, [
      { name: 'Slip.pdf', bytes: await salarySlipPdf() },
      { name: 'Old lock.pdf', bytes: await encryptedPdf('old-one', 2) },
      { name: 'Lease.pdf', bytes: await leasePdf(1) },
    ]);
    // The locked one asks for its own password first; the others can wait.
    await page.getByTestId('file-password').fill('old-one');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item').nth(1)).toHaveAttribute('data-pages', '2');
    await page.getByTestId('opt-password').fill('new-one');
    await page.getByTestId('opt-confirm').fill('new-one');
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(3);
    await expect(page.getByTestId('save-all-button')).toHaveText('Save all 3');
    const zip = await downloadFrom(page, page.getByTestId('save-all-button'));
    const files = unzipSync(zip.bytes);
    expect(Object.keys(files).sort()).toEqual(['Lease locked.pdf', 'Old lock locked.pdf', 'Slip locked.pdf']);
    for (const bytes of Object.values(files)) {
      expect(await opens(bytes)).toBe('needs-password');
      expect(await opens(bytes, 'new-one')).toBe('opens');
      expect(await opens(bytes, 'old-one')).toBe('wrong-password');
    }
  });

  test('then hands the locked file to Remove a password, which takes it off again', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'add-password');
    await pick(page, [{ name: 'Slip.pdf', bytes: await salarySlipPdf() }]);
    await page.getByTestId('opt-password').fill('round-trip');
    await page.getByTestId('opt-confirm').fill('round-trip');
    await run(page);
    await page.getByTestId('then-menu').click();
    await page.getByTestId('then-remove-password').click();
    await expect(page).toHaveURL(/\/tools\/remove-password\/$/);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('file-item')).toHaveCount(1);
    await page.getByTestId('file-password').fill('round-trip');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '1');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Password removed: it opens without one now');
    const { name, bytes } = await save(page);
    expect(name).toBe('Slip locked unlocked.pdf');
    expect(await opens(bytes)).toBe('opens');
    expect((await pdfText(bytes)).pages[0]).toContain(SLIP.pan);
  });
});

// ============================================================ Remove a password

test.describe('remove a password', () => {
  test('unlocks AES-256, AES-128 and both RC4 locks, keeping every page and word', async ({ page }, info) => {
    laptopOnly(info);
    const files = [
      { name: 'AES-256.pdf', bytes: await encryptedPdf('hdfc1990', 2) },
      { name: 'AES-128.pdf', bytes: await oldLockPdf('hdfc1990', 'AES-128') },
      { name: 'RC4-128.pdf', bytes: await oldLockPdf('hdfc1990', 'RC4-128') },
      { name: 'RC4-40.pdf', bytes: await oldLockPdf('hdfc1990', 'RC4-40') },
    ];
    await openTool(page, 'remove-password');
    await pick(page, files);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Type the passwords for the locked files, then tap Unlock.');
    for (let i = 0; i < files.length; i++) {
      const row = page.getByTestId('file-item').nth(i);
      await row.getByTestId('file-password').fill(i === 0 ? 'wrong' : 'hdfc1990');
      await row.getByTestId('file-unlock').click();
    }
    // The wrong one says so, and asks again.
    await expect(page.getByTestId('file-item').nth(0)).toContainText("That password didn't open it");
    await page.getByTestId('file-item').nth(0).getByTestId('file-password').fill('hdfc1990');
    await page.getByTestId('file-item').nth(0).getByTestId('file-unlock').click();
    for (let i = 0; i < files.length; i++) await expect(page.getByTestId('file-item').nth(i)).toHaveAttribute('data-pages', '2');
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(4);
    for (let i = 0; i < files.length; i++) {
      await expect(page.getByTestId('result-detail').nth(i)).toHaveText('Password removed: it opens without one now');
      const { name, bytes } = await save(page, i);
      expect(name).toBe(files[i]!.name.replace('.pdf', ' unlocked.pdf'));
      expect(await opens(bytes), name).toBe('opens');
      expect((await pdfDetails(bytes)).permissions, name).toBeNull();
      const text = await pdfText(bytes);
      expect(text.pages, name).toHaveLength(2);
      expect(text.pages[1], name).toContain('2');
      expect((await pdfInfo(bytes)).sizes, name).toEqual([[300, 400], [310, 400]]);
    }
  });

  test('a file that only blocks printing and copying opens straight away and comes back free', async ({ page }, info) => {
    laptopOnly(info);
    const restricted = await restrictedPdf();
    expect((await pdfDetails(restricted)).permissions).not.toBeNull();
    await openTool(page, 'remove-password');
    await pick(page, [{ name: 'Statement.pdf', bytes: restricted }]);
    await expect(page.getByTestId('file-password')).toHaveCount(0);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Printing and copying restrictions removed');
    const { bytes } = await save(page);
    expect((await pdfDetails(bytes)).permissions).toBeNull();
    expect(latin1(bytes)).not.toMatch(/\/Encrypt/);
  });

  test('a file with no password is left alone, and says why', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'remove-password');
    await pick(page, [{ name: 'Plain.pdf', bytes: await leasePdf(1) }]);
    await run(page);
    await expect(page.getByTestId('failure-item')).toHaveText('Plain.pdf: This file has no password, so there is nothing to remove.');
    await expect(page.getByTestId('result-item')).toHaveCount(0);
  });

  test('keeps the title and details of the file it unlocks', async ({ page }, info) => {
    laptopOnly(info);
    const locked = await lock(await salarySlipPdf({ hidden: true }), 'ANJA1990');
    await openTool(page, 'remove-password');
    await pick(page, [{ name: 'e-Payslip.pdf', bytes: locked }]);
    await page.getByTestId('file-password').fill('ANJA1990');
    await page.getByTestId('file-password').press('Enter');
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '1');
    await run(page);
    const { bytes } = await save(page);
    const details = await pdfDetails(bytes);
    expect(details.info['Title']).toBe('Payslip September 2026 - Anjali Menon');
    expect(details.attachments.map((a) => a.name)).toEqual([SLIP.attachment]);
  });
});

// ============================================================ Clean hidden data

test.describe('clean hidden data', () => {
  test('clean everything: details, every XMP packet, scripts, the attachment, the comment, camera details and private data go; the page and its link stay', async ({ page }, info) => {
    laptopOnly(info);
    const slip = await salarySlipPdf({ hidden: true });
    const before = await hiddenIn(slip);
    expect(before.xmp.length).toBe(2);
    expect(before.scripts).toBeGreaterThanOrEqual(2);
    expect(latin1(slip)).toContain(CAMERA.gps);
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'Payslip.pdf', bytes: slip }]);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(
      'Removed the title, author, subject, keywords, creator and producer, 2 hidden XMP metadata packets, the camera details (device, time, place) inside 1 photo, private data an editing program left, 2 scripts and actions, 1 attached file and 1 comment',
    );
    const { name, bytes } = await save(page);
    expect(name).toBe('Payslip cleaned.pdf');
    const after = await hiddenIn(bytes);
    expect(after).toEqual({ xmp: [], scripts: 0, pieceInfo: 0, embeddedFiles: 0, info: {} });
    const raw = latin1(bytes);
    for (const secret of [SLIP.author, SLIP.xmpAuthor, CAMERA.gps, CAMERA.device, CAMERA.comment, 'Tally', 'app.alert', SLIP.attachment, SLIP.comment]) expect(raw, secret).not.toContain(secret);
    const details = await pdfDetails(bytes);
    expect(details.annotations[0]?.map((a) => a.subtype)).toEqual(['Link']);
    expect(details.attachments).toEqual([]);
    // The page itself is untouched: the same words, and the photo still drawn.
    expect((await pdfText(bytes)).pages).toEqual((await pdfText(slip)).pages);
    const [a, b] = [await renderPage(slip, 0, 1), await renderPage(bytes, 0, 1)];
    const photo = { x: 470 / 595.28, y: 1 - 600 / 841.89, w: 64 / 595.28, h: 80 / 841.89 };
    const [r1, g1, b1] = meanColour(a, photo);
    const [r2, g2, b2] = meanColour(b, photo);
    expect(Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)).toBeLessThan(6);
  });

  test('clean can keep the comments and attached files when asked', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'Payslip.pdf', bytes: await salarySlipPdf({ hidden: true }) }]);
    await page.getByTestId('opt-clean-comments').uncheck();
    await page.getByTestId('opt-clean-attachments').uncheck();
    await expect(page.getByTestId('opt-mode-clean')).toBeChecked();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(
      'Removed the title, author, subject, keywords, creator and producer, 2 hidden XMP metadata packets, the camera details (device, time, place) inside 1 photo, private data an editing program left and 2 scripts and actions',
    );
    const { bytes } = await save(page);
    const details = await pdfDetails(bytes);
    expect(details.annotations[0]?.map((a) => a.contents).filter(Boolean)).toEqual([SLIP.comment]);
    expect(details.attachments.map((a) => [a.name, new TextDecoder().decode(a.bytes)])).toEqual([[SLIP.attachment, SLIP.attachmentText]]);
    expect((await hiddenIn(bytes)).scripts).toBe(0);
  });

  test('a file with nothing hidden says so honestly', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Nothing hidden was found: no details, metadata, scripts, attached files or comments');
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await page.getByTestId('opt-mode-strip').check();
    await run(page);
    await expect(page.getByTestId('failure-item')).toHaveText('Lease.pdf: This file has no title, author or other hidden details, so there is nothing to remove.');
  });

  test('remove the hidden details takes the details and metadata only', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'Payslip.pdf', bytes: await salarySlipPdf({ hidden: true }) }]);
    await page.getByTestId('opt-mode-strip').check();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(
      'Removed the title, author, subject, keywords, creator and producer, 2 hidden XMP metadata packets, the camera details (device, time, place) inside 1 photo and private data an editing program left',
    );
    const { bytes } = await save(page);
    const after = await hiddenIn(bytes);
    expect(after.info).toEqual({});
    expect(after.xmp).toEqual([]);
    expect(after.embeddedFiles).toBe(1);
    expect(after.scripts).toBeGreaterThan(0);
    expect(latin1(bytes)).not.toContain(CAMERA.gps);
  });

  test('set new details starts from what the file says, changes what was typed, and drops the stale XMP copy', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'Payslip.pdf', bytes: await salarySlipPdf({ hidden: true }) }]);
    await expect(page.getByTestId('opt-title')).toHaveValue('Payslip September 2026 - Anjali Menon');
    await expect(page.getByTestId('opt-author')).toHaveValue(SLIP.author);
    await expect(page.getByTestId('opt-subject')).toHaveValue('Salary slip');
    await page.getByTestId('opt-title').fill('Salary slip, September 2026');
    await expect(page.getByTestId('opt-mode-edit')).toBeChecked();
    await page.getByTestId('opt-subject').fill('');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Set the title; removed the subject; the hidden XMP copy that still held the old details was removed');
    const { name, bytes } = await save(page);
    expect(name).toBe('Payslip details.pdf');
    const after = await hiddenIn(bytes);
    expect(after.info['Title']).toBe('Salary slip, September 2026');
    expect(after.info['Author']).toBe(SLIP.author);
    expect(after.info['Subject']).toBeUndefined();
    expect(after.info['Producer']).toBe('Tally PDF Writer 3.1');
    expect(after.xmp.join('')).not.toContain('Payslip September 2026');
    const details = await pdfDetails(bytes);
    expect(details.info['Title']).toBe('Salary slip, September 2026');
  });

  test('a locked file stays locked with its own password, and several files are cleaned at once', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'document-details');
    await pick(page, [
      { name: 'Locked slip.pdf', bytes: await lock(await salarySlipPdf({ hidden: true }), 'ANJA1990') },
      { name: 'Report.pdf', bytes: await reportPdf() },
    ]);
    await page.getByTestId('file-password').fill('ANJA1990');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item').first()).toHaveAttribute('data-pages', '1');
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(2);
    await expect(page.getByTestId('result-detail').first()).toContainText(', still locked with the same password');
    const locked = await save(page, 0);
    expect(await opens(locked.bytes)).toBe('needs-password');
    const d = await pdfDetails(locked.bytes, 'ANJA1990');
    expect(d.info['Title']).toBeUndefined();
    expect(d.attachments).toEqual([]);
  });
});

// ============================================================ Attachments

test.describe('attachments', () => {
  test('puts a spreadsheet, a photo, a Word file and a PDF inside, byte for byte, and takes them all out again', async ({ page }, info) => {
    laptopOnly(info);
    const csv = new TextEncoder().encode('Month,Rent\nApril,18000\nMay,18000\n');
    const logo = logoPng();
    const { docxBytes } = await import('../fixtures/awkward');
    const docx = await docxBytes();
    const receipt = await pagesPdf(1);
    await openTool(page, 'attachments');
    // Picked in the order a phone lists them: the PDF is not first.
    await pick(page, [
      { name: 'aadhaar-logo.png', bytes: logo, mime: 'image/png' },
      { name: 'Lease.pdf', bytes: await leasePdf(1) },
      { name: 'rent.csv', bytes: csv, mime: 'text/csv' },
      { name: 'Notes.docx', bytes: docx, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'Receipt.pdf', bytes: receipt },
    ]);
    await expect(page.getByTestId('opt-mode-attach')).toBeChecked();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText("4 files attached inside; open the PDF's attachments panel to see them");
    const { name, bytes } = await save(page);
    expect(name).toBe('Lease with attachments.pdf');
    const inside = (await pdfDetails(bytes)).attachments;
    const byName = new Map(inside.map((a) => [a.name, a.bytes]));
    expect([...byName.keys()].sort()).toEqual(['Notes.docx', 'Receipt.pdf', 'aadhaar-logo.png', 'rent.csv']);
    expect(Buffer.from(byName.get('rent.csv')!).equals(Buffer.from(csv))).toBe(true);
    expect(Buffer.from(byName.get('aadhaar-logo.png')!).equals(Buffer.from(logo))).toBe(true);
    expect(Buffer.from(byName.get('Notes.docx')!).equals(Buffer.from(docx))).toBe(true);
    expect(Buffer.from(byName.get('Receipt.pdf')!).equals(Buffer.from(receipt))).toBe(true);
    // The lease's own pages are what they were.
    expect((await pdfText(bytes)).pages).toEqual((await pdfText(await leasePdf(1))).pages);

    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await expect(page.getByTestId('result')).toHaveCount(0);
    await pick(page, [{ name: 'Lease with attachments.pdf', bytes }]);
    await page.getByTestId('opt-mode-extract').check();
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(4);
    const zip = unzipSync((await downloadFrom(page, page.getByTestId('save-all-button'))).bytes);
    expect(Object.keys(zip).sort()).toEqual(['Notes.docx', 'Receipt.pdf', 'aadhaar-logo.png', 'rent.csv']);
    expect(Buffer.from(zip['Notes.docx']!).equals(Buffer.from(docx))).toBe(true);
    expect(Buffer.from(zip['rent.csv']!).equals(Buffer.from(csv))).toBe(true);
  });

  test('a file whose name is already inside is kept under its own name, not lost', async ({ page }, info) => {
    laptopOnly(info);
    const second = new TextEncoder().encode('emp_id,name,net\nKT0043,Ravi Kumar,64200\n');
    await openTool(page, 'attachments');
    await pick(page, [
      { name: 'Payslip.pdf', bytes: await salarySlipPdf({ hidden: true }) },
      { name: SLIP.attachment, bytes: second, mime: 'text/csv' },
    ]);
    await run(page);
    await expect(page.getByTestId('result-detail')).toContainText('called "payroll-export (2).csv"');
    const { bytes } = await save(page);
    const inside = (await pdfDetails(bytes)).attachments;
    expect(inside.map((a) => a.name).sort()).toEqual(['payroll-export (2).csv', 'payroll-export.csv']);
    expect(new TextDecoder().decode(inside.find((a) => a.name === 'payroll-export (2).csv')!.bytes)).toContain('Ravi Kumar');
    expect(new TextDecoder().decode(inside.find((a) => a.name === 'payroll-export.csv')!.bytes)).toBe(SLIP.attachmentText);
  });

  test('take out finds files attached to a page as well as to the document, and says when there are none', async ({ page }, info) => {
    laptopOnly(info);
    const { PDFDocument, PDFName, PDFString } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(await leasePdf(1), { updateMetadata: false });
    const content = new TextEncoder().encode('Signed copy of the inventory list.');
    const file = doc.context.register(doc.context.stream(content, { Type: 'EmbeddedFile' }));
    const spec = doc.context.obj({ Type: 'Filespec', F: PDFString.of('inventory.txt'), UF: PDFString.of('inventory.txt'), EF: { F: file } });
    const annot = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'FileAttachment', Rect: [500, 700, 520, 720], FS: spec, Name: 'PushPin' }));
    doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([annot]));
    await doc.attach(new TextEncoder().encode('a,b\n'), 'costs.csv', { mimeType: 'text/csv' });
    const bytes = new Uint8Array(await doc.save());
    await openTool(page, 'attachments');
    await pick(page, [
      { name: 'Lease.pdf', bytes },
      { name: 'Plain.pdf', bytes: await leasePdf(2) },
    ]);
    await page.getByTestId('opt-mode-extract').check();
    await run(page);
    const names = await page.getByTestId('result-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')).sort());
    expect(names).toEqual(['costs.csv', 'inventory.txt']);
    await expect(page.getByTestId('failure-item')).toHaveText('Plain.pdf: This PDF carries no attached files.');
    const txt = page.getByTestId('result-item').filter({ hasText: 'inventory.txt' });
    const back = await downloadFrom(page, txt.getByTestId('save-button'));
    expect(new TextDecoder().decode(back.bytes)).toBe('Signed copy of the inventory list.');
  });

  test('attach needs a file to put in, and a locked PDF stays locked', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'attachments');
    await pick(page, [{ name: 'Locked.pdf', bytes: await lock(await leasePdf(1), 'tea') }]);
    await page.getByTestId('file-password').fill('tea');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '3');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Add the files to attach after the PDF.');
    await pick(page, [{ name: 'photo.png', bytes: logoPng(), mime: 'image/png' }], 2);
    await run(page);
    await expect(page.getByTestId('result-detail')).toContainText(', still locked with the same password');
    const { bytes } = await save(page);
    expect(await opens(bytes)).toBe('needs-password');
    expect((await pdfDetails(bytes, 'tea')).attachments.map((a) => a.name)).toEqual(['photo.png']);
  });
});

// ============================================================ Remove areas

/** The editor's page, scrolled into view, and a drag across it in fractions of the page. */
async function layerBox(page: Page) {
  await page.getByTestId('editor-layer').evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  return (await page.getByTestId('editor-layer').boundingBox())!;
}

async function dragAcross(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = await layerBox(page);
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from[0] + to[0]) / 2), box.y + box.height * ((from[1] + to[1]) / 2), { steps: 4 });
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 4 });
  await page.mouse.up();
}

/**
 * Where a run of text really sits, from the font's own widths: `prefix` is
 * drawn first on the same line, then `text`. Fractions of a page `w` × `h`,
 * from the top-left, covering the letters from baseline to cap height.
 */
async function textBox(o: { font: 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman'; size: number; x: number; baseline: number; prefix?: string; text: string; w?: number; h?: number }) {
  const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(o.font === 'Helvetica' ? StandardFonts.Helvetica : o.font === 'Helvetica-Bold' ? StandardFonts.HelveticaBold : StandardFonts.TimesRoman);
  const W = o.w ?? 595.28;
  const H = o.h ?? 841.89;
  const left = o.x + (o.prefix ? font.widthOfTextAtSize(o.prefix, o.size) : 0);
  const width = font.widthOfTextAtSize(o.text, o.size);
  return { x: left / W, y: (H - o.baseline - o.size * 0.7) / H, w: width / W, h: (o.size * 0.7) / H };
}

const SLIP_ROW = (i: number) => 730 - i * 18;

test.describe('remove areas', () => {
  test('a dragged area on a payslip is painted out and gone: no words left on the page, black exactly there, the rest still readable', async ({ page }, info) => {
    laptopOnly(info);
    const slip = await salarySlipPdf();
    const aadhaar = await textBox({ font: 'Helvetica-Bold', size: 10, x: 190, baseline: SLIP_ROW(4), text: SLIP.aadhaar });
    const pan = await textBox({ font: 'Helvetica-Bold', size: 10, x: 190, baseline: SLIP_ROW(3), text: SLIP.pan });
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Payslip.pdf', bytes: slip }]);
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 1');
    await expect(page.getByTestId('run-button')).toBeDisabled();
    const pad = 0.006;
    await dragAcross(page, [aadhaar.x - pad, aadhaar.y - pad], [aadhaar.x + aadhaar.w + pad, aadhaar.y + aadhaar.h + pad]);
    await expect(page.getByTestId('editor-item')).toHaveCount(1);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 area removed. Page 1 is now a picture, so nothing under the black can be copied back');
    const { name, bytes } = await save(page);
    expect(name).toBe('Payslip (redacted).pdf');
    expect((await pdfInfo(bytes)).sizes).toEqual([[595.28, 841.89]]);
    expect((await pdfText(bytes)).pages[0]).toBe('');
    expect(latin1(bytes)).not.toContain('2345');
    const px = await renderPage(bytes, 0, 2);
    expect(darkShare(px, aadhaar, 60)).toBeGreaterThan(0.97);
    // The PAN a line above was not marked: still there to read, not blacked out.
    expect(darkShare(px, pan, 60)).toBeLessThan(0.6);
    expect(darkShare(px, pan, 140)).toBeGreaterThan(0.05);
    // Nothing else went black: the header band is as light as it was.
    expect(darkShare(px, { x: 0.1, y: 0.05, w: 0.5, h: 0.02 }, 60)).toBeLessThan(0.3);
  });

  test('only the marked page of a lease becomes a picture; the others keep their words, in order', async ({ page }, info) => {
    laptopOnly(info);
    const lease = await leasePdf(1);
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Lease.pdf', bytes: lease }]);
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 3');
    await page.getByTestId('editor-next').click();
    await expect(page.getByTestId('editor-where')).toHaveText('Page 2 of 3');
    await dragAcross(page, [0.08, 0.05], [0.9, 0.2]);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 area removed. Page 2 is now a picture, so nothing under the black can be copied back');
    const { bytes } = await save(page);
    const before = (await pdfText(lease)).pages;
    const after = (await pdfText(bytes)).pages;
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe('');
    expect(after[2]).toBe(before[2]);
    expect(latin1(bytes)).not.toContain('54000');
    const px = await renderPage(bytes, 1, 1);
    expect(darkShare(px, { x: 0.12, y: 0.07, w: 0.7, h: 0.1 }, 60)).toBeGreaterThan(0.97);
    // Clause 6 sits below the box, unharmed.
    expect(darkShare(px, { x: 0.1, y: 0.3, w: 0.8, h: 0.2 }, 60)).toBeLessThan(0.2);
  });

  test('find and remove marks every Aadhaar, PAN, phone, email and typed name, and each comes out black where the letters were', async ({ page }, info) => {
    laptopOnly(info);
    const slip = await salarySlipPdf();
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Payslip.pdf', bytes: slip }]);
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 1');
    await page.getByTestId('redact-finder').locator('summary').click();
    await expect(page.getByTestId('opt-find-aadhaar')).toBeChecked();
    await expect(page.getByTestId('opt-find-pan')).toBeChecked();
    await page.getByTestId('opt-find-phone').check();
    await page.getByTestId('opt-find-email').check();
    await page.getByTestId('opt-find-words').fill('Anjali Menon, 50100234567891');
    await page.getByTestId('redact-find').click();
    await expect(page.getByTestId('redact-found')).toHaveText('Marked 6 places on page 1. Check each one: tap one and its × takes it back.');
    await expect(page.getByTestId('editor-item')).toHaveCount(6);
    // Searching again does not mark the same places twice.
    await page.getByTestId('redact-find').click();
    await expect(page.getByTestId('redact-found')).toContainText('Nothing found');
    await expect(page.getByTestId('editor-item')).toHaveCount(6);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('6 areas removed. Page 1 is now a picture, so nothing under the black can be copied back');
    const { bytes } = await save(page);
    const px = await renderPage(bytes, 0, 2);
    const rows: Array<[number, string]> = [[0, SLIP.employee], [3, SLIP.pan], [4, SLIP.aadhaar], [5, SLIP.phone], [6, SLIP.email], [7, SLIP.account]];
    for (const [row, text] of rows) {
      const box = await textBox({ font: 'Helvetica-Bold', size: 10, x: 190, baseline: SLIP_ROW(row), text });
      expect(darkShare(px, box, 60), text).toBeGreaterThan(0.97);
    }
    // The designation was not asked for, and stays.
    const designation = await textBox({ font: 'Helvetica-Bold', size: 10, x: 190, baseline: SLIP_ROW(2), text: 'Senior Accountant' });
    expect(darkShare(px, designation, 60)).toBeLessThan(0.6);
  });

  test('a number in the middle of a line is covered to its first and last digit', async ({ page }, info) => {
    laptopOnly(info);
    const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.create({ updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p = doc.addPage([595.28, 841.89]);
    const lines = [
      ['Applicant: Mohammed Ashraf, Aadhaar ', '4567 8912 3456', ', residing at Kozhikode.'],
      ['WWWWWWWW MMMM card ', '9876 5432 1098', ' iiiiii lllll'],
    ];
    lines.forEach(([a, b, c], i) => p.drawText(`${a}${b}${c}`, { x: 40, y: 760 - i * 40, size: 14, font }));
    const bytes = new Uint8Array(await doc.save());
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Form.pdf', bytes }]);
    await page.getByTestId('redact-finder').locator('summary').click();
    await page.getByTestId('redact-find').click();
    await expect(page.getByTestId('editor-item')).toHaveCount(2);
    await run(page);
    const out = await save(page);
    const px = await renderPage(out.bytes, 0, 3);
    for (const [i, [a, b, c]] of lines.entries()) {
      const box = await textBox({ font: 'Helvetica', size: 14, x: 40, baseline: 760 - i * 40, prefix: a!, text: b! });
      expect(darkShare(px, box, 60), b).toBeGreaterThan(0.97);
      // And the words either side are still there to read.
      const after = await textBox({ font: 'Helvetica', size: 14, x: 40, baseline: 760 - i * 40, prefix: `${a}${b} `, text: c!.trim().slice(0, 4) });
      expect(darkShare(px, after, 60), c).toBeLessThan(0.7);
    }
  });

  test('a mark taken back is not removed, and a locked file stays locked', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Locked lease.pdf', bytes: await lock(await leasePdf(1), 'tea') }]);
    await page.getByTestId('file-password').fill('tea');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 3');
    await dragAcross(page, [0.1, 0.1], [0.5, 0.15]);
    await dragAcross(page, [0.1, 0.3], [0.5, 0.35]);
    await expect(page.getByTestId('editor-item')).toHaveCount(2);
    await page.getByTestId('editor-item').nth(1).click();
    await page.getByTestId('editor-item').nth(1).getByTestId('editor-remove').click();
    await expect(page.getByTestId('editor-item')).toHaveCount(1);
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 area removed. Page 1 is now a picture, so nothing under the black can be copied back, still locked with the same password');
    const { bytes } = await save(page);
    expect(await opens(bytes)).toBe('needs-password');
    const px = await renderPage(bytes, 0, 1, 'tea');
    expect(darkShare(px, { x: 0.12, y: 0.11, w: 0.36, h: 0.03 }, 60)).toBeGreaterThan(0.97);
    expect(darkShare(px, { x: 0.12, y: 0.31, w: 0.36, h: 0.03 }, 60)).toBeLessThan(0.3);
  });

  test('a comment and a form answer on a marked page go with it', async ({ page }, info) => {
    laptopOnly(info);
    const { PDFDocument, PDFHexString } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(await salarySlipPdf(), { updateMetadata: false });
    const form = doc.getForm();
    const field = form.createTextField('pan');
    field.setText(SLIP.pan);
    field.addToPage(doc.getPage(0), { x: 300, y: 300, width: 150, height: 20 });
    const note = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [500, 700, 520, 720], Contents: PDFHexString.fromText(`Aadhaar ${SLIP.aadhaar}`) }));
    doc.getPage(0).node.addAnnot(note);
    const bytes = new Uint8Array(await doc.save());
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Payslip form.pdf', bytes }]);
    await dragAcross(page, [0.3, 0.12], [0.6, 0.16]);
    await run(page);
    const out = await save(page);
    const details = await pdfDetails(out.bytes);
    expect(details.annotations[0]).toEqual([]);
    expect(latin1(out.bytes)).not.toContain(SLIP.pan);
    expect(latin1(out.bytes)).not.toContain('Aadhaar 2345');
  });
});
