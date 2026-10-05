// SPDX-License-Identifier: AGPL-3.0-only
// Relay routes: POST /room -> {code}; GET /room/:code/ws -> WebSocket into that room's Durable Object.
import { CODE_RE } from './protocol';
import type { Env } from './Room';

export { Room } from './Room';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they read as 1 and 0

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin);
    const cors: Record<string, string> = allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') return new Response('ok', { headers: cors });
    if (url.pathname === '/room' && req.method === 'POST') {
      if (!allowed) return new Response('forbidden', { status: 403 });
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const res = await env.ROOM.get(env.ROOM.idFromName(code)).fetch('https://room/init', { method: 'POST' });
        if (res.ok) return Response.json({ code }, { headers: cors });
      }
      return new Response('busy', { status: 503, headers: cors });
    }
    const m = /^\/room\/([A-Z]{4})\/ws$/.exec(url.pathname);
    if (m && CODE_RE.test(m[1]!) && req.headers.get('Upgrade') === 'websocket') {
      if (!allowed) return new Response('forbidden', { status: 403 });
      return env.ROOM.get(env.ROOM.idFromName(m[1]!)).fetch(req);
    }
    return new Response('not found', { status: 404, headers: cors });
  },
};
