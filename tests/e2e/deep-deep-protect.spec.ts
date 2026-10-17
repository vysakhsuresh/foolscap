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
import { CAMERA, SLIP, exifTurnedPhotoJpeg, leasePdf, sidewaysScanPdf, turnedSlipPdf, logoPng, mixedScanPdf, reportPdf, salarySlipPdf, scannedSlipPdf, slipPhotoJpeg, REPORT_ROWS } from '../fixtures/protect-samples';
import { ORIGIN, downloadFrom, openTool, run, useDownloads } from './helpers';

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
    test.setTimeout(180_000);
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

  test('an e-Aadhaar-style signed and locked file is unlocked, and the result says its signature no longer checks out', async ({ page }, info) => {
    laptopOnly(info);
    const { createSurgeon } = await import('../../app/src/pdf/surgeon');
    const surgeon = createSurgeon();
    const signed = await surgeon.signWithCertificate(await salarySlipPdf(), new Uint8Array(Buffer.from(AES_EC384, 'base64')), 'pässword', { visible: true });
    if (!signed.ok) throw new Error('the test certificate ran out');
    const locked = await lock(signed.bytes, 'ANJA1990');
    await openTool(page, 'remove-password');
    await pick(page, [{ name: 'eAadhaar_1234.pdf', bytes: locked }]);
    await page.getByTestId('file-password').fill('ANJA1990');
    await page.getByTestId('file-unlock').click();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(
      'Password removed: it opens without one now. It carried a digital signature, which no longer checks out in this copy: where the signature is verified, send the original',
    );
    expect(await opens((await save(page)).bytes)).toBe('opens');
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
      'Removed the title, author, subject, keywords, creator and producer, 2 hidden XMP metadata packets, the camera details (device, time, place) inside 1 photo, private data an editing program left, 1 stored page thumbnail (a picture of a page as it once was), 2 scripts and actions, 1 attached file and 1 comment',
    );
    const { name, bytes } = await save(page);
    expect(name).toBe('Payslip cleaned.pdf');
    const after = await hiddenIn(bytes);
    expect(after).toEqual({ xmp: [], scripts: 0, pieceInfo: 0, embeddedFiles: 0, thumbnails: 0, info: {} });
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
      'Removed the title, author, subject, keywords, creator and producer, 2 hidden XMP metadata packets, the camera details (device, time, place) inside 1 photo, private data an editing program left, 1 stored page thumbnail (a picture of a page as it once was) and 2 scripts and actions',
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
      'Removed the title, author, subject, keywords, creator and producer, 2 hidden XMP metadata packets, the camera details (device, time, place) inside 1 photo, private data an editing program left and 1 stored page thumbnail (a picture of a page as it once was)',
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
    // Start over with another file: the boxes start from its details, not what was typed for the last one.
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await pick(page, [{ name: 'Report.pdf', bytes: await reportPdf() }]);
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '2');
    await expect(page.getByTestId('opt-title')).toHaveValue('');
    await expect(page.getByTestId('opt-author')).toHaveValue('');
  });

  test('with several files, what is typed is set on all, and an empty box keeps each file its own', async ({ page }, info) => {
    laptopOnly(info);
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const titled = async (title: string) => {
      const doc = await PDFDocument.load(await leasePdf(1), { updateMetadata: false });
      doc.setTitle(title);
      doc.setAuthor('Old Clerk');
      return new Uint8Array(await doc.save());
    };
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'April.pdf', bytes: await titled('Rent receipt April') }]);
    await expect(page.getByTestId('opt-title')).toHaveValue('Rent receipt April');
    await pick(page, [{ name: 'May.pdf', bytes: await titled('Rent receipt May') }], 2);
    // One file's details are not stamped on the other: the boxes empty, and say what empty means now.
    await expect(page.getByTestId('opt-title')).toHaveValue('');
    await expect(page.getByTestId('opt-mode-edit').locator('xpath=..')).toContainText('A box left empty keeps what each file already has.');
    await page.getByTestId('opt-author').fill('Joseph Mathew');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(['Set the author', 'Set the author']);
    for (const [i, title] of ['Rent receipt April', 'Rent receipt May'].entries()) {
      const after = await hiddenIn((await save(page, i)).bytes);
      expect(after.info['Title']).toBe(title);
      expect(after.info['Author']).toBe('Joseph Mathew');
    }
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

  test('on a page turned by /Rotate, the black lands where it was drawn as the reader sees the page', async ({ page }, info) => {
    laptopOnly(info);
    const turned = await turnedSlipPdf();
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Turned.pdf', bytes: turned }]);
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 1');
    const box = await layerBox(page);
    expect(box.width).toBeGreaterThan(box.height);
    await dragAcross(page, [0.1, 0.6], [0.3, 0.8]);
    await run(page);
    const { bytes } = await save(page);
    const px = await renderPage(bytes, 0, 1);
    expect(px.width).toBeGreaterThan(px.height);
    expect(darkShare(px, { x: 0.11, y: 0.61, w: 0.18, h: 0.18 }, 60)).toBeGreaterThan(0.97);
    expect(darkShare(px, { x: 0.6, y: 0.1, w: 0.3, h: 0.2 }, 60)).toBeLessThan(0.3);
    expect(darkShare(px, { x: 0.11, y: 0.1, w: 0.18, h: 0.18 }, 60)).toBeLessThan(0.5);
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

// ============================================================ Digital signature

interface Signature {
  readonly range: [number, number, number, number];
  readonly ok: boolean;
  readonly signer: string;
  readonly dict: string;
}

/** Every signature in the file, checked the way a validator does: the byte range, then the CMS over exactly those bytes. */
async function signaturesIn(bytes: Uint8Array): Promise<Signature[]> {
  const text = latin1(bytes);
  const out: Signature[] = [];
  for (const m of text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)) {
    const range = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
    const [a, b, c, d] = range;
    const covered = new Uint8Array(b + d);
    covered.set(bytes.subarray(a, a + b), 0);
    covered.set(bytes.subarray(c, c + d), b);
    const der = new Uint8Array(Buffer.from(text.slice(b + 1, c - 1), 'hex'));
    const cms = der.subarray(0, asn1js.fromBER(der).offset);
    const signed = new SignedData({ schema: ContentInfo.fromBER(cms.slice()).content });
    let ok = false;
    let signer = '';
    try {
      const result = await signed.verify({ signer: 0, data: covered.slice().buffer, checkChain: false, extendedMode: true });
      ok = result.signatureVerified === true;
      const { displayName } = await import('../../app/src/sign/identity');
      signer = result.signerCertificate ? displayName(result.signerCertificate.subject) : '';
    } catch {
      ok = false;
    }
    // The dictionary around this hole: from the last "<<" before it to the ">>" after.
    const open = text.lastIndexOf('/Type /Sig', b);
    out.push({ range, ok, signer, dict: text.slice(open, text.indexOf('>>', c)) });
  }
  // The last signature covers the whole file, so nothing was added after it.
  const last = out[out.length - 1];
  if (last) expect(last.range[2] + last.range[3], 'the last signature runs to the end of the file').toBe(bytes.length);
  return out;
}

/** A /Name, /Reason or /Location, decoded from its UTF-16 hex. */
function sigText(dict: string, key: string): string | null {
  const m = new RegExp(`/${key}\\s*<([0-9A-Fa-f]+)>`).exec(dict);
  if (!m) return null;
  const hex = m[1]!;
  let s = '';
  for (let i = 4; i + 4 <= hex.length; i += 4) s += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
  return s;
}

async function chooseCertificate(page: Page, base64: string, name = 'me.pfx'): Promise<void> {
  await page.getByTestId('opt-certificate').setInputFiles([{ name, mimeType: 'application/x-pkcs12', buffer: Buffer.from(base64, 'base64') }]);
  await expect(page.getByTestId('certificate-picked')).toHaveText('Certificate ready. Type its password below.');
}

test.describe('digital signature', () => {
  test('seals a three-page lease: the original bytes untouched, the signature verifies, the box on the last page, reason and place written', async ({ page }, info) => {
    laptopOnly(info);
    const lease = await leasePdf(1);
    await openTool(page, 'digital-sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: lease }]);
    await expect(page.locator('.run__note')).toHaveText('Choose your certificate file (.pfx or .p12).');
    await chooseCertificate(page, AES_EC384);
    await page.getByTestId('opt-cert-password').fill('pässword');
    await expect(page.getByTestId('opt-sign-page-last')).toBeChecked();
    await page.getByTestId('opt-reason').fill('I agree to the terms of this licence');
    await page.getByTestId('opt-location').fill('Kochi');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Signed by Kerala Test Co, certificate from Kerala Test Co; shown at the foot of the last page');
    const { name, bytes } = await save(page);
    expect(name).toBe('Lease (signed).pdf');
    // An incremental update: every byte of the original is still where it was.
    expect(Buffer.from(bytes.subarray(0, lease.length)).equals(Buffer.from(lease))).toBe(true);
    const [sig, ...more] = await signaturesIn(bytes);
    expect(more).toEqual([]);
    expect(sig!.ok).toBe(true);
    expect(sig!.signer).toBe('Kerala Test Co');
    expect(sigText(sig!.dict, 'Reason')).toBe('I agree to the terms of this licence');
    expect(sigText(sig!.dict, 'Location')).toBe('Kochi');
    // The visible box sits at the foot of the last page, and only there.
    const details = await pdfDetails(bytes);
    expect(details.annotations[0]).toEqual([]);
    expect(details.annotations[1]).toEqual([]);
    const widget = details.annotations[2]!.find((a) => a.fieldType === 'Sig');
    expect(widget).toBeDefined();
    const [x1, y1, x2, y2] = widget!.rect as [number, number, number, number];
    expect(x1 / 595.28).toBeGreaterThan(0.5);
    expect(x2 / 595.28).toBeLessThan(0.96);
    expect(1 - y2 / 841.89).toBeGreaterThan(0.82);
    expect(1 - y1 / 841.89).toBeLessThan(0.96);
    const px = await renderPage(bytes, 2, 2);
    expect(darkShare(px, { x: 0.53, y: 0.85, w: 0.4, h: 0.08 }, 120)).toBeGreaterThan(0.01);
    // The words of the lease are unchanged.
    expect((await pdfText(bytes)).pages.slice(0, 3)).toEqual((await pdfText(lease)).pages);
  });

  test('on the first page, or invisibly; a wrong password says so, and the empty-password certificate needs none', async ({ page }, info) => {
    laptopOnly(info);
    const lease = await leasePdf(1);
    await openTool(page, 'digital-sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: lease }]);
    await chooseCertificate(page, AES_EC384);
    await page.getByTestId('opt-cert-password').fill('password');
    await page.getByTestId('opt-sign-page-first').check();
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText("That password didn't open the certificate.");
    await page.getByTestId('opt-cert-password').fill('pässword');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Signed by Kerala Test Co, certificate from Kerala Test Co; shown at the foot of the first page');
    let out = await save(page);
    let details = await pdfDetails(out.bytes);
    expect(details.annotations[0]!.some((a) => a.fieldType === 'Sig')).toBe(true);
    expect(details.annotations[2]).toEqual([]);
    expect((await signaturesIn(out.bytes))[0]!.ok).toBe(true);

    await page.getByTestId('start-over').click();
    await pick(page, [{ name: 'Lease.pdf', bytes: lease }]);
    await chooseCertificate(page, EMPTY_PASSWORD_EC256);
    await page.getByTestId('opt-cert-password').fill('');
    await page.getByTestId('opt-visible').uncheck();
    await expect(page.getByTestId('opt-sign-page-last')).toBeHidden();
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('Signed by Ravi Kumar, certificate from Ravi Kumar; invisible on the page, listed in any reader’s signature panel');
    out = await save(page);
    const [sig] = await signaturesIn(out.bytes);
    expect(sig!.ok).toBe(true);
    expect(sig!.signer).toBe('Ravi Kumar');
    details = await pdfDetails(out.bytes);
    const widget = details.annotations.flat().find((a) => a.fieldType === 'Sig');
    expect(widget === undefined || widget.rect[2]! - widget.rect[0]! === 0).toBe(true);
    const [before, after] = [await renderPage(lease, 2, 1), await renderPage(out.bytes, 2, 1)];
    expect(Buffer.from(after.data).equals(Buffer.from(before.data))).toBe(true);
  });

  test('signed twice, by two people, both signatures still verify', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'digital-sign');
    await pick(page, [{ name: 'Agreement.pdf', bytes: await leasePdf(2) }]);
    await chooseCertificate(page, AES_EC384);
    await page.getByTestId('opt-cert-password').fill('pässword');
    await page.getByTestId('opt-reason').fill('Licensor');
    await run(page);
    const first = await save(page);
    // The second party signs the copy the first one saved.
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await pick(page, [{ name: 'Agreement (signed).pdf', bytes: first.bytes }]);
    // The certificate chosen before is still there, for the next document; this is someone else's.
    await expect(page.getByTestId('certificate-picked')).toHaveText('Certificate ready. Type its password below.');
    await chooseCertificate(page, EMPTY_PASSWORD_EC256);
    await page.getByTestId('opt-cert-password').fill('');
    await page.getByTestId('opt-sign-page-first').check();
    await page.getByTestId('opt-reason').fill('Licensee');
    await run(page);
    const { bytes } = await save(page);
    const sigs = await signaturesIn(bytes);
    expect(sigs.map((s) => [s.ok, s.signer, sigText(s.dict, 'Reason')])).toEqual([
      [true, 'Kerala Test Co', 'Licensor'],
      [true, 'Ravi Kumar', 'Licensee'],
    ]);
  });

  test('a locked PDF is signed once its password is typed, and the result says the lock is gone; not a certificate says so', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'digital-sign');
    await pick(page, [{ name: 'Locked slip.pdf', bytes: await lock(await salarySlipPdf(), 'ANJA1990') }]);
    await page.getByTestId('file-password').fill('ANJA1990');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '1');
    await page.getByTestId('opt-certificate').setInputFiles([{ name: 'not-a-cert.pfx', mimeType: 'application/x-pkcs12', buffer: Buffer.from(await leasePdf(1)) }]);
    await page.getByTestId('opt-cert-password').fill('x');
    await run(page);
    await expect(page.getByTestId('failure-item')).toBeVisible();
    const words = await page.getByTestId('failure-item').textContent();
    expect(words).toMatch(/certificate/i);
    await chooseCertificate(page, AES_EC384);
    await page.getByTestId('opt-cert-password').fill('pässword');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(
      'Signed by Kerala Test Co, certificate from Kerala Test Co; shown at the foot of the last page. The signed copy opens without the password: locking it again would break the signature',
    );
    const { bytes } = await save(page);
    expect(await opens(bytes)).toBe('opens');
    expect((await signaturesIn(bytes))[0]!.ok).toBe(true);
    expect((await pdfText(bytes)).pages[0]).toContain(SLIP.employee);
  });

  test('a file that only restricts printing is signed, and says the restrictions went', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'digital-sign');
    await pick(page, [{ name: 'Form.pdf', bytes: await restrictedPdf() }]);
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '2');
    await chooseCertificate(page, AES_EC384);
    await page.getByTestId('opt-cert-password').fill('pässword');
    await run(page);
    await expect(page.getByTestId('result-detail')).toContainText('Its printing and copying restrictions are gone: setting them again would break the signature');
    const { bytes } = await save(page);
    expect((await signaturesIn(bytes))[0]!.ok).toBe(true);
  });
});

