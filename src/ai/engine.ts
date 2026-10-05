// SPDX-License-Identifier: AGPL-3.0-only
// Computer opponent: Youngster (seeded random) and Stockfish lite in a Web Worker, loaded lazily (§4.6).
import type { Chess } from 'chess.js';
import { AI_LEVELS, AI_TIMEOUT_MS, ENGINE_URL, YOUNGSTER_CAPTURE_BIAS, type AiLevel } from '../config';
import type { Rng } from '../game/rng';

/** Seeded random legal move, preferring a capture half the time when one exists. */
export function youngsterMove(chess: Chess, rng: Rng): string {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) throw new Error('youngster asked to move with no legal moves');
  const caps = moves.filter((m) => m.captured);
  const pool = caps.length && rng.next() < YOUNGSTER_CAPTURE_BIAS ? caps : moves;
  const m = pool[Math.floor(rng.next() * pool.length)] ?? moves[0]!;
  return m.from + m.to + (m.promotion ?? '');
}

export class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private listener: ((line: string) => void) | null = null;
  private failWith: ((err: Error) => void) | null = null;

  get loaded(): boolean {
    return this.worker !== null;
  }

  /** Best move as UCI for a Stockfish level. Rejects on worker error or after AI_TIMEOUT_MS. */
  async bestMove(fen: string, level: AiLevel): Promise<string> {
    const cfg = AI_LEVELS.find((l) => l.id === level);
    if (!cfg || cfg.skill === null) throw new Error(`level ${level} has no engine`);
    let timer = 0;
    const timeout = new Promise<never>((_, rej) => {
      timer = window.setTimeout(() => rej(new Error('engine timeout')), AI_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.search(fen, cfg.skill, cfg.movetimeMs), timeout]);
    } catch (err) {
      this.dispose();
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.listener = null;
  }

  private init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const w = new Worker(ENGINE_URL);
      this.worker = w;
      this.failWith = reject;
      w.onmessage = (e: MessageEvent) => this.listener?.(String(e.data));
      w.onerror = (e) => {
        e.preventDefault();
        this.failWith?.(new Error(`engine worker failed: ${e.message || 'load error'}`));
      };
      this.expect('uciok', () => this.expect('readyok', resolve, 'isready'), 'uci');
    });
    return this.ready;
  }

  private async search(fen: string, skill: number, movetime: number): Promise<string> {
    await this.init();
    return new Promise<string>((resolve, reject) => {
      this.failWith = reject;
      this.send(`setoption name Skill Level value ${skill}`);
      this.send(`position fen ${fen}`);
      this.listener = (line) => {
        const m = /^bestmove (\S+)/.exec(line);
        if (!m) return;
        this.listener = null;
        if (m[1] === '(none)') reject(new Error('engine found no move'));
        else resolve(m[1]!);
      };
      this.send(`go movetime ${movetime}`);
    });
  }

  private expect(token: string, then: () => void, cmd: string): void {
    this.listener = (line) => {
      if (!line.startsWith(token)) return;
      this.listener = null;
      then();
    };
    this.send(cmd);
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }
}
