// SPDX-License-Identifier: AGPL-3.0-only
// Fetches sprites and cries into public/assets/ at build time (§4.7). Never committed, never hotlinked.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';

const OUT = 'public/assets';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/';
const roster = JSON.parse(readFileSync('src/data/roster.gen1.json', 'utf8'));
const kanto = JSON.parse(readFileSync('src/data/kanto.json', 'utf8'));
const dexes = [...new Set([...Object.values(roster.species), ...Object.values(kanto.species)].map((s) => s.dex))].sort((a, b) => a - b);

// Upstream trap (§B8): black-white/animated/back/19.gif is Alolan Rattata. Every Gen 1 species with an Alolan form
// takes the Showdown animated back sprite instead, which is the Kanto form. docs/sprite-sheet.png shows every pair.
const ALOLAN = [19, 20, 26, 27, 28, 37, 38, 50, 51, 52, 53, 74, 75, 76, 88, 89, 103, 105];
const BACK_OVERRIDE = Object.fromEntries(ALOLAN.map((d) => [d, `other/showdown/back/${d}.gif`]));
const SHINY_BACK_OVERRIDE = Object.fromEntries(ALOLAN.map((d) => [d, `other/showdown/back/shiny/${d}.gif`]));

const jobs = dexes.flatMap((d) => [
  [`${SPRITES}versions/generation-v/black-white/animated/${d}.gif`, `front/${d}.gif`],
  [`${SPRITES}${BACK_OVERRIDE[d] ?? `versions/generation-v/black-white/animated/back/${d}.gif`}`, `back/${d}.gif`],
  [`${SPRITES}versions/generation-i/red-blue/transparent/${d}.png`, `retro/${d}.png`],
  // Shiny forms (§B12): every one of the 151 must exist, or the build fails.
  [`${SPRITES}versions/generation-v/black-white/animated/shiny/${d}.gif`, `shiny/front/${d}.gif`],
  [`${SPRITES}${SHINY_BACK_OVERRIDE[d] ?? `versions/generation-v/black-white/animated/back/shiny/${d}.gif`}`, `shiny/back/${d}.gif`],
  [`${CRIES}${d}.ogg`, `cries/${d}.ogg`],
]);

// Trainer sprites (§B14): Pokémon Showdown's Gen 1 style set, saved as assets/trainers/<sprite>.png. Never hotlinked.
const TRAINERS = 'https://play.pokemonshowdown.com/sprites/trainers/';
const trainerMap = JSON.parse(readFileSync('src/data/trainers.json', 'utf8'));
for (const sprite of new Set([...Object.values(trainerMap.people), ...Object.values(trainerMap.classes)])) jobs.push([`${TRAINERS}${sprite}.png`, `trainers/${sprite}.png`]);

// Hub icons (§B16 addendum): PokeAPI item sprites, checked 6 Oct 2026. The rest are original SVGs in src/ui/icons.ts.
const ITEMS = ['town-map', 'teachy-tv', 'poke-ball', 'vs-seeker', 'card-key', 'tm-normal', 'oaks-parcel'];
for (const item of ITEMS) jobs.push([`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item}.png`, `items/${item}.png`]);

let hasFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch (err) {
  hasFfmpeg = false;
  console.warn(`ffmpeg not found (${err.code ?? 'error'}), keeping .ogg cries only`);
}

let downloaded = 0;
const missing = [];
await Promise.all(
  jobs.map(async ([url, rel]) => {
    const path = join(OUT, rel);
    if (existsSync(path) && statSync(path).size > 0) return;
    mkdirSync(dirname(path), { recursive: true });
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(url).catch((e) => ({ ok: false, status: String(e) }));
      if (res.ok) {
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
        downloaded++;
        return;
      }
      if (attempt === 3) missing.push(`${rel} (${res.status})`);
    }
  }),
);

if (hasFfmpeg) {
  for (const d of dexes) {
    const mp3 = join(OUT, `cries/${d}.mp3`);
    if (!existsSync(mp3)) execFileSync('ffmpeg', ['-loglevel', 'error', '-i', join(OUT, `cries/${d}.ogg`), mp3]);
  }
}

if (missing.length) {
  console.error(`fetch-assets: missing ${missing.length}: ${missing.join(', ')}`);
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  for (const sub of ['front', 'back', 'retro', 'cries', 'shiny/front', 'shiny/back', 'trainers', 'items']) {
    const p = join(dir, sub);
    if (!existsSync(p)) continue;
    for (const f of execFileSync('ls', [p], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
      const full = join(p, f);
      files.push({ path: relative(OUT, full), bytes: statSync(full).size });
    }
  }
};
walk(OUT);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ count: files.length, files }, null, 1));
console.log(`fetch-assets: downloaded ${downloaded}, manifest lists ${files.length} files`);
