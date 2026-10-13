// SPDX-License-Identifier: AGPL-3.0-only
// Screen changes (pacing, 12 Oct). One screen in the DOM at a time: show() swaps the stage at once (test ids never
// duplicate) and a separate cover over #app animates out to reveal the new screen, enter only, nothing slides. A
// transform, opacity or filter on .stage, a screen or .game-view would break their position:fixed children (the
// vs Computer intro, coach marks, a floated bar), so screens never animate themselves. Kinds (§2 of the spec):
//   screen  menus, pickers, OPTION, YELLOW: a paper cover fades from .8 to 0 over SCREEN_IN_MS;
//   area    the Journey map and routes, map to hub, splash out: Gen 1 steps from white over AREA_IN_MS;
//   battle  a new game on the board: 8 black bars close on the tap (BATTLE_CLOSE_MS) and open on the board (BATTLE_IN_MS);
//   first   the first show of a page load: the splash steps in from white over SPLASH_IN_MS.
// A tap that waits for something (a puzzle chunk, Oak's lesson) raises its cover at once and holds it at the peak
// until the next show(); "Finding a puzzle…" shows after COVER_LABEL_MS, and after COVER_MAX_MS (or on an error) the
// cover reveals whatever is mounted. A dip covers the board only, for a new position on the same game screen.
// While a cover or dip is up it takes the pointer and html[data-transition] is set (pace.ts drops keys then).
// Loading fix, 14 Oct: a cover opens, and a dip fades down, on a drawn screen. They first wait (capped) until every
// image the player would see has decoded or failed, and the idle loads wait with them (src/ui/loader.ts); a wait
// past COVER_LABEL_MS says "Loading Pokémon…" on the cover. Review, 14 Oct (round 3): COVER_LABEL_MS counts from the
// cover going up (the tap), a line already up changes straight to the new one (no blank gap between two lines), and a
// line, once shown, changes or goes only after LABEL_MIN_MS, so it never blinks for a frame or two.
import { AREA_IN_MS, BATTLE_CLOSE_MS, BATTLE_IN_MS, BATTLE_STAGGER_MS, BOARD_DIP_MS, COVER_LABEL_MS, COVER_MAX_MS, REDUCED_FADE_MS, SCREEN_IN_MS, SPLASH_IN_MS } from '../config';
import { fmt } from '../game/text';
import { pauseWhile, revealNeeds } from './loader';

export const BATTLE_READY_MS = 2500; // longest a battle cover or a board dip stays shut waiting for the board's images (Slow 4G on HTTP/1.1: three round trips of stills)
export const SCREEN_READY_MS = 300; // longest a screen, area or splash cover waits for the screen's visible images
export const LABEL_MIN_MS = 250; // a cover's or dip's line, once shown, stays at least this long before it changes or the cover opens

export type CoverKind = 'screen' | 'area' | 'battle' | 'first';

/** The kind of screen change from one screen (by test id) to another; null: no cover. */
export function kindFor(from: string, to: string, first: boolean): CoverKind | null {
  if (first) return to === 'screen-splash' ? 'first' : null; // no cover for ?start=two or a ?room= link
  if (from === to) return null; // the same screen rebuilt (a language change, a closed Pokédex entry)
  if (from === 'screen-splash' || to === 'screen-map' || to === 'screen-route') return 'area';
  if (from === 'screen-map' && to === 'screen-title') return 'area';
  return 'screen';
}

/** What a cover looks like and how it moves; the DOM one below, a fake one in the unit tests. */
export interface CoverFx {
  /** Puts the cover up at its peak at once. */
  up(kind: CoverKind): void;
  /** Closes it on the screen that is leaving (the battle bars); resolves when shut. */
  close(kind: CoverKind): Promise<void>;
  /** Reveals the screen under it; resolves when it is gone. */
  open(kind: CoverKind): Promise<void>;
  /** The cover's line on or off: the waiting cover's (a puzzle being found), or with `drawing`, the images'. */
  label(on: boolean, drawing?: boolean): void;
  down(): void;
  /** Resolves once the screen under it is drawn (its visible images decoded or failed); the cover caps the wait. */
  ready?(kind: CoverKind): Promise<void>;
  /** Whether the screen under it shows a board with pieces (it then waits as long as a battle cover). */
  board?(): boolean;
  /** The wait for its images ran out (BATTLE_READY_MS or SCREEN_READY_MS): it opens on what is drawn by then. */
  capped?(kind: CoverKind): void;
}

/** What a cover's line says: the waiting cover's (a puzzle being found), or the images' ("Loading Pokémon…"). */
type LineKind = 'wait' | 'drawing';

