/**
 * The Pages family beyond merge, split and organise: extract or remove pages,
 * insert pages, crop, split by size, and pages per sheet.
 */
import type { FoolscapFile } from '../files/types';
import type { Box, PdfDoc, PdfView, Rotation } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, forEachPdf, lockNote, megabytes, ordinal, passwordFor, plural, readInput, refused, saveKeepingLock, store } from './common';
import {
  checkCancelled,
  type CropParams,
  type ExtractPagesParams,
  type InsertPagesParams,
  type NUpParams,
  type Op,
  type Outcome,
  type Paper,
  type SplitBySizeParams,
} from './op';

export const PAPER: Record<Paper, { readonly width: number; readonly height: number; readonly label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4' },
  letter: { width: 612, height: 792, label: 'Letter' },
};

export const PAGES_HELP = 'Type the pages, like 1-3, 7, 12-';

/** What a new file made from one document keeps of it: the bookmarks, labels and details that belong to its pages. */
const KEEP = { bookmarks: true, labels: true, details: true } as const;

async function openOne(ctx: Parameters<Op['run']>[2], input: FoolscapFile): Promise<PdfDoc> {
  return ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
}

export const extractPagesOp: Op<ExtractPagesParams> = {
  tool: 'extract-pages',
  arity: { kind: 'one' },
  title: (p) => (p.mode === 'keep' ? 'Keep pages' : 'Remove pages'),
  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined) return [refused(inputs, 'Pick one PDF.')];
    let source: PdfDoc;
    try {
      source = await openOne(ctx, input);
    } catch (error) {
      return [failed(error, inputs)];
    }
    try {
      const n = source.pageCount;
      const typed = PageSelection.parse(params.pages, n);
      if (typed.length === 0) return [refused(inputs, PAGES_HELP)];
      const keep = params.mode === 'keep' ? typed : PageSelection.invert(typed, n);
      if (keep.length === 0) return [refused(inputs, 'That would remove every page. Leave at least one.')];
      if (keep.length === n) {
        return [refused(inputs, params.mode === 'keep' ? 'Those are all the pages, so nothing would change.' : 'None of those pages are in this file.')];
      }
      ctx.progress({ done: 0, total: 0, label: 'Writing the file…' });
      const out = await ctx.surgeon.create();
      try {
        await out.appendPages(source, keep);
        out.carryOver(source, KEEP);
        const base = baseName(input.name);
        const name =
          params.mode === 'keep'
            ? `${base} pages ${PageSelection.describe(keep)}.pdf`
            : `${base} without pages ${PageSelection.describe(typed)}.pdf`;
        const { bytes, relocked } = await saveKeepingLock(ctx, out, input, source.wasEncrypted);
        const detail =
          (params.mode === 'keep'
            ? `${plural(keep.length, 'page')} kept of ${n}`
            : `${plural(n - keep.length, 'page')} removed, ${keep.length} left`) + lockNote(relocked);
        return [await store(ctx, 'extract-pages', inputs, name, bytes, detail)];
      } finally {
        out.close();
      }
    } catch (error) {
      return [failed(error, inputs)];
    } finally {
      source.close();
    }
  },
};

