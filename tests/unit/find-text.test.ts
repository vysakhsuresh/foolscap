import { describe, expect, it } from 'vitest';
import { findOnPage, linesOf, matchRanges, splitWords } from '../../app/src/pdf/find-text';
import type { PageLayout } from '../../app/src/pdf/types';

const hits = (text: string, ...patterns: Parameters<typeof matchRanges>[1]) => matchRanges(text, patterns, []).map(([s, e]) => text.slice(s, e));

describe('finding private details', () => {
  it('finds Aadhaar, PAN, phone, email and real card numbers, and leaves look-alikes', () => {
    expect(hits('Aadhaar: 2345 6789 0123, ref 1234 5678 9012', 'aadhaar')).toEqual(['2345 6789 0123']);
    expect(hits('PAN ABCPK1234F and ABCPK12345', 'pan')).toEqual(['ABCPK1234F']);
    expect(hits('Call +91 98470 12345 or 0484-2345678; not 12345', 'phone')).toEqual(['+91 98470 12345', '0484-2345678']);
    expect(hits('mail anjali.menon@example.co.in now', 'email')).toEqual(['anjali.menon@example.co.in']);
    expect(hits('Card 4111 1111 1111 1111, not 4111 1111 1111 1112', 'card')).toEqual(['4111 1111 1111 1111']);
  });

  it('finds typed words whatever their case, and splits the box on commas', () => {
    expect(splitWords(' salary, Ravi Kumar ,\n')).toEqual(['salary', 'Ravi Kumar']);
    const text = 'Basic Salary paid to RAVI KUMAR';
    expect(matchRanges(text, [], ['salary', 'ravi kumar']).map(([s, e]) => text.slice(s, e))).toEqual(['Salary', 'RAVI KUMAR']);
  });

  it('joins pieces into lines and maps a match back to each piece it covers', () => {
    const layout: PageLayout = {
      width: 600,
      height: 800,
      items: [
        { str: 'Aadhaar:', x: 50, y: 100, width: 64, height: 10, fontName: 'f' },
        { str: '2345', x: 120, y: 100, width: 32, height: 10, fontName: 'f' },
        { str: '6789', x: 156, y: 100, width: 32, height: 10, fontName: 'f' },
        { str: '0123', x: 192, y: 100.5, width: 32, height: 10, fontName: 'f' },
        { str: 'Next line', x: 50, y: 130, width: 70, height: 10, fontName: 'f' },
      ],
    };
    expect(linesOf(layout).map((l) => l.text)).toEqual(['Aadhaar: 2345 6789 0123', 'Next line']);
    const areas = findOnPage(layout, 3, ['aadhaar'], []);
    expect(areas).toHaveLength(3);
    expect(areas.every((a) => a.page === 3)).toBe(true);
    // The first box starts at the number, not at the label.
    expect(areas[0]!.x * 600).toBeGreaterThan(110);
    expect(areas[0]!.x * 600).toBeLessThan(120);
    // Tall enough to cover the letters above the baseline and the tails below it.
    expect(areas[0]!.y * 800).toBeLessThan(100 - 8);
    expect((areas[0]!.y + areas[0]!.h) * 800).toBeGreaterThan(100 + 2);
  });
});

describe('cells for Edit text', () => {
  it('cuts a statement row into its cells and keeps a line of prose whole', async () => {
    const { segmentsOf } = await import('../../app/src/pdf/find-text');
    const at = (str: string, x: number, y = 100) => ({ str, x, y, width: str.length * 4, height: 7.5, fontName: 'f' });
    const layout: PageLayout = {
      width: 595,
      height: 842,
      items: [
        at('10/04/23', 38),
        at('SIP-ICICI PRUDENTIAL BLUECHIP', 82),
        at('410000009', 260),
        at('10/04/23', 316),
        at('5,000.00', 390),
        at('1,06,506.54', 512),
        at('The rent is', 50, 200),
        at('due on the fifth.', 96, 200),
      ],
    };
    expect(segmentsOf(layout).map((s) => s.text)).toEqual(['10/04/23', 'SIP-ICICI PRUDENTIAL BLUECHIP', '410000009', '10/04/23', '5,000.00', '1,06,506.54', 'The rent is due on the fifth.']);
  });
});

describe('the colour of small print', () => {
  it('takes a blended grey to be black, and deepens a pale colour', async () => {
    const { trueInk } = await import('../../app/src/ui/page-editor');
    expect(trueInk([0.55, 0.55, 0.56], [1, 1, 1])).toEqual([0.08, 0.08, 0.1]);
    expect(trueInk([0.1, 0.1, 0.1], [1, 1, 1])).toEqual([0.1, 0.1, 0.1]);
    const blue = trueInk([0.55, 0.65, 0.9], [1, 1, 1]);
    expect(blue[0]).toBeLessThan(0.55);
    expect(blue[2]).toBeGreaterThan(blue[0]);
  });
});