// ============================================================ Compare

/** The share of a region's pixels that are the compare green (more green than red and blue). */
function greenShare(px: Awaited<ReturnType<typeof renderPage>>, region: { x: number; y: number; w: number; h: number }): number {
  const x0 = Math.floor(region.x * px.width);
  const y0 = Math.floor(region.y * px.height);
  const x1 = Math.ceil((region.x + region.w) * px.width);
  const y1 = Math.ceil((region.y + region.h) * px.height);
  let green = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * px.width + x) * 4;
      const [r, g, b] = [px.data[at]!, px.data[at + 1]!, px.data[at + 2]!];
      if (g > r + 25 && g > b + 25) green++;
      n++;
    }
  }
  return n === 0 ? 0 : green / n;
}

/** Where `needle` sits inside the pdf.js text item that holds it, measured in Times-Roman 12. */
async function wordIn(words: Awaited<ReturnType<typeof pdfText>>['words'], page: number, needle: string) {
  const item = findWord(words, page, needle);
  if (!item) throw new Error(`${needle} is not on page ${page + 1}`);
  const at = item.text.indexOf(needle);
  const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.TimesRoman);
  const whole = font.widthOfTextAtSize(item.text, 12);
  const x = item.x + (item.w * font.widthOfTextAtSize(item.text.slice(0, at), 12)) / whole;
  const w = (item.w * font.widthOfTextAtSize(needle, 12)) / whole;
  return { x, y: item.y, w, h: item.h };
}

