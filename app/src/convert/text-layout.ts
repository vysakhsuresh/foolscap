/**
 * From what a PDF reader sees to what Word and Excel hold.
 *
 * A PDF does not contain paragraphs, headings, lists or tables. It contains
 * pieces of text, each painted at a position in a font at a size. Everything
 * structural has to be inferred back from geometry, the way a person reading
 * the page would: words on the same baseline are a line; lines close together
 * at the same size are a paragraph; a line in a much bigger size is a heading;
 * a line starting with "•" is a list item; text that stays in the same
 * vertical bands row after row is a table; two blocks of text side by side
 * with a clear gap between them are columns, read one after the other.
 *
 * None of these rules is ever certain, so each one is a cautious heuristic
 * whose failure is mild. A missed heading is still a paragraph; a missed
 * table is still lines of text in reading order. The worst outcome, text in
 * the wrong order, is what the column and table rules are most careful about.
 *
 * Coordinates are PDF points with the origin at the top left of the page and
 * y growing downward (the caller flips pdf.js's bottom-up y once).
 */
import { familyOf, type Family } from './fonts';
import type { Block, FlowDocument, Paragraph, Run, Table, TableCell, Workbook } from './model';

/** One piece of text as the PDF reader reports it. */
export interface TextItem {
  readonly str: string;
  /** Left end of the baseline, in points from the page's left edge. */
  readonly x: number;
  /** The baseline, in points from the page's top edge. */
  readonly y: number;
  readonly width: number;
  /** Roughly the font size. */
  readonly height: number;
  readonly fontName: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly family?: 'sans' | 'serif' | 'mono';
}

