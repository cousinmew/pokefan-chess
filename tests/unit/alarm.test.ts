// SPDX-License-Identifier: AGPL-3.0-only
// The relay's room alarm never loops (6 Oct 2026 outage: one abandoned room used the whole free daily allowance).
import { describe, expect, it } from 'vitest';
import { EXPIRE_MS, nextAlarm } from '../../worker/src/alarm';

const now = 1_000_000_000_000;
const R = 60_000;

describe('room alarm', () => {
  it('a creator who left before anyone joined: no timeout is due, the room just expires a day after its last activity', () => {
    const d = { touched: now - 5 * R, away: { w: now - 5 * R }, seats: { w: 'tok', b: null }, result: null };
    expect(nextAlarm(d, R, now)).toBe(d.touched + EXPIRE_MS);
  });

  it('a player away with an opponent waiting: the timeout is due after the reconnect window', () => {
    expect(nextAlarm({ touched: now, away: { b: now }, seats: { w: 'a', b: 'b' }, result: null }, R, now)).toBe(now + R);
  });

  it('never in the past, so a past due time cannot fire in a loop', () => {
    expect(nextAlarm({ touched: now - EXPIRE_MS - 1, away: { b: now - 10 * R }, seats: { w: 'a', b: 'b' }, result: null }, R, now)).toBe(now + 1000);
  });

  it('a decided game only waits for expiry', () => {
    expect(nextAlarm({ touched: now, away: { b: now }, seats: { w: 'a', b: 'b' }, result: { reason: 'timeout', winner: 'w' } }, R, now)).toBe(now + EXPIRE_MS);
  });
});
