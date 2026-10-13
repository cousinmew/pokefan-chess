// SPDX-License-Identifier: AGPL-3.0-only
// Pacing (12 Oct): which screen change gets which cover, and the cover queue: a cover raised on a tap waits for its
// screen, opens on show(), shows what is mounted after COVER_MAX_MS or on an error, and revealed() waits for it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COVER_LABEL_MS, COVER_MAX_MS } from '../../src/config';

const g = globalThis as unknown as Record<string, unknown>;
g.window = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id) };
const { Covers, kindFor, BATTLE_READY_MS, SCREEN_READY_MS } = await import('../../src/ui/transitions');
type Kind = import('../../src/ui/transitions').CoverKind;

/** A cover whose closing and opening take `close` and `open` ms on the fake clock; it logs what it does. */
function fakeFx(close = 200, open = 420) {
  const log: string[] = [];
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return {
    log,
    fx: {
      up: (k: Kind) => void log.push(`up ${k}`),
      close: (k: Kind) => (log.push(`close ${k}`), wait(close)),
      open: (k: Kind) => (log.push(`open ${k}`), wait(open)),
      label: (on: boolean, drawing?: boolean) => void log.push(`label ${on}${drawing ? ' drawing' : ''}`),
      down: () => void log.push('down'),
    },
  };
}
const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('kindFor()', () => {
  it('maps screen changes to covers (§2)', () => {
    expect(kindFor('', 'screen-splash', true)).toBe('first');
    expect(kindFor('', 'screen-game', true)).toBeNull(); // ?start=two, ?room=
    expect(kindFor('screen-splash', 'screen-title', false)).toBe('area');
    expect(kindFor('screen-splash', 'screen-start', false)).toBe('area');
    expect(kindFor('screen-title', 'screen-map', false)).toBe('area');
    expect(kindFor('screen-map', 'screen-route', false)).toBe('area');
    expect(kindFor('screen-game', 'screen-map', false)).toBe('area');
    expect(kindFor('screen-map', 'screen-title', false)).toBe('area');
    expect(kindFor('screen-title', 'screen-settings', false)).toBe('screen');
    expect(kindFor('screen-settings', 'screen-game', false)).toBe('screen'); // back to a game in progress
    expect(kindFor('screen-dex', 'screen-dex', false)).toBeNull(); // the same screen rebuilt
    expect(kindFor('screen-game', 'screen-game', false)).toBeNull(); // the game screen stays: a dip, not a cover
  });
});

