// SPDX-License-Identifier: AGPL-3.0-only
// Trainers beside the board (§B18 item 8): a name plate above the board for the side at the top and one below for
// the side at the bottom, each with its trainer. Phones: a 48 px sprite inside the plate; desktop: a larger one.
// Reactions are CSS only: a hop for a capture, a shake for a lost piece, "!" on check, the loser fades at the end.
// Change A: each plate is also a message bar. Yours holds the text box; the opponent's shows what their side says
// ("TEAM ROCKET wants to battle!", reactions). With no trainers (Pikachu's Path) your bar keeps the text box.
import type { Color } from '../board/pieces';
import { el } from './dom';
import { trainerSprite } from './kanto';

import type { Side } from '../look';

export class Plates {
  readonly top = el('div', 'plate plate-top');
  readonly bottom = el('div', 'plate plate-bottom');
  private sides: Partial<Record<Color, Side>> = {};
  private bottomColor: Color = 'w';
  private readonly who = { top: el('div', 'plate-who'), bottom: el('div', 'plate-who') };
  private readonly topMsg = el('p', 'plate-msg');
  private readonly bottomMsg = el('div', 'plate-msg');

  constructor() {
    this.top.dataset.testid = 'plate-top';
    this.bottom.dataset.testid = 'plate-bottom';
    this.topMsg.dataset.testid = 'plate-top-msg';
    const bubble = () => {
      const b = el('span', 'plate-bubble');
      b.textContent = '!';
      b.setAttribute('aria-hidden', 'true');
      return b;
    };
    this.top.append(this.who.top, this.topMsg, bubble());
    this.bottom.append(this.who.bottom, this.bottomMsg, bubble());
  }

  /** Your bar hosts the game's text box (merged plate and message, change A). */
  attachText(text: HTMLElement): void {
    this.bottomMsg.append(text);
  }

  /** A line from one side; false when it belongs in your text box (your side, or no trainers on screen). */
  message(c: Color, text: string): boolean {
    if (this.top.hidden || c === this.bottomColor) return false;
    this.topMsg.textContent = text;
    return true;
  }

  /** Clears the opponent's line once play moves on. */
  quiet(): void {
    this.topMsg.textContent = '';
  }

  /** Who stands on each side; `bottom` is the colour at the bottom of the board. Null shows no trainers: the top
   * plate hides and the bottom one keeps only the text box. */
  set(sides: Record<Color, Side> | null, bottom: Color): void {
    this.sides = sides ?? {};
    this.top.hidden = !sides;
    this.bottom.classList.toggle('no-trainer', !sides);
    this.topMsg.textContent = '';
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
    // The opponent's reaction goes in their bar's message (change A); yours pops over your sprite.
    if (plate === this.top) return void (this.topMsg.textContent = word);
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
    const who = plate === this.top ? this.who.top : this.who.bottom;
    if (!s) return who.replaceChildren();
    const sprite = trainerSprite(s.sprite, 'trainer-sprite plate-sprite');
    sprite.dataset.trainer = s.sprite;
    const name = el('span', 'plate-name');
    const b = el('b');
    b.textContent = s.name;
    const title = el('small', 'plate-title');
    title.textContent = s.title;
    name.append(b, ' · ', title);
    who.replaceChildren(sprite, name);
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
