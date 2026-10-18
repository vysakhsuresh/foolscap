/**
 * The tools that read pages the way a reader does, through pdf.js in the op
 * worker (`ctx.engine()`): PDF to images and Extract text. And Compress,
 * which re-encodes the photos inside a PDF with the browser's own decoder.
 */
import type { FoolscapFile } from '../files/types';
import type { PdfDoc, PdfView } from '../pdf';
import { PageSelection } from '../pdf/page-selection';
import { baseName, failed, forEachPdf, megabytes, ordinal, passwordFor, plural, readInput, refused, saveKeepingLock, store } from './common';
import { canDecode, shrink } from './images';
import { languageName, PRELOADED_LANGUAGE } from '../ocr/languages';
import { readsLanguages } from '../ocr/reader';
import { checkOcrParams, type OcrParams } from './ocr-params';
import { checkCancelled, type CompressParams, type NoParams, type OcrReader, type OcrWord, type Op, type OpContext, type Outcome, type PdfToImagesParams } from './op';
import { PAGES_HELP } from './pages-ops';
import { SCAN_COVER } from '../pdf/page-cover';

export async function openView(ctx: OpContext, input: FoolscapFile): Promise<PdfView> {
  const engine = await ctx.engine();
  // The file opened a second time, by the surgeon, only if a page has marked
  // content: its /ActualText is what Malayalam and Hindi clusters really say,
  // and pdf.js does not read it (pdf/actual-text.ts).
  let doc: Promise<PdfDoc | null> | null = null;
  const marked = async (index: number) => {
    doc ??= (async () => ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input)))().catch(() => null);
    return (await doc)?.markedSections(index) ?? null;
  };
  const view = await engine.open(await ctx.workspace.read(input), { ...passwordFor(ctx, input), signal: ctx.signal, marked });
  const close = async () => {
    try {
      await view.close();
    } finally {
      (await doc)?.close();
    }
  };
  return Object.create(view, { close: { value: close } }) as PdfView;
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
        const empty: number[] = [];
        let words = 0;
        for (let index = 0; index < n; index++) {
          checkCancelled(ctx.signal);
          ctx.progress({ done: index, total: n, label: `Reading page ${index + 1} of ${which}` });
          const text = await view.text(index);
          const count = text.split(/\s+/).filter(Boolean).length;
          words += count;
          if (count === 0) empty.push(index);
          parts.push(n > 1 ? `--- Page ${index + 1} ---\n\n${text}` : text);
        }
        if (words === 0) {
          outcomes.push(refused([input], NO_TEXT));
          continue;
        }
        // A page with no words is usually a scan in among typed pages: say so, rather than let "from 3 pages" imply all three.
        const blank =
          empty.length === 0
            ? ''
            : `. ${empty.length === 1 ? 'Page' : 'Pages'} ${PageSelection.describe(empty)} ${empty.length === 1 ? 'has' : 'have'} no words in ${empty.length === 1 ? 'it' : 'them'}, only pictures: Make searchable reads those`;
        const bytes = new TextEncoder().encode(parts.join('\n\n') + '\n');
        outcomes.push(
          await store(ctx, 'extract-text', [input], `${baseName(input.name)}.txt`, bytes, `${plural(words, 'word')} from ${plural(n, 'page')}${blank}`, 'text'),
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
const LEVELS: Record<Exclude<CompressParams['level'], 'target'>, { readonly maxSide: number; readonly quality: number; readonly name: string }> = {
  light: { maxSide: 3000, quality: 0.85, name: 'Light' },
  balanced: { maxSide: 2000, quality: 0.72, name: 'Balanced' },
  strong: { maxSide: 1400, quality: 0.55, name: 'Strong' },
};

/**
 * For "under 200 KB": photo settings from gentle to harsh. Sizes fall as the
 * list goes on, so a binary search finds the gentlest one that fits.
 */
const PHOTO_LADDER: ReadonlyArray<{ readonly maxSide: number; readonly quality: number }> = [
  { maxSide: 3000, quality: 0.85 },
  { maxSide: 2200, quality: 0.75 },
  { maxSide: 1600, quality: 0.65 },
  { maxSide: 1200, quality: 0.55 },
  { maxSide: 950, quality: 0.45 },
  { maxSide: 750, quality: 0.38 },
  { maxSide: 600, quality: 0.3 },
  { maxSide: 450, quality: 0.24 },
];

/** When photos are not enough and pictures are allowed: whole pages as JPEG, sharpest first. */
const PICTURE_LADDER: ReadonlyArray<{ readonly dpi: number; readonly quality: number }> = [
  { dpi: 150, quality: 0.7 },
  { dpi: 120, quality: 0.6 },
  { dpi: 100, quality: 0.5 },
  { dpi: 85, quality: 0.45 },
  { dpi: 72, quality: 0.4 },
  { dpi: 60, quality: 0.35 },
];

/** Below this the saving is not worth a second copy of the file. */
const WORTH_IT = 0.97;

/** The first index in [0, n) for which `fits` is true, assuming once true it stays true; n when none is. */
async function firstFit(n: number, fits: (i: number) => Promise<boolean>): Promise<number> {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (await fits(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const kb = (bytes: number): string => (bytes >= 1_000_000 ? megabytes(bytes) : `${Math.max(1, Math.round(bytes / 1000))} KB`);

export const compressOp: Op<CompressParams> = {
  tool: 'compress',
  arity: { kind: 'each' },
  engine: true,
  title: (params) => (params.level === 'target' ? `Compress to ${params.targetKb ?? 200} KB` : `Compress (${LEVELS[params.level].name.toLowerCase()})`),
  async run(inputs, params, ctx) {
    if (params.level === 'target') return compressToTarget(inputs, params, ctx);
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

/**
 * "Under 200 KB", as upload forms ask. First the photos are shrunk, as gently
 * as the limit allows; if that cannot reach it and pictures are allowed, the
 * pages themselves become pictures, as sharp as the limit allows. Each try
 * starts again from the original, so nothing is squeezed twice.
 */
async function compressToTarget(inputs: readonly FoolscapFile[], params: CompressParams, ctx: OpContext): Promise<Outcome[]> {
  const limit = Math.round((params.targetKb ?? 200) * 1000);
  if (!Number.isFinite(limit) || limit < 10_000) return inputs.map((i) => refused([i], 'Choose a size of at least 10 KB.'));
  const decode = canDecode();
  const outcomes: Outcome[] = [];
  for (const [n, input] of inputs.entries()) {
    checkCancelled(ctx.signal);
    const which = inputs.length > 1 ? ` (${ordinal(n + 1)} file)` : '';
    if (input.size <= limit) {
      outcomes.push({ kind: 'skipped', inputIds: [input.id], reason: `This file is already ${kb(input.size)}, under ${kb(limit)}. Nothing to do.` });
      continue;
    }
    try {
      // 1. Photos, gentlest first.
      const tried = new Map<number, Uint8Array>();
      const withPhotos = async (i: number): Promise<Uint8Array> => {
        const cached = tried.get(i);
        if (cached) return cached;
        const step = PHOTO_LADDER[i]!;
        ctx.progress({ done: 0, total: 0, label: `Trying gentler and stronger settings${which}…` });
        const doc = await ctx.surgeon.open(await readInput(ctx, input), passwordFor(ctx, input));
        try {
          await doc.compress(async (image) => {
            checkCancelled(ctx.signal);
            if (!decode || image.ext === 'jp2' || image.bytes.length < 6_000) return null;
            return shrink(image.bytes, image.ext === 'jpg' ? 'image/jpeg' : 'image/png', step.maxSide, step.quality);
          }, ctx.signal);
          const bytes = (await saveKeepingLock(ctx, doc, input)).bytes;
          tried.set(i, bytes);
          return bytes;
        } finally {
          doc.close();
        }
      };
      const photoIndex = await firstFit(PHOTO_LADDER.length, async (i) => (await withPhotos(i)).length <= limit);
      if (photoIndex < PHOTO_LADDER.length) {
        const bytes = await withPhotos(photoIndex);
        const gentle = photoIndex <= 2 ? 'photos still sharp' : photoIndex <= 5 ? 'photos a little softer' : 'photos noticeably softer';
        outcomes.push(await store(ctx, 'compress', [input], `${baseName(input.name)} (under ${kb(limit)}).pdf`, bytes, `${kb(input.size)} → ${kb(bytes.length)}, under ${kb(limit)}; text untouched, ${gentle}`));
        continue;
      }
      const smallest = await withPhotos(PHOTO_LADDER.length - 1);
      // No smaller than it was: say so, rather than hand back a copy of the same weight.
      const noGain = (bytes: Uint8Array) => bytes.length >= input.size * WORTH_IT;
      if (!params.allowPictures && noGain(smallest)) {
        outcomes.push({
          kind: 'skipped',
          inputIds: [input.id],
          reason: `This file is already as small as it gets with its words kept as text (${kb(input.size)}). Getting it under ${kb(limit)} means turning its pages into pictures: tick "Let pages become pictures" and run it again.`,
        });
        continue;
      }
      if (!params.allowPictures) {
        outcomes.push(
          await store(
            ctx,
            'compress',
            [input],
            `${baseName(input.name)} (compressed).pdf`,
            smallest,
            `${kb(input.size)} → ${kb(smallest.length)}. That is as small as it gets with the words kept as text; ${kb(limit)} needs the pages turned into pictures (tick "Let pages become pictures")`,
          ),
        );
        continue;
      }
      // 2. Pages as pictures, sharpest first.
      const engine = await ctx.engine();
      const pictures = new Map<number, Uint8Array>();
      const asPictures = async (i: number): Promise<Uint8Array> => {
        const cached = pictures.get(i);
        if (cached) return cached;
        const step = PICTURE_LADDER[i]!;
        ctx.progress({ done: 0, total: 0, label: `Turning pages into pictures at ${step.dpi} dpi${which}…` });
        const view = await engine.open(await ctx.workspace.read(input), { ...passwordFor(ctx, input), signal: ctx.signal });
        const out = await ctx.surgeon.create();
        try {
          for (let p = 0; p < view.pageCount; p++) {
            checkCancelled(ctx.signal);
            const page = await view.page(p);
            const sideways = page.rotation === 90 || page.rotation === 270;
            const w = sideways ? page.height : page.width;
            const h = sideways ? page.width : page.height;
            const jpeg = await view.encode(p, { width: Math.max(1, Math.round((w / 72) * step.dpi)), format: 'jpeg', quality: step.quality, signal: ctx.signal });
            await out.addImagePage({ bytes: jpeg, kind: 'jpeg' }, { width: w, height: h }, 0);
          }
          const bytes = (await saveKeepingLock(ctx, out, input, ctx.passwords.has(input.id))).bytes;
          pictures.set(i, bytes);
          return bytes;
        } finally {
          out.close();
          await view.close();
        }
      };
      const pictureIndex = await firstFit(PICTURE_LADDER.length, async (i) => (await asPictures(i)).length <= limit);
      if (pictureIndex < PICTURE_LADDER.length) {
        const step = PICTURE_LADDER[pictureIndex]!;
        const bytes = await asPictures(pictureIndex);
        outcomes.push(
          await store(ctx, 'compress', [input], `${baseName(input.name)} (under ${kb(limit)}).pdf`, bytes, `${kb(input.size)} → ${kb(bytes.length)}, under ${kb(limit)}; pages are now pictures at ${step.dpi} dpi, so the words can't be selected`),
        );
        continue;
      }
      const tiny = await asPictures(PICTURE_LADDER.length - 1);
      const best = tiny.length < smallest.length ? tiny : smallest;
      if (noGain(best)) {
        outcomes.push({
          kind: 'skipped',
          inputIds: [input.id],
          reason: `${kb(limit)} is too small for this file to stay readable, even with its pages as pictures, and it is already as small as it gets (${kb(input.size)}). Choose a bigger size, or split it and send it in parts.`,
        });
        continue;
      }
      outcomes.push(
        await store(ctx, 'compress', [input], `${baseName(input.name)} (compressed).pdf`, best, `${kb(input.size)} → ${kb(best.length)}. ${kb(limit)} is too small for this file to stay readable; this is the smallest that still reads`),
      );
    } catch (error) {
      outcomes.push(failed(error, [input]));
    }
  }
  ctx.progress({ done: inputs.length, total: inputs.length, label: 'Done' });
  return outcomes;
}

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
 * Words in Latin letters are written with the PDF's built-in Helvetica;
 * words in any other script (Malayalam, Hindi, Tamil, Arabic…) with a
 * glyphless font (pdf/surgeon-unicode.ts) that draws nothing and maps every
 * code to itself, so they are searched and copied exactly as they were read.
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
            const own = (await view.text(index)).replace(/\s+/g, '').length;
            if (own >= HAS_TEXT) {
              alreadyText++;
              continue;
            }
            const layout = await view.layout(index).catch(() => null);
            // A few words of its own and no scan on it (a title over a photo, a cover): its
            // words are already searchable, and reading the photo would only add guesses.
            if (own > 0 && (layout?.pictureCover ?? 0) < SCAN_COVER) {
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
      if (found.size === 0 && alreadyText > 0) {
        outcomes.push({ kind: 'skipped', inputIds: [input.id], reason: 'Every page with words on it already has text you can search and copy; the other pages look blank.' });
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
        const { bytes, relocked } = await saveKeepingLock(ctx, doc, input);
        const lock = relocked ? ', still locked with the same password' : '';
        outcomes.push(
          await store(ctx, 'ocr', [input], `${baseName(input.name)} (searchable).pdf`, bytes, `${plural(placed, 'word')} read on ${pages}. You can now search, select and copy them${lock}`),
        );
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
export function pngWidth(png: Uint8Array): number | null {
  return png.length >= 24 ? new DataView(png.buffer, png.byteOffset).getUint32(16) : null;
}

export function pngHeight(png: Uint8Array): number | null {
  return png.length >= 24 ? new DataView(png.buffer, png.byteOffset).getUint32(20) : null;
}
