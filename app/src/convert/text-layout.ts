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
import type { Block, FlowDocument, Paragraph, Run, SlideText, Table, TableCell, Workbook } from './model';

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
  pages = withoutRunningLines(pages);
  const bounds = documentBounds(pages);
  const laid = pages.map((page) => layoutPage(page, bounds));
  const body = bodySize(laid.flat());
  const drafts: Draft[] = [];
  laid.forEach((items, i) => {
    const own = draftsOf(items);
    if (i > 0) {
      // A sentence the page break cut in two is one paragraph again, with no break in it.
      const last = drafts[drafts.length - 1];
      const next = own[0];
      if (last?.kind === 'paragraph' && next?.kind === 'paragraph' && runsOn(last.lines, next.lines)) {
        last.lines.push(...next.lines);
        own.shift();
      } else drafts.push({ kind: 'page-break' });
    }
    drafts.push(...own);
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
 * no tables at all gets its lines, one per row, in column A. The lines
 * outside the tables are kept too, one per row, on "Other details" beside a
 * statement or on "Text" after the pages' sheets: a payslip's Net Pay, an
 * invoice's amount in words, the clauses of an agreement with one small
 * table in it.
 */
export function toWorkbook(pages: readonly PageText[]): Workbook {
  const bounds = documentBounds(pages);
  const perPage = pages.map((page, index) => {
    const items = layoutPage(page, bounds);
    const tables = items.flatMap((item) => (item.kind === 'table' ? [item.table] : []));
    const lines = items.flatMap((item) => (item.kind === 'line' ? [lineText(item.line)] : item.kind === 'table' ? tableLines(item.table) : []));
    // The words that are not in any table: a payslip's Net Pay line, an
    // agreement's clauses, the amount in words under an invoice.
    const prose = items.flatMap((item) => (item.kind === 'line' ? [lineText(item.line)] : [])).filter((l) => l.trim() !== '');
    return { index, tables, lines, prose };
  });
  /** Every line outside the tables, page by page with a blank row between: nothing on the pages is lost. */
  const proseRows: string[][] = [];
  for (const p of perPage) {
    if (p.prose.length === 0) continue;
    if (proseRows.length > 0) proseRows.push([]);
    proseRows.push(...p.prose.map((l) => [l]));
  }

  const withTables = perPage.filter((p) => p.tables.length > 0);
  if (withTables.length === 0) {
    const rows = perPage.flatMap((p) => p.lines.filter((l) => l.trim() !== '').map((l) => [l]));
    return { sheets: [{ name: 'Text', rows }] };
  }

  // Each page's main table is its longest. When most pages' main tables share
  // their columns, they are one table broken by page breaks: a statement.
  const mains = withTables.map((p) => ({ p, main: p.tables.reduce((best, t) => (tableRows(t).length > tableRows(best).length ? t : best)) }));
  // The columns most pages share are the statement's: a first page whose table found its
  // columns a little differently (an account summary across its top) does not set them.
  const first = mains.reduce<{ main: FoundTable; n: number } | undefined>((best, m) => {
    const n = mains.filter((o) => sameColumns(o.main, m.main)).length;
    return best && best.n >= n ? best : { main: m.main, n };
  }, undefined)?.main;
  const alike = first ? mains.filter((m) => sameColumns(m.main, first)).length : 0;
  if (first && mains.length > 1 && alike >= Math.max(2, Math.ceil(mains.length * 0.6))) {
    // The header is the row that comes back at the top of later pages.
    const counts = new Map<string, { row: string[]; n: number }>();
    for (const m of mains.slice(1)) {
      const top = tableRows(m.main)[0];
      if (!top || top.every((c) => c === '')) continue;
      const key = top.map((c) => c.trim().toLowerCase()).join('\u0001');
      const entry = counts.get(key) ?? { row: top, n: 0 };
      entry.n++;
      counts.set(key, entry);
    }
    const repeated = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    const header = repeated && repeated.n >= 1 ? repeated.row : tableRows(first)[0];
    const rows: string[][] = [];
    // Whatever is not the statement itself (account details above it, a summary
    // after it) is kept on a sheet of its own, so nothing is lost.
    const other: string[][] = [];
    const keep = (more: readonly string[][]) => {
      const filled = more.filter((r) => r.some((c) => c.trim() !== ''));
      if (filled.length === 0) return;
      if (other.length > 0) other.push([]);
      other.push(...filled.map((r) => [...r]));
    };
    for (const { p, main } of mains) {
      for (const t of p.tables) if (t !== main) keep(tableRows(t));
      // A short page can find its columns a little differently (the last page of
      // a statement, with a dozen rows): its words are put back into the
      // statement's own columns by where they sit.
      const close = Math.abs(main.columns.length - first.columns.length) <= 2;
      if (!sameColumns(main, first) && !close) {
        keep(tableRows(main));
        continue;
      }
      const tr = sameColumns(main, first) ? tableRows(main) : recut(main, first.columns);
      let from = 0;
      const at = header ? tr.findIndex((r) => sameRow(r, header)) : -1;
      if (at >= 0) {
        keep(tr.slice(0, at));
        // The header is kept once, at the top.
        from = rows.length === 0 ? at : at + 1;
      }
      const body = tr.slice(from);
      // A row the page break cut in two: its second half is joined back to its first.
      const head = body[0];
      const last = rows[rows.length - 1];
      if (head && last && continuesRow(head, rows)) {
        rows[rows.length - 1] = last.map((cell, k) => [cell, head[k] ?? ''].filter((c) => c !== '').join(' '));
        body.shift();
      }
      rows.push(...body);
    }
    if (proseRows.length > 0) {
      if (other.length > 0) other.push([]);
      other.push(...proseRows);
    }
    return { sheets: other.length > 0 ? [{ name: 'Table', rows }, { name: 'Other details', rows: other }] : [{ name: 'Table', rows }] };
  }

  const sheets = withTables.map((p) => {
    const rows: string[][] = [];
    p.tables.forEach((t, i) => {
      if (i > 0) rows.push([]);
      rows.push(...tableRows(t));
    });
    return { name: `Page ${p.index + 1}`, rows };
  });
  return { sheets: proseRows.length > 0 ? [...sheets, { name: 'Text', rows: proseRows }] : sheets };
}

/**
 * A page's words as text boxes for a slide: each run of words on one
 * baseline with no wide gap is a line, and lines set one under another at
 * the same left edge, in the same style and at an even spacing, share a box.
 * Colour is left to the caller, which can see the page.
 */
export function slideBoxes(page: PageText): SlideText[] {
  const segments = segmentsOf(page.items).sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const styleOf = (seg: Segment) => {
    const letters = seg.pieces.filter((p) => p.text.trim() !== '');
    return {
      bold: letters.length > 0 && letters.every((p) => p.bold),
      italic: letters.length > 0 && letters.every((p) => p.italic),
      family: letters.find((p) => p.family !== undefined)?.family,
    };
  };
  type Open = { segs: Segment[]; style: ReturnType<typeof styleOf> };
  const boxes: Open[] = [];
  for (const seg of segments) {
    const style = styleOf(seg);
    const box = boxes.find((b) => {
      const last = b.segs[b.segs.length - 1];
      const first = b.segs[0];
      if (!last || !first) return false;
      const gap = seg.y - last.y;
      const even = b.segs.length < 2 || Math.abs(gap - (last.y - (b.segs[b.segs.length - 2]?.y ?? 0))) <= 0.25 * seg.size;
      return (
        Math.abs(seg.x0 - first.x0) <= 0.5 * seg.size &&
        Math.abs(seg.size - first.size) <= 0.1 * first.size &&
        style.bold === b.style.bold &&
        style.italic === b.style.italic &&
        gap > 0.9 * seg.size &&
        gap < 1.8 * seg.size &&
        even
      );
    });
    if (box) box.segs.push(seg);
    else boxes.push({ segs: [seg], style });
  }
  return boxes.map(({ segs, style }) => {
    const first = segs[0]!;
    const size = dominantSize(segs.flatMap((s) => s.pieces));
    const leading = segs.length > 1 ? (segs[segs.length - 1]!.y - first.y) / (segs.length - 1) : 1.2 * size;
    const x0 = Math.min(...segs.map((s) => s.x0));
    const x1 = Math.max(...segs.map((s) => s.x1));
    const top = first.y - 0.95 * size;
    const bottom = segs[segs.length - 1]!.y + 0.3 * size;
    return {
      x: x0,
      y: top,
      width: Math.max(1, x1 - x0),
      height: Math.max(1, bottom - top),
      baseline: first.y,
      lines: segs.map((s) => s.text.replace(/\s+/g, ' ').trim()),
      size,
      leading,
      ...(style.bold ? { bold: true } : {}),
      ...(style.italic ? { italic: true } : {}),
      ...(style.family ? { family: style.family } : {}),
    };
  });
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
  const found = depth < 3 ? findGutter(segs, left, right) : undefined;
  if (!found) return [{ left, right, elements: elementsOf(segs, imgs) }];
  const [g0, g1, sidebar] = found;
  const middle = (g0 + g1) / 2;
  // A sidebar is read whole, then the main text: nothing crossing between them cuts them into bands.
  const crosses = (x0: number, x1: number) => !sidebar && x0 < g1 - 1 && x1 > g0 + 1;
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

/** The widest gutter between two columns of prose (or a sidebar and the main text: true), or undefined when the region is one column. */
function findGutter(segs: readonly Segment[], left: number, right: number): [number, number, boolean] | undefined {
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
  if (isProse(leftSide, left, g0) && isProse(rightSide, g1, right)) return [g0, g1, false];
  // A sidebar beside the main text (a résumé's contact details and skills,
  // a newsletter's contents): short lines on one side, but lines that keep to
  // their own spacing rather than lining up with the other side's, which is
  // what a table's rows do.
  if (isSidebar(leftSide, rightSide, left, g0, g1, right)) return [g0, g1, true];
  return undefined;
}

/**
 * Two sides that are read one after the other, not across: each has several
 * lines, at least one side is prose, and few of either side's baselines line
 * up with the other's.
 */
function isSidebar(leftSide: readonly Segment[], rightSide: readonly Segment[], left: number, g0: number, g1: number, right: number): boolean {
  const lines = (side: readonly Segment[]) => [...new Set(side.map((s) => Math.round(s.y)))];
  const l = lines(leftSide);
  const r = lines(rightSide);
  if (l.length < 4 || r.length < 4) return false;
  // At least one side carries running text: a good share of its lines fill most of its width.
  const runs = (side: readonly Segment[], x0: number, x1: number) => side.filter((s) => s.x1 - s.x0 >= 0.5 * (x1 - x0) && s.text.length >= 20).length >= Math.max(3, side.length * 0.25);
  if (!runs(leftSide, left, g0) && !runs(rightSide, g1, right)) return false;
  const aligned = (a: readonly number[], b: readonly number[]) => a.filter((y) => b.some((z) => Math.abs(y - z) <= 1.5)).length / a.length;
  return Math.max(aligned(l, r), aligned(r, l)) < 0.3;
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
    const gaps: number[] = [];
    let most = first.line.segs.length;
    for (let j = start + 1; j < els.length; j++) {
      const el = els[j];
      const prev = run[run.length - 1];
      if (el?.kind !== 'line' || !prev) break;
      const gap = el.line.y - prev.y;
      if (gap <= 0 || gap > Math.max(3 * chunk.spacing, 3 * el.line.size) || !accepts(el.line)) break;
      // A blank line's worth of space after rows set evenly ends the table: what follows is
      // another block (a payslip's details, then its earnings), even if its columns line up.
      // So does a wider gap before a row with more cells than any so far (a statement's
      // account details, then the header of its transactions).
      // A heading row with nothing under it but, after a gap, a block of half as many cells (a
      // statement's last page: its column headings, then the summary box) is not that block's table.
      if (gaps.length === 0 && gap > 2.5 * Math.max(prev.size, el.line.size) && el.line.segs.length * 2 <= first.line.segs.length) break;
      if (gaps.length >= 2) {
        const usual = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? gap;
        if (gap > 2.2 * usual && gap > 2 * el.line.size) break;
        if (gap > 1.6 * usual && el.line.segs.length >= most + 2) break;
      }
      most = Math.max(most, el.line.segs.length);
      gaps.push(gap);
      run.push(el.line);
    }
    return run;
  };
  const plain = collect(() => true);
  const plainMulti = plain.filter((l) => l.segs.length >= 2);
  if (plainMulti.length < 2) return undefined;
  // The guess comes from the fuller rows: a two-cell summary under a seven-column
  // statement ("Opening balance  84,250.75") would bridge its columns.
  const widest = Math.max(...plainMulti.map((l) => l.segs.length));
  const fuller = plainMulti.filter((l) => l.segs.length >= Math.max(2, Math.ceil(widest / 2)));
  const guess = clusterColumns(fuller.length >= 2 ? fuller : plainMulti);
  if (guess.length < 2) return undefined;
  // A line joins only if it sits in the columns. A sentence under the table that runs across
  // them (a payslip's "Net pay" line), or a label that bridges two of them, is what comes after
  // the table, and must not vote on its columns.
  const bridges = (p: { x0: number; x1: number }) => guess.filter((c) => overlap(p, c) > 1).length > 1;
  const run = collect((line) =>
    line.segs.length >= 2
      ? !line.segs.some((seg) => seg.pieces.some(bridges))
      : cellsOf(line, guess) !== undefined || (line.x1 - line.x0 < 0.6 * width && !bridges(line)),
  );
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
  return { table: headingsOverFigures({ columns, rows }), from, next: from + fitted.length };
}

/**
 * A heading set flush left over figures set flush right ("Debit" over
 * "2,247.89" in a column wider than both) does not overlap them, so the two
 * came out as columns of their own: one with only the heading, the next with
 * only the figures. Such a pair is one column.
 */
function headingsOverFigures(table: FoundTable): FoundTable {
  const columns = [...table.columns];
  const rows = table.rows.map((r) => r.map((c) => [...c]));
  if (rows.length < 3) return table;
  const headOnly = (k: number) => (rows[0]?.[k]?.length ?? 0) > 0 && rows.slice(1).every((r) => (r[k]?.length ?? 0) === 0);
  const bodyOnly = (k: number) => (rows[0]?.[k]?.length ?? 0) === 0 && rows.slice(1).some((r) => (r[k]?.length ?? 0) > 0);
  for (let k = 0; k + 1 < columns.length; k++) {
    if (!((headOnly(k) && bodyOnly(k + 1)) || (bodyOnly(k) && headOnly(k + 1)))) continue;
    const a = columns[k]!;
    const b = columns[k + 1]!;
    columns.splice(k, 2, { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1) });
    for (const r of rows) r.splice(k, 2, [...(r[k] ?? []), ...(r[k + 1] ?? [])]);
  }
  return columns.length === table.columns.length ? table : { columns, rows };
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

/** A table's words put into `columns` by where each piece sits: its middle, or the nearest column. */
function recut(t: FoundTable, columns: FoundTable['columns']): string[][] {
  return t.rows.map((row) => {
    const cells: Piece[][] = columns.map(() => []);
    for (const cell of row) {
      for (const seg of cell) {
        for (const piece of seg.pieces) {
          const mid = (piece.x0 + piece.x1) / 2;
          let k = columns.findIndex((c) => mid >= c.x0 && mid <= c.x1);
          if (k < 0) {
            let best = Infinity;
            columns.forEach((c, i) => {
              const d = mid < c.x0 ? c.x0 - mid : mid - c.x1;
              if (d < best) {
                best = d;
                k = i;
              }
            });
          }
          cells[k]?.push(piece);
        }
      }
    }
    return cells.map((pieces) => {
      // Pieces touching on one line are one word; a gap or a new line is a space.
      let text = '';
      let prev: Piece | undefined;
      for (const p of pieces.sort((a, c) => a.y - c.y || a.x0 - c.x0)) {
        const gap = prev && Math.abs(prev.y - p.y) < p.size * 0.4 ? p.x0 - prev.x1 : Infinity;
        if (text !== '' && gap > p.size * WORD_GAP && !text.endsWith(' ') && !p.text.startsWith(' ')) text += ' ';
        text += p.text;
        prev = p;
      }
      return text.replace(/\s+/g, ' ').trim();
    });
  });
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

/**
 * Whether the paragraph that opens a page carries on the one that closed the
 * page before: the last line ran to the margin without ending a sentence,
 * and the next starts as ordinary text in the same size, not a heading or a
 * list item.
 */
function runsOn(before: readonly LineInfo[], after: readonly LineInfo[]): boolean {
  const end = before[before.length - 1];
  const start = after[0];
  const head0 = before[0];
  if (!end || !start || !head0 || start.marker) return false;
  // A list item carries on in lines set in from its bullet, as on its own page.
  if (head0.marker && start.L < head0.L + 2) return false;
  if (Math.abs(end.size - start.size) > 0.12 * Math.max(end.size, start.size) || end.bold !== start.bold) return false;
  // The last line stopped short although the next word would have fitted: the paragraph ended there.
  if ((end.short > 2 * end.size && firstWordWidth(start) + 0.3 * start.size < end.short) || centred(end) || centred(start)) return false;
  const tail = end.text.trim();
  const head = start.text.trim();
  if (tail === '' || head === '' || /[.!?:;]["'”’)\]]*$/.test(tail)) return false;
  // A lower-case start is plainly the rest of a sentence; so is anything after a comma, a hyphen or a joining word.
  return /^\p{Ll}/u.test(head) || /[,\-–—]$|\b(and|or|the|of|to|in|a|an|by|for|with|on|at|from|that|which)$/i.test(tail);
}

/** A line of a running header or footer: text alone, or with a page number, set the same way on several pages. */
const PAGE_NUMBER = /^(page\s*)?[-–—(\s]*\d+[-–—)\s]*(\s*(of|\/)\s*\d+)?$/i;

/**
 * The same document with its running headers and footers taken out: the
 * page numbers ("Page 2 of 9", "- 3 -") wherever they are, and any other line
 * set in the top or bottom margin of at least two pages and half of them
 * (a letterhead, "Confidential"), kept only on the first page. In a
 * Word file they would otherwise land in the middle of the text, page after page.
 */
function withoutRunningLines(pages: readonly PageText[]): PageText[] {
  if (pages.length < 2) return [...pages];
  type Band = { readonly items: TextItem[]; readonly key: string; readonly number: boolean };
  const bandsOf = (page: PageText): Band[] => {
    const zone = 0.09 * page.height;
    const edge = page.items.filter((i) => i.str.trim() !== '' && (i.y < zone || i.y > page.height - zone));
    const lines: TextItem[][] = [];
    for (const item of [...edge].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs((l[0]?.y ?? 0) - item.y) <= SAME_BASELINE * Math.max(1, item.height));
      if (line) line.push(item);
      else lines.push([item]);
    }
    return lines.map((items) => {
      const text = items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const where = (items[0]?.y ?? 0) < zone ? 'top' : 'bottom';
      return { items, key: `${where}|${text.toLowerCase().replace(/\d+/g, '#')}`, number: PAGE_NUMBER.test(text) };
    });
  };
  const bands = pages.map(bandsOf);
  const seen = new Map<string, number>();
  for (const list of bands) for (const key of new Set(list.map((b) => b.key))) seen.set(key, (seen.get(key) ?? 0) + 1);
  const enough = Math.max(2, Math.ceil(pages.length / 2));
  const kept = new Set<string>();
  return pages.map((page, i) => {
    const drop = new Set<TextItem>();
    for (const band of bands[i] ?? []) {
      if (band.number) band.items.forEach((item) => drop.add(item));
      else if ((seen.get(band.key) ?? 0) >= enough) {
        // On the first page it is usually the letterhead, and stays; anywhere else it repeats what is already there.
        if (i > 0 || kept.has(band.key)) band.items.forEach((item) => drop.add(item));
        else kept.add(band.key);
      }
    }
    return drop.size === 0 ? page : { ...page, items: page.items.filter((item) => !drop.has(item)) };
  });
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

    // "1. Summary" set larger than the text on a line of its own is a numbered heading,
    // not the first item of a list: it stays a heading and keeps its number.
    const numberedHeading = head.marker?.ordered === true && isSizeHeading(d.lines, size, body);
    let list: Paragraph['list'];
    if (head.marker && !numberedHeading) {
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
  // A bullet is never a heading; a number can be ("2. Figures by district").
  if (lines.length > 3 || (lines[0]?.marker && !lines[0].marker.ordered)) return false;
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
  // Pages that are only pictures (scans kept as they look) get a narrow margin, so the picture is nearly the page.
  let margin = items.length === 0 && pages.some((p) => (p.images?.length ?? 0) > 0) ? 18 : 72;
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
