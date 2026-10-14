/**
 * Excel: a Workbook written as an .xlsx, and an .xlsx read back into one.
 *
 * The model keeps every cell as text. The writer turns text that is plainly a
 * number ("42", "1250.00", "1,234.50") into a real number, so a column of
 * amounts from a bank statement can be summed, and gives it the number format
 * that shows it the way it was written. Anything that only looks numeric to a
 * machine stays text: "007", a sixteen-digit card number, a phone number,
 * "₹100". Losing a leading zero or the last digits of an account number is
 * worse than not being able to sum it.
 *
 * The reader gives back what Excel shows: a formula's last computed value,
 * TRUE/FALSE, dates as yyyy-mm-dd, numbers in their cell's format.
 */
import type { Workbook } from './model';
import { contentTypes, CORE_TYPE, coreProperties, Package, REL, relationships, type Entry, type RelSpec, zip } from './package';
import { attr, child, elements, escapeAttr, escapeText, textOf, XML_DECLARATION, type XmlElement } from './xml';

const SML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SML = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;

// =====================================================================
// Writing
// =====================================================================

/** The four cell styles the writer uses: General, 0.00, #,##0 and #,##0.00. */
const STYLE = { general: 0, twoDecimals: 1, grouped: 2, groupedTwoDecimals: 3 } as const;

