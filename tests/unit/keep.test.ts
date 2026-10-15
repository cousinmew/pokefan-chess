// SPDX-License-Identifier: AGPL-3.0-only
// Trust fix (14 Oct): the relay deletes a feedback note 180 days after it was sent, as About and the README say. The
// Feedback Durable Object lists every key before notesExpiredBefore(now) and schedules its alarm with
// nextFeedbackAlarm (worker/src/Feedback.ts), so these are the rules it runs on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, KEEP_MS, nextFeedbackAlarm, noteAt, noteKey, notesExpiredBefore } from '../../worker/src/keep';

const NOW = Date.UTC(2026, 9, 14, 12);

describe('feedback notes are kept 180 days', () => {
  it('keeps a note for exactly 180 days', () => expect(KEEP_MS).toBe(180 * DAY_MS));

  it('lists a note as expired only once it is older than 180 days (keys sort by the time sent)', () => {
    const end = notesExpiredBefore(NOW);
    const expired = (at: number) => noteKey(at, 'abcd1234') < end;
    expect(expired(NOW - KEEP_MS - 1)).toBe(true);
    expect(expired(NOW - KEEP_MS - 30 * DAY_MS)).toBe(true);
    expect(expired(NOW - KEEP_MS)).toBe(false);
    expect(expired(NOW - KEEP_MS + 1)).toBe(false);
    expect(expired(NOW)).toBe(false);
    expect(noteAt(noteKey(NOW, 'abcd1234'))).toBe(NOW);
  });

  it('wakes hourly while rate limit counters are left, then when the oldest note turns 180 days, then never', () => {
    const oldest = noteKey(NOW - 10 * DAY_MS, 'x');
    expect(nextFeedbackAlarm(NOW, true, oldest)).toBe(NOW + HOUR_MS);
    expect(nextFeedbackAlarm(NOW, false, oldest)).toBe(NOW - 10 * DAY_MS + KEEP_MS + 1000);
    expect(nextFeedbackAlarm(NOW, false, undefined)).toBeNull();
    // A note already due (left by an earlier alarm's limit) is retried straight away, never in the past.
    expect(nextFeedbackAlarm(NOW, false, noteKey(NOW - KEEP_MS - DAY_MS, 'x'))).toBe(NOW + 1000);
  });

  it('is what the Durable Objects use, and the Feedback key format matches noteKey', () => {
    const fb = readFileSync('worker/src/Feedback.ts', 'utf8');
    expect(fb).toMatch(/\[noteKey\(entry\.at, /);
    expect(fb).toMatch(/end: notesExpiredBefore\(now\)/);
    expect(fb).toMatch(/nextFeedbackAlarm\(now, counters, oldest\)/);
    const vault = readFileSync('worker/src/Vault.ts', 'utf8');
    expect(vault).toMatch(/import \{ KEEP_MS \} from '\.\/keep';/);
    expect(vault).toMatch(/setAlarm\(Date\.now\(\) \+ KEEP_MS\)/); // every read or write pushes a save code's expiry back
  });

  it('turns Workers Logs off in the relay config', () => {
    expect(readFileSync('worker/wrangler.toml', 'utf8')).toMatch(/\n\[observability\]\nenabled = false\n/);
  });
});
