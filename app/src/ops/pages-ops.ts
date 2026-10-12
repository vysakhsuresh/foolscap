/**
 * The Pages family beyond merge, split and organise: extract or remove pages,
 * insert pages, crop, split by size, and pages per sheet.
 */
import type { FoolscapFile } from '../files/types';
import type { PdfDoc } from '../pdf';
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
          try {
            await out.appendPages(other, PageSelection.all(other.pageCount));
            added += other.pageCount;
          } finally {
            other.close();
          }
        }
      }
      if (rest.length > 0) await out.appendPages(doc, rest);
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
      out.close();
      doc.close();
    }
  },
};

export const cropOp: Op<CropParams> = {
  tool: 'crop',
  arity: { kind: 'each' },
  title: (p) => (p.mode === 'trim' ? `Trim ${p.mm} mm` : `Fit to ${PAPER[p.paper].label}`),
  async run(inputs, params, ctx) {
    if (params.mode === 'trim' && !(params.mm > 0 && params.mm <= 100)) {
      return inputs.map((input) => refused([input], 'Choose a margin between 1 and 100 mm.'));
    }
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const base = baseName(input.name);
      if (params.mode === 'trim') {
        const inset = (params.mm * 72) / 25.4;
        for (let i = 0; i < doc.pageCount; i++) {
          const box = doc.visibleBox(i);
          if (box.width - inset * 2 < 36 || box.height - inset * 2 < 36) {
            return refused([input], `${params.mm} mm from every edge would leave almost nothing of page ${i + 1}. Use a smaller margin.`);
          }
          doc.setVisibleBox(i, { x: box.x + inset, y: box.y + inset, width: box.width - inset * 2, height: box.height - inset * 2 });
        }
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        return store(ctx, 'crop', [input], `${base} cropped.pdf`, bytes, `${params.mm} mm trimmed from every edge of ${plural(doc.pageCount, 'page')}${lockNote(relocked)}`);
      }
      const paper = PAPER[params.paper];
      const out = await ctx.surgeon.create();
      try {
        for (const [i, page] of doc.pages().entries()) {
          checkCancelled(ctx.signal);
          const box = doc.visibleBox(i);
          const sideways = page.rotation === 90 || page.rotation === 270;
          const landscape = (sideways ? box.height : box.width) > (sideways ? box.width : box.height);
          const w = landscape ? paper.height : paper.width;
          const h = landscape ? paper.width : paper.height;
          await out.composePage(w, h, [{ source: doc, index: i, box: { x: 0, y: 0, width: w, height: h } }]);
        }
        const { bytes, relocked } = await saveKeepingLock(ctx, out, input, doc.wasEncrypted);
        return store(ctx, 'crop', [input], `${base} on ${paper.label}.pdf`, bytes, `${plural(doc.pageCount, 'page')} put on ${paper.label}${lockNote(relocked)}`);
      } finally {
        out.close();
      }
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
