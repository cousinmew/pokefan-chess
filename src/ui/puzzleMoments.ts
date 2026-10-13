// SPDX-License-Identifier: AGPL-3.0-only
// The puzzle's moments on the game screen (W3): the first puzzle's coach marks (design F) and the solve moment
// (design J). Kept out of main.ts, which only wires them to the puzzle player.
import { MISS_SHAKE_MS, SOLVED_STAMP_MS, YELLOW_CHEER_MS } from '../config';
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

export interface Moments {
  coach(event: 'start' | 'setup' | 'stop'): void;
  solved(stamp?: boolean): void;
  miss(square: string): void;
  cheer(square: string): void;
}

export function puzzleMoments(h: MomentsHost): Moments {
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
    // The "SOLVED!" stamp over the board's centre (a plain fade under reduced motion, pacing R7), the shimmer, and the
    // opponent's "Oh no!".
    solved(stamp = true) {
      sound.shimmer();
      h.plates.say(h.human() === 'w' ? 'b' : 'w', fmt('say.ohno'));
      if (!stamp) return;
      const s = el('div', 'solved-stamp');
      s.dataset.testid = 'solved-stamp';
      s.textContent = fmt('review.stamp.solved');
      h.boardWrap.append(s);
      window.setTimeout(() => s.remove(), SOLVED_STAMP_MS);
    },
    // A wrong move (pacing A14): the piece you moved shakes on its square (none under reduced motion).
    miss(square) {
      const piece = h.board.squareEl(square)?.querySelector<HTMLElement>('.piece, .classic');
      if (!piece || h.reducedMotion()) return;
      piece.classList.add('miss-shake');
      window.setTimeout(() => piece.classList.remove('miss-shake'), MISS_SHAKE_MS);
    },
    // A right Pikachu's Path move (pacing D4): six stars burst from the target square (none under reduced motion).
    cheer(square) {
      const cell = h.board.squareEl(square);
      if (!cell || h.reducedMotion()) return;
      const wrap = h.boardWrap.getBoundingClientRect();
      const r = cell.getBoundingClientRect();
      const burst = el('div', 'cheer');
      burst.dataset.testid = 'cheer';
      Object.assign(burst.style, { left: `${r.left - wrap.left + r.width / 2}px`, top: `${r.top - wrap.top + r.height / 2}px` });
      for (let i = 0; i < 6; i++) {
        const star = el('span', 'cheer-star');
        star.textContent = '★';
        star.style.setProperty('--a', `${i * 60}deg`);
        burst.append(star);
      }
      h.boardWrap.append(burst);
      window.setTimeout(() => burst.remove(), YELLOW_CHEER_MS);
    },
  };
}
