/**
 * The handful of very new JavaScript built-ins that pdf.js 6.4's generic build
 * calls without checking, installed only where a browser lacks them. Checked
 * in this order against the browsers the brief names:
 *
 *   Map/WeakMap.prototype.getOrInsertComputed  Chrome 143, Firefox 145
 *   Math.sumPrecise                            Chrome 143, Firefox 141
 *   Uint8Array.prototype.toHex                 Chrome 140, Firefox 133, Safari 18.4
 *   Promise.try                                Chrome 128, Firefox 134, Safari 18.4
 *
 * Without these, pdf.js throws inside render() and inside its worker's font
 * code on the Chromium the e2e runs on (141), let alone on the Chrome 132 the
 * brief promises. Each line is `??=`, so a browser that has the real thing
 * keeps it. Imported first by the engine and by the worker wrapper; it names
 * no library, so it is safe in either bundle.
 */

interface Upsertable {
  getOrInsertComputed?: (this: MapLike, key: unknown, make: (key: unknown) => unknown) => unknown;
}
interface MapLike {
  has(key: unknown): boolean;
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown;
}

function getOrInsertComputed(this: MapLike, key: unknown, make: (key: unknown) => unknown): unknown {
  if (this.has(key)) return this.get(key);
  const value = make(key);
  this.set(key, value);
  return value;
}

(Map.prototype as unknown as Upsertable).getOrInsertComputed ??= getOrInsertComputed;
(WeakMap.prototype as unknown as Upsertable).getOrInsertComputed ??= getOrInsertComputed;

const math = Math as unknown as { sumPrecise?: (values: Iterable<number>) => number };
math.sumPrecise ??= (values) => {
  // Neumaier's compensated sum: pdf.js uses this for font metrics and page
  // sizes, where the plain sum's rounding is harmless but the exact one costs
  // nothing either.
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const t = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value) ? sum - t + value : value - t + sum;
    sum = t;
  }
  return sum + compensation;
};

const bytes = Uint8Array.prototype as unknown as { toHex?: (this: Uint8Array) => string };
bytes.toHex ??= function (this: Uint8Array) {
  let out = '';
  for (const b of this) out += b.toString(16).padStart(2, '0');
  return out;
};

const promise = Promise as unknown as {
  try?: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
};
promise.try ??= (fn, ...args) => new Promise((resolve) => resolve(fn(...args)));

// A module, not a script: imported for its side effects only.
export {};
