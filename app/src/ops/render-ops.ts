/**
 * The tools that read pages the way a reader does, through pdf.js in the op
 * worker (`ctx.engine()`): PDF to images and Extract text. And Compress,
 * which re-encodes the photos inside a PDF with the browser's own decoder.
 */
import type { FoolscapFile } from '../files/types';
import type { PdfView } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, forEachPdf, megabytes, ordinal, passwordFor, plural, refused, saveKeepingLock, store } from './common';
import { canDecode, shrink } from './images';
import { checkCancelled, type CompressParams, type NoParams, type Op, type OpContext, type Outcome, type PdfToImagesParams } from './op';
import { PAGES_HELP } from './pages-ops';

async function openView(ctx: OpContext, input: FoolscapFile): Promise<PdfView> {
  const engine = await ctx.engine();
  return engine.open(await ctx.workspace.read(input), { ...passwordFor(ctx, input), signal: ctx.signal });
}

export const pdfToImagesOp: Op<PdfToImagesParams> = {
  tool: 'pdf-to-images',
  arity: { kind: 'one' },
  engine: true,
  title: (params) => `PDF to ${params.format === 'png' ? 'PNG' : 'JPEG'}`,
  async run(inputs, params, ctx) {
    const input = inputs[0];
    if (input === undefined) return [refused(inputs, 'Pick one PDF.')];
    let view: PdfView;
    try {
      view = await openView(ctx, input);
    } catch (error) {
      return [failed(error, inputs)];
    }
    try {
      const n = view.pageCount;
      const pages = params.pages.trim() === '' ? PageSelection.all(n) : PageSelection.parse(params.pages, n);
      if (pages.length === 0) return [refused(inputs, PAGES_HELP)];
      const base = baseName(input.name);
      const ext = params.format === 'png' ? 'png' : 'jpg';
      const label = params.format === 'png' ? 'PNG' : 'JPEG';
      const outcomes: Outcome[] = [];
      for (const [i, index] of pages.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: pages.length, label: `Drawing page ${index + 1}` });
        try {
          const page = await view.page(index);
          const across = page.rotation === 90 || page.rotation === 270 ? page.height : page.width;
          const width = Math.max(1, Math.round((across / 72) * params.dpi));
          const bytes = await view.encode(index, { width, format: params.format, quality: 0.92, signal: ctx.signal });
          outcomes.push(
            await store(ctx, 'pdf-to-images', inputs, `${base} page ${index + 1}.${ext}`, bytes, `Page ${index + 1} as a ${params.dpi} dpi ${label}, ${megabytes(bytes.length)}`, 'image'),
          );
        } catch (error) {
          if (ctx.signal.aborted) checkCancelled(ctx.signal);
          outcomes.push(failed(error, inputs));
        }
      }
      return outcomes;
    } finally {
      await view.close();
    }
  },
};

/** What a scan gets: there are no words to give, only a picture of them. */
const NO_TEXT =
  "This PDF has no text in it, only pictures of text. It's probably a scan. Make searchable reads the words first; then extract them.";

export const extractTextOp: Op<NoParams> = {
  tool: 'extract-text',
  arity: { kind: 'each' },
  engine: true,
  title: () => 'Extract text',
  async run(inputs, _params, ctx) {
    const outcomes: Outcome[] = [];
    for (const [i, input] of inputs.entries()) {
      checkCancelled(ctx.signal);
      const which = inputs.length > 1 ? `the ${ordinal(i + 1)} file` : 'the file';
      let view: PdfView;
      try {
        view = await openView(ctx, input);
      } catch (error) {
        outcomes.push(failed(error, [input]));
        continue;
      }
      try {
        const n = view.pageCount;
        const parts: string[] = [];
        let words = 0;
        for (let index = 0; index < n; index++) {
          checkCancelled(ctx.signal);
          ctx.progress({ done: index, total: n, label: `Reading page ${index + 1} of ${which}` });
          const text = await view.text(index);
          words += text.split(/\s+/).filter(Boolean).length;
          parts.push(n > 1 ? `--- Page ${index + 1} ---\n\n${text}` : text);
        }
        if (words === 0) {
          outcomes.push(refused([input], NO_TEXT));
          continue;
        }
        const bytes = new TextEncoder().encode(parts.join('\n\n') + '\n');
        outcomes.push(
          await store(ctx, 'extract-text', [input], `${baseName(input.name)}.txt`, bytes, `${plural(words, 'word')} from ${plural(n, 'page')}`, 'text'),
        );
      } catch (error) {
        outcomes.push(failed(error, [input]));
      } finally {
        await view.close();
      }
    }
    ctx.progress({ done: inputs.length, total: inputs.length, label: 'Done' });
    return outcomes;
  },
};

/** The longest side a photo may keep, and the JPEG quality it is saved at. */
const LEVELS: Record<CompressParams['level'], { readonly maxSide: number; readonly quality: number; readonly name: string }> = {
  light: { maxSide: 3000, quality: 0.85, name: 'Light' },
  balanced: { maxSide: 2000, quality: 0.72, name: 'Balanced' },
  strong: { maxSide: 1400, quality: 0.55, name: 'Strong' },
};

/** Below this the saving is not worth a second copy of the file. */
const WORTH_IT = 0.97;

export const compressOp: Op<CompressParams> = {
  tool: 'compress',
  arity: { kind: 'each' },
  title: (params) => `Compress (${LEVELS[params.level].name.toLowerCase()})`,
  async run(inputs, params, ctx) {
    const level = LEVELS[params.level];
    const decode = canDecode();
    return forEachPdf(inputs, ctx, async (doc, input) => {
      const report = await doc.compress(async (image) => {
        checkCancelled(ctx.signal);
        if (!decode || image.ext === 'jp2') return null;
        // A small photo has little to give and a lot to lose.
        if (image.bytes.length < 24_000) return null;
        return shrink(image.bytes, image.ext === 'jpg' ? 'image/jpeg' : 'image/png', level.maxSide, level.quality);
      }, ctx.signal);
      checkCancelled(ctx.signal);
      const { bytes, relocked: relock } = await saveKeepingLock(ctx, doc, input);
      if (bytes.length >= input.size * WORTH_IT) {
        return {
          kind: 'skipped',
          inputIds: [input.id],
          reason:
            report.photos === 0
              ? "This file is already about as small as it gets. It has no photos to shrink, and that's where the size usually is."
              : `This file is already about as small as it gets${params.level === 'strong' ? '' : '. Strong may squeeze a little more, with softer photos'}.`,
        };
      }
      const saved = Math.round((1 - bytes.length / input.size) * 100);
      const photos = report.replaced > 0 ? `, ${plural(report.replaced, 'photo')} made lighter` : '';
      const lock = relock ? ', still locked with the same password' : '';
      return store(
        ctx,
        'compress',
        [input],
        `${baseName(input.name)} (compressed).pdf`,
        bytes,
        `${megabytes(input.size)} → ${megabytes(bytes.length)}, ${saved}% smaller${photos}${lock}`,
      );
    });
  },
};
