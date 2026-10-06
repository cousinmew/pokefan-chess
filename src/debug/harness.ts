// SPDX-License-Identifier: AGPL-3.0-only
// window.__kc, installed only behind ?debug=1 (§6.1). bench/metrics cut in lean mode.
import { Chess } from 'chess.js';
import { BATTLE, type AiLevel } from '../config';
import { youngsterMove } from '../ai/engine';
import { preloadSettled } from '../battle/sprites';
import { music } from '../audio/music';
import { FX } from '../battle/fxRecipes';
import roster from '../data/roster.gen1.json';
import { rng } from '../game/rng';
import { fmt } from '../game/text';
import { SPECIES, type SpeciesId } from '../board/pieces';
import { DEX, loadCampaign } from '../campaign/kanto';
import { PLACES } from '../campaign/journey';
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
    /** Stages a battle (default Pikachu vs Rattata) with recipe `id` forced, parked at the start of the FX phase. */
    playFx: (id: string, seed = 1, attacker: SpeciesId = 'pikachu', defender: SpeciesId = 'rattata') => {
      ov.manual = true;
      rng.seed(seed);
      ov.sig = 0;
      void ov.battle(attacker, defender, id);
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
    /** FX gallery: plays all 14 effects in sequence in real time, each with a species that uses it. */
    fxGallery: async () => {
      ov.manual = false;
      const sp = roster.species as Record<string, { move: string; fallback?: string }>;
      const ids = Object.keys(sp) as SpeciesId[];
      for (const id of Object.keys(FX)) {
        const fx = (m?: string) => (m ? (roster.moves as Record<string, { fx: string }>)[m]?.fx : undefined);
        const attacker = ids.find((s) => fx(sp[s]!.move) === id || fx(sp[s]!.fallback) === id) ?? 'pikachu';
        const red = Object.values(roster.teams.red.pieces).flatMap((v) => (typeof v === 'string' ? [v] : [v.light, v.dark]));
        const defender = (red.includes(attacker) ? 'rattata' : 'eevee') as SpeciesId;
        await ov.battle(attacker, defender, id);
      }
      return Object.keys(FX).length;
    },
    /** Kanto: the saved campaign, reseeding encounter rolls, and every species for the sprite sheet. */
    campaign: () => loadCampaign(),
    seedEncounters: (n: number) => app.campaignRng.seed(n),
    species: () => Object.values(SPECIES).map((s) => [s.dex, s.name] as const).sort((a, b) => a[0] - b[0]),
    /** Plain puzzles (Training without a route; the title menu now opens the Kanto Journey). */
    openPuzzles: () => void app.puzzle.start(null),
    /** Kanto Journey: adds catches straight into the save (tests only), and reads the live campaign. */
    grant: (id: string, n = 1, shiny = false) => app.journey.grant(id, n, shiny),
    journey: () => app.journey.campaign,
    dexIds: () => DEX,
    /** Opens a Journey place directly, locked or not (tests walk gyms and the Elite Four this way). */
    enterPlace: (id: string) => {
      const p = PLACES.find((x) => x.id === id);
      if (!p) throw new Error(`no place ${id}`);
      app.journey.enterPlace(p);
    },
    /** Puzzle player state for tests: the move it expects next and its phase. */
    puzzleAnswer: () => app.puzzle.run?.expected() ?? null,
    puzzlePhase: () => app.puzzle.phase,
    /** True once every background sprite preload has decoded. */
    spritesReady: () => preloadSettled(),
    /** Sends a raw message to the relay (illegal move gate) and reads the last rejection. */
    netSend: (msg: unknown) => app.online.send(msg),
    lastReject: () => app.online.lastReject,
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
        music: music.current,
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
  if (new URLSearchParams(location.search).get('gallery') === 'fx') window.setTimeout(() => void kc.fxGallery(), 300);
}