export const insertPagesOp: Op<InsertPagesParams> = {
  tool: 'insert-pages',
  arity: { kind: 'together', min: 1 },
  title: (p) => (p.what === 'blank' ? 'Insert blank pages' : 'Insert pages from other files'),
  async run(inputs, params, ctx) {
    const [target, ...extras] = inputs;
    if (target === undefined) return [refused(inputs, 'Pick the PDF to add pages to.')];
    if (params.what === 'files' && extras.length === 0) {
      return [refused(inputs, 'Add the PDF to put in as well. The first file is the one that gets the pages.')];
    }
    const blanks = Math.floor(params.blankCount);
    if (params.what === 'blank' && !(blanks >= 1 && blanks <= 500)) {
      return [refused(inputs, 'Choose between 1 and 500 blank pages.')];
    }
    let doc: PdfDoc;
    try {
      doc = await openOne(ctx, target);
    } catch (error) {
      return [failed(error, [target])];
    }
    const out = await ctx.surgeon.create();
    const others: PdfDoc[] = [];
    try {
      const n = doc.pageCount;
      // Replacing: the typed pages come out, and the new ones go where the first of them was.
      const replacing = params.replace !== undefined && params.replace.trim() !== '' ? PageSelection.parse(params.replace, n) : null;
      if (replacing !== null && replacing.length === 0) return [refused(inputs, PAGES_HELP)];
      if (replacing !== null && replacing.length === n && params.what === 'blank') return [refused(inputs, 'That would replace every page with blank ones.')];
      const gone = new Set(replacing ?? []);
      const after = replacing !== null ? replacing[0]! : Math.min(n, Math.max(0, Math.floor(params.after)));
      const before = PageSelection.all(n).slice(0, after).filter((i) => !gone.has(i));
      const rest = PageSelection.all(n).slice(after).filter((i) => !gone.has(i));
      if (before.length > 0) await out.appendPages(doc, before);
      let added = 0;
      if (params.what === 'blank') {
        const like = doc.pages()[Math.max(0, after - 1)] ?? doc.pages()[0];
        const sideways = like !== undefined && (like.rotation === 90 || like.rotation === 270);
        const width = like === undefined ? PAPER.a4.width : sideways ? like.height : like.width;
        const height = like === undefined ? PAPER.a4.height : sideways ? like.width : like.height;
        for (let i = 0; i < blanks; i++) out.addBlankPage(width, height);
        added = blanks;
      } else {
        for (const [i, extra] of extras.entries()) {
          checkCancelled(ctx.signal);
          ctx.progress({ done: i, total: extras.length, label: `Adding the ${ordinal(i + 2)} file` });
          let other: PdfDoc;
          try {
            other = await openOne(ctx, extra);
          } catch (error) {
            return [failed(error, [extra])];
          }
          // Kept open until the main file's pages are all in, so its bookmarks can follow the main file's.
          others.push(other);
          await out.appendPages(other, PageSelection.all(other.pageCount));
          added += other.pageCount;
        }
      }
      if (rest.length > 0) await out.appendPages(doc, rest);
      out.carryOver(doc, KEEP);
      for (const other of others) out.carryOver(other, { bookmarks: true });
      ctx.progress({ done: 0, total: 0, label: 'Writing the file…' });
      const { bytes, relocked } = await saveKeepingLock(ctx, out, target, doc.wasEncrypted);
      if (replacing !== null) {
        const detail = `${replacing.length === 1 ? 'Page' : 'Pages'} ${PageSelection.describe(replacing)} replaced with ${plural(added, params.what === 'blank' ? 'blank page' : 'page')}, ${out.pageCount} in all${lockNote(relocked)}`;
        return [await store(ctx, 'insert-pages', inputs, `${baseName(target.name)} with pages replaced.pdf`, bytes, detail)];
      }
      const where = after === 0 ? 'at the start' : after === n ? 'at the end' : `after page ${after}`;
      const detail = `${plural(added, params.what === 'blank' ? 'blank page' : 'page')} added ${where}, ${out.pageCount} in all${lockNote(relocked)}`;
      return [await store(ctx, 'insert-pages', inputs, `${baseName(target.name)} with pages added.pdf`, bytes, detail)];
    } catch (error) {
      return [failed(error, [target])];
    } finally {
      for (const other of others) other.close();
      out.close();
      doc.close();
    }
  },
};

/** A rectangle on a page as the reader sees it, in fractions from the top-left. */
export interface SeenBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * The page's own (stored) rectangle for a rectangle the reader sees. `box`
 * is the visible box in the page's own space, `rotation` its /Rotate: a page
 * stored portrait and shown turned has its "top" on a stored side.
 */
