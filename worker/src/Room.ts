// SPDX-License-Identifier: AGPL-3.0-only
// One Durable Object per room: the server is the source of truth (V4). Hibernating WebSockets, state in storage.
import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';
import { enforce } from './team';
import { REACTION_COUNT, SKIN_KEYS, type ClientMsg, type Result, type Seat, type ServerMsg, type Skin } from './protocol';

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string;
  RECONNECT_MS: string;
}

interface Data {
  created: number;
  touched: number;
  moves: string[];
  seats: Record<Seat, string | null>;
  away: Partial<Record<Seat, number>>;
  result: Result | null;
  rematch: Seat[];
  swap: boolean;
  skins?: Partial<Record<Seat, Skin>>;
}

const EXPIRE_MS = 24 * 60 * 60 * 1000; // an untouched room is deleted after a day
const OPEN = 1;
const other = (s: Seat): Seat => (s === 'w' ? 'b' : 'w');

export class Room extends DurableObject<Env> {
  private reconnectMs(): number {
    return Number(this.env.RECONNECT_MS) || 60_000;
  }

  private async load(): Promise<Data | undefined> {
    return this.ctx.storage.get<Data>('room');
  }

  private async store(d: Data): Promise<void> {
    d.touched = Date.now();
    await this.ctx.storage.put('room', d);
    const due = Object.values(d.away).map((t) => t + this.reconnectMs());
    await this.ctx.storage.setAlarm(Math.min(d.touched + EXPIRE_MS, ...(d.result ? [] : due)));
  }

  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname === '/init') {
      if (await this.load()) return new Response('taken', { status: 409 });
      const now = Date.now();
      await this.store({ created: now, touched: now, moves: [], seats: { w: null, b: null }, away: {}, result: null, rematch: [], swap: false });
      return new Response('ok');
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private seatOf(ws: WebSocket): Seat | null {
    return (ws.deserializeAttachment() as { seat?: Seat } | null)?.seat ?? null;
  }

  private sockets(seat: Seat, except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s !== except && s.readyState === OPEN && this.seatOf(s) === seat);
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn('send failed', err instanceof Error ? err.message : err);
    }
  }

  private broadcast(d: Data): void {
    const fen = replay(d.moves).fen();
    const seats = {
      w: { taken: d.seats.w !== null, online: this.sockets('w').length > 0 },
      b: { taken: d.seats.b !== null, online: this.sockets('b').length > 0 },
    };
    for (const ws of this.ctx.getWebSockets()) {
      const you = this.seatOf(ws);
      if (you) this.send(ws, { type: 'state', you, moves: d.moves, fen, seats, result: d.result, rematch: d.rematch, skins: d.skins ?? {} });
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 512) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch (err) {
      console.warn('unparseable message', err instanceof Error ? err.message : err);
      this.send(ws, { type: 'reject', reason: 'bad message' });
      return;
    }
    const d = await this.load();
    if (!d) {
      this.send(ws, { type: 'error', reason: 'unknown' });
      ws.close(4404, 'unknown room');
      return;
    }
    if (msg.type === 'join') return this.join(ws, d, msg.token, msg.skin);
    const seat = this.seatOf(ws);
    if (!seat) return;
    switch (msg.type) {
      case 'move':
        return this.move(ws, d, seat, msg.uci);
      case 'reaction':
        if (Number.isInteger(msg.id) && msg.id >= 0 && msg.id < REACTION_COUNT) for (const s of this.sockets(other(seat))) this.send(s, { type: 'reaction', id: msg.id, from: seat });
        return;
      case 'resign':
        if (d.result || d.seats[other(seat)] === null) return;
        d.result = { reason: 'resign', winner: other(seat) };
        break;
      case 'rematch':
        if (!d.result) return;
        if (!d.rematch.includes(seat)) d.rematch.push(seat);
        d.swap ||= msg.swap === true;
        if (d.rematch.length === 2) this.reset(d);
        break;
      default:
        return;
    }
    await this.store(d);
    this.broadcast(d);
  }

  private async join(ws: WebSocket, d: Data, token: unknown, skin: unknown): Promise<void> {
    if (typeof token !== 'string' || token.length < 8 || token.length > 64) return;
    let seat: Seat | null = d.seats.w === token ? 'w' : d.seats.b === token ? 'b' : null;
    if (!seat) seat = d.seats.w === null ? 'w' : d.seats.b === null ? 'b' : null;
    if (!seat) {
      this.send(ws, { type: 'error', reason: 'full' });
      ws.close(4409, 'room full');
      return;
    }
    // The same player from a new tab or a reload takes the seat over.
    for (const old of this.sockets(seat, ws)) {
      this.send(old, { type: 'error', reason: 'replaced' });
      old.close(4000, 'replaced');
    }
    d.seats[seat] = token;
    delete d.away[seat];
    d.skins = { ...d.skins, [seat]: cleanSkin(skin) };
    ws.serializeAttachment({ seat });
    await this.store(d);
    this.broadcast(d);
  }

  private async move(ws: WebSocket, d: Data, seat: Seat, uci: unknown): Promise<void> {
    if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return this.send(ws, { type: 'reject', reason: 'bad move' });
    if (d.result) return this.send(ws, { type: 'reject', reason: 'game over' });
    if (d.seats.b === null) return this.send(ws, { type: 'reject', reason: 'waiting for a friend' });
    const chess = replay(d.moves);
    if (chess.turn() !== seat) return this.send(ws, { type: 'reject', reason: 'not your turn' });
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch (err) {
      console.warn('illegal move', uci, err instanceof Error ? err.message : err);
      return this.send(ws, { type: 'reject', reason: 'illegal move' });
    }
    d.moves.push(uci);
    if (chess.isCheckmate()) d.result = { reason: 'checkmate', winner: seat };
    else if (chess.isDraw()) d.result = { reason: 'draw', winner: null };
    await this.store(d);
    this.broadcast(d);
  }

  private reset(d: Data): void {
    if (d.swap) {
      d.seats = { w: d.seats.b, b: d.seats.w };
      for (const ws of this.ctx.getWebSockets()) {
        const s = this.seatOf(ws);
        if (s) ws.serializeAttachment({ seat: other(s) });
      }
      d.away = { w: d.away.b, b: d.away.w };
      d.skins = { w: d.skins?.b, b: d.skins?.w };
      for (const s of ['w', 'b'] as Seat[]) if (d.away[s] === undefined) delete d.away[s];
    }
    d.moves = [];
    d.result = null;
    d.rematch = [];
    d.swap = false;
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  private async leave(ws: WebSocket): Promise<void> {
    const seat = this.seatOf(ws);
    const d = await this.load();
    if (!seat || !d || this.sockets(seat, ws).length > 0) return;
    d.away[seat] = Date.now();
    await this.store(d);
    this.broadcast(d);
  }

  /** Reconnect deadline (V6) and room expiry. */
  async alarm(): Promise<void> {
    const d = await this.load();
    if (!d) return;
    const now = Date.now();
    if (now - d.touched >= EXPIRE_MS) {
      await this.ctx.storage.deleteAll();
      return;
    }
    for (const seat of ['w', 'b'] as Seat[]) {
      const since = d.away[seat];
      if (since !== undefined && !d.result && d.seats[other(seat)] !== null && now - since >= this.reconnectMs()) {
        d.result = { reason: 'timeout', winner: other(seat) };
      }
    }
    await this.store(d);
    this.broadcast(d);
  }
}

/** Keeps only known roles with valid species ids that follow the team rules (§B14). The relay cannot see a
 * player's starter or badges, so the king may be any starter family and the queen counts as unlocked. */
function cleanSkin(raw: unknown): Skin {
  const out: Skin = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of SKIN_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    // A species id, optionally shiny (:s) and with 1 to 3 stars (:1..:3), e.g. pidgey:s:2.
    if (typeof v === 'string' && /^[a-z][a-z-]{1,23}(:s)?(:[1-3])?$/.test(v)) out[k] = v;
  }
  return enforce(out, null, 1).team;
}

function replay(moves: string[]): Chess {
  const chess = new Chess();
  for (const m of moves) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  return chess;
}
