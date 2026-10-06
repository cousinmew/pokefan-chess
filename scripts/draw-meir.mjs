// SPDX-License-Identifier: AGPL-3.0-only
// MEIR (§B18 item 7): an original Gen 1 style trainer sprite, drawn here as text pixels, not traced from any sprite.
// 80 x 80, four colours like the other trainer sprites: ink, white, blue (kippah and trousers), skin.
// Usage: node scripts/draw-meir.mjs. Writes public/art/meir.png and docs/meir-sprite.png (the same art at 4x).
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const PALETTE = { K: [24, 24, 24], W: [248, 248, 248], B: [40, 104, 232], S: [248, 192, 144] };
// prettier-ignore
const ART = [
  '..............KKKK..............',
  '............KKBBBBKK............',
  '...........KBBBBBBBBK...........',
  '..........KKKKKKKKKKKK..........',
  '.........KKKKKKKKKKKKKK.........',
  '........KKKKKKKKKKKKKKKK........',
  '........KKKSSKKKKKKSSKKK........',
  '........KKSSSSSSSSSSSSSK........',
  '.......KKSSSSSSSSSSSSSSKK.......',
  '.......KSSSKKSSSSSSKKSSSK.......',
  '.......KSSSKKSSSSSSKKSSSK.......',
  '.......KSSSSSSSSSSSSSSSSK.......',
  '........KSSSSSSSSSSSSSSK........',
  '........KSSSSKSSSSKSSSSK........',
  '.........KSSSSKKKKSSSSK.........',
  '..........KSSSSSSSSSSK..........',
  '...........KKSSSSSSKK......KKK..',
  '..........KKWWKSSKWWKK....KSSSK.',
  '........KKWWWWWKKWWWWWKK..KSSSK.',
  '.......KWWWWWWWWWWWWWWWWK.KSSK..',
  '......KWWWWWWWWWWWWWWWWWWKKWWK..',
  '......KWWKWWWWWWWWWWWWKWWWWWK...',
  '.....KWWWKWWWWWWWWWWWWKKWWWK....',
  '.....KWWKKWWWWWWWWWWWWK.KKK.....',
  '.....KWWKKWWWWWWWWWWWWK.........',
  '.....KWWKKWWWWWWWWWWWWK.........',
  '.....KSSKKWWWWWWWWWWWWK.........',
  '.....KSSSKWWWWWWWWWWWWK.........',
  '.....KSSSKWWWWWWWWWWWWK.........',
  '......KKKKWWWWWWWWWWWWK.........',
  '.........KKKKKKKKKKKKKK.........',
  '.........KBBBBBBBBBBBBK.........',
  '........KWKBBBBBBBBBBKWK........',
  '........KWKWBBBBBBBBWKWK........',
  '........KWKWBBBBKBBBWKWK........',
  '........KWKWBBBBKBBBWKWK........',
  '........KWKWBBBBKBBBWKWK........',
  '.........KKWBBBBKBBBWKK.........',
  '..........KWBBBBKBBBWK..........',
  '..........KBBBBBKBBBBK..........',
  '..........KBBBBBKBBBBK..........',
  '..........KBBBBBKBBBBK..........',
  '..........KBBBBBKBBBBK..........',
  '..........KBBBBBKBBBBK..........',
  '..........KBBBBKKKBBBK..........',
  '..........KBBBBK.KBBBK..........',
  '..........KBBBBK.KBBBK..........',
  '..........KBBBBK.KBBBK..........',
  '..........KBBBBK.KBBBK..........',
  '..........KBBBBK.KBBBK..........',
  '.........KKKKKKK.KKKKKK.........',
  '........KKKKKKKK.KKKKKKK........',
];

const SIZE = 80;
const ox = Math.floor((SIZE - ART[0].length) / 2);
const oy = SIZE - 13 - ART.length; // feet on the same line as the other trainers (about y = 67)

function draw(scale) {
  const png = new PNG({ width: SIZE * scale, height: SIZE * scale });
  ART.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = PALETTE[ch];
      if (!c) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) png.data.set([...c, 255], (((oy + y) * scale + dy) * SIZE * scale + (ox + x) * scale + dx) * 4);
    }),
  );
  return PNG.sync.write(png);
}

if (ART.some((r) => r.length !== ART[0].length)) throw new Error('ragged art rows');
mkdirSync('public/art', { recursive: true });
writeFileSync('public/art/meir.png', draw(1));
writeFileSync('docs/meir-sprite.png', draw(4));
console.log('meir drawn');
