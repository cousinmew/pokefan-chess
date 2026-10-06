// SPDX-License-Identifier: AGPL-3.0-only
// The day's Durable Object request counter (§B23 item 3): one object, one number per UTC day. Workers add to it in
// batches (src/budget.ts), and each add returns the new total.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './Room';

export class Budget extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const day = url.searchParams.get('day') ?? '';
    const n = Math.max(0, Math.min(10_000, Number(url.searchParams.get('n')) || 0));
    const total = ((await this.ctx.storage.get<number>(`d:${day}`)) ?? 0) + n + 1; // + 1: this add is a request too
    await this.ctx.storage.put(`d:${day}`, total);
    // Earlier days are not needed again.
    const old = [...(await this.ctx.storage.list({ prefix: 'd:' })).keys()].filter((k) => k !== `d:${day}`);
    if (old.length) await this.ctx.storage.delete(old);
    return new Response(String(total));
  }
}
