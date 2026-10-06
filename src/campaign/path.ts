// SPDX-License-Identifier: AGPL-3.0-only
// Pikachu's Path (§B17, YELLOW): 12 tiny lessons of 3 one move puzzles. Lessons 1 to 9 are authored here (Lichess has
// no tags for piece moves, captures or escaping check); 10 to 12 use easy mateIn1 puzzles (rating under 800).
import { Chess, type Move } from 'chess.js';

export type Goal = 'star' | 'capture' | 'check' | 'escape' | 'mate';
export interface PathPuzzle {
  fen: string;
  goal: Goal;
  /** For "star": the square to reach. */
  star?: string;
}
export interface Lesson {
  n: number;
  goal: Goal;
  puzzles: PathPuzzle[];
}

const W = ' w - - 0 1';
// A black pawn on h7 keeps lone piece positions from being an automatic draw (insufficient material).
const star = (fen: string, sq: string): PathPuzzle => ({ fen: fen.replace(/^7k\/8\//, '7k/7p/') + W, goal: 'star', star: sq });
const g = (goal: Goal, fen: string): PathPuzzle => ({ fen: fen + W, goal });

/** Lessons 1 to 9. Every position: white to move, both kings, the goal reachable in one move (unit tested). */
export const AUTHORED: Lesson[] = [
  { n: 1, goal: 'star', puzzles: [star('7k/8/8/8/8/8/4P3/7K', 'e4'), star('7k/8/8/8/8/8/2P5/7K', 'c3'), star('7k/8/8/8/3P4/8/8/7K', 'd5')] },
  { n: 2, goal: 'star', puzzles: [star('7k/8/8/8/8/8/8/1N5K', 'c3'), star('7k/8/8/8/4N3/8/8/7K', 'f6'), star('7k/8/8/3N4/8/8/8/7K', 'b4')] },
  { n: 3, goal: 'star', puzzles: [star('7k/8/8/8/8/8/8/2B4K', 'f4'), star('7k/8/8/8/3B4/8/8/7K', 'a7'), star('7k/8/8/8/8/8/6B1/7K', 'b7')] },
  { n: 4, goal: 'star', puzzles: [star('7k/8/8/8/8/8/8/R6K', 'a5'), star('7k/8/8/8/3R4/8/8/7K', 'a4'), star('7k/8/8/8/8/8/8/1R5K', 'b6')] },
  { n: 5, goal: 'star', puzzles: [star('7k/8/8/8/8/8/8/3Q3K', 'd6'), star('7k/8/8/8/8/8/8/3Q3K', 'a4'), star('7k/8/8/8/3Q4/8/8/7K', 'g1')] },
  { n: 6, goal: 'star', puzzles: [star('7k/8/8/8/4K3/8/8/8', 'e5'), star('7k/8/8/8/4K3/8/8/8', 'd3'), star('7k/8/8/8/8/8/8/4K3', 'f2')] },
  { n: 7, goal: 'capture', puzzles: [g('capture', '7k/8/8/3p4/4P3/8/8/7K'), g('capture', '7k/8/8/8/2n5/8/8/2R4K'), g('capture', '7k/8/8/8/8/5n2/8/3Q3K')] },
  { n: 8, goal: 'check', puzzles: [g('check', '7k/8/8/8/8/8/8/R6K'), g('check', '4k3/8/8/8/8/8/8/3QK3'), g('check', '7k/8/8/8/8/8/1R6/7K')] },
  { n: 9, goal: 'escape', puzzles: [g('escape', '7k/8/8/8/8/8/8/r3K3'), g('escape', '4k3/8/8/8/8/8/3q4/4K3'), g('escape', '7k/8/8/8/8/8/6PP/R3r2K')] },
];
export const LESSON_COUNT = 12;

/** Lessons 10 to 12 from easy mateIn1 puzzles: the position after the set up move, three per lesson. */
export function mateLessons(rows: [string, string, string, number][]): Lesson[] {
  const easy = rows.filter((r) => r[3] < 800 && r[2].split(' ').length === 2);
  return [10, 11, 12].map((n, i) => ({
    n,
    goal: 'mate' as Goal,
    puzzles: easy.slice(i * 3, i * 3 + 3).map((r) => {
      const c = new Chess(r[1]);
      const m = r[2].split(' ')[0]!;
      c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      return { fen: c.fen(), goal: 'mate' as Goal };
    }),
  }));
}

/** Whether a legal move meets the puzzle's goal. */
export function meets(p: PathPuzzle, move: Move, after: Chess): boolean {
  switch (p.goal) {
    case 'star':
      return move.to === p.star;
    case 'capture':
      return !!move.captured;
    case 'check':
      return after.inCheck();
    case 'escape':
      return true; // every legal move from check gets out of it: chess.js allows nothing else
    case 'mate':
      return after.isCheckmate();
  }
}

/** A move that meets the goal, for the free hint. */
export function hintMove(p: PathPuzzle): Move | null {
  const c = new Chess(p.fen);
  for (const m of c.moves({ verbose: true })) {
    const after = new Chess(p.fen);
    after.move(m);
    if (meets(p, m, after)) return m;
  }
  return null;
}
