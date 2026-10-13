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

/** One operand before an operator: a number, a name (without its slash), or '' for anything else; and where it starts. */
interface Operand {
  readonly value: number | string;
  readonly start: number;
}

/**
 * Reads `bytes` operator by operator, following q/Q and cm, and calls
 * `visit` with each operator, its operands, where the operator itself sits
 * in the bytes, and the drawing position then. `visit` returns false to stop.
 */
function scan(bytes: Uint8Array, visit: (op: string, operands: readonly Operand[], at: { start: number; end: number }, ctm: Matrix) => boolean | void): void {
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const operands: Operand[] = [];
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
    if (visit(word, operands, { start, end: i }, ctm) === false) return;
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
      case 'BI': {
        // An inline image: its data runs from ID to EI and may hold any bytes.
        const id = indexOfWord(bytes, 'ID', i);
        if (id < 0) return;
        const ei = findEI(bytes, id + 3);
        i = ei < 0 ? n : ei + 2;
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
}

/** Every `Do` in `bytes`, in order, with the position it draws at. */
export function drawCalls(bytes: Uint8Array): DrawCall[] {
  const out: DrawCall[] = [];
  scan(bytes, (op, operands, at, ctm) => {
    if (op !== 'Do') return;
    const operand = operands[operands.length - 1];
    if (operand && typeof operand.value === 'string' && operand.value !== '') out.push({ name: operand.value, start: operand.start, end: at.end, ctm });
  });
  return out;
}

/**
 * Where a page paints itself white before drawing anything else, as Chrome,
 * Skia and many printers-to-PDF do: the fill operators (`f`, `f*`, `F`,
 * `B`, `B*`, `b`, `b*`) of rectangles in white that cover most of `page`
 * (in page space), up to the first words, picture, line or coloured fill.
 * A colour put behind such a page would never show; Page background turns
 * these fills off instead, byte for byte, so nothing else moves.
 */
export function paperFills(
  bytes: Uint8Array,
  page: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): { fills: Array<{ start: number; end: number; op: string }>; drawing: boolean } {
  const out: Array<{ start: number; end: number; op: string }> = [];
  let drawing = false;
  let white = false;
  let box: [number, number, number, number] | null = null;
  /** The path so far has more than rectangles in it. */
  let shaped = false;
  /** Corners of a path drawn with m and l (as pdf-lib draws a rectangle), in page space. */
  let corners: Array<[number, number]> = [];
  const lined = (): [number, number, number, number] | null => {
    if (corners.length < 4) return null;
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const b: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const onCorner = (p: [number, number]) => (Math.abs(p[0] - b[0]) < 0.5 || Math.abs(p[0] - b[2]) < 0.5) && (Math.abs(p[1] - b[1]) < 0.5 || Math.abs(p[1] - b[3]) < 0.5);
    return corners.every(onCorner) ? b : null;
  };
  const nums = (operands: readonly Operand[], count: number): number[] | null => {
    const tail = operands.slice(-count);
    return tail.length === count && tail.every((o) => typeof o.value === 'number') ? tail.map((o) => o.value as number) : null;
  };
  scan(bytes, (op, operands, at, ctm) => {
    switch (op) {
      case 'g':
      case 'rg': {
        const v = nums(operands, op === 'g' ? 1 : 3);
        white = v !== null && v.every((x) => x >= 0.97);
        return;
      }
      case 'k': {
        const v = nums(operands, 4);
        white = v !== null && v.every((x) => x <= 0.03);
        return;
      }
      case 'sc':
      case 'scn': {
        const v = operands.filter((o) => typeof o.value === 'number').map((o) => o.value as number);
        white = (v.length === 1 || v.length === 3) && v.every((x) => x >= 0.97);
        return;
      }
      case 'cs':
        white = false;
        return;
      case 're': {
        const v = nums(operands, 4);
        if (v === null) {
          drawing = true;
          return false;
        }
        const [x, y, w, h] = v as [number, number, number, number];
        const [x0, y0, x1, y1] = unitBox(multiply([w, 0, 0, h, x, y], ctm));
        box = box === null ? [x0, y0, x1, y1] : [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)];
        return;
      }
      case 'f':
      case 'F':
      case 'f*':
      case 'B':
      case 'B*':
      case 'b':
      case 'b*': {
        if (corners.length > 0) {
          const b = lined();
          if (b === null) shaped = true;
          else box = box === null ? b : [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])];
        }
        const covered = box === null || shaped ? 0 : (Math.max(0, Math.min(box[2], page.x + page.width) - Math.max(box[0], page.x)) * Math.max(0, Math.min(box[3], page.y + page.height) - Math.max(box[1], page.y))) / (page.width * page.height);
        box = null;
        shaped = false;
        corners = [];
        // Anything but white paper over the page ends the search: from here on it is the page's own drawing.
        if (!white || covered < 0.9) {
          drawing = true;
          return false;
        }
        out.push({ ...at, op });
        return;
      }
      case 'n':
        box = null;
        shaped = false;
        corners = [];
        return;
      case 'm':
      case 'l': {
        const v = nums(operands, 2);
        if (v === null) {
          shaped = true;
          return;
        }
        const [x, y] = v as [number, number];
        corners.push([x * ctm[0] + y * ctm[2] + ctm[4], x * ctm[1] + y * ctm[3] + ctm[5]]);
        return;
      }
      case 'c':
      case 'v':
      case 'y':
      case 'h':
        // A path that is not a plain rectangle: not paper.
        if (op !== 'h') shaped = true;
        return;
      case 'q':
      case 'Q':
      case 'cm':
      case 'w':
      case 'J':
      case 'j':
      case 'M':
      case 'd':
      case 'ri':
      case 'i':
      case 'gs':
      case 'G':
      case 'RG':
      case 'K':
      case 'CS':
      case 'SC':
      case 'SCN':
      case 'W':
      case 'W*':
        return;
      default:
        // Words, pictures, strokes, shadings: the page's own drawing has begun.
        drawing = true;
        return false;
    }
  });
  return { fills: out, drawing };
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

