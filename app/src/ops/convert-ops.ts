/** The Convert family: images into a PDF, and the images out of one. */
import { baseName, failed, megabytes, ordinal, plural, refused, stem, store } from './common';
import { canDecode, jpegOrientation, reencode, sniffImage, type ImageKind } from './images';
import { checkCancelled, type ImagesToPdfParams, type NoParams, type Op, type Outcome } from './op';
import { PAPER } from './pages-ops';

const MARGIN: Record<ImagesToPdfParams['margin'], number> = { none: 0, small: 18, large: 36 };

const UNREADABLE_IMAGE: Partial<Record<ImageKind, string>> = {
  heic: "This browser can't read iPhone HEIC photos. On the iPhone, share the photo as JPEG (Settings › Camera › Formats › Most Compatible), then add it again.",
  avif: "This browser can't read AVIF images. Save it as JPEG or PNG first.",
};

export const imagesToPdfOp: Op<ImagesToPdfParams> = {
  tool: 'images-to-pdf',
  arity: { kind: 'together', min: 1 },
  title: () => 'Images to PDF',
  async run(inputs, params, ctx) {
    const outcomes: Outcome[] = [];
    const out = await ctx.surgeon.create();
    const used = [];
    try {
      const paper = params.paper === 'fit' ? 'fit' : PAPER[params.paper];
      for (const [i, input] of inputs.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: inputs.length, label: `Adding the ${ordinal(i + 1)} image` });
        try {
          const blob = await ctx.workspace.read(input);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const kind = sniffImage(bytes.subarray(0, 32));
          if (kind === null) {
            outcomes.push(refused([input], "This isn't an image this tool can read. Use JPEG, PNG, WebP, GIF or BMP."));
            continue;
          }
          let image: { bytes: Uint8Array; kind: 'jpeg' | 'png' };
          if (kind === 'jpeg' && jpegOrientation(bytes) === 1) image = { bytes, kind: 'jpeg' };
          else if (kind === 'png') image = { bytes, kind: 'png' };
          else if (kind === 'jpeg' && !canDecode()) image = { bytes, kind: 'jpeg' };
          else if (!canDecode()) {
            outcomes.push(refused([input], "This image type can't be read here. Use JPEG or PNG."));
            continue;
          } else {
            try {
              image = { bytes: await reencode(blob, kind === 'gif' ? 'png' : 'jpeg'), kind: kind === 'gif' ? 'png' : 'jpeg' };
            } catch {
              outcomes.push(refused([input], UNREADABLE_IMAGE[kind] ?? "This image couldn't be read. Save it as JPEG or PNG and try again."));
              continue;
            }
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
      const name = used.length === 1 ? `${stem(first.name)}.pdf` : `${stem(first.name)} and ${plural(used.length - 1, 'more')}.pdf`;
      const where = params.paper === 'fit' ? 'each page the shape of its image' : `on ${PAPER[params.paper].label}`;
      outcomes.unshift(await store(ctx, 'images-to-pdf', used, name, await out.save(), `${plural(used.length, 'image')}, ${where}`));
      return outcomes;
    } finally {
      out.close();
    }
  },
};

export const extractImagesOp: Op<NoParams> = {
  tool: 'extract-images',
  arity: { kind: 'one' },
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
    try {
      ctx.progress({ done: 0, total: 0, label: 'Looking for images…' });
      const { images, skipped } = doc.images();
      if (images.length === 0) {
        return [
          refused(
            inputs,
            skipped > 0
              ? `This PDF has ${plural(skipped, 'image')}, but in colour formats that can't be saved as files yet.`
              : 'This PDF has no images that can be saved on their own. Pages that are photos of text are often stored as one image per page; this file has none.',
          ),
        ];
      }
      const base = baseName(input.name);
      const outcomes: Outcome[] = [];
      for (const [i, image] of images.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: images.length, label: `Saving image ${i + 1} of ${images.length}` });
        const label = image.ext === 'jpg' ? 'JPEG' : image.ext === 'png' ? 'PNG' : 'JPEG 2000';
        outcomes.push(
          await store(
            ctx,
            'extract-images',
            inputs,
            `${base} image ${i + 1} (page ${image.page + 1}).${image.ext}`,
            image.bytes,
            `${image.width} × ${image.height} ${label}, ${megabytes(image.bytes.length)}, from page ${image.page + 1}`,
            'image',
          ),
        );
      }
      if (skipped > 0) {
        outcomes.push({ kind: 'skipped', inputIds: [input.id], reason: `${plural(skipped, 'other image')} use a colour format that can't be saved as a file yet.` });
      }
      return outcomes;
    } catch (error) {
      return [failed(error, inputs)];
    } finally {
      doc.close();
    }
  },
};
