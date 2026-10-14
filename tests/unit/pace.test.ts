// SPDX-License-Identifier: AGPL-3.0-only
// Pacing (12 Oct): holds end on time or on a skip after HOLD_MIN_MS, a skip is a tap that is not on a control or
// START (it skips when its click arrives) or Enter, Space or B; a later game or a new hold cancels; guards (R4).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MIN_MS, CARD_GUARD_MS } from '../../src/config';

type Listener = (e: unknown) => void;
const listeners = new Map<string, Listener[]>();
let startOpen = false;
let coachOpen = false;
/** A cover over #app, or a dip on a board that is on screen (fix, 14 Oct: keys are dropped only while one is there). */
let coverUp = false;
let dipUp = false;

/** Just enough DOM for pace.ts: elements answer closest() and matches() by a list of selectors they "are". */
class FakeEl {
  dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  disabled = false;
  children: FakeEl[] = [];
  constructor(readonly is: string[] = []) {}
  closest(sel: string): FakeEl | null {
    return sel.split(',').some((s) => this.is.includes(s.trim())) ? this : null;
  }
  matches(sel: string): boolean {
    return !!this.closest(sel);
  }
  querySelectorAll(): FakeEl[] {
    return this.children;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
}
class FakeButton extends FakeEl {}
const body = new FakeEl(['body']);
const g = globalThis as unknown as Record<string, unknown>;
g.Element = FakeEl;
g.HTMLButtonElement = FakeButton;
g.window = {
  addEventListener: (t: string, fn: Listener) => listeners.set(t, [...(listeners.get(t) ?? []), fn]),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: number) => clearTimeout(id),
};
g.document = {
  body,
  documentElement: { dataset: {} as Record<string, string> },
  activeElement: body,
  querySelector: (sel: string) =>
    (sel === '.start-overlay' && startOpen) || (sel.startsWith('.coach') && coachOpen) || (sel === '.screen-cover' && coverUp) || (sel === '.board-dip' && dipUp) ? {} : null,
};
/** Body's observers (a hold that pauses away from its screen watches data-screen and START); mutate() runs them. */
const observers = new Set<() => void>();
g.MutationObserver = class {
  constructor(private readonly cb: () => void) {}
  observe(): void {
    observers.add(this.cb);
  }
  disconnect(): void {
    observers.delete(this.cb);
  }
};
const mutate = () => [...observers].forEach((cb) => cb());

const { cancelHold, guard, hold, holding, installPace } = await import('../../src/ui/pace');
let round = 0;
installPace(() => round);

function fire(type: string, init: Record<string, unknown> = {}): { stopped: boolean } {
  const out = { stopped: false };
  const e = { type, button: 0, target: board, repeat: false, key: '', code: '', preventDefault: () => undefined, stopImmediatePropagation: () => (out.stopped = true), ...init };
  for (const fn of listeners.get(type) ?? []) if (!out.stopped) fn(e);
  return out;
}
const board = new FakeEl(['.board']);
const button = new FakeEl(['button']);
/** A tap: the press, then its click (when it skips). */
const tap = (target: FakeEl = board) => [fire('pointerdown', { target }), fire('click', { target })];
const key = (k: { key?: string; code?: string }) => fire('keydown', k);
const settle = () => Promise.resolve().then(() => undefined);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  body.dataset = { screen: 'screen-game' };
  startOpen = false;
  coachOpen = false;
  coverUp = false;
  dipUp = false;
  (g.document as { activeElement: unknown }).activeElement = body;
});
afterEach(() => {
  cancelHold();
  vi.useRealTimers();
});

