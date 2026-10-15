// SPDX-License-Identifier: AGPL-3.0-only
// How long the relay keeps what it is sent (trust fix, 14 Oct), in one place for the Vault, Feedback and the About
// copy's tests: a save code 180 days after its last use, a feedback note 180 days after it was sent.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const KEEP_MS = 180 * DAY_MS;
export const HOUR_MS = 3_600_000;

/** Feedback notes are stored as `f:<sent at, ms>:<random>`; ms timestamps have 13 digits until the year 2286, so the
 * keys sort by time and every key before `f:<now - KEEP_MS>` is a note past its 180 days. */
export const noteKey = (at: number, id: string) => `f:${at}:${id}`;
export const notesExpiredBefore = (now: number) => `f:${now - KEEP_MS}`;
export const noteAt = (key: string) => Number(key.split(':')[1]);

/** When Feedback's alarm should run next: hourly while rate limit counters are left to clear, else when the oldest
 * note turns 180 days old, else never (null: an idle relay costs nothing). */
export function nextFeedbackAlarm(now: number, counters: boolean, oldestNote: string | undefined): number | null {
  const times = [counters ? now + HOUR_MS : Infinity, oldestNote ? Math.max(now, noteAt(oldestNote) + KEEP_MS) + 1000 : Infinity];
  const t = Math.min(...times);
  return Number.isFinite(t) ? t : null;
}