test.describe('compare', () => {
  test('marks every change in a three-page lease: new words green where they are, a comment where words went', async ({ page }, info) => {
    laptopOnly(info);
    const [v1, v2] = [await leasePdf(1), await leasePdf(2)];
    await openTool(page, 'compare');
    // Added newest first by mistake, then put in order with the arrows.
    await pick(page, [
      { name: 'Lease v2.pdf', bytes: v2 },
      { name: 'Lease v1.pdf', bytes: v1 },
    ]);
    await page.getByTestId('file-item').first().getByTestId('file-move-down').click();
    await expect(page.getByTestId('file-item').first()).toHaveAttribute('data-name', 'Lease v1.pdf');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText(
      '11 words added and 18 words taken out, on 3 pages of the newer file: new words in green, a comment where words went',
    );
    const { name, bytes } = await save(page);
    expect(name).toBe('Lease v2 (compared).pdf');
    // The newer file's words are all still there, unchanged.
    const v2Text = await pdfText(v2);
    expect((await pdfText(bytes)).pages).toEqual(v2Text.pages);
    // Comments where words went, on the pages they went from.
    const notes = (await pdfDetails(bytes)).annotations.map((list) => list.filter((a) => a.subtype === 'Text').map((a) => a.contents));
    expect(notes[0]).toEqual(['Removed: 18000']);
    expect(notes[1]).toEqual(['Removed: not', 'Removed: one month']);
    expect(notes[2]).toEqual(['Removed: 9. Visitors. The licensee shall not let any other person live in the flat.']);
    // Green exactly on the new words.
    const p1 = await renderPage(bytes, 0, 2);
    expect(greenShare(p1, await wordIn(v2Text.words, 0, '19500'))).toBeGreaterThan(0.5);
    expect(greenShare(p1, await wordIn(v2Text.words, 0, 'monthly rent'))).toBe(0);
    const p2 = await renderPage(bytes, 1, 2);
    expect(greenShare(p2, await wordIn(v2Text.words, 1, 'two months'))).toBeGreaterThan(0.5);
    expect(greenShare(p2, await wordIn(v2Text.words, 1, 'Pets are allowed'))).toBe(0);
    const p3 = await renderPage(bytes, 2, 2);
    expect(greenShare(p3, await wordIn(v2Text.words, 2, 'Parking. One covered'))).toBeGreaterThan(0.5);
    expect(greenShare(p3, await wordIn(v2Text.words, 2, 'Repairs'))).toBe(0);
  });

  test('two copies of the same words say so; a third file, or a scan, is turned away in words', async ({ page }, info) => {
    laptopOnly(info);
    const v1 = await leasePdf(1);
    await openTool(page, 'compare');
    await pick(page, [{ name: 'Lease.pdf', bytes: v1 }]);
    await expect(page.locator('.run__note')).toHaveText('Add 1 more PDF.');
    await pick(page, [{ name: 'Lease copy.pdf', bytes: v1 }, { name: 'Lease v2.pdf', bytes: await leasePdf(2) }], 3);
    await expect(page.getByTestId('run-button')).toBeDisabled();
    await expect(page.locator('.run__note')).toHaveText('Compare works on two files at a time: the older one, then the newer one.');
    await page.getByTestId('file-item').nth(2).getByTestId('file-remove').click();
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('The words in these two files are the same.');
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await expect(page.getByTestId('result')).toHaveCount(0);
    await pick(page, [{ name: 'Lease.pdf', bytes: v1 }, { name: 'Scan.pdf', bytes: await scannedSlipPdf(100) }]);
    await run(page);
    await expect(page.getByTestId('failure-item')).toContainText('One of these files has no words to compare, only pictures of them. Run Make searchable on it first.');
  });
});

