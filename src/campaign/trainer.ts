// SPDX-License-Identifier: AGPL-3.0-only
// Puzzle pools (loaded per theme on demand), puzzle choice by Trainer Rating, and saved progress.
import { PUZZLE_RD, PUZZLE_SEEN_MAX, PUZZLE_WIDEN, PUZZLE_WINDOW } from '../config';
import type { Rng } from '../game/rng';
import { load, save } from '../store/persist';
import type { PuzzleRow } from './puzzle';
import { startRating, update, type Rating } from './rating';

const loaders = import.meta.glob<PuzzleRow[]>('../data/puzzles/*.json', { import: 'default' });
const byTheme = new Map(Object.entries(loaders).map(([path, fn]) => [/([^/]+)\.json$/.exec(path)![1]!, fn]));
export const THEMES = [...byTheme.keys()].sort();

export async function pool(theme: string): Promise<PuzzleRow[]> {
  const fn = byTheme.get(theme);
  if (!fn) throw new Error(`no puzzle theme ${theme}`);
  return fn();
}

/** A puzzle within PUZZLE_WINDOW of the rating, widening by PUZZLE_WIDEN until one is unseen. */
export function pick(rows: PuzzleRow[], rating: number, seen: readonly string[], rng: Rng): PuzzleRow {
  if (!rows.length) throw new Error('empty puzzle pool');
  const skip = new Set(seen);
  for (let w = PUZZLE_WINDOW; w <= 3000; w += PUZZLE_WIDEN) {
    const near = rows.filter((p) => Math.abs(p[3] - rating) <= w && !skip.has(p[0]));
    if (near.length) return near[Math.floor(rng.next() * near.length)]!;
  }
  return rows[Math.floor(rng.next() * rows.length)]!;
}

export interface Trainer {
  rating: Rating;
  solved: number;
  missed: number;
  assisted: number;
  seen: string[];
}

export function loadTrainer(): Trainer {
  const t = load<Partial<Trainer>>('trainer');
  return { rating: t?.rating ?? startRating(), solved: t?.solved ?? 0, missed: t?.missed ?? 0, assisted: t?.assisted ?? 0, seen: t?.seen ?? [] };
}

/** Records a result. A puzzle solved with a hint leaves the rating unchanged. */
export function record(t: Trainer, row: PuzzleRow, result: 'solved' | 'missed' | 'assisted'): Trainer {
  const rating = result === 'assisted' ? t.rating : update(t.rating, row[3], PUZZLE_RD, result === 'solved' ? 1 : 0);
  const next: Trainer = {
    rating,
    solved: t.solved + (result === 'solved' ? 1 : 0),
    missed: t.missed + (result === 'missed' ? 1 : 0),
    assisted: t.assisted + (result === 'assisted' ? 1 : 0),
    seen: [...t.seen, row[0]].slice(-PUZZLE_SEEN_MAX),
  };
  save('trainer', next);
  return next;
}

/** Steps milestone flavour (§B6): never a rating claim. */
export function stepKey(r: number): 'puzzle.step1' | 'puzzle.step2' | 'puzzle.step3' {
  return r <= 800 ? 'puzzle.step1' : r <= 1400 ? 'puzzle.step2' : 'puzzle.step3';
}
