/**
 * Reproducible icon generation — no binary blobs in review, no design-tool
 * dependency. Draws the ConsentTrace mark (evidence-trace pulse on the brand
 * blue) into PNGs with a minimal hand-rolled encoder.
 *
 * Usage: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const SIZES = [16, 32, 48, 128];
const BG = [0x15, 0x5e, 0xef]; // #155eef
const FG = [0xff, 0xff, 0xff];

// ── Minimal PNG encoder (RGBA, 8-bit) ────────────────────────────────────────
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing ──────────────────────────────────────────────────────────────────
/** The evidence-trace pulse, normalized 0..1 coordinates. */
const TRACE = [
  [0.18, 0.56],
  [0.38, 0.56],
  [0.46, 0.36],
  [0.58, 0.72],
  [0.66, 0.56],
  [0.84, 0.56],
];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function roundedRectAlpha(x, y, size) {
  const radius = size * 0.22;
  const min = radius;
  const max = size - 1 - radius;
  const qx = Math.max(min - x, 0, x - max);
  const qy = Math.max(min - y, 0, y - max);
  const dist = Math.hypot(qx, qy) - radius;
  return Math.max(0, Math.min(1, 0.5 - dist)); // 1px anti-aliased edge
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const strokeRadius = Math.max(size * 0.052, 0.8);
  const points = TRACE.map(([nx, ny]) => [nx * size, ny * size]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bgAlpha = roundedRectAlpha(x + 0.5, y + 0.5, size);
      if (bgAlpha <= 0) continue;
      let dist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        dist = Math.min(dist, distToSegment(x + 0.5, y + 0.5, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]));
      }
      const strokeAlpha = Math.max(0, Math.min(1, strokeRadius + 0.6 - dist));
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[offset + c] = Math.round(BG[c] + (FG[c] - BG[c]) * strokeAlpha);
      rgba[offset + 3] = Math.round(255 * bgAlpha);
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log('wrote', file);
}