export function seenToStored(box: Box, rotation: Rotation, seen: SeenBox): Box {
  const sideways = rotation === 90 || rotation === 270;
  const w = sideways ? box.height : box.width;
  const h = sideways ? box.width : box.height;
  const toStored = (vx: number, vy: number): [number, number] => {
    switch (rotation) {
      case 0:
        return [box.x + vx, box.y + vy];
      case 90:
        return [box.x + box.width - vy, box.y + vx];
      case 180:
        return [box.x + box.width - vx, box.y + box.height - vy];
      case 270:
        return [box.x + vy, box.y + box.height - vx];
    }
  };
  const [ax, ay] = toStored(seen.x0 * w, (1 - seen.y1) * h);
  const [bx, by] = toStored(seen.x1 * w, (1 - seen.y0) * h);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

const MM = 72 / 25.4;
/** The smallest a trimmed page may be, in points: half an inch each way. */
const SMALLEST = 36;
/** Room left around what auto-crop finds, in points (2 mm). */
const AUTO_PAD = 2 * MM;

/** Where the ink is on a rendered page, as fractions from the top-left; null for a blank page. */
export function inkBounds(data: Uint8ClampedArray, width: number, height: number): SeenBox | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const at = row + x * 4;
      // Near-white or transparent is paper; anything else is ink.
      if ((data[at + 3] ?? 0) < 16) continue;
      if ((data[at] ?? 255) > 242 && (data[at + 1] ?? 255) > 242 && (data[at + 2] ?? 255) > 242) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0: x0 / width, y0: y0 / height, x1: (x1 + 1) / width, y1: (y1 + 1) / height };
}

