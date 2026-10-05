// SPDX-License-Identifier: AGPL-3.0-only
// window.__kc, installed only behind ?debug=1 (§6.1). bench/metrics cut in lean mode.
import { rng } from '../game/rng';
import type { App } from '../main';

export function installHarness(app: App): void {
  let frames = 0;
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
    /** Fixed timestep advance. No stepped animations exist until the battle overlay (S2). */
    step: (n: number, dt = 1 / 60) => {
      frames += n;
      return { frames, t: Math.round(frames * dt * 1000) / 1000 };
    },
    /** The start position already shows all 14 species, bishops on both colours. */
    stage: () => app.restart(),
    dumpState: () =>
      JSON.stringify({
        schema: 1,
        fen: app.game.fen(),
        turn: app.game.turn(),
        mode: app.mode,
        level: null,
        settings: app.settings,
        overlay: { phase: 'none', t: 0 },
        lastTextKeys: app.text.lastKeys,
        rngCalls: rng.calls(),
        ended: app.ended,
        excludes: ['idleBob'],
      }),
  };
  (window as unknown as { __kc: typeof kc }).__kc = kc;
}
