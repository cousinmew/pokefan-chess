// SPDX-License-Identifier: AGPL-3.0-only
// The Journey's games vs the computer (moved out of main.ts, 14 Oct): Victory Road drills (a move limit) and Champion
// BLUE. A challenge starts under the battle bars, counts your moves, and hands its result to the Journey after a hold.
// C9: the top plate is who you face, Champion BLUE with his Red/Blue Champion party answering your starter, or PROF.
// OAK for a drill, never the story's Rocket trainer; a drill counts down its moves in the header.
import { CHALLENGE_END_MS } from '../config';
import type { Color, TeamSkin } from '../board/pieces';
import { loadout } from '../board/loadouts';
import { music } from '../audio/music';
import type { App, Challenge, Setup } from '../appTypes';
import { drillStatus, type DrillStatus } from '../campaign/drill';
import trainers from '../data/trainers.json';
import type { Side } from '../look';
import { hold } from '../ui/pace';
import type { Away } from './away';

const PEOPLE = trainers.people as Record<string, string>;
export const MOVES_LOW = 3; // a drill's "Moves left" is highlighted from here down (C9)

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
      this.current = { ...ch, made: 0 }; // before configure: the Champion's team is set there
      this.h.configure({ mode: 'challenge', human: 'w', level: ch.level });
      this.h.begin(ch.fen);
    });
  }

  /** A drill (a position to mate from), not the Champion's full game. */
  get drill(): boolean {
    return !!this.current?.fen;
  }

  /** Who stands on the top plate: PROF. OAK for a drill, Champion BLUE for the full game. */
  side(name: (key: string) => string): Side | null {
    if (!this.current) return null;
    return this.drill ? { sprite: PEOPLE.oak ?? 'oak', name: name('oak.title'), title: name('title.professor') } : { sprite: PEOPLE['blue-champion'] ?? 'blue-gen1champion', name: name('plate.blue'), title: name('title.champion') };
  }

  /** The Champion's side wears BLUE's Champion party, his starter answering yours; a drill keeps the default teams. */
  team(computer: Color, starter: string | null | undefined): Partial<Record<Color, TeamSkin>> {
    const t = this.current && !this.drill ? loadout(PEOPLE.blue ?? 'blue-gen1', starter) : null;
    return t ? { [computer]: t } : {};
  }

  /** A drill's moves left (your moves), for the header; null outside a drill or without a limit. */
  movesLeft(): number | null {
    const ch = this.current;
    return this.h.app.mode === 'challenge' && ch?.limit ? Math.max(0, ch.limit - ch.made) : null;
  }

  /** Few moves left: the header highlights the count. */
  get low(): boolean {
    const n = this.movesLeft();
    return n !== null && n <= MOVES_LOW;
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
