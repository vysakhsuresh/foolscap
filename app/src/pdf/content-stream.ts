/**
 * Just enough of a PDF content-stream reader to find where pictures are drawn:
 * it follows q/Q and cm to know the drawing position, and notes every `Do`
 * with its operand's place in the bytes, so a picture can be taken out, put
 * somewhere else, or swapped for another without touching anything else on
 * the page.
 *
 * It reads tokens, not meaning. Strings, arrays, dictionaries and inline
 * images are stepped over whole so their bytes are never mistaken for
 * operators.
 */

export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** a × b, in PDF's row-vector order: apply a, then b. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function invert(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(m[4] * a + m[5] * c), -(m[4] * b + m[5] * d)];
}

/** Where a `Do` sits: its operand name, the byte range of "/Name Do", and the drawing position then. */
export interface DrawCall {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly ctm: Matrix;
}

const WHITE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/** Every `Do` in `bytes`, in order, with the position it draws at. */
export function drawCalls(bytes: Uint8Array): DrawCall[] {
  const out: DrawCall[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const operands: Array<{ value: number | string; start: number }> = [];
  let i = 0;
  const n = bytes.length;
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  while (i < n) {
    const c = bytes[i]!;
    if (WHITE.has(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      // A comment runs to the end of the line.
      while (i < n && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }
    if (c === 0x28) {
      // A string: balanced brackets, backslash escapes.
      let depth = 0;
      for (; i < n; i++) {
        const b = bytes[i];
        if (b === 0x5c) i++;
        else if (b === 0x28) depth++;
        else if (b === 0x29 && --depth === 0) {
          i++;
          break;
        }
      }
      operands.push({ value: '', start: i });
      continue;
    }
    if (c === 0x3c && bytes[i + 1] === 0x3c) {
      // A dictionary, possibly nested.
      let depth = 0;
      for (; i < n; i++) {
        if (bytes[i] === 0x3c && bytes[i + 1] === 0x3c) {
          depth++;
          i++;
        } else if (bytes[i] === 0x3e && bytes[i + 1] === 0x3e) {
          depth--;
          i++;
          if (depth === 0) {
            i++;
            break;
          }
        } else if (bytes[i] === 0x28) {
          for (let d = 0; i < n; i++) {
            if (bytes[i] === 0x5c) i++;
            else if (bytes[i] === 0x28) d++;
            else if (bytes[i] === 0x29 && --d === 0) break;
          }
        }
      }
      operands.push({ value: '', start: i });
      continue;
    }
    if (c === 0x3c) {
      while (i < n && bytes[i] !== 0x3e) i++;
      i++;
      operands.push({ value: '', start: i });
      continue;
    }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x3e) {
      i++;
      continue;
    }
    if (c === 0x2f) {
      const start = i;
      i++;
      while (i < n && !WHITE.has(bytes[i]!) && !DELIM.has(bytes[i]!)) i++;
      operands.push({ value: decodeName(text(start + 1, i)), start });
      continue;
    }
    // A number or an operator.
    const start = i;
    while (i < n && !WHITE.has(bytes[i]!) && !DELIM.has(bytes[i]!)) i++;
    if (i === start) {
      // A lone delimiter (a stray bracket in a damaged stream): step past it.
      i++;
      continue;
    }
    const word = text(start, i);
    const num = Number(word);
    if (word !== '' && !Number.isNaN(num) && /^[-+.\d]/.test(word)) {
      operands.push({ value: num, start });
      continue;
    }
    switch (word) {
      case 'q':
        stack.push(ctm);
        break;
      case 'Q':
        ctm = stack.pop() ?? IDENTITY;
        break;
      case 'cm': {
        const m = operands.slice(-6).map((o) => (typeof o.value === 'number' ? o.value : 0));
        if (m.length === 6) ctm = multiply(m as unknown as Matrix, ctm);
        break;
      }
      case 'Do': {
        const operand = operands[operands.length - 1];
        if (operand && typeof operand.value === 'string' && operand.value !== '') out.push({ name: operand.value, start: operand.start, end: i, ctm });
        break;
      }
      case 'BI': {
        // An inline image: its data runs from ID to EI and may hold any bytes.
        const id = indexOfWord(bytes, 'ID', i);
        if (id < 0) return out;
        const ei = findEI(bytes, id + 3);
        i = ei < 0 ? n : ei + 2;
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
  return out;
}

function decodeName(raw: string): string {
  return raw.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)));
}

function indexOfWord(bytes: Uint8Array, word: string, from: number): number {
  const a = word.charCodeAt(0);
  const b = word.charCodeAt(1);
  for (let i = from; i + 1 < bytes.length; i++) {
    if (bytes[i] === a && bytes[i + 1] === b && (i === 0 || WHITE.has(bytes[i - 1]!)) && (i + 2 >= bytes.length || WHITE.has(bytes[i + 2]!))) return i;
  }
  return -1;
}

/** The EI that ends inline data: whitespace before it, whitespace or the end after it. */
function findEI(bytes: Uint8Array, from: number): number {
  for (let i = from; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x45 && bytes[i + 1] === 0x49 && WHITE.has(bytes[i - 1] ?? 0x20) && (i + 2 >= bytes.length || WHITE.has(bytes[i + 2]!))) return i;
  }
  return -1;
}

/** The unit square under `m`: the box a picture fills, as [x0, y0, x1, y1] in page space. */
export function unitBox(m: Matrix): [number, number, number, number] {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
