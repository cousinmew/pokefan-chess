// SPDX-License-Identifier: AGPL-3.0-only
// Online game controller. The relay is the source of truth (V4): local moves are sent, and the board only
// changes when a `state` arrives. A capture plays its battle locally on both screens from the state diff.
import { REACTION_COUNT, type Seat, type ServerMsg, type Skin } from '../../worker/src/protocol';
import type { StringKey } from '../game/text';
import { button, el, toast } from '../ui/dom';
import { message, waitingRoom } from '../ui/online';
import { OnlineClient } from './online';
import type { App } from '../main';

export interface OnlineHost {
  app: App;
  show(view: HTMLElement): void;
  goTitle(): void;
  /** Shows the game view with these moves applied, playing `human`. */
  startBoard(moves: string[], human: Seat): void;
  /** Plays one move through the normal path (battle, text, end detection). */
  applyRemote(uci: string): boolean;
  /** Ends the game for a reason the board cannot see (timeout, resign). */
  endWith(key: StringKey): void;
  say(key: StringKey): void;
  /** Your My Team skins, sent when joining. */
  mySkin(): Skin;
  /** Applies both players' skins and redraws. */
  applySkins(skins: Partial<Record<Seat, Skin>>): void;
}

export class OnlineGame {
  private client: OnlineClient | null = null;
  private queue: Extract<ServerMsg, { type: 'state' }>[] = [];
  private started = false;
  private applied: string[] = [];
  readonly bar: HTMLElement;
  lastReject: string | null = null;

  constructor(private readonly host: OnlineHost) {
    this.bar = el('div', 'reactions');
    this.bar.hidden = true;
    for (let i = 0; i < REACTION_COUNT; i++) this.bar.append(button(`react.${i}` as StringKey, () => this.client?.send({ type: 'reaction', id: i }), `react-${i}`));
    this.bar.append(button('online.resign', () => this.client?.send({ type: 'resign' }), 'resign', 'resign'));
  }

  get active(): boolean {
    return this.client !== null;
  }

  join(code: string): void {
    this.close();
    this.started = false;
    this.queue = [];
    this.applied = [];
    this.host.show(message('online.joining', () => this.leave(), { code }));
    this.client = new OnlineClient(code, (m) => this.onMsg(m), (up) => !up && this.started && this.host.say('online.reconnecting'), this.host.mySkin());
  }

  close(): void {
    this.client?.close();
    this.client = null;
    this.bar.hidden = true;
  }

  leave(): void {
    this.close();
    this.host.goTitle();
  }

  send(raw: unknown): void {
    this.client?.send(raw as never);
  }

  submit(uci: string): void {
    const app = this.host.app;
    if (app.busy || app.ended) return;
    app.board.locked = true;
    this.client?.send({ type: 'move', uci });
  }

  rematch(swap: boolean): void {
    this.client?.send({ type: 'rematch', swap });
    this.host.say('online.rematchWait');
  }

  /** Applies queued states one at a time; called again after each move settles. */
  drain(): void {
    const app = this.host.app;
    while (!app.busy && this.queue.length) {
      const s = this.queue.shift()!;
      const both = s.seats.w.taken && s.seats.b.taken;
      if (!this.started) {
        if (!both) {
          this.host.show(waitingRoom(this.client?.code ?? '', () => this.leave()));
          continue;
        }
        this.started = true;
        this.resync(s);
        continue;
      }
      const same = s.you === app.human && s.moves.length >= this.applied.length && this.applied.every((m, i) => s.moves[i] === m);
      if (!same) this.resync(s);
      else if (s.moves.length === this.applied.length + 1) {
        const uci = s.moves[s.moves.length - 1]!;
        this.applied.push(uci);
        if (!this.host.applyRemote(uci)) this.resync(s);
        this.queue.unshift({ ...s, moves: [...this.applied] });
        continue;
      } else if (s.moves.length > this.applied.length) this.resync(s);
      this.status(s);
    }
  }

  private resync(s: Extract<ServerMsg, { type: 'state' }>): void {
    this.applied = [...s.moves];
    this.host.startBoard(s.moves, s.you);
    this.bar.hidden = false;
    this.status(s);
  }

  private status(s: Extract<ServerMsg, { type: 'state' }>): void {
    const app = this.host.app;
    const them: Seat = s.you === 'w' ? 'b' : 'w';
    if (s.result && !app.ended && (s.result.reason === 'timeout' || s.result.reason === 'resign')) {
      const won = s.result.winner === s.you;
      this.host.endWith(s.result.reason === 'timeout' ? (won ? 'online.timeoutWin' : 'online.timeoutLose') : won ? 'online.resignWin' : 'online.resignLose');
    } else if (!s.result && s.seats[them].taken && !s.seats[them].online) {
      this.host.say('online.away');
    }
  }

  private onMsg(msg: ServerMsg): void {
    if (msg.type === 'state') {
      this.host.applySkins(msg.skins ?? {});
      this.queue.push(msg);
      this.drain();
    } else if (msg.type === 'reject') {
      this.lastReject = msg.reason;
      this.host.app.board.locked = false;
      this.host.app.board.resetMarks();
      this.host.say('online.rejected');
    } else if (msg.type === 'reaction') {
      toast(`react.${msg.id}` as StringKey);
    } else {
      const key: StringKey = msg.reason === 'full' ? 'online.full' : msg.reason === 'unknown' ? 'online.unknown' : 'online.replaced';
      this.close();
      this.host.show(message(key, () => this.host.goTitle()));
    }
  }
}