/** A cover's line: shown at once, changed or dropped only once it has been up LABEL_MIN_MS. */
class Line {
  private kind: LineKind | null = null;
  private at = 0;
  private later = 0;
  private hushed: (() => void) | null = null;
  constructor(private readonly put: (kind: LineKind | null) => void) {}

  get up(): boolean {
    return this.kind !== null;
  }

  /** Shows `kind` now, or once the line up now has been read. */
  say(kind: LineKind): void {
    window.clearTimeout(this.later);
    if (this.kind === kind) return;
    const left = this.kind ? this.at + LABEL_MIN_MS - performance.now() : 0;
    if (left > 0) {
      this.later = window.setTimeout(() => this.say(kind), left);
      return;
    }
    this.kind = kind;
    this.at = performance.now();
    this.put(kind);
  }

  /** Drops the line once it has been up LABEL_MIN_MS; resolves then (at once with none). */
  hush(): Promise<void> {
    window.clearTimeout(this.later);
    if (!this.kind) return Promise.resolve();
    const left = this.at + LABEL_MIN_MS - performance.now();
    return new Promise((resolve) => {
      this.hushed = resolve;
      const off = () => {
        this.kind = null;
        this.hushed = null;
        this.put(null);
        resolve();
      };
      if (left > 0) this.later = window.setTimeout(off, left);
      else off();
    });
  }

  /** A new cover: its own line starts empty (the old one went with its element); a wait to drop the old one ends. */
  reset(): void {
    window.clearTimeout(this.later);
    this.kind = null;
    this.hushed?.();
    this.hushed = null;
  }
}

/** The cover queue: cover() on a tap, reveal() from show(), revealed() for what starts after the reveal. */
export class Covers {
  private kind: CoverKind | null = null;
  private shut: Promise<void> = Promise.resolve();
  private waiting = false;
  private seq = 0;
  private timers: number[] = [];
  private busy = 0;
  private idle: (() => void)[] = [];
  private upAt = 0;
  private readonly line: Line;

  constructor(private readonly fx: CoverFx, private readonly onBusy: (busy: boolean) => void = () => undefined) {
    this.line = new Line((kind) => fx.label(kind !== null, kind === 'drawing'));
  }

  /** Up, waiting for the next screen: the bars close, a paper or white cover goes up at its peak. Resolves when shut. */
  cover(kind: CoverKind): Promise<void> {
    if (this.kind && this.waiting) return this.shut;
    const s = this.raise(kind);
    this.waiting = true;
    this.shut = kind === 'battle' ? this.fx.close(kind) : (this.fx.up(kind), Promise.resolve());
    this.timers.push(window.setTimeout(() => s === this.seq && this.waiting && this.line.say('wait'), COVER_LABEL_MS));
    this.timers.push(window.setTimeout(() => s === this.seq && this.reveal(), COVER_MAX_MS));
    return this.shut;
  }

  /** The new screen is in: a waiting cover opens (after it shut); with none waiting, a fresh one of `kind` goes up at
   * its peak and opens at once; null and nothing waiting: no cover. */
  reveal(kind: CoverKind | null = null): void {
    if (!this.waiting) {
      if (!kind) return;
      this.raise(kind);
      this.fx.up(kind);
      this.shut = Promise.resolve();
    }
    const s = this.seq;
    const k = this.kind!;
    this.waiting = false;
    this.clearTimers();
    if (!this.line.up) this.fx.label(false); // a line up stays until the screen is drawn (drawn())
    void this.shut
      .then(() => (s === this.seq ? this.drawn(k) : undefined))
      .then(() => (s === this.seq ? this.fx.open(k) : undefined))
      .then(() => {
        if (s !== this.seq) return;
        this.fx.down();
        this.kind = null;
        this.done();
      });
  }

  /** Whether a cover is up and waiting for its screen. */
  get pending(): boolean {
    return this.waiting;
  }

  /** Resolves once no cover or dip is up (at once when none is). */
  revealed(): Promise<void> {
    return this.busy ? new Promise((r) => this.idle.push(r)) : Promise.resolve();
  }

  /** A dip or anything else that blocks input like a cover: counted until `p` settles. */
  track<T>(p: Promise<T>): Promise<T> {
    this.enter();
    return p.finally(() => this.done());
  }

