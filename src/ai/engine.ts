// SPDX-License-Identifier: AGPL-3.0-only
// Computer opponent: Youngster (seeded random) and Stockfish lite in a Web Worker, loaded lazily (§4.6). On a cold
// phone the 1.79 MB engine took longer to arrive than AI_TIMEOUT_MS, which counted the download, so the Champion's
// first reply, a drill's and a tall grass review's came from the fallback (fix, 14 Oct): warmEngine() starts the load
// ahead of need (a puzzle starts, a battle place is tapped on the map) and Engine adopts it; the load has its own cap
// and AI_TIMEOUT_MS counts only the search. A search timeout drops the worker; a load is never cut by it.
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
const live = (): Boot | null => (shared && !shared.failed ? shared : null);

/** Starts the engine's first load now, once (a puzzle starts, a place with battles is tapped): by the time a review or
 * a game asks for a move, the download is done or under way. A load that failed is started again. */
export function warmEngine(): void {
  if (!live()) shared = boot();
}

export class Engine {
  private boot: Boot | null = null;

  get loaded(): boolean {
    return this.boot !== null;
  }

  /** Best move as UCI for a Stockfish level. Rejects on a worker error, after ENGINE_LOAD_MS of loading, or after
   * AI_TIMEOUT_MS of searching. */
  async bestMove(fen: string, level: AiLevel): Promise<string> {
    const cfg = AI_LEVELS.find((l) => l.id === level);
    if (!cfg || cfg.skill === null) throw new Error(`level ${level} has no engine`);
    const b = this.adopt();
    await this.within(b.ready, ENGINE_LOAD_MS, 'engine load timeout');
    return this.within(this.search(b, fen, cfg.skill, cfg.movetimeMs), AI_TIMEOUT_MS, 'engine timeout');
  }

  dispose(): void {
    const b = this.boot;
    this.boot = null;
    if (!b) return;
    b.listen = null;
    b.fail = null;
    b.worker.terminate();
    if (shared === b) shared = null;
  }

  /** The warm worker, or a new one when there is none or it failed. */
  private adopt(): Boot {
    if (this.boot && !this.boot.failed) return this.boot;
    if (!live()) shared = boot();
    this.boot = shared!;
    return this.boot;
  }

  /** `p`, or a rejection after `ms`; either failure drops the worker, so the next move starts a fresh one. */
  private async within<T>(p: Promise<T>, ms: number, why: string): Promise<T> {
    let timer = 0;
    try {
      return await Promise.race([p, new Promise<never>((_, rej) => (timer = window.setTimeout(() => rej(new Error(why)), ms)))]);
    } catch (err) {
      this.dispose();
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
