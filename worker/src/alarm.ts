// SPDX-License-Identifier: AGPL-3.0-only
// When a room next needs its alarm. Pure, so tests can check it without a Durable Object.
import type { Result, Seat } from './protocol';

export const EXPIRE_MS = 24 * 60 * 60 * 1000; // an untouched room is deleted after a day

export interface AlarmState {
  touched: number;
  away: Partial<Record<Seat, number>>;
  seats: Record<Seat, string | null>;
  result: Result | null;
}

/** A timeout is only due when the away seat has an opponent to award it to and nothing is decided; otherwise only the
 * expiry. Never in the past: a past alarm fires at once, and if nothing changes it loops (6 Oct 2026: about 330,000
 * Durable Object requests in two hours, the whole free daily allowance, from one room whose creator left before
 * anyone joined, while the loop also kept refreshing the room's age so it never expired). */
export function nextAlarm(d: AlarmState, reconnectMs: number, now: number): number {
  const opp = (s: Seat): Seat => (s === 'w' ? 'b' : 'w');
  const due = d.result ? [] : (Object.entries(d.away) as [Seat, number][]).filter(([seat]) => d.seats[opp(seat)] !== null).map(([, t]) => t + reconnectMs);
  return Math.max(now + 1000, Math.min(d.touched + EXPIRE_MS, ...due));
}
