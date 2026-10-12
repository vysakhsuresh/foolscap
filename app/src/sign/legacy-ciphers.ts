/**
 * The three old ciphers a certificate file can still be locked with, decrypt
 * side only: DES (and triple DES), RC2 and RC4.
 *
 * Why they are here at all: Windows, the macOS Keychain and OpenSSL before
 * version 3 export certificates with triple DES on the key and 40-bit RC2 on
 * the certificates, and most of the .pfx files people have on their phones
 * were made that way. WebCrypto has none of the three, and no browser will add
 * them. Each is small and fully specified, so they are written out here rather
 * than pulled in from a library.
 *
 * None of this is used to protect anything new. It only opens files the
 * person already has, with the password they typed. Speed does not matter:
 * the inputs are a few kilobytes.
 */

// ---------------------------------------------------------------- DES (FIPS 46-3)

// The tables are as printed in the standard: 1-based bit positions, bit 1 the
// most significant bit of the first byte.
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];
const FP = (() => {
  const out = new Array<number>(64).fill(0);
  IP.forEach((from, to) => (out[from - 1] = to + 1));
  return out;
})();
const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23,
  24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];
const P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25];
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 63, 55, 47, 39,
  31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40, 51,
  45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const S = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13,
    6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11,
    10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8,
    15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0,
    12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11,
    10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5,
    2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13,
    12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9,
    12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

const bitsOf = (bytes: Uint8Array): Uint8Array => {
  const out = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < out.length; i++) out[i] = ((bytes[i >> 3] ?? 0) >> (7 - (i & 7))) & 1;
  return out;
};
const permute = (bits: Uint8Array, table: readonly number[]): Uint8Array => Uint8Array.from(table, (p) => bits[p - 1] ?? 0);

/** The sixteen 48-bit round keys for one DES key, in encryption order. */
function desSubkeys(key: Uint8Array): Uint8Array[] {
  const cd = permute(bitsOf(key), PC1);
  let c = Array.from(cd.subarray(0, 28));
  let d = Array.from(cd.subarray(28));
  return SHIFTS.map((n) => {
    c = [...c.slice(n), ...c.slice(0, n)];
    d = [...d.slice(n), ...d.slice(0, n)];
    return permute(Uint8Array.from([...c, ...d]), PC2);
  });
}

/** One 8-byte block through DES with the given round keys (reverse them to decrypt). */
function desBlock(block: Uint8Array, keys: readonly Uint8Array[]): Uint8Array {
  const bits = permute(bitsOf(block), IP);
  let l = bits.subarray(0, 32);
  let r = bits.subarray(32);
  for (const k of keys) {
    const x = permute(r, E);
    for (let i = 0; i < 48; i++) x[i] = (x[i] ?? 0) ^ (k[i] ?? 0);
    const f = new Uint8Array(32);
    for (let s = 0; s < 8; s++) {
      const o = s * 6;
      const row = ((x[o] ?? 0) << 1) | (x[o + 5] ?? 0);
      const col = ((x[o + 1] ?? 0) << 3) | ((x[o + 2] ?? 0) << 2) | ((x[o + 3] ?? 0) << 1) | (x[o + 4] ?? 0);
      const v = S[s]?.[row * 16 + col] ?? 0;
      for (let b = 0; b < 4; b++) f[s * 4 + b] = (v >> (3 - b)) & 1;
    }
    const pf = permute(f, P);
    const next = new Uint8Array(32);
    for (let i = 0; i < 32; i++) next[i] = (l[i] ?? 0) ^ (pf[i] ?? 0);
    l = r;
    r = next;
  }
  const out = permute(Uint8Array.from([...r, ...l]), FP);
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 64; i++) bytes[i >> 3] = (bytes[i >> 3] ?? 0) | ((out[i] ?? 0) << (7 - (i & 7)));
  return bytes;
}

/**
 * DES or triple DES in CBC mode, decrypting. An 8-byte key is single DES, 16
 * bytes is two-key triple DES (K1 K2 K1) and 24 bytes three-key. Padding is
 * left on; the caller strips it, because that is where a wrong password shows.
 */