describe('Covers', () => {
  it('a battle cover closes, waits shut for its screen, then opens; busy all along', async () => {
    const { fx, log } = fakeFx();
    const busy: boolean[] = [];
    const c = new Covers(fx, (b) => busy.push(b));
    let shut = false;
    void c.cover('battle').then(() => (shut = true));
    expect(c.pending).toBe(true);
    await flush(200);
    expect(shut).toBe(true);
    let revealed = false;
    void c.revealed().then(() => (revealed = true));
    await flush(1000); // a slow chunk: nothing opens without the screen
    expect(log).toEqual(['close battle', 'label true']);
    c.reveal('screen'); // show(): the kind of the waiting cover wins
    await flush(0);
    expect(log.slice(2)).toEqual(['label false', 'open battle']);
    expect(revealed).toBe(false);
    await flush(420);
    expect(log.at(-1)).toBe('down');
    expect(revealed).toBe(true);
    expect(busy).toEqual([true, false]);
  });

  it('"Finding a puzzle…" only after COVER_LABEL_MS', async () => {
    const { fx, log } = fakeFx();
    const c = new Covers(fx);
    void c.cover('screen');
    await flush(COVER_LABEL_MS - 50);
    expect(log).toEqual(['up screen']);
    c.reveal();
    await flush(COVER_LABEL_MS);
    expect(log).not.toContain('label true');
  });

  it('a cover that never sees its screen shows what is mounted after COVER_MAX_MS', async () => {
    const { fx, log } = fakeFx();
    const c = new Covers(fx);
    void c.cover('battle');
    await flush(COVER_MAX_MS - 1);
    expect(log).not.toContain('open battle');
    await flush(1);
    expect(log).toContain('open battle');
    await flush(420);
    expect(log.at(-1)).toBe('down');
  });

  it('the error path: reveal() with no kind opens a waiting cover and is a no-op otherwise', async () => {
    const { fx, log } = fakeFx();
    const c = new Covers(fx);
    c.reveal(); // nothing up: nothing happens
    expect(log).toEqual([]);
    void c.cover('screen');
    c.reveal(); // PuzzleGame.start's finally after a failed load
    await flush(420);
    expect(log).toEqual(['up screen', 'label false', 'open screen', 'down']);
    expect(c.pending).toBe(false);
  });

  it('a plain show() raises a cover at its peak and opens it at once; a second show() replaces it', async () => {
    const { fx, log } = fakeFx(0, 320);
    const c = new Covers(fx);
    c.reveal('area');
    await flush(100);
    c.reveal('screen');
    await flush(320);
    expect(log).toEqual(['up area', 'label false', 'open area', 'up screen', 'label false', 'open screen', 'down']);
    let done = false;
    void c.revealed().then(() => (done = true));
    await flush(0);
    expect(done).toBe(true);
  });

  it('a dip counts as busy until it settles', async () => {
    const { fx } = fakeFx();
    const busy: boolean[] = [];
    const c = new Covers(fx, (b) => busy.push(b));
    let done = false;
    void c.track(new Promise<void>((r) => setTimeout(r, 240))).then(() => undefined);
    void c.revealed().then(() => (done = true));
    await flush(239);
    expect(done).toBe(false);
    await flush(1);
    expect(done).toBe(true);
    expect(busy).toEqual([true, false]);
  });

  it('reveal waits for fx.ready, capped', async () => {
    // Loading fix, 14 Oct: a cover opens on a drawn screen. The board's images decode 300 ms after show().
    const { fx, log } = fakeFx();
    let drawn: () => void = () => undefined;
    const c = new Covers({ ...fx, ready: (k: Kind) => (log.push(`ready ${k}`), new Promise<void>((r) => (drawn = r))) });
    void c.cover('battle');
    await flush(200);
    c.reveal();
    await flush(299);
    expect(log).toEqual(['close battle', 'label false', 'ready battle']);
    drawn();
    await flush(0);
    expect(log.at(-1)).toBe('open battle');
    let revealed = false;
    void c.revealed().then(() => (revealed = true));
    await flush(420);
    expect(revealed).toBe(true); // revealed() still waits for the open, so what follows starts on a drawn board
    // Images that never come: a battle cover opens after BATTLE_READY_MS, a screen cover after SCREEN_READY_MS.
    const never = fakeFx();
    const d = new Covers({ ...never.fx, ready: () => new Promise<void>(() => undefined) });
    void d.cover('battle');
    await flush(200);
    d.reveal();
    await flush(BATTLE_READY_MS - 1);
    expect(never.log).not.toContain('open battle');
    await flush(1);
    expect(never.log).toContain('open battle');
    await flush(420);
    d.reveal('screen');
    await flush(SCREEN_READY_MS - 1);
    expect(never.log).not.toContain('open screen');
    await flush(1);
    expect(never.log.at(-1)).toBe('open screen');
    // A screen cover over a board (a YELLOW lesson, the warm-up) waits as long as a battle cover.
    const lesson = fakeFx(0, 180);
    const e = new Covers({ ...lesson.fx, ready: () => new Promise<void>(() => undefined), board: () => true });
    e.reveal('screen');
    await flush(BATTLE_READY_MS - 1);
    expect(lesson.log).not.toContain('open screen');
    await flush(1);
    expect(lesson.log.at(-1)).toBe('open screen');
    // An fx without ready() (the tests above) opens at once, as before.
    const plain = fakeFx(0, 320);
    new Covers(plain.fx).reveal('area');
    await flush(0);
    expect(plain.log).toEqual(['up area', 'label false', 'open area']);
  });

  it('a cover held for its images says so after COVER_LABEL_MS, and drops the line before it opens', async () => {
    // Review, 14 Oct: the bars could stay shut up to BATTLE_READY_MS with no word, which reads as a hang.
    const { fx, log } = fakeFx();
    let drawn: () => void = () => undefined;
    const c = new Covers({ ...fx, ready: () => new Promise<void>((r) => (drawn = r)) });
    void c.cover('battle');
    await flush(200);
    c.reveal();
    await flush(COVER_LABEL_MS - 1);
    expect(log).toEqual(['close battle', 'label false']);
    await flush(1);
    expect(log.at(-1)).toBe('label true drawing');
    drawn();
    await flush(0);
    expect(log.slice(-2)).toEqual(['label false', 'open battle']);
    // Drawn within COVER_LABEL_MS: not a word. At the cap: the line goes before the bars open.
    const quick = fakeFx();
    const q = new Covers({ ...quick.fx, ready: () => new Promise<void>((r) => setTimeout(r, COVER_LABEL_MS - 1)) });
    q.reveal('battle');
    await flush(COVER_LABEL_MS);
    expect(quick.log).toEqual(['up battle', 'label false', 'open battle']);
    const never = fakeFx();
    const n = new Covers({ ...never.fx, ready: () => new Promise<void>(() => undefined) });
    n.reveal('battle');
    await flush(BATTLE_READY_MS);
    expect(never.log).toEqual(['up battle', 'label false', 'label true drawing', 'label false', 'open battle']);
  });
});
