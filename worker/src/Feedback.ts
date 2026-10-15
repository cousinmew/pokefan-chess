// SPDX-License-Identifier: AGPL-3.0-only
// Feedback (§B21 item 3): translation suggestions and player notes, kept in one Durable Object. No accounts, no names,
// no emails. A rate limit per IP uses a short-lived hash of the address and the hour, never the address itself. A note
// is deleted 180 days after it was sent (trust fix, 14 Oct; KEEP_MS in keep.ts).
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './Room';
import { HOUR_MS, nextFeedbackAlarm, noteKey, notesExpiredBefore } from './keep';

export const FEEDBACK_PER_HOUR = 20;
export const FEEDBACK_MAX_BYTES = 4096;
const LIMITS = { lang: 10, key: 80, current: 600, suggestion: 600, note: 300, text: 200, version: 20, screen: 40 } as const;
const KINDS = ['translation', 'bug', 'hard', 'fun'] as const;

export type Entry = { at: number; kind: (typeof KINDS)[number] } & Partial<Record<keyof typeof LIMITS, string>>;

/** Only the known fields, trimmed and capped; null when the kind is unknown or nothing useful was sent. */
export function cleanEntry(raw: unknown, at: number): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  const out: Entry = { at, kind };
  for (const [f, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    const v = r[f];
    if (typeof v === 'string' && v.trim()) out[f] = v.trim().slice(0, max);
  }
  if (kind === 'translation' && (!out.lang || !out.key || !out.suggestion)) return null;
  return out;
}

export class Feedback extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/export') {
      const all = await this.ctx.storage.list<Entry>({ prefix: 'f:' });
      // Notes kept from before the 180 day rule get their alarm here at the latest.
      if (all.size && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return Response.json([...all.values()]);
    }
    const who = url.searchParams.get('who') ?? '';
    const hour = Math.floor(Date.now() / 3_600_000);
    const rk = `rl:${who}:${hour}`;
    const count = (await this.ctx.storage.get<number>(rk)) ?? 0;
    if (count >= FEEDBACK_PER_HOUR) return new Response('slow down', { status: 429 });
    const entry = cleanEntry(await req.json().catch(() => null), Date.now());
    if (!entry) return new Response('bad feedback', { status: 400 });
    await this.ctx.storage.put({ [rk]: count + 1, [noteKey(entry.at, crypto.randomUUID().slice(0, 8))]: entry });
    // Rate limit counters are cleared hourly; the alarm then waits for the oldest note's 180 days.
    const alarm = await this.ctx.storage.getAlarm();
    if (!alarm || alarm > Date.now() + HOUR_MS) await this.ctx.storage.setAlarm(Date.now() + HOUR_MS);
    return new Response('ok', { status: 201 });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const hour = Math.floor(now / HOUR_MS);
    const old = [...(await this.ctx.storage.list({ prefix: 'rl:' })).keys()].filter((k) => Number(k.split(':').pop()) < hour);
    // Notes past their 180 days (keys sort by the time sent), at most 128 keys per delete.
    const expired = [...(await this.ctx.storage.list({ prefix: 'f:', end: notesExpiredBefore(now) })).keys()];
    const gone = [...old, ...expired];
    for (let i = 0; i < gone.length; i += 128) await this.ctx.storage.delete(gone.slice(i, i + 128));
    const counters = (await this.ctx.storage.list({ prefix: 'rl:', limit: 1 })).size > 0;
    const oldest = [...(await this.ctx.storage.list({ prefix: 'f:', limit: 1 })).keys()][0];
    const next = nextFeedbackAlarm(now, counters, oldest);
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
}