/** A picture on the page; x and y are its top-left corner, in the same top-down points as the text. */
export interface PageImage {
  readonly bytes: Uint8Array;
  readonly format: 'png' | 'jpeg';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PageText {
  readonly width: number;
  readonly height: number;
  readonly items: readonly TextItem[];
  readonly images?: readonly PageImage[];
}

// ---------------------------------------------------------------------
// Tuning. Every distance is a multiple of the font size, so the same rules
// work for a 6pt footnote and a 30pt title.
// ---------------------------------------------------------------------

/** An amount, a count or a date written in figures. */
const FIGURE = /^[-+(]?[\d.,/:]*\d[\d.,/:]*[)%]?(?:\s?(?:Cr|Dr|CR|DR))?$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Pieces whose baselines differ by less than this share a line. */
const SAME_BASELINE = 0.4;
/** A gap wider than this inside a line separates two segments (table cells, columns). */
const SEGMENT_GAP = 1.0;
/** A gap wider than this between two pieces is a space between words. */
const WORD_GAP = 0.15;
/** A line gap this many times the usual spacing starts a new paragraph. */
const PARAGRAPH_GAP = 1.3;
/** A paragraph this much bigger than the body text is a heading. */
const HEADING_RATIO = 1.15;

interface Piece {
  readonly text: string;
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
  readonly size: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly family: Family | undefined;
}

/** Pieces on one baseline with no wide gap between them. */
interface Segment {
  readonly pieces: Piece[];
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
  readonly size: number;
  /** Which baseline cluster it came from: segments that share one are on the same visual line. */
  readonly cluster: number;
  readonly text: string;
}

/** The segments of one baseline within one column. */
interface Line {
  readonly segs: Segment[];
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
  readonly size: number;
}

interface Img {
  readonly image: PageImage;
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
}

type Element = { readonly kind: 'line'; readonly line: Line; readonly top: number } | { readonly kind: 'image'; readonly img: Img; readonly top: number };

/** A region read top to bottom: the whole page, or one column of a band. */
interface Chunk {
  readonly left: number;
  readonly right: number;
  readonly elements: Element[];
}

interface FoundTable {
  readonly columns: ReadonlyArray<{ x0: number; x1: number }>;
  /** row → column → the segments in that cell, in reading order. */
  readonly rows: Segment[][][];
}

/** What a page holds, in reading order. */
type Laid =
  | { readonly kind: 'line'; readonly line: Line; readonly chunk: ChunkInfo }
  | { readonly kind: 'table'; readonly table: FoundTable }
  | { readonly kind: 'image'; readonly image: PageImage };

interface ChunkInfo {
  readonly left: number;
  readonly right: number;
  /** Where the text itself ends on the right, which can be well short of `right` on a narrow page. */
  readonly textRight: number;
  /** The usual distance between baselines here. */
  readonly spacing: number;
}

// =====================================================================
// Public API
// =====================================================================

/** Rebuilds a flowing document from the text on each page. */
export function toFlow(pages: readonly PageText[], opts: { title?: string } = {}): FlowDocument {
  const bounds = documentBounds(pages);
  const laid = pages.map((page) => layoutPage(page, bounds));
  const body = bodySize(laid.flat());
  const drafts: Draft[] = [];
  laid.forEach((items, i) => {
    if (i > 0) drafts.push({ kind: 'page-break' });
    drafts.push(...draftsOf(items));
  });
  const blocks = finish(drafts, body);
  const page = pageSize(pages);
  const title = opts.title?.trim();
  return { ...(title ? { title } : {}), ...(page ? { page } : {}), blocks };
}

/**
 * Finds the tables on each page and returns them as sheets: one sheet called
 * "Table" when the same columns run on from page to page (a bank statement),
 * otherwise one sheet per page that has a table ("Page 3"). A document with
 * no tables at all gets its lines, one per row, in column A.
 */
export function toWorkbook(pages: readonly PageText[]): Workbook {
  const bounds = documentBounds(pages);
  const perPage = pages.map((page, index) => {
    const items = layoutPage(page, bounds);
    const tables = items.flatMap((item) => (item.kind === 'table' ? [item.table] : []));
    const lines = items.flatMap((item) => (item.kind === 'line' ? [lineText(item.line)] : item.kind === 'table' ? tableLines(item.table) : []));
    return { index, tables, lines };
  });

  const withTables = perPage.filter((p) => p.tables.length > 0);
  if (withTables.length === 0) {
    const rows = perPage.flatMap((p) => p.lines.filter((l) => l.trim() !== '').map((l) => [l]));
    return { sheets: [{ name: 'Text', rows }] };
  }

  const first = withTables[0]?.tables[0];
  if (first && withTables.length > 1 && withTables.every((p) => p.tables.length === 1 && sameColumns(p.tables[0], first))) {
    const header = tableRows(first)[0];
    const rows: string[][] = [];
    withTables.forEach((p, i) => {
      const t = p.tables[0];
      if (!t) return;
      const tr = tableRows(t);
      // The header repeated at the top of each page is kept once.
      const start = i > 0 && header && sameRow(tr[0], header) ? 1 : 0;
      const body = tr.slice(start);
      // A row the page break cut in two: its second half is joined back to its first.
      const head = body[0];
      const last = rows[rows.length - 1];
      if (head && last && continuesRow(head, rows)) {
        rows[rows.length - 1] = last.map((cell, k) => [cell, head[k] ?? ''].filter((c) => c !== '').join(' '));
        body.shift();
      }
      rows.push(...body);
    });
    return { sheets: [{ name: 'Table', rows }] };
  }

  return {
    sheets: withTables.map((p) => {
      const rows: string[][] = [];
      p.tables.forEach((t, i) => {
        if (i > 0) rows.push([]);
        rows.push(...tableRows(t));
      });
      return { name: `Page ${p.index + 1}`, rows };
    }),
  };
}

// =====================================================================
// Page analysis
// =====================================================================

/**
 * Where text sits across the whole document. A page with one short line on
 * it (the last page of a letter) says nothing about its own margins, so its
 * alignment is judged against the margins the other pages show.
 */
function documentBounds(pages: readonly PageText[]): { left: number; right: number } | undefined {
  let left = Infinity;
  let right = -Infinity;
  for (const page of pages) {
    for (const item of page.items) {
      if (item.str.trim() === '' || !Number.isFinite(item.x) || !Number.isFinite(item.width)) continue;
      left = Math.min(left, item.x);
      right = Math.max(right, item.x + Math.max(0, item.width));
    }
  }
  return Number.isFinite(left) && Number.isFinite(right) ? { left, right } : undefined;
}

function layoutPage(page: PageText, bounds: { left: number; right: number } | undefined): Laid[] {
  const segments = segmentsOf(page.items);
  const images: Img[] = (page.images ?? [])
    .filter((im) => im.width > 0 && im.height > 0)
    .map((image) => ({ image, x0: image.x, x1: image.x + image.width, top: image.y, bottom: image.y + image.height }));
  if (segments.length === 0 && images.length === 0) return [];

  let left = Math.min(...segments.map((s) => s.x0), ...images.map((im) => im.x0));
  let right = Math.max(...segments.map((s) => s.x1), ...images.map((im) => im.x1));
  if (bounds && bounds.right <= page.width) {
    left = Math.min(left, bounds.left);
    right = Math.max(right, bounds.right);
  }
  // When the text is narrow (a title page, a short letter), measure alignment against the
  // page itself, assuming even margins; otherwise a centred line looks left-aligned.
  if (right - left < page.width * 0.7) {
    const margin = Math.max(0, Math.min(left, page.width - right));
    left = margin;
    right = page.width - margin;
  }

  const out: Laid[] = [];
  for (const chunk of arrange(segments, images, left, right, 0)) {
    const textRight = Math.max(chunk.left, ...chunk.elements.map((e) => (e.kind === 'line' ? e.line.x1 : e.img.x1)));
    const info: ChunkInfo = { left: chunk.left, right: chunk.right, textRight, spacing: lineSpacing(chunk) };
    const els = chunk.elements;
    let i = 0;
    let floor = 0;
    while (i < els.length) {
      const el = els[i];
      if (!el) break;
      if (el.kind === 'image') {
        out.push({ kind: 'image', image: el.img.image });
        i++;
        continue;
      }
      const found = el.line.segs.length >= 2 ? tableAt(els, i, info, floor) : undefined;
      if (found) {
        // Lines just above that turned out to be the table's first row come back out of the text.
        out.splice(out.length - (i - found.from), i - found.from);
        out.push({ kind: 'table', table: found.table });
        i = floor = found.next;
        continue;
      }
      out.push({ kind: 'line', line: el.line, chunk: info });
      i++;
    }
  }
  return out;
}

/** Items to pieces, pieces to baseline clusters, clusters to segments. */
function segmentsOf(items: readonly TextItem[]): Segment[] {
  const pieces: Piece[] = [];
  for (const item of items) {
    // Broken font encodings leave control characters in the text; they are never meant to be seen.
    const text = item.str.replace(CONTROL, '');
    if (text.trim() === '' || ![item.x, item.y, item.width].every(Number.isFinite)) continue;
    const size = item.height > 0 && Number.isFinite(item.height) ? item.height : 10;
    const fromName = familyOf(item.fontName);
    pieces.push({
      text,
      x0: item.x,
      x1: item.x + Math.max(0, item.width),
      y: item.y,
      size,
      bold: item.bold ?? /bold|black|heavy|semibold|demi/i.test(item.fontName),
      italic: item.italic ?? /italic|oblique/i.test(item.fontName),
      family: item.family ?? fromName,
    });
  }
  pieces.sort((a, b) => a.y - b.y || a.x0 - b.x0);

  const clusters: Piece[][] = [];
  let anchor: Piece | undefined;
  for (const p of pieces) {
    const last = clusters[clusters.length - 1];
    if (last && anchor && Math.abs(p.y - anchor.y) <= SAME_BASELINE * Math.min(p.size, anchor.size)) last.push(p);
    else {
      clusters.push([p]);
      anchor = p;
    }
  }

  const segments: Segment[] = [];
  clusters.forEach((cluster, index) => {
    cluster.sort((a, b) => a.x0 - b.x0);
    let current: Piece[] = [];
    const flush = () => {
      if (current.length > 0) segments.push(makeSegment(current, index));
      current = [];
    };
    for (const p of cluster) {
      const prev = current[current.length - 1];
      // Some PDFs fake bold by painting the same text twice, a hair apart: keep one.
      if (prev && prev.text === p.text && Math.abs(prev.x0 - p.x0) < 1) continue;
      const gap = prev ? p.x0 - prev.x1 : 0;
      // Two figures side by side are two cells even when set closer than a word gap apart would allow for text.
      if (prev && (gap > SEGMENT_GAP * Math.max(prev.size, p.size) || (gap > 0.4 * p.size && FIGURE.test(prev.text.trim()) && FIGURE.test(p.text.trim())))) flush();
      current.push(p);
    }
    flush();
  });
  return segments;
}

function makeSegment(pieces: Piece[], cluster: number): Segment {
  const x0 = Math.min(...pieces.map((p) => p.x0));
  const x1 = Math.max(...pieces.map((p) => p.x1));
  const y = pieces.reduce((sum, p) => sum + p.y, 0) / pieces.length;
  return { pieces, x0, x1, y, size: dominantSize(pieces), cluster, text: runsText(runsOf(pieces)) };
}

/** The size most of the characters are set in. */
function dominantSize(pieces: readonly Piece[]): number {
  const weight = new Map<number, number>();
  for (const p of pieces) {
    const key = Math.round(p.size * 2) / 2;
    weight.set(key, (weight.get(key) ?? 0) + p.text.trim().length);
  }
  let best = pieces[0]?.size ?? 10;
  let most = -1;
  for (const [size, w] of weight) {
    if (w > most) {
      best = size;
      most = w;
    }
  }
  return best;
}

// ---------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------

/**
 * Splits a region into the order it is read in. If the text has a gutter, a
 * vertical strip of space that runs down the region with prose filling both
 * sides of it, the region is cut into bands at anything that crosses the
 * gutter (a title across both columns, a wide picture), and within each band
 * the left column is read before the right. Each side may have a gutter of
 * its own, which is how three columns are read.
 */
function arrange(segs: readonly Segment[], imgs: readonly Img[], left: number, right: number, depth: number): Chunk[] {
  const gutter = depth < 3 ? findGutter(segs, left, right) : undefined;
  if (!gutter) return [{ left, right, elements: elementsOf(segs, imgs) }];
  const [g0, g1] = gutter;
  const middle = (g0 + g1) / 2;
  const crosses = (x0: number, x1: number) => x0 < g1 - 1 && x1 > g0 + 1;
  const spanning = new Set(segs.filter((s) => crosses(s.x0, s.x1)).map((s) => s.cluster));

  type Thing = { readonly top: number; readonly seg?: Segment; readonly img?: Img };
  const things: Thing[] = [...segs.map((seg) => ({ top: seg.y - seg.size, seg })), ...imgs.map((img) => ({ top: img.top, img }))];
  things.sort((a, b) => a.top - b.top);

  const chunks: Chunk[] = [];
  let band = { ls: [] as Segment[], li: [] as Img[], rs: [] as Segment[], ri: [] as Img[] };
  let span = { s: [] as Segment[], i: [] as Img[] };
  const flushBand = () => {
    if (band.ls.length + band.li.length > 0) chunks.push(...arrange(band.ls, band.li, left, g0, depth + 1));
    if (band.rs.length + band.ri.length > 0) chunks.push(...arrange(band.rs, band.ri, g1, right, depth + 1));
    band = { ls: [], li: [], rs: [], ri: [] };
  };
  const flushSpan = () => {
    if (span.s.length + span.i.length > 0) chunks.push({ left, right, elements: elementsOf(span.s, span.i) });
    span = { s: [], i: [] };
  };
  for (const t of things) {
    const isSpanning = t.seg ? spanning.has(t.seg.cluster) : t.img ? crosses(t.img.x0, t.img.x1) : false;
    if (isSpanning) {
      flushBand();
      if (t.seg) span.s.push(t.seg);
      if (t.img) span.i.push(t.img);
      continue;
    }
    flushSpan();
    const x = t.seg ? (t.seg.x0 + t.seg.x1) / 2 : t.img ? (t.img.x0 + t.img.x1) / 2 : 0;
    if (t.seg) (x < middle ? band.ls : band.rs).push(t.seg);
    if (t.img) (x < middle ? band.li : band.ri).push(t.img);
  }
  flushBand();
  flushSpan();
  return chunks;
}

/** The widest gutter between two columns of prose, or undefined when the region is one column. */
function findGutter(segs: readonly Segment[], left: number, right: number): [number, number] | undefined {
  const width = right - left;
  if (segs.length < 6 || width < 100) return undefined;
  const bins = Math.ceil(width) + 2;
  const diff = new Int32Array(bins + 1);
  for (const s of segs) {
    const a = clamp(Math.floor(s.x0 - left), 0, bins - 1);
    const b = clamp(Math.ceil(s.x1 - left), 0, bins - 1);
    diff[a] = (diff[a] ?? 0) + 1;
    diff[b + 1] = (diff[b + 1] ?? 0) - 1;
  }
  const clusterCount = new Set(segs.map((s) => s.cluster)).size;
  // A few lines may cross the gutter (a heading over both columns) without hiding it.
  const allowance = Math.floor(clusterCount * 0.08);
  const sizes = segs.map((s) => s.size).sort((a, b) => a - b);
  const minWidth = Math.max(6, 0.8 * (sizes[Math.floor(sizes.length / 2)] ?? 10));

  let best: [number, number] | undefined;
  let cover = 0;
  let runStart = -1;
  const from = Math.floor(width * 0.2);
  const to = Math.ceil(width * 0.8);
  for (let x = 0; x <= to; x++) {
    cover += diff[x] ?? 0;
    if (x < from) continue;
    const open = cover <= allowance;
    if (open && runStart === -1) runStart = x;
    if ((!open || x === to) && runStart !== -1) {
      const end = open ? x : x - 1;
      if (end - runStart + 1 >= minWidth && (!best || end - runStart > best[1] - best[0])) best = [left + runStart, left + end];
      runStart = -1;
    }
  }
  if (!best) return undefined;
  const [g0, g1] = best;
  const leftSide = segs.filter((s) => s.x1 <= g0 + 1);
  const rightSide = segs.filter((s) => s.x0 >= g1 - 1);
  if (!isProse(leftSide, left, g0) || !isProse(rightSide, g1, right)) return undefined;
  return best;
}

/**
 * Prose fills its column: most lines run nearly the full width, and they
 * hold words, not figures. Table cells do neither, which is what keeps a
 * table from being mistaken for two columns of text.
 */
function isProse(side: readonly Segment[], left: number, right: number): boolean {
  if (side.length < 3) return false;
  const width = right - left;
  const widths = side.map((s) => s.x1 - s.x0).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)] ?? 0;
  const chars = side.reduce((n, s) => n + s.text.length, 0) / side.length;
  return median >= 0.55 * width && chars >= 12;
}