// ============================================================ Extract text

test.describe('extract text', () => {
  test('a report comes out page by page, its table rows on their own lines in order', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'extract-text');
    await pick(page, [{ name: 'Quarterly review.pdf', bytes: await reportPdf() }]);
    await run(page);
    const detail = await page.getByTestId('result-detail').textContent();
    expect(detail).toMatch(/^\d+ words from 2 pages$/);
    await expect(page.getByTestId('then-menu')).toHaveCount(0);
    const { name, bytes } = await save(page);
    expect(name).toBe('Quarterly review.txt');
    const text = new TextDecoder().decode(bytes);
    const [one = '', two = ''] = text.split('--- Page 2 ---');
    expect(one).toMatch(/^--- Page 1 ---\n\nQuarterly Sales Review\n/);
    expect(one).toContain('Sales across the four districts grew steadily');
    let last = -1;
    for (const [district, orders, share] of REPORT_ROWS) {
      const row = new RegExp(`^${district}\\s+${orders.replace('.', '\\.')}\\s+${share.replace('.', '\\.')}$`, 'm');
      expect(one, district).toMatch(row);
      const at = one.search(row);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
    expect(two).toContain('We will open a second warehouse in Kannur before Onam.');
    // The words in the file match the words a reader finds, word for word.
    const words = Number(detail!.split(' ')[0]);
    expect(words).toBe((await pdfText(await reportPdf())).pages.join(' ').split(/\s+/).filter(Boolean).length);
  });

  test('several files at once, a locked one unlocked first; a scan says what to do; a scanned page among typed ones is named', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'extract-text');
    await pick(page, [
      { name: 'Lease.pdf', bytes: await leasePdf(1) },
      { name: 'Payslip.pdf', bytes: await lock(await salarySlipPdf(), 'ANJA1990') },
      { name: 'Scan.pdf', bytes: await scannedSlipPdf(100) },
      { name: 'Mixed.pdf', bytes: await mixedScanPdf() },
    ]);
    await page.getByTestId('file-password').fill('ANJA1990');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item').nth(1)).toHaveAttribute('data-pages', '1');
    await run(page);
    await expect(page.getByTestId('result-item')).toHaveCount(3);
    await expect(page.getByTestId('failure-item')).toHaveText(
      "Scan.pdf: This PDF has no text in it, only pictures of text. It's probably a scan. Make searchable reads the words first; then extract them.",
    );
    await expect(page.getByTestId('result-detail').nth(2)).toHaveText(/^\d+ words from 2 pages\. Page 1 has no words in it, only pictures: Make searchable reads those$/);
    const zip = unzipSync((await downloadFrom(page, page.getByTestId('save-all-button'))).bytes);
    expect(Object.keys(zip).sort()).toEqual(['Lease.txt', 'Mixed.txt', 'Payslip.txt']);
    const slip = new TextDecoder().decode(zip['Payslip.txt']);
    for (const value of [SLIP.employee, SLIP.pan, SLIP.aadhaar, `Net pay ${SLIP.net}`]) expect(slip).toContain(value);
    expect(new TextDecoder().decode(zip['Lease.txt'])).toContain('3. Rent. The licensee shall pay a monthly rent of 18000 rupees');
  });
});

// ============================================================ Make searchable

