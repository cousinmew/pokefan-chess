// SPDX-License-Identifier: AGPL-3.0-only
// Computer opponent: Youngster (seeded random) and Stockfish lite in a Web Worker, loaded lazily (§4.6). On a cold
// phone the 1.79 MB engine took longer to arrive than AI_TIMEOUT_MS, which counted the download, so the Champion's
// first reply, a drill's and a tall grass review's came from the fallback (fix, 14 Oct): warmEngine() starts the load
// ahead of need (a puzzle starts, a battle place is tapped on the map) and Engine adopts it; the load has its own cap
// and AI_TIMEOUT_MS counts only the search. A search timeout drops the worker; a load is never cut by it. One request
// at a time: the worker answers in order and a 'bestmove' line names no position, so requests made while it loaded
// (a miss review left for the next puzzle's, a review left for a game) took each other's moves. Now a search starts
// only once the one before is out, and an older request still waiting gives way to a newer one (its asker has gone).
import type { Chess } from 'chess.js';
import { AI_LEVELS, AI_TIMEOUT_MS, ENGINE_URL, YOUNGSTER_CAPTURE_BIAS, type AiLevel } from '../config';
import type { Rng } from '../game/rng';

export const ENGINE_LOAD_MS = 30_000; // the engine's first load (download, compile, uci, isready) may take this long before the fallback

/** Seeded random legal move, preferring a capture half the time when one exists. */
export function youngsterMove(chess: Chess, rng: Rng): string {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) throw new Error('youngster asked to move with no legal moves');
  const caps = moves.filter((m) => m.captured);
  const pool = caps.length && rng.next() < YOUNGSTER_CAPTURE_BIAS ? caps : moves;
  const m = pool[Math.floor(rng.next() * pool.length)] ?? moves[0]!;
  return m.from + m.to + (m.promotion ?? '');
}

/** One Stockfish worker: `ready` settles once it answered isready, or at once on a load error. */
interface Boot {
  worker: Worker;
  ready: Promise<void>;
  /** Where its next line goes (a handshake step or a search). */
  listen: ((line: string) => void) | null;
  /** What a worker error rejects: the load, then the search running. */
  fail: ((err: Error) => void) | null;
  failed: boolean;
}

/** Sends `cmd` and calls `then` on the first line starting with `token`. */
function ask(b: Boot, cmd: string, token: string, then: () => void): void {
  b.listen = (line) => {
    if (!line.startsWith(token)) return;
    b.listen = null;
    then();
  };
  b.worker.postMessage(cmd);
}

function boot(): Boot {
  const worker = new Worker(ENGINE_URL);
  const b: Boot = { worker, ready: Promise.resolve(), listen: null, fail: null, failed: false };
  b.ready = new Promise<void>((resolve, reject) => {
    b.fail = reject;
    worker.onmessage = (e: MessageEvent) => b.listen?.(String(e.data));
    worker.onerror = (e) => {
      e.preventDefault();
      b.failed = true;
      worker.terminate();
      b.fail?.(new Error(`engine worker failed: ${e.message || 'load error'}`));
    };
    ask(b, 'uci', 'uciok', () => ask(b, 'isready', 'readyok', resolve));
  });
  b.ready.catch(() => undefined); // a warm load nobody waits on yet: whoever awaits it handles the error
  return b;
}

/** The page's engine worker, warm or in use; one at a time. */
let shared: Boot | null = null;
/** The search on that worker, settled once its 'bestmove' is in (or it failed): the next search waits for it. */
let searching: Promise<unknown> = Promise.resolve();
/** Rejects the request still waiting for the load or for the search before it (a newer request replaces it). */
let giveWay: (() => void) | null = null;
const live = (): Boot | null => (shared && !shared.failed ? shared : null);

/** Starts the engine's first load now, once (a puzzle starts, a place with battles is tapped): by the time a review or
 * a game asks for a move, the download is done or under way. A load that failed is started again. */
export function warmEngine(): void {
  if (!live()) shared = boot();
}

/** A newer request came while this one waited: its asker left (the next puzzle, a game), so it gets no move. */
class Superseded extends Error {
  constructor() {
    super('engine request superseded');
  }
}

export class Engine {
  private boot: Boot | null = null;

  get loaded(): boolean {
    return this.boot !== null;
  }

  /** Best move as UCI for a Stockfish level. Rejects on a worker error, after ENGINE_LOAD_MS of loading, after
   * AI_TIMEOUT_MS of searching, or when a newer request comes before this one's search started. */
  async bestMove(fen: string, level: AiLevel): Promise<string> {
    const cfg = AI_LEVELS.find((l) => l.id === level);
    if (!cfg || cfg.skill === null) throw new Error(`level ${level} has no engine`);
    giveWay?.();
    let mine!: () => void;
    const gone = new Promise<never>((_, reject) => (mine = () => reject(new Superseded())));
    gone.catch(() => undefined);
    giveWay = mine;
    try {
      await Promise.race([searching, gone]);
      const b = this.adopt();
      await this.within(b.ready, ENGINE_LOAD_MS, 'engine load timeout', gone);
      // Still the newest (checked in the same task that posts the search, so no other request posts in between).
      if (giveWay !== mine) throw new Superseded();
      const run = this.within(this.search(b, fen, cfg.skill, cfg.movetimeMs), AI_TIMEOUT_MS, 'engine timeout');
      searching = run.catch(() => undefined);
      return await run;
    } finally {
      if (giveWay === mine) giveWay = null;
    }
  }

  dispose(): void {
    const b = this.boot;
    this.boot = null;
    if (!b) return;
    const fail = b.fail;
    b.listen = null;
    b.fail = null;
    b.worker.terminate();
    if (shared === b) shared = null;
    fail?.(new Error('engine stopped')); // whoever waits on this worker (its load or its search) hears it now
  }

  /** The warm worker, or a new one when there is none or it failed. */
  private adopt(): Boot {
    if (this.boot && !this.boot.failed) return this.boot;
    if (!live()) shared = boot();
    this.boot = shared!;
    return this.boot;
  }

  /** `p`, or a rejection after `ms` (either failure drops the worker, so the next move starts a fresh one), or when
   * `gone` rejects first (a newer request: the worker stays for it, and this wait leaves no timer behind). */
  private async within<T>(p: Promise<T>, ms: number, why: string, gone?: Promise<never>): Promise<T> {
    let timer = 0;
    const late = new Promise<never>((_, rej) => (timer = window.setTimeout(() => rej(new Error(why)), ms)));
    try {
      return await Promise.race(gone ? [p, late, gone] : [p, late]);
    } catch (err) {
      if (!(err instanceof Superseded)) this.dispose();
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private search(b: Boot, fen: string, skill: number, movetime: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      b.fail = reject;
      b.worker.postMessage(`setoption name Skill Level value ${skill}`);
      b.worker.postMessage(`position fen ${fen}`);
      b.listen = (line) => {
        const m = /^bestmove (\S+)/.exec(line);
        if (!m) return;
        b.listen = null;
        if (m[1] === '(none)') reject(new Error('engine found no move'));
        else resolve(m[1]!);
      };
      b.worker.postMessage(`go movetime ${movetime}`);
    });
  }
}
