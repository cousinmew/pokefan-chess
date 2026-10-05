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
