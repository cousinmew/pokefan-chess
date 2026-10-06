// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { AUTHORED, hintMove, LESSON_COUNT, mateLessons } from '../../src/campaign/path';

describe("Pikachu's Path (§B17)", () => {
  it('lessons 1 to 9 are authored: legal, white to move, not over, and solvable in one move', () => {
    expect(AUTHORED.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const l of AUTHORED) {
      expect(l.puzzles).toHaveLength(3);
      for (const p of l.puzzles) {
        const c = new Chess(p.fen);
        expect(c.turn(), p.fen).toBe('w');
        expect(c.isGameOver(), p.fen).toBe(false);
        expect(c.inCheck(), p.fen).toBe(p.goal === 'escape');
        expect(hintMove(p), p.fen).not.toBeNull();
        // The first six lessons each teach one piece: exactly one white piece besides the king (or only the king).
        if (l.n <= 6) expect(c.board().flat().filter((x) => x && x.color === 'w').length, p.fen).toBe(l.n === 6 ? 1 : 2);
      }
    }
  });

  it('lessons 10 to 12 are mate in 1 puzzles under 800, each solvable', () => {
    const rows = JSON.parse(readFileSync('src/data/puzzles/mateIn1.json', 'utf8'));
    const lessons = mateLessons(rows);
    expect(lessons.map((l) => l.n)).toEqual([10, 11, 12]);
    expect(AUTHORED.length + lessons.length).toBe(LESSON_COUNT);
    for (const l of lessons) {
      expect(l.puzzles).toHaveLength(3);
      for (const p of l.puzzles) expect(hintMove(p), p.fen).not.toBeNull();
    }
  });
});
