// SPDX-License-Identifier: AGPL-3.0-only
// One Lichess puzzle attempt (§B7). The FEN is one move before the puzzle: that first move is the opponent's,
// then the player answers. A wrong reply ends the attempt; correct replies auto play the opponent's answer.
// As on Lichess, any mating move is accepted on the last move.
import { Chess } from 'chess.js';
import type { StringKey, Vars } from '../game/text';

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
  /** The position after the set up move: where the player starts (review frame 0, §B15). */
  startFen = '';
  /** Moves actually played from startFen: yours (a mate on the last move counts) and the replies. */
  readonly played: string[] = [];

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
    this.startFen = this.chess.fen();
    return uci;
  }

  /** Your move number in the line: 1 before your first move, 2 after the first reply (playtest, 23 Oct). */
  get step(): number {
    return Math.max(1, Math.ceil(this.idx / 2));
  }

  /** The side the player plays. */
  get side(): 'w' | 'b' {
    return this.chess.turn();
  }

  expected(): string {
    return this.line[this.idx] ?? '';
  }

  /** The current position, before your next move. */
  currentFen(): string {
    return this.chess.fen();
  }

  /** The rest of the correct line from here (Show answer, §B15). */
  rest(): string[] {
    return this.line.slice(this.idx);
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
    this.played.push(uci);
    this.idx++;
    if (this.idx >= this.line.length) return { ok: true, done: true };
    const reply = this.line[this.idx]!;
    this.chess.move(asMove(reply));
    this.played.push(reply);
    this.idx++;
    return { ok: true, done: false, reply };
  }
}

const MATE_THEMES = ['mateIn1', 'mateIn2', 'backRankMate'];

/** Moves the player makes in a Lichess line: every second one, after the opponent's set up move. */
export const playerMoves = (moves: string): number => Math.max(1, Math.floor(moves.trim().split(/\s+/).length / 2));

/** The goal in the header for every puzzle (W3): "Checkmate in 1 move", "Checkmate in 2 moves", or the theme's goal
 * ("Goal: win material with a fork (2 moves)"). From your second move (`step`) the theme's goal gives way (playtest,
 * 23 Oct: it describes the first move only, and most second moves are something else): "Move 2 of 2: find the
 * strongest move"; a mate counts down instead. */
export function objective(theme: string, moves: string, t: (key: StringKey, vars?: Vars) => string, step = 1): string {
  const n = playerMoves(moves);
  const left = Math.max(1, n - step + 1);
  if (MATE_THEMES.includes(theme)) return left === 1 ? t('obj.mate1') : t('obj.mateN', { n: String(left) });
  if (step > 1 && n > 1) return t('obj.next', { n: String(Math.min(step, n)), total: String(n) });
  const goal = t('obj.goal', { goal: t(`lesson.${theme}.banner` as StringKey) });
  return n > 1 ? `${goal} ${t('obj.moves', { n: String(n) })}` : goal;
}