/** Segments grouped into lines by baseline, with the pictures, top to bottom. */
function elementsOf(segs: readonly Segment[], imgs: readonly Img[]): Element[] {
  const byCluster = new Map<number, Segment[]>();
  for (const s of segs) {
    const list = byCluster.get(s.cluster);
    if (list) list.push(s);
    else byCluster.set(s.cluster, [s]);
  }
  const elements: Element[] = [];
  for (const list of byCluster.values()) {
    list.sort((a, b) => a.x0 - b.x0);
    const line = makeLine(mergeMarker(list));
    elements.push({ kind: 'line', line, top: line.y - line.size });
  }
  for (const img of imgs) elements.push({ kind: 'image', img, top: img.top });
  elements.sort((a, b) => a.top - b.top);
  return elements;
}

function makeLine(segs: Segment[]): Line {
  const y = segs.reduce((sum, s) => sum + s.y, 0) / segs.length;
  return {
    segs,
    x0: Math.min(...segs.map((s) => s.x0)),
    x1: Math.max(...segs.map((s) => s.x1)),
    y,
    size: dominantSize(segs.flatMap((s) => s.pieces)),
  };
}

/**
 * A bullet or number set apart from its text by a tab stop arrives as a
 * segment of its own; joined back to the text, it is a list item rather than
 * the first column of a two-column table.
 */
