// SPDX-License-Identifier: AGPL-3.0-only
// The computer's turn (moved out of main.ts with the pacing pass, 12 Oct): Youngster or Stockfish, never faster than
// AI_MIN_THINK_MS, never hangs. The minimum think is a hold a tap can cut after HOLD_MIN_MS, and "{trainer} is
// thinking…" shows only when it really thinks (THINKING_LINE_MS), so it no longer flickers on every reply.
import { AI_MIN_THINK_MS, THINKING_LINE_MS } from '../config';
import type { App } from '../appTypes';
import type { Away } from '../game/away';
import { rng } from '../game/rng';
import { hold } from '../ui/pace';
import { youngsterMove } from './engine';

export interface TurnHost {
  app: App;
  away: Away;
  /** Whether it is the computer's move now (vs Computer or a drill, no intro card, nothing running). */
  due(): boolean;
  thinking(): void;
  /** The engine failed: Youngster plays on, and the player is told once. */
  failed(): void;
  play(uci: string): void;
}

export async function computerTurn(h: TurnHost): Promise<void> {
  const { app, away } = h;
  if (!h.due()) return;
  const r = away.round;
  app.busy = true;
  app.board.locked = true;
  const least = hold(AI_MIN_THINK_MS, 'think', r);
  const slow = window.setTimeout(() => r === away.round && app.busy && h.thinking(), THINKING_LINE_MS);
  let uci: string;
  try {
    uci = app.level === 1 ? youngsterMove(app.game.chess, rng) : await app.engine.bestMove(app.game.fen(), app.level);
  } catch (err) {
    if (r !== away.round) return window.clearTimeout(slow);
    console.warn('computer trainer fell back to Youngster:', err instanceof Error ? err.message : err);
    app.level = 1;
    app.aiFailed = true;
    h.failed();
    uci = youngsterMove(app.game.chess, rng);
  }
  await least; // a new game since drops the move below (away.run)
  window.clearTimeout(slow);
  // Thought while OPTION was open: the reply waits for the board (bugs #7), and never lands in a game started since.
  away.run(r, () => ((app.busy = false), h.play(uci)));
}