async function inkOf(view: PdfView, index: number, signal: AbortSignal): Promise<SeenBox | null> {
  const page = await view.page(index);
  const across = page.rotation === 90 || page.rotation === 270 ? page.height : page.width;
  // Two pixels a point: within half a point of the real edge.
  const png = await view.encode(index, { width: Math.max(1, Math.round(across * 2)), format: 'png', signal });
  const bitmap = await createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = canvas.getContext('2d');
    if (g === null) return null;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, bitmap.width, bitmap.height);
    g.drawImage(bitmap, 0, 0);
    return inkBounds(g.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function openView(ctx: Parameters<Op['run']>[2], input: FoolscapFile): Promise<PdfView> {
  const engine = await ctx.engine();
  return engine.open(await ctx.workspace.read(input), { ...passwordFor(ctx, input), signal: ctx.signal });
}

const mmText = (mm: number): string => `${Math.round(mm * 10) / 10} mm`;

export const cropOp: Op<CropParams> = {
  tool: 'crop',
  arity: { kind: 'each' },
  engine: true,
  title: (p) => (p.mode === 'trim' ? (p.edges ? 'Trim each edge' : `Trim ${p.mm} mm`) : p.mode === 'auto' ? 'Remove white margins' : `Fit to ${PAPER[p.paper].label}`),
  async run(inputs, params, ctx) {
    if (params.mode === 'trim') {
      const all = params.edges ? [params.edges.top, params.edges.right, params.edges.bottom, params.edges.left] : [params.mm];
      if (!all.every((v) => Number.isFinite(v) && v >= 0 && v <= 300) || !all.some((v) => v > 0)) {
        return inputs.map((input) => refused([input], params.edges ? 'Give each edge a margin between 0 and 300 mm, and at least one more than 0.' : 'Choose a margin between 1 and 100 mm.'));
      }
      if (!params.edges && !(params.mm > 0 && params.mm <= 100)) return inputs.map((input) => refused([input], 'Choose a margin between 1 and 100 mm.'));
    }
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const base = baseName(input.name);
      const n = doc.pageCount;
      const chosen = params.pages === undefined || params.pages.trim() === '' ? PageSelection.all(n) : PageSelection.parse(params.pages, n);
      if (chosen.length === 0) return refused([input], `This file has ${plural(n, 'page')}; none of the pages typed are in it.`);
      const which = chosen.length === n ? plural(n, 'page') : `${chosen.length === 1 ? 'page' : 'pages'} ${PageSelection.describe(chosen)}`;
      const infos = doc.pages();
      if (params.mode === 'trim') {
        const e = params.edges ?? { top: params.mm, right: params.mm, bottom: params.mm, left: params.mm };
        for (const i of chosen) {
          const box = doc.visibleBox(i);
          const rotation = infos[i]?.rotation ?? 0;
          const sideways = rotation === 90 || rotation === 270;
          const w = sideways ? box.height : box.width;
          const h = sideways ? box.width : box.height;
          if (w - (e.left + e.right) * MM < SMALLEST || h - (e.top + e.bottom) * MM < SMALLEST) {
            return refused([input], `That much off the edges would leave almost nothing of page ${i + 1}. Use smaller margins.`);
          }
          doc.setVisibleBox(i, seenToStored(box, rotation, { x0: (e.left * MM) / w, y0: (e.top * MM) / h, x1: 1 - (e.right * MM) / w, y1: 1 - (e.bottom * MM) / h }));
        }
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        const what = params.edges
          ? `${mmText(e.top)} off the top, ${mmText(e.right)} right, ${mmText(e.bottom)} bottom and ${mmText(e.left)} left of ${which}`
          : `${mmText(params.mm)} trimmed from every edge of ${which}`;
        return store(ctx, 'crop', [input], `${base} cropped.pdf`, bytes, `${what}${lockNote(relocked)}`);
      }
      if (params.mode === 'auto') {
        const view = await openView(ctx, input);
        let trimmed = 0;
        try {
          for (const [k, i] of chosen.entries()) {
            checkCancelled(ctx.signal);
            ctx.progress({ done: k, total: chosen.length, label: `Finding the margins of page ${i + 1}` });
            const ink = await inkOf(view, i, ctx.signal);
            if (ink === null) continue;
            const box = doc.visibleBox(i);
            const rotation = infos[i]?.rotation ?? 0;
            const sideways = rotation === 90 || rotation === 270;
            const w = sideways ? box.height : box.width;
            const h = sideways ? box.width : box.height;
            const pad = { x: AUTO_PAD / w, y: AUTO_PAD / h };
            const seen = { x0: Math.max(0, ink.x0 - pad.x), y0: Math.max(0, ink.y0 - pad.y), x1: Math.min(1, ink.x1 + pad.x), y1: Math.min(1, ink.y1 + pad.y) };
            // Less than a millimetre to gain all round: leave the page alone.
            if ((seen.x0 + 1 - seen.x1) * w < MM && (seen.y0 + 1 - seen.y1) * h < MM) continue;
            if ((seen.x1 - seen.x0) * w < 1 || (seen.y1 - seen.y0) * h < 1) continue;
            doc.setVisibleBox(i, seenToStored(box, rotation, seen));
            trimmed++;
          }
        } finally {
          await view.close();
        }
        if (trimmed === 0) return refused([input], 'No white margins to remove: what is on the pages already runs to their edges, or they are blank.');
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        const detail = trimmed === chosen.length ? `White margins removed from ${which}` : `White margins removed from ${plural(trimmed, 'page')} of ${chosen.length}; the rest had none`;
        return store(ctx, 'crop', [input], `${base} cropped.pdf`, bytes, `${detail}${lockNote(relocked)}`);
      }
      const paper = PAPER[params.paper];
      const enlarge = params.enlarge !== false;
      for (const i of chosen) {
        checkCancelled(ctx.signal);
        const box = doc.visibleBox(i);
        const rotation = infos[i]?.rotation ?? 0;
        const sideways = rotation === 90 || rotation === 270;
        const landscape = (sideways ? box.height : box.width) > (sideways ? box.width : box.height);
        doc.fitToPaper(i, landscape ? paper.height : paper.width, landscape ? paper.width : paper.height, enlarge);
      }
      const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
      return store(ctx, 'crop', [input], `${base} on ${paper.label}.pdf`, bytes, `${which[0]?.toUpperCase()}${which.slice(1)} put on ${paper.label}${enlarge ? '' : ', smaller pages at their real size'}${lockNote(relocked)}`);
    });
  },
};