export function desCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== 8 && key.length !== 16 && key.length !== 24) throw new Error('A DES key is 8, 16 or 24 bytes.');
  if (data.length % 8 !== 0) throw new Error('Triple DES data must be whole blocks.');
  const k1 = desSubkeys(key.subarray(0, 8));
  const stages: Uint8Array[][] =
    key.length === 8
      ? [[...k1].reverse()]
      : (() => {
          const k2 = desSubkeys(key.subarray(8, 16));
          const k3 = key.length === 24 ? desSubkeys(key.subarray(16, 24)) : k1;
          // Encryption is E(K3, D(K2, E(K1, x))), so decryption is D(K1, E(K2, D(K3, y))).
          return [[...k3].reverse(), k2, [...k1].reverse()];
        })();
  const out = new Uint8Array(data.length);
  let prev = iv.subarray(0, 8);
  for (let at = 0; at < data.length; at += 8) {
    const block = data.subarray(at, at + 8);
    let x: Uint8Array = block;
    for (const keys of stages) x = desBlock(x, keys);
    for (let i = 0; i < 8; i++) out[at + i] = (x[i] ?? 0) ^ (prev[i] ?? 0);
    prev = block;
  }
  return out;
}

// ---------------------------------------------------------------- RC2 (RFC 2268)

// "PITABLE": a permutation of 0..255 derived from the digits of pi.
const PITABLE = new Uint8Array([
  0xd9, 0x78, 0xf9, 0xc4, 0x19, 0xdd, 0xb5, 0xed, 0x28, 0xe9, 0xfd, 0x79, 0x4a, 0xa0, 0xd8, 0x9d, 0xc6, 0x7e, 0x37, 0x83, 0x2b,
  0x76, 0x53, 0x8e, 0x62, 0x4c, 0x64, 0x88, 0x44, 0x8b, 0xfb, 0xa2, 0x17, 0x9a, 0x59, 0xf5, 0x87, 0xb3, 0x4f, 0x13, 0x61, 0x45,
  0x6d, 0x8d, 0x09, 0x81, 0x7d, 0x32, 0xbd, 0x8f, 0x40, 0xeb, 0x86, 0xb7, 0x7b, 0x0b, 0xf0, 0x95, 0x21, 0x22, 0x5c, 0x6b, 0x4e,
  0x82, 0x54, 0xd6, 0x65, 0x93, 0xce, 0x60, 0xb2, 0x1c, 0x73, 0x56, 0xc0, 0x14, 0xa7, 0x8c, 0xf1, 0xdc, 0x12, 0x75, 0xca, 0x1f,
  0x3b, 0xbe, 0xe4, 0xd1, 0x42, 0x3d, 0xd4, 0x30, 0xa3, 0x3c, 0xb6, 0x26, 0x6f, 0xbf, 0x0e, 0xda, 0x46, 0x69, 0x07, 0x57, 0x27,
  0xf2, 0x1d, 0x9b, 0xbc, 0x94, 0x43, 0x03, 0xf8, 0x11, 0xc7, 0xf6, 0x90, 0xef, 0x3e, 0xe7, 0x06, 0xc3, 0xd5, 0x2f, 0xc8, 0x66,
  0x1e, 0xd7, 0x08, 0xe8, 0xea, 0xde, 0x80, 0x52, 0xee, 0xf7, 0x84, 0xaa, 0x72, 0xac, 0x35, 0x4d, 0x6a, 0x2a, 0x96, 0x1a, 0xd2,
  0x71, 0x5a, 0x15, 0x49, 0x74, 0x4b, 0x9f, 0xd0, 0x5e, 0x04, 0x18, 0xa4, 0xec, 0xc2, 0xe0, 0x41, 0x6e, 0x0f, 0x51, 0xcb, 0xcc,
  0x24, 0x91, 0xaf, 0x50, 0xa1, 0xf4, 0x70, 0x39, 0x99, 0x7c, 0x3a, 0x85, 0x23, 0xb8, 0xb4, 0x7a, 0xfc, 0x02, 0x36, 0x5b, 0x25,
  0x55, 0x97, 0x31, 0x2d, 0x5d, 0xfa, 0x98, 0xe3, 0x8a, 0x92, 0xae, 0x05, 0xdf, 0x29, 0x10, 0x67, 0x6c, 0xba, 0xc9, 0xd3, 0x00,
  0xe6, 0xcf, 0xe1, 0x9e, 0xa8, 0x2c, 0x63, 0x16, 0x01, 0x3f, 0x58, 0xe2, 0x89, 0xa9, 0x0d, 0x38, 0x34, 0x1b, 0xab, 0x33, 0xff,
  0xb0, 0xbb, 0x48, 0x0c, 0x5f, 0xb9, 0xb1, 0xcd, 0x2e, 0xc5, 0xf3, 0xdb, 0x47, 0xe5, 0xa5, 0x9c, 0x77, 0x0a, 0xa6, 0x20, 0x68,
  0xfe, 0x7f, 0xc1, 0xad,
]);

