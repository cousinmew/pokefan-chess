// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { keyIdea, lineFrames, refutationText } from '../../src/campaign/review';
import { PuzzleRun, type PuzzleRow } from '../../src/campaign/puzzle';

// A known fork: after h7h6, the knight jumps to c7 and attacks the king on e8 AND the rook on a8.
const FORK: PuzzleRow = ['tst01', 'r3k3/7p/8/1N6/8/8/8/4K3 b - - 0 1', 'h7h6 b5c7 e8e7 c7a8', 900];

describe('review moment (§B15)', () => {
  it('the fork drawing points at exactly the two attacked pieces', () => {
    const run = new PuzzleRun(FORK);
    run.first();
    const start = run.startFen;
    for (let r = run.answer(run.expected()); !r.done; r = run.answer(run.expected()));
    const idea = keyIdea('fork', start, run.played, 'w');
    expect(idea.lines.map((l) => [l.from, l.to]).sort()).toEqual([['c7', 'a8'], ['c7', 'e8']]);
    expect(idea.text).toMatchObject({ key: 'review.fork', vars: { piece: 'RAPIDASH', a: 'RHYDON', b: 'NIDOKING' } });
  });

  it('frames walk the whole line, one arrow per move', () => {
    const frames = lineFrames('r3k3/7p/7p/1N6/8/8/8/4K3 w - - 0 1', ['b5c7', 'e8e7', 'c7a8'], 'green');
    expect(frames).toHaveLength(4);
    expect(frames[3]!.arrows).toEqual([{ from: 'c7', to: 'a8', color: 'green' }]);
    expect(new Chess(frames[3]!.fen).get('a8')).toMatchObject({ type: 'n', color: 'w' });
  });

  it('mate marks the squares around the mated king', () => {
    const idea = keyIdea('mateIn1', 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', ['h1h8'], 'w');
    expect(idea.text.key).toBe('review.mate');
    expect(idea.marks.sort()).toEqual(['a7', 'b7', 'b8']);
  });

  it('the refutation line names what you lose', () => {
    // White's queen on d4 is left hanging to the knight on c6.
    expect(refutationText('4k3/8/2n5/8/3Q4/8/8/4K3 b - - 0 1', 'c6d4', 'w', 'TEAM ROCKET')).toEqual({ key: 'review.wrong.capture', vars: { side: 'TEAM ROCKET', piece: 'CHARIZARD' } });
  });
});
