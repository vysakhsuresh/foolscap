/**
 * Templates: documents made from what is typed, with no file to start from.
 * The first is the one Indian salaried people need every year: rent receipts
 * for their HRA claim, one per month, ready to sign.
 */
import type { Block, FlowDocument, TableCell } from '../convert/model';
import { plural, refused, store } from './common';
import { paintLine } from './office-ops';
import type { Op, RentReceiptsParams } from './op';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const ten = TENS[Math.floor(n / 10)] ?? '';
  const one = ONES[n % 10] ?? '';
  return one ? `${ten} ${one}` : ten;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds > 0 ? `${ONES[hundreds]} Hundred` : '', rest > 0 ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/** 1234567 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven", as Indian receipts write it. */
export function rupeesInWords(amount: number): string {
  let n = Math.floor(Math.abs(amount));
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  return [
    crore > 0 ? `${crore > 999 ? rupeesInWords(crore) : belowThousand(crore)} Crore` : '',
    lakh > 0 ? `${belowHundred(lakh)} Lakh` : '',
    thousand > 0 ? `${belowHundred(thousand)} Thousand` : '',
    n > 0 ? belowThousand(n) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** 15000.5 → "Rupees Fifteen Thousand and Fifty Paise only", as a receipt or a cheque writes it. */
export function amountInWords(amount: number): string {
  const paise = Math.round(Math.abs(amount) * 100) % 100;
  const rupees = Math.floor(Math.round(Math.abs(amount) * 100) / 100);
  return `Rupees ${rupeesInWords(rupees)}${paise > 0 ? ` and ${belowHundred(paise)} Paise` : ''} only`;
}

/** 1234567 → "12,34,567": Indian grouping. */
export function indianGrouping(amount: number): string {
  const [whole = '0', paise] = Math.abs(amount).toFixed(2).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  return paise === '00' ? grouped : `${grouped}.${paise}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-04" plus `i` months → "April 2026". */
export function monthName(start: string, i: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(start);
  const year = m ? Number(m[1]) : new Date().getFullYear();
  const month = (m ? Number(m[2]) - 1 : 0) + i;
  return `${MONTHS[((month % 12) + 12) % 12]} ${year + Math.floor(month / 12)}`;
}

const cell = (text: string, bold = false): TableCell => ({ paragraphs: [{ kind: 'paragraph', runs: [{ text, size: 10.5, ...(bold ? { bold: true } : {}) }] }] });

export function receiptsFlow(p: RentReceiptsParams): FlowDocument {
  const blocks: Block[] = [];
  const amount = `Rs. ${indianGrouping(p.rent)} (${amountInWords(p.rent)})`;
  for (let i = 0; i < p.months; i++) {
    const month = monthName(p.start, i);
    if (i > 0 && i % 2 === 0) blocks.push({ kind: 'page-break' });
    blocks.push({ kind: 'paragraph', heading: 2, align: 'center', spaceBefore: i % 2 === 0 ? 0 : 36, runs: [{ text: 'RENT RECEIPT', size: 16, bold: true }] });
    blocks.push({ kind: 'paragraph', align: 'center', runs: [{ text: month, size: 11 }] });
    const rows: TableCell[][] = [
      [cell('Received from', true), cell(p.tenant)],
      [cell('The sum of', true), cell(amount)],
      [cell('Towards rent for', true), cell(`${month}, for the property at ${p.address}`)],
      [cell('Paid by', true), cell(p.mode)],
      [cell('Received by (owner)', true), cell(p.landlord)],
    ];
    if (p.pan.trim()) rows.push([cell("Owner's PAN", true), cell(p.pan.trim().toUpperCase())]);
    blocks.push({ kind: 'table', columns: [150, 330], rows });
    blocks.push({ kind: 'paragraph', spaceBefore: 18, runs: [{ text: `Signature of the owner: ______________________          Date: ____________`, size: 10.5 }] });
    if (p.mode === 'Cash' && p.rent > 5000) {
      blocks.push({ kind: 'paragraph', runs: [{ text: 'Affix a revenue stamp here: a cash payment over Rs. 5,000 needs one.', size: 9, italic: true }] });
    }
  }
  return { title: `Rent receipts for ${p.tenant}`, page: { width: 595.28, height: 841.89, margin: 56 }, blocks };
}

export const rentReceiptsOp: Op<RentReceiptsParams> = {
  tool: 'rent-receipts',
  arity: { kind: 'none' },
  title: () => 'Rent receipts',
  async run(inputs, params, ctx) {
    const missing = !params.tenant.trim() ? 'the tenant’s name' : !params.landlord.trim() ? 'the owner’s name' : !params.address.trim() ? 'the address' : null;
    if (missing) return [refused(inputs, `Type ${missing}.`)];
    if (!(params.rent > 0) || !Number.isInteger(params.months) || params.months < 1 || params.months > 24) {
      return [refused(inputs, 'Type the monthly rent, and a number of months from 1 to 24.')];
    }
    ctx.progress({ done: 0, total: 0, label: 'Writing the receipts…' });
    const { bytes, pages } = await ctx.surgeon.layoutFlow(receiptsFlow(params), paintLine);
    const first = monthName(params.start, 0);
    const last = monthName(params.start, params.months - 1);
    const name = `Rent receipts ${params.months === 1 ? first : `${first} to ${last}`}.pdf`;
    // Employers ask for the owner's PAN once the rent passes a lakh a year (the HRA rule).
    const pan = !params.pan.trim() && params.rent * 12 > 100_000 ? ". The rent is over ₹1 lakh a year, so your employer will ask for the owner's PAN: add it above and make them again" : '';
    const detail = `${plural(params.months, 'receipt')}, ${first}${params.months > 1 ? ` to ${last}` : ''}, two to a page on ${plural(pages, 'page')}: print, sign, and hand them in${pan}`;
    return [await store(ctx, 'rent-receipts', [], name, bytes, detail)];
  },
};
