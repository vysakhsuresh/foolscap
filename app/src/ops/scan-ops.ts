/**
 * Scan: photos of paper in, one PDF out. Each photo is straightened to the
 * corners the person set (or the ones found for them), cleaned up to look
 * like a scan, turned the right way up, and laid on its own page. The
 * decoding and drawing are the browser's own, in the worker.
 */
import { failed, plural, refused, stem, store } from './common';
import { canDecode } from './images';
import { checkCancelled, type Op, type Outcome, type ScanParams } from './op';
import { PAPER } from './pages-ops';
import { DEFAULT_CORNERS, enhance, outputSize, warp, type Corners } from './scan-math';

/** The longest side a photo is worked at, and a page comes out at: about 250 dpi on A4. */
const WORK_SIDE = 2600;
const PAGE_SIDE = 2200;

const LOOKS: Record<ScanParams['look'], string> = { colour: 'in colour', grey: 'in grey', bw: 'in black and white' };

function cornersOf(raw: readonly number[] | undefined): Corners {
  if (!raw || raw.length !== 8 || !raw.every((v) => Number.isFinite(v) && v >= -0.01 && v <= 1.01)) return DEFAULT_CORNERS;
  return raw.map((v) => Math.min(1, Math.max(0, v))) as unknown as Corners;
}

export const scanOp: Op<ScanParams> = {
  tool: 'scan',
  arity: { kind: 'together', min: 1 },
  title: () => 'Scan',
  async run(inputs, params, ctx) {
    if (!canDecode()) return [refused(inputs, "This browser can't read photos in the background. Try a current Chrome, Edge, Firefox or Safari.")];
    const outcomes: Outcome[] = [];
    const out = await ctx.surgeon.create();
    const used = [];
    try {
      for (const [i, input] of inputs.entries()) {
        checkCancelled(ctx.signal);
        ctx.progress({ done: i, total: inputs.length, label: `Straightening page ${i + 1} of ${inputs.length}` });
        const page = params.pages[i];
        try {
          const blob = await ctx.workspace.read(input);
          let bitmap: ImageBitmap;
          try {
            bitmap = await createImageBitmap(blob);
          } catch {
            outcomes.push(refused([input], "This photo couldn't be read. Take it again, or save it as JPEG."));
            continue;
          }
          const scale = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
          const sw = Math.max(1, Math.round(bitmap.width * scale));
          const sh = Math.max(1, Math.round(bitmap.height * scale));
          const source = new OffscreenCanvas(sw, sh);
          const sctx = source.getContext('2d', { willReadFrequently: true });
          if (sctx === null) throw new RangeError('canvas');
          sctx.drawImage(bitmap, 0, 0, sw, sh);
          bitmap.close();
          const pixels = sctx.getImageData(0, 0, sw, sh).data;
          source.width = source.height = 0;

          const corners = cornersOf(page?.corners);
          const { width, height } = outputSize(corners, sw, sh, PAGE_SIDE);
          const flat = warp(pixels, sw, sh, corners, width, height);
          enhance(flat, width, height, params.look);
          checkCancelled(ctx.signal);

          const turn = page?.turn ?? 0;
          const sideways = turn === 90 || turn === 270;
          const canvas = new OffscreenCanvas(sideways ? height : width, sideways ? width : height);
          const c = canvas.getContext('2d');
          if (c === null) throw new RangeError('canvas');
          const sheet = new OffscreenCanvas(width, height);
          sheet.getContext('2d')?.putImageData(new ImageData(flat, width, height), 0, 0);
          c.translate(canvas.width / 2, canvas.height / 2);
          c.rotate((turn * Math.PI) / 180);
          c.drawImage(sheet, -width / 2, -height / 2);
          const png = params.look === 'bw';
          const encoded = await canvas.convertToBlob(png ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.85 });
          canvas.width = canvas.height = sheet.width = sheet.height = 0;
          const bytes = new Uint8Array(await encoded.arrayBuffer());
          await out.addImagePage({ bytes, kind: png ? 'png' : 'jpeg' }, params.paper === 'fit' ? 'fit' : PAPER[params.paper], 0);
          used.push(input);
        } catch (error) {
          outcomes.push(failed(error, [input]));
        }
      }
      const first = used[0];
      if (first === undefined) return outcomes;
      ctx.progress({ done: inputs.length, total: inputs.length, label: 'Writing the file…' });
      const where = params.paper === 'fit' ? '' : ` on ${PAPER[params.paper].label}`;
      outcomes.unshift(await store(ctx, 'scan', used, `${stem(first.name)} (scanned).pdf`, await out.save(), `${plural(used.length, 'page')} ${LOOKS[params.look]}${where}`));
      return outcomes;
    } finally {
      out.close();
    }
  },
};
