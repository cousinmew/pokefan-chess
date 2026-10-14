// SPDX-License-Identifier: AGPL-3.0-only
// The engine's first load (fix, 14 Oct): on a cold phone the 1.79 MB Stockfish took longer than AI_TIMEOUT_MS to
// arrive, and the timeout counted the download, so the Champion's first reply, a drill's and a tall grass review's
// came from the fallback. warmEngine() starts the worker ahead (Engine adopts it); the load has its own cap
// (ENGINE_LOAD_MS) and AI_TIMEOUT_MS counts only the search; a load error still rejects at once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_TIMEOUT_MS } from '../../src/config';

/** How the fake Stockfish behaves: when its script has arrived, how long a search takes, or a load error. */
interface Script {
  loadMs: number;
  searchMs: number;
  errorAt?: number;
}
let script: Script = { loadMs: 0, searchMs: 200 };
/** The fake's best move in each position (a real worker answers the position it was given; e2e4 elsewhere). */
const BEST: Record<string, string> = {};

class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  terminated = false;
  readonly born = Date.now();
  /** Searches started, by position. */
  readonly searched: string[] = [];
  /** A real (single threaded) worker runs its messages in order: nothing before the script arrived, and a search
   * holds every message after it until its bestmove is out. */
  private free: number;
  private position = '';
  constructor(readonly url: string) {
    FakeWorker.made.push(this);
    this.free = this.born + script.loadMs;
    if (script.errorAt !== undefined) setTimeout(() => !this.terminated && this.onerror?.({ message: 'load error', preventDefault: () => undefined }), script.errorAt);
  }
  postMessage(cmd: string): void {
    if (script.errorAt !== undefined) return;
    const at = Math.max(Date.now(), this.free);
    if (cmd === 'uci') this.later(at, () => this.reply('uciok'));
    else if (cmd === 'isready') this.later(at, () => this.reply('readyok'));
    else if (cmd.startsWith('position fen ')) this.later(at, () => (this.position = cmd.slice(13)));
    else if (cmd.startsWith('go ')) {
      this.free = at + script.searchMs;
      this.later(at, () => this.searched.push(this.position));
      this.later(this.free, () => this.reply(`bestmove ${BEST[this.position] ?? 'e2e4'}`));
    }
  }
  terminate(): void {
    this.terminated = true;
  }
  private later(at: number, fn: () => void): void {
    setTimeout(() => !this.terminated && fn(), at - Date.now());
  }
  private reply(line: string): void {
    this.onmessage?.({ data: line });
  }
}

const g = globalThis as unknown as Record<string, unknown>;
g.Worker = FakeWorker;
g.window = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: number) => clearTimeout(id) };

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

/** Fresh module state (the warm worker lives at module level). */
async function engine() {
  vi.resetModules();
  return import('../../src/ai/engine');
}

/** Settles a promise into what happened and when (fake time). */
function watch<T>(p: Promise<T>): { result: () => { ok?: T; err?: string; at?: number } } {
  const t0 = Date.now();
  const out: { ok?: T; err?: string; at?: number } = {};
  p.then(
    (v) => Object.assign(out, { ok: v, at: Date.now() - t0 }),
    (e: unknown) => Object.assign(out, { err: e instanceof Error ? e.message : String(e), at: Date.now() - t0 }),
  );
  return { result: () => out };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  FakeWorker.made = [];
  script = { loadMs: 0, searchMs: 200 };
});
afterEach(() => vi.useRealTimers());

describe('Engine.bestMove', () => {
  it('a 6 s load, then a 0.2 s search: the reply comes from the engine (the timeout counts only the search)', async () => {
    const { Engine } = await engine();
    script = { loadMs: 6000, searchMs: 200 };
    const w = watch(new Engine().bestMove(FEN, 2));
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS + 10);
    expect(w.result().err).toBeUndefined(); // the base build gave up here: "engine timeout"
    await vi.advanceTimersByTimeAsync(2000);
    expect(w.result().ok).toBe('e2e4');
    expect(w.result().at).toBeGreaterThanOrEqual(6200);
    expect(FakeWorker.made).toHaveLength(1);
  });

  it('a 6 s search rejects at AI_TIMEOUT_MS, and the worker goes', async () => {
    const { Engine } = await engine();
    script = { loadMs: 100, searchMs: 6000 };
    const e = new Engine();
    const w = watch(e.bestMove(FEN, 2));
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS + 200);
    expect(w.result().err).toBe('engine timeout');
    expect(w.result().at).toBeLessThanOrEqual(AI_TIMEOUT_MS + 150);
    expect(w.result().at).toBeGreaterThanOrEqual(AI_TIMEOUT_MS);
    expect(FakeWorker.made[0]!.terminated).toBe(true);
    expect(e.loaded).toBe(false);
  });

  it('a load error rejects at once, and the next move starts a new worker', async () => {
    const { Engine } = await engine();
    script = { loadMs: 0, searchMs: 200, errorAt: 100 };
    const e = new Engine();
    const w = watch(e.bestMove(FEN, 2));
    await vi.advanceTimersByTimeAsync(150);
    expect(w.result().err).toMatch(/engine worker failed/);
    script = { loadMs: 50, searchMs: 200 };
    const again = watch(e.bestMove(FEN, 2));
    await vi.advanceTimersByTimeAsync(400);
    expect(again.result().ok).toBe('e2e4');
    expect(FakeWorker.made).toHaveLength(2);
  });

  it('a load that never ends gives up at ENGINE_LOAD_MS, not at AI_TIMEOUT_MS', async () => {
    const { Engine, ENGINE_LOAD_MS } = await engine();
    script = { loadMs: 10 * 60_000, searchMs: 200 };
    const w = watch(new Engine().bestMove(FEN, 2));
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_MS - 100);
    expect(w.result().err).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    expect(w.result().err).toBe('engine load timeout');
    expect(FakeWorker.made[0]!.terminated).toBe(true);
  });
});