test.describe('make searchable', () => {
  test('reads a scanned payslip, lays the words where they are on the page, and leaves the look unchanged', async ({ page }, info) => {
    laptopOnly(info);
    test.setTimeout(240_000);
    const scan = await scannedSlipPdf(200);
    await openTool(page, 'ocr');
    await expect(page.getByTestId('opt-ocr-lang-1')).toHaveValue('eng');
    await expect(page.getByTestId('ocr-downloads')).toBeHidden();
    await pick(page, [{ name: 'Payslip scan.pdf', bytes: scan }]);
    await page.getByTestId('run-button').click();
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 200_000 });
    await expect(page.getByTestId('result-detail')).toHaveText(/^\d+ words read on 1 page\. You can now search, select and copy them$/);
    const { name, bytes } = await save(page);
    expect(name).toBe('Payslip scan (searchable).pdf');
    const text = await pdfText(bytes);
    for (const word of ['Kayal', 'Technologies', 'Payslip', 'Anjali', 'Menon', SLIP.pan, 'Accountant', 'Gross']) expect(text.pages[0], word).toContain(word);
    // The invisible words sit over the picture of them.
    const typed = await pdfText(await salarySlipPdf());
    for (const word of ['Anjali', SLIP.pan, 'Kayal']) {
      const read = text.words[0]!.find((w) => w.text.includes(word));
      const real = typed.words[0]!.find((w) => w.text.includes(word));
      expect(read, word).toBeDefined();
      expect(Math.abs(read!.y - real!.y), `${word} down the page`).toBeLessThan(0.02);
      expect(read!.x, `${word} across`).toBeGreaterThan(real!.x - 0.02);
      expect(read!.x, `${word} across`).toBeLessThan(real!.x + real!.w);
    }
    // Same look: the text is invisible.
    const [before, after] = [await renderPage(scan, 0, 0.5), await renderPage(bytes, 0, 0.5)];
    let differ = 0;
    for (let i = 0; i < before.data.length; i++) if (Math.abs(before.data[i]! - after.data[i]!) > 8) differ++;
    expect(differ / before.data.length).toBeLessThan(0.001);
  });

  test('a scan stored sideways (turned by /Rotate) is read upright, and its words land where the reader shows them', async ({ page }, info) => {
    laptopOnly(info);
    test.setTimeout(240_000);
    const scan = await sidewaysScanPdf(200);
    // The fixture is fair: a reader shows it upright, the company name at the top left.
    const shown = await renderPage(scan, 0, 0.5);
    expect(shown.height).toBeGreaterThan(shown.width);
    expect(darkShare(shown, { x: 0.08, y: 0.05, w: 0.4, h: 0.04 }, 110)).toBeGreaterThan(0.02);
    await openTool(page, 'ocr');
    await pick(page, [{ name: 'Sideways scan.pdf', bytes: scan }]);
    await page.getByTestId('run-button').click();
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 200_000 });
    await expect(page.getByTestId('result-detail')).toContainText('read on 1 page');
    const { bytes } = await save(page);
    const text = await pdfText(bytes);
    const typed = await pdfText(await salarySlipPdf());
    for (const word of ['Anjali', SLIP.pan, 'Kayal']) {
      const read = text.words[0]!.find((w) => w.text.includes(word));
      const real = typed.words[0]!.find((w) => w.text.includes(word));
      expect(read, word).toBeDefined();
      expect(Math.abs(read!.y - real!.y), `${word} down the page`).toBeLessThan(0.02);
      expect(Math.abs(read!.x - real!.x), `${word} across`).toBeLessThan(0.03);
    }
  });

  test('reads only the scanned page of a mixed file, says which language reader it needs, and passes the result on', async ({ page }, info) => {
    laptopOnly(info);
    test.setTimeout(240_000);
    const mixed = await mixedScanPdf();
    await openTool(page, 'ocr');
    await page.getByTestId('opt-ocr-lang-2').selectOption('mal');
    await expect(page.getByTestId('ocr-downloads')).toContainText('The Malayalam reader is downloaded from this site the first time you use it');
    await expect(page.getByTestId('ocr-downloads')).toContainText('Words in Malayalam come out as a text file beside the PDF');
    await page.getByTestId('opt-ocr-lang-2').selectOption('');
    await expect(page.getByTestId('ocr-downloads')).toBeHidden();
    await pick(page, [{ name: 'Mixed.pdf', bytes: mixed }]);
    await page.getByTestId('run-button').click();
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 200_000 });
    await expect(page.getByTestId('result-detail')).toContainText('read on 1 page');
    const { bytes } = await save(page);
    const [before, after] = [await pdfText(mixed), await pdfText(bytes)];
    expect(before.pages[0]).toBe('');
    expect(after.pages[0]).toContain('Anjali');
    expect(after.pages[1]).toBe(before.pages[1]);
    await page.getByTestId('then-menu').click();
    await page.getByTestId('then-remove-areas').click();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 2');
    // Find and remove now finds the PAN that was only a picture before.
    await page.getByTestId('redact-finder').locator('summary').click();
    await page.getByTestId('redact-find').click();
    await expect(page.getByTestId('redact-found')).toContainText('Marked');
  });
});

// ============================================================ Scan

/** How light a page's four corners are (0–255): paper is light, the table is dark. */
function cornerLight(px: Awaited<ReturnType<typeof renderPage>>): number {
  const at = (x: number, y: number) => meanColour(px, { x, y, w: 0.04, h: 0.03 }).reduce((a, b) => a + b, 0) / 3;
  return Math.min(at(0.01, 0.01), at(0.95, 0.01), at(0.01, 0.96), at(0.95, 0.96));
}

