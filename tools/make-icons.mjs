/**
 * DRAW THE APP ICONS.
 * ===================
 * Run with:  node tools/make-icons.mjs
 *
 * The icon is generated rather than stored as a picture somebody drew once and
 * nobody can edit. Change the numbers below, run the command, and every size is
 * redrawn consistently. No image editor, no design tool, no extra libraries --
 * this writes the PNG bytes itself using only what Node already has.
 *
 * WHY SEVERAL SIZES. A phone picks a different one depending on where the icon
 * appears -- home screen, task switcher, splash screen -- and Android may also
 * crop it into a circle or a squircle. The "maskable" version keeps everything
 * important inside the middle 80% so that crop never eats the picture.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/* ------------------------------------------------------------------ */
/* The picture: a blue dot standing on a dark street grid              */
/* ------------------------------------------------------------------ */

const BACKGROUND = [13, 17, 23];      // #0d1117, the same dark as the game
const STREET     = [30, 41, 56];      // faint roads
const STREET_LIT = [42, 58, 78];      // the two roads that cross under you
const PLAYER     = [77, 163, 255];    // #4da3ff, the dot that is you
const GLOW       = [77, 163, 255];

/**
 * @param size    pixels across
 * @param inset   how much of the edge to leave empty, 0 to 0.5. Maskable icons
 *                need room to be cropped; ordinary ones can fill the square.
 */
function drawIcon(size, inset) {
  const px = Buffer.alloc(size * size * 4);
  const mid = size / 2;
  // Everything is measured against the part of the square we are allowed to use.
  const safe = size * (1 - inset * 2);

  const put = (x, y, [r, g, b], alpha = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i]     = Math.round(px[i]     * (1 - alpha) + r * alpha);
    px[i + 1] = Math.round(px[i + 1] * (1 - alpha) + g * alpha);
    px[i + 2] = Math.round(px[i + 2] * (1 - alpha) + b * alpha);
    px[i + 3] = 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) put(x, y, BACKGROUND);
  }

  // A few streets, laid out by hand so the crossing sits under the player.
  const road = Math.max(2, Math.round(safe * 0.055));
  const band = (cx, cy, horizontal, thickness, colour) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const along = horizontal ? y - cy : x - cx;
        if (Math.abs(along) <= thickness / 2) put(x, y, colour);
      }
    }
  };

  band(0, mid - safe * 0.30, true, road, STREET);
  band(0, mid + safe * 0.32, true, road, STREET);
  band(mid - safe * 0.34, 0, false, road, STREET);
  // The pair that crosses beneath you is brighter, so the icon reads as a junction.
  band(0, mid, true, road * 1.15, STREET_LIT);
  band(mid, 0, false, road * 1.15, STREET_LIT);

  // The player: a soft glow, then a solid dot, then a rim.
  const dot = safe * 0.15;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - mid + 0.5, y - mid + 0.5);
      if (d < dot * 2.6) {
        const fade = 1 - d / (dot * 2.6);
        put(x, y, GLOW, fade * fade * 0.42);
      }
      if (d < dot) put(x, y, PLAYER);
      else if (d < dot * 1.18) put(x, y, [220, 238, 255], 0.9);
    }
  }

  return px;
}

/* ------------------------------------------------------------------ */
/* Writing a PNG by hand                                               */
/* ------------------------------------------------------------------ */

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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bits per channel
  ihdr[9] = 6;   // colour type 6 = RGBA
  // 10, 11, 12 stay zero: deflate, standard filtering, no interlacing.

  // Each row is prefixed with a filter byte. Zero means "store as is", which is
  // plenty here -- the picture is flat colour and compresses well regardless.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */

mkdirSync('public/icons', { recursive: true });

const WANTED = [
  { file: 'icon-192.png', size: 192, inset: 0.02 },
  { file: 'icon-512.png', size: 512, inset: 0.02 },
  // Android may crop these into a circle, so everything sits well inside.
  { file: 'icon-maskable-192.png', size: 192, inset: 0.12 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.12 },
  // iOS uses this one and rounds the corners itself.
  { file: 'apple-touch-icon.png', size: 180, inset: 0.06 },
  { file: 'favicon-32.png', size: 32, inset: 0 },
];

for (const { file, size, inset } of WANTED) {
  const png = encodePng(size, drawIcon(size, inset));
  writeFileSync(`public/icons/${file}`, png);
  console.log(`public/icons/${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