describe('warmEngine()', () => {
  it('starts the worker once, ahead of the first move; Engine adopts it', async () => {
    const { Engine, warmEngine } = await engine();
    script = { loadMs: 6000, searchMs: 200 };
    warmEngine();
    warmEngine();
    expect(FakeWorker.made).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000); // the player reads the story, the card and the goal meanwhile
    const w = watch(new Engine().bestMove(FEN, 2));
    await vi.advanceTimersByTimeAsync(1300);
    expect(w.result().ok).toBe('e2e4');
    expect(w.result().at).toBeLessThanOrEqual(1300);
    expect(FakeWorker.made).toHaveLength(1);
  });

  it('a warm load that failed (a network blip while the player read) is never adopted: the move loads again', async () => {
    const { Engine, warmEngine } = await engine();
    script = { loadMs: 0, searchMs: 200, errorAt: 50 };
    warmEngine();
    await vi.advanceTimersByTimeAsync(100); // its error is handled: no unhandled rejection fails this test
    expect(FakeWorker.made[0]!.terminated).toBe(true);
    script = { loadMs: 0, searchMs: 200 };
    const w = watch(new Engine().bestMove(FEN, 2));
    await vi.advanceTimersByTimeAsync(300);
    expect(w.result().ok).toBe('e2e4');
    expect(FakeWorker.made).toHaveLength(2);
  });
});

describe('one request at a time (fix, 14 Oct: requests made while the engine loaded took each other\'s answers)', () => {
  const ONE = '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 b - - 1 49';
  const TWO = 'r4rk1/1p4pp/p7/P1p1p1Q1/2Pp4/3P2R1/2P1B1PP/5q1K b - - 7 29';
  beforeEach(() => {
    BEST[ONE] = 'e2e1';
    BEST[TWO] = 'f1f3';
  });

  it('a second request during the load: the first gives way at once, the second gets its own position\'s move', async () => {
    const { Engine } = await engine();
    script = { loadMs: 6000, searchMs: 200 };
    const e = new Engine();
    const first = watch(e.bestMove(ONE, 4)); // a miss review the player left ("Try a new one")
    await vi.advanceTimersByTimeAsync(1000);
    const second = watch(e.bestMove(TWO, 4)); // the next puzzle's miss review
    await vi.advanceTimersByTimeAsync(6000);
    expect(second.result().ok).toBe('f1f3'); // the earlier build: e2e1, the first position's move ("Invalid move")
    expect(first.result()).toMatchObject({ err: expect.stringMatching(/superseded/), at: 1000 });
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0]!.searched).toEqual([TWO]);
    expect(e.loaded).toBe(true);
  });

  it('a request made during a search waits for it: each gets its own position\'s move, on the same worker', async () => {
    const { Engine } = await engine();
    script = { loadMs: 0, searchMs: 1200 };
    const e = new Engine();
    const first = watch(e.bestMove(ONE, 4));
    await vi.advanceTimersByTimeAsync(500);
    const second = watch(e.bestMove(TWO, 4));
    await vi.advanceTimersByTimeAsync(3000);
    expect(first.result().ok).toBe('e2e1');
    expect(second.result().ok).toBe('f1f3');
    expect(second.result().at).toBeGreaterThanOrEqual(1900); // its own search starts when the first's is out
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0]!.terminated).toBe(false);
  });

  it('of three, the one waiting for a search gives way to the newest; the search under way still answers its own', async () => {
    const { Engine } = await engine();
    script = { loadMs: 0, searchMs: 1200 };
    const e = new Engine();
    const first = watch(e.bestMove(ONE, 4));
    await vi.advanceTimersByTimeAsync(300);
    const second = watch(e.bestMove(TWO, 4));
    await vi.advanceTimersByTimeAsync(300);
    const third = watch(e.bestMove(FEN, 4));
    await vi.advanceTimersByTimeAsync(10);
    expect(second.result().err).toMatch(/superseded/);
    await vi.advanceTimersByTimeAsync(3000);
    expect(first.result().ok).toBe('e2e1');
    expect(third.result().ok).toBe('e2e4');
    expect(FakeWorker.made[0]!.searched).toEqual([ONE, FEN]);
  });

  it('a request that gave way leaves no timer behind: the newer one keeps the worker past the older one\'s load cap', async () => {
    const { Engine, ENGINE_LOAD_MS } = await engine();
    script = { loadMs: ENGINE_LOAD_MS + 2000, searchMs: 200 };
    const e = new Engine();
    const first = watch(e.bestMove(ONE, 4));
    await vi.advanceTimersByTimeAsync(5000);
    const second = watch(e.bestMove(TWO, 4));
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_MS - 5000 + 100); // the first one's cap would have dropped the worker
    expect(first.result().err).toMatch(/superseded/);
    expect(FakeWorker.made[0]!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2500);
    expect(second.result().ok).toBe('f1f3');
  });
});
