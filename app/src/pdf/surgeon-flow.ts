/**
 * Lays a flowing document (paragraphs, headings, lists, tables, pictures) out
 * on pages and writes it as a PDF: what turns a Word or Excel file into one.
 *
 * Words are set in the PDF's own fonts (Helvetica, Times, Courier and their
 * bold and italic), so they stay real, selectable text. Those fonts draw
 * Western letters only; a line with anything else in it (Malayalam, Hindi,
 * Arabic, emoji) is drawn by the browser instead, through `picture`, and goes
 * in as a picture of that line. Nothing is ever drawn as an empty box.
 */
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import { PAGE_COUNT, PAGE_NUMBER, type Block, type FlowDocument, type PageFurniture, type Paragraph, type Picture, type Run, type Table } from '../convert/model';
import type { LinePainter } from './types';

const A4 = { width: 595.28, height: 841.89, margin: 56 };
const LINE = 1.25;
const CELL_PAD = 4;

const FACES: Record<'sans' | 'serif' | 'mono', readonly [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

interface Word {
  readonly text: string;
  readonly font: PDFFont;
  readonly size: number;
  readonly color: readonly [number, number, number];
  readonly width: number;
  readonly space: number;
  readonly href?: string;
  readonly run: Run;
}

interface Line {
  readonly words: Word[];
  readonly width: number;
  readonly height: number;
  readonly ascent: number;
  /** A line the PDF fonts cannot draw, drawn by the browser instead. */
  readonly picture?: { png: Uint8Array; width: number; height: number };
  /** A picture standing on a line of its own, in a table cell. */
  readonly image?: Picture;
}

function hexColor(value: string | undefined): readonly [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(value ?? '');
  if (!m?.[1]) return [0.1, 0.1, 0.12];
  const n = Number.parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Whether any text stands for the page count, which is known only once everything is laid out. */
function countsPages(blocks: readonly Block[]): boolean {
  return blocks.some((b) =>
    b.kind === 'paragraph' ? b.runs.some((r) => r.text.includes(PAGE_COUNT)) : b.kind === 'table' ? b.rows.some((row) => row.some((c) => countsPages(c.paragraphs))) : false,
  );
}

export async function layoutFlow(flow: FlowDocument, picture: LinePainter | null): Promise<{ bytes: Uint8Array; pages: number }> {
  // "Page 3 of 9" in the text itself needs the 9, so such a document is laid out twice.
  if (!countsPages(flow.blocks)) return build(flow, picture, null);
  const first = await build(flow, picture, null);
  return build(flow, picture, first.pages);
}

async function build(flow: FlowDocument, picture: LinePainter | null, knownTotal: number | null): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const geometry = flow.page ?? A4;
  const fonts = new Map<StandardFonts, PDFFont>();
  const fontFor = (run: Run): PDFFont => {
    const family = run.family ?? 'sans';
    const face = FACES[family][(run.bold ? 1 : 0) + (run.italic ? 2 : 0)] ?? StandardFonts.Helvetica;
    let font = fonts.get(face);
    if (!font) {
      font = doc.embedStandardFont(face);
      fonts.set(face, font);
    }
    return font;
  };
  const charset = new Set(doc.embedStandardFont(StandardFonts.Helvetica).getCharacterSet());
  const drawable = (text: string): boolean => [...text].every((ch) => charset.has(ch.codePointAt(0) ?? 0));

  let page: PDFPage = doc.addPage([geometry.width, geometry.height]);
  const left = geometry.margin;
  const fullWidth = geometry.width - 2 * geometry.margin;
  // Where the text may run on the page being filled: inside the margins, and clear of a
  // header or footer taller than its margin (a letterhead with a logo), as Word does.
  const room0 = { top: geometry.margin, bottom: geometry.margin };
  const roomFirst = { ...room0 };
  const roomEvery = { ...room0 };
  const area = () => (doc.getPageCount() === 1 ? roomFirst : roomEvery);
  const topNow = () => geometry.height - area().top;
  let y = topNow();
  const newPage = () => {
    page = doc.addPage([geometry.width, geometry.height]);
    y = topNow();
  };
  // Headers and footers are set in place on pages that already exist (`fixed`), measured
  // first without drawing anything (`dry`).
  let fixed = false;
  let dry = false;
  let pageNumber = (): string => String(doc.getPageCount());
  let pageTotal = (): string => (knownTotal === null ? '' : String(knownTotal));
  const room = (height: number) => {
    if (fixed) return;
    if (y - height < area().bottom && y < topNow() - 1) newPage();
  };
  const numbered = (text: string): string => (text.includes(PAGE_NUMBER) || text.includes(PAGE_COUNT) ? text.split(PAGE_NUMBER).join(pageNumber()).split(PAGE_COUNT).join(pageTotal()) : text);

  /** Breaks a paragraph into lines that fit `width`. */
  async function linesOf(paragraph: Paragraph, width: number, prefix: string): Promise<Line[]> {
    const first = paragraph.runs[0];
    const own = paragraph.runs.map((r) => ({ ...r, text: numbered(r.text) }));
    const runs: readonly Run[] = prefix ? [{ size: first?.size ?? 11, text: prefix, ...(first?.family ? { family: first.family } : {}) }, ...own] : own;
    const plain = runs.map((r) => r.text).join('');
    const size0 = Math.max(4, Math.min(96, runs.find((r) => r.text.trim())?.size ?? 11));
    if (plain.trim() !== '' && !drawable(plain.replace(/[\t ]/g, ' ')) && picture) {
      // The browser shapes it; long text is cut into pieces that fit by width estimate.
      const drawn = await pictureLines(runs, width, size0);
      if (drawn.length > 0) return drawn;
    }
    const words: Word[] = [];
    for (const run of runs) {
      const font = fontFor(run);
      const size = Math.max(4, Math.min(96, run.size || 11));
      const safe = [...run.text.replace(/\t/g, '    ')].map((ch) => (charset.has(ch.codePointAt(0) ?? 0) ? ch : '?')).join('');
      const parts = safe.split(/( +)/);
      for (const part of parts) {
        if (part === '') continue;
        if (/^ +$/.test(part)) {
          const last = words[words.length - 1];
          if (last) words[words.length - 1] = { ...last, space: last.space + font.widthOfTextAtSize(part, size) };
          continue;
        }
        words.push({ text: part, font, size, color: hexColor(run.color), width: font.widthOfTextAtSize(part, size), space: 0, run, ...(run.href ? { href: run.href } : {}) });
      }
    }
    const lines: Line[] = [];
    let current: Word[] = [];
    let used = 0;
    const flush = () => {
      if (current.length === 0) return;
      const size = Math.max(...current.map((w) => w.size));
      const last = current[current.length - 1];
      lines.push({ words: current, width: used - (last?.space ?? 0), height: size * LINE, ascent: size * 0.8 });
      current = [];
      used = 0;
    };
    for (const word of words) {
      if (used + word.width > width && current.length > 0) flush();
      // A word longer than the whole line is cut where it must be.
      if (word.width > width) {
        let rest = word.text;
        while (rest.length > 0) {
          let n = rest.length;
          while (n > 1 && word.font.widthOfTextAtSize(rest.slice(0, n), word.size) > width) n--;
          const piece = rest.slice(0, n);
          current.push({ ...word, text: piece, width: word.font.widthOfTextAtSize(piece, word.size), space: n === rest.length ? word.space : 0 });
          used += word.font.widthOfTextAtSize(piece, word.size);
          rest = rest.slice(n);
          if (rest.length > 0) flush();
        }
        continue;
      }
      current.push(word);
      used += word.width + word.space;
    }
    flush();
    if (lines.length === 0) lines.push({ words: [], width: 0, height: size0 * LINE, ascent: size0 * 0.8 });
    return lines;
  }

  async function pictureLines(runs: readonly Run[], width: number, size: number): Promise<Line[]> {
    const run = runs.find((r) => r.text.trim()) ?? runs[0];
    const style = { size, bold: run?.bold === true, italic: run?.italic === true, family: run?.family ?? 'sans', color: hexColor(run?.color) } as const;
    const text = runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();
    // Pieces of words that fit the width, measured by the browser as it draws them.
    const out: Line[] = [];
    const words = text.split(' ');
    let start = 0;
    while (start < words.length) {
      let end = words.length;
      let made: { png: Uint8Array; width: number; height: number } | null = null;
      while (end > start) {
        made = await picture!(words.slice(start, end).join(' '), style, 3);
        if (!made || made.width / 3 <= width || end === start + 1) break;
        end = Math.max(start + 1, Math.floor(start + (end - start) * Math.min(0.9, width / (made.width / 3))));
      }
      if (made) {
        const w = Math.min(width, made.width / 3);
        const h = (made.height / 3) * (w / (made.width / 3));
        out.push({ words: [], width: w, height: Math.max(h, size * LINE), ascent: size * 0.8, picture: made });
      }
      start = end;
    }
    return out;
  }

  async function drawLines(lines: readonly Line[], x: number, width: number, align: Paragraph['align']): Promise<void> {
    for (const line of lines) {
      room(line.height);
      const offset = align === 'center' ? (width - line.width) / 2 : align === 'right' ? width - line.width : 0;
      if (dry) {
        y -= line.height;
        continue;
      }
      if (line.image) {
        const embedded = line.image.format === 'png' ? await doc.embedPng(line.image.bytes) : await doc.embedJpg(line.image.bytes);
        page.drawImage(embedded, { x: x + Math.max(0, offset), y: y - line.height + 2, width: line.width, height: line.height - 4 });
        y -= line.height;
        continue;
      }
      if (line.picture) {
        const image = await doc.embedPng(line.picture.png);
        const h = line.picture.height * (line.width / line.picture.width);
        page.drawImage(image, { x: x + Math.max(0, offset), y: y - h, width: line.width, height: h });
        y -= line.height;
        continue;
      }
      let cx = x + Math.max(0, offset);
      const baseline = y - line.ascent - (line.height - line.ascent / 0.8) / 2;
      for (const word of line.words) {
        page.drawText(word.text, { x: cx, y: baseline, size: word.size, font: word.font, color: rgb(...word.color) });
        if (word.run.underline || word.href) {
          // Through the space to the next word when that is underlined too, so a link reads as one.
          const next = line.words[line.words.indexOf(word) + 1];
          const through = next && (next.run.underline || next.href) ? word.space : 0;
          page.drawLine({ start: { x: cx, y: baseline - word.size * 0.12 }, end: { x: cx + word.width + through, y: baseline - word.size * 0.12 }, thickness: Math.max(0.5, word.size / 18), color: rgb(...word.color) });
        }
        if (word.href && /^(https?:|mailto:|tel:)/i.test(word.href)) {
          const annot = doc.context.register(
            doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [cx, baseline - word.size * 0.25, cx + word.width, baseline + word.size * 0.85], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of(word.href) } }),
          );
          page.node.addAnnot(annot);
        }
        cx += word.width + word.space;
      }
      y -= line.height;
    }
  }

  const counters = new Map<number, number>();

  async function paragraph(p: Paragraph, x: number, width: number): Promise<void> {
    const size = p.runs.find((r) => r.text.trim())?.size ?? 11;
    let prefix = '';
    let indent = Math.min(width * 0.5, p.indent ?? 0);
    if (p.list) {
      const level = Math.max(0, Math.min(6, p.list.level));
      indent += 18 * (level + 1);
      if (p.list.ordered) {
        const n = (counters.get(level) ?? 0) + 1;
        counters.set(level, n);
        for (const deeper of [...counters.keys()]) if (deeper > level) counters.delete(deeper);
        prefix = `${n}. `;
      } else {
        prefix = level % 2 === 0 ? '• ' : '– ';
      }
    } else {
      counters.clear();
    }
    const before = p.spaceBefore ?? (p.heading ? size * 0.9 : size * 0.35);
    if (y < topNow() - 1) y -= Math.min(before, 36);
    const lines = await linesOf(p, width - indent, prefix);
    // A heading never sits alone at the foot of a page.
    if (p.heading) room((lines[0]?.height ?? size * LINE) * 2.5);
    await drawLines(lines, x + indent, width - indent, p.align);
  }

  async function table(t: Table): Promise<void> {
    const count = Math.max(1, ...t.rows.map((r) => r.reduce((n, c) => n + (c.colSpan ?? 1), 0)));
    let widths = t.columns && t.columns.length === count ? [...t.columns] : new Array<number>(count).fill(fullWidth / count);
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    widths = widths.map((w) => (w / total) * Math.min(fullWidth, Math.max(total, fullWidth * 0.5)));
    if (y < topNow() - 1) y -= 6;
    type Laid = { cells: Array<{ x: number; width: number; lines: Line[]; paragraphs: Paragraph['align'][] }>; height: number };
    // Every cell of a row is laid out first, so the row's height is known before anything is drawn.
    const layRow = async (row: Table['rows'][number]): Promise<Laid> => {
      const cells: Laid['cells'] = [];
      let col = 0;
      let x = left;
      for (const cell of row) {
        const span = Math.max(1, cell.colSpan ?? 1);
        const width = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
        const lines: Line[] = [];
        const aligns: Paragraph['align'][] = [];
        for (const p of cell.paragraphs) {
          const ls = await linesOf(p, width - 2 * CELL_PAD, '');
          lines.push(...ls);
          aligns.push(...ls.map(() => p.align));
        }
        for (const image of cell.images ?? []) {
          // Kept to the cell's width and to a third of the page's height, in its own shape.
          const scale = Math.min(1, (width - 2 * CELL_PAD) / Math.max(1, image.width), (geometry.height - 2 * geometry.margin) / 3 / Math.max(1, image.height));
          lines.push({ words: [], width: image.width * scale, height: image.height * scale + 4, ascent: 0, image });
          aligns.push(undefined);
        }
        cells.push({ x, width, lines, paragraphs: aligns });
        x += width;
        col += span;
      }
      return { cells, height: Math.max(14, ...cells.map((c) => c.lines.reduce((h, l) => h + l.height, 0) + 2 * CELL_PAD)) };
    };
    const drawRow = async ({ cells, height }: Laid): Promise<void> => {
      const top = y;
      for (const cell of cells) {
        if (!dry) page.drawRectangle({ x: cell.x, y: top - height, width: cell.width, height, borderColor: rgb(0.62, 0.64, 0.68), borderWidth: 0.6 });
        y = top - CELL_PAD;
        for (const [i, line] of cell.lines.entries()) await drawLines([line], cell.x + CELL_PAD, cell.width - 2 * CELL_PAD, cell.paragraphs[i]);
      }
      y = top - height;
    };
    // A table's heading rows come back at the top of every page it runs on to, as a spreadsheet prints them.
    const repeat = Math.max(0, Math.min(t.headerRows ?? 0, t.rows.length - 1));
    const heading: Laid[] = [];
    for (const [r, row] of t.rows.entries()) {
      const laid = await layRow(row);
      if (r < repeat) heading.push(laid);
      const pages = doc.getPageCount();
      room(laid.height);
      if (r >= repeat && doc.getPageCount() !== pages) {
        for (const h of heading) await drawRow(h);
      }
      await drawRow(laid);
    }
  }

  /**
   * A header or footer line with tabs in it is set the way Word's header and
   * footer styles set it: the first part at the left margin, the last at the
   * right, and a middle one centred ("Confidential <tab> Page 2 of 9").
   */
  async function tabbed(p: Paragraph): Promise<boolean> {
    const parts: Run[][] = [[]];
    for (const run of p.runs) {
      run.text.split('\t').forEach((piece, i) => {
        if (i > 0) parts.push([]);
        if (piece !== '') parts[parts.length - 1]?.push({ ...run, text: piece });
      });
    }
    if (parts.length < 2) return false;
    const slots: Array<[Run[], Paragraph['align']]> =
      parts.length === 2 ? [[parts[0] ?? [], 'left'], [parts[1] ?? [], 'right']] : [[parts[0] ?? [], 'left'], [parts.slice(1, -1).flat(), 'center'], [parts[parts.length - 1] ?? [], 'right']];
    const top = y;
    let lowest = y;
    for (const [runs, align] of slots) {
      if (!runs.some((r) => r.text.trim() !== '')) continue;
      y = top;
      await drawLines(await linesOf({ kind: 'paragraph', runs }, fullWidth, ''), left, fullWidth, align);
      lowest = Math.min(lowest, y);
    }
    y = lowest;
    return true;
  }

  async function blocks(list: readonly Block[]): Promise<void> {
    for (const block of list) {
      switch (block.kind) {
        case 'paragraph':
          if (fixed && block.runs.some((r) => r.text.includes('\t')) && (await tabbed(block))) break;
          await paragraph(block, left, fullWidth);
          break;
        case 'table':
          counters.clear();
          await table(block);
          break;
        case 'image': {
          counters.clear();
          const scale = Math.min(1, fullWidth / Math.max(1, block.width), (geometry.height - 2 * geometry.margin) / Math.max(1, block.height));
          const w = block.width * scale;
          const h = block.height * scale;
          room(h + 6);
          y -= 6;
          if (!dry) {
            const image = block.format === 'png' ? await doc.embedPng(block.bytes) : await doc.embedJpg(block.bytes);
            page.drawImage(image, { x: left, y: y - h, width: w, height: h });
          }
          y -= h;
          break;
        }
        case 'page-break':
          if (!fixed) newPage();
          break;
      }
    }
  }

  const furniture = flow.furniture;
  const edge = Math.max(18, Math.min(36, geometry.margin * 0.5));
  /** How much room a header or footer takes, found by setting it without drawing. */
  const height = async (list: readonly Block[]): Promise<number> => {
    const saved = new Map(counters);
    const was = { fixed, y };
    fixed = true;
    dry = true;
    const start = (y = 10_000);
    await blocks(list);
    const used = start - y;
    dry = false;
    ({ fixed, y } = was);
    counters.clear();
    for (const [k, v] of saved) counters.set(k, v);
    return used;
  };
  if (furniture) {
    for (const [set, into] of [
      [furniture.first ?? furniture.every, roomFirst],
      [furniture.every, roomEvery],
    ] as const) {
      if (set.header) into.top = Math.max(geometry.margin, edge + (await height(set.header)) + 8);
      if (set.footer) into.bottom = Math.max(geometry.margin, edge + (await height(set.footer)) + 8);
    }
    y = topNow();
  }

  await blocks(flow.blocks);

  // Headers and footers, page by page, once the number of pages is known.
  if (furniture) {
    const total = doc.getPageCount();
    fixed = true;
    for (let i = 0; i < total; i++) {
      const set: PageFurniture = i === 0 && furniture.first ? furniture.first : furniture.every;
      page = doc.getPage(i);
      pageNumber = () => String(i + 1);
      pageTotal = () => String(total);
      if (set.header) {
        y = geometry.height - edge;
        counters.clear();
        await blocks(set.header);
      }
      if (set.footer) {
        y = edge + (await height(set.footer));
        counters.clear();
        await blocks(set.footer);
      }
    }
  }
  return { bytes: await doc.save(), pages: doc.getPageCount() };
}