describe('hold()', () => {
  it('ends on time and marks the body while it runs', async () => {
    let end = '';
    void hold(900, 'reply').then((h) => (end = h));
    expect(body.dataset.hold).toBe('reply');
    expect(body.dataset.skippable).toBeUndefined();
    vi.advanceTimersByTime(HOLD_MIN_MS);
    expect(body.dataset.skippable).toBe('');
    vi.advanceTimersByTime(900 - HOLD_MIN_MS);
    await settle();
    expect(end).toBe('time');
    expect(body.dataset.hold).toBeUndefined();
    expect(holding()).toBeNull();
  });

  it('a tap before HOLD_MIN_MS is swallowed and skips nothing; one after skips on its click', async () => {
    let end = '';
    void hold(1500, 'setup').then((h) => (end = h));
    vi.advanceTimersByTime(HOLD_MIN_MS - 10);
    const [down, click] = tap();
    expect(down!.stopped && click!.stopped).toBe(true); // consumed: the board never sees it
    await settle();
    expect(end).toBe('');
    vi.advanceTimersByTime(20);
    tap();
    await settle();
    expect(end).toBe('skip');
  });

  it('a press before HOLD_MIN_MS whose click comes after it still skips nothing', async () => {
    let end = '';
    void hold(1500, 'setup').then((h) => (end = h));
    vi.advanceTimersByTime(HOLD_MIN_MS - 10);
    fire('pointerdown');
    vi.advanceTimersByTime(30);
    fire('click');
    await settle();
    expect(end).toBe('');
  });

  it.each([{ key: 'Enter' }, { code: 'Space', key: ' ' }, { code: 'KeyB', key: 'b' }])('%o skips after the minimum', async (k) => {
    let end = '';
    void hold(1600, 'end').then((h) => (end = h));
    expect(key(k).stopped).toBe(true); // too early: swallowed
    await settle();
    expect(end).toBe('');
    vi.advanceTimersByTime(HOLD_MIN_MS);
    key(k);
    await settle();
    expect(end).toBe('skip');
  });

  it('controls, START and other screens are left alone', async () => {
    let end = '';
    void hold(1600, 'end').then((h) => (end = h));
    vi.advanceTimersByTime(HOLD_MIN_MS);
    expect(tap(button).every((e) => !e.stopped)).toBe(true); // the button does its own thing
    (g.document as { activeElement: unknown }).activeElement = button;
    expect(key({ code: 'Space', key: ' ' }).stopped).toBe(false); // Space presses the focused button, never both
    (g.document as { activeElement: unknown }).activeElement = body;
    startOpen = true;
    expect(tap()[0]!.stopped).toBe(false);
    expect(key({ key: 'Enter' }).stopped).toBe(false);
    startOpen = false;
    body.dataset.screen = 'screen-settings'; // OPTION over the game: its taps never skip the game's hold
    expect(tap()[0]!.stopped).toBe(false);
    body.dataset.screen = 'screen-game';
    coachOpen = true; // the coach marks take the tap themselves
    expect(tap()[0]!.stopped).toBe(false);
    coachOpen = false;
    await settle();
    expect(end).toBe('');
  });

  it('a hold owned by the game screen but started while OPTION shows leaves OPTION alone (fix, 13 Oct)', async () => {
    let end = '';
    body.dataset.screen = 'screen-settings'; // a puzzle review's next step starts behind OPTION
    void hold(900, 'review', undefined, 'screen-game').then((h) => (end = h));
    vi.advanceTimersByTime(HOLD_MIN_MS);
    expect(tap()[0]!.stopped).toBe(false);
    for (const k of [{ code: 'KeyB', key: 'b' }, { key: 'Enter' }, { code: 'Space', key: ' ' }]) expect(key(k).stopped).toBe(false);
    await settle();
    expect(end).toBe('');
    body.dataset.screen = 'screen-game'; // back on the board it skips as usual
    expect(key({ code: 'Space', key: ' ' }).stopped).toBe(true);
    await settle();
    expect(end).toBe('skip');
  });

  it('a later game (round) or a new hold cancels it', async () => {
    let a = '';
    let b = '';
    void hold(900, 'reply', round).then((h) => (a = h));
    round++;
    vi.advanceTimersByTime(900);
    await settle();
    expect(a).toBe('cancel');
    void hold(900, 'think').then((h) => (a = h));
    void hold(900, 'end').then((h) => (b = h));
    await settle();
    expect(a).toBe('cancel');
    expect(holding()).toBe('end');
    cancelHold();
    await settle();
    expect(b).toBe('cancel');
  });

  it('Enter, Space, B and S do nothing while a cover or dip is up (R2)', () => {
    const root = (g.document as { documentElement: { dataset: Record<string, string> } }).documentElement;
    root.dataset.transition = '';
    for (const up of ['cover', 'dip']) {
      coverUp = up === 'cover';
      dipUp = up === 'dip';
      for (const k of [{ key: 'Enter' }, { code: 'Space', key: ' ' }, { code: 'KeyB', key: 'b' }, { code: 'KeyS', key: 's' }]) expect(key(k).stopped, up).toBe(true);
      expect(key({ key: 'ArrowUp', code: 'ArrowUp' }).stopped).toBe(false);
    }
    delete root.dataset.transition;
  });

  it('a dip left behind on a board that is not on screen (OPTION opened during a slow puzzle load) takes no keys (fix, 14 Oct)', () => {
    // The dip started on the board, so the transition is still counted, but its board is off screen: OPTION types.
    const root = (g.document as { documentElement: { dataset: Record<string, string> } }).documentElement;
    root.dataset.transition = '';
    body.dataset.screen = 'screen-settings';
    for (const k of [{ code: 'KeyB', key: 'b' }, { code: 'KeyS', key: 's' }, { key: 'Enter' }, { code: 'Space', key: ' ' }]) expect(key(k).stopped).toBe(false);
    delete root.dataset.transition;
  });
});

