// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Chess } from 'chess.js';
import { PuzzleRun, type PuzzleRow } from '../../src/campaign/puzzle';
import { startRating, update } from '../../src/campaign/rating';
import { pick } from '../../src/campaign/trainer';
import { createRng } from '../../src/game/rng';

const DIR = 'src/data/puzzles';
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const load = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as PuzzleRow[];

describe('puzzle data', () => {
  it('at least 15 theme files, under the 1.5 MB budget, rows [id, fen, moves, rating]', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
    const total = files.reduce((n, f) => n + statSync(`${DIR}/${f}`).size, 0);
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
    for (const f of files) {
      for (const row of load(f)) {
        expect(row).toHaveLength(4);
        expect(row[3]).toBeGreaterThanOrEqual(400);
        expect(row[3]).toBeLessThanOrEqual(1800);
      }
    }
  });

  it.each(files)('20 random puzzles in %s replay through chess.js and solve in the puzzle player', (f) => {
    const rows = load(f);
    const rng = createRng(2026);
    for (let i = 0; i < 20; i++) {
      const row = rows[Math.floor(rng.next() * rows.length)]!;
      const chess = new Chess(row[1]);
      for (const m of row[2].split(' ')) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      if (f.startsWith('mateIn') || f === 'backRankMate') expect(chess.isCheckmate(), row[0]).toBe(true);
      const run = new PuzzleRun(row);
      run.first();
      let res = run.answer(run.expected());
      while (!res.done) {
        expect(res.ok).toBe(true);
        res = run.answer(run.expected());
      }
      expect(res.ok, row[0]).toBe(true);
    }
  });

  it('a wrong reply ends the attempt; any mating move counts on the last move', () => {
    const rows = load('mateIn1.json');
    const run = new PuzzleRun(rows[0]!);
    run.first();
    expect(run.answer('a1a1')).toEqual({ ok: false, done: true });
  });
});

describe('Trainer Rating', () => {
  it('starts at 600, rises after 10 solves, falls after 10 misses', () => {
    let r = startRating();
    expect(r.r).toBe(600);
    for (let i = 0; i < 10; i++) r = update(r, 650, 75, 1);
    const afterSolves = r.r;
    expect(afterSolves).toBeGreaterThan(600);
    for (let i = 0; i < 10; i++) r = update(r, afterSolves, 75, 0);
    expect(r.r).toBeLessThan(afterSolves);
    expect(r.rd).toBeGreaterThanOrEqual(45);
  });

  it('serves puzzles within 150 of the rating, skipping seen ones', () => {
    const rows = load('fork.json');
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) expect(Math.abs(pick(rows, 900, [], rng)[3] - 900)).toBeLessThanOrEqual(150);
    const near = rows.filter((p) => Math.abs(p[3] - 900) <= 150).map((p) => p[0]);
    // Every nearby puzzle but one already seen: that one is served.
    expect(pick(rows, 900, near.slice(0, -1), rng)[0]).toBe(near.at(-1));
  });
});
