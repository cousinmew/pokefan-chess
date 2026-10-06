// SPDX-License-Identifier: AGPL-3.0-only
// Trainers beside the board (§B18 item 8): a name plate above the board for the side at the top and one below for
// the side at the bottom, each with its trainer. Phones: a 48 px sprite inside the plate; desktop: a larger one.
// Reactions are CSS only: a hop for a capture, a shake for a lost piece, "!" on check, the loser fades at the end.
import type { Color } from '../board/pieces';
import { el } from './dom';
import { trainerSprite } from './kanto';

import type { Side } from '../look';

export class Plates {
  readonly top = el('div', 'plate plate-top');
  readonly bottom = el('div', 'plate plate-bottom');
  private sides: Partial<Record<Color, Side>> = {};
  private bottomColor: Color = 'w';

  constructor() {
    this.top.dataset.testid = 'plate-top';
    this.bottom.dataset.testid = 'plate-bottom';
  }

  /** Who stands on each side; `bottom` is the colour at the bottom of the board. Null hides both plates. */
  set(sides: Record<Color, Side> | null, bottom: Color): void {
    this.sides = sides ?? {};
    this.top.hidden = this.bottom.hidden = !sides;
    this.orient(bottom);
  }

  /** Follows the board when it flips (Two Players auto flip). */
  orient(bottom: Color): void {
    this.bottomColor = bottom;
    this.fill(this.bottom, bottom);
    this.fill(this.top, bottom === 'w' ? 'b' : 'w');
  }

  /** The sprite standing on a side, for the battle screen (§B20 item 2). */
  spriteOf(c: Color): string | undefined {
    return this.sides[c]?.sprite;
  }

  /** A one word reaction bubble over a side's trainer ("Go!", "Oh no!", "Yes!"), for a moment. */
  say(c: Color, word: string): void {
    const plate = this.plateOf(c);
    const bubble = plate.querySelector('.plate-say') ?? plate.appendChild(el('span', 'plate-say'));
    bubble.textContent = word;
    this.pulse(plate, 'saying');
  }

  private plateOf(c: Color): HTMLElement {
    return c === this.bottomColor ? this.bottom : this.top;
  }

  private fill(plate: HTMLElement, c: Color): void {
    const s = this.sides[c];
    plate.dataset.color = c;
    plate.className = plate.className.replace(/ (won|lost|check|hop|shake|saying)\b/g, '');
    if (!s) return plate.replaceChildren();
    const sprite = trainerSprite(s.sprite, 'trainer-sprite plate-sprite');
    sprite.dataset.trainer = s.sprite;
    const name = el('span', 'plate-name');
    const b = el('b');
    b.textContent = s.name;
    const title = el('small', 'plate-title');
    title.textContent = s.title;
    name.append(b, ' · ', title);
    const bubble = el('span', 'plate-bubble');
    bubble.textContent = '!';
    bubble.setAttribute('aria-hidden', 'true');
    plate.replaceChildren(sprite, name, bubble);
  }

  /** A capture: that side hops, the other shakes. */
  capture(by: Color): void {
    this.pulse(this.plateOf(by), 'hop');
    this.pulse(this.plateOf(by === 'w' ? 'b' : 'w'), 'shake');
  }

  /** "!" over the side in check; null clears it. */
  check(side: Color | null): void {
    this.top.classList.toggle('check', !!side && this.plateOf(side) === this.top);
    this.bottom.classList.toggle('check', !!side && this.plateOf(side) === this.bottom);
  }

  /** The winner stays, the loser fades; a draw leaves both. */
  end(winner: Color | null): void {
    this.check(null);
    if (!winner) return;
    this.plateOf(winner).classList.add('won');
    this.plateOf(winner === 'w' ? 'b' : 'w').classList.add('lost');
  }

  private pulse(plate: HTMLElement, cls: 'hop' | 'shake' | 'saying'): void {
    plate.classList.remove(cls);
    void plate.offsetWidth; // restart the animation
    plate.classList.add(cls);
  }
}
