// SPDX-License-Identifier: AGPL-3.0-only
// Draws the app icons (§B18 item 2, installable web app): an original pixel pawn on a red and white disc.
// Usage: node scripts/make-icons.mjs. Writes public/icons/icon-<size>.png and icon-maskable-512.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// 16 x 16 pawn, '#' ink, 'o' white.
const PAWN = [
  '................',
  '......####......',
  '.....#oooo#.....',
  '.....#oooo#.....',
  '......#oo#......',
  '.....#oooo#.....',
  '......#oo#......',
  '......#oo#......',
  '.....#oooo#.....',
  '....#oooooo#....',
  '...#oooooooo#...',
  '...##########...',
  '................',
  '................',
  '................',
  '................',
];
const INK = [24, 24, 24];
const RED = [224, 56, 48];
const WHITE = [248, 248, 240];

function draw(size, pad) {
  const png = new PNG({ width: size, height: size });
  const c = size / 2;
  const r = size / 2 - pad;
  const cell = (r * 1.25) / 16;
  const ox = c - 8 * cell;
  const oy = c - 6.5 * cell;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      let col = pad ? [248, 208, 48] : null; // maskable icons fill the whole square
      if (d <= r) col = d > r - size * 0.03 ? INK : y < c - size * 0.02 ? RED : y < c + size * 0.02 ? INK : WHITE;
      const gx = Math.floor((x - ox) / cell);
      const gy = Math.floor((y - oy) / cell);
      const ch = PAWN[gy]?.[gx];
      if (d <= r && ch === '#') col = INK;
      if (d <= r && ch === 'o') col = WHITE;
      const i = (y * size + x) * 4;
      png.data.set(col ? [...col, 255] : [0, 0, 0, 0], i);
    }
  }
  return PNG.sync.write(png);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) writeFileSync(`public/icons/icon-${size}.png`, draw(size, 0));
writeFileSync('public/icons/icon-maskable-512.png', draw(512, 64));
console.log('icons written');