function mergeMarker(segs: Segment[]): Segment[] {
  const first = segs[0];
  const second = segs[1];
  if (!first || !second || !MARKER_ONLY.test(first.text.trim())) return segs;
  if (second.x0 - first.x1 > 4 * first.size) return segs;
  const merged = makeSegment([...first.pieces, ...second.pieces], first.cluster);
  return [merged, ...segs.slice(2)];
}

/** The usual distance between consecutive baselines in a region. */
function lineSpacing(chunk: Chunk): number {
  const lines = chunk.elements.flatMap((e) => (e.kind === 'line' ? [e.line] : []));
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    if (!a || !b) continue;
    const gap = b.y - a.y;
    if (gap > 0.5 * b.size && gap < 3 * b.size) gaps.push(gap);
  }
  if (gaps.length === 0) return 1.2 * (lines[0]?.size ?? 10);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? 12;
}

// ---------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------

/**
 * A table starting at element `start`, if there is one: consecutive lines
 * that split into cells at the same horizontal positions.
 *
 * Rows are usually one line each, and a line with a single filled cell (a
 * description that wrapped) joins the row above it. When the gaps between
 * lines show that rows are taller than lines (padded cells, or text centred
 * vertically in its cell), the lines are grouped by those gaps instead.
 */
function tableAt(els: readonly Element[], start: number, chunk: ChunkInfo, floor: number): { table: FoundTable; from: number; next: number } | undefined {
  const first = els[start];
  if (first?.kind !== 'line') return undefined;
  const width = chunk.right - chunk.left;
  // A first guess at the columns from every nearby line with several cells, then the run
  // again, keeping only lines that are short or part cleanly into those columns.
  const collect = (accepts: (line: Line) => boolean): Line[] => {
    const run: Line[] = [first.line];
    for (let j = start + 1; j < els.length; j++) {
      const el = els[j];
      const prev = run[run.length - 1];
      if (el?.kind !== 'line' || !prev) break;
      const gap = el.line.y - prev.y;
      if (gap <= 0 || gap > Math.max(3 * chunk.spacing, 3 * el.line.size) || !accepts(el.line)) break;
      run.push(el.line);
    }
    return run;
  };
  const plain = collect(() => true);
  const plainMulti = plain.filter((l) => l.segs.length >= 2);
  if (plainMulti.length < 2) return undefined;
  const guess = clusterColumns(plainMulti);
  if (guess.length < 2) return undefined;
  const run = collect((line) => line.segs.length >= 2 || line.x1 - line.x0 < 0.6 * width || cellsOf(line, guess) !== undefined);
  // Every line votes on the columns, so a date that only ever sits on a line of its own still gets one.
  const columns = clusterColumns(run);
  if (columns.length < 2) return undefined;

  // A row can begin with a line holding one cell (a date set above the rest of its row).
  let from = start;
  while (from - 1 >= floor) {
    const above = els[from - 1];
    const below = els[from];
    if (above?.kind !== 'line' || below?.kind !== 'line' || above.line.segs.length !== 1) break;
    if (below.line.y - above.line.y > 1.5 * above.line.size || !cellsOf(above.line, columns)) break;
    from--;
  }
  const before = els.slice(from, start).flatMap((e) => (e.kind === 'line' ? [e.line] : []));

  const fitted: Fitted[] = [];
  for (const line of [...before, ...run]) {
    const cells = cellsOf(line, columns);
    if (!cells) break;
    fitted.push({ line, cells });
  }
  // Single cells after the last real row are the text below the table, unless they sit as close as a wrapped line.
  while (fitted.length > 0) {
    const last = fitted[fitted.length - 1];
    const before = fitted[fitted.length - 2];
    if (!last || filled(last.cells) >= 2) break;
    if (before && last.line.y - before.line.y <= 1.3 * last.line.size) break;
    fitted.pop();
  }
  const rows = groupRows(fitted);
  if (rows.filter((r) => filled(r) >= 2).length < 2) return undefined;
  return { table: { columns, rows }, from, next: from + fitted.length };
}

interface Fitted {
  readonly line: Line;
  readonly cells: Segment[][];
}

function filled(cells: readonly Segment[][]): number {
  return cells.filter((c) => c.length > 0).length;
}

