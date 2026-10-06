// SPDX-License-Identifier: AGPL-3.0-only
// Run once, locally (§B7): streams the Lichess puzzle CSV (.zst, CC0) and writes src/data/puzzles/{theme}.json.
// The CSV lives OUTSIDE the repo and is never committed. Usage: node scripts/build-puzzles.mjs [path/to/lichess_db_puzzle.csv.zst]
import { createReadStream, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Decompress } from 'fzstd';

const SRC = process.argv[2] ?? join(homedir(), 'Code/pokefan-chess-data/lichess_db_puzzle.csv.zst');
const OUT = 'src/data/puzzles';
// Lichess theme tags used by the Kanto routes (Part B §B2).
const THEMES = ['mateIn1', 'mateIn2', 'castling', 'hangingPiece', 'trappedPiece', 'advantage', 'fork', 'promotion', 'advancedPawn', 'pin', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'capturingDefender', 'deflection', 'backRankMate', 'skewer', 'xRayAttack'];
const MIN_POPULARITY = 80;
const MIN_PLAYS = 500;
const MIN_RATING = 400;
const MAX_RATING = 1800;
const PER_BAND = 40; // per 100 point band per theme
const BUDGET = 1.5 * 1024 * 1024;

const want = new Set(THEMES);
const buckets = new Map(THEMES.map((t) => [t, new Map()]));
let rows = 0;
let kept = 0;
let col = null;

function line(l) {
  if (!l) return;
  const f = l.split(',');
  if (!col) {
    col = Object.fromEntries(f.map((name, i) => [name, i]));
    return;
  }
  rows++;
  const rating = Number(f[col.Rating]);
  if (rating < MIN_RATING || rating > MAX_RATING) return;
  if (Number(f[col.Popularity]) < MIN_POPULARITY || Number(f[col.NbPlays]) < MIN_PLAYS) return;
  const band = Math.floor(rating / 100) * 100;
  let used = false;
  for (const theme of f[col.Themes].split(' ')) {
    if (!want.has(theme)) continue;
    const b = buckets.get(theme);
    const list = b.get(band) ?? [];
    if (list.length >= PER_BAND) continue;
    list.push([f[col.PuzzleId], f[col.FEN], f[col.Moves], rating]);
    b.set(band, list);
    used = true;
  }
  if (used) kept++;
}

const decoder = new TextDecoder();
let rest = '';
const dec = new Decompress((chunk, final) => {
  const text = rest + decoder.decode(chunk, { stream: !final });
  const lines = text.split('\n');
  rest = final ? '' : lines.pop();
  for (const l of lines) line(l);
});

await new Promise((resolve, reject) => {
  const s = createReadStream(SRC);
  s.on('data', (d) => dec.push(new Uint8Array(d)));
  s.on('end', () => {
    dec.push(new Uint8Array(0), true);
    if (rest) line(rest);
    resolve();
  });
  s.on('error', reject);
});

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.json')) rmSync(join(OUT, f));
let total = 0;
for (const [theme, b] of buckets) {
  const list = [...b.values()].flat().sort((x, y) => x[3] - y[3] || (x[0] < y[0] ? -1 : 1));
  if (!list.length) continue;
  const path = join(OUT, `${theme}.json`);
  writeFileSync(path, JSON.stringify(list));
  total += statSync(path).size;
  console.log(`${theme}: ${list.length} puzzles, ${statSync(path).size} B`);
}
console.log(`scanned ${rows} rows, kept ${kept} puzzles, ${total} B total (budget ${BUDGET} B)`);
if (total > BUDGET) {
  console.error('over budget');
  process.exit(1);
}
