/**
 * A made-up bank statement, laid out the way Indian banks do it: account
 * details on page one, a seven-column table running across pages with its
 * header repeated, descriptions that wrap to two lines, a short last page,
 * and a summary box after the table. "Malabar Demo Bank" does not exist, and
 * every page says so. The numbers come from a fixed seed, so the file is the
 * same every time, and the totals come back to check a conversion against.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';

export interface Statement {
  readonly bytes: Uint8Array;
  readonly transactions: number;
  readonly withdrawals: number;
  readonly deposits: number;
  readonly closing: number;
}

interface Row {
  readonly date: Date;
  readonly narration: string;
  readonly ref: string;
  readonly w: number;
  readonly c: number;
  readonly bal: number;
}

const MERCHANTS = ['SWIGGY', 'ZOMATO', 'AMAZON PAY', 'FLIPKART', 'BIGBASKET', 'RELIANCE SMART', 'MORE SUPERMARKET', 'LULU HYPERMARKET', 'KSEB ELECTRICITY', 'JIO PREPAID', 'AIRTEL POSTPAID', 'BPCL PETROL', 'IOCL FUEL STN', 'APOLLO PHARMACY', 'MEDPLUS', 'IRCTC', 'REDBUS', 'UBER INDIA', 'OLA CABS', 'BOOKMYSHOW', 'NETFLIX', 'DMART', 'MILMA BOOTH', 'KWA WATER BILL'];
const PEOPLE = ['RAVI KUMAR', 'MEERA NAIR', 'JOSEPH MATHEW', 'FATHIMA K', 'SURESH BABU', 'LAKSHMI P', 'ARUN DAS'];
const OPENING = 84250.75;

/** 1234567.5 → "12,34,567.50": Indian grouping. */
export function inr(n: number): string {
  const [w = '0', p = '00'] = n.toFixed(2).split('.');
  const last3 = w.slice(-3);
  const rest = w.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest ? `${rest},${last3}` : last3}.${p}`;
}

const dd = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
const month = (d: Date) => d.toLocaleString('en', { month: 'short' }).toUpperCase();

function transactions(from: [number, number], to: [number, number]): { rows: Row[]; closing: number } {
  let seed = 20230401;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const rows: Row[] = [];
  let balance = OPENING;
  let ref = 410000000;
  const start = new Date(from[0], from[1] - 1, 1);
  const end = new Date(to[0], to[1], 0);
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const add = (narration: string, w: number, c: number) => {
      balance = Math.round((balance - w + c) * 100) / 100;
      rows.push({ date: new Date(d), narration, ref: String(++ref), w, c, bal: balance });
    };
    const day = d.getDate();
    const year = d.getFullYear();
    const salary = year === 2023 ? 68500 : year === 2024 ? 74200 : 81300;
    if (day === 1) add(`NEFT CR-HDFC0000123-TECHNOPARK SOLUTIONS PVT LTD-SALARY ${month(d)} ${year}`, 0, salary);
    if (day === 5) add('ACH D- LIC OF INDIA PREMIUM-POLICY 512XXXX88', 3420, 0);
    if (day === 5) add('NACH DR HOME LOAN EMI-LAN 0091XXXX4521', 18650, 0);
    if (day === 7) add(`UPI-JOSEPH MATHEW-josephm@okaxis-RENT ${month(d)}`, 15000, 0);
    if (day === 10) add('SIP-ICICI PRUDENTIAL BLUECHIP FUND-GROWTH', 5000, 0);
    if (day === 15 && d.getMonth() % 3 === 2) add('INT.PD:SAVINGS INTEREST CREDIT', 0, Math.round(between(380, 920) * 100) / 100);
    if (day === 20 && rand() < 0.4) add(`IMPS-${pick(PEOPLE)}-SBIN0070123-REFUND`, 0, Math.round(between(500, 6000)));
    const n = Math.floor(between(0, 1.7));
    for (let k = 0; k < n; k++) {
      const m = pick(MERCHANTS);
      const amount = Math.round(between(80, m.includes('ELECTRICITY') || m.includes('IRCTC') ? 3800 : 1700) * 100) / 100;
      add(rand() < 0.75 ? `UPI-${m}-${m.toLowerCase().replace(/[^a-z]/g, '')}@ybl-PAYMENT` : `POS ${String(Math.floor(between(1000, 9999)))} ${m} KOCHI`, amount, 0);
    }
    if (rand() < 0.04) add('ATM WDL-SBI ATM KAKKANAD-S1BW012345', Math.round(between(1, 10)) * 500, 0);
    if (rand() < 0.03) add(`UPI-${pick(PEOPLE)}-friend@okhdfcbank-SPLIT DINNER`, 0, Math.round(between(300, 2500)));
  }
  return { rows, closing: balance };
}

/** The statement from the first day of `from` [year, month] to the last day of `to`. */
export async function bankStatementPdf(from: [number, number] = [2023, 4], to: [number, number] = [2025, 9]): Promise<Statement> {
  const { rows, closing } = transactions(from, to);
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const grey = rgb(0.45, 0.45, 0.5);
  const W = 595.28;
  const H = 841.89;
  const M = 36;
  const cols = [
    { x: M, w: 42 },
    { x: M + 44, w: 176 },
    { x: M + 222, w: 54 },
    { x: M + 278, w: 40 },
    { x: M + 320, w: 64 },
    { x: M + 388, w: 64 },
    { x: M + 455, w: 66 },
  ] as const;
  const pages: PDFPage[] = [];
  let page: PDFPage = doc.addPage([W, H]);
  pages.push(page);
  let y = 0;
  const text = (t: string, x: number, at: number, f: PDFFont = font, size = 7.5, color = ink) => page.drawText(t, { x, y: at, size, font: f, color });
  const right = (t: string, xRight: number, at: number, f: PDFFont = font, size = 7.5) => text(t, xRight - f.widthOfTextAtSize(t, size), at, f, size);
  const wrap = (t: string, width: number, size: number) => {
    const out: string[] = [];
    let cur = '';
    for (const word of t.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && cur) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  const head = (first: boolean) => {
    if (!first) {
      page = doc.addPage([W, H]);
      pages.push(page);
    }
    text('MALABAR DEMO BANK', M, H - 50, bold, 16, rgb(0.05, 0.25, 0.5));
    text('SAMPLE STATEMENT FOR SOFTWARE TESTING - NOT A REAL BANK OR ACCOUNT', M, H - 64, bold, 7, rgb(0.75, 0.1, 0.1));
    text('Kakkanad Branch, Kochi 682030   IFSC: MDBK0000042', M, H - 78, font, 8, grey);
    right('Statement of Account', W - M, H - 50, bold, 11);
    if (first) {
      const start = rows[0]?.date ?? new Date(from[0], from[1] - 1, 1);
      const info: Array<[string, string]> = [
        ['Account holder', 'ANJALI MENON'],
        ['Address', 'Flat 4B, Rose Gardens, Kakkanad, Kochi 682030'],
        ['Account number', 'XXXXXXXX1234 (Savings)'],
        ['Period', `${dd(new Date(start.getFullYear(), start.getMonth(), 1))} to ${dd(new Date(to[0], to[1], 0))}`],
        ['Currency', 'INR'],
      ];
      info.forEach(([k, v], i) => {
        text(k, M, H - 102 - i * 13, bold, 8.5);
        text(v, M + 95, H - 102 - i * 13, font, 8.5);
      });
      y = H - 180;
    } else y = H - 100;
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: rgb(0.93, 0.95, 0.98) });
    ['Date', 'Narration', 'Chq/Ref No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'].forEach((h, i) => {
      const c = cols[i]!;
      if (i >= 4) right(h, i === 6 ? W - M - 2 : c.x + c.w, y, bold, 7);
      else text(h, c.x + 2, y, bold, 7);
    });
    y -= 18;
  };

  head(true);
  text(dd(rows[0]?.date ?? new Date()), cols[0].x + 2, y);
  text('OPENING BALANCE', cols[1].x + 2, y, bold);
  right(inr(OPENING), W - M - 2, y);
  y -= 12;
  let withdrawals = 0;
  let deposits = 0;
  for (const r of rows) {
    const lines = wrap(r.narration, cols[1].w - 4, 7.5);
    const h = lines.length * 9 + 3;
    if (y - h < 50) head(false);
    text(dd(r.date), cols[0].x + 2, y);
    lines.forEach((l, i) => text(l, cols[1].x + 2, y - i * 9));
    text(r.ref, cols[2].x + 2, y);
    text(dd(r.date), cols[3].x + 2, y);
    if (r.w) right(inr(r.w), cols[4].x + cols[4].w, y);
    if (r.c) right(inr(r.c), cols[5].x + cols[5].w, y);
    right(inr(r.bal), W - M - 2, y);
    withdrawals += r.w;
    deposits += r.c;
    page.drawLine({ start: { x: M, y: y - h + 6 }, end: { x: W - M, y: y - h + 6 }, thickness: 0.3, color: rgb(0.75, 0.77, 0.8) });
    y -= h;
  }
  if (y < 120) head(false);
  y -= 14;
  text('STATEMENT SUMMARY', M, y, bold, 9);
  const summary: Array<[string, string]> = [
    ['Opening balance', inr(OPENING)],
    ['Total withdrawals', inr(withdrawals)],
    ['Total deposits', inr(deposits)],
    ['Closing balance', inr(closing)],
    ['Transactions', String(rows.length)],
  ];
  summary.forEach(([k, v], i) => {
    text(k, M, y - 14 - i * 12, font, 8.5);
    right(v, M + 220, y - 14 - i * 12, font, 8.5);
  });
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 7), y: 22, size: 7, font, color: grey });
    p.drawText('This is a computer-generated sample for testing. Malabar Demo Bank does not exist.', { x: M, y: 22, size: 7, font, color: grey });
  });
  return {
    bytes: await doc.save(),
    transactions: rows.length,
    withdrawals: Math.round(withdrawals * 100) / 100,
    deposits: Math.round(deposits * 100) / 100,
    closing,
  };
}
