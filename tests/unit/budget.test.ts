// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { ALARM_CAP, alarmAllowed, FLUSH_EVERY, FLUSH_MS, FREE_DAILY_REQUESTS, overBudget, Tally, utcDay } from '../../worker/src/budget';

const T0 = Date.UTC(2026, 9, 6, 23, 59, 0);

describe('relay budget guard (§B23 item 3)', () => {
  it('refuses from 80% of the free daily allowance', () => {
    expect(overBudget(79_999)).toBe(false);
    expect(overBudget(80_000)).toBe(true);
    expect(overBudget(FREE_DAILY_REQUESTS)).toBe(true);
  });

  it('counts per UTC day', () => {
    expect(utcDay(T0)).toBe('2026-10-06');
    expect(utcDay(T0 + 60_000)).toBe('2026-10-07');
  });

  it('tallies in memory and adds to the counter in batches, not on every request', () => {
    const t = new Tally();
    expect(t.add(1, T0)).toBe(true); // first request of the day: learn the total
    t.flushed(1000 + t.take(), T0);
    let flushes = 0;
    for (let i = 0; i < FLUSH_EVERY * 4; i++) {
      if (!t.add(1, T0 + 1000)) continue;
      flushes++;
      t.flushed(t.known + t.take(), T0 + 1000);
    }
    expect(flushes).toBe(4);
    expect(t.add(1, T0 + 1000 + FLUSH_MS)).toBe(true); // and at least every FLUSH_MS while busy
  });

  it('starts again at UTC midnight', () => {
    const t = new Tally();
    t.add(1, T0);
    t.flushed(90_000 + t.take(), T0);
    expect(overBudget(t.estimate())).toBe(true);
    t.add(1, T0 + 120_000);
    expect(t.estimate()).toBe(1);
    expect(overBudget(t.estimate())).toBe(false);
  });

  it('caps a room at 10 alarms in its life', () => {
    expect(alarmAllowed(ALARM_CAP - 1)).toBe(true);
    expect(alarmAllowed(ALARM_CAP)).toBe(false);
  });
});