function groupRows(fitted: readonly Fitted[]): Segment[][][] {
  const gaps: number[] = [];
  for (let i = 1; i < fitted.length; i++) gaps.push((fitted[i]?.line.y ?? 0) - (fitted[i - 1]?.line.y ?? 0));
  const minGap = Math.min(...gaps);
  // Bands of lines separated by the bigger gaps. They are rows only if no band holds two full rows.
  const bands: Fitted[][] = [];
  fitted.forEach((f, i) => {
    const gap = i > 0 ? (gaps[i - 1] ?? 0) : Infinity;
    if (gap > 1.3 * minGap || bands.length === 0) bands.push([f]);
    else bands[bands.length - 1]?.push(f);
  });
  // Real multi-line rows share an anchor: a column (a balance, an amount) filled on exactly one
  // line of every band, except that a row cut by the page edge may lack it.
  const columnCount = fitted[0]?.cells.length ?? 0;
  const anchored = Array.from({ length: columnCount }, (_, k) => k).some((k) =>
    bands.every((b, i) => {
      const n = b.filter((f) => (f.cells[k]?.length ?? 0) > 0).length;
      return n === 1 || (n === 0 && (i === 0 || i === bands.length - 1));
    }),
  );
  const banded = bands.length >= 3 && bands.some((b) => b.length > 1) && bands.every((b) => b.length <= 6) && anchored;
  if (banded) return bands.map((band) => mergeCells(band.map((f) => f.cells)));

  const rows: Segment[][][] = [];
  let lastY = 0;
  for (const f of fitted) {
    const above = rows[rows.length - 1];
    if (filled(f.cells) === 1 && above && f.line.y - lastY <= 1.8 * f.line.size) {
      // A wrapped cell: the rest of the row is empty, so it continues the row above.
      f.cells.forEach((c, k) => above[k]?.push(...c));
    } else rows.push(f.cells.map((c) => [...c]));
    lastY = f.line.y;
  }
  return rows;
}

function mergeCells(lines: ReadonlyArray<readonly Segment[][]>): Segment[][] {
  const out: Segment[][] = (lines[0] ?? []).map(() => []);
  for (const cells of lines) cells.forEach((c, k) => out[k]?.push(...c));
  return out;
}

interface Column {
  x0: number;
  x1: number;
}

/**
 * Columns from the cells' extents across rows. Cells that overlap are one
 * column, so left-aligned text and right-aligned figures both land right.
 * Then a column is split again where only a few cells cross a dip in
 * coverage between two busier parts: that is a header like "Withdrawal
 * Deposit" written close enough together to bridge two columns.
 */
function clusterColumns(lines: readonly Line[]): Column[] {
  const segs = lines.flatMap((l) => l.segs);
  const spans = segs.map((s) => ({ x0: s.x0, x1: s.x1 })).sort((a, b) => a.x0 - b.x0);
  const union: Column[] = [];
  for (const s of spans) {
    const last = union[union.length - 1];
    if (last && s.x0 < last.x1 - 0.5) last.x1 = Math.max(last.x1, s.x1);
    else union.push({ ...s });
  }
  const threshold = Math.max(1, Math.floor(lines.length * 0.15));
  const merged = union.flatMap((col) => splitAtDips(col, segs, threshold, 0));

  // A column used by one row only, next to one it never shares a row with, is a header set
  // differently from its figures ("Amount" left-aligned over right-aligned numbers): one column.
  // Two busy columns that never share a row (withdrawals and deposits) stay two.
  const occupied = (col: Column) => lines.map((l) => l.segs.some((s) => overlap(s, col) > 0));
  const size = lines[0]?.size ?? 10;
  let k = 0;
  while (k < merged.length - 1) {
    const a = merged[k];
    const b = merged[k + 1];
    if (!a || !b) break;
    const oa = occupied(a);
    const ob = occupied(b);
    const lonely = oa.filter(Boolean).length <= 1 || ob.filter(Boolean).length <= 1;
    if (lonely && !oa.some((v, i) => v && ob[i]) && b.x0 - a.x1 < 3 * size) merged.splice(k, 2, { x0: a.x0, x1: Math.max(a.x1, b.x1) });
    else k++;
  }
  return merged;
}

function splitAtDips(col: Column, segs: readonly Segment[], threshold: number, depth: number): Column[] {
  const width = Math.ceil(col.x1 - col.x0);
  if (depth > 8 || width < 6) return [col];
  const cover = new Int32Array(width + 1);
  for (const s of segs) {
    if (overlap(s, col) <= 0) continue;
    const a = clamp(Math.floor(s.x0 - col.x0), 0, width);
    const b = clamp(Math.ceil(s.x1 - col.x0) - 1, 0, width);
    for (let x = a; x <= b; x++) cover[x] = (cover[x] ?? 0) + 1;
  }
  let best: { start: number; end: number; level: number } | undefined;
  let x = 0;
  while (x <= width) {
    if ((cover[x] ?? 0) > threshold) {
      x++;
      continue;
    }
    const start = x;
    let level = cover[x] ?? 0;
    while (x <= width && (cover[x] ?? 0) <= threshold) level = Math.max(level, cover[x++] ?? 0);
    const end = x - 1;
    let leftPeak = 0;
    for (let i = 0; i < start; i++) leftPeak = Math.max(leftPeak, cover[i] ?? 0);
    let rightPeak = 0;
    for (let i = end + 1; i <= width; i++) rightPeak = Math.max(rightPeak, cover[i] ?? 0);
    const deeper = !best || level < best.level || (level === best.level && end - start > best.end - best.start);
    if (start > 0 && end < width && leftPeak > level && rightPeak > level && deeper) best = { start, end, level };
  }
  if (!best) return [col];
  const left = { x0: col.x0, x1: col.x0 + best.start };
  const right = { x0: col.x0 + best.end + 1, x1: col.x1 };
  return [...splitAtDips(left, segs, threshold, depth + 1), ...splitAtDips(right, segs, threshold, depth + 1)];
}

/**
 * A line's segments placed in columns, or undefined when the line is not a
 * row of this table. A segment that bridges two columns is split between
 * them, word by word.
 */
function cellsOf(line: Line, columns: readonly Column[]): Segment[][] | undefined {
  const cells: Segment[][] = columns.map(() => []);
  for (const seg of line.segs) {
    const hits = columns.flatMap((col, k) => (overlap(seg, col) > 0 ? [k] : []));
    if (hits.length <= 1) {
      const k = hits[0] ?? nearest(seg, columns, 3 * seg.size);
      if (k === undefined) return undefined;
      cells[k]?.push(seg);
      continue;
    }
    // One stretch of text across columns is a row only if its separate pieces part cleanly at
    // the column gaps (a date set close to its description); a sentence does not.
    const straddles = (p: Piece) => columns.filter((col) => overlap(p, col) > 1).length > 1;
    if (line.segs.length === 1 && seg.pieces.some(straddles)) return undefined;
    const groups = new Map<number, Piece[]>();
    for (const word of seg.pieces.flatMap(wordsOf)) {
      const k = nearest(word, columns, Infinity) ?? 0;
      const group = groups.get(k);
      if (group) group.push(word);
      else groups.set(k, [word]);
    }
    for (const [k, pieces] of groups) cells[k]?.push(makeSegment(pieces, seg.cluster));
  }
  return cells;
}