  /** The screen's images, at most BATTLE_READY_MS (a board: a new game, a lesson) or SCREEN_READY_MS (anything else).
   * A cover up past COVER_LABEL_MS (from its tap) says so while it waits (bars held with no word read as a hang): a
   * line already up changes straight to "Loading Pokémon…". The line goes before the cover opens. */
  private drawn(kind: CoverKind): Promise<void> {
    const s = this.seq;
    const ready = this.fx.ready?.(kind);
    if (!ready) return this.line.hush();
    let cap = 0;
    // A zero delay still waits a task: a screen already drawn opens without a word.
    const slow = window.setTimeout(() => s === this.seq && this.line.say('drawing'), Math.max(0, this.upAt + COVER_LABEL_MS - performance.now()));
    const ms = kind === 'battle' || this.fx.board?.() ? BATTLE_READY_MS : SCREEN_READY_MS;
    const capped = new Promise<void>((r) => (cap = window.setTimeout(() => (s === this.seq && this.fx.capped?.(kind), r()), ms)));
    return Promise.race([ready.catch(() => undefined), capped])
      .finally(() => {
        window.clearTimeout(cap);
        window.clearTimeout(slow);
      })
      .then(() => (s === this.seq ? this.line.hush() : undefined));
  }

  private raise(kind: CoverKind): number {
    if (!this.kind) this.enter();
    this.clearTimers();
    this.line.reset();
    this.kind = kind;
    this.upAt = performance.now();
    return ++this.seq;
  }

  private enter(): void {
    if (this.busy++ === 0) this.onBusy(true);
  }

  private done(): void {
    if (--this.busy > 0) return;
    this.busy = 0;
    this.onBusy(false);
    for (const r of this.idle.splice(0)) r();
  }

