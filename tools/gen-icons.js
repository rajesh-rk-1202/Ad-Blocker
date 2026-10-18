#!/usr/bin/env node
/**
 * Generates the extension icons (a red "no entry" disc) as PNGs.
 * Run:  node tools/gen-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** @param {number} size @param {(x:number,y:number)=>[number,number,number,number]} shade */
function png(size, shade) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const RED = [211, 47, 47];
const WHITE = [255, 255, 255];

function icon(size) {
  const c = (size - 1) / 2;
  const radius = size * 0.48;
  const barHalfHeight = size * 0.085;
  const barHalfWidth = size * 0.27;
  const ss = 3; // supersampling factor for smooth edges

  return png(size, (x, y) => {
    let hits = 0;
    let barHits = 0;
    for (let sy = 0; sy < ss; sy++) {
      for (let sx = 0; sx < ss; sx++) {
        const px = x + (sx + 0.5) / ss - 0.5;
        const py = y + (sy + 0.5) / ss - 0.5;
        if (Math.hypot(px - c, py - c) > radius) continue;
        hits++;
        if (Math.abs(px - c) <= barHalfWidth && Math.abs(py - c) <= barHalfHeight) barHits++;
      }
    }
    const samples = ss * ss;
    if (!hits) return [0, 0, 0, 0];
    const barRatio = barHits / hits;
    const [r, g, b] = [0, 1, 2].map((i) => Math.round(RED[i] * (1 - barRatio) + WHITE[i] * barRatio));
    return [r, g, b, Math.round((hits / samples) * 255)];
  });
}

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = path.join(dir, `icon${size}.png`);
  fs.writeFileSync(file, icon(size));
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}
