// SPDX-License-Identifier: AGPL-3.0-only
// Online game controller. The relay is the source of truth (V4): local moves are sent, and the board only
// changes when a `state` arrives. A capture plays its battle locally on both screens from the state diff.
import { CODE_RE, REACTION_COUNT, type Seat, type ServerMsg, type Skin, type Look } from '../../worker/src/protocol';
import { lookOf } from '../board/pieces';
import { currentLang, fmt, type StringKey } from '../game/text';
import { button, el, toast } from '../ui/dom';
import { message, waitingRoom } from '../ui/online';
import { OnlineClient } from './online';
import type { App } from '../main';

export const BACK_LINE_MS = 2000; // "Your friend is back!" stays this long, then your turn prompt (N6)
export const ASKED_MARK_MS = 5000; // how long a friend's rematch request waits for the end panel to light its Rematch (N5)

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
  /** Your story stage and trainer (§B18 items 5 and 8), sent when joining. */
  myLook(): Look;
  /** Applies both players' skins and looks, and redraws. */
  applySkins(skins: Partial<Record<Seat, Skin>>, looks: Partial<Record<Seat, Look>>): void;
}

type State = Extract<ServerMsg, { type: 'state' }>;
/** The online bar (N8, 14 Oct): the reactions and Give up while playing, Give up's question, a Menu while you wait for
 * a rematch, and nothing (its space kept, so the board does not jump) once the game is over. */
type BarMode = 'play' | 'ask' | 'wait' | 'over';
const other = (s: Seat): Seat => (s === 'w' ? 'b' : 'w');

export class OnlineGame {
  private client: OnlineClient | null = null;
  private queue: State[] = [];
  private started = false;
  private applied: string[] = [];
  /** The last state shown, to see what changed (the friend back or gone, a rematch asked). */
  private last: State | null = null;
  /** You asked for a rematch and wait for your friend's answer. */
  private waiting = false;
  /** What the bar holds ('over' keeps the play row, hidden). */
  private mode: Exclude<BarMode, 'over'> | null = null;
  private backTimer = 0;
  private askedMark = 0;
  readonly bar: HTMLElement;
  lastReject: string | null = null;

  constructor(private readonly host: OnlineHost) {
    this.bar = el('div', 'reactions');
    this.bar.hidden = true;
    this.barMode('play');
  }

  get active(): boolean {
    return this.client !== null;
  }

  /** `making`: the player who made the room, whose screen already says "Making a room..." (N9). */
  join(code: string, making = false): void {
    this.close();
    // Room codes never use I or O: such a code cannot exist, so say so instead of dialling the relay.
    if (!CODE_RE.test(code)) return this.host.show(message('online.unknown', () => this.host.goTitle()));
    this.started = false;
    this.queue = [];
    this.applied = [];
    if (!making) this.host.show(message('online.joining', () => this.leave(), { code }));
    this.client = new OnlineClient(code, (m) => this.onMsg(m), (up) => !up && this.started && this.host.say('online.reconnecting'), this.host.mySkin(), this.host.myLook(), () => {
      this.client = null;
      this.host.show(message('relay.down', () => this.host.goTitle()));
    });
  }

  close(): void {
    this.client?.close();
    this.client = null;
    this.bar.hidden = true;
    this.last = null;
    this.waiting = false;
    window.clearTimeout(this.backTimer);
    this.askedMark++;
  }

  leave(): void {
    this.close();
    this.host.goTitle();
  }

  send(raw: unknown): void {
    this.client?.send(raw as never);
  }

  /** Your move is acknowledged at once (N7, 14 Oct): the selection and dots go and the piece shows as sent until the
   * relay's state lands it; a reject (onMsg) or a closed link puts it back. */
  submit(uci: string): void {
    const app = this.host.app;
    if (app.busy || app.ended) return;
    app.board.locked = true;
    app.board.clearSelection();
    app.board.squareEl(uci.slice(0, 2))?.querySelector('.piece, .classic')?.classList.add('pending');
    if (this.client?.send({ type: 'move', uci })) return;
    app.board.locked = false;
    app.board.clearSelection();
    this.host.say('online.reconnecting');
  }

