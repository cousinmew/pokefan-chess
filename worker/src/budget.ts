// SPDX-License-Identifier: AGPL-3.0-only
// Budget guard (§B23 item 3). The free plan allows 100,000 Durable Object requests per UTC day; one runaway room used
// them all on 6 Oct 2026. Requests are counted per UTC day in a single counter (the Budget object, BudgetCounter.ts).
// Above 80% the relay refuses new rooms and new feedback with a clear 503 while games already running finish.
// Counting must not double the bill, so each Worker isolate tallies in memory and adds its tally in batches.
export const FREE_DAILY_REQUESTS = 100_000;
export const GUARD_SHARE = 0.8;
export const FLUSH_EVERY = 25; // requests between batched adds to the counter
export const FLUSH_MS = 15_000; // or at least this often while busy
export const ALARM_CAP = 10; // alarms in one room's whole life (§B23 item 3)

/** The UTC day a time falls on, the counter's key. */
export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** True once the day's count (known plus not yet added) reaches the guard line. */
export const overBudget = (count: number, limit = FREE_DAILY_REQUESTS) => count >= limit * GUARD_SHARE;

/** One isolate's tally of requests not yet added to the day's counter, and the last total it learned. */
export class Tally {
  pending = 0;
  known = 0;
  day = '';
  lastFlush = 0;

  /** Counts `n` requests; returns true when it is time to add the tally to the counter. */
  add(n: number, now: number): boolean {
    const day = utcDay(now);
    if (day !== this.day) {
      // A new UTC day: the old tally belongs to yesterday's counter and the known total starts again.
      this.day = day;
      this.known = 0;
      this.pending = 0;
      this.lastFlush = 0;
    }
    this.pending += n;
    return this.pending >= FLUSH_EVERY || now - this.lastFlush >= FLUSH_MS;
  }

  /** The day's count as far as this isolate can tell. */
  estimate(): number {
    return this.known + this.pending;
  }

  /** Takes the tally to add to the counter (requests counted while the add is under way start a new tally). */
  take(): number {
    const n = this.pending;
    this.pending = 0;
    return n;
  }

  /** Called after an add: the counter's new total. */
  flushed(total: number, now: number): void {
    this.known = total;
    this.lastFlush = now;
  }
}

/** Whether a room may have another alarm, given how many it has had. */
export const alarmAllowed = (fired: number) => fired < ALARM_CAP;