/**
 * The drawing instructions with every piece of text taken out: each BT … ET
 * block, whole. What is left draws everything else on the page exactly as
 * before (photos, shapes, rules, shading), which is the background an
 * editable slide puts its own text boxes over. Strings, dictionaries and
 * inline images are stepped over whole, as in `drawCalls`.
 */
export function withoutText(bytes: Uint8Array): Uint8Array {
  const cuts: Array<[number, number]> = [];
  let open = -1;
  const n = bytes.length;
  let i = 0;
  while (i < n) {
    const c = bytes[i]!;
    if (WHITE.has(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      while (i < n && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }
    if (c === 0x28) {
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
      continue;
    }
    if (c === 0x3c && bytes[i + 1] === 0x3c) {
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
        }
      }
      continue;
    }
    if (c === 0x3c) {
      while (i < n && bytes[i] !== 0x3e) i++;
      i++;
      continue;
    }
    if (c === 0x2f) {
      // A name ("/BT" is a name, not the operator).
      i++;
      while (i < n && !WHITE.has(bytes[i]!) && !DELIM.has(bytes[i]!)) i++;
      continue;
    }
    if (DELIM.has(c)) {
      i++;
      continue;
    }
    const start = i;
    while (i < n && !WHITE.has(bytes[i]!) && !DELIM.has(bytes[i]!)) i++;
    const word = String.fromCharCode(...bytes.subarray(start, Math.min(i, start + 3)));
    const length = i - start;
    if (length === 2 && word === 'BT' && open < 0) open = start;
    else if (length === 2 && word === 'ET' && open >= 0) {
      cuts.push([open, i]);
      open = -1;
    } else if (length === 2 && word === 'BI') {
      const id = indexOfWord(bytes, 'ID', i);
      if (id < 0) break;
      const ei = findEI(bytes, id + 3);
      i = ei < 0 ? n : ei + 2;
    }
  }
  if (cuts.length === 0) return bytes;
  const out = new Uint8Array(bytes.length);
  let at = 0;
  let from = 0;
  for (const [a, b] of cuts) {
    out.set(bytes.subarray(from, a), at);
    at += a - from;
    out[at++] = 0x0a;
    from = b;
  }
  out.set(bytes.subarray(from), at);
  at += n - from;
  return out.slice(0, at);
}
