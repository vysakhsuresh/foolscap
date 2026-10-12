/**
 * The tools that read pages the way a reader does, through pdf.js in the op
 * worker (`ctx.engine()`): PDF to images and Extract text. And Compress,
 * which re-encodes the photos inside a PDF with the browser's own decoder.
 */
import type { FoolscapFile } from '../files/types';
import type { PdfView } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, forEachPdf, megabytes, ordinal, passwordFor, plural, readInput, refused, saveKeepingLock, store } from './common';
import { canDecode, shrink } from './images';
import { allLatin, languageName, PRELOADED_LANGUAGE } from '../ocr/languages';
import { readsLanguages } from '../ocr/reader';
import { documentText } from '../ocr/text';
import { checkOcrParams, type OcrParams } from './ocr-params';
import { checkCancelled, type CompressParams, type NoParams, type OcrReader, type OcrWord, type Op, type OpContext, type Outcome, type PdfToImagesParams } from './op';
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

/** 300 dpi: what Tesseract reads best. */
const OCR_DPI = 300;
/** A page with this many characters of its own text is searchable already. */
const HAS_TEXT = 40;

/** "Malayalam", "Malayalam and Hindi", "Malayalam, Hindi and Tamil". */
function namesOf(codes: readonly string[]): string {
  const names = codes.map(languageName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}` : (names[0] ?? '');
}

const onlyEnglish = (languages: readonly string[]) => languages.length === 1 && languages[0] === PRELOADED_LANGUAGE;

/**
 * Make searchable. Every page with no text of its own is drawn at 300 dpi
 * and read in the languages picked; the words go back in as invisible text
 * over the pictures, so the pages look exactly the same.
 *
 * The invisible layer is written with the PDF's built-in Helvetica, which
 * has Latin letters only (WinAnsi). Words in other scripts cannot go into it
 * as they are, and a layer of empty boxes would be worse than none, so when
 * a picked language is not written in Latin letters every word read also
 * comes out as a .txt beside the PDF, and the detail says which holds what.
 * If no word at all fitted the layer, the PDF would come out unchanged, so
 * only the text file is saved.
 */
export const ocrOp: Op<OcrParams> = {
  tool: 'ocr',
  arity: { kind: 'each' },
  engine: true,
  ocr: true,
  title: (params) => {
    const checked = checkOcrParams(params);
    return checked.ok && !onlyEnglish(checked.languages) ? `Make searchable (${namesOf(checked.languages)})` : 'Make searchable';
  },
  async run(inputs, params, ctx) {
    const checked = checkOcrParams(params);
    if (!checked.ok) return inputs.map((input) => refused([input], checked.reason));
    const { languages } = checked;
    const latin = allLatin(languages);
    const otherScripts = languages.filter((code) => !allLatin([code]));
    const outcomes: Outcome[] = [];
    let reader: OcrReader | null = null;
    try {
      reader = ctx.ocr ? await ctx.ocr() : null;
    } catch {
      reader = null;
    }
    if (reader === null) return inputs.map((input) => refused([input], "The text reader couldn't start in this browser."));
    // A language other than English is fetched from this site the first time it is picked.
    if (readsLanguages(reader)) {
      const fetching: string[] = [];
      try {
        await reader.use(languages, (code) => {
          fetching.push(code);
          ctx.progress({ done: 0, total: 0, label: `Getting the ${languageName(code)} reader (first time only)…` });
        });
      } catch {
        checkCancelled(ctx.signal);
        const missing = fetching[fetching.length - 1];
        const what = missing === undefined ? namesOf(languages) : languageName(missing);
        return inputs.map((input) =>
          refused([input], `The ${what} reader couldn't be downloaded. It comes from this site the first time you pick it; check the connection and try again.`),
        );
      }
    } else if (!onlyEnglish(languages)) {
      return inputs.map((input) => refused([input], 'Only English can be read in this browser.'));
    }
    for (const [f, input] of inputs.entries()) {
      checkCancelled(ctx.signal);
      const which = inputs.length > 1 ? ` of the ${ordinal(f + 1)} file` : '';
      // First, read: draw every page that has no text of its own and find the words in it.
      const found = new Map<number, OcrWord[]>();
      let pageCount = 0;
      let alreadyText = 0;
      try {
        const view = await openView(ctx, input);
        try {
          pageCount = view.pageCount;
          for (let index = 0; index < pageCount; index++) {
            checkCancelled(ctx.signal);
            ctx.progress({ done: index, total: pageCount, label: `Reading page ${index + 1} of ${pageCount}${which}` });
            if ((await view.text(index)).replace(/\s+/g, '').length >= HAS_TEXT) {
              alreadyText++;
              continue;
            }
            const page = await view.page(index);
            const sideways = page.rotation === 90 || page.rotation === 270;
            const across = sideways ? page.height : page.width;
            const down = sideways ? page.width : page.height;
            const width = Math.round((across / 72) * OCR_DPI);
            const png = await view.encode(index, { width, format: 'png', signal: ctx.signal });
            // The engine may draw it smaller to stay inside its pixel budget; the PNG's own header says what came out.
            const words = await reader.read(png, pngWidth(png) ?? width, pngHeight(png) ?? Math.round((width * down) / across));
            if (words.length > 0) found.set(index, words);
          }
        } finally {
          await view.close();
        }
      } catch (error) {
        outcomes.push(failed(error, [input]));
        continue;
      }
      if (alreadyText === pageCount) {
        outcomes.push({ kind: 'skipped', inputIds: [input.id], reason: 'Every page of this file already has text you can search and copy.' });
        continue;
      }
      if (found.size === 0) {
        outcomes.push(refused([input], 'No words could be read in this file. If it is a photo, try Scan first for a straighter, sharper page.'));
        continue;
      }
      let read = 0;
      for (const list of found.values()) read += list.length;
      const pages = plural(found.size, 'page');
      // Then, write: the words go in as invisible text over the pictures.
      ctx.progress({ done: pageCount, total: pageCount, label: 'Writing the file…' });
      let doc;
      try {
        doc = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
      } catch (error) {
        outcomes.push(failed(error, [input]));
        continue;
      }
      try {
        let placed = 0;
        for (const [index, list] of found) placed += doc.addTextLayer(index, list);
        const text = latin ? null : new TextEncoder().encode(documentText(found, pageCount));
        const textName = `${baseName(input.name)} (text).txt`;
        if (text !== null && placed === 0) {
          outcomes.push(
            await store(
              ctx,
              'ocr',
              [input],
              textName,
              text,
              `${plural(read, 'word')} read on ${pages}, saved as text you can search and copy. A PDF can't hold ${namesOf(otherScripts)} letters as searchable text here yet, so the PDF is left as it was`,
              'text',
            ),
          );
          continue;
        }
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        const lock = relocked ? ', still locked with the same password' : '';
        outcomes.push(
          await store(
            ctx,
            'ocr',
            [input],
            `${baseName(input.name)} (searchable).pdf`,
            bytes,
            text === null
              ? `${plural(placed, 'word')} read on ${pages}. You can now search, select and copy them${lock}`
              : `${plural(read, 'word')} read on ${pages}. The PDF can search only the ${placed} in Latin letters${lock}; every word is in the text file`,
          ),
        );
        if (text !== null) {
          outcomes.push(await store(ctx, 'ocr', [input], textName, text, `All ${plural(read, 'word')}, page by page, as text you can search and copy`, 'text'));
        }
      } catch (error) {
        outcomes.push(failed(error, [input]));
      } finally {
        doc.close();
      }
    }
    ctx.progress({ done: inputs.length, total: inputs.length, label: 'Done' });
    return outcomes;
  },
};

/** A PNG's own width and height, from its header. */
function pngWidth(png: Uint8Array): number | null {
  return png.length >= 24 ? new DataView(png.buffer, png.byteOffset).getUint32(16) : null;
}

function pngHeight(png: Uint8Array): number | null {
  return png.length >= 24 ? new DataView(png.buffer, png.byteOffset).getUint32(20) : null;
}
