// SPDX-License-Identifier: AGPL-3.0-only
// Loading fix, 14 Oct: the idle queue waits while a screen's visible images load (a cover or dip pauses it), still
// two at a time, and the board's priority lane goes first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const g = globalThis as unknown as Record<string, unknown>;
g.window = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id) };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});
afterEach(() => vi.useRealTimers());

/** Loads that settle when the test says so; `log` records when each starts. */
function loads() {
  const log: string[] = [];
  const done = new Map<string, () => void>();
  const task = (id: string) => () => (log.push(id), new Promise<void>((r) => done.set(id, r)));
  return { log, task, finish: (id: string) => done.get(id)?.() };
}

describe('loader', () => {
  it('the idle queue pauses while visible images load', async () => {
    const { pauseWhile, releaseIdle, whenIdle, loaderPaused } = await import('../../src/ui/loader');
    const { log, task, finish } = loads();
    releaseIdle();
    let drawn: () => void = () => undefined;
    pauseWhile(new Promise<void>((r) => (drawn = r))); // a cover waits on the screen's images
    for (const id of ['a', 'b', 'c']) whenIdle(task(id));
    await vi.advanceTimersByTimeAsync(1000);
    expect(loaderPaused()).toBe(true);
    expect(log).toEqual([]);
    drawn();
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(['a', 'b']); // still two at a time
    finish('a');
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('a pause that never ends lets go after PAUSE_MAX_MS', async () => {
    const { pauseWhile, releaseIdle, whenIdle, PAUSE_MAX_MS } = await import('../../src/ui/loader');
    const { log, task } = loads();
    releaseIdle();
    pauseWhile(new Promise<void>(() => undefined));
    whenIdle(task('a'));
    await vi.advanceTimersByTimeAsync(PAUSE_MAX_MS - 100);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(log).toEqual(['a']);
  });

  it('the priority lane goes before idle work, PRIORITY_PARALLEL at a time, and needs no release', async () => {
    const { whenFree, whenIdle, releaseIdle, PRIORITY_PARALLEL } = await import('../../src/ui/loader');
    const { log, task, finish } = loads();
    whenIdle(task('idle'));
    const ids = Array.from({ length: PRIORITY_PARALLEL + 1 }, (_, i) => `p${i}`);
    for (const id of ids) whenFree(task(id));
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(ids.slice(0, PRIORITY_PARALLEL)); // before the first screen released the idle queue
    releaseIdle();
    for (const id of ids.slice(0, PRIORITY_PARALLEL)) finish(id);
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(ids); // the lane's last load; the idle one still waits for it
    finish(ids.at(-1)!);
    await vi.advanceTimersByTimeAsync(100);
    expect(log.at(-1)).toBe('idle');
  });

  it('the priority lane waits only while a cover holds its screen, then goes on while idle work still waits', async () => {
    const { pauseWhile, releaseIdle, whenFree, whenIdle } = await import('../../src/ui/loader');
    const { log, task, finish } = loads();
    releaseIdle();
    pauseWhile(new Promise<void>(() => undefined), 300); // a screen cover's cap; its images never come
    whenFree(task('still'));
    whenIdle(task('idle'));
    await vi.advanceTimersByTimeAsync(250);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(150);
    expect(log).toEqual(['still']);
    finish('still');
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toEqual(['still']); // idle work still waits for the screen's images
  });

  it("panel cries go before other idle work but after the whole priority lane, two at a time (review, 14 Oct)", async () => {
    // They were in the priority lane: about 30 on a late save held a board's select cries and backs back for seconds.
    const { whenFree, whenIdle, whenIdleFirst, releaseIdle, pauseWhile } = await import('../../src/ui/loader');
    const { log, task, finish } = loads();
    releaseIdle();
    whenIdle(task('front'));
    for (const id of ['cry1', 'cry2', 'cry3']) whenIdleFirst(task(id));
    whenFree(task('back'));
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(['back']); // the board's lane first; the panel cries wait for it
    finish('back');
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(['back', 'cry1', 'cry2']);
    whenFree(task('select')); // a board drawn meanwhile goes before the next panel cry
    await vi.advanceTimersByTimeAsync(100);
    expect(log.at(-1)).toBe('select');
    finish('select');
    finish('cry1');
    await vi.advanceTimersByTimeAsync(100);
    expect(log.at(-1)).toBe('cry3');
    // Like idle work they wait while a screen's images load.
    let drawn: () => void = () => undefined;
    pauseWhile(new Promise<void>((r) => (drawn = r)));
    finish('cry2');
    finish('cry3');
    await vi.advanceTimersByTimeAsync(100);
    expect(log.at(-1)).toBe('cry3');
    drawn();
    await vi.advanceTimersByTimeAsync(100);
    expect(log.at(-1)).toBe('front');
  });

  it('a cover also waits for what its screen shows right after the reveal, once (review, 14 Oct)', async () => {
    // A Classic style board draws no sprite, but the intro card shows each king's still: the cover waits for those.
    const { neededAtReveal, revealNeeds } = await import('../../src/ui/loader');
    let still: () => void = () => undefined;
    neededAtReveal(new Promise<void>((r) => (still = r)));
    neededAtReveal(Promise.reject(new Error('404'))); // a file that fails counts as settled
    let open = false;
    void revealNeeds().then(() => (open = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(open).toBe(false);
    still();
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toBe(true);
    // Settled ones are dropped: the next cover does not wait on them.
    let next = false;
    void revealNeeds().then(() => (next = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(next).toBe(true);
  });
});