  /** Asks for a rematch. When your friend asked first the relay starts it at once: no waiting line (N5). */
  rematch(swap: boolean): void {
    const s = this.last;
    this.client?.send({ type: 'rematch', swap });
    if (s?.result && s.rematch.includes(other(s.you))) return;
    this.waiting = true;
    this.host.say('online.rematchWait');
    this.barMode('wait');
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

  private resync(s: State): void {
    this.applied = [...s.moves];
    this.waiting = false;
    window.clearTimeout(this.backTimer);
    this.host.startBoard(s.moves, s.you);
    this.bar.hidden = false;
    this.barMode('play');
    this.status(s);
  }

  private status(s: State): void {
    const app = this.host.app;
    const them = other(s.you);
    const was = this.last?.seats[them];
    this.last = s;
    const back = !!was?.taken && !was.online && s.seats[them].online;
    const gone = !!was?.online && s.seats[them].taken && !s.seats[them].online;
    if (s.result && !app.ended && (s.result.reason === 'timeout' || s.result.reason === 'resign')) {
      const won = s.result.winner === s.you;
      this.host.endWith(s.result.reason === 'timeout' ? (won ? 'online.timeoutWin' : 'online.timeoutLose') : won ? 'online.resignWin' : 'online.resignLose');
    } else if (!s.result && s.seats[them].taken && !s.seats[them].online) {
      this.host.say('online.away');
    } else if (!s.result && back) this.friendBack(lookOf(app.game.turn()) === 'w' ? 'turn.red' : 'turn.rocket');
    if (!s.result) {
      if (this.mode !== 'ask' || this.bar.classList.contains('net-over')) this.barMode('play');
      return;
    }
    // The game is over: the reactions and Give up go (N8), a Menu stays while you wait for a rematch (N5).
    this.barMode(this.waiting ? 'wait' : 'over');
    if (gone) this.host.say('online.left');
    else if (back && this.waiting) this.friendBack('online.rematchWait');
    else if (!this.waiting && s.rematch.includes(them) && !s.rematch.includes(s.you)) this.friendAsks(s);
  }

  /** Your friend is back (N6): said at once, then `then` (the turn prompt, or the rematch wait) unless something else
   * was said meanwhile. */
  private friendBack(then: StringKey): void {
    const line = fmt('online.back');
    this.host.say('online.back');
    window.clearTimeout(this.backTimer);
    this.backTimer = window.setTimeout(() => this.host.app.text.el.querySelector('.tb-main')?.textContent === line && this.host.say(then), BACK_LINE_MS);
  }

  /** Your friend asked for a rematch (N5): said in your text box, and the end panel's Rematch lights up (once it is
   * there: after a mate it comes when the end hold is over). */
  private friendAsks(s: State): void {
    this.host.say(s.swap ? 'online.rematchAskSwap' : 'online.rematchAsk');
    const n = ++this.askedMark;
    const until = performance.now() + ASKED_MARK_MS;
    const mark = () => {
      if (n !== this.askedMark) return;
      const b = document.querySelector('[data-testid="rematch"]');
      if (b) b.classList.add('asked');
      else if (performance.now() < until) window.requestAnimationFrame(mark);
    };
    mark();
  }

  /** Built again when the mode or the language changes; a button that had the focus hands it to the new row (Give up's
   * question to No, the safe answer). */
  private barMode(mode: BarMode): void {
    this.bar.classList.toggle('net-over', mode === 'over');
    const shown = mode === 'over' ? 'play' : mode;
    if (shown === this.mode && this.bar.dataset.lang === currentLang() && this.bar.childElementCount) return;
    this.mode = shown;
    this.bar.dataset.lang = currentLang();
    const had = this.bar.contains(document.activeElement);
    const [row, focus] = this.row(shown);
    this.bar.replaceChildren(...row);
    if (had) focus.focus();
  }

  /** The bar's buttons for a mode, and the one that takes the focus. */
  private row(mode: Exclude<BarMode, 'over'>): [HTMLElement[], HTMLElement] {
    if (mode === 'ask') {
      const q = el('span', 'net-ask', 'online.resignAsk');
      q.dataset.testid = 'resign-ask';
      const no = button('online.resignNo', () => this.barMode('play'), 'resign-no');
      return [[q, button('online.resignYes', () => (this.client?.send({ type: 'resign' }), this.barMode('play')), 'resign-yes', 'resign'), no], no];
    }
    if (mode === 'wait') {
      const menu = button('end.menu', () => this.leave(), 'online-menu');
      return [[menu], menu];
    }
    const resign = button('online.resign', () => this.barMode('ask'), 'resign', 'resign');
    return [[...Array.from({ length: REACTION_COUNT }, (_, i) => button(`react.${i}` as StringKey, () => this.react(i), `react-${i}`)), resign], resign];
  }

  /** A reaction answers the sender too (N8): "Sent!" at once, as the friend's screen shows it. */
  private react(id: number): void {
    if (this.client?.send({ type: 'reaction', id })) toast('react.sent');
  }

  private onMsg(msg: ServerMsg): void {
    if (msg.type === 'state') {
      this.host.applySkins(msg.skins ?? {}, msg.looks ?? {});
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