  private clearTimers(): void {
    for (const t of this.timers.splice(0)) window.clearTimeout(t);
  }
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The images in `root` a player would see now that are still loading (none inside `skip`, the cover itself). */
function loadingImages(root: ParentNode, skip?: Element | null): HTMLImageElement[] {
  const h = window.innerHeight;
  const w = window.innerWidth;
  return [...root.querySelectorAll('img')].filter((img) => {
    if (img.complete || !img.getAttribute('src') || skip?.contains(img)) return false;
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < h && r.left < w;
  });
}

/** Resolves once every image in `root` a player would see has decoded or failed (uncapped). Idle loads wait meanwhile,
 * so they never take the bandwidth these need, and the loader's priority lane for up to `holdMs` (the cover's cap). */
export function imagesDrawn(root: ParentNode, skip: Element | null, holdMs: number): Promise<void> {
  const imgs = loadingImages(root, skip);
  if (!imgs.length) return Promise.resolve();
  const all = Promise.all(imgs.map((img) => (typeof img.decode === 'function' ? img.decode() : Promise.reject(new Error('no decode'))).catch(() => (img.complete ? undefined : new Promise<void>((r) => (img.addEventListener('load', () => r(), { once: true }), img.addEventListener('error', () => r(), { once: true }))))))).then(() => undefined);
  pauseWhile(all, holdMs);
  return all;
}
const finished = (a: Animation | undefined) => (a ? a.finished.then(() => undefined, () => undefined) : Promise.resolve());
/** Gen 1 fade: 1, .66, .33, .15 held for a quarter each, then gone. */
const STEPS: Keyframe[] = [1, 0.66, 0.33, 0.15, 0].map((opacity) => ({ opacity, easing: 'step-end' }));
const PEAK: Record<CoverKind, number> = { screen: 0.8, area: 1, battle: 1, first: 1 };

/** The cover over #app (z 49: over the battle, the coach and the intro card; under the modal and START). */
export function domCovers(root: HTMLElement, label: () => string): CoverFx {
  const debug = new URLSearchParams(location.search).has('debug');
  let el: HTMLElement | null = null;
  let text: HTMLElement | null = null;
  const bars = () => [...(el?.querySelectorAll<HTMLElement>('.cover-bar') ?? [])];
  const onBoard = () => !!root.querySelector('.board [data-piece]');
  /** Odd bars (1st, 3rd...) go to the inline start, even ones to the inline end, mirrored in RTL (R6). */
  const side = (i: number) => (i % 2 === 0 ? -1 : 1) * (document.documentElement.dir === 'rtl' ? -1 : 1);
  const make = (kind: CoverKind) => {
    el?.remove();
    el = document.createElement('div');
    el.className = `screen-cover cover-${kind}`;
    el.dataset.testid = 'screen-cover';
    el.dataset.kind = kind;
    if (kind === 'battle') for (let i = 0; i < 8; i++) el.append(Object.assign(document.createElement('div'), { className: 'cover-bar' }));
    text = document.createElement('p');
    text.className = 'cover-label';
    text.hidden = true;
    el.append(text);
    root.append(el);
    return el;
  };
  return {
    up(kind) {
      make(kind).style.opacity = String(PEAK[kind]);
    },
    close(kind) {
      const c = make(kind);
      if (reduced() || kind !== 'battle') return finished(c.animate([{ opacity: 0 }, { opacity: PEAK[kind] }], { duration: REDUCED_FADE_MS, fill: 'backwards' }));
      const each = BATTLE_CLOSE_MS - 7 * BATTLE_STAGGER_MS;
      return Promise.all(bars().map((b, i) => finished(b.animate([{ transform: `translateX(${side(i) * 101}%)` }, { transform: 'translateX(0)' }], { duration: each, delay: i * BATTLE_STAGGER_MS, easing: 'ease-out', fill: 'backwards' })))).then(() => undefined);
    },
    open(kind) {
      const c = el;
      if (!c) return Promise.resolve();
      c.dataset.phase = 'open'; // the reveal starts (tests time it)
      const from = Number(c.style.opacity || 1);
      if (reduced()) return finished(c.animate([{ opacity: from }, { opacity: 0 }], { duration: REDUCED_FADE_MS, fill: 'forwards' }));
      if (kind === 'battle') {
        const each = BATTLE_IN_MS - 7 * BATTLE_STAGGER_MS;
        return Promise.all(bars().map((b, i) => finished(b.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${side(i) * 101}%)` }], { duration: each, delay: i * BATTLE_STAGGER_MS, easing: 'ease-in', fill: 'forwards' })))).then(() => undefined);
      }
      if (kind === 'screen') return finished(c.animate([{ opacity: from }, { opacity: 0 }], { duration: SCREEN_IN_MS, easing: 'ease-out', fill: 'forwards' }));
      return finished(c.animate(STEPS, { duration: kind === 'first' ? SPLASH_IN_MS : AREA_IN_MS, fill: 'forwards' }));
    },
    ready(kind) {
      // Its visible images, and what it shows right after its reveal (the intro card's king, src/ui/loader.ts).
      return Promise.all([imagesDrawn(root, el, kind === 'battle' || onBoard() ? BATTLE_READY_MS : SCREEN_READY_MS), revealNeeds()]).then(() => undefined);
    },
    board: () => onBoard(),
    capped() {
      // Tests (?debug=1) tell a cover that opened at its cap from one whose images were all in.
      if (debug && el) el.dataset.capped = '';
    },
    label(on, drawing) {
      if (!text) return;
      text.textContent = drawing ? fmt('board.loading') : label();
      text.hidden = !on;
    },
    down() {
      el?.remove();
      el = null;
    },
  };
}

/** A paper dip over the board only (R1, §2): up to .85, `swap` at the peak (held there while it loads, at most
 * COVER_MAX_MS), back down. The board never moves: the swap happens unseen. A dip down past COVER_LABEL_MS says why,
 * as a cover does (the load's line, then "Loading Pokémon…" while the new position's images come). */
export async function dip(wrap: HTMLElement, swap: () => void | Promise<void>, label: () => string): Promise<void> {
  const d = document.createElement('div');
  d.className = 'board-dip';
  d.dataset.testid = 'board-dip';
  const text = Object.assign(document.createElement('p'), { className: 'cover-label', hidden: true });
  d.append(text);
  wrap.append(d);
  const start = performance.now();
  const after = () => Math.max(0, start + COVER_LABEL_MS - performance.now());
  const line = new Line((kind) => {
    if (kind) text.textContent = kind === 'drawing' ? fmt('board.loading') : label();
    text.hidden = !kind;
  });
  const half = BOARD_DIP_MS / 2;
  await finished(d.animate([{ opacity: 0 }, { opacity: 0.85 }], { duration: half, easing: 'ease-out', fill: 'forwards' }));
  const slow = window.setTimeout(() => line.say('wait'), after());
  let cap = 0;
  try {
    await Promise.race([swap(), new Promise<void>((r) => (cap = window.setTimeout(r, COVER_MAX_MS)))]);
  } catch (err) {
    console.warn('dip: the new position failed:', err instanceof Error ? err.message : err);
  } finally {
    window.clearTimeout(slow);
    window.clearTimeout(cap);
    wrap.append(d); // still on top of whatever the swap added
    // The new position is drawn before the dip lifts (loading fix, 14 Oct), saying so past COVER_LABEL_MS.
    let wait = 0;
    const drawing = window.setTimeout(() => line.say('drawing'), after());
    await Promise.race([imagesDrawn(wrap, d, BATTLE_READY_MS), new Promise<void>((r) => (wait = window.setTimeout(r, BATTLE_READY_MS)))]);
    window.clearTimeout(wait);
    window.clearTimeout(drawing);
    await line.hush();
    await finished(d.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: half, easing: 'ease-in', fill: 'forwards' }));
    d.remove();
  }
}
