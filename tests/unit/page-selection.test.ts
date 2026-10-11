import { describe, expect, it } from 'vitest';
import {
  PageSelection,
  all,
  chunks,
  describe as describeIndices,
  invert,
  parse,
  rangesInOrder,
} from '../../app/src/pdf/page-selection';

describe('parse: one-based in, zero-based out', () => {
  it('turns a plain list into indices', () => {
    expect(parse('1, 3, 5', 10)).toEqual([0, 2, 4]);
  });

  it('expands a range', () => {
    expect(parse('2-4', 10)).toEqual([1, 2, 3]);
  });

  it('reads "12-" as twelve to the end', () => {
    expect(parse('8-', 10)).toEqual([7, 8, 9]);
  });

  it('reads "-5" as the start up to five', () => {
    expect(parse('-3', 10)).toEqual([0, 1, 2]);
  });

  it('flips a backwards range instead of refusing it', () => {
    expect(parse('9-3', 10)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('clips pages past the end rather than rejecting them', () => {
    expect(parse('8-20', 10)).toEqual([7, 8, 9]);
    expect(parse('15', 10)).toEqual([]);
    expect(parse('0-2', 10)).toEqual([0, 1]);
    // A leading dash followed by "5-2", which is not a number: nothing is selected, as in Kotlin.
    expect(parse('-5-2', 10)).toEqual([]);
  });

  it('forgives spaces everywhere and a trailing comma', () => {
    expect(parse('  1 ,  3 - 4 , 7 ,', 10)).toEqual([0, 2, 3, 6]);
  });

  it('skips parts that are not numbers and keeps the rest', () => {
    expect(parse('1, abc, 3, 2-x, 1.5', 10)).toEqual([0, 2]);
  });

  it('returns ascending indices with no duplicates', () => {
    expect(parse('5, 1-3, 2, 5', 10)).toEqual([0, 1, 2, 4]);
  });

  it('returns nothing for an empty spec, an empty document or nothing usable', () => {
    expect(parse('', 10)).toEqual([]);
    expect(parse(',,,', 10)).toEqual([]);
    expect(parse('1-3', 0)).toEqual([]);
    expect(parse('1-3', -1)).toEqual([]);
    expect(parse('-', 10)).toEqual([]);
    expect(parse('a-b', 10)).toEqual([]);
  });

  it('matches the Kotlin examples: "1-3, 7, 12-" on 15 pages', () => {
    expect(parse('1-3, 7, 12-', 15)).toEqual([0, 1, 2, 6, 11, 12, 13, 14]);
  });
});

describe('rangesInOrder: one group per typed part', () => {
  it('keeps the groups apart and in the order typed', () => {
    expect(rangesInOrder('7, 1-3, 12-', 15)).toEqual([[6], [0, 1, 2], [11, 12, 13, 14]]);
  });

  it('sorts inside a group and drops empty groups', () => {
    expect(rangesInOrder('9-7, , x, 20, 2', 10)).toEqual([[6, 7, 8], [1]]);
  });

  it('allows the same page in two groups', () => {
    expect(rangesInOrder('1-2, 2-3', 10)).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('returns nothing for an empty document or nothing usable', () => {
    expect(rangesInOrder('1-3', 0)).toEqual([]);
    expect(rangesInOrder('', 10)).toEqual([]);
    expect(rangesInOrder('abc', 10)).toEqual([]);
  });
});

describe('all', () => {
  it('lists every page', () => {
    expect(all(4)).toEqual([0, 1, 2, 3]);
  });

  it('is empty for zero or negative counts', () => {
    expect(all(0)).toEqual([]);
    expect(all(-2)).toEqual([]);
  });
});

describe('chunks: split every N pages', () => {
  it('keeps a final short group: 10 pages every 3 gives 3, 3, 3, 1', () => {
    expect(chunks(10, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 8], [9]]);
  });

  it('gives one group when the size covers the document', () => {
    expect(chunks(3, 10)).toEqual([[0, 1, 2]]);
  });

  it('returns nothing for a bad size or an empty document', () => {
    expect(chunks(10, 0)).toEqual([]);
    expect(chunks(10, -1)).toEqual([]);
    expect(chunks(0, 3)).toEqual([]);
  });
});

describe('invert: everything that was not selected', () => {
  it('returns the pages to keep when deleting', () => {
    expect(invert([1, 3], 5)).toEqual([0, 2, 4]);
  });

  it('ignores indices outside the document', () => {
    expect(invert([7, -1], 3)).toEqual([0, 1, 2]);
  });

  it('is empty when everything is selected', () => {
    expect(invert([0, 1, 2], 3)).toEqual([]);
  });
});

describe('describe: indices back into a spec', () => {
  it('collapses runs into ranges', () => {
    expect(describeIndices([0, 1, 2, 6, 11, 12, 13, 14])).toEqual('1-3, 7, 12-15');
  });

  it('keeps singles as singles', () => {
    expect(describeIndices([0, 2, 4])).toEqual('1, 3, 5');
  });

  it('sorts and de-duplicates first', () => {
    expect(describeIndices([4, 2, 3, 2, 0])).toEqual('1, 3-5');
  });

  it('is empty for no indices', () => {
    expect(describeIndices([])).toEqual('');
  });

  it('round-trips through parse', () => {
    const indices = parse('1-3, 7, 12-', 15);
    expect(parse(describeIndices(indices), 15)).toEqual(indices);
  });
});

describe('PageSelection object', () => {
  it('bundles the same functions', () => {
    expect(PageSelection.parse).toBe(parse);
    expect(PageSelection.rangesInOrder).toBe(rangesInOrder);
    expect(PageSelection.all).toBe(all);
    expect(PageSelection.chunks).toBe(chunks);
    expect(PageSelection.invert).toBe(invert);
    expect(PageSelection.describe).toBe(describeIndices);
  });
});
