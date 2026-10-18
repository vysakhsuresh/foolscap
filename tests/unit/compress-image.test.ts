/**
 * Resize photo to KB, in Node over @napi-rs/canvas (tests/fixtures/node-canvas.ts
 * gives the worker's OffscreenCanvas and createImageBitmap): phone photos,
 * a busy outdoor scene and a signature really come in under each limit, the
 * pixels asked for are the pixels made, see-through goes white, the phone's
 * hidden details (its location too) are gone, a photo taken sideways comes
 * out upright, and a limit that cannot be met is said in words.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { FoolscapFile } from '../../app/src/files/types';
import { createMemoryWorkspace } from '../../app/src/files/workspace-memory';
import { getOp } from '../../app/src/ops';
import { hiddenDetails, jpegFrame, withoutDetails } from '../../app/src/ops/images';
import type { CompressImageParams, OpContext, Outcome } from '../../app/src/ops/op';
import { PASSPORT, planPhoto, sizeText } from '../../app/src/ops/photo-ops';
import { installNodeCanvas } from '../fixtures/node-canvas';
import { markersOf, pixelsOf, portraitJpeg, quartersJpeg, sceneJpeg, signatureJpeg, transparentPng, withExif } from '../fixtures/photos';

beforeAll(() => {
  installNodeCanvas();
});

function harness() {
  const workspace = createMemoryWorkspace();
  const ctx: OpContext = {
    workspace,
    engine: () => Promise.reject(new Error('no engine needed')),
    surgeon: undefined as unknown as OpContext['surgeon'],
    passwords: new Map(),
    signal: new AbortController().signal,
    progress: () => undefined,
  };
  return {
    ctx,
    add: (name: string, bytes: Uint8Array) => workspace.put(name, bytes, 'image', { kind: 'picked' }),
    bytesOf: async (file: FoolscapFile) => new Uint8Array(await (await workspace.read(file)).arrayBuffer()),
  };
}

const resize = (inputs: readonly FoolscapFile[], params: CompressImageParams, ctx: OpContext) => getOp('compress-image').run(inputs, params, ctx);

function produced(outcomes: Outcome[]) {
  return outcomes.filter((o): o is Extract<Outcome, { kind: 'produced' }> => o.kind === 'produced');
}

function only(outcomes: Outcome[]) {
  const list = produced(outcomes);
  expect(list, JSON.stringify(outcomes)).toHaveLength(1);
  return list[0]!;
}

const near = (a: readonly number[], b: readonly number[], within = 60) => a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= within);

describe('resize photo to KB: sizes', () => {
  it('brings phone photos, a busy scene and a signature under every limit, and keeps their shape', { timeout: 300_000 }, async () => {
    const h = harness();
    const pictures: Array<[string, Uint8Array]> = [
      ['Portrait.jpg', await portraitJpeg(3024, 4032)],
      ['Selfie.jpg', await portraitJpeg(1080, 1440, 21)],
      ['Market.jpg', await sceneJpeg(2000, 1500)],
      ['Signature.jpg', await signatureJpeg(1600, 600)],
    ];
    for (const [name, bytes] of pictures) {
      const input = await h.add(name, bytes);
      const frame = jpegFrame(bytes)!;
      for (const kb of [20, 50, 100, 200]) {
        const out = only(await resize([input], { targetKb: kb, dimensions: 'keep' }, h.ctx));
        const made = await h.bytesOf(out.file);
        const where = `${name} at ${kb} KB: ${out.detail}`;
        expect(made.length, where).toBeLessThan(kb * 1000);
        expect(made.length, where).toBe(out.file.size);
        expect([made[0], made[1], made[2]], where).toEqual([0xff, 0xd8, 0xff]);
        expect(out.file.name).toBe(`${name.replace('.jpg', '')} (under ${kb} KB).jpg`);
        expect(out.file.kind).toBe('image');
        expect(out.detail, where).toContain(`under ${kb} KB`);
        // Never larger than it was, and the same shape to within a pixel.
        const size = jpegFrame(made)!;
        expect(size.width, where).toBeLessThanOrEqual(frame.width);
        expect(Math.abs(size.width / size.height - frame.width / frame.height), where).toBeLessThan(0.01);
        expect(out.detail, where).toContain(`${size.width} × ${size.height} px`);
        // A shrink is said, with the size it was; no shrink, no such words.
        if (size.width < frame.width) expect(out.detail, where).toContain(`made smaller to fit (it was ${frame.width} × ${frame.height})`);
        else expect(out.detail, where).not.toContain('made smaller');
      }
    }
  });

  it('keeps every pixel when the limit allows it, at the best quality', { timeout: 60_000 }, async () => {
    const h = harness();
    // A screenshot-style PNG: it has to be saved afresh as a JPEG, and 500 KB leaves room for all of it.
    const input = await h.add('Selfie.png', await portraitJpeg(600, 800, 5, 'png'));
    const out = only(await resize([input], { targetKb: 500, dimensions: 'keep' }, h.ctx));
    const made = await h.bytesOf(out.file);
    expect(jpegFrame(made)).toMatchObject({ width: 600, height: 800 });
    expect(out.detail).toMatch(/^[\d.]+ (KB|MB) → \d+ KB, under 500 KB; 600 × 800 px, now a JPEG$/);
    // Quality 92 is the best tried: what came out is that encoding, not a squeezed one.
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(Buffer.from(await h.bytesOf(input)));
    const canvas = createCanvas(600, 800);
    canvas.getContext('2d').drawImage(image, 0, 0);
    expect(made.length).toBe((await canvas.encode('jpeg', 92)).length);
  });

  it('counts 1 KB as 1,000 bytes, and never rounds a size up past its limit', () => {
    expect(sizeText(49_999)).toBe('49 KB');
    expect(sizeText(19_960)).toBe('19 KB');
    expect(sizeText(4_560)).toBe('4.5 KB');
    expect(sizeText(3_249_000)).toBe('3.2 MB');
  });

  it('makes each picture in a batch on its own, in order, and says why one is not a picture', { timeout: 60_000 }, async () => {
    const h = harness();
    const a = await h.add('First.jpg', await portraitJpeg(800, 1000, 1));
    const bad = await h.add('Notes.jpg', new TextEncoder().encode('not a picture at all'));
    const b = await h.add('Second.png', await transparentPng(300, 300));
    const outcomes = await resize([a, bad, b], { targetKb: 50, dimensions: 'keep' }, h.ctx);
    expect(outcomes.map((o) => o.kind)).toEqual(['produced', 'failed', 'produced']);
    expect(outcomes[1]).toMatchObject({ kind: 'failed', inputIds: [bad.id] });
    expect((outcomes[1] as { reason: string }).reason).toMatch(/^This isn't an image/);
  });
});

describe('resize photo to KB: pixels', () => {
  it('cuts a passport photo from the middle, 3.5 × 4.5 cm at 300 dpi, under the limit', { timeout: 60_000 }, async () => {
    const h = harness();
    const input = await h.add('Me.jpg', await portraitJpeg(3000, 4000, 9));
    const out = only(await resize([input], { targetKb: 50, dimensions: 'passport' }, h.ctx));
    const made = await h.bytesOf(out.file);
    expect(made.length).toBeLessThan(50_000);
    expect(jpegFrame(made)).toMatchObject({ width: PASSPORT.width, height: PASSPORT.height });
    expect(out.detail).toContain('passport shape, 413 × 531 px');
    // The face (skin tone) is still in the middle: the cut came from the centre.
    const px = await pixelsOf(made);
    const face = px.at(px.width / 2 - 20, px.height * 0.47);
    expect(face[0], `face colour ${face}`).toBeGreaterThan(face[2] + 40);
  });

  it('never enlarges a small photo to the passport size, and says so', { timeout: 60_000 }, async () => {
    const h = harness();
    const input = await h.add('Small.jpg', await portraitJpeg(300, 400, 4));
    const out = only(await resize([input], { targetKb: 200, dimensions: 'passport' }, h.ctx));
    const size = jpegFrame(await h.bytesOf(out.file))!;
    expect(size).toMatchObject({ width: 300, height: Math.round(300 / (413 / 531)) });
    expect(out.detail).toContain('not enlarged to 413 × 531');
  });

  it('makes exactly the pixels typed, cut from the middle to that shape, larger too when asked', { timeout: 60_000 }, async () => {
    const h = harness();
    const signature = await h.add('Signature.jpg', await signatureJpeg(1600, 600));
    const wide = only(await resize([signature], { targetKb: 20, dimensions: 'custom', width: 300, height: 80 }, h.ctx));
    const wideBytes = await h.bytesOf(wide.file);
    expect(wideBytes.length).toBeLessThan(20_000);
    expect(jpegFrame(wideBytes)).toMatchObject({ width: 300, height: 80 });
    const small = await h.add('Tiny.jpg', await portraitJpeg(200, 150, 2));
    const big = only(await resize([small], { targetKb: 100, dimensions: 'custom', width: 600, height: 600 }, h.ctx));
    expect(jpegFrame(await h.bytesOf(big.file))).toMatchObject({ width: 600, height: 600 });
  });

  it('plans the cut from the middle of the picture as seen', () => {
    expect(planPhoto(4000, 3000, { targetKb: 50, dimensions: 'passport' })).toEqual({ crop: { x: 833, y: 0, width: 2333, height: 3000 }, width: 413, height: 531, shrink: true });
    expect(planPhoto(1000, 1000, { targetKb: 50, dimensions: 'custom', width: 200, height: 100 })).toEqual({ crop: { x: 0, y: 250, width: 1000, height: 500 }, width: 200, height: 100, shrink: false });
    expect(planPhoto(6000, 4000, { targetKb: 50, dimensions: 'keep' }).width * planPhoto(6000, 4000, { targetKb: 50, dimensions: 'keep' }).height).toBeLessThanOrEqual(16_777_216);
  });
});

describe('resize photo to KB: what comes out', () => {
  it('puts a see-through background on white', async () => {
    const h = harness();
    const input = await h.add('Logo.png', await transparentPng(400, 400));
    const out = only(await resize([input], { targetKb: 50, dimensions: 'keep' }, h.ctx));
    expect(out.detail).toContain('now a JPEG');
    const px = await pixelsOf(await h.bytesOf(out.file));
    for (const [x, y] of [[2, 2], [397, 2], [2, 397], [397, 397]] as const) expect(Math.min(...px.at(x, y)), `corner ${x},${y}`).toBeGreaterThan(245);
    // And the logo itself is still there, maroon.
    expect(near(px.at(200, 200), [0x7a, 0x1f, 0x2b], 30)).toBe(true);
  });

  it('takes the camera details and the location out, and says so', { timeout: 60_000 }, async () => {
    const h = harness();
    const photo = withExif(await portraitJpeg(2000, 2600, 8), { make: 'Phone maker', gps: true, orientation: 1 });
    expect(hiddenDetails(photo, 'jpeg')).toBe('location');
    const input = await h.add('IMG_2041.jpg', photo);
    const out = only(await resize([input], { targetKb: 50, dimensions: 'keep' }, h.ctx));
    const made = await h.bytesOf(out.file);
    expect(markersOf(made)).not.toContain('e1');
    expect(Buffer.from(made).includes('Exif')).toBe(false);
    expect(Buffer.from(made).includes('Phone maker')).toBe(false);
    expect(hiddenDetails(made, 'jpeg')).toBe('none');
    expect(out.detail).toContain('location and camera details taken out');
  });

  it('a JPEG already under the limit keeps its picture byte for byte; only what is hidden comes off', async () => {
    const h = harness();
    const plain = await portraitJpeg(400, 500, 6);
    const tagged = withExif(plain, { make: 'Phone maker' });
    expect(hiddenDetails(tagged, 'jpeg')).toBe('details');
    const input = await h.add('Photo.jpg', tagged);
    const out = only(await resize([input], { targetKb: 200, dimensions: 'keep' }, h.ctx));
    const made = await h.bytesOf(out.file);
    expect(Buffer.compare(Buffer.from(made), Buffer.from(plain))).toBe(0);
    expect(out.detail).toContain('the picture itself untouched; camera details taken out');
    // With nothing hidden in it, there is nothing to do, and it says so.
    const again = await resize([await h.add('Clean.jpg', plain)], { targetKb: 200, dimensions: 'keep' }, h.ctx);
    expect(again[0]).toMatchObject({ kind: 'skipped' });
    expect((again[0] as { reason: string }).reason).toContain('Nothing to change');
    expect(withoutDetails(plain)?.removed).toBe(false);
  });

  it('turns a photo taken sideways (or mirrored) the way a viewer shows it, for all eight EXIF orientations', { timeout: 60_000 }, async () => {
    const h = harness();
    // Stored 200 × 100: red top-left, green top-right, blue bottom-left, yellow bottom-right.
    const stored = await quartersJpeg(200, 100);
    const R = [255, 0, 0];
    const G = [0, 255, 0];
    const B = [0, 0, 255];
    const Y = [255, 255, 0];
    // What a viewer shows in each corner (top-left, top-right, bottom-left, bottom-right), per the EXIF standard.
    const seen: Record<number, number[][]> = {
      1: [R, G, B, Y],
      2: [G, R, Y, B],
      3: [Y, B, G, R],
      4: [B, Y, R, G],
      5: [R, B, G, Y],
      6: [B, R, Y, G],
      7: [Y, G, B, R],
      8: [G, Y, R, B],
    };
    for (let orientation = 1; orientation <= 8; orientation++) {
      const input = await h.add(`Turned ${orientation}.jpg`, withExif(stored, { orientation, make: 'x' }));
      const out = only(await resize([input], { targetKb: 100, dimensions: 'keep' }, h.ctx));
      const px = await pixelsOf(await h.bytesOf(out.file));
      const sideways = orientation >= 5;
      expect([px.width, px.height], `orientation ${orientation}`).toEqual(sideways ? [100, 200] : [200, 100]);
      const corners = [px.at(10, 10), px.at(px.width - 10, 10), px.at(10, px.height - 10), px.at(px.width - 10, px.height - 10)];
      corners.forEach((c, i) => expect(near(c, seen[orientation]![i]!), `orientation ${orientation}, corner ${i}: ${c}`).toBe(true));
      if (orientation !== 1) expect(out.detail).toContain('turned upright');
    }
  });
});

describe('resize photo to KB: limits that cannot be met', () => {
  it('says in words when even the smallest clear picture is over, and hands over that smallest one', { timeout: 120_000 }, async () => {
    const h = harness();
    const input = await h.add('Market.jpg', await sceneJpeg(2400, 1800, 13));
    const out = only(await resize([input], { targetKb: 2, dimensions: 'keep' }, h.ctx));
    expect(out.file.name).toBe('Market (resized).jpg');
    expect(out.detail).toMatch(/^[\d.]+ (KB|MB) → [\d.]+ KB\. 2 KB is too small for this picture to stay clear: this is the smallest that still looks right, 160 × 120 px$/);
  });

  it('keeps the pixels typed and says the limit is too small for them, rather than quietly changing them', { timeout: 60_000 }, async () => {
    const h = harness();
    const input = await h.add('Market.jpg', await sceneJpeg(2400, 1800, 17));
    const out = only(await resize([input], { targetKb: 3, dimensions: 'custom', width: 1600, height: 1200 }, h.ctx));
    expect(jpegFrame(await h.bytesOf(out.file))).toMatchObject({ width: 1600, height: 1200 });
    expect(out.detail).toContain('3 KB is too small for 1600 × 1200 px to stay clear: this is the smallest at that size. Type fewer pixels, or choose Keep its shape to let it shrink');
  });

  it('refuses a limit under 2 KB and pixels out of range, in words', async () => {
    const h = harness();
    const input = await h.add('Photo.jpg', await portraitJpeg(200, 300));
    expect(await resize([input], { targetKb: 1, dimensions: 'keep' }, h.ctx)).toEqual([{ kind: 'failed', inputIds: [input.id], reason: 'Choose a size of at least 2 KB.' }]);
    expect(await resize([input], { targetKb: 20, dimensions: 'custom', width: 5000, height: 10 }, h.ctx)).toEqual([
      { kind: 'failed', inputIds: [input.id], reason: 'Type a width and a height between 16 and 4096 pixels.' },
    ]);
  });
});
