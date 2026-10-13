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

class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  terminated = false;
  readonly born = Date.now();
  constructor(readonly url: string) {
    FakeWorker.made.push(this);
    if (script.errorAt !== undefined) setTimeout(() => !this.terminated && this.onerror?.({ message: 'load error', preventDefault: () => undefined }), script.errorAt);
  }
  postMessage(cmd: string): void {
    // Messages wait until the script has arrived, as in a real worker.
    const at = Math.max(0, this.born + script.loadMs - Date.now());
    if (script.errorAt !== undefined) return;
    if (cmd === 'uci') setTimeout(() => this.reply('uciok'), at);
    else if (cmd === 'isready') setTimeout(() => this.reply('readyok'), at);
    else if (cmd.startsWith('go ')) setTimeout(() => this.reply('bestmove e2e4'), at + script.searchMs);
  }
  terminate(): void {
    this.terminated = true;
  }
  private reply(line: string): void {
    if (!this.terminated) this.onmessage?.({ data: line });
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
