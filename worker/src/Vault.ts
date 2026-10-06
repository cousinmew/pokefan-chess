// SPDX-License-Identifier: AGPL-3.0-only
// Opt in save codes (§B18 item 2): one Durable Object per 8 character code holds one profile's progress.
// No personal data, no accounts (V3): the code is the only key. It is deleted after 180 days without use.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './Room';

export const VAULT_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
export const VAULT_MAX_BYTES = 256 * 1024;
const KEEP_MS = 180 * 24 * 60 * 60 * 1000;

export class Vault extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;
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