/** The column a span overlaps most, or the closest one within `reach`. */
function nearest(span: { x0: number; x1: number }, columns: readonly Column[], reach: number): number | undefined {
  let best: number | undefined;
  let score = -Infinity;
  columns.forEach((col, k) => {
    const o = overlap(span, col);
    const s = o > 0 ? o : -Math.max(col.x0 - span.x1, span.x0 - col.x1);
    if (s > score) {
      score = s;
      best = k;
    }
  });
  return score >= -reach ? best : undefined;
}

/** A piece cut into its words, each given its share of the width by character count. */
function wordsOf(piece: Piece): Piece[] {
  const parts = piece.text.split(/(\s+)/);
  if (parts.length <= 1) return [piece];
  const perChar = (piece.x1 - piece.x0) / Math.max(1, piece.text.length);
  const out: Piece[] = [];
  let at = 0;
  for (const part of parts) {
    if (part.trim() !== '') out.push({ ...piece, text: part, x0: piece.x0 + at * perChar, x1: piece.x0 + (at + part.length) * perChar });
    at += part.length;
  }
  return out;
}

function overlap(a: { x0: number; x1: number }, b: { x0: number; x1: number }): number {
  return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
}

function cellText(segs: readonly Segment[]): string {
  return [...segs]
    .sort((a, b) => a.y - b.y || a.x0 - b.x0)
    .map((s) => s.text.trim())
    .filter((t) => t !== '')
    .join(' ');
}

function tableRows(t: FoundTable): string[][] {
  return t.rows.map((row) => row.map(cellText));
}

function tableLines(t: FoundTable): string[] {
  return tableRows(t).map((r) => r.filter((c) => c !== '').join('  '));
}

function sameColumns(a: FoundTable | undefined, b: FoundTable): boolean {
  if (!a || a.columns.length !== b.columns.length) return false;
  return a.columns.every((col, k) => {
    const other = b.columns[k];
    return other !== undefined && overlap(col, other) > 0;
  });
}

/**
 * Whether a row is the rest of the row before it: it leaves empty a column
 * that nearly every row fills (the date, the balance).
 */
function continuesRow(row: readonly string[], rows: ReadonlyArray<readonly string[]>): boolean {
  if (rows.length < 3 || row.every((c) => c === '')) return false;
  const anchors = row.map((_, k) => k).filter((k) => rows.filter((r) => (r[k] ?? '') !== '').length >= 0.95 * rows.length);
  return anchors.some((k) => (row[k] ?? '') === '');
}

function sameRow(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((cell, i) => cell.trim().toLowerCase() === (b[i] ?? '').trim().toLowerCase());
}

// =====================================================================
// Paragraphs
// =====================================================================

const BULLET = /^([•●▪◦‣∙·■□○◆◇►▶➢✓✔])\s*(?=\S)|^([-–—*])\s+(?=\S)/;
const ORDERED = /^(\(?(?:\d{1,3}|[a-z]|[ivxlcdm]{1,6})[.)]|\(?[A-Z][)]|[IVXLCDM]{1,6}\.|\((?:\d{1,3}|[a-zA-Z]|[ivxlcdm]{1,6})\))\s+(?=\S)/;
const MARKER_ONLY = /^([•●▪◦‣∙·■□○◆◇►▶➢✓✔]|[-–—*]|\(?\d{1,3}[.)]|\(?[a-z][.)]|\(?[ivx]{1,6}[.)])$/;

interface LineInfo {
  readonly line: Line;
  readonly runs: Run[];
  readonly text: string;
  /** Space between the region's left edge and the line, and between the line and the right edge. */
  readonly L: number;
  readonly R: number;
  /** Space between the line and where the region's text ends: how short of full this line stopped. */
  readonly short: number;
  readonly size: number;
  readonly bold: boolean;
  readonly marker?: { readonly ordered: boolean; readonly length: number };
}

type Draft =
  | {
      readonly kind: 'paragraph';
      readonly lines: LineInfo[];
      readonly chunk: ChunkInfo;
      readonly spaceBefore: number;
    }
  | { readonly kind: 'table'; readonly table: FoundTable }
  | { readonly kind: 'image'; readonly image: PageImage }
  | { readonly kind: 'page-break' };

function lineInfo(line: Line, chunk: ChunkInfo): LineInfo {
  const runs: Run[] = [];
  line.segs.forEach((seg, i) => {
    const segRuns = runsOf(seg.pieces);
    if (i > 0) appendText(runs, ' ');
    for (const r of segRuns) appendRun(runs, r);
  });
  const text = runsText(runs);
  const trimmed = text.trimStart();
  const bullet = BULLET.exec(trimmed);
  const ordered = bullet ? null : ORDERED.exec(trimmed);
  const markerLength = (bullet?.[0].length ?? ordered?.[0].length ?? 0) + (text.length - trimmed.length);
  const letters = runs.filter((r) => r.text.trim() !== '');
  return {
    line,
    runs,
    text,
    L: line.x0 - chunk.left,
    R: chunk.right - line.x1,
    short: chunk.textRight - line.x1,
    size: line.size,
    bold: letters.length > 0 && letters.every((r) => r.bold),
    ...(bullet || ordered ? { marker: { ordered: ordered !== null, length: markerLength } } : {}),
  };
}

