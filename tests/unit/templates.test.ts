import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import type { OpContext, Outcome } from '../../app/src/ops/op';
import { indianGrouping, monthName, rupeesInWords } from '../../app/src/ops/template-ops';
import type { PdfEngine } from '../../app/src/pdf/types';
import { createSurgeon } from '../../app/src/pdf/surgeon';
import { pdfjsWorkerModule } from '../fixtures/pdfjs-worker';

let engine: PdfEngine;

beforeAll(async () => {
  await import('../../app/src/pdf/shims');
  (globalThis as Record<string, unknown>).pdfjsWorker = await pdfjsWorkerModule();
  const { createEngine } = await import('../../app/src/pdf/engine');
  engine = createEngine();
  await engine.ready;
});

describe('rupees, the Indian way', () => {
  it('writes amounts in words with lakh and crore', () => {
    expect(rupeesInWords(15000)).toBe('Fifteen Thousand');
    expect(rupeesInWords(12345)).toBe('Twelve Thousand Three Hundred Forty Five');
    expect(rupeesInWords(1234567)).toBe('Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven');
    expect(rupeesInWords(20000000)).toBe('Two Crore');
  });

  it('groups figures in lakhs, and names the months through a new year', () => {
    expect(indianGrouping(1234567)).toBe('12,34,567');
    expect(indianGrouping(999)).toBe('999');
    expect(indianGrouping(15000.5)).toBe('15,000.50');
    expect(monthName('2026-11', 0)).toBe('November 2026');
    expect(monthName('2026-11', 3)).toBe('February 2027');
  });
});

describe('rent receipts', () => {
  it('makes one receipt a month, two to a page, with the amount in words', async () => {
    const workspace = createMemoryWorkspace();
    const ctx: OpContext = { workspace, engine: async () => engine, surgeon: createSurgeon(), passwords: new Map(), signal: new AbortController().signal, progress: () => undefined };
    const params = { tenant: 'Anjali Menon', landlord: 'Joseph Mathew', address: 'Flat 4B, Rose Gardens, Kochi', rent: 15000, start: '2026-04', months: 3, mode: 'Cash', pan: 'abcpk1234f' };
    const outcomes: Outcome[] = await getOp('rent-receipts').run([], params, ctx);
    const out = outcomes[0];
    expect(out?.kind, JSON.stringify(outcomes)).toBe('produced');
    if (out?.kind !== 'produced') return;
    expect(out.file.name).toBe('Rent receipts April 2026 to June 2026.pdf');
    expect(out.detail).toBe('3 receipts, April 2026 to June 2026, two to a page on 2 pages: print, sign, and hand them in');
    const view = await engine.open(await workspace.read(out.file));
    const text = (await view.text(0)).replace(/\s+/g, ' ');
    await view.close();
    expect(text).toContain('RENT RECEIPT');
    expect(text).toContain('Rupees Fifteen Thousand only');
    expect(text).toContain('ABCPK1234F');
    expect(text).toContain('revenue stamp');
  });
});
