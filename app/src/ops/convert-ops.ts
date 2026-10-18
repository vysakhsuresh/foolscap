/** The Convert family: images into a PDF, and the images out of one. */
import { baseName, failed, megabytes, ordinal, plural, refused, stem, store } from './common';
import { NOT_AN_IMAGE, UNREADABLE_IMAGE, canDecode, jpegOrientation, reencode, sniffImage } from './images';
import type { ExtractedImage, OddImage } from '../pdf';
import { checkCancelled, type ImagesToPdfParams, type NoParams, type Op, type Outcome } from './op';
import { openView } from './render-ops';
import { PAPER } from './pages-ops';

const MARGIN: Record<ImagesToPdfParams['margin'], number> = { none: 0, small: 18, large: 36 };

/** An image a PDF can hold as it is (JPEG or PNG), or a sentence saying why this one cannot go in. */
async function pdfReady(blob: Blob): Promise<{ bytes: Uint8Array; kind: 'jpeg' | 'png' } | string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniffImage(bytes.subarray(0, 32));
  if (kind === null) return NOT_AN_IMAGE;
  if (kind === 'jpeg' && jpegOrientation(bytes) === 1) return { bytes, kind: 'jpeg' };
  if (kind === 'png') return { bytes, kind: 'png' };
  if (kind === 'jpeg' && !canDecode()) return { bytes, kind: 'jpeg' };
  if (!canDecode()) return "This image type can't be read here. Use JPEG or PNG.";
  try {
    return { bytes: await reencode(blob, kind === 'gif' ? 'png' : 'jpeg'), kind: kind === 'gif' ? 'png' : 'jpeg' };
  } catch {
    return UNREADABLE_IMAGE[kind] ?? "This image couldn't be read. Save it as JPEG or PNG and try again.";
  }
}

export const imagesToPdfOp: Op<ImagesToPdfParams> = {
  tool: 'images-to-pdf',
  arity: { kind: 'together', min: 1 },
  title: () => 'Images to PDF',
  async run(inputs, params, ctx) {
    const paper = params.paper === 'fit' ? 'fit' : PAPER[params.paper];
    const where = params.paper === 'fit' ? 'the page the shape of the image' : `on ${PAPER[params.paper].label}`;
    const outcomes: Outcome[] = [];
    if (params.separate === true) {
      // One PDF for each image, in the order listed.
      for (const [i, input] of inputs.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: inputs.length, label: `Making the ${ordinal(i + 1)} PDF` });
        const out = await ctx.surgeon.create();
        try {
          const image = await pdfReady(await ctx.workspace.read(input));
          if (typeof image === 'string') {
            outcomes.push(refused([input], image));
            continue;
          }
          await out.addImagePage(image, paper, MARGIN[params.margin]);
          outcomes.push(await store(ctx, 'images-to-pdf', [input], `${stem(input.name)}.pdf`, await out.save(), `1 image, ${where}`));
        } catch (error) {
          outcomes.push(failed(error, [input]));
        } finally {
          out.close();
        }
      }
      return outcomes;
    }
    const out = await ctx.surgeon.create();
    const used = [];
    try {
      for (const [i, input] of inputs.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: inputs.length, label: `Adding the ${ordinal(i + 1)} image` });
        try {
          const image = await pdfReady(await ctx.workspace.read(input));
          if (typeof image === 'string') {
            outcomes.push(refused([input], image));
            continue;
          }
          await out.addImagePage(image, paper, MARGIN[params.margin]);
          used.push(input);
        } catch (error) {
          outcomes.push(failed(error, [input]));
        }
      }
      const first = used[0];
      if (first === undefined) return outcomes;
      ctx.progress({ done: 0, total: 0, label: 'Writing the file…' });
      const name = used.length === 1 ? `${stem(first.name)}.pdf` : `${stem(first.name)} and ${used.length - 1} more.pdf`;
      const each = params.paper === 'fit' ? 'each page the shape of its image' : where;
      outcomes.unshift(await store(ctx, 'images-to-pdf', used, name, await out.save(), `${plural(used.length, 'image')}, one to a page, ${each}`));
      return outcomes;
    } finally {
      out.close();
    }
  },
};

