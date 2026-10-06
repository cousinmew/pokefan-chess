// SPDX-License-Identifier: AGPL-3.0-only
// One Lichess puzzle attempt (§B7). The FEN is one move before the puzzle: that first move is the opponent's,
// then the player answers. A wrong reply ends the attempt; correct replies auto play the opponent's answer.
// As on Lichess, any mating move is accepted on the last move.
import { Chess } from 'chess.js';

export type PuzzleRow = [id: string, fen: string, moves: string, rating: number];

export interface Answer {
  ok: boolean;
  done: boolean;
  /** The opponent's reply to auto play when the line continues. */
  reply?: string;
}

const asMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

export class PuzzleRun {
  readonly id: string;
  readonly rating: number;
  readonly fen: string;
  private readonly line: string[];
  private readonly chess: Chess;
  private idx = 0;

  constructor(row: PuzzleRow) {
    [this.id, this.fen] = row;
    this.rating = row[3];
    this.line = row[2].split(' ');
    this.chess = new Chess(this.fen);
  }

  /** The opponent's set up move; call once before the player answers. */
  first(): string {
    const uci = this.line[0]!;
    this.chess.move(asMove(uci));
    this.idx = 1;
    return uci;
  }

  /** The side the player plays. */
  get side(): 'w' | 'b' {
    return this.chess.turn();
  }

  expected(): string {
    return this.line[this.idx] ?? '';
  }

  expectedSan(): string {
    const probe = new Chess(this.chess.fen());
    return probe.move(asMove(this.expected())).san;
  }

  answer(uci: string): Answer {
    const last = this.idx === this.line.length - 1;
    let mates = false;
    if (uci !== this.expected() && last) {
      const probe = new Chess(this.chess.fen());
      try {
        probe.move(asMove(uci));
        mates = probe.isCheckmate();
      } catch (err) {
        if (!(err instanceof Error)) throw err;
      }
    }
    if (uci !== this.expected() && !mates) return { ok: false, done: true };
    this.chess.move(asMove(uci));
    this.idx++;
    if (this.idx >= this.line.length) return { ok: true, done: true };
    const reply = this.line[this.idx]!;
    this.chess.move(asMove(reply));
    this.idx++;
    return { ok: true, done: false, reply };
  }
}
