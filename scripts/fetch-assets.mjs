// SPDX-License-Identifier: AGPL-3.0-only
// Fetches sprites and cries into public/assets/ at build time (§4.7). Never committed, never hotlinked.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';

const OUT = 'public/assets';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/';
const roster = JSON.parse(readFileSync('src/data/roster.gen1.json', 'utf8'));
const dexes = [...new Set(Object.values(roster.species).map((s) => s.dex))].sort((a, b) => a - b);

// Upstream errors, checked by eye 2026-10-05: black-white/animated/back/19.gif is Alolan Rattata (dark fur, Sun and Moon).
// The Showdown animated back sprite is the Kanto form.
const BACK_OVERRIDE = { 19: 'other/showdown/back/19.gif' };

const jobs = dexes.flatMap((d) => [
  [`${SPRITES}versions/generation-v/black-white/animated/${d}.gif`, `front/${d}.gif`],
  [`${SPRITES}${BACK_OVERRIDE[d] ?? `versions/generation-v/black-white/animated/back/${d}.gif`}`, `back/${d}.gif`],
  [`${SPRITES}versions/generation-i/red-blue/transparent/${d}.png`, `retro/${d}.png`],
  [`${CRIES}${d}.ogg`, `cries/${d}.ogg`],
]);

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
  for (const sub of ['front', 'back', 'retro', 'cries']) {
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
