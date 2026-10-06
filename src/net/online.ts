// SPDX-License-Identifier: AGPL-3.0-only
// Relay client: create a room, one WebSocket per player, automatic reconnect with a per tab session token (V6).
import { RECONNECT_BACKOFF_MS, RELAY_URL } from '../config';
import { load, save } from '../store/persist';
import type { ClientMsg, ServerMsg, Skin } from '../../worker/src/protocol';

/** A room code from whatever was typed or pasted (§B18 item 1): a full link works, case and spaces do not matter,
 * anything that is not a letter is dropped, and only the first 4 letters count. */
export function normalizeCode(raw: string): string {
  const fromLink = /[?&]room=([^&#]*)/i.exec(raw)?.[1];
  return decodeURIComponent(fromLink ?? raw)
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
}

/** The relay origin. Tests point it at `wrangler dev` with ?debug=1&relay=... */
export function relayBase(): string {
  const p = new URLSearchParams(location.search);
  return (p.has('debug') && p.get('relay')) || RELAY_URL;
}

export async function createRoom(): Promise<string> {
  const res = await fetch(`${relayBase()}/room`, { method: 'POST' });
  if (!res.ok) throw new Error(`relay answered ${res.status}`);
  const body = (await res.json()) as { code?: string };
  if (!body.code) throw new Error('relay sent no code');
  return body.code;
}

function sessionToken(code: string): string {
  const key = `kc:v1:room:${code}`;
  let token: string | null = null;
  try {
    token = window.sessionStorage.getItem(key);
  } catch (err) {
    console.warn('sessionStorage blocked:', err instanceof Error ? err.name : err);
  }
  // A reopened tab has an empty sessionStorage; the per room copy in localStorage resumes the seat.
  // crypto.randomUUID needs HTTPS; plain http (before HTTPS is enforced) falls back to getRandomValues.
  token ??= load<string>(`room:${code}`) ?? (crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''));
  try {
    window.sessionStorage.setItem(key, token);
  } catch (err) {
    console.warn('sessionStorage blocked:', err instanceof Error ? err.name : err);
  }
  save(`room:${code}`, token);
  return token;
}

export class OnlineClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private tries = 0;
  private readonly token: string;

  constructor(
    readonly code: string,
    private readonly onMsg: (msg: ServerMsg) => void,
    private readonly onLink: (up: boolean) => void,
    private readonly skin: Skin = {},
  ) {
    this.token = sessionToken(code);
    this.connect();
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.stopped = true;
    this.ws?.close(1000, 'left');
    this.ws = null;
  }

  private connect(): void {
    const ws = new WebSocket(`${relayBase().replace(/^http/, 'ws')}/room/${this.code}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.onLink(true);
      ws.send(JSON.stringify({ type: 'join', token: this.token, skin: this.skin } satisfies ClientMsg));
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch (err) {
        console.warn('bad relay message:', err instanceof Error ? err.message : err);
        return;
      }
      if (msg.type === 'error') this.stopped = true;
      this.onMsg(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.stopped) return;
      this.onLink(false);
      const delay = RECONNECT_BACKOFF_MS[Math.min(this.tries++, RECONNECT_BACKOFF_MS.length - 1)];
      window.setTimeout(() => !this.stopped && this.connect(), delay);
    };
  }
}
