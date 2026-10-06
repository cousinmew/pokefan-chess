// SPDX-License-Identifier: AGPL-3.0-only
// Two routes from the BLUE hub: the Online menu, and the manual's "Try it" into each mode (§B16).
import type { JourneyGame } from '../campaign/journeyGame';
import type { OnlineGame } from '../net/onlineGame';
import { createRoom, normalizeCode } from '../net/online';
import type { Setup } from '../main';
import type { Page } from './manual';
import { message, onlineMenu } from './online';
import { levelSelect, teamSelect } from './screens';

export interface ModesHost {
  show(view: HTMLElement): void;
  goTitle(): void;
  online: OnlineGame;
  journey: JourneyGame;
  startGame(setup: Setup): void;
  quick(): Setup;
}

export class Modes {
  constructor(private readonly h: ModesHost) {}

  online(): void {
    const { show, goTitle, online } = this.h;
    show(
      onlineMenu(
        () => {
          show(message('online.joining', goTitle, { code: '...' }));
          createRoom().then(
            (code) => online.join(code),
            (err: unknown) => {
              console.warn('relay unavailable:', err instanceof Error ? err.message : err);
              show(message('online.offline', goTitle));
            },
          );
        },
        (code) => online.join(code),
        goTitle,
        normalizeCode(new URLSearchParams(location.search).get('room') ?? ''),
      ),
    );
  }

  /** The manual's "Try it" (§B16): straight into that page's mode. */
  tryIt(p: Page): void {
    const { show, goTitle, journey, startGame } = this.h;
    if (p === 'journey' || p === 'catching') return journey.open();
    if (p === 'training') return journey.openFromHub('training', goTitle);
    if (p === 'battle') return startGame(this.h.quick());
    if (p === 'computer') return show(teamSelect((human) => show(levelSelect((level) => startGame({ mode: 'computer', human, level }), goTitle)), goTitle));
    if (p === 'two') return startGame({ mode: 'two-players', human: 'w', level: 1 });
    if (p === 'pieces') return journey.openFromHub('team', goTitle);
    this.online();
  }
}
