// SPDX-License-Identifier: AGPL-3.0-only
// The START button (§B22 item 3): small, always there after the intro, in the top corner (top right, top left in RTL),
// styled like the Gen 1 START menu. It opens JOURNEY, VS COMPUTER, VS FRIEND, ONLINE, POKéDEX, OPTION and SAVE & QUIT.
// Enter or S opens it, B or Escape closes it. On the game screen it sits in the existing top bar, so the board keeps
// its size; elsewhere in the screen's own top row, or in the corner.
import type { StringKey } from '../game/text';
import { el } from './dom';

export type StartItem = 'journey' | 'computer' | 'friend' | 'online' | 'dex' | 'option' | 'quit';
export type StartActions = Partial<Record<StartItem, () => void>>;

// Screens before or inside the intro, and the start flow itself, have no START.
const NO_START = new Set(['screen-splash', 'screen-shelf', 'screen-start', 'screen-replace', 'screen-profiles', 'screen-duo', 'screen-intro', 'screen-name', 'screen-oak', 'screen-quick']);

export class StartButton {
  /** The one in the game screen's top bar. */
  readonly inBar = this.make('start-button');
  /** The one for every other screen. */
  readonly roaming = this.make('start-button-corner');
  private menu: HTMLElement | null = null;

  constructor(private readonly actions: () => StartActions, private readonly allowed: () => boolean) {
    window.addEventListener('keydown', (e) => {
      if (this.menu) {
        if (e.key === 'Escape' || e.code === 'KeyB' || e.key.toLowerCase() === 'b') {
          e.preventDefault();
          this.close();
        }
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const free = document.activeElement === document.body || document.activeElement === null;
      if (typing || !this.visible() || e.repeat) return;
      if (e.code === 'KeyS' || (e.key === 'Enter' && free)) {
        e.preventDefault();
        this.open();
      }
    });
  }

  private make(testid: string): HTMLButtonElement {
    const b = el('button', 'start-btn');
    b.type = 'button';
    b.textContent = 'START';
    b.dataset.testid = testid;
    b.setAttribute('aria-haspopup', 'menu');
    b.onclick = () => this.open();
    return b;
  }

  private visible(): boolean {
    return (this.inBar.isConnected && this.inBar.offsetParent !== null) || (this.roaming.isConnected && !this.roaming.hidden);
  }

  /** Places the corner button for a newly shown screen: in its top row if it has one, else fixed in the corner. */
  place(view: HTMLElement): void {
    this.close();
    const id = view.dataset.testid ?? '';
    const show = this.allowed() && !NO_START.has(id) && id !== 'screen-game';
    this.roaming.hidden = !show;
    if (!show) return;
    const row = view.querySelector('.hub-top, .yellow-top');
    this.roaming.classList.toggle('corner', !row);
    if (row) row.append(this.roaming);
    else document.body.append(this.roaming);
  }

  open(): void {
    if (this.menu) return;
    const acts = this.actions();
    const back = el('div', 'start-overlay');
    back.dataset.testid = 'start-overlay';
    back.onclick = (e) => e.target === back && this.close();
    const list = el('div', 'gb-box start-list start-pop');
    list.setAttribute('role', 'menu');
    for (const id of ['journey', 'computer', 'friend', 'online', 'dex', 'option', 'quit'] as StartItem[]) {
      const run = acts[id];
      if (!run) continue;
      const b = el('button', 'start-item');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.dataset.testid = `start-menu-${id}`;
      const cursor = el('span', 'start-cursor');
      cursor.textContent = '▶';
      b.append(cursor, el('span', '', `startmenu.${id}` as StringKey));
      b.onclick = () => {
        this.close();
        run();
      };
      b.onfocus = () => list.querySelectorAll('.start-item').forEach((x) => x.classList.toggle('on', x === b));
      list.append(b);
    }
    back.append(list);
    document.body.append(back);
    this.menu = back;
    list.querySelector<HTMLElement>('.start-item')?.focus();
  }

  close(): void {
    this.menu?.remove();
    this.menu = null;
  }

  get isOpen(): boolean {
    return this.menu !== null;
  }
}
