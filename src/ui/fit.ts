// SPDX-License-Identifier: AGPL-3.0-only
// Game screens always fit the window, with no scrolling (change A). One column on narrow or portrait screens (plates
// above and below the board, Who's who as a one line strip); a side column on wide screens (plates, bars and Who's who
// beside a full height board). The board side is the smaller of the room left across and down; CSS gives the first
// guess, this measures the real bars and fixes it on every resize, rotation and on screen keyboard. It is the only
// place that sets --sq (W2), YELLOW included: YELLOW only asks for a larger minimum.
import { fmt } from '../game/text';
import { el } from './dom';

export const MIN_BOARD_PX = 280; // below this, Who's who becomes a drawer, then the plates shrink, then the bars float
const SIDE_COL_PX = 260; // the side column on wide screens
const COL_GAP_PX = 16; // between the board and the side column
const GAP_PX = 6;
const LEGEND_MIN_PX = 120; // wide: with less room than this left in the side column, Who's who becomes a drawer
const TURN_MIN_PX = 150; // the status line stays centred over the board only with this much room between the buttons

export interface FitParts {
  header: HTMLElement;
  main: HTMLElement;
  board: HTMLElement;
  legend: HTMLElement;
  /** Plates and bars: everything stacked with the board. */
  others: HTMLElement[];
  /** The puzzle, Path and online bars: compacted, then floated over the board's foot before the board gets too small. */
  bars?: HTMLElement[];
  /** START (§B24 item 1): in the top bar when narrow, at the top of the side column when wide. */
  start?: HTMLElement;
  /** The smallest board this screen wants (YELLOW asks for larger squares); never more than the window allows. */
  minBoard?: () => number;
}

/** Window shape classes for every screen (W2): fit-short (a short window, compact menus) and fit-land (landscape).
 * Started once, by the game screen's fitter, which is built at boot. */
function watchWindow(): void {
  const root = document.documentElement;
  const apply = () => {
    const W = window.innerWidth, H = Math.min(window.innerHeight, window.visualViewport?.height ?? Infinity);
    root.classList.toggle('fit-short', H <= 600);
    root.classList.toggle('fit-land', W > H * 1.2);
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);
  apply();
}

const MODES = ['fit-wide', 'fit-drawer', 'fit-icons', 'fit-bar-compact', 'fit-bar-over'];

export class Fitter {
  private active = false;
  private readonly root = document.documentElement;
  private readonly toggle: HTMLButtonElement;
  /** Wide: START, the plates, the bars and Who's who, in one column that scrolls on its own as a last resort. */
  private readonly side = el('div', 'side-col');
  private order: Element[] = [];
  private queued = 0;

  constructor(private readonly p: FitParts) {
    watchWindow();
    const ro = new ResizeObserver(() => this.schedule());
    for (const e of [p.header, p.legend, ...p.others]) ro.observe(e);
    // Names and lines on the plates and the status line change without changing a size; they may need room (R7).
    const mo = new MutationObserver(() => this.schedule());
    for (const e of [p.header, ...p.others]) mo.observe(e, { childList: true, subtree: true, characterData: true });
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
    this.root.classList.remove('fit', 'legend-open', 'turn-flow', 'turn-row', ...MODES);
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
    const { W, H } = this.room();
    const cls = this.root.classList;
    const wide = W > H && W - SIDE_COL_PX - COL_GAP_PX >= MIN_BOARD_PX && H < W * 0.9;
    cls.remove(...MODES);
    cls.toggle('fit-wide', wide);
    this.arrange(wide);
    const legendOn = !this.p.legend.hidden;
    const barsOn = (this.p.bars ?? []).some((b) => !b.hidden);
    let side: number;
    if (wide) {
      side = Math.floor(Math.min(H - this.h(this.p.header), W - SIDE_COL_PX - COL_GAP_PX));
      this.root.style.setProperty('--side-h', `${Math.floor(H)}px`);
      // The side column: plates and bars first, Who's who gets what is left (R1); a drawer when that is too little.
      const need = () => [...this.side.children].reduce((sum, e) => sum + (e === this.p.legend ? 0 : this.h(e as HTMLElement)), 0);
      if (legendOn && H - need() < LEGEND_MIN_PX) cls.add('fit-drawer');
      if (need() > H) cls.add('fit-icons');
    } else {
      // A larger minimum (YELLOW) never asks for more than the window has across.
      const min = Math.min(Math.max(MIN_BOARD_PX, this.p.minBoard?.() ?? 0), W);
      side = this.measure(W, H);
      // Too small: Who's who goes into a drawer, the plates shrink to icons, the bars drop their extras, then float
      // over the board's foot, so the board never goes under its minimum (change A item e, R2).
      for (const [mode, on] of [['fit-drawer', legendOn], ['fit-icons', true], ['fit-bar-compact', barsOn], ['fit-bar-over', barsOn]] as const) {
        if (side >= min || !on) continue;
        cls.add(mode);
        side = this.measure(W, H);
      }
      // Never under the minimum: rounded up to whole squares when the width allows it.
      const least = Math.min(MIN_BOARD_PX, W);
      if (side < least) side = 8 * Math.ceil((least - 6) / 8) + 6 <= W ? 8 * Math.ceil((least - 6) / 8) + 6 : least;
    }
    this.toggle.hidden = !(legendOn && cls.contains('fit-drawer'));
    if (!cls.contains('fit-drawer')) cls.remove('legend-open');
    let sq = Math.max(16, Math.floor((side - 6) / 8)); // 6: the board's 3 px border on each side
    this.root.style.setProperty('--sq', `${sq}px`);
    this.texts();
    // Narrow, checked in the real layout: a bar that got taller at the new width, or a status line that took a row of
    // its own, takes the next step, and only once there are none left does the board give way.
    for (let i = 0; i < 4 && !wide; i++) {
      const over = this.overflow();
      if (over <= 0) break;
      const next = barsOn ? (['fit-bar-compact', 'fit-bar-over'] as const).find((m) => !cls.contains(m)) : undefined;
      if (next) cls.add(next);
      else sq = Math.max(16, sq - Math.ceil(over / 8));
      this.root.style.setProperty('--sq', `${sq}px`);
    }
  }

