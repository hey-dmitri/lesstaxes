/**
 * The .ico, written from the same two bars as app/icon.svg.
 *
 * Modern browsers take the SVG through the link tag Next generates, and this is
 * for the ones that ask for /favicon.ico directly — bookmark bars, feed readers,
 * anything that guesses the path rather than reading the markup.
 *
 * Drawn in code rather than exported from a design tool because it is nine
 * rectangles, and because a binary asset nobody can regenerate is a binary asset
 * that goes stale. Run: node scripts/build-favicon.mjs
 *
 * ICO is a container of BMPs. Each image is a DIB header, then bottom-up BGRA
 * pixels, then an AND mask that a 32-bit image does not use but must still
 * carry — the format predates alpha and the mask is not optional.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'app', 'favicon.ico');

const GREEN = [0x2f, 0xd1, 0x96];
const DARK = [0x08, 0x12, 0x0d];

/** Rounded-rectangle coverage at a point, sampled rather than anti-aliased. */
function inRounded(x, y, rx, ry, w, h, r) {
  const px = x - rx;
  const py = y - ry;
  if (px < 0 || py < 0 || px >= w || py >= h) return false;
  const cx = Math.min(Math.max(px, r), w - r);
  const cy = Math.min(Math.max(py, r), h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** The mark at any size, as [r,g,b,a] per pixel. Supersampled 4x for smooth edges. */
function draw(size) {
  const s = size / 32;
  const S = 4;
  const px = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tile = 0;
      let bar = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = (x + (sx + 0.5) / S) / s;
          const fy = (y + (sy + 0.5) / S) / s;
          if (inRounded(fx, fy, 0, 0, 32, 32, 7)) tile++;
          if (
            inRounded(fx, fy, 7, 15, 7, 10, 2) ||
            inRounded(fx, fy, 18, 7, 7, 18, 2)
          ) {
            bar++;
          }
        }
      }
      const n = S * S;
      const alpha = Math.round((tile / n) * 255);
      const mix = bar / n;
      const rgb = GREEN.map((g, i) => Math.round(g * (1 - mix) + DARK[i] * mix));
      px.push([rgb[0], rgb[1], rgb[2], alpha]);
    }
  }
  return px;
}

/** One image inside the container: DIB header, BGRA bottom-up, empty AND mask. */
function dib(size) {
  const px = draw(size);
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // colour data plus the mask, per the format
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4, 20);

  const colour = Buffer.alloc(size * size * 4);
  let at = 0;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px[y * size + x];
      colour[at++] = b;
      colour[at++] = g;
      colour[at++] = r;
      colour[at++] = a;
    }
  }
  // Rows of the mask are padded to four bytes, and every bit is zero: alpha
  // above already says what is transparent.
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, colour, mask]);
}

const sizes = [16, 32, 48];
const images = sizes.map(dib);

const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2); // 1 = icon
head.writeUInt16LE(sizes.length, 4);

let offset = 6 + sizes.length * 16;
const entries = sizes.map((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0);
  e.writeUInt8(size === 256 ? 0 : size, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});

writeFileSync(OUT, Buffer.concat([head, ...entries, ...images]));
console.log(`wrote ${OUT} — ${sizes.join(', ')}px`);
