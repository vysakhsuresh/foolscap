/**
 * An sRGB colour profile (ICC v2, display class), built here byte by byte
 * rather than copied from anywhere: PDF/A asks for one inside the file, and a
 * profile made from the published sRGB numbers has no licence to carry.
 *
 * Primaries are the sRGB ones adapted to D50, as ICC requires; the tone curve
 * is the real sRGB curve (linear toe, 2.4 power), sampled 1024 times.
 */

const s15 = (v: number) => Math.round(v * 65536);

export function srgbProfile(): Uint8Array {
  const parts: Array<{ sig: string; data: Uint8Array }> = [];
  const text = (s: string) => new TextEncoder().encode(s);
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const xyz = (x: number, y: number, z: number) => Uint8Array.from([...text('XYZ '), 0, 0, 0, 0, ...u32(s15(x)), ...u32(s15(y)), ...u32(s15(z))]);

  const name = 'sRGB IEC61966-2.1';
  const desc = new Uint8Array(12 + name.length + 1 + 4 + 4 + 2 + 1 + 67);
  desc.set(text('desc'), 0);
  desc.set(u32(name.length + 1), 8);
  desc.set(text(name), 12);
  parts.push({ sig: 'desc', data: desc });

  const notice = 'No copyright, use freely';
  const cprt = new Uint8Array(8 + notice.length + 1);
  cprt.set(text('text'), 0);
  cprt.set(text(notice), 8);
  parts.push({ sig: 'cprt', data: cprt });

  parts.push({ sig: 'wtpt', data: xyz(0.9642, 1.0, 0.8249) });
  parts.push({ sig: 'rXYZ', data: xyz(0.4361, 0.2225, 0.0139) });
  parts.push({ sig: 'gXYZ', data: xyz(0.3851, 0.7169, 0.0971) });
  parts.push({ sig: 'bXYZ', data: xyz(0.1431, 0.0606, 0.7141) });

  const points = 1024;
  const curve = new Uint8Array(12 + points * 2);
  curve.set(text('curv'), 0);
  curve.set(u32(points), 8);
  for (let i = 0; i < points; i++) {
    const v = i / (points - 1);
    const linear = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const n = Math.round(linear * 65535);
    curve[12 + i * 2] = n >> 8;
    curve[13 + i * 2] = n & 255;
  }
  // The three channels share one curve: the tag table may point them at the same bytes.
  const shared = ['rTRC', 'gTRC', 'bTRC'];

  const pad = (n: number) => (n + 3) & ~3;
  const tableSize = 4 + (parts.length + shared.length) * 12;
  let offset = 128 + tableSize;
  const placed: Array<{ sig: string; at: number; size: number; data?: Uint8Array }> = [];
  for (const part of parts) {
    placed.push({ sig: part.sig, at: offset, size: part.data.length, data: part.data });
    offset = pad(offset + part.data.length);
  }
  const curveAt = offset;
  offset = pad(offset + curve.length);
  for (const sig of shared) placed.push({ sig, at: curveAt, size: curve.length });

  const out = new Uint8Array(offset);
  const put = (at: number, bytes: ArrayLike<number>) => out.set(bytes, at);
  put(0, u32(offset));
  put(8, [0x02, 0x10, 0, 0]); // version 2.1
  put(12, text('mntr'));
  put(16, text('RGB '));
  put(20, text('XYZ '));
  put(24, [0x07, 0xea, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0]); // 2026-01-01
  put(36, text('acsp'));
  put(68, [...u32(s15(0.9642)), ...u32(s15(1.0)), ...u32(s15(0.8249))]); // D50
  put(128, u32(placed.length));
  placed.forEach((p, i) => {
    put(132 + i * 12, text(p.sig));
    put(136 + i * 12, u32(p.at));
    put(140 + i * 12, u32(p.size));
    if (p.data) put(p.at, p.data);
  });
  put(curveAt, curve);
  return out;
}
