# Decisions

- S1: G2 ignores the SVG namespace string `http://www.w3.org/2000/svg`; it is an identifier, not a network URL.
- S1: no ffmpeg on the build rig, so cries ship as `.ogg` only for now; fetch-assets transcodes to `.mp3` when ffmpeg exists.
- S1: captures apply instantly with a `battle.fainted` line until the S2 overlay; teaching caption keys added as `caption.*` in strings.
- S1: `__kc.stage()` reuses the start position, which already shows all 14 species with bishops on both colours.
- S1: `__kc.step()` only counts frames until S2 adds stepped animations; quiet move slides use WAAPI.
- S2: FxRecipe gains optional `actor(t)` for lunges, dashes and digging; the spec shape had no way to move the attacker.
- S2: harness adds `runBattle(a, d)` for the 98 pair sweep; `dumpState` adds `fxSig`, a hash of RNG draws used by effects.
- S2: Quick mode skips the evolution sequence (no overlay by definition); the text lines still show.
- S2: interim header toggles for Anim (Full/Quick/Off) and Sound until the S4 settings screen; not persisted yet.
- S2: cries play via `<audio>` with `preservesPitch=false` for the faint pitch drop; no `fetch` (G2).
- S3: no `stockfish.worker.ts` wrapper; the Stockfish lite build is itself a worker, loaded from `engine/` on the first level 2+ request.
- S3: interim header Mode button (Two Players, vs 4 levels), human always plays Red until S4 team select. Stockfish is GPL-3.0, combinable with AGPL-3.0 (GPLv3 §13).
- S3: T-2 (cold engine load to first bestmove at Gym Leader, 200 ms movetime) measured 492 ms headless on the dev Mac, so about 290 ms to load.
- S4: the boot gate's "board root" is now `#app .stage` (the splash shows first); the board itself is checked by every flow test.
- S4: interim header Mode/Anim/Sound buttons removed; the game header is Menu, turn, Take back. `?debug=1&start=two` skips the splash for tests.
- S4: T4 says the battle is about 1.9 s, but the §4.5 timings sum to 2.74 s (2.34 s without an effectiveness line); §4.5 ships, T4 is in the taste list.
- S4: G6 skips binary files (wasm, images, audio); the Stockfish wasm contains the byte run "aDs" by chance.
- fix: battle sprites are preloaded after the splash and the overlay inserts the decoded Image elements themselves (a fresh src refetches when the cache is off); wait capped by BATTLE.spriteWaitMs.
