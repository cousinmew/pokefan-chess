// SPDX-License-Identifier: AGPL-3.0-only
// window.__kc, installed only behind ?debug=1 (§6.1). bench/metrics cut in lean mode.
import { Chess } from 'chess.js';
import { BATTLE, type AiLevel } from '../config';
import { youngsterMove } from '../ai/engine';
import { rng } from '../game/rng';
import { fmt } from '../game/text';
import type { SpeciesId } from '../board/pieces';
import type { App, Mode } from '../main';

export function installHarness(app: App): void {
  const ov = app.overlay;
  let frames = 0;
  const step = (n: number, dt = 1 / 60) => {
    ov.manual = true;
    for (let i = 0; i < n; i++) ov.update(dt * 1000);
    frames += n;
    return { frames, ...ov.state() };
  };
  const kc = {
    seed: (n: number) => rng.seed(n),
    loadFen: (fen: string) => {
      app.restart(fen);
      return app.game.fen();
    },
    move: (uci: string) => {
      const out = app.playMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as never) || undefined);
      return out ? out.move.san : null;
    },
    /** Fixed timestep advance of overlay, evolution and quick effects. */
    step,
    /** Stages Pikachu vs Rattata with recipe `id` forced, parked at the start of the FX phase. */
    playFx: (id: string, seed = 1) => {
      ov.manual = true;
      rng.seed(seed);
      ov.sig = 0;
      void ov.battle('pikachu', 'rattata', id);
      ov.update(BATTLE.inMs + BATTLE.usedMs);
      return ov.state();
    },
    /** Runs one whole battle on the fixed timestep and returns the text it showed (pair sweep). */
    runBattle: (attacker: SpeciesId, defender: SpeciesId) => {
      ov.manual = true;
      ov.lines = [];
      void ov.battle(attacker, defender);
      let guard = 0;
      while (ov.running && guard++ < 1000) ov.update(1000 / 60);
      if (ov.running) throw new Error(`battle ${attacker} vs ${defender} did not finish`);
      return ov.lines.map((l) => fmt(l.key, l.vars));
    },
    setMode: (mode: Mode, level?: AiLevel, human?: 'w' | 'b') => app.setMode(mode, level, human),
    takeBack: () => app.takeBack(),
    /** Asks a level for a move in `fen` (default: the board) and checks it is legal. */
    aiMove: async (level: AiLevel = app.level, fen = app.game.fen()) => {
      const chess = new Chess(fen);
      const t0 = performance.now();
      const uci = level === 1 ? youngsterMove(chess, rng) : await app.engine.bestMove(fen, level);
      const ms = Math.round(performance.now() - t0);
      const legal = chess.moves({ verbose: true }).some((m) => m.from + m.to + (m.promotion ?? '') === uci);
      return { uci, ms, legal };
    },
    /** A seeded position: 10 to 40 random legal plies from the start, stopping before a game end. */
    randomPosition: (seed: number) => {
      rng.seed(seed);
      const chess = new Chess();
      const plies = 10 + Math.floor(rng.next() * 31);
      for (let i = 0; i < plies; i++) {
        const uci = youngsterMove(chess, rng);
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
        if (chess.isGameOver()) {
          chess.undo();
          break;
        }
      }
      return chess.fen();
    },
    /** The start position already shows all 14 species, bishops on both colours. */
    stage: () => app.restart(),
    dumpState: () =>
      JSON.stringify({
        schema: 1,
        fen: app.game.fen(),
        turn: app.game.turn(),
        mode: app.mode,
        level: app.mode === 'computer' ? app.level : null,
        aiFailed: app.aiFailed,
        engineLoaded: app.engine.loaded,
        settings: app.settings,
        overlay: ov.state(),
        fxSig: ov.sig,
        lastTextKeys: app.text.lastKeys,
        rngCalls: rng.calls(),
        ended: app.ended,
        excludes: ['idleBob'],
      }),
  };
  (window as unknown as { __kc: typeof kc }).__kc = kc;
}
