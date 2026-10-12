/** The arithmetic behind Scan: finding the sheet, the projective map, the straightening and the clean-up. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CORNERS, enhance, findPaper, outputSize, quadArea, squareToQuad, warp, type Corners } from '../../app/src/ops/scan-math';

/** A w×h grey image: dark table, a light quad. */
function photo(w: number, h: number, quad: ReadonlyArray<[number, number]>): Uint8Array {
  const gray = new Uint8Array(w * h).fill(40);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = false;
      for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
        const [xi, yi] = quad[i]!;
        const [xj, yj] = quad[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      if (hit) gray[y * w + x] = 220;
    }
  }
  return gray;
}

describe('findPaper', () => {
  it('finds the four corners of a skewed sheet', () => {
    const quad: Array<[number, number]> = [[40, 30], [170, 40], [160, 250], [30, 240]];
    const corners = findPaper(photo(200, 280, quad), 200, 280);
    expect(corners).not.toBeNull();
    const expected = quad.flatMap(([x, y]) => [x / 200, y / 280]);
    corners!.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThan(0.03));
  });

  it('finds nothing in an even, dark photo', () => {
    expect(findPaper(new Uint8Array(200 * 200).fill(30), 200, 200)).toBeNull();
  });

  it('finds nothing when the bright patch is too small to be the sheet', () => {
    expect(findPaper(photo(200, 200, [[90, 90], [110, 90], [110, 110], [90, 110]]), 200, 200)).toBeNull();
  });
});

describe('the projective map', () => {
  it('sends the unit square’s corners to the quad’s', () => {
    const q = [10, 20, 300, 5, 280, 400, 30, 380];
    const map = squareToQuad(q);
    const at = (u: number, v: number) => map(u, v).map((n) => Math.round(n * 1000) / 1000);
    expect(at(0, 0)).toEqual([10, 20]);
    expect(at(1, 0)).toEqual([300, 5]);
    expect(at(1, 1)).toEqual([280, 400]);
    expect(at(0, 1)).toEqual([30, 380]);
  });

  it('treats a rectangle as a plain scale', () => {
    const map = squareToQuad([0, 0, 100, 0, 100, 50, 0, 50]);
    expect(map(0.5, 0.5)).toEqual([50, 25]);
  });
});

describe('straightening', () => {
  it('a skewed sheet comes out its true shape', () => {
    const corners: Corners = [0.1, 0.1, 0.9, 0.12, 0.88, 0.9, 0.12, 0.88];
    const size = outputSize(corners, 1000, 1400, 2200);
    expect(size.width / size.height).toBeCloseTo((0.78 * 1000) / (0.78 * 1400), 1);
    expect(quadArea(DEFAULT_CORNERS)).toBeCloseTo(0.92 * 0.92, 5);
  });

  it('keeps the inside of the sheet and leaves the table out', () => {
    const w = 100;
    const h = 100;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const v = x >= 20 && x < 80 && y >= 20 && y < 80 ? 230 : 20;
        src[o] = src[o + 1] = src[o + 2] = v;
        src[o + 3] = 255;
      }
    }
    const out = warp(src, w, h, [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8], 30, 30);
    let dark = 0;
    for (let i = 0; i < out.length; i += 4) if (out[i]! < 128) dark++;
    expect(dark).toBe(0);
  });
});

describe('the clean-up', () => {
  it('black and white makes ink black and paper white, even under a shadow', () => {
    const w = 120;
    const h = 60;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const shade = x < 60 ? 200 : 120; // the right half is in shadow
        const ink = y >= 28 && y < 32 && x % 20 < 12;
        const v = ink ? shade - 90 : shade;
        const o = (y * w + x) * 4;
        px[o] = px[o + 1] = px[o + 2] = v;
        px[o + 3] = 255;
      }
    }
    enhance(px, w, h, 'bw');
    const at = (x: number, y: number) => px[(y * w + x) * 4];
    expect(at(5, 30)).toBe(0); // ink, in the light
    expect(at(65, 30)).toBe(0); // ink, in the shadow
    expect(at(5, 10)).toBe(255); // paper, in the light
    expect(at(90, 10)).toBe(255); // paper, in the shadow
  });
});