export const extractImagesOp: Op<NoParams> = {
  tool: 'extract-images',
  arity: { kind: 'one' },
  engine: true,
  title: () => 'Extract images',
  async run(inputs, _params, ctx) {
    const input = inputs[0];
    if (input === undefined) return [refused(inputs, 'Pick one PDF.')];
    let doc;
    try {
      const blob = await ctx.workspace.read(input);
      const password = ctx.passwords.get(input.id);
      doc = await ctx.surgeon.open(new Uint8Array(await blob.arrayBuffer()), password === undefined ? {} : { password });
    } catch (error) {
      return [failed(error, inputs)];
    }
    let found: { images: readonly ExtractedImage[]; skipped: number; odd: readonly OddImage[] };
    try {
      ctx.progress({ done: 0, total: 0, label: 'Looking for images…' });
      found = doc.images();
    } catch (error) {
      doc.close();
      return [failed(error, inputs)];
    }
    doc.close();
    const base = baseName(input.name);
    const outcomes: Outcome[] = [];
    // The rest (a palette, CMYK, a one-bit or JBIG2 scan) are decoded the way a reader decodes them, and saved as PNG.
    const decoded: Array<{ page: number; width: number; height: number; png: Uint8Array }> = [];
    let missed = 0;
    if (found.odd.length > 0) {
      try {
        const view = await openView(ctx, input);
        try {
          const pages = [...new Set(found.odd.map((o) => o.page))];
          for (const [i, page] of pages.entries()) {
            checkCancelled(ctx.signal);
            ctx.progress({ done: i, total: pages.length, label: `Decoding the pictures on page ${page + 1}` });
            const pictures = [...(await view.pictures(page))];
            for (const odd of found.odd.filter((o) => o.page === page)) {
              const at = pictures.findIndex((p) => p.width === odd.width && p.height === odd.height);
              const picture = at >= 0 ? pictures.splice(at, 1)[0] : undefined;
              if (picture) decoded.push({ page, ...picture });
              else missed++;
            }
          }
        } finally {
          await view.close();
        }
      } catch {
        // Without a reader these stay where they are, and the result says how many.
        checkCancelled(ctx.signal);
        missed = found.odd.length - decoded.length;
      }
    }
    // Pictures stored as JPEG or plain pixels are saved exactly as they are stored.
    const all = [
      ...found.images.map((image) => ({ page: image.page, width: image.width, height: image.height, bytes: image.bytes, ext: image.ext, label: image.ext === 'jpg' ? 'JPEG' : image.ext === 'png' ? 'PNG' : 'JPEG 2000', how: '' })),
      ...decoded.map((d) => ({ page: d.page, width: d.width, height: d.height, bytes: d.png, ext: 'png' as const, label: 'PNG', how: ', decoded as a reader shows it' })),
    ].sort((a, b) => a.page - b.page);
    if (all.length === 0) {
      return [
        refused(
          inputs,
          found.skipped > 0
            ? `This PDF has ${plural(found.skipped, 'image')}, but none that can be saved as a picture: they are shapes or masks rather than photos.`
            : 'This PDF has no images that can be saved on their own. Pages that are photos of text are often stored as one image per page; this file has none.',
        ),
      ];
    }
    for (const [i, image] of all.entries()) {
      checkCancelled(ctx.signal);
      ctx.progress({ done: i, total: all.length, label: `Saving image ${i + 1} of ${all.length}` });
      outcomes.push(
        await store(
          ctx,
          'extract-images',
          inputs,
          `${base} image ${i + 1} (page ${image.page + 1}).${image.ext}`,
          image.bytes,
          `${image.width} × ${image.height} ${image.label}, ${megabytes(image.bytes.length)}, from page ${image.page + 1}${image.how}`,
          'image',
        ),
      );
    }
    const left = found.skipped - found.odd.length + missed;
    if (left > 0) {
      outcomes.push({ kind: 'skipped', inputIds: [input.id], reason: `${plural(left, 'other image')} could not be saved: ${left === 1 ? 'it is a shape or a mask' : 'they are shapes or masks'} rather than a photo, or stored in a way this browser cannot decode.` });
    }
    return outcomes;
  },
};