export const nUpOp: Op<NUpParams> = {
  tool: 'n-up',
  arity: { kind: 'each' },
  title: (p) => `${p.perSheet} pages per sheet`,
  async run(inputs, params, ctx) {
    const per = params.perSheet === 4 ? 4 : 2;
    const paper = PAPER[params.paper];
    // Two up: a landscape sheet, two pages side by side. Four up: a portrait sheet, two by two.
    const sheetW = per === 2 ? paper.height : paper.width;
    const sheetH = per === 2 ? paper.width : paper.height;
    const margin = 18;
    const gap = 12;
    const cols = 2;
    const rows = per === 2 ? 1 : 2;
    const cellW = (sheetW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = (sheetH - margin * 2 - gap * (rows - 1)) / rows;
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const out = await ctx.surgeon.create();
      try {
        for (let first = 0; first < doc.pageCount; first += per) {
          checkCancelled(ctx.signal);
          const placements = [];
          for (let k = 0; k < per && first + k < doc.pageCount; k++) {
            const col = k % cols;
            const row = Math.floor(k / cols);
            placements.push({
              source: doc,
              index: first + k,
              box: { x: margin + col * (cellW + gap), y: sheetH - margin - (row + 1) * cellH - row * gap, width: cellW, height: cellH },
            });
          }
          await out.composePage(sheetW, sheetH, placements);
        }
        const { bytes, relocked } = await saveKeepingLock(ctx, out, input, doc.wasEncrypted);
        const detail = `${plural(doc.pageCount, 'page')} on ${plural(out.pageCount, 'sheet')} of ${paper.label}${lockNote(relocked)}`;
        return store(ctx, 'n-up', [input], `${baseName(input.name)} ${per}-up.pdf`, bytes, detail);
      } finally {
        out.close();
      }
    });
  },
};

export const splitBySizeOp: Op<SplitBySizeParams> = {
  tool: 'split-by-size',
  arity: { kind: 'one' },
  title: (p) => `Parts under ${p.megabytes} MB`,
  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined) return [refused(inputs, 'Pick one PDF.')];
    if (!(params.megabytes >= 1 && params.megabytes <= 1000)) return [refused(inputs, 'Choose a size between 1 and 1000 MB.')];
    const limit = params.megabytes * 1_000_000;
    if (input.size <= limit) {
      return [refused(inputs, `This file is already under ${params.megabytes} MB (${megabytes(input.size)}), so there is nothing to split.`)];
    }
    let source: PdfDoc;
    try {
      source = await openOne(ctx, input);
    } catch (error) {
      return [failed(error, inputs)];
    }
    try {
      const n = source.pageCount;
      const base = baseName(input.name);
      const outcomes: Outcome[] = [];

      // Saving is the only honest way to know a part's size: shared fonts and
      // images are copied into each part, so pages do not add up. Each part
      // is found by doubling its length until it is too big, then halving
      // back, so a 300-page file needs a few dozen saves rather than 300.
      const build = async (from: number, to: number): Promise<Uint8Array> => {
        const part = await ctx.surgeon.create();
        try {
          await part.appendPages(source, PageSelection.all(n).slice(from, to + 1));
          part.carryOver(source, KEEP);
          return (await saveKeepingLock(ctx, part, input, source.wasEncrypted)).bytes;
        } finally {
          part.close();
        }
      };

      let start = 0;
      let partNo = 0;
      while (start < n) {
        checkCancelled(ctx.signal);
        partNo++;
        ctx.progress({ done: start, total: n, label: `Sizing part ${partNo}` });
        let bestEnd = start;
        let bestBytes = await build(start, start);
        if (bestBytes.length <= limit) {
          let step = 1;
          let tooBig = n;
          while (bestEnd < n - 1) {
            const candidate = Math.min(n - 1, bestEnd + step);
            const bytes = await build(start, candidate);
            if (bytes.length <= limit) {
              bestEnd = candidate;
              bestBytes = bytes;
              step *= 2;
            } else {
              tooBig = candidate;
              break;
            }
          }
          let lo = bestEnd + 1;
          let hi = tooBig - 1;
          while (lo <= hi) {
            checkCancelled(ctx.signal);
            const mid = Math.floor((lo + hi) / 2);
            const bytes = await build(start, mid);
            if (bytes.length <= limit) {
              bestEnd = mid;
              bestBytes = bytes;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
        }
        const pages = PageSelection.describe(PageSelection.all(n).slice(start, bestEnd + 1));
        const over = bestBytes.length > limit ? `, bigger than ${params.megabytes} MB on its own` : '';
        outcomes.push(
          await store(ctx, 'split-by-size', inputs, `${base} part ${partNo}.pdf`, bestBytes, `${megabytes(bestBytes.length)}, page${bestEnd > start ? 's' : ''} ${pages}${over}`),
        );
        start = bestEnd + 1;
      }
      ctx.progress({ done: n, total: n, label: 'Done' });
      return outcomes;
    } catch (error) {
      return [failed(error, inputs)];
    } finally {
      source.close();
    }
  },
};