function draftsOf(items: readonly Laid[]): Draft[] {
  const drafts: Draft[] = [];
  let current: { lines: LineInfo[]; chunk: ChunkInfo; spaceBefore: number } | undefined;
  let lastY: number | undefined;
  let lastChunk: ChunkInfo | undefined;
  const close = () => {
    if (current) drafts.push({ kind: 'paragraph', ...current });
    current = undefined;
  };
  for (const item of items) {
    if (item.kind !== 'line') {
      close();
      drafts.push(item.kind === 'table' ? { kind: 'table', table: item.table } : { kind: 'image', image: item.image });
      lastY = undefined;
      continue;
    }
    const info = lineInfo(item.line, item.chunk);
    if (lastChunk !== item.chunk) {
      close();
      lastY = undefined;
      lastChunk = item.chunk;
    }
    if (current && !breaksBefore(current.lines, info, item.chunk)) {
      current.lines.push(info);
    } else {
      close();
      const expected = Math.max(item.chunk.spacing, 1.2 * info.size);
      const extra = lastY === undefined ? 0 : info.line.y - lastY - expected;
      current = { lines: [info], chunk: item.chunk, spaceBefore: extra > 3 ? Math.round(extra) : 0 };
    }
    lastY = info.line.y;
  }
  close();
  return drafts;
}

/** Whether line `next` starts a new paragraph rather than continuing `lines`. */
function breaksBefore(lines: readonly LineInfo[], next: LineInfo, chunk: ChunkInfo): boolean {
  const prev = lines[lines.length - 1];
  const head = lines[0];
  if (!prev || !head) return true;
  const gap = next.line.y - prev.line.y;
  if (gap <= 0) return true;
  const expected = Math.max(chunk.spacing, 1.1 * Math.max(prev.size, next.size));
  if (gap > PARAGRAPH_GAP * expected && gap - expected > 0.3 * next.size) return true;
  if (Math.abs(next.size - prev.size) > 0.12 * Math.max(next.size, prev.size)) return true;
  if (next.marker) return true;
  // A bold line on its own, then ordinary text: a run-in heading.
  if (lines.length === 1 && prev.bold && !next.bold) return true;
  if (head.marker) {
    // A list item continues on lines indented to its text, not back at its bullet.
    return next.L < head.L + 2;
  }
  const centredBefore = centred(prev);
  if (centredBefore !== centred(next)) return true;
  if (centredBefore) return false;
  // The line before stopped short although the next line's first word would have fitted: a paragraph ended there.
  if (prev.short > 2 * prev.size && firstWordWidth(next) + 0.3 * next.size < prev.short) return true;
  // A first-line indent starts a paragraph.
  if (next.L - prev.L > next.size) return true;
  return false;
}

function centred(l: LineInfo): boolean {
  return l.L > 1.5 * l.size && l.R > 1.5 * l.size && Math.abs(l.L - l.R) <= Math.max(6, 0.1 * (l.L + l.R) + l.size);
}

function firstWordWidth(l: LineInfo): number {
  const text = l.text.trim();
  const word = text.split(/\s+/)[0] ?? '';
  const width = l.line.x1 - l.line.x0;
  return text.length > 0 ? (width * word.length) / text.length : 0;
}

// =====================================================================
// Blocks
// =====================================================================

/** The size most of the document's body text is set in. */
function bodySize(items: readonly Laid[]): number {
  const weight = new Map<number, number>();
  for (const item of items) {
    if (item.kind !== 'line') continue;
    for (const s of item.line.segs) {
      for (const p of s.pieces) {
        const key = Math.round(p.size * 2) / 2;
        weight.set(key, (weight.get(key) ?? 0) + p.text.trim().length);
      }
    }
  }
  let best = 10;
  let most = -1;
  for (const [size, w] of weight) {
    if (w > most || (w === most && size < best)) {
      best = size;
      most = w;
    }
  }
  return best;
}

function finish(drafts: readonly Draft[], body: number): Block[] {
  // Heading levels: the distinct sizes of headings, biggest first.
  const headingSizes: number[] = [];
  for (const d of drafts) {
    if (d.kind !== 'paragraph') continue;
    const size = paragraphSize(d.lines);
    if (isSizeHeading(d.lines, size, body) && !headingSizes.some((s) => Math.abs(s - size) < 0.75)) headingSizes.push(size);
  }
  headingSizes.sort((a, b) => b - a);
  const levelOf = (size: number) => Math.min(6, headingSizes.findIndex((s) => Math.abs(s - size) < 0.75) + 1) as Paragraph['heading'];
  const boldLevel = Math.min(6, headingSizes.length + 1) as Paragraph['heading'];

  const blocks: Block[] = [];
  let listMarkers: number[] = [];
  for (const d of drafts) {
    if (d.kind === 'page-break') {
      blocks.push({ kind: 'page-break' });
      listMarkers = [];
      continue;
    }
    if (d.kind === 'image') {
      blocks.push({ kind: 'image', bytes: d.image.bytes, format: d.image.format, width: d.image.width, height: d.image.height });
      listMarkers = [];
      continue;
    }
    if (d.kind === 'table') {
      blocks.push(tableBlock(d.table));
      listMarkers = [];
      continue;
    }
    const head = d.lines[0];
    if (!head) continue;
    const size = paragraphSize(d.lines);
    const runs = joinLines(d.lines);
    if (runs.length === 0) continue;

    let list: Paragraph['list'];
    if (head.marker) {
      // Nesting from how far in the bullet sits, compared with the other items around it.
      const x = head.line.x0;
      if (!listMarkers.some((m) => Math.abs(m - x) < 4)) listMarkers.push(x);
      listMarkers.sort((a, b) => a - b);
      const level = Math.min(8, listMarkers.findIndex((m) => Math.abs(m - x) < 4));
      list = { ordered: head.marker.ordered, level: Math.max(0, level) };
    } else listMarkers = [];

    let heading: Paragraph['heading'];
    const chars = runsText(runs).trim().length;
    if (!list && isSizeHeading(d.lines, size, body)) heading = levelOf(size);
    else if (!list && d.lines.length === 1 && head.bold && Math.abs(size - body) < 1.5 && chars <= 80 && !/[.,;]$/.test(runsText(runs).trim()) && /\p{L}/u.test(runsText(runs))) {
      heading = boldLevel;
    }

    const align = alignment(d.lines);
    const indentPts = Math.min(...d.lines.map((l) => l.L));
    const p: Paragraph = {
      kind: 'paragraph',
      runs: list ? stripMarker(runs, head.marker?.length ?? 0) : runs,
      ...(align !== 'left' ? { align } : {}),
      ...(heading ? { heading } : {}),
      ...(list ? { list } : {}),
      ...(d.spaceBefore > 0 ? { spaceBefore: d.spaceBefore } : {}),
      ...(!list && (align === 'left' || align === 'justify') && indentPts > Math.max(6, 0.8 * size) ? { indent: Math.round(indentPts) } : {}),
    };
    if (p.runs.length > 0) blocks.push(p);
  }
  return blocks;
}

