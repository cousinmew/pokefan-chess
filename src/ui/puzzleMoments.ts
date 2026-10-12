// SPDX-License-Identifier: AGPL-3.0-only
// The puzzle's moments on the game screen (W3): the first puzzle's coach marks (design F) and the solve moment
// (design J). Kept out of main.ts, which only wires them to the puzzle player.
import { SOLVED_STAMP_MS } from '../config';
import { sound } from '../audio/audio';
import type { Board } from '../board/board';
import type { Color } from '../board/pieces';
import { fmt } from '../game/text';
import { Coach } from './coach';
import { el } from './dom';
import type { Plates } from './plates';

export interface MomentsHost {
  view: HTMLElement;
  board: Board;
  boardWrap: HTMLElement;
  turnEl: HTMLElement;
  plates: Plates;
  human(): Color;
  reducedMotion(): boolean;
}

export function puzzleMoments(h: MomentsHost): { coach(event: 'start' | 'setup' | 'stop'): void; solved(): void } {
  const coach = new Coach();
  h.view.append(coach.el);
  const boardRect = (part: 'bottom' | 'all') => {
    const r = h.board.el.getBoundingClientRect();
    return part === 'all' ? r : new DOMRect(r.left, r.top + r.height * 0.75, r.width, r.height * 0.25);
  };
  return {
    // Your pieces at the bottom, the goal in the header, then (after the set up move) the opponent's move.
    coach(event) {
      if (event === 'stop') return coach.close();
      if (event === 'setup') return coach.add({ text: fmt('coach.them'), target: () => boardRect('all') });
      coach.start([
        { text: fmt('coach.you', { team: fmt('team.red') }), target: () => boardRect('bottom') },
        { text: fmt('coach.goal'), target: () => h.turnEl.getBoundingClientRect() },
      ], 1);
    },
    // A short "SOLVED!" stamp (none under reduced motion), the shimmer, and the opponent's "Oh no!".
    solved() {
      sound.shimmer();
      h.plates.say(h.human() === 'w' ? 'b' : 'w', fmt('say.ohno'));
      if (h.reducedMotion()) return;
      const stamp = el('div', 'solved-stamp');
      stamp.dataset.testid = 'solved-stamp';
      stamp.textContent = fmt('review.stamp.solved');
      h.boardWrap.append(stamp);
      window.setTimeout(() => stamp.remove(), SOLVED_STAMP_MS);
    },
  };
}