  /** Narrow: how far the stacked parts run past the bottom of the game view (0 or less when they fit). */
  private overflow(): number {
    const view = this.p.main.parentElement ?? document.body;
    const limit = view.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(view).paddingBottom) || 0);
    let bottom = 0;
    for (const e of [this.p.board, this.p.legend, ...this.p.others]) {
      if (e.hidden || getComputedStyle(e).position === 'fixed' || getComputedStyle(e).display === 'none') continue;
      bottom = Math.max(bottom, e.getBoundingClientRect().bottom);
    }
    return Math.ceil(bottom - limit);
  }

  /** The game view's content box, inside its padding and the safe areas (R9), and above an on screen keyboard. */
  private room(): { W: number; H: number } {
    const view = this.p.main.parentElement ?? document.body;
    const r = view.getBoundingClientRect();
    const cs = getComputedStyle(view);
    const px = (v: string) => parseFloat(v) || 0;
    const vv = window.visualViewport;
    const bottom = Math.min(r.bottom, vv ? vv.offsetTop + vv.height : r.bottom);
    return {
      W: Math.floor(r.width - px(cs.paddingLeft) - px(cs.paddingRight)),
      H: Math.floor(bottom - r.top - px(cs.paddingTop) - px(cs.paddingBottom)),
    };
  }

  private h(e: HTMLElement): number {
    return e.hidden || getComputedStyle(e).display === 'none' ? 0 : e.getBoundingClientRect().height + GAP_PX;
  }

  /** Wide: the status bar goes over the board and everything else into the side column, START on top. Narrow: all
   * back in their places, the status bar and START in the top bar above everything (§B24 item 1). */
  private arrange(wide: boolean): void {
    const { header, main, start, board } = this.p;
    if (!this.order.length) this.order = [...main.children];
    // Nodes move only when they are not in place already: moving one drops its focus and restarts its animations.
    const place = (host: HTMLElement, want: Element[]) => {
      if (want.length === host.children.length && want.every((e, i) => host.children[i] === e)) return;
      host.append(...want);
    };
    if (wide) {
      if (header.parentElement !== main) main.prepend(header);
      const items = this.order.filter((e) => e !== board && e !== this.p.legend);
      place(this.side, [...(start ? [start] : []), ...items, this.p.legend]);
      place(main, [header, board, this.side]);
    } else {
      if (header.parentElement === main) main.before(header);
      if (start && start.parentElement !== header) header.append(start);
      this.side.remove();
      place(main, this.order);
    }
  }

  /** Narrow: the board side that fits, with the stacked parts at their current heights. */
  private measure(W: number, H: number): number {
    const cls = this.root.classList;
    const stacked = [this.p.legend, ...this.p.others].reduce((sum, e) => sum + (cls.contains('fit-bar-over') && this.p.bars?.includes(e) ? 0 : this.h(e)), 0);
    return Math.floor(Math.min(W, H - this.h(this.p.header) - stacked));
  }

  /** Text that must stay whole (R7): a plate drops its title before its name is shortened, and the status line leaves
   * the centre for the room between the buttons (two lines) when the centre is too narrow. */
  private texts(): void {
    for (const plate of this.p.others) {
      const name = plate.querySelector<HTMLElement>('.plate-name b');
      if (name) {
        plate.classList.remove('no-title');
        if (name.scrollWidth > name.clientWidth + 1) plate.classList.add('no-title');
      }
      // A message longer than three lines gets a smaller font instead of losing its end.
      const msg = plate.querySelector<HTMLElement>('.tb-main') ?? plate.querySelector<HTMLElement>('.plate-msg');
      if (msg) {
        plate.classList.remove('tight');
        if (msg.scrollHeight > msg.clientHeight + 2) plate.classList.add('tight');
      }
    }
    // Measured from scratch each time, in the layout it will have; it settles in one pass, so a header that grows a
    // row triggers just one more fit.
    const head = this.p.header;
    const cls = this.root.classList;
    cls.remove('turn-flow', 'turn-row');
    const hr = head.getBoundingClientRect();
    let used = 0;
    for (const c of head.children) {
      const e = c as HTMLElement;
      if (e.classList.contains('turn') || e.hidden || !e.offsetParent) continue;
      const r = e.getBoundingClientRect();
      used = Math.max(used, r.left + r.width / 2 < hr.left + hr.width / 2 ? r.right - hr.left : hr.right - r.left);
    }
    const room = hr.width - 2 * used - 8;
    this.root.style.setProperty('--turn-w', `${Math.max(0, Math.floor(room))}px`);
    if (room >= TURN_MIN_PX) return;
    cls.add('turn-flow');
    // Not even the room between the buttons for two lines: the status line gets a row of its own under them.
    const turn = head.querySelector<HTMLElement>('.turn');
    if (turn && turn.scrollHeight > turn.clientHeight + 2) cls.add('turn-row');
  }
}
