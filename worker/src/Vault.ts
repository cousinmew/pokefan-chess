// SPDX-License-Identifier: AGPL-3.0-only
// Opt in save codes (§B18 item 2): one Durable Object per 8 character code holds one profile's progress.
// No personal data, no accounts (V3): the code is the only key. It is deleted after 180 days without use (KEEP_MS in
// keep.ts), or at once when the player taps "Delete my save code" (trust fix, 14 Oct).
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './Room';
import { KEEP_MS } from './keep';

export const VAULT_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
export const VAULT_MAX_BYTES = 256 * 1024;

export class Vault extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
    // 204 also when the code had no copy left (expired, or deleted on another device): the game counts only a 204 as
    // deleted, because a relay from before DELETE answers 404 to it and still holds the save (trust fix, 15 Oct).
    if (path === '/delete') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return new Response(null, { status: 204 });
    }
    if (path === '/put' || path === '/create') {
      if (path === '/create' && (await this.ctx.storage.get('save')) !== undefined) return new Response('taken', { status: 409 });
      await this.ctx.storage.put('save', await req.text());
    }
    const save = await this.ctx.storage.get<string>('save');
    if (save === undefined) return new Response('not found', { status: 404 });
    // Every read or write counts as use and pushes the expiry back.
    await this.ctx.storage.setAlarm(Date.now() + KEEP_MS);
    return new Response(save, { headers: { 'Content-Type': 'application/json' } });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
