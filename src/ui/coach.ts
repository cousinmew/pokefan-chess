// SPDX-License-Identifier: AGPL-3.0-only
// Coach marks (W3, design F): a save's first puzzle points out your team, the goal and the opponent's set up move,
// one bubble at a time. They never block: the layer ignores the pointer, so the board stays playable underneath;
// any tap (or Enter, Space, B) moves on, Escape skips them all, and your first move closes them. The first steps are
// read before the set up move plays (fix, 14 Oct): start() resolves once they are gone (read, skipped, closed or the
// screen left).
import { el } from './dom';
import { CONTROL, skipKey } from './pace';

export interface CoachStep {
  text: string;
  /** The spot to light up; null lights nothing and centres the bubble. */
  target(): DOMRect | null;
}

const GAP = 10;

export class Coach {
  readonly el = el('div', 'coach');
  private readonly spot = el('div', 'coach-spot');
  private readonly bubble = el('div', 'coach-bubble');
  private readonly text = el('p', 'coach-text');
  private queue: CoachStep[] = [];
  private current: CoachStep | null = null;
  /** Resolves start()'s promise: its steps are all gone. */
  private read: (() => void) | null = null;
  // Off screen (the game screen was left), the marks close and let the key or tap through (review fix).
  private readonly onTap = () => (this.el.isConnected ? this.next() : this.close());
  // Escape skips them all; Enter, Space and B (the app's skip keys, with no control focused and START closed) move on
  // like a tap (fix, 14 Oct: since the set up move waits for the marks, a keyboard player was stuck on the first one).
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.el.isConnected) return this.close();
    const focus = document.activeElement;
    const step = skipKey(e) && !(focus instanceof Element && focus !== document.body && focus.matches(CONTROL)) && !document.querySelector('.start-overlay');
    if (e.key !== 'Escape' && !step) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') this.close();
    else if (!e.repeat) this.next();
  };
  private readonly onResize = () => this.place();

  constructor() {
    this.el.dataset.testid = 'coach';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.bubble.append(this.text, el('span', 'coach-tap', 'story.tap'));
    this.el.append(this.spot, this.bubble);
  }

  /** Starts with these steps; `later` more will follow with add() (they wait for the set up move). Resolves when these
   * steps are gone: the last one tapped away, Escape, close(), or the game screen left. */
  start(steps: CoachStep[], later = 0): Promise<void> {
    this.close();
    const read = new Promise<void>((resolve) => (this.read = resolve));
    this.queue = [...steps];
    this.later = later;
    window.addEventListener('pointerdown', this.onTap, true);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.next();
    return read;
  }

  private done(): void {
    this.read?.();
    this.read = null;
  }

  private later = 0;

  /** A step that waited for something to happen: shown now if the others were already read, else after them. */
  add(step: CoachStep): void {
    if (this.later <= 0) return;
    this.later--;
    this.queue.push(step);
    if (!this.current) this.next();
  }

  private next(): void {
    this.current = this.queue.shift() ?? null;
    this.el.hidden = !this.current;
    if (!this.current) {
      this.done();
      return this.later > 0 ? undefined : this.close();
    }
    this.text.textContent = this.current.text;
    this.place();
  }

  /** Lights the target and puts the bubble above or below it, whichever side has more room. */
  private place(): void {
    const r = this.current?.target() ?? null;
    this.spot.hidden = !r;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = Math.min(320, vw - 32);
    this.bubble.style.width = `${bw}px`;
    const bh = this.bubble.offsetHeight || 80;
    if (!r) {
      this.bubble.className = 'coach-bubble';
      Object.assign(this.bubble.style, { left: `${(vw - bw) / 2}px`, top: `${(vh - bh) / 2}px` });
      return;
    }
    Object.assign(this.spot.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    const below = vh - r.bottom > r.top;
    const left = Math.max(16, Math.min(vw - bw - 16, r.left + r.width / 2 - bw / 2));
    const top = below ? Math.min(vh - bh - 8, r.bottom + GAP) : Math.max(8, r.top - GAP - bh);
    this.bubble.className = `coach-bubble ${below ? 'below' : 'above'}`;
    // The arrow points at the middle of the target.
    this.bubble.style.setProperty('--arrow', `${Math.max(16, Math.min(bw - 16, r.left + r.width / 2 - left))}px`);
    Object.assign(this.bubble.style, { left: `${left}px`, top: `${top}px` });
  }

  close(): void {
    this.done();
    this.queue = [];
    this.later = 0;
    this.current = null;
    this.el.hidden = true;
    window.removeEventListener('pointerdown', this.onTap, true);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
  }
}
