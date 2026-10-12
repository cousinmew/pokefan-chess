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
  const boardRect = () => h.board.el.getBoundingClientRect();
  /** A tight box around your own pieces (playtest, 12 Oct: the bottom two rows could hold the opponent's), so the
   * bubble goes above or below it and never covers your king. */
  const mine = (): DOMRect => {
    const rs = [...h.board.el.querySelectorAll<HTMLElement>(`[data-square][data-piece^="${h.human()}"]`)].map((e) => e.getBoundingClientRect());
    if (!rs.length) return boardRect();
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    return new DOMRect(left, top, Math.max(...rs.map((r) => r.right)) - left, Math.max(...rs.map((r) => r.bottom)) - top);
  };
  return {
    // Your pieces at the bottom, the goal in the header, then (after the set up move) the opponent's move.
    coach(event) {
      if (event === 'stop') return coach.close();
      if (event === 'setup') return coach.add({ text: fmt('coach.them'), target: boardRect });
      coach.start([
        { text: fmt('coach.you', { team: fmt('team.red') }), target: mine },
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