function paragraphSize(lines: readonly LineInfo[]): number {
  return dominantSize(lines.flatMap((l) => l.line.segs.flatMap((s) => s.pieces)));
}

function isSizeHeading(lines: readonly LineInfo[], size: number, body: number): boolean {
  if (lines.length > 3 || lines[0]?.marker) return false;
  const chars = lines.reduce((n, l) => n + l.text.trim().length, 0);
  return size >= body * HEADING_RATIO && size - body >= 1 && chars <= 200 && chars > 0;
}

function alignment(lines: readonly LineInfo[]): NonNullable<Paragraph['align']> {
  if (lines.every(centred)) return 'center';
  if (lines.every((l) => l.R < l.size && l.L > 3 * l.size)) return 'right';
  if (lines.length >= 3 && lines.slice(0, -1).every((l) => l.short <= 0.7 * l.size)) return 'justify';
  return 'left';
}

/** A paragraph's lines joined into runs: a space between lines, or nothing after a hyphen. */
function joinLines(lines: readonly LineInfo[]): Run[] {
  const runs: Run[] = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      const last = runs[runs.length - 1];
      if (last && last.text.endsWith('­')) runs[runs.length - 1] = { ...last, text: last.text.slice(0, -1) };
      else if (last && !/[-‐\s]$/.test(last.text)) appendText(runs, ' ');
    }
    for (const r of l.runs) appendRun(runs, r);
  });
  return trimRuns(runs);
}

function stripMarker(runs: readonly Run[], length: number): Run[] {
  let remaining = length;
  const out: Run[] = [];
  for (const r of runs) {
    if (remaining <= 0) {
      out.push(r);
      continue;
    }
    if (r.text.length <= remaining) {
      remaining -= r.text.length;
      continue;
    }
    out.push({ ...r, text: r.text.slice(remaining) });
    remaining = 0;
  }
  return trimRuns(out);
}

function tableBlock(t: FoundTable): Table {
  const rows: TableCell[][] = t.rows.map((row) =>
    row.map((segs) => {
      const ordered = [...segs].sort((a, b) => a.y - b.y || a.x0 - b.x0);
      const runs: Run[] = [];
      ordered.forEach((s, i) => {
        if (i > 0) appendText(runs, ' ');
        for (const r of runsOf(s.pieces)) appendRun(runs, r);
      });
      const trimmed = trimRuns(runs);
      return { paragraphs: trimmed.length > 0 ? [{ kind: 'paragraph', runs: trimmed }] : [] };
    }),
  );
  const columns = t.columns.map((col, k) => {
    const next = t.columns[k + 1];
    return Math.round(next ? next.x0 - col.x0 : col.x1 - col.x0 + 6);
  });
  return { kind: 'table', rows, columns };
}

// =====================================================================
// Runs
// =====================================================================

/** Pieces as styled runs, with a space wherever the gap between two pieces is a word space. */
function runsOf(pieces: readonly Piece[]): Run[] {
  const runs: Run[] = [];
  let prev: Piece | undefined;
  for (const p of pieces) {
    if (prev) {
      const gap = p.x0 - prev.x1;
      const last = runs[runs.length - 1]?.text ?? '';
      if (gap > WORD_GAP * Math.min(p.size, prev.size) && !/\s$/.test(last) && !/^\s/.test(p.text)) appendText(runs, ' ');
    }
    appendRun(runs, {
      text: p.text.replace(/[ \t]{2,}/g, ' '),
      size: Math.round(p.size * 2) / 2,
      ...(p.bold ? { bold: true } : {}),
      ...(p.italic ? { italic: true } : {}),
      ...(p.family ? { family: p.family } : {}),
    });
    prev = p;
  }
  return runs;
}

function appendRun(runs: Run[], run: Run): void {
  const last = runs[runs.length - 1];
  if (last && last.size === run.size && last.bold === run.bold && last.italic === run.italic && last.family === run.family) {
    const joined = last.text + run.text;
    runs[runs.length - 1] = { ...last, text: joined.replace(/ {2,}/g, ' ') };
  } else {
    if (last && last.text.endsWith(' ') && run.text.startsWith(' ')) runs.push({ ...run, text: run.text.slice(1) });
    else runs.push(run);
  }
}

/** A space goes on the end of the run before it, so it takes that run's style. */
function appendText(runs: Run[], text: string): void {
  const last = runs[runs.length - 1];
  if (last) runs[runs.length - 1] = { ...last, text: last.text + text };
}

function trimRuns(runs: readonly Run[]): Run[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length > 0 && (out[0]?.text.trimStart() ?? '') === '') out.shift();
  while (out.length > 0 && (out[out.length - 1]?.text.trimEnd() ?? '') === '') out.pop();
  const first = out[0];
  if (first) out[0] = { ...first, text: first.text.trimStart() };
  const last = out[out.length - 1];
  if (last) out[out.length - 1] = { ...last, text: last.text.trimEnd() };
  return out;
}

function runsText(runs: readonly Run[]): string {
  return runs.map((r) => r.text).join('');
}

function lineText(line: Line): string {
  return line.segs.map((s) => s.text.trim()).join('  ');
}

// =====================================================================
// Page size
// =====================================================================

/** The first page's size, with a margin estimated from where its text sits. */
function pageSize(pages: readonly PageText[]): FlowDocument['page'] {
  const first = pages[0];
  if (!first || !(first.width > 0 && first.height > 0)) return undefined;
  const withText = pages.find((p) => p.items.some((i) => i.str.trim() !== '')) ?? first;
  const items = withText.items.filter((i) => i.str.trim() !== '');
  let margin = 72;
  if (items.length > 0) {
    const left = Math.min(...items.map((i) => i.x));
    const right = withText.width - Math.max(...items.map((i) => i.x + i.width));
    const top = Math.min(...items.map((i) => i.y - i.height));
    const bottom = withText.height - Math.max(...items.map((i) => i.y + 0.25 * i.height));
    margin = clamp(Math.round(Math.min(left, right, top, bottom)), 18, 108);
  }
  return { width: round2(first.width), height: round2(first.height), margin };
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
