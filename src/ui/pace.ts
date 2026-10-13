// SPDX-License-Identifier: AGPL-3.0-only
// Pacing (owner, 12 Oct: "cut too hard"): holds, the skip input and card guards, in one place.
// A hold is a timed wait over 400 ms (the puzzle's set up move, a reply, the solve, the end of a game, the intro card,
// the splash). It ends on time or on a skip, but never in its first HOLD_MIN_MS, so a double tap cannot skip a big
// moment. A skip is a tap pressed after that, not on a control or START, or Enter, Space or B with no control focused
// and START closed. It is consumed (the press in the capture phase, and the click that follows it, which is when the
// hold ends: nothing under the finger changes mid tap), so it never also selects a piece or advances a card. While a hold runs, body[data-hold] names it and body[data-skippable] is set once it can be skipped.
// A card or story line ignores taps and keys for a short guard; then it gets data-ready and its ▼ (R4).
import { CARD_GUARD_MS, HOLD_MIN_MS } from '../config';

export type HoldKind = 'setup' | 'reply' | 'solved' | 'review' | 'miss' | 'think' | 'end' | 'intro' | 'splash';
/** How a hold ended: on time, skipped, or cancelled (a new hold, a new game, or the game screen left for good). */
export type HoldEnd = 'time' | 'skip' | 'cancel';

interface Active {
  kind: HoldKind;
  /** The screen the hold belongs to: input on another one (OPTION over a game) never skips it. */
  screen: string;
  skippable: boolean;
  end(how: HoldEnd): void;
}

/** What a tap on it does itself, so it never skips a hold. */
const CONTROL = 'button, input, select, textarea, a, label, [role="menuitem"], .start-overlay';
const GUARDED = '[data-guard]:not([data-ready])';

let active: Active | null = null;
let roundNow: () => number = () => 0;
/** A consumed tap: the click that follows it is dropped too (Chrome fires it after a cancelled pointerdown). */
let dropClickUntil = 0;
/** The hold a press after HOLD_MIN_MS skips, once its click arrives. */
let skipOnClick: Active | null = null;
const guardTimers = new WeakMap<HTMLElement, number>();

const screenNow = () => document.body.dataset.screen ?? '';
const startOpen = () => !!document.querySelector('.start-overlay');
// The first puzzle's coach marks take the tap themselves ("any tap moves on"), so they never skip the "Watch!" hold.
const coachOpen = () => !!document.querySelector('.coach:not([hidden])');

/** Enter, Space or B, by code or key (keyboards without codes, and the harness). */
export function skipKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' || e.code === 'Space' || e.key === ' ' || e.code === 'KeyB' || e.key === 'b' || e.key === 'B';
}

/** Waits `ms`, or less on a skip after HOLD_MIN_MS. With `round`, a hold that ends in a later game says 'cancel'.
 * A new hold cancels the one before: there is only ever one. */
export function hold(ms: number, kind: HoldKind, round?: number): Promise<HoldEnd> {
  active?.end('cancel');
  return new Promise((resolve) => {
    const body = document.body;
    let timer = 0;
    let min = 0;
    const h: Active = {
      kind,
      screen: screenNow(),
      skippable: false,
      end(how) {
        if (active !== h) return;
        active = null;
        window.clearTimeout(timer);
        window.clearTimeout(min);
        delete body.dataset.hold;
        delete body.dataset.skippable;
        resolve(how !== 'cancel' && round !== undefined && round !== roundNow() ? 'cancel' : how);
      },
    };
    active = h;
    body.dataset.hold = kind;
    timer = window.setTimeout(() => h.end('time'), ms);
    min = window.setTimeout(() => {
      h.skippable = true;
      if (active === h) body.dataset.skippable = '';
    }, Math.min(HOLD_MIN_MS, ms));
  });
}

/** The hold running now, if any. */
export const holding = (): HoldKind | null => active?.kind ?? null;

/** Drops the hold running now (a new game, or a screen that replaces the game for good). */
export function cancelHold(): void {
  active?.end('cancel');
}

/** A card, panel or story box ignores input for `ms` (R4): its buttons are disabled, or, with none, the card itself is
 * role=button and aria-disabled. Then it gets data-ready and its ▼ shows, exactly when input counts again. */
export function guard(el: HTMLElement, ms = CARD_GUARD_MS): void {
  window.clearTimeout(guardTimers.get(el));
  el.dataset.guard = '';
  delete el.dataset.ready;
  const own = (el instanceof HTMLButtonElement ? [el] : [...el.querySelectorAll<HTMLButtonElement>('button')]).filter((b) => !b.disabled || b.dataset.guarded !== undefined);
  for (const b of own) {
    b.disabled = true;
    b.dataset.guarded = '';
  }
  if (!own.length) {
    el.setAttribute('role', 'button');
    el.setAttribute('aria-disabled', 'true');
  }
  guardTimers.set(el, window.setTimeout(() => {
    for (const b of own) {
      if (b.dataset.guarded === undefined) continue;
      b.disabled = false;
      delete b.dataset.guarded;
    }
    el.removeAttribute('aria-disabled');
    el.removeAttribute('role');
    el.dataset.ready = '';
  }, ms));
}

/** A guarded card the event would reach: the card itself, or the dim around it (the modal's own click handlers). */
function guardedTarget(t: EventTarget | null): boolean {
  const e = t instanceof Element ? t : null;
  if (!e) return false;
  return !!(e.closest(GUARDED) ?? e.closest('.overlay')?.querySelector(':scope > ' + GUARDED));
}

function consume(e: Event): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

function onPointer(e: PointerEvent): void {
  const h = active;
  if (!h || e.button > 0 || h.screen !== screenNow() || startOpen() || coachOpen()) return;
  if (e.target instanceof Element && e.target.closest(CONTROL)) return;
  consume(e);
  dropClickUntil = performance.now() + 700;
  skipOnClick = h.skippable ? h : null;
}

function onClick(e: MouseEvent): void {
  if (performance.now() < dropClickUntil) {
    dropClickUntil = 0;
    consume(e);
    const h = skipOnClick;
    skipOnClick = null;
    if (h && h === active) h.end('skip');
    return;
  }
  if (guardedTarget(e.target)) consume(e);
}

function onKey(e: KeyboardEvent): void {
  const key = skipKey(e);
  // Covers and dips (R2): nothing acts twice, or on the screen that is leaving.
  if (document.documentElement.dataset.transition !== undefined && (key || e.code === 'KeyS' || e.key === 's' || e.key === 'S')) return consume(e);
  const h = active;
  if (!key || !h || h.screen !== screenNow() || startOpen()) return;
  const focus = document.activeElement;
  if (focus instanceof Element && focus !== document.body && focus.matches(CONTROL)) return; // Space presses that button
  consume(e);
  if (h.skippable && !e.repeat) h.end('skip');
}

let installed = false;
/** Once at boot: the skip input and the guards. `round` is the game's round (Away): a hold ending later is dropped. */
export function installPace(round: () => number): void {
  roundNow = round;
  if (installed) return;
  installed = true;
  window.addEventListener('pointerdown', onPointer, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
}
