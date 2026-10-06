// SPDX-License-Identifier: AGPL-3.0-only
// Relay routes: POST /room -> {code}; GET /room/:code/ws -> WebSocket into that room's Durable Object.
// Save codes (§B18 item 2): POST /save -> {code}; PUT /save/:code updates; GET /save/:code restores.
// Feedback (§B21 item 3): POST /feedback stores one note; GET /feedback/export (owner token) lists them.
// Budget guard (§B23 item 3): every Durable Object request is counted per UTC day; from 80% of the free allowance new
// rooms and new feedback get a 503, while games already running (WebSocket joins) and save codes carry on.
import { CODE_RE } from './protocol';
import type { Env } from './Room';
import { VAULT_CODE_RE, VAULT_MAX_BYTES } from './Vault';

export { Room } from './Room';
export { Vault } from './Vault';
export { Feedback } from './Feedback';
export { Budget } from './BudgetCounter';
import { FEEDBACK_MAX_BYTES } from './Feedback';
import { overBudget, Tally, utcDay } from './budget';

const tally = new Tally();

/** Counts `n` Durable Object requests this call makes; true when the day is past the guard line. Adds go to the
 * counter in batches (in the background, except the first of the day in this isolate, which waits for the total). */
async function spend(env: Env, ctx: ExecutionContext, n: number): Promise<boolean> {
  const now = Date.now();
  if (tally.add(n, now)) {
    const first = tally.known === 0;
    const add = (async () => {
      const k = tally.take();
      try {
        const res = await env.BUDGET.get(env.BUDGET.idFromName('budget')).fetch(`https://budget/add?n=${k}&day=${utcDay(now)}`);
        tally.flushed(Number(await res.text()), now);
      } catch (err) {
        tally.pending += k;
        console.warn('budget add failed:', err instanceof Error ? err.message : err);
      }
    })();
    if (first) await add;
    else ctx.waitUntil(add);
  }
  return overBudget(tally.estimate());
}

const busy = (cors: Record<string, string>) => new Response('daily limit reached, try again after 00:00 UTC', { status: 503, headers: cors });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they read as 1 and 0

const SAVE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I, O, 0 or 1

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const newSaveCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => SAVE_ALPHABET[b % 32]).join('');

/** A save is a JSON object under the size limit; anything else is refused before it reaches storage. */
async function saveBody(req: Request): Promise<string | null> {
  const text = await req.text();
  if (text.length > VAULT_MAX_BYTES) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? text : null;
  } catch (err) {
    console.warn('bad save body:', err instanceof Error ? err.message : err);
    return null;
  }
}

export default {
  /** Any Durable Object failure (the platform refusing past the free allowance, an outage) becomes a clean 503 the game
   * can show (§B23 item 2), instead of an uncaught exception. */
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (err) {
      console.warn('relay error:', err instanceof Error ? err.message : err);
      const origin = req.headers.get('Origin') ?? '';
      const cors: Record<string, string> = env.ALLOWED_ORIGINS.split(',').includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
      return new Response('relay unavailable, try again later', { status: 503, headers: cors });
    }
  },
};

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin);
    const cors: Record<string, string> = allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, PUT, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') return new Response('ok', { headers: cors });
    if (url.pathname === '/room' && req.method === 'POST') {
      if (!allowed) return new Response('forbidden', { status: 403 });
      if (await spend(env, ctx, 1)) return busy(cors);
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const res = await env.ROOM.get(env.ROOM.idFromName(code)).fetch('https://room/init', { method: 'POST' });
        if (res.ok) return Response.json({ code }, { headers: cors });
      }
      return new Response('busy', { status: 503, headers: cors });
    }
    if (url.pathname === '/feedback' && req.method === 'POST') {
      if (!allowed) return new Response('forbidden', { status: 403 });
      if (await spend(env, ctx, 1)) return busy(cors);
      const body = await req.text();
      if (body.length > FEEDBACK_MAX_BYTES) return new Response('too big', { status: 413, headers: cors });
      // The rate limit sees a hash of the address and the hour, never the address.
      const ip = env.TEST_CLIENTS === '1' ? (req.headers.get('X-Test-Client') ?? crypto.randomUUID()) : (req.headers.get('CF-Connecting-IP') ?? 'local');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${Math.floor(Date.now() / 3_600_000)}`));
      const who = [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
      const box = env.FEEDBACK.get(env.FEEDBACK.idFromName('all'));
      return withCors(await box.fetch(`https://feedback/add?who=${who}`, { method: 'POST', body }), cors);
    }
    if (url.pathname === '/feedback/export' && req.method === 'GET') {
      const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!env.FEEDBACK_TOKEN || token !== env.FEEDBACK_TOKEN) return new Response('forbidden', { status: 403 });
      return env.FEEDBACK.get(env.FEEDBACK.idFromName('all')).fetch('https://feedback/export');
    }
    if (url.pathname === '/save' && req.method === 'POST') {
      if (!allowed) return new Response('forbidden', { status: 403 });
      await spend(env, ctx, 1);
      const body = await saveBody(req);
      if (!body) return new Response('bad save', { status: 400, headers: cors });
      for (let i = 0; i < 8; i++) {
        const code = newSaveCode();
        const res = await env.VAULT.get(env.VAULT.idFromName(code)).fetch('https://vault/create', { method: 'POST', body });
        if (res.ok) return Response.json({ code }, { headers: cors });
      }
      return new Response('busy', { status: 503, headers: cors });
    }
    const s = /^\/save\/([A-Z0-9]{8})$/.exec(url.pathname);
    if (s && VAULT_CODE_RE.test(s[1]!) && (req.method === 'GET' || req.method === 'PUT')) {
      if (!allowed) return new Response('forbidden', { status: 403 });
      await spend(env, ctx, 2);
      const vault = env.VAULT.get(env.VAULT.idFromName(s[1]!));
      if (req.method === 'GET') return withCors(await vault.fetch('https://vault/get'), cors);
      // An update only reaches a code that exists, so a typo can't plant a save under someone else's future code.
      if ((await vault.fetch('https://vault/get')).status === 404) return new Response('not found', { status: 404, headers: cors });
      const body = await saveBody(req);
      if (!body) return new Response('bad save', { status: 400, headers: cors });
      return withCors(await vault.fetch('https://vault/put', { method: 'POST', body }), cors);
    }
    const m = /^\/room\/([A-Z]{4})\/ws$/.exec(url.pathname);
    if (m && CODE_RE.test(m[1]!) && req.headers.get('Upgrade') === 'websocket') {
      if (!allowed) return new Response('forbidden', { status: 403 });
      await spend(env, ctx, 1); // counted, never refused: a game already running always finishes
      return env.ROOM.get(env.ROOM.idFromName(m[1]!)).fetch(req);
    }
    return new Response('not found', { status: 404, headers: cors });
}

function withCors(res: Response, cors: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}
