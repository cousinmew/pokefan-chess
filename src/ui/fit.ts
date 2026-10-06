// SPDX-License-Identifier: AGPL-3.0-only
// Game screens always fit the window, with no scrolling (change A). One column on narrow or portrait screens (plates
// above and below the board, Who's who as a one line strip); a side column on wide screens (plates and Who's who
// beside a full height board). The board side is the smaller of the room left across and down; CSS gives the first
// guess, this measures the real bars and fixes it on every resize, rotation and on screen keyboard.
import { fmt } from '../game/text';
import { el } from './dom';

export const MIN_BOARD_PX = 280; // below this, Who's who becomes a drawer, then the plates shrink to icons
const SIDE_COL_PX = 260; // the side column on wide screens
const GAP_PX = 6;
const PAD_PX = 8; // top and bottom
const SIDE_PAD_PX = 4; // left and right: phones get the full width minus 8 px (§B19 item 7)

export interface FitParts {
  header: HTMLElement;
  main: HTMLElement;
  board: HTMLElement;
  legend: HTMLElement;
  /** Plates and bars: everything stacked with the board. */
  others: HTMLElement[];
}

export class Fitter {
  private active = false;
  private readonly root = document.documentElement;
  private readonly toggle: HTMLButtonElement;
  private queued = 0;

  constructor(private readonly p: FitParts) {
    const ro = new ResizeObserver(() => this.schedule());
    for (const e of [p.header, p.legend, ...p.others]) ro.observe(e);
    window.addEventListener('resize', () => this.schedule());
    window.addEventListener('orientationchange', () => this.schedule());
    window.visualViewport?.addEventListener('resize', () => this.schedule());
    // Who's who as a drawer when there is no room for it (change A, items c to e).
    this.toggle = el('button', 'legend-toggle');
    this.toggle.type = 'button';
    this.toggle.dataset.testid = 'legend-toggle';
    this.toggle.textContent = fmt('settings.legend');
    this.toggle.onclick = () => this.root.classList.toggle('legend-open');
    p.header.insertBefore(this.toggle, p.header.children[1] ?? null);
  }

  start(): void {
    this.active = true;
    this.root.classList.add('fit');
    this.fit();
  }

  stop(): void {
    this.active = false;
    this.root.classList.remove('fit', 'fit-wide', 'fit-drawer', 'fit-icons', 'legend-open');
    this.root.style.removeProperty('--sq');
  }

  private schedule(): void {
    if (!this.active || this.queued) return;
    this.queued = requestAnimationFrame(() => {
      this.queued = 0;
      this.fit();
    });
  }

  /** Lays the game screen out for the window as it is now. */
  fit(): void {
    if (!this.active) return;
    const vv = window.visualViewport;
    const W = Math.floor(vv?.width ?? window.innerWidth);
    const H = Math.floor(vv?.height ?? window.innerHeight);
    const cls = this.root.classList;
    const wide = W > H && W - SIDE_COL_PX - 3 * PAD_PX >= MIN_BOARD_PX && H < W * 0.9;
    cls.toggle('fit-wide', wide);
    cls.remove('fit-drawer', 'fit-icons');
    const legendOn = !this.p.legend.hidden;
    let side = this.measure(W, H, wide);
    // Too small: Who's who goes into a drawer, then the plates shrink to icons (change A, item e).
    if (side < MIN_BOARD_PX && legendOn && !wide) {
      cls.add('fit-drawer');
      side = this.measure(W, H, wide);
    }
    if (side < MIN_BOARD_PX) {
      cls.add('fit-icons');
      side = this.measure(W, H, wide);
    }
    this.toggle.hidden = !(legendOn && cls.contains('fit-drawer'));
    if (!cls.contains('fit-drawer')) cls.remove('legend-open');
    const sq = Math.max(16, Math.floor((side - 6) / 8)); // 6: the board's 3 px border on each side
    this.root.style.setProperty('--sq', `${sq}px`);
  }

  /** The board side that fits, with the stacked parts at their current heights. */
  private measure(W: number, H: number, wide: boolean): number {
    const h = (e: HTMLElement) => (e.hidden || getComputedStyle(e).display === 'none' ? 0 : e.getBoundingClientRect().height + GAP_PX);
    const header = h(this.p.header);
    if (wide) return Math.floor(Math.min(H - header - 2 * PAD_PX, W - SIDE_COL_PX - 3 * PAD_PX));
    const stacked = [this.p.legend, ...this.p.others].reduce((sum, e) => sum + h(e), 0);
    return Math.floor(Math.min(W - 2 * SIDE_PAD_PX, H - header - stacked - 2 * PAD_PX));
  }
}
