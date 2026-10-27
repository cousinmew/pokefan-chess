// SPDX-License-Identifier: AGPL-3.0-only
// VIRIDIAN FOREST playtest, 23 Oct: the second move's goal, what their reply did, the miss review's honest lines, and
// castling for new players.
import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { compareText, describeMove, keyIdea, refutationText, replyLine } from '../../src/campaign/review';
import { objective, PuzzleRun, type PuzzleRow } from '../../src/campaign/puzzle';
import { CASTLE_ROWS } from '../../src/campaign/castling';
import { oneMoveFirst } from '../../src/campaign/trainer';
import { fmt } from '../../src/game/text';

const t = (k: Parameters<typeof fmt>[0], v?: Parameters<typeof fmt>[1]) => fmt(k, v);
/** Lichess 0Are1 (hanging piece): you take the free knight, their bishop takes your queen, and Nxd7 (their queen) beats
 * the obvious recapture of the bishop. */
const ARE1: PuzzleRow = ['0Are1', '2kr1b1r/pppqpppp/1nn5/4P3/3P2b1/2NBBN2/PP3PPP/R2Q1RK1 b - - 10 10', 'c6e5 f3e5 g4d1 e5d7', 1139];

describe('VIRIDIAN FOREST (playtest, 23 Oct)', () => {
  it('the header says the goal for move 1 only, then "Move 2 of 2"; a mate counts down', () => {
    expect(objective('hangingPiece', ARE1[2], t)).toBe('Goal: grab the piece nobody defends (2 moves)');
    expect(objective('hangingPiece', ARE1[2], t, 2)).toBe('Move 2 of 2: find the strongest move');
    expect(objective('mateIn2', 'f3g4 f8f1 g4d1 f1d1', t, 2)).toBe('Checkmate in 1 move');
    const run = new PuzzleRun(ARE1);
    run.first();
    expect(run.step).toBe(1);
    run.answer(run.expected());
    expect(run.step).toBe(2);
  });

  it('between moves, the line says their reply took your queen', () => {
    const run = new PuzzleRun(ARE1);
    run.first();
    const before = new Chess(run.startFen);
    before.move({ from: 'f3', to: 'e5' });
    const said = replyLine(before.fen(), 'g4d1', 'w', 'BUG CATCHER LIAM');
    expect(said.key).toBe('reply.took');
    expect(t(said.key, said.vars)).toMatch(/^BUG CATCHER LIAM took your [A-Z]+! Your move\.$/);
  });

  it('a miss review tells the truth: their queen got away, and the comparison counts from the start', () => {
    const run = new PuzzleRun(ARE1);
    run.first();
    run.answer(run.expected());
    const pre = run.currentFen();
    const wrong = new Chess(pre);
    wrong.move({ from: 'c3', to: 'd1' }); // the obvious recapture
    const said = refutationText(wrong.fen(), 'd7e8', 'w', 'TEAM ROCKET');
    expect(said.key).toBe('review.wrong.escape');
    wrong.move({ from: 'd7', to: 'e8' });
    const right = new Chess(pre);
    right.move({ from: 'e5', to: 'd7' });
    expect(compareText(run.startFen, wrong.fen(), right.fen(), 'w', t)).toBe('Your move: behind by 3. The right line: ahead by 3.');
  });

  it('every authored castling puzzle: a legal set up, then the only legal castle, said as castling', () => {
    expect(CASTLE_ROWS.length).toBeGreaterThanOrEqual(6);
    for (const row of CASTLE_ROWS) {
      const run = new PuzzleRun(row);
      run.first();
      const castles = new Chess(run.currentFen()).moves({ verbose: true }).filter((m) => m.isKingsideCastle() || m.isQueensideCastle());
      expect(castles.map((m) => m.from + m.to), row[0]).toEqual([run.expected()]);
      expect(describeMove(run.currentFen(), run.expected(), 'species', false, (k) => fmt(k)).key, row[0]).toBe('review.right.castle');
      const start = run.startFen;
      expect(run.answer(run.expected())).toMatchObject({ ok: true, done: true });
      expect(keyIdea('castling', start, run.played, run.side === 'w' ? 'b' : 'w').text.key, row[0]).toBe('review.castle');
    }
  });

  it('before CERULEAN GYM, one move puzzles first where the theme has them', () => {
    const rows: PuzzleRow[] = [ARE1, ['one01', '8/8/8/8/8/8/8/K6k w - - 0 1', 'a1a2 h1h2', 500]];
    expect(oneMoveFirst(rows).map((r) => r[0])).toEqual(['one01']);
    expect(oneMoveFirst([ARE1]).map((r) => r[0])).toEqual(['0Are1']);
  });
});
