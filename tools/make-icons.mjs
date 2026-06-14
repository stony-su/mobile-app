/**
 * Generates Lull's PWA icons (crescent moon on a plum night sky) as PNGs
 * with zero dependencies — a tiny software rasterizer + minimal PNG encoder.
 *
 *   node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'icons');
mkdirSync(outDir, { recursive: true });

/* ---------- minimal PNG encoder (8-bit RGBA, no filtering) ---------- */

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- the artwork ---------- */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

const SKY_TOP = [38, 27, 76];
const SKY_BOTTOM = [13, 10, 28];
const GLOW = [242, 178, 92];
const MOON_HI = [250, 238, 208];
const MOON_LO = [238, 172, 96];
const STAR = [244, 238, 224];

// [x, y, radius] in unit coordinates — hand-placed, like a storybook sky.
const STARS = [
  [0.17, 0.18, 0.016],
  [0.79, 0.13, 0.012],
  [0.88, 0.42, 0.010],
  [0.11, 0.52, 0.012],
  [0.27, 0.83, 0.010],
  [0.74, 0.84, 0.014],
  [0.63, 0.22, 0.008],
  [0.40, 0.10, 0.009],
];

function render(size, safe = 1) {
  const px = Buffer.alloc(size * size * 4);
  const S = 2; // 2x2 supersampling
  const aa = 1.0 / size;

  const cxA = 0.5, cyA = 0.47, rA = 0.30 * safe;          // moon disc
  const cxB = 0.5 + 0.125 * safe, cyB = 0.47 - 0.095 * safe, rB = 0.265 * safe; // bite

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / size;
          const v = (y + (sy + 0.5) / S) / size;

          let col = mix(SKY_TOP, SKY_BOTTOM, v);

          // warm halo around the moon
          const dA = Math.hypot(u - cxA, v - cyA);
          const halo = Math.max(0, 1 - dA / 0.55);
          col = mix(col, GLOW, halo * halo * 0.32);

          // stars (soft diamonds)
          for (const [spx, spy, sr] of STARS) {
            const d = Math.abs(u - spx) + Math.abs(v - spy);
            const aStar = clamp((sr - d) / aa, 0, 1) * 0.92;
            if (aStar > 0) col = mix(col, STAR, aStar);
          }

          // crescent: inside disc A, outside disc B
          const dB = Math.hypot(u - cxB, v - cyB);
          const aIn = clamp((rA - dA) / aa, 0, 1);
          const aOut = clamp((dB - rB) / aa, 0, 1);
          const cres = aIn * aOut;
          if (cres > 0) {
            const k = clamp((u - cxA + (v - cyA)) / (2 * rA) + 0.5, 0, 1);
            col = mix(col, mix(MOON_HI, MOON_LO, k), cres);
          }

          r += col[0]; g += col[1]; b += col[2];
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = 255;
    }
  }
  return px;
}

const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['maskable-512.png', 512, 0.74], // content inside the adaptive-icon safe zone
];

for (const [name, size, safe] of targets) {
  const png = encodePng(size, size, render(size, safe));
  writeFileSync(join(outDir, name), png);
  console.log(`wrote icons/${name} (${png.length} bytes)`);
}