/** Writes the workbook as an .xlsx. A workbook with no sheets gets one empty sheet, as Excel requires. */
export function toXlsx(book: Workbook, options: { title?: string } = {}): Uint8Array {
  const sheets = book.sheets.length > 0 ? book.sheets : [{ name: 'Sheet1', rows: [] }];
  const names = sheetNames(sheets.map((s) => s.name));
  const strings = new Map<string, number>();
  const shared: string[] = [];
  const intern = (text: string): number => {
    let index = strings.get(text);
    if (index === undefined) {
      index = shared.length;
      shared.push(text);
      strings.set(text, index);
    }
    return index;
  };

  const entries: Entry[] = [];
  const workbookRels: RelSpec[] = [];
  const overrides: Array<[string, string]> = [['/xl/workbook.xml', `${SML}.sheet.main+xml`]];
  let sheetList = '';
  sheets.forEach((sheet, i) => {
    const file = `sheet${i + 1}.xml`;
    entries.push([`xl/worksheets/${file}`, worksheet(sheet.rows, intern)]);
    workbookRels.push({ id: `rId${i + 1}`, type: REL.worksheet, target: `worksheets/${file}` });
    overrides.push([`/xl/worksheets/${file}`, `${SML}.worksheet+xml`]);
    sheetList += `<sheet name="${escapeAttr(names[i] ?? `Sheet${i + 1}`)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
  });
  const n = sheets.length;
  workbookRels.push({ id: `rId${n + 1}`, type: REL.styles, target: 'styles.xml' });
  workbookRels.push({ id: `rId${n + 2}`, type: REL.sharedStrings, target: 'sharedStrings.xml' });
  overrides.push(['/xl/styles.xml', `${SML}.styles+xml`], ['/xl/sharedStrings.xml', `${SML}.sharedStrings+xml`]);

  const sst = shared.map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${escapeText(s)}</t></si>`).join('');
  const core = coreProperties(options.title);
  const packageRels: RelSpec[] = [{ id: 'rId1', type: REL.officeDocument, target: 'xl/workbook.xml' }];
  if (core) {
    packageRels.push({ id: 'rId2', type: REL.core, target: 'docProps/core.xml' });
    overrides.push(['/docProps/core.xml', CORE_TYPE]);
  }

  const all: Entry[] = [
    ['[Content_Types].xml', contentTypes(overrides)],
    ['_rels/.rels', relationships(packageRels)],
    ['xl/workbook.xml', `${XML_DECLARATION}<workbook xmlns="${SML_NS}" xmlns:r="${R_NS}"><sheets>${sheetList}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', relationships(workbookRels)],
    ['xl/styles.xml', STYLES],
    ['xl/sharedStrings.xml', `${XML_DECLARATION}<sst xmlns="${SML_NS}" count="${shared.length}" uniqueCount="${shared.length}">${sst}</sst>`],
    ...entries,
  ];
  if (core) all.push(['docProps/core.xml', core]);
  return zip(all);
}

function worksheet(rows: ReadonlyArray<readonly string[]>, intern: (text: string) => number): string {
  const widths: number[] = [];
  let data = '';
  let lastRow = 0;
  let lastColumn = 0;
  rows.slice(0, MAX_ROWS).forEach((row, r) => {
    let cells = '';
    row.slice(0, MAX_COLUMNS).forEach((text, c) => {
      if (text === '') return;
      const ref = `${columnName(c)}${r + 1}`;
      const number = asNumber(text);
      if (number) cells += `<c r="${ref}"${number.style ? ` s="${number.style}"` : ''}><v>${number.value}</v></c>`;
      else cells += `<c r="${ref}" t="s"><v>${intern(text)}</v></c>`;
      widths[c] = Math.max(widths[c] ?? 0, Math.max(...text.split('\n').map((l) => [...l].length)));
      lastColumn = Math.max(lastColumn, c + 1);
      lastRow = r + 1;
    });
    if (cells) data += `<row r="${r + 1}">${cells}</row>`;
  });
  const dimension = lastRow > 0 ? `<dimension ref="A1:${columnName(lastColumn - 1)}${lastRow}"/>` : '<dimension ref="A1"/>';
  let cols = '';
  for (let c = 0; c < widths.length; c++) {
    const chars = widths[c];
    if (chars === undefined) continue;
    const width = Math.min(60, Math.max(8, Math.round(chars * 1.1 + 2)));
    cols += `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`;
  }
  return `${XML_DECLARATION}<worksheet xmlns="${SML_NS}" xmlns:r="${R_NS}">${dimension}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${data}</sheetData></worksheet>`;
}

/**
 * The number a cell's text plainly is, with the style that shows it as
 * written, or undefined to keep it as text. Integers longer than eleven
 * digits stay text: Excel would show them in scientific notation, and they
 * are account numbers, not quantities.
 */
export function asNumber(text: string): { value: number; style: number } | undefined {
  const plain = /^-?(0|[1-9]\d{0,10})(?:\.(\d+))?$/.exec(text);
  if (plain) {
    const decimals = plain[2]?.length ?? 0;
    const value = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(value)) return undefined;
    if (decimals === 2) return { value, style: STYLE.twoDecimals };
    // Anything else must read back exactly as written: "1.5" yes, "1.500" no.
    return String(value) === text ? { value, style: STYLE.general } : undefined;
  }
  // Thousands grouped the Western way (1,234,567.89) or the Indian way (12,34,567.89).
  const grouped = /^-?(?:[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d?(?:,\d{2})+,\d{3})(?:\.(\d+))?$/.exec(text);
  if (grouped) {
    const decimals = grouped[1]?.length ?? 0;
    const digits = text.replace(/[-,.]/g, '');
    if (digits.length > 15 || (decimals !== 0 && decimals !== 2)) return undefined;
    return { value: Number(text.replace(/,/g, '')), style: decimals === 2 ? STYLE.groupedTwoDecimals : STYLE.grouped };
  }
  return undefined;
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/**
 * Sheet names Excel will accept: at most 31 characters, none of []:*?/\,
 * not starting or ending with an apostrophe, not "History", and unique
 * ignoring case. A clash gets " (2)", " (3)", shortened to fit.
 */
export function sheetNames(wanted: readonly string[]): string[] {
  const used = new Set<string>();
  return wanted.map((name, i) => {
    let base = name.replace(/[[\]:*?/\\]/g, ' ').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim();
    if (base === '' || base.toLowerCase() === 'history') base = base === '' ? `Sheet${i + 1}` : `${base} 1`;
    base = cut(base, 31);
    let candidate = base;
    for (let k = 2; used.has(candidate.toLowerCase()); k++) {
      const suffix = ` (${k})`;
      candidate = cut(base, 31 - suffix.length).trimEnd() + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** Shortens to `max` UTF-16 units without splitting a surrogate pair. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return text.slice(0, end);
}

const STYLES =
  `${XML_DECLARATION}<styleSheet xmlns="${SML_NS}">` +
  `<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// =====================================================================
// Reading
// =====================================================================

/** The formats Excel has built in, by id, as far as reading needs them. */
const BUILT_IN: Readonly<Record<number, string>> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'yyyy-mm-dd',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'yyyy-mm-dd h:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mm:ss.0',
  48: '##0.0E+0',
  49: '@',
};

/** Reads an .xlsx into the model. Throws only when the file is not a workbook at all. */
export function fromXlsx(bytes: Uint8Array): Workbook {
  const pkg = new Package(bytes);
  const bookPath = pkg.main('/officeDocument') ?? 'xl/workbook.xml';
  const book = pkg.xml(bookPath);
  if (!book || book.local !== 'workbook') throw new Error("This file doesn't hold an Excel workbook.");
  const rels = pkg.rels(bookPath);
  const partOf = (suffix: string, fallback: string) => [...rels.values()].find((r) => r.type.endsWith(suffix) && !r.external)?.target ?? fallback;
  const shared = sharedStrings(pkg.xml(partOf('/sharedStrings', 'xl/sharedStrings.xml')));
  const formats = cellFormats(pkg.xml(partOf('/styles', 'xl/styles.xml')));
  const date1904 = isTrue(attr(child(book, 'workbookPr'), 'date1904'));

  const sheets: Array<{ name: string; rows: string[][] }> = [];
  for (const sheet of elements(child(book, 'sheets'), 'sheet')) {
    const id = attr(sheet, 'id', 'relationships');
    const rel = id !== undefined ? rels.get(id) : undefined;
    if (!rel || rel.external || !rel.type.endsWith('/worksheet')) continue;
    const xml = pkg.xml(rel.target);
    if (!xml) continue;
    sheets.push({ name: attr(sheet, 'name') ?? `Sheet${sheets.length + 1}`, rows: readSheet(xml, shared, formats, date1904) });
  }
  return { sheets };
}

function sharedStrings(sst: XmlElement | undefined): string[] {
  return elements(sst, 'si').map(richText);
}

/** A string item: plain <t>, or rich-text runs; phonetic guides are left out. */
function richText(si: XmlElement | undefined): string {
  let out = '';
  for (const node of elements(si)) {
    if (node.local === 't') out += textOf(node);
    else if (node.local === 'r') out += textOf(child(node, 't'));
  }
  return out;
}

/** Each cell style's number format code, by style index. */
function cellFormats(styles: XmlElement | undefined): string[] {
  const custom = new Map<number, string>();
  for (const f of elements(child(styles, 'numFmts'), 'numFmt')) custom.set(Number(attr(f, 'numFmtId')), attr(f, 'formatCode') ?? 'General');
  return elements(child(styles, 'cellXfs'), 'xf').map((xf) => {
    const id = Number(attr(xf, 'numFmtId') ?? 0);
    return custom.get(id) ?? BUILT_IN[id] ?? 'General';
  });
}

function readSheet(sheet: XmlElement, shared: readonly string[], formats: readonly string[], date1904: boolean): string[][] {
  const grid = new Map<number, Map<number, string>>();
  // Every cell by place, for formulas saved without their results (see Formulas).
  const placed = new Map<string, XmlElement>();
  const at: Array<[number, number, XmlElement]> = [];
  let rowIndex = -1;
  for (const row of elements(child(sheet, 'sheetData'), 'row')) {
    const r = Number(attr(row, 'r'));
    rowIndex = r >= 1 ? r - 1 : rowIndex + 1;
    if (rowIndex >= MAX_ROWS) break;
    let column = -1;
    for (const c of elements(row, 'c')) {
      const ref = parseRef(attr(c, 'r'));
      column = ref ? ref.column : column + 1;
      if (column >= MAX_COLUMNS) continue;
      placed.set(`${rowIndex},${column}`, c);
      at.push([rowIndex, column, c]);
    }
  }
  const formulas = new Formulas(placed);
  let maxColumn = -1;
  for (const [row, column, c] of at) {
    const text = formulas.uncached(c) !== undefined ? formulas.show(c, row, column, formats, date1904) : cellText(c, shared, formats, date1904);
    if (text === '') continue;
    let cells = grid.get(row);
    if (!cells) grid.set(row, (cells = new Map()));
    cells.set(column, text);
    maxColumn = Math.max(maxColumn, column);
  }
  const lastRow = Math.max(-1, ...grid.keys());
  const rows: string[][] = [];
  // Rows come back padded to the sheet's width, so a table stays a rectangle.
  const width = (lastRow + 1) * (maxColumn + 1) <= 5_000_000 ? maxColumn + 1 : 0;
  for (let r = 0; r <= lastRow; r++) {
    const cells = grid.get(r);
    const last = cells ? Math.max(...cells.keys()) : -1;
    const row: string[] = [];
    for (let c = 0; c < Math.max(width, last + 1); c++) row.push(cells?.get(c) ?? '');
    rows.push(row);
  }
  return rows;
}

/**
 * Formulas saved without their results. Excel, LibreOffice and Google Sheets
 * save each formula's last value beside it, and that is what is shown. Files
 * made by programs (Python's openpyxl, many web reports) often save the
 * formula alone, so a total would print as an empty cell. The common ones are
 * worked out here: arithmetic, and SUM, AVERAGE, MIN, MAX, COUNT, COUNTA,
 * ROUND and ABS over cells and ranges of the same sheet. Anything else (another
 * sheet, a lookup, a condition) stays empty rather than wrong.
 */
class Formulas {
  private readonly memo = new Map<string, number | null>();
  private readonly busy = new Set<string>();

  constructor(private readonly cells: ReadonlyMap<string, XmlElement>) {}

  /** The formula of a cell saved without a value, or undefined. */
  uncached(c: XmlElement): string | undefined {
    const f = child(c, 'f');
    if (!f || textOf(f).trim() === '') return undefined;
    const v = child(c, 'v');
    return v && textOf(v).trim() !== '' ? undefined : textOf(f);
  }

  show(c: XmlElement, row: number, column: number, formats: readonly string[], date1904: boolean): string {
    const n = this.number(row, column);
    return n === null ? '' : formatNumber(n, formats[Number(attr(c, 's') ?? 0)] ?? 'General', date1904);
  }

  /** A cell as a number: its value, its formula's result, 0 when empty; null when it cannot be had. */
  private number(row: number, column: number): number | null {
    const key = `${row},${column}`;
    const known = this.memo.get(key);
    if (known !== undefined) return known;
    const c = this.cells.get(key);
    if (!c) return 0;
    const formula = this.uncached(c);
    if (formula === undefined) {
      const type = attr(c, 't') ?? 'n';
      const raw = textOf(child(c, 'v'));
      if (type === 's' || type === 'str' || type === 'inlineStr' || type === 'e') return null;
      if (type === 'b') return raw === '1' ? 1 : 0;
      const n = raw.trim() === '' ? 0 : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    if (this.busy.has(key) || this.busy.size > 200) return null;
    this.busy.add(key);
    let out: number | null;
    try {
      out = this.evaluate(formula);
    } catch {
      out = null;
    }
    this.busy.delete(key);
    this.memo.set(key, out);
    return out;
  }

  /** Whether a cell holds something COUNTA counts. */
  private present(row: number, column: number): boolean {
    const c = this.cells.get(`${row},${column}`);
    return c !== undefined && (this.uncached(c) !== undefined || textOf(child(c, 'v')).trim() !== '' || child(c, 'is') !== undefined);
  }

  private evaluate(formula: string): number | null {
    const tokens = formula.trim().replace(/^=/, '').match(/\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?%?|[A-Za-z_][A-Za-z0-9_.]*(?=\()|[-+*/^(),]|\S/g) ?? [];
    let i = 0;
    const fail = (): never => {
      throw new Error('unsupported');
    };
    const peek = () => tokens[i];
    const take = () => tokens[i++] ?? fail();
    const range = (token: string): number[][] => {
      const [a, b] = token.split(':');
      const from = parseRef(a);
      const to = parseRef(b ?? a);
      if (!from || !to) return fail();
      const out: number[][] = [];
      for (let r = Math.min(from.row, to.row); r <= Math.max(from.row, to.row); r++)
        for (let k = Math.min(from.column, to.column); k <= Math.max(from.column, to.column); k++) out.push([r, k]);
      if (out.length > 100_000) fail();
      return out;
    };
    const args = (): Array<{ cells?: number[][]; value?: number }> => {
      const list: Array<{ cells?: number[][]; value?: number }> = [];
      if (take() !== '(') fail();
      if (peek() === ')') {
        i++;
        return list;
      }
      for (;;) {
        const token = peek() ?? fail();
        const next = tokens[i + 1];
        if (/^\$?[A-Za-z]{1,3}\$?\d+(:|$)/.test(token) && (next === ',' || next === ')')) {
          i++;
          list.push({ cells: range(token) });
        } else list.push({ value: expression() });
        const sep = take();
        if (sep === ')') return list;
        if (sep !== ',') fail();
      }
    };
    const numbersIn = (list: ReturnType<typeof args>): number[] =>
      list.flatMap((a) => (a.cells ? a.cells.map(([r, k]) => this.numberOrSkip(r ?? 0, k ?? 0)).filter((n): n is number => n !== null) : [a.value ?? 0]));
    const primary = (): number => {
      const token = take();
      if (token === '(') {
        const v = expression();
        if (take() !== ')') fail();
        return v;
      }
      if (token === '-') return -primary();
      if (token === '+') return primary();
      if (/^\d/.test(token)) return token.endsWith('%') ? Number(token.slice(0, -1)) / 100 : Number(token);
      if (/^\$?[A-Za-z]{1,3}\$?\d+$/.test(token)) {
        const ref = parseRef(token) ?? fail();
        return this.number(ref.row, ref.column) ?? fail();
      }
      const name = token.toUpperCase();
      const list = args();
      const nums = numbersIn(list);
      switch (name) {
        case 'SUM':
          return nums.reduce((a, b) => a + b, 0);
        case 'AVERAGE':
          return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : fail();
        case 'MIN':
          return nums.length > 0 ? Math.min(...nums) : 0;
        case 'MAX':
          return nums.length > 0 ? Math.max(...nums) : 0;
        case 'COUNT':
          return nums.length;
        case 'COUNTA':
          return list.reduce((n, a) => n + (a.cells ? a.cells.filter(([r, k]) => this.present(r ?? 0, k ?? 0)).length : 1), 0);
        case 'ABS':
          return Math.abs(nums[0] ?? fail());
        case 'ROUND': {
          const digits = nums[1] ?? 0;
          const f = 10 ** digits;
          return Math.round((nums[0] ?? fail()) * f) / f;
        }
        default:
          return fail();
      }
    };
    const power = (): number => {
      let v = primary();
      while (peek() === '^') {
        i++;
        v = v ** primary();
      }
      return v;
    };
    const term = (): number => {
      let v = power();
      for (let op = peek(); op === '*' || op === '/'; op = peek()) {
        i++;
        const r = power();
        if (op === '/' && r === 0) fail();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    };
    const expression = (): number => {
      let v = term();
      for (let op = peek(); op === '+' || op === '-'; op = peek()) {
        i++;
        v = op === '+' ? v + term() : v - term();
      }
      return v;
    };
    const result = expression();
    if (i !== tokens.length || !Number.isFinite(result)) fail();
    return result;
  }

  /** In a range, text and errors are skipped (as SUM skips them), but a formula that cannot be worked out spoils the result. */
  private numberOrSkip(row: number, column: number): number | null {
    const c = this.cells.get(`${row},${column}`);
    if (!c) return null;
    if (this.uncached(c) !== undefined) {
      const n = this.number(row, column);
      if (n === null) throw new Error('unsupported');
      return n;
    }
    const type = attr(c, 't') ?? 'n';
    if (type !== 'n') return null;
    const raw = textOf(child(c, 'v')).trim();
    return raw === '' ? null : Number(raw);
  }
}

function cellText(c: XmlElement, shared: readonly string[], formats: readonly string[], date1904: boolean): string {
  const type = attr(c, 't') ?? 'n';
  const v = child(c, 'v');
  const value = v ? textOf(v) : '';
  switch (type) {
    case 's':
      return shared[Number(value)] ?? '';
    case 'inlineStr':
      return richText(child(c, 'is'));
    case 'str':
    case 'e':
    case 'd':
      return value;
    case 'b':
      return value === '1' || value.toLowerCase() === 'true' ? 'TRUE' : value === '' ? '' : 'FALSE';
    default: {
      if (value.trim() === '') return '';
      const n = Number(value);
      if (!Number.isFinite(n)) return value;
      return formatNumber(n, formats[Number(attr(c, 's') ?? 0)] ?? 'General', date1904);
    }
  }
}

/** "C12" → column 2, row 11 (zero-based). */
function parseRef(ref: string | undefined): { column: number; row: number } | undefined {
  const m = ref ? /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref) : null;
  if (!m) return undefined;
  let column = 0;
  for (const ch of (m[1] ?? '').toUpperCase()) column = column * 26 + (ch.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(m[2]) - 1 };
}

function isTrue(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/**
 * A number as its format shows it, near enough: decimals, thousands
 * separators, percentages and dates. Colours, conditions, fractions and
 * currency decorations are not reproduced; the digits are what matter.
 */
export function formatNumber(n: number, format: string, date1904 = false): string {
  const section = firstSection(format);
  const bare = section.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, (m) => (/^\[h+\]$|^\[m+\]$|^\[s+\]$/i.test(m) ? m : ''));
  if (/^(general)?$/i.test(bare.trim()) || bare.trim() === '@') return general(n);
  if (/[dmyhs]/i.test(bare.replace(/E[+-]/gi, ''))) {
    // Quoted text and escaped characters are what the date is written with ("dd/mm/yyyy", "d\-mmm\-yy").
    const pattern = section.replace(/"([^"]*)"/g, (_, text: string) => text.replace(/[a-z]/gi, '\\$&')).replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/gi, '');
    return formatDate(n, pattern, date1904);
  }
  const percent = bare.includes('%');
  const value = percent ? n * 100 : n;
  const dot = bare.indexOf('.');
  const decimals = dot === -1 ? 0 : (bare.slice(dot + 1).match(/[0#?]/g) ?? []).length;
  const grouping = /[0#?],[0#?]/.test(bare);
  if (/E[+-]/i.test(bare)) return value.toExponential(decimals).replace('e', 'E');
  let text = Math.abs(value).toFixed(decimals);
  if (grouping) {
    const [whole = '', fraction] = text.split('.');
    text = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction !== undefined ? `.${fraction}` : '');
  }
  const negative = value < 0 && Number(text.replace(/,/g, '')) !== 0;
  return `${negative ? '-' : ''}${text}${percent ? '%' : ''}`;
}

function firstSection(format: string): string {
  let quoted = false;
  for (let i = 0; i < format.length; i++) {
    const ch = format[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === '\\') i++;
    else if (ch === ';' && !quoted) return format.slice(0, i);
  }
  return format;
}

/** What Excel's General format shows, without its column-width rounding. */
function general(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number.parseFloat(n.toPrecision(15)));
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * A serial date as its format writes it: "dd/mm/yyyy" gives 09/04/2026,
 * "d-mmm-yy" gives 9-Apr-26, the built-in short date gives 2026-04-09.
 * An "m" next to hours or seconds is minutes, as in Excel.
 */
function formatDate(serial: number, format: string, date1904: boolean): string {
  // Serial 60 is 29 February 1900, a day that never was; Excel keeps it for Lotus's sake.
  const days = date1904 ? serial + 1462 : serial < 60 ? serial + 1 : serial;
  const date = new Date(Math.round((days - 25569) * 86_400_000));
  if (Number.isNaN(date.getTime())) return general(serial);
  const tokens = format.match(/\\.|yyyy|yy|y|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p|\[h+\]|\[m+\]|\[s+\]|\.0+|./gi) ?? [];
  const twelve = tokens.some((t) => /^(am\/pm|a\/p)$/i.test(t));
  const kind = (t: string | undefined) => (t === undefined ? '' : /^(h+|\[h+\])$/i.test(t) ? 'h' : /^(s+|\[s+\])$/i.test(t) ? 's' : /^m{1,2}$/i.test(t) ? 'm' : /^[dy]+$/i.test(t) ? 'date' : '');
  const pad = (v: number) => String(v).padStart(2, '0');
  const hours = date.getUTCHours();
  let out = '';
  tokens.forEach((token, i) => {
    const t = token.toLowerCase();
    // Minutes when the nearest field before is hours, or the nearest after is seconds.
    const before = tokens.slice(0, i).reverse().map(kind).find((k) => k !== '');
    const after = tokens.slice(i + 1).map(kind).find((k) => k !== '');
    if (t.startsWith('\\')) out += token.slice(1);
    else if (t === 'yyyy') out += String(date.getUTCFullYear());
    else if (t === 'yy' || t === 'y') out += pad(date.getUTCFullYear() % 100);
    else if ((t === 'm' || t === 'mm') && (before === 'h' || after === 's')) out += t === 'mm' ? pad(date.getUTCMinutes()) : String(date.getUTCMinutes());
    else if (t === 'mmmmm') out += (MONTH_NAMES[date.getUTCMonth()] ?? '').charAt(0);
    else if (t === 'mmmm') out += MONTH_NAMES[date.getUTCMonth()] ?? '';
    else if (t === 'mmm') out += (MONTH_NAMES[date.getUTCMonth()] ?? '').slice(0, 3);
    else if (t === 'mm') out += pad(date.getUTCMonth() + 1);
    else if (t === 'm') out += String(date.getUTCMonth() + 1);
    else if (t === 'dddd') out += DAY_NAMES[date.getUTCDay()] ?? '';
    else if (t === 'ddd') out += (DAY_NAMES[date.getUTCDay()] ?? '').slice(0, 3);
    else if (t === 'dd') out += pad(date.getUTCDate());
    else if (t === 'd') out += String(date.getUTCDate());
    else if (/^\[h+\]$/.test(t)) out += String(Math.floor(serial * 24));
    else if (/^\[m+\]$/.test(t)) out += String(Math.floor(serial * 1440));
    else if (/^\[s+\]$/.test(t)) out += String(Math.floor(serial * 86400));
    else if (t === 'hh' || t === 'h') {
      const h = twelve ? hours % 12 || 12 : hours;
      out += t === 'hh' ? pad(h) : String(h);
    } else if (t === 'ss') out += pad(date.getUTCSeconds());
    else if (t === 's') out += String(date.getUTCSeconds());
    else if (t === 'am/pm') out += hours < 12 ? 'AM' : 'PM';
    else if (t === 'a/p') out += hours < 12 ? 'A' : 'P';
    else if (t.startsWith('.0')) out += (date.getUTCMilliseconds() / 1000).toFixed(t.length - 1).slice(1);
    else out += token;
  });
  return out.trim();
}