/** RC2's sixty-four 16-bit subkeys, for a key with the given effective length in bits. */
function rc2Subkeys(key: Uint8Array, effectiveBits: number): Uint16Array {
  const t = key.length;
  if (t < 1 || t > 128) throw new Error('An RC2 key is 1 to 128 bytes.');
  const l = new Uint8Array(128);
  l.set(key);
  for (let i = t; i < 128; i++) l[i] = PITABLE[((l[i - 1] ?? 0) + (l[i - t] ?? 0)) & 0xff] ?? 0;
  const t8 = Math.ceil(effectiveBits / 8);
  const tm = 0xff % (1 << (8 + effectiveBits - 8 * t8));
  l[128 - t8] = PITABLE[(l[128 - t8] ?? 0) & tm] ?? 0;
  for (let i = 127 - t8; i >= 0; i--) l[i] = PITABLE[(l[i + 1] ?? 0) ^ (l[i + t8] ?? 0)] ?? 0;
  const k = new Uint16Array(64);
  for (let i = 0; i < 64; i++) k[i] = (l[2 * i] ?? 0) | ((l[2 * i + 1] ?? 0) << 8);
  return k;
}

function rc2DecryptBlock(block: Uint8Array, k: Uint16Array): Uint8Array {
  const r = new Uint16Array(4);
  for (let i = 0; i < 4; i++) r[i] = (block[2 * i] ?? 0) | ((block[2 * i + 1] ?? 0) << 8);
  const at = (i: number): number => r[(i + 4) % 4] ?? 0;
  const shift = [1, 2, 3, 5];
  let j = 63;
  const mix = () => {
    for (let i = 3; i >= 0; i--) {
      const s = shift[i] ?? 0;
      const v = at(i);
      r[i] = (v >>> s) | (v << (16 - s));
      r[i] = at(i) - (k[j] ?? 0) - (at(i - 1) & at(i - 2)) - (~at(i - 1) & at(i - 3));
      j--;
    }
  };
  const mash = () => {
    for (let i = 3; i >= 0; i--) r[i] = at(i) - (k[at(i - 1) & 63] ?? 0);
  };
  for (let n = 0; n < 5; n++) mix();
  mash();
  for (let n = 0; n < 6; n++) mix();
  mash();
  for (let n = 0; n < 5; n++) mix();
  const out = new Uint8Array(8);
  for (let i = 0; i < 4; i++) {
    out[2 * i] = (r[i] ?? 0) & 0xff;
    out[2 * i + 1] = (r[i] ?? 0) >>> 8;
  }
  return out;
}

/** RC2 in CBC mode, decrypting. Padding is left on, as for DES. */
export function rc2CbcDecrypt(key: Uint8Array, effectiveBits: number, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length % 8 !== 0) throw new Error('RC2 data must be whole blocks.');
  const k = rc2Subkeys(key, effectiveBits);
  const out = new Uint8Array(data.length);
  let prev = iv.subarray(0, 8);
  for (let at = 0; at < data.length; at += 8) {
    const block = data.subarray(at, at + 8);
    const x = rc2DecryptBlock(block, k);
    for (let i = 0; i < 8; i++) out[at + i] = (x[i] ?? 0) ^ (prev[i] ?? 0);
    prev = block;
  }
  return out;
}

// ---------------------------------------------------------------- RC4

/** RC4 is a stream cipher: encrypting and decrypting are the same thing. */
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + (s[i] ?? 0) + (key[i % key.length] ?? 0)) & 0xff;
    [s[i], s[j]] = [s[j] ?? 0, s[i] ?? 0];
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + (s[i] ?? 0)) & 0xff;
    [s[i], s[j]] = [s[j] ?? 0, s[i] ?? 0];
    out[n] = (data[n] ?? 0) ^ (s[((s[i] ?? 0) + (s[j] ?? 0)) & 0xff] ?? 0);
  }
  return out;
}

/**
 * Strips PKCS#5/#7 padding, or returns null when it is not valid. With a
 * block cipher, bad padding is how a wrong password shows when the file has
 * no integrity check of its own.
 */
export function unpad(data: Uint8Array, blockSize: number): Uint8Array | null {
  const n = data[data.length - 1] ?? 0;
  if (data.length === 0 || data.length % blockSize !== 0 || n < 1 || n > blockSize) return null;
  for (let i = data.length - n; i < data.length; i++) if (data[i] !== n) return null;
  return data.subarray(0, data.length - n);
}
