// SPDX-License-Identifier: AGPL-3.0-only
// The Journey's games vs the computer (moved out of main.ts, 14 Oct): Victory Road drills (a move limit) and Champion
// BLUE. A challenge starts under the battle bars, counts your moves, and hands its result to the Journey after a hold.
import { CHALLENGE_END_MS } from '../config';
import type { Color } from '../board/pieces';
import { music } from '../audio/music';
import type { App, Challenge, Setup } from '../appTypes';
import { drillStatus, type DrillStatus } from '../campaign/drill';
import { hold } from '../ui/pace';
import type { Away } from './away';

export interface ChallengeHost {
  app: App;
  away: Away;
  /** The battle bars close; resolves when shut. */
  cover(): Promise<void>;
  configure(setup: Setup): void;
  /** Shows the game screen and starts the position (no intro card). */
  begin(fen?: string): void;
}

export class Challenges {
  /** The challenge on the board, with your moves so far. */
  current: (Challenge & { made: number }) | null = null;

  constructor(private readonly h: ChallengeHost) {}

  start(ch: Challenge): void {
    void this.h.cover().then(() => {
      this.h.configure({ mode: 'challenge', human: 'w', level: ch.level });
      this.current = { ...ch, made: 0 };
      this.h.begin(ch.fen);
    });
  }

  /** A drill's result for the position now (a Champion game has no limit), or null outside a challenge. */
  status(): DrillStatus | null {
    const { app } = this.h;
    return app.mode === 'challenge' ? drillStatus(app.game.chess, this.current?.made ?? 0, this.current?.limit ?? 999, app.human) : null;
  }

  /** A move landed: yours counts toward a drill's limit, and the drill ends when it runs out. */
  settled(mover: Color): void {
    const { app } = this.h;
    const ch = this.current;
    if (app.mode !== 'challenge' || !ch || app.ended) return;
    if (mover === app.human) ch.made++;
    if (ch.limit && drillStatus(app.game.chess, ch.made, ch.limit, app.human) === 'limit') this.end('limit');
  }

  end(result: DrillStatus): void {
    const { app, away } = this.h;
    const ch = this.current;
    if (!ch || result === 'playing') return;
    this.current = null;
    app.ended = true;
    app.board.locked = true;
    music.play(result === 'mate' ? 'victory' : 'defeat');
    const r = away.round;
    // A hold on the final position (pacing): skippable after HOLD_MIN_MS, after OPTION on the way back.
    void hold(CHALLENGE_END_MS, 'end', r).then((how) => how !== 'cancel' && away.run(r, () => ch.onEnd(result)));
  }
}
