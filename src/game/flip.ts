// SPDX-License-Identifier: AGPL-3.0-only
// Two Players' auto flip (C6, 14 Oct). The board used to turn in the frame the move landed, so e2-e4 slid in from what
// was now Black's side. Now the move lands in the mover's view, the board holds FLIP_HOLD_MS (the slide, then the
// pause before a turn line), folds shut and opens on the other side over FLIP_MS, and the next player's plate says
// whose turn it is. Nothing takes input meanwhile. Reduced motion: a fade of REDUCED_FADE_MS. A fold has no direction,
// so Hebrew needs no mirror.
import { MOVE_SLIDE_MS, REDUCED_FADE_MS, TURN_LINE_DELAY_MS } from '../config';
import type { Color } from '../board/pieces';
import type { App } from '../appTypes';
import type { Plates } from '../ui/plates';
import type { Away } from './away';
import { fmt } from './text';

export const FLIP_HOLD_MS = MOVE_SLIDE_MS + TURN_LINE_DELAY_MS; // the move lands and is seen before the board turns (C6)
export const FLIP_MS = 280; // the board folds shut and opens again on the other side (C6; at most 300)

export interface FlipHost {
  app: App;
  away: Away;
  /** The board wrap: the fold plays on it. */
  wrap: HTMLElement;
  plates: Plates;
  reduced(): boolean;
  /** The turn is over: the header and Take back follow. */
  done(): void;
}

const finished = (a: Animation) => a.finished.then(() => undefined, () => undefined);

/** After a move in Two Players with auto flip: the mover's line `said` goes up with their plate once the board turns. */
export function flipAfter(h: FlipHost, said: string): void {
  const { app, away } = h;
  const r = away.round;
  app.busy = true;
  app.board.locked = true;
  window.setTimeout(() => away.run(r, () => void turn(h, said, r)), FLIP_HOLD_MS);
}

async function turn(h: FlipHost, said: string, r: number): Promise<void> {
  const { app, away, plates } = h;
  const calm = h.reduced();
  const half = (calm ? REDUCED_FADE_MS : FLIP_MS) / 2;
  const shut: Keyframe[] = calm ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.04)' }];
  const fold = h.wrap.animate(shut, { duration: half, easing: 'ease-in', fill: 'forwards' });
  await finished(fold);
  if (r !== away.round) return void fold.cancel();
  const next: Color = app.game.turn();
  app.board.orientation = next;
  plates.orient(next);
  plates.check(app.game.checkedKing() ? next : null);
  app.board.render();
  plates.message(next === 'w' ? 'b' : 'w', said); // the mover's line, now on the top plate
  const line = fmt('turn.next', { name: plates.nameOf(next) ?? '' });
  if (!plates.message(next, line)) app.text.plain(line);
  const open = h.wrap.animate([...shut].reverse(), { duration: half, easing: 'ease-out' });
  fold.cancel();
  await finished(open);
  if (r !== away.round) return;
  app.busy = false;
  app.board.locked = false;
  h.done();
}