describe('hold(..., { pauseAway }) (fix, 14 Oct)', () => {
  const away = { pauseAway: true };

  it("pauses while its screen is not showing and resumes with the time left: OPTION during the puzzle's Watch!", async () => {
    let end = '';
    void hold(1500, 'setup', undefined, 'screen-game', away).then((h) => (end = h));
    vi.advanceTimersByTime(500);
    body.dataset.screen = 'screen-settings';
    mutate();
    vi.advanceTimersByTime(3000);
    await settle();
    expect(end).toBe(''); // the base build ended it here, behind OPTION
    expect(holding()).toBe('setup');
    body.dataset.screen = 'screen-game';
    mutate();
    vi.advanceTimersByTime(999);
    await settle();
    expect(end).toBe('');
    vi.advanceTimersByTime(1);
    await settle();
    expect(end).toBe('time');
  });

  it('pauses while START is open; with little time left it still waits HOLD_MIN_MS once back', async () => {
    let end = '';
    void hold(1500, 'reply', undefined, 'screen-game', away).then((h) => (end = h));
    vi.advanceTimersByTime(1450);
    startOpen = true;
    mutate();
    vi.advanceTimersByTime(3000);
    await settle();
    expect(end).toBe('');
    startOpen = false;
    mutate();
    expect(body.dataset.skippable).toBeUndefined(); // a tap the moment START closes skips nothing
    vi.advanceTimersByTime(HOLD_MIN_MS - 1);
    await settle();
    expect(end).toBe('');
    vi.advanceTimersByTime(1);
    await settle();
    expect(end).toBe('time');
  });

  it('starts paused when it begins away (the coach marks closed by leaving), and a cancel stops watching', async () => {
    let end = '';
    body.dataset.screen = 'screen-settings';
    void hold(1500, 'setup', undefined, 'screen-game', away).then((h) => (end = h));
    vi.advanceTimersByTime(5000);
    await settle();
    expect(end).toBe('');
    cancelHold();
    await settle();
    expect(end).toBe('cancel');
    expect(observers.size).toBe(0);
  });

  it('without the option a hold keeps running behind OPTION (reviews play on, 13 Oct)', async () => {
    let end = '';
    void hold(900, 'review', undefined, 'screen-game').then((h) => (end = h));
    body.dataset.screen = 'screen-settings';
    mutate();
    vi.advanceTimersByTime(900);
    await settle();
    expect(end).toBe('time');
  });
});

describe('guard()', () => {
  it('a card without buttons is an aria-disabled button until CARD_GUARD_MS, then ready; clicks on it are dropped', () => {
    const card = new FakeEl(['[data-guard]:not([data-ready])', '.panel']);
    guard(card as unknown as HTMLElement);
    expect(card.attrs.get('aria-disabled')).toBe('true');
    expect(card.attrs.get('role')).toBe('button');
    expect(fire('click', { target: card }).stopped).toBe(true);
    vi.advanceTimersByTime(CARD_GUARD_MS);
    expect(card.dataset.ready).toBe('');
    expect(card.attrs.has('aria-disabled')).toBe(false);
  });

  it('a panel with buttons disables them instead, and enables only the ones it disabled', () => {
    const panel = new FakeEl(['.panel']);
    const live = new FakeButton(['button']);
    const off = new FakeButton(['button']);
    off.disabled = true; // e.g. an evolution there is not enough candy for
    panel.children = [live, off];
    guard(panel as unknown as HTMLElement);
    expect(live.disabled).toBe(true);
    expect(panel.attrs.has('aria-disabled')).toBe(false);
    vi.advanceTimersByTime(CARD_GUARD_MS);
    expect(live.disabled).toBe(false);
    expect(off.disabled).toBe(true);
  });
});
