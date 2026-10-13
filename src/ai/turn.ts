// SPDX-License-Identifier: AGPL-3.0-only
// The computer's turn (moved out of main.ts with the pacing pass, 12 Oct): Youngster or Stockfish, never faster than
// AI_MIN_THINK_MS, never hangs. The minimum think is a hold a tap can cut after HOLD_MIN_MS.
// C3, 14 Oct: "{trainer} is thinking…" shows from the start of the turn when the level really thinks (its movetime is
// THINKING_LINE_MS or more, or the engine is still to download), else only if the reply is still out at twice that, so
// it no longer flashes; once shown it stays THINK_LINE_MIN_MS and the move waits for it. A Journey game (Champion,
// drills) asks the engine once more before falling back to Youngster. C2: Take back during the think drops the reply.
import { AI_LEVELS, AI_MIN_THINK_MS, THINKING_LINE_MS } from '../config';
import type { App } from '../appTypes';
import type { Away } from '../game/away';
import { rng } from '../game/rng';
import { cancelHold, hold, holding } from '../ui/pace';
import { youngsterMove } from './engine';

export const THINK_LINE_MIN_MS = 1000; // once "{trainer} is thinking…" shows it stays this long; the reply waits for it (C3)

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

interface Turn {
  round: number;
  away: Away;
  cancelled: boolean;
  timer: number;
}

/** The turn being thought now: until its reply plays, or it is dropped. */
let current: Turn | null = null;
/** One engine search at a time: a dropped turn's search ends first (its answer is ignored), so the engine never
 * answers a later position with an earlier bestmove. */
let searching: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, Math.max(0, ms)));

/** Whether the computer is thinking in the game on the board (Take back can stop it, C2). */
export const thinkingNow = (): boolean => !!current && !current.cancelled && current.round === current.away.round;

/** Take back during the think (C2): the reply is dropped, also when the engine answers later, and the board is the
 * player's again. False when the computer is not thinking. */
export function cancelThink(app: App): boolean {
  const t = current;
  if (!t || !thinkingNow()) return false;
  t.cancelled = true;
  current = null;
  window.clearTimeout(t.timer);
  if (holding() === 'think') cancelHold();
  app.busy = false;
  return true;
}

async function engineMove(app: App, t: Turn, keepLine: () => void): Promise<string> {
  const ask = async (): Promise<string> => {
    await searching;
    if (t.cancelled) throw new Error('turn dropped');
    const p = app.engine.bestMove(app.game.fen(), app.level);
    searching = p.catch(() => undefined);
    return p;
  };
  try {
    return await ask();
  } catch (err) {
    if (app.mode !== 'challenge' || t.cancelled) throw err;
    // A Journey game never drops to Easy on one failure (a slow first download on a phone): once more, the line kept.
    console.warn('engine failed in a Journey game, asking once more:', err instanceof Error ? err.message : err);
    keepLine();
    return ask();
  }
}

export async function computerTurn(h: TurnHost): Promise<void> {
  const { app, away } = h;
  if (!h.due()) return;
  const t: Turn = { round: away.round, away, cancelled: false, timer: 0 };
  const r = t.round;
  current = t;
  app.busy = true;
  app.board.locked = true;
  const live = () => !t.cancelled && r === away.round;
  const done = () => {
    window.clearTimeout(t.timer);
    if (current === t) current = null;
  };
  const least = hold(AI_MIN_THINK_MS, 'think', r);
  let shown = 0;
  const show = () => {
    if (shown || !live()) return;
    shown = performance.now();
    h.thinking();
  };
  const movetime = AI_LEVELS.find((l) => l.id === app.level)?.movetimeMs ?? 0;
  if (app.level > 1 && (movetime >= THINKING_LINE_MS || !app.engine.loaded)) show();
  else t.timer = window.setTimeout(show, 2 * THINKING_LINE_MS);
  let uci: string;
  try {
    uci = app.level === 1 ? youngsterMove(app.game.chess, rng) : await engineMove(app, t, show);
  } catch (err) {
    if (!live()) return done();
    console.warn('computer trainer fell back to Youngster:', err instanceof Error ? err.message : err);
    app.level = 1;
    app.aiFailed = true;
    h.failed();
    uci = youngsterMove(app.game.chess, rng);
  }
  window.clearTimeout(t.timer); // answered: no line from now on if none showed yet
  await least; // a new game since drops the move below (away.run)
  if (shown) await sleep(shown + THINK_LINE_MIN_MS - performance.now());
  if (!live()) return done();
  // Thought while OPTION or START was open: the reply waits for the board (bugs #7, C1), and never lands in a game
  // started since, or after a take back.
  away.run(r, () => {
    if (t.cancelled) return;
    done();
    app.busy = false;
    h.play(uci);
  });
}
