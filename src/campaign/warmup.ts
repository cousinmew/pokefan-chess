// SPDX-License-Identifier: AGPL-3.0-only
// Oak's Route 1 warm-up (W5, design G): the first time a BLUE save enters Route 1, three authored one move positions
// on the main board with the YELLOW engine (a capture, a check, a mate in 1; free hints, wrong moves put back), with
// the player's own team. Then a first catch that cannot fail, PIDGEY, which becomes the pawns when that slot is empty
// and the My Team rules allow it. Skip goes straight to the route. Either way the save remembers it (warmup).
import { SPECIES } from '../board/pieces';
import { music } from '../audio/music';
import { sound } from '../audio/audio';
import { fmt } from '../game/text';
import type { Rng } from '../game/rng';
import { encounterPanel, story } from '../ui/kanto';
import { firstCatchCard, tapCard, warmupIntro } from '../ui/journeyMap';
import { enforce } from '../../worker/src/team';
import { catchGains, DEX, teamBadges, throwBall, type Campaign } from './kanto';
import { WARMUP_PLACE } from './journey';
import { WARMUP, type Lesson } from './path';
import type { WarmupHooks } from './pathGame';

/** The guaranteed first catch: Route 1's most common slot. */
export const FIRST_CATCH = 'pidgey';
const FIRST_SLOT = { species: FIRST_CATCH, chance: 20 };

export interface WarmupHost {
  modal: HTMLElement;
  /** The YELLOW engine on the main board (PathGame). */
  path: { run(lesson: Lesson, hooks: WarmupHooks): void; stop(): void };
  campaign(): Campaign;
  set(c: Campaign): void;
  rng: Rng;
  /** Oak's sprite. */
  oak?: string;
}

/** Runs the warm-up, then `then` (the route, or the first trainer when the map's ▶ started it). */
export function warmup(h: WarmupHost, then: () => void): void {
  const done = (lesson: boolean) => {
    const c = h.campaign();
    // Finishing teaches mate in 1, so Oak's mini lesson for it is not needed before the first trainer.
    const seen = lesson && !c.lessonsSeen.includes('mateIn1') ? [...c.lessonsSeen, 'mateIn1'] : c.lessonsSeen;
    h.set({ ...c, warmup: true, lessonsSeen: seen });
  };
  const modal = h.modal;
  const close = () => {
    modal.onclick = null;
    modal.hidden = true;
    modal.replaceChildren();
  };
  modal.onclick = null;
  modal.replaceChildren(
    warmupIntro(
      h.oak,
      () => {
        close();
        h.path.run(WARMUP, { done: () => (done(true), firstCatch(h, then)), skip: () => (done(false), then()) });
      },
      () => (close(), done(false), then()),
    ),
  );
  modal.hidden = false;
}

/** Oak points at the grass; one ball, always a catch; then the result card. */
function firstCatch(h: WarmupHost, then: () => void): void {
  const modal = h.modal;
  story(modal, [fmt('warm.grass')], () => {
    music.play('battle');
    sound.cry(SPECIES[FIRST_CATCH]!.dex);
    const panel = encounterPanel(
      FIRST_CATCH,
      false,
      () => {
        // The same beat as tall grass (J3), then what it gave; the panel plays the victory sting after the beat.
        const before = h.campaign();
        const res = throwBall(before, WARMUP_PLACE, FIRST_SLOT, 'first', h.rng, false, true);
        h.set(res.campaign);
        return { caught: res.caught, gains: catchGains(before, res.campaign, FIRST_CATCH) };
      },
      () => undefined,
      () => undefined,
      () => {
        const c = h.campaign();
        // The pawns become PIDGEY only when the slot is empty and the My Team rules allow it (§B14).
        const pawns = !c.team.p && !!enforce({ p: FIRST_CATCH }, c.starter, teamBadges(c)).team.p;
        if (pawns) h.set({ ...c, team: { ...c.team, p: FIRST_CATCH } });
        tapCard(modal, firstCatchCard(FIRST_CATCH, DEX.filter((s) => c.caught[s]).length, pawns), then);
      },
    );
    modal.replaceChildren(panel);
    modal.hidden = false;
  }, h.oak);
}