test.describe('scan', () => {
  test('two phone photos, one taken sideways, become two straight A4 pages, the table gone and the words the right way up', async ({ page }, info) => {
    laptopOnly(info);
    test.setTimeout(120_000);
    await openTool(page, 'scan');
    await page.getByTestId('file-input').setInputFiles([
      { name: 'IMG_2041.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await slipPhotoJpeg(900, 1200)) },
      { name: 'IMG_2042.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await slipPhotoJpeg(1200, 900, true)) },
    ]);
    await expect(page.locator('[data-testid="scan-card"][data-found="true"]')).toHaveCount(2);
    await expect(page.getByTestId('opt-look-grey')).toBeChecked();
    await expect(page.getByTestId('opt-paper-a4')).toBeChecked();
    // The sideways one: a quarter turn back, three taps.
    const turn = page.getByTestId('scan-turn').nth(1);
    for (let i = 0; i < 3; i++) await turn.click();
    await expect(turn).toHaveText('Turned 270°');
    await run(page);
    await expect(page.getByTestId('result-detail')).toHaveText('2 pages in grey on A4');
    const { name, bytes } = await save(page);
    expect(name).toBe('IMG_2041 (scanned).pdf');
    expect((await pdfInfo(bytes)).sizes).toEqual([[595.28, 841.89], [595.28, 841.89]]);
    for (const index of [0, 1]) {
      const px = await renderPage(bytes, index, 0.5);
      expect(cornerLight(px), `page ${index + 1} corners`).toBeGreaterThan(170);
      // Upright: the company name at the top left is ink; the same spot turned round is not.
      const top = darkShare(px, { x: 0.08, y: 0.03, w: 0.4, h: 0.06 }, 110);
      const bottom = darkShare(px, { x: 0.52, y: 0.91, w: 0.4, h: 0.06 }, 110);
      expect(top, `page ${index + 1} upright`).toBeGreaterThan(bottom + 0.01);
    }
  });

  test('a phone photo stored on its side with an Exif turn comes out upright without touching Turn', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'scan');
    await page.getByTestId('file-input').setInputFiles([{ name: 'IMG_2043.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await exifTurnedPhotoJpeg(900, 1200)) }]);
    await expect(page.locator('[data-testid="scan-card"][data-found="true"]')).toHaveCount(1);
    const stage = (await page.locator('.scan-card__stage').boundingBox())!;
    expect(stage.height, 'the card shows the photo as the phone took it').toBeGreaterThan(stage.width);
    await run(page);
    const { bytes } = await save(page);
    const px = await renderPage(bytes, 0, 0.5);
    expect(cornerLight(px)).toBeGreaterThan(170);
    expect(darkShare(px, { x: 0.08, y: 0.03, w: 0.4, h: 0.06 }, 110)).toBeGreaterThan(darkShare(px, { x: 0.52, y: 0.91, w: 0.4, h: 0.06 }, 110) + 0.01);
  });

  test('each look and paper is what it says: colour and grey as JPEG, black and white as PNG; Letter, and the photo’s own shape', async ({ page }, info) => {
    laptopOnly(info);
    test.setTimeout(120_000);
    const photo = await slipPhotoJpeg(900, 1200);
    for (const [look, paper, size] of [
      ['colour', 'letter', [612, 792]],
      ['bw', 'fit', null],
    ] as const) {
      await openTool(page, 'scan');
      await page.getByTestId('file-input').setInputFiles([{ name: 'Slip.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo) }]);
      await expect(page.locator('[data-testid="scan-card"][data-found="true"]')).toHaveCount(1);
      await page.getByTestId(`opt-look-${look}`).check();
      await page.getByTestId(`opt-paper-${paper}`).check();
      await run(page);
      const { bytes } = await save(page);
      const raw = latin1(bytes);
      if (look === 'bw') {
        expect(raw).not.toContain('/DCTDecode');
        await expect(page.getByTestId('result-detail')).toHaveText('1 page in black and white');
        const [w, h] = (await pdfInfo(bytes)).sizes[0]!;
        // The sheet's own shape: an A4-ish portrait, its long side 842.
        expect(Math.max(w, h)).toBeCloseTo(842, 0);
        expect(h / w).toBeGreaterThan(1.3);
        expect(h / w).toBeLessThan(1.5);
      } else {
        expect(raw).toContain('/DCTDecode');
        await expect(page.getByTestId('result-detail')).toHaveText('1 page in colour on Letter');
        expect((await pdfInfo(bytes)).sizes).toEqual([size]);
      }
      const px = await renderPage(bytes, 0, 0.5);
      expect(cornerLight(px)).toBeGreaterThan(170);
    }
  });

  test('a corner dragged wrong can be found again, and a photo that is not a photo is turned away', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'scan');
    await page.getByTestId('file-input').setInputFiles([{ name: 'IMG_1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await slipPhotoJpeg(600, 800)) }]);
    await expect(page.locator('[data-testid="scan-card"][data-found="true"]')).toHaveCount(1);
    const handle = page.getByTestId('scan-handle-0');
    const left = () => handle.evaluate((e) => parseFloat((e as HTMLElement).style.left));
    const found = await left();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 });
    await page.mouse.up();
    expect(Math.abs((await left()) - found)).toBeGreaterThan(3);
    await page.getByTestId('scan-reset').click();
    await expect.poll(left).toBeCloseTo(found, 3);
    await page.getByTestId('file-input').setInputFiles([{ name: 'Lease.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await leasePdf(1)) }]);
    await expect(page.locator('.notice')).toContainText('Lease.pdf');
    await expect(page.getByTestId('scan-card')).toHaveCount(1);
  });
});

// ============================================================ Read

test.describe('read', () => {
  test('a locked lease opens with its password, finds a word, and hands the file to Clean hidden data, which starts from its details', async ({ page }, info) => {
    laptopOnly(info);
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(await leasePdf(1), { updateMetadata: false });
    doc.setTitle('Leave and licence, Flat 4B');
    doc.setAuthor('Joseph Mathew');
    const titled = new Uint8Array(await doc.save());
    await openTool(page, 'read');
    await pick(page, [{ name: 'Lease.pdf', bytes: await lock(titled, 'flat4b') }]);
    await page.getByTestId('file-password').fill('flat4b');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('reader-page')).toHaveCount(3);
    await expect(page.locator('[data-testid="reader-page"][data-drawn="true"]').first()).toBeVisible();
    await page.getByTestId('reader-find').fill('deposit');
    await expect(page.getByTestId('reader-find-count')).toHaveText('2 matches on 1 page');
    await expect(page.locator('[data-testid="reader-page"].is-current')).toHaveAttribute('data-page', '1');
    await page.getByTestId('reader-find').fill('licensee');
    await expect(page.getByTestId('reader-find-count')).toHaveText(/matches on 3 pages$/);
    await page.getByTestId('reader-zoom-out').click();
    await expect(page.getByTestId('reader-zoom')).toHaveText('80%');
    await page.getByTestId('reader-then').click();
    await page.getByTestId('then-document-details').click();
    await expect(page).toHaveURL(/\/tools\/document-details\/$/);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await page.getByTestId('file-password').fill('flat4b');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '3');
    await expect(page.getByTestId('opt-title')).toHaveValue('Leave and licence, Flat 4B');
    await expect(page.getByTestId('opt-author')).toHaveValue('Joseph Mathew');
  });
});

test.describe('read, then', () => {
  test('a payslip read on screen goes on to Attachments, which takes out the file it carries', async ({ page }, info) => {
    laptopOnly(info);
    await openTool(page, 'read');
    await pick(page, [{ name: 'Payslip.pdf', bytes: await salarySlipPdf({ hidden: true }) }]);
    await expect(page.getByTestId('reader-page')).toHaveCount(1);
    await page.getByTestId('reader-comments-toggle').click();
    await expect(page.getByTestId('reader-comment')).toContainText(SLIP.comment);
    await page.getByTestId('reader-then').click();
    await page.getByTestId('then-attachments').click();
    await expect(page).toHaveURL(/\/tools\/attachments\/$/);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('file-item')).toHaveCount(1);
    await page.getByTestId('opt-mode-extract').check();
    await run(page);
    const back = await save(page);
    expect(back.name).toBe(SLIP.attachment);
    expect(new TextDecoder().decode(back.bytes)).toBe(SLIP.attachmentText);
  });
});

// ============================================================ Summarise and translate

test.describe('summarise and translate', () => {
  /** Stands in for the browser's own on-device models, recording what they were given. */
  async function fakeAi(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { aiSeen: string[] }).aiSeen = seen;
      Object.assign(window, {
        Summarizer: {
          availability: async () => 'available',
          create: async () => ({
            inputQuota: 1000,
            summarize: async (text: string) => {
              seen.push(`summarise:${text}`);
              return `• ${text.split(/\s+/).slice(0, 4).join(' ')}`;
            },
            destroy: () => undefined,
          }),
        },
        LanguageDetector: { create: async () => ({ detect: async () => [{ detectedLanguage: 'en', confidence: 0.9 }], destroy: () => undefined }) },
        Translator: {
          availability: async ({ targetLanguage }: { targetLanguage: string }) => (targetLanguage === 'ja' ? 'unavailable' : 'available'),
          create: async () => ({
            translate: async (text: string) => {
              seen.push(`translate:${text}`);
              return `[ml] ${text}`;
            },
            destroy: () => undefined,
          }),
        },
      });
    });
  }

  test('summarises every page and translates every word with the on-device models, and says when it cannot', async ({ page }, info) => {
    laptopOnly(info);
    await fakeAi(page);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await openTool(page, 'summarise');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await expect(page.getByTestId('ai-summarise')).toBeEnabled();
    await page.getByTestId('ai-summarise').click();
    await expect(page.getByTestId('ai-status')).toHaveText('The key points of 3 pages, made on this device.');
    const seen = () => page.evaluate(() => (window as unknown as { aiSeen: string[] }).aiSeen);
    const given = (await seen()).filter((s) => s.startsWith('summarise:')).join(' ');
    for (const clause of ['LEAVE AND LICENCE', '4. Deposit.', '9. Visitors.', 'Licensor: Joseph Mathew']) expect(given, clause).toContain(clause);
    await expect(page.getByTestId('ai-output')).not.toHaveValue('');
    await page.getByTestId('opt-ai-language').selectOption('ml');
    await page.getByTestId('ai-translate').click();
    await expect(page.getByTestId('ai-status')).toHaveText('Translated on this device, 3 pages.');
    const translated = await page.getByTestId('ai-output').inputValue();
    expect(translated).toContain('[ml] ');
    expect(translated).toContain('18000 rupees');
    expect(translated).toContain('Licensee: Anjali Menon');
    await page.getByTestId('opt-ai-language').selectOption('en');
    await page.getByTestId('ai-translate').click();
    await expect(page.getByTestId('ai-status')).toHaveText('It is already in that language.');
    await page.getByTestId('opt-ai-language').selectOption('ja');
    await page.getByTestId('ai-translate').click();
    await expect(page.getByTestId('ai-status')).toHaveText('Your browser cannot translate between these two languages on this device yet.');
    expect(requests.filter((u) => !u.startsWith(ORIGIN))).toEqual([]);
  });

  test('a document longer than it reads says so, and a scan says to make it searchable', async ({ page }, info) => {
    laptopOnly(info);
    test.setTimeout(120_000);
    await fakeAi(page);
    await openTool(page, 'summarise');
    await pick(page, [{ name: 'Long.pdf', bytes: await pagesPdf(305) }]);
    await expect(page.getByTestId('ai-summarise')).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId('ai-summarise').click();
    await expect(page.getByTestId('ai-status')).toHaveText('The key points of the first 300 of 305 pages, made on this device.', { timeout: 30_000 });
    await page.getByTestId('file-remove').click();
    await pick(page, [{ name: 'Scan.pdf', bytes: await scannedSlipPdf(100) }]);
    await expect(page.getByTestId('ai-status')).toHaveText('This file has no words in it, only pictures of them. Run Make searchable first.');
    await expect(page.getByTestId('ai-summarise')).toBeDisabled();
  });
});

// ============================================================ On a phone (360 px)

const phoneOnly = (info: TestInfo) => test.skip(info.project.name !== 'phone', 'the phone layout');

/** Nothing wider than the screen, and every visible control inside it. */
async function fitsTheScreen(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > width + 1) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${width}`);
    for (const el of document.querySelectorAll<HTMLElement>('main button, main input, main select, main textarea, main label, main summary')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.visually-hidden') || el.classList.contains('visually-hidden')) continue;
      if (el.closest('.reader__pages') || el.closest('.editor__page')) continue;
      // A row that scrolls sideways (Read's tools on a phone, like the family jumps) holds more than
      // fits on purpose: the row itself must fit, and the rest is a swipe away.
      const strip = [...(function* () { for (let p = el.parentElement; p; p = p.parentElement) yield p; })()].find((p) => ['auto', 'scroll'].includes(getComputedStyle(p).overflowX));
      if (strip) {
        const s = strip.getBoundingClientRect();
        if (s.left >= -1 && s.right <= width + 1) continue;
      }
      if (r.left < -1 || r.right > width + 1) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute('data-testid') ?? '').trim().slice(0, 30)}" runs off the screen (${Math.round(r.left)}–${Math.round(r.right)})`);
    }
    return out;
  });
  expect(problems).toEqual([]);
}

