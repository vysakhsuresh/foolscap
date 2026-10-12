/**
 * Which words changed between two versions of a document: a patience diff.
 * Words that appear exactly once in both versions anchor the comparison, so a
 * paragraph moved or a page inserted does not make everything after it look
 * different; between anchors, a plain longest-common-run comparison works out
 * the rest while it is small enough to be quick.
 */

export type Change =
  | { readonly kind: 'same'; readonly a: number; readonly b: number }
  | { readonly kind: 'removed'; readonly a: number }
  | { readonly kind: 'added'; readonly b: number };

/** Gaps bigger than this many word pairs are not compared word by word: they changed. */
const DP_LIMIT = 4_000_000;

export function diffWords(a: readonly string[], b: readonly string[]): Change[] {
  const out: Change[] = [];
  const key = (w: string) => w.toLocaleLowerCase().replace(/[“”"’'‘]/g, "'");
  const ka = a.map(key);
  const kb = b.map(key);
  range(0, ka.length, 0, kb.length);
  return out;

  function range(aLo: number, aHi: number, bLo: number, bHi: number): void {
    // Shared start and end first: the common case is a small change in the middle.
    while (aLo < aHi && bLo < bHi && ka[aLo] === kb[bLo]) out.push({ kind: 'same', a: aLo++, b: bLo++ });
    const tail: Change[] = [];
    while (aHi > aLo && bHi > bLo && ka[aHi - 1] === kb[bHi - 1]) tail.unshift({ kind: 'same', a: --aHi, b: --bHi });
    if (aLo === aHi || bLo === bHi) {
      for (let i = aLo; i < aHi; i++) out.push({ kind: 'removed', a: i });
      for (let j = bLo; j < bHi; j++) out.push({ kind: 'added', b: j });
      out.push(...tail);
      return;
    }
    const anchors = uniqueAnchors(aLo, aHi, bLo, bHi);
    if (anchors.length > 0) {
      let pa = aLo;
      let pb = bLo;
      for (const [i, j] of anchors) {
        range(pa, i, pb, j);
        out.push({ kind: 'same', a: i, b: j });
        pa = i + 1;
        pb = j + 1;
      }
      range(pa, aHi, pb, bHi);
    } else if ((aHi - aLo) * (bHi - bLo) <= DP_LIMIT) {
      lcs(aLo, aHi, bLo, bHi);
    } else {
      for (let i = aLo; i < aHi; i++) out.push({ kind: 'removed', a: i });
      for (let j = bLo; j < bHi; j++) out.push({ kind: 'added', b: j });
    }
    out.push(...tail);
  }

  /** Pairs of words unique on both sides, kept in an order both sides agree on (longest increasing run). */
  function uniqueAnchors(aLo: number, aHi: number, bLo: number, bHi: number): Array<[number, number]> {
    const countA = new Map<string, number>();
    const countB = new Map<string, number>();
    const whereB = new Map<string, number>();
    for (let i = aLo; i < aHi; i++) countA.set(ka[i]!, (countA.get(ka[i]!) ?? 0) + 1);
    for (let j = bLo; j < bHi; j++) {
      countB.set(kb[j]!, (countB.get(kb[j]!) ?? 0) + 1);
      whereB.set(kb[j]!, j);
    }
    const pairs: Array<[number, number]> = [];
    for (let i = aLo; i < aHi; i++) {
      const w = ka[i]!;
      if (countA.get(w) === 1 && countB.get(w) === 1) pairs.push([i, whereB.get(w)!]);
    }
    // Longest increasing run of b positions, by patience sorting.
    const tops: number[] = [];
    const back: number[] = new Array<number>(pairs.length).fill(-1);
    const topAt: number[] = [];
    pairs.forEach(([, j], k) => {
      let lo = 0;
      let hi = tops.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tops[mid]! < j) lo = mid + 1;
        else hi = mid;
      }
      tops[lo] = j;
      topAt[lo] = k;
      back[k] = lo > 0 ? topAt[lo - 1]! : -1;
    });
    const chain: Array<[number, number]> = [];
    for (let k = tops.length > 0 ? topAt[tops.length - 1]! : -1; k >= 0; k = back[k]!) chain.unshift(pairs[k]!);
    return chain;
  }

  function lcs(aLo: number, aHi: number, bLo: number, bHi: number): void {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const table = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * (m + 1) + j] = ka[aLo + i] === kb[bLo + j] ? table[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(table[(i + 1) * (m + 1) + j]!, table[i * (m + 1) + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ka[aLo + i] === kb[bLo + j]) {
        out.push({ kind: 'same', a: aLo + i++, b: bLo + j++ });
      } else if (table[(i + 1) * (m + 1) + j]! >= table[i * (m + 1) + j + 1]!) {
        out.push({ kind: 'removed', a: aLo + i++ });
      } else {
        out.push({ kind: 'added', b: bLo + j++ });
      }
    }
    while (i < n) out.push({ kind: 'removed', a: aLo + i++ });
    while (j < m) out.push({ kind: 'added', b: bLo + j++ });
  }
}