/** The control can be seen and tapped: on screen, and nothing (a pinned button, say) sits over its middle. */
async function tappable(page: Page, testid: string, nth = 0): Promise<void> {
  const target = page.getByTestId(testid).nth(nth);
  await target.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(target).toBeInViewport();
  const free = await target.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && (hit === e || e.contains(hit) || hit.contains(e) || (e.id !== '' && hit.closest(`label[for="${e.id}"]`) !== null) || hit.closest('label')?.contains(e) === true);
  });
  expect(free, `${testid} is covered by something`).toBe(true);
}

/** The run button, pinned under the thumb: on screen without scrolling, and tappable. */
async function runOnPhone(page: Page): Promise<void> {
  const button = page.getByTestId('run-button');
  await expect(button).toBeEnabled();
  await expect(button).toBeInViewport();
  await tappable(page, 'run-button');
  await button.click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
  await fitsTheScreen(page);
}

test.describe('on a phone', () => {
  test('add a password: the boxes are not hidden under the pinned button, and the locked file saves', async ({ page }, info) => {
    phoneOnly(info);
    await openTool(page, 'add-password');
    await fitsTheScreen(page);
    await pick(page, [{ name: 'Payslip.pdf', bytes: await salarySlipPdf() }]);
    for (const id of ['opt-password', 'opt-confirm', 'opt-allow-printing', 'opt-allow-copying', 'opt-allow-editing']) await tappable(page, id);
    await page.getByTestId('opt-password').fill('Kochi@2026');
    await page.getByTestId('opt-confirm').fill('Kochi@2026');
    await fitsTheScreen(page);
    await runOnPhone(page);
    const { bytes } = await save(page);
    expect(await opens(bytes, 'Kochi@2026')).toBe('opens');
  });

  test('remove a password: the password box on the file and its Unlock fit and work', async ({ page }, info) => {
    phoneOnly(info);
    await openTool(page, 'remove-password');
    await pick(page, [{ name: 'HDFC statement Sep 2026.pdf', bytes: await lock(await salarySlipPdf(), 'hdfc1990') }]);
    await tappable(page, 'file-password');
    await tappable(page, 'file-unlock');
    await fitsTheScreen(page);
    await page.getByTestId('file-password').fill('hdfc1990');
    await page.getByTestId('file-unlock').click();
    await expect(page.getByTestId('file-item')).toHaveAttribute('data-pages', '1');
    await runOnPhone(page);
    expect(await opens((await save(page)).bytes)).toBe('opens');
  });

  test('clean hidden data and set new details fit, and work', async ({ page }, info) => {
    phoneOnly(info);
    await openTool(page, 'document-details');
    await pick(page, [{ name: 'Payslip.pdf', bytes: await salarySlipPdf({ hidden: true }) }]);
    await tappable(page, 'opt-mode-edit');
    await page.getByTestId('opt-mode-edit').check();
    for (const id of ['opt-title', 'opt-author', 'opt-subject', 'opt-keywords']) await tappable(page, id);
    await page.getByTestId('opt-author').fill('');
    await fitsTheScreen(page);
    await runOnPhone(page);
    await expect(page.getByTestId('result-detail')).toContainText('Removed the author');
  });

  test('attachments and compare: the file list, its arrows and the options fit', async ({ page }, info) => {
    phoneOnly(info);
    await openTool(page, 'attachments');
    await pick(page, [
      { name: 'Leave and licence agreement, Flat 4B, Rose Gardens.pdf', bytes: await leasePdf(1) },
      { name: 'rent-receipts-april-to-september-2026.csv', bytes: new TextEncoder().encode('a,b\n'), mime: 'text/csv' },
    ]);
    await fitsTheScreen(page);
    await tappable(page, 'file-move-down');
    await runOnPhone(page);
    await openTool(page, 'compare');
    await pick(page, [
      { name: 'Lease v1.pdf', bytes: await leasePdf(1) },
      { name: 'Lease v2.pdf', bytes: await leasePdf(2) },
    ]);
    await fitsTheScreen(page);
    await runOnPhone(page);
    await expect(page.getByTestId('result-detail')).toContainText('words added');
  });

  test('digital signature: the certificate picker, its password and the choices fit', async ({ page }, info) => {
    phoneOnly(info);
    await openTool(page, 'digital-sign');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await page.getByTestId('opt-certificate').setInputFiles([{ name: 'me.pfx', mimeType: 'application/x-pkcs12', buffer: Buffer.from(AES_EC384, 'base64') }]);
    for (const id of ['certificate-picked', 'opt-cert-password', 'opt-visible', 'opt-sign-page-first', 'opt-reason', 'opt-location']) await tappable(page, id);
    await page.getByTestId('opt-cert-password').fill('pässword');
    await fitsTheScreen(page);
    await runOnPhone(page);
    expect((await signaturesIn((await save(page)).bytes))[0]!.ok).toBe(true);
  });

  test('remove areas: drag with a finger-sized box on the phone page, and find and remove', async ({ page }, info) => {
    phoneOnly(info);
    await openTool(page, 'remove-areas');
    await pick(page, [{ name: 'Payslip.pdf', bytes: await salarySlipPdf() }]);
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 1');
    await fitsTheScreen(page);
    await page.getByTestId('redact-finder').locator('summary').click();
    await tappable(page, 'opt-find-phone');
    await page.getByTestId('opt-find-phone').check();
    await tappable(page, 'redact-find');
    await page.getByTestId('redact-find').click();
    await expect(page.getByTestId('editor-item')).toHaveCount(3);
    await dragAcross(page, [0.08, 0.04], [0.5, 0.08]);
    await expect(page.getByTestId('editor-item')).toHaveCount(4);
    await runOnPhone(page);
    await expect(page.getByTestId('result-detail')).toContainText('4 areas removed');
    // Start over: the marks go with the file.
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('file-item')).toHaveCount(0);
    await expect(page.getByTestId('editor-item')).toHaveCount(0);
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await expect(page.getByTestId('editor-where')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('editor-item')).toHaveCount(0);
    await expect(page.getByTestId('run-button')).toBeDisabled();
  });

  test('scan: the photo cards, their handles and the looks fit, and a page comes out', async ({ page }, info) => {
    phoneOnly(info);
    await openTool(page, 'scan');
    await page.getByTestId('file-input').setInputFiles([{ name: 'IMG_1.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await slipPhotoJpeg(900, 1200)) }]);
    await expect(page.locator('[data-testid="scan-card"][data-found="true"]')).toHaveCount(1);
    await fitsTheScreen(page);
    // The whole photo fits on the screen at once, and no corner handle hides under the pinned button.
    await page.getByTestId('scan-card').evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
    for (let i = 0; i < 4; i++) await expect(page.getByTestId(`scan-handle-${i}`)).toBeInViewport({ ratio: 0.3 });
    for (let i = 0; i < 4; i++) await tappable(page, `scan-handle-${i}`);
    for (const id of ['scan-turn', 'opt-look-bw', 'opt-paper-letter']) await tappable(page, id);
    await runOnPhone(page);
    await expect(page.getByTestId('result-detail')).toHaveText('1 page in grey on A4');
    await page.getByTestId('start-over').click();
    await expect(page.getByTestId('scan-card')).toHaveCount(0);
    await expect(page.getByTestId('result')).toHaveCount(0);
  });

  test('read, make searchable, extract text and summarise fit', async ({ page }, info) => {
    phoneOnly(info);
    test.setTimeout(180_000);
    await openTool(page, 'read');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await expect(page.getByTestId('reader-page')).toHaveCount(3);
    await fitsTheScreen(page);
    for (const id of ['reader-find', 'reader-zoom-in', 'reader-then']) await tappable(page, id);
    await page.getByTestId('reader-find').fill('parking');
    await expect(page.getByTestId('reader-find-count')).toHaveText('Not found');

    await openTool(page, 'ocr');
    await fitsTheScreen(page);
    for (const id of ['opt-ocr-lang-1', 'opt-ocr-lang-2', 'opt-ocr-lang-3']) await tappable(page, id);
    await pick(page, [{ name: 'Scan.pdf', bytes: await scannedSlipPdf(150) }]);
    await tappable(page, 'run-button');
    await page.getByTestId('run-button').click();
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 150_000 });
    await expect(page.getByTestId('result-detail')).toContainText('read on 1 page');
    await fitsTheScreen(page);

    await openTool(page, 'extract-text');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await runOnPhone(page);
    expect(new TextDecoder().decode((await save(page)).bytes)).toContain('LEAVE AND LICENCE AGREEMENT');

    await openTool(page, 'summarise');
    await pick(page, [{ name: 'Lease.pdf', bytes: await leasePdf(1) }]);
    await fitsTheScreen(page);
    for (const id of ['ai-summarise', 'opt-ai-language', 'ai-translate']) await tappable(page, id);
    await page.getByTestId('ai-summarise').click();
    await expect(page.getByTestId('ai-status')).toContainText(/built-in AI|key points/);
  });
});
