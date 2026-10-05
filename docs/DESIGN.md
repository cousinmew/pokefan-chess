# PokeFan Chess: Red vs Rocket. Game Design Document and Build Contract v1.1

Title: **PokeFan Chess**, subtitle **Red vs Rocket** (repo `pokefan-chess`). Prepared 5 October 2026. Credited publicly to `Cousin Mew` only.

This file has two halves. **Part I** is the design: what the game is, who is on each team, and what every rule feels like. **Part II** is the build contract Claude Code executes, phase by phase, until the game is deployed at a public URL and is cheap to iterate on. Part II is written so an agent can run it without a human in the loop.

> Brand rule for this file and everything built from it: no studio or company name appears anywhere in the repo, the build, the commit history, the README or the deployed site. See D2 and the grep gates in Part II §6.

---

## What changed from the research brief (5 Oct 2026)

| Item | Research brief | This GDD | Why |
|---|---|---|---|
| King | Arceus (Gen 4) | **Pikachu** (Red) and **Nidoking** (Rocket) | Gen 1 only. Pikachu is the partner you protect at all costs, which is exactly what a king is. Nidoking is literally a king, and is in Giovanni's Viridian Gym team (Bulbapedia, checked 5 Oct 2026) |
| Queen | Rayquaza (Gen 3) | **Charizard** (Red) and **Nidoqueen** (Rocket) | Gen 1 only. Charizard is the strongest flyer in Red's team and flies in any straight line, as a queen does. Nidoqueen is literally a queen and is in Giovanni's Silph Co. and Viridian Gym teams |
| Layout | One roster for both sides, black gets shiny palettes | **Two different teams**, Team Red (white) and Team Rocket (black) | Two recognisable sides read better than palette swaps, and Team Rocket's black uniforms make it the natural black side |
| Board library | chessground | **Own DOM board** | chessground 9.2.1 names each piece only by `${color} ${role}` (`dist/render.js` line 179, inspected 5 Oct 2026), so the two bishops on one side cannot show different species. Team Red's bishops are Venusaur and Blastoise |
| Capture animation engine | Phaser 3 overlay | **Canvas2D overlay, procedural effects** | 14 effects do not need a game engine. All effect art is drawn in code, so no third party effect sheets are shipped. The effect dictionary stays engine agnostic, so Phaser can be added later if ever needed |
| Stockfish size | about 7.3 MB (third party rehost) | **1,787,571 bytes** for `stockfish-19-lite-single.wasm` | Measured from the npm tarball `stockfish@19.0.0`, 5 Oct 2026 |
| Repo name | `snackchess` | **`pokefan-chess`** | "snack" points at the studio name. Raised once here, then locked as D2 |
| Sprite hosting | Separate assets repo | **Fetched at build time from PokeAPI/sprites, never committed** | Same separation (code repo holds zero Nintendo art) without creating a second repo of Nintendo art under the owner's account |

---

# Part I. Design

## 1. Vision

A real game of chess where every capture is a tiny Game Boy battle. Two teams everybody who played Red and Blue recognises at a glance: Red's champion squad against Giovanni and Team Rocket. The chess is never bent. The Pokémon layer is pure flavour on top of correct rules, so a child learning chess learns real chess, and an adult playing it gets a grin every time Charizard lands on something.

The feeling to protect: **"I know these guys."** Within three seconds of seeing the board, a player should name the Pokémon, guess which piece each one is, and want to see what happens when one takes another.

## 2. The two teams

Both teams use standard starting squares. White (Team Red) moves first.

### Team Red (white): Red's champion team

Red's Mt. Silver team in Gold, Silver and Crystal is Pikachu, Espeon, Snorlax, Venusaur, Charizard and Blastoise (Bulbapedia, checked 5 Oct 2026). Every one of them is here, with Espeon represented by its Gen 1 earlier form, Eevee, as the pawns.

| Piece | Squares | Pokémon (Dex #) | Gen 1 type | Capture move (type) | Fallback move | Why it fits |
|---|---|---|---|---|---|---|
| King | e1 | Pikachu (#25) | Electric | Thunderbolt (Electric) | Quick Attack (Normal) | Red's partner. Small, precious, and the game ends if it faints |
| Queen | d1 | Charizard (#6) | Fire/Flying | Flamethrower (Fire) | none needed | Flies in any straight line, the strongest piece on the side |
| Rooks | a1, h1 | Snorlax (#143) | Normal | Body Slam (Normal) | none needed | Snorlax blocks Routes 12 and 16 in Red and Blue (Bulbapedia, 5 Oct 2026). A rook is the piece that holds a road |
| Bishop, dark squares | c1 | Venusaur (#3) | Grass/Poison | Razor Leaf (Grass) | none needed | Forest green on dark squares |
| Bishop, light squares | f1 | Blastoise (#9) | Water | Hydro Pump (Water) | none needed | Water cannons fire along diagonals |
| Knights | b1, g1 | Rapidash (#78) | Fire | Stomp (Normal) | none needed | The only horse in Gen 1. The knight silhouette for free |
| Pawns | a2 to h2 | Eevee (#133) | Normal | Quick Attack (Normal) | none needed | Eevee becomes many things, and a pawn becomes many pieces. Espeon's Gen 1 form |

### Team Rocket (black): Giovanni and the Rocket crew

Giovanni's Viridian Gym team in Red and Blue is Rhyhorn, Dugtrio, Nidoqueen, Nidoking and Rhydon (Bulbapedia, checked 5 Oct 2026). Jessie's Arbok and James's Weezing (Ekans and Koffing evolved, Bulbapedia, 5 Oct 2026) are the bishops. Rocket Grunts in Red and Blue lean on Zubat, Rattata, Koffing and Ekans (Bulbapedia, 5 Oct 2026); Rattata is the pawn because its compact silhouette reads better eight times over than Zubat's wings (marked `[T]`, see §12).

| Piece | Squares | Pokémon (Dex #) | Gen 1 type | Capture move (type) | Fallback move | Why it fits |
|---|---|---|---|---|---|---|
| King | e8 | Nidoking (#34) | Poison/Ground | Horn Attack (Normal) | none needed | It is called Nidoking. Giovanni's gym |
| Queen | d8 | Nidoqueen (#31) | Poison/Ground | Body Slam (Normal) | none needed | It is called Nidoqueen. Giovanni's Silph Co. and gym teams |
| Rooks | a8, h8 | Rhydon (#112) | Ground/Rock | Rock Slide (Rock) | none needed | Giovanni's ace (level 50, the highest on his gym team). A walking rock tower |
| Bishop, light squares | c8 | Arbok (#24) | Poison | Wrap (Normal) | none needed | Jessie's. Slithers along diagonals |
| Bishop, dark squares | f8 | Weezing (#110) | Poison | Sludge (Poison) | none needed | James's. Smog on dark squares |
| Knights | b8, g8 | Dugtrio (#51) | Ground | Dig (Ground) | Slash (Normal) | A knight jumps over pieces. Dugtrio digs under them. Giovanni's gym |
| Pawns | a7 to h7 | Rattata (#19) | Normal | Hyper Fang (Normal) | none needed | The grunt's swarm Pokémon |

Every capture and fallback move above is in that species' Red and Blue learnset, by level up or TM (PokéAPI `version_group: red-blue`, queried 5 Oct 2026). The Gen 1 types come from PokéAPI including `past_types` for generation i.

**Bishop species rule.** A bishop's species is decided by the colour of its square, never by which bishop it "was". A square is dark when `fileIndex + rankNumber` is odd (a1: 0 + 1 = 1, dark). Bishops never change colour, so the rule is stable, and it doubles as a teaching aid: Blastoise always lives on light squares.

**Fallback rule.** If the capture move would have no effect on the defender's Gen 1 type (multiplier 0), the attacker uses its fallback move instead. In this roster that only happens twice: Pikachu's Thunderbolt against any Ground type (all four of Nidoking, Nidoqueen, Rhydon, Dugtrio), and Dugtrio's Dig against Charizard (Flying). The first one is real Gen 1 strategy showing through: Giovanni's gym is Pikachu's worst nightmare.

### 2.1 Type effectiveness lines (cosmetic only)

Computed from PokéAPI type relations with Gen 1 `past_damage_relations` applied, 5 Oct 2026. Only multipliers that are not 1 are listed. These change the **text** in the battle box and nothing else. Chess outcomes never depend on type.

| Attacker move | Defender: multiplier |
|---|---|
| Thunderbolt (Electric) | Pikachu 0.5, Charizard 2, Venusaur 0.5, Blastoise 2, all Ground types 0 (fallback fires) |
| Flamethrower (Fire) | Charizard 0.5, Venusaur 2, Blastoise 0.5, Rapidash 0.5, Rhydon 0.5 |
| Normal moves (Body Slam, Quick Attack, Stomp, Horn Attack, Wrap, Hyper Fang, Slash) | Rhydon 0.5 |
| Razor Leaf (Grass) | Rhydon 4, Dugtrio 2, Blastoise 2, Arbok 0.5, Weezing 0.5, Charizard 0.25, Venusaur 0.25, Rapidash 0.5 |
| Hydro Pump (Water) | Rhydon 4, Nidoking 2, Nidoqueen 2, Dugtrio 2, Charizard 2, Rapidash 2, Venusaur 0.5, Blastoise 0.5 |
| Rock Slide (Rock) | Charizard 4, Rapidash 2, Nidoking 0.5, Nidoqueen 0.5, Rhydon 0.5, Dugtrio 0.5 |
| Dig (Ground) | Pikachu 2, Rapidash 2, Nidoking 2, Nidoqueen 2, Rhydon 2, Arbok 2, Weezing 2, Charizard 0 (fallback fires) |
| Sludge (Poison) | Nidoking 0.25, Nidoqueen 0.25, Rhydon 0.25, Dugtrio 0.5, Arbok 0.5, Weezing 0.5 |

Text mapping: ≥ 2 shows "It's super effective!"; between 0 and 1 shows "It's not very effective..."; exactly 1 shows nothing. Weezing has no Levitate in Gen 1 (abilities arrived in Gen 3), so Dig hits it for 2. That is correct, not a bug.

## 3. Core loop

```
 ┌──────────────┐   tap or drag    ┌──────────────┐  quiet move   ┌─────────────┐
 │ Read board   │ ───────────────▶ │ Choose move  │ ────────────▶ │ Piece slides│──┐
 │ (who is who) │                  │ (legal dots) │               └─────────────┘  │
 └──────▲───────┘                  └──────┬───────┘                                │
        │                                  │ capture                               │
        │                          ┌───────▼────────┐  ~1.9 s, tap to skip         │
        │                          │ Battle overlay │  "CHARIZARD used             │
        │                          │ HP drains, KO  │   FLAMETHROWER!"             │
        │                          └───────┬────────┘                              │
        │                                  ▼                                       │
        │                          ┌────────────────┐  check? mate? promote?       │
        └──────────────────────────│ Opponent turn  │◀─────────────────────────────┘
                                   └────────────────┘
```

The repeated verb is **capture**, so capture gets the most juice. Quiet moves stay fast and clean so the game never drags.

## 4. Mechanics, and the feeling each one makes

Rules are standard FIDE chess, enforced by chess.js. Everything below is presentation.

| Chess event | What the player sees and hears | The feeling |
|---|---|---|
| Select a piece | Piece hops 4 px, its cry plays (short, quiet), legal squares show dots, capture squares show a ring | "This one is mine and it's alive" |
| Quiet move | Piece slides 160 ms, small footstep blip | Brisk, nothing in the way of thinking |
| Capture | Board dims, Gen 1 style battle screen: attacker's back sprite bottom left, defender's front sprite top right, two HP bars, text box. "{ATTACKER} used {MOVE}!", effect plays, defender flashes 3 times, HP drains to zero, "{DEFENDER} fainted!", overlay slides out, board resumes with the capture applied | The payoff. A tiny cartoon every time something is won |
| Check | King's square pulses red, king's cry plays, text box: "{KING} is in danger!" | Alarm without panic |
| Checkmate, Rocket loses | Nidoking spins off the top of the screen with a twinkle. "Looks like Team Rocket's blasting off again!" | The line every fan knows (Bulbapedia, 5 Oct 2026) |
| Checkmate, Red loses | Pikachu faints (drops and fades). "PIKACHU fainted! RED blacked out!" | Gen 1 loss text, gentle |
| Promotion | Picker shows the four team Pokémon with their piece glyphs. Then the evolution flash: silhouette pulses between pawn and chosen Pokémon for 1.2 s. "What? EEVEE is evolving!" then "EEVEE evolved into CHARIZARD!" | The best moment in any Gen 1 playthrough, mapped onto the best moment for a pawn |
| Castling | King and rook swap in one move. "PIKACHU hid behind SNORLAX!" (template `{KING} hid behind {ROOK}!`) | Safety, explained in one line |
| En passant | Normal capture battle, the pawn uses its move | A weird rule made memorable |
| Draw (stalemate, threefold, 50 move, insufficient material) | "Both trainers are out of moves! It's a draw." with the specific reason in the teaching caption | Fair, no confusion |

**Teaching captions** (on by default): under every flavour line, a small caption names the chess term ("Check", "Castling", "En passant", "Promotion", "Stalemate"). The flavour never hides the chess.

**Piece glyphs** (on by default): each piece carries a small chess glyph in its lower corner (♔♕♖♗♘♙ style, drawn as SVG). Readability beats purity. Toggle in settings.

## 5. Modes and screen flow

```
Splash ──▶ Title ──▶ [Battle!]  (quick play: last used side and level, 1 tap to board)
  "Made for Jeremy       ├─▶ Play vs Computer ─▶ Pick team ─▶ Pick level ─▶ Intro ─▶ Board
   by Cousin Mew"            ├─▶ Two Players (same device) ─────────────────────▶ Intro ─▶ Board
                             ├─▶ How to Play (one screen: both teams, piece legend)
                             └─▶ Settings
Board ─▶ End screen ─▶ Rematch (same settings) | Menu
```

| Level | Name | Engine setup | Feel |
|---|---|---|---|
| 1 | Youngster | No engine. Seeded random legal move, picks a capture when one exists 50% of the time | Beatable by a beginner child |
| 2 | Gym Leader | Stockfish lite, `Skill Level 3`, movetime 200 ms | Punishes hanging pieces |
| 3 | Elite Four | Stockfish lite, `Skill Level 10`, movetime 600 ms | A real club game |
| 4 | Champion | Stockfish lite, `Skill Level 20`, movetime 1200 ms | Unbeatable for almost everyone |

Intro card: "TEAM ROCKET wants to battle!" or "RED wants to battle!" for 1.2 s, tap to skip. The computer always waits at least 600 ms before moving, so moves never snap.

Take back: available vs Youngster and Gym Leader (one move pair per tap). Off for Elite Four and Champion. Two Players: off by default, toggle in settings.

## 6. Art direction

| Element | Direction |
|---|---|
| Pieces | Gen 5 Black/White animated sprites (front), fetched at build time from PokeAPI/sprites. Idle animation runs. Black pieces are not recoloured |
| Battle screen | Gen 5 animated back sprite for the attacker, front for the defender, on a flat two tone arena (grass ellipse under each). HP bars and text box in a Gen 1 inspired frame, drawn in CSS |
| Board | Clean, soft greens: light `#E8F0D0`, dark `#7FA65A`, last move tint `rgba(255,214,0,0.35)`, check pulse `rgba(220,40,40,0.55)` |
| Effects | All procedural Canvas2D: particles, lines, shapes, screen shake. No effect sheets from any game |
| Type | One system font stack for UI, plus an optional pixel font only if it is open licensed and self hosted (OFL). Default is system stack |
| Retro mode (Phase 4 stretch) | Gen 1 Red/Blue transparent sprites on a four tone DMG green board |

## 7. Audio

| Sound | Source |
|---|---|
| Pokémon cries | PokeAPI/cries `cries/pokemon/legacy/{id}.ogg`, fetched at build time, transcoded to mp3 with ffmpeg for Safari safety |
| UI blips, footstep, hit, faint, text tick, evolution shimmer | Synthesised with Web Audio in code. Zero audio files |
| Music | None in v1 (kill list) |

## 8. Copy deck (all strings live in `src/data/strings.en.json`)

| Key | Text |
|---|---|
| `splash.credit` | Made for Jeremy by Cousin Mew |
| `intro.vsRocket` | TEAM ROCKET wants to battle! |
| `intro.vsRed` | RED wants to battle! |
| `battle.used` | {attacker} used {move}! |
| `battle.super` | It's super effective! |
| `battle.weak` | It's not very effective... |
| `battle.fainted` | {defender} fainted! |
| `check` | {king} is in danger! |
| `castle` | {king} hid behind {rook}! |
| `evolve.start` | What? {pawn} is evolving! |
| `evolve.done` | {pawn} evolved into {piece}! |
| `mate.rocketLoses` | Looks like Team Rocket's blasting off again! |
| `mate.redLoses` | PIKACHU fainted! RED blacked out! |
| `draw` | Both trainers are out of moves! It's a draw. |
| `ai.loading` | {trainer} is thinking about strategy... |
| `ai.failed` | The computer trainer got lost. Switching to Youngster. |
| `footer.disclaimer` | Unofficial, free, noncommercial fan project. Pokémon © Nintendo, Game Freak, Creatures Inc. and The Pokémon Company. Not affiliated or endorsed. |

Names render in caps inside the battle box, as in Gen 1.

## 9. Attribution and release posture (from the 5 Oct 2026 research)

| Decision | Setting |
|---|---|
| Public credit | Personal handle `Cousin Mew` only, on the splash and in CREDITS.md |
| Community | GitHub repo link, plus an optional project only Discord link (shown only if `DISCORD_URL` is set) |
| Studio names | None, anywhere (D2) |
| Money | None. No ads, no donations, no sponsor button, no store page (D3) |
| Code licence | AGPL-3.0-only |
| Original assets and docs | CC-BY-NC-SA-4.0 |
| Nintendo assets | Not in the repo. Fetched at build time. REUSE.toml marks them "Copyright The Pokémon Company / Nintendo / Game Freak / Creatures Inc.; not licensed by this project" |
| Hosting | GitHub Pages from the code repo via Actions. No itch.io |
| Takedown | Comply immediately. README says so |

This is not legal advice. Tolerance of fan projects is discretionary and can end at any time.

## 10. Success measures

There are no analytics (D3, prime directive 4). Success is measured by protocol.

| Measure | Target | How |
|---|---|---|
| Piece recognition | 5 of 5 testers name the chess piece of all 12 sprites from one screenshot with glyphs on; at least 4 of 5 with glyphs off | `stage()` screenshot, one question per sprite, no priming |
| First game completion | The cousin finishes a full game vs Youngster in the first sitting | Observed |
| Return | The cousin starts a second game unprompted | Observed |
| Capture joy | No tester turns battle animations off in their first 3 games | Settings state checked after the session |
| Technical | All Part II §3 numbers met | Harness and CI |

## 11. Kill list (sounds good, cut from v1)

Online play, team builder, other generations, gym leader teams, chess clock, hints, puzzles, ELO or ratings, accounts, music, achievements, cosmetic shop, any change to chess rules (HP, type based captures, critical hits), mobile app wrapper, itch.io page, OG image containing sprites.

**Never list:** ads, donations, sponsorships, paid anything, analytics or tracking, any studio or company name, hotlinking Showdown's servers.

## 12. Taste calls `[T]` (defaults ship, owner reviews once at the end)

| ID | Call | Default |
|---|---|---|
| T1 | Rocket pawns | Rattata (alternative: Zubat) |
| T2 | Red knights | Rapidash (alternative: none in Red's canon team) |
| T3 | Board palette | `#E8F0D0` / `#7FA65A` |
| T4 | Battle overlay total length | about 1.9 s |
| T5 | Level names and strength settings | §5 table |
| T6 | Take back defaults | On for levels 1 and 2 |
| T7 | Splash wording | §8 `splash.credit` |
| T8 | Teaching captions and glyphs default | Both on |

---

# Part II. Build contract for Claude Code

You are the lead engineer on PokeFan Chess. The owner's decisions are final. Your mission: **ship v1.0 to a public GitHub Pages URL, with every phase gate below passing, and leave the repo in a state where adding a team or an effect is a data edit.**

## Lean mode (overrides §3, §5 and §6 wherever they conflict)

This is a low priority side project with a token budget. Finish across up to 10 days in **four short sessions**, one per block below. Each session: run the gate, commit, write a 5 line report, stop.

| Session | Covers | Gate (only these, plus lint, typecheck, unit tests, build, boot gate, G1, G3, G5) |
|---|---|---|
| S1 | Phase 0 + Phase 1: scaffold, assets script, roster, board, rules, Two Players, captions, promotion picker | Roster test; bishop promotion cases from Gate 1; Scholar's Mate and Fool's Mate by Playwright clicks at 360×640 show the right end text |
| S2 | Phase 2: battle overlay, 14 FX, evolution, cries and synth SFX, Full/Quick/Off, skip | Pair sweep (98 pairs) with zero errors; Pikachu vs Ground uses QUICK ATTACK; Dugtrio vs Charizard uses SLASH; one determinism check on `bolt` |
| S3 | Phase 3: Stockfish worker, 4 levels, Youngster, timeout fallback, take back | Each level returns a legal move from 5 seeded positions; engine blocked → `ai.failed` then the game finishes |
| S4 | Phase 4 + Phase 5: splash, title, team and level select, intro, end screen, settings, resume, share, README, CREDITS, deploy | Live URL boots, quick play reaches the board in 2 taps, one capture plays, zero console errors; G1 on the deployed bundle |

**Cut in lean mode** (move to a later "polish" session only if the owner asks): axe audit (T-9), keyboard only play (T-10), Lighthouse (T-13), `reuse lint` in CI (keep REUSE.toml), G2/G4/G6 in CI (keep as one local script run in S4), the 98 pair text snapshot (the sweep stays), Champion vs Youngster sanity games, Retro mode, the Team Brock contributor test, `bench()` and `metrics()` (keep `seed`, `loadFen`, `move`, `step`, `playFx`, `stage`, `dumpState`).

**Token rules for every session:**

- Read only the sections of this file the session needs (S1: Part I §2, §4, §8 and Part II §0, §1, §4.1 to §4.4, §4.7. S2: §2.1, §4.5, §4.3. S3: §5 table, §4.6. S4: §5 flow, §8, §9, §4.8, §4.9).
- Prefer headless Playwright scripts with terse pass/fail output over screenshots. Take at most 2 screenshots per session.
- Print only failing test output. Never paste whole files back into the conversation.
- Write code in as few, complete files as possible; avoid rewrite loops. If a gate fails twice on the same issue, log it in DECISIONS.md, apply the simplest fix, and move on.
- DECISIONS.md and PLAYTEST-NOTES.md entries stay to 2 lines each.

**You do all setup, the owner does nothing except sign in.** In S1, before the first commit: check `gh auth status`. If `gh` is not signed in as the Cousin Mew account, stop and tell the owner in one line to create a free GitHub account named `cousinmew` (or the closest free name) and run `gh auth login`; that is the only human step, because an agent cannot create GitHub accounts. Once signed in, do the rest yourself: `gh repo create pokefan-chess --public`, push, enable GitHub Pages with Actions as the source (`gh api` on the repo's pages endpoint), and set the repo description to the footer disclaimer.

**Brand setup, done in S1 before the first commit:** copy `brandguard.txt` (it sits next to this file) to the repo root as `.brandguard`, add `.brandguard` to `.gitignore`, run `gh secret set BRANDGUARD < .brandguard` if `gh` is authenticated as the Cousin Mew account, and make the pre-push hook run G1. If `gh` is not authenticated as that account, skip the secret, make CI skip G1 with a visible warning, and note it in the S1 report.

## 0. Prime directives

1. **Precedence:** this contract > the running build > anything else. Where the running build contradicts a sentence here, the build is the fact: fix the sentence or log it. If something is genuinely ambiguous, decide using the pillars in §2, log it in `docs/DECISIONS.md`, and keep moving. Never stall waiting for a human. Taste calls ship the default and are batched into §12 of Part I.
2. **Chess is never bent.** chess.js decides every legal move and every game end. No Pokémon logic may change a legal move, a capture or a result.
3. **Brand isolation.** The repo lives at `~/Code/pokefan-chess`, **outside** any studio folder. Git author is the owner's personal GitHub noreply address. The owner's studio, employer and brand names, and the studio email domain, must appear nowhere: not in source, built output, commit messages, author fields or docs. The terms themselves are never written into the repo. They live in `.brandguard` (one term per line, gitignored, supplied by the owner with this contract as `brandguard.txt`) and in a GitHub Actions secret `BRANDGUARD` with the same content. This is grep gate G1 and it runs every phase.
4. **No money, no tracking, no runtime network.** No ads, donation links, analytics, fonts or scripts from other origins. At runtime the app fetches only same origin files.
5. **Nintendo art and audio are never committed.** They are fetched by `scripts/fetch-assets.mjs` into `public/assets/` (gitignored) at build time, locally and in CI.

## 1. Locked decisions

| ID | Decision |
|---|---|
| D1 | Rosters, moves and types exactly as Part I §2 and §2.1 |
| D2 | Public credit is `Cousin Mew` only. No studio name anywhere (prime directive 3) |
| D3 | No monetisation, no analytics, ever |
| D4 | Code AGPL-3.0-only. Original art and docs CC-BY-NC-SA-4.0. REUSE compliant |
| D5 | Stack: Vite + strict TypeScript, chess.js 1.4.0, stockfish 19.0.0 lite single threaded in a Web Worker. No other runtime dependency |
| D6 | Board is an own DOM renderer (CSS grid of 64 cells, Pointer Events). No chessground |
| D7 | Battle overlay is Canvas2D plus DOM text box. Effects are procedural, defined in a data dictionary |
| D8 | Static multi file site deployed to GitHub Pages by Actions. Not a single HTML file |
| D9 | MVP modes: vs Computer (4 levels) and Two Players on one device. Online is out of v1 |
| D10 | Portrait mobile first: fully playable at 360×640, board squares ≥ 44 px |
| D11 | Every tunable lives in `src/config.ts` with a one line comment |
| D12 | Working docs (`docs/DESIGN.md` = this file, `docs/DECISIONS.md`, `docs/PLAYTEST-NOTES.md`, `CHANGELOG.md`) are committed. This is an open source hobby repo, so contributors need them. They must pass G1 |

## 2. Pillars (tie breakers, in order)

1. **Chess first.** Correct rules, readable board, nothing hides the game state.
2. **Every capture is a tiny battle.** Juice the capture hardest.
3. **Recognisable in three seconds.** Canon Gen 1 faces, canon lines.
4. **Fast to play.** Quiet moves are instant. Every animation is skippable.
5. **Data, not code.** A new team or effect is a data edit.

## 3. Definition of done

**Player experience.** A first time visitor opens the URL on a phone, taps through the splash, taps **Battle!** and is looking at Pikachu facing Nidoking within two taps. Their first capture plays a battle that reads as Gen 1 at a glance. When they win, Team Rocket blasts off.

**Technical acceptance (every line is checked by a machine):**

| # | Check | Threshold |
|---|---|---|
| T-1 | Cold load to interactive board (quick play, Two Players), Playwright, desktop, local `vite preview` | < 1.5 s |
| T-2 | Engine ready after choosing vs Computer level 2+ | < 4.0 s |
| T-3 | Total `dist/` size including fetched assets | < 6 MB |
| T-4 | Battle overlay `bench(240)` p95 frame cost | < 8 ms |
| T-5 | Skip: tap during overlay to board interactive | ≤ 100 ms |
| T-6 | Animations Off: capture to board interactive | ≤ 50 ms |
| T-7 | Console errors or page errors across the full flow suite | 0 |
| T-8 | Playable at 360×640 and 1280×800, no horizontal scroll | Playwright assertion |
| T-9 | axe-core serious or critical violations on title, board, settings | 0 |
| T-10 | Keyboard only: complete Fool's Mate with arrow keys and Enter | Passes |
| T-11 | Reload mid game resumes the same FEN, side and level | Passes |
| T-12 | `window.__kc` present with `?debug=1`, `undefined` without, checked on `dist/` | Passes |
| T-13 | Lighthouse mobile performance on the deployed URL | ≥ 80 |
| T-14 | Grep gates G1 to G6 | All pass |

## 4. Specs

### 4.1 Repo layout

```
pokefan-chess/
  index.html
  src/
    main.ts              boot, routing between screens
    config.ts            ALL tunables (D11)
    game/chess.ts        thin wrapper over chess.js: state, moves, events, end detection
    game/rng.ts          seeded mulberry32
    board/board.ts       DOM board, input, highlights, glyphs
    board/pieces.ts      species lookup (role + color + square colour → species)
    battle/overlay.ts    battle screen sequence, timing, skip
    battle/fx.ts         FX recipe runner (Canvas2D)
    battle/fxRecipes.ts  the 14 recipes as data + small draw fns
    battle/types.ts      effectiveness lookup and fallback rule
    ai/engine.ts         worker wrapper, levels, Youngster mover, failure fallback
    ai/stockfish.worker.ts
    audio/audio.ts       cries + Web Audio synth
    ui/screens/*.ts      splash, title, teamSelect, intro, endScreen, settings, howTo
    ui/textBox.ts        Gen 1 style text box with tick
    store/persist.ts     localStorage, namespace `kc:v1:`, try/catch everywhere
    debug/harness.ts     window.__kc, only behind ?debug=1
    data/roster.gen1.json
    data/strings.en.json
  scripts/fetch-assets.mjs
  scripts/grep-gates.mjs
  tests/unit/*.test.ts   (vitest)
  tests/e2e/*.spec.ts    (playwright)
  public/assets/         (gitignored, filled by fetch-assets)
  LICENSES/  REUSE.toml  LICENSE  README.md  CREDITS.md  CHANGELOG.md
  docs/DESIGN.md  docs/DECISIONS.md  docs/PLAYTEST-NOTES.md
  .github/workflows/ci.yml  .github/workflows/deploy.yml
```

Max 500 lines per file as a target, 750 as a lint error.

### 4.2 Roster data (copy verbatim into `src/data/roster.gen1.json`)

```json
{
  "schema": 1,
  "source": "Learnsets: PokeAPI version_group red-blue, verified 2026-10-05. Types: Gen 1 past_types.",
  "moves": {
    "thunderbolt":  { "name": "THUNDERBOLT",  "type": "electric", "fx": "bolt" },
    "quick-attack": { "name": "QUICK ATTACK", "type": "normal",   "fx": "quick" },
    "flamethrower": { "name": "FLAMETHROWER", "type": "fire",     "fx": "flame" },
    "body-slam":    { "name": "BODY SLAM",    "type": "normal",   "fx": "slam" },
    "razor-leaf":   { "name": "RAZOR LEAF",   "type": "grass",    "fx": "leaf" },
    "hydro-pump":   { "name": "HYDRO PUMP",   "type": "water",    "fx": "water" },
    "stomp":        { "name": "STOMP",        "type": "normal",   "fx": "stomp" },
    "horn-attack":  { "name": "HORN ATTACK",  "type": "normal",   "fx": "horn" },
    "rock-slide":   { "name": "ROCK SLIDE",   "type": "rock",     "fx": "rockfall" },
    "wrap":         { "name": "WRAP",         "type": "normal",   "fx": "wrap" },
    "sludge":       { "name": "SLUDGE",       "type": "poison",   "fx": "sludge" },
    "dig":          { "name": "DIG",          "type": "ground",   "fx": "dig" },
    "slash":        { "name": "SLASH",        "type": "normal",   "fx": "slash" },
    "hyper-fang":   { "name": "HYPER FANG",   "type": "normal",   "fx": "fang" }
  },
  "species": {
    "pikachu":   { "dex": 25,  "name": "PIKACHU",   "types": ["electric"],         "move": "thunderbolt",  "fallback": "quick-attack" },
    "charizard": { "dex": 6,   "name": "CHARIZARD", "types": ["fire","flying"],    "move": "flamethrower" },
    "snorlax":   { "dex": 143, "name": "SNORLAX",   "types": ["normal"],           "move": "body-slam" },
    "venusaur":  { "dex": 3,   "name": "VENUSAUR",  "types": ["grass","poison"],   "move": "razor-leaf" },
    "blastoise": { "dex": 9,   "name": "BLASTOISE", "types": ["water"],            "move": "hydro-pump" },
    "rapidash":  { "dex": 78,  "name": "RAPIDASH",  "types": ["fire"],             "move": "stomp" },
    "eevee":     { "dex": 133, "name": "EEVEE",     "types": ["normal"],           "move": "quick-attack" },
    "nidoking":  { "dex": 34,  "name": "NIDOKING",  "types": ["poison","ground"],  "move": "horn-attack" },
    "nidoqueen": { "dex": 31,  "name": "NIDOQUEEN", "types": ["poison","ground"],  "move": "body-slam" },
    "rhydon":    { "dex": 112, "name": "RHYDON",    "types": ["ground","rock"],    "move": "rock-slide" },
    "arbok":     { "dex": 24,  "name": "ARBOK",     "types": ["poison"],           "move": "wrap" },
    "weezing":   { "dex": 110, "name": "WEEZING",   "types": ["poison"],           "move": "sludge" },
    "dugtrio":   { "dex": 51,  "name": "DUGTRIO",   "types": ["ground"],           "move": "dig",          "fallback": "slash" },
    "rattata":   { "dex": 19,  "name": "RATTATA",   "types": ["normal"],           "move": "hyper-fang" }
  },
  "teams": {
    "red": {
      "label": "RED", "color": "w", "introKey": "intro.vsRed", "mateKey": "mate.redLoses",
      "pieces": { "k": "pikachu", "q": "charizard", "r": "snorlax", "n": "rapidash", "p": "eevee",
                  "b": { "light": "blastoise", "dark": "venusaur" } }
    },
    "rocket": {
      "label": "TEAM ROCKET", "color": "b", "introKey": "intro.vsRocket", "mateKey": "mate.rocketLoses",
      "pieces": { "k": "nidoking", "q": "nidoqueen", "r": "rhydon", "n": "dugtrio", "p": "rattata",
                  "b": { "light": "arbok", "dark": "weezing" } }
    }
  }
}
```

### 4.3 Type chart (`src/battle/types.ts`)

Hard code the Gen 1 multipliers for the 8 attacking types against the 9 defending types used here (electric, fire, flying, normal, grass, poison, water, ground, rock), from Part I §2.1. A unit test must reproduce every non 1 value in that table exactly. Rule: `mult = product over defender types`; if `mult === 0` and the species has `fallback`, recompute with the fallback move. If still 0 (cannot happen in this roster), show no effectiveness line.

### 4.4 Board (`src/board`)

| Spec | Value |
|---|---|
| Layout | CSS grid 8×8, square size `min(100vw − 16px, 100vh − 220px) / 8`, minimum 44 px |
| Pieces | `<img>` per piece, `image-rendering: pixelated`, sprite scaled to 90% of square, bottom aligned, constant `PIECE_SCALE = 0.9` |
| Input | Tap source then tap target, and drag with Pointer Events. Both always on |
| Highlights | Selected square, legal dots (`LEGAL_DOT_SIZE = 0.28`), capture rings, last move tint, check pulse at `CHECK_PULSE_MS = 900` |
| Glyph | 30% square size SVG glyph in the lower right corner, toggle `settings.glyphs` |
| Flip | Two Players: board flips after each move when `settings.autoFlip` (default off, pieces stay upright) |
| Keyboard | Arrow keys move a focus ring, Enter selects and confirms, Escape cancels. `aria-live="polite"` announces "CHARIZARD to f3" and capture results |
| Quiet move anim | `MOVE_SLIDE_MS = 160` |

### 4.5 Battle overlay (`src/battle`)

Sequence and default timings, all in `config.ts` under `BATTLE`:

| Step | ms | Notes |
|---|---|---|
| Dim board, slide in sprites | 250 | Attacker back sprite from left, defender front sprite from right |
| Text "{A} used {MOVE}!" | 450 | Tick sound per 2 chars |
| FX recipe | 600 | From `fxRecipes.ts` |
| Defender flash ×3 | 240 | 80 ms each |
| HP drain to 0 | 250 | Green to yellow to red |
| Effectiveness line (if any) | 400 | |
| "{D} fainted!" + faint drop | 350 | Defender cry plays pitched down 10% |
| Slide out | 200 | Board then applies the capture |

Modes: **Full** (default), **Quick** (effect plays on the board square for 400 ms, no overlay), **Off**. `prefers-reduced-motion` defaults to Quick. Tap or key press anywhere skips to the end in ≤ 100 ms (T-5). Input to the board is locked while the overlay runs.

FX recipe shape:

```ts
type FxRecipe = {
  id: string;            // "bolt"
  durationMs: number;
  shakePx?: number;      // screen shake amplitude
  flashColor?: string;   // full screen flash
  draw: (ctx: CanvasRenderingContext2D, t: number /*0..1*/, a: Pt, d: Pt, rng: () => number) => void;
};
```

The 14 recipes: `bolt` (jagged yellow lines from sky to defender, white flash), `flame` (orange particle stream attacker to defender), `slam` (attacker lunges to defender, shake 6 px), `leaf` (green triangles spiral to defender), `water` (blue jet with droplets), `stomp` (dust ring at defender, shake 4 px), `quick` (white speed lines, attacker dashes and returns), `horn` (lunge plus star impact), `rockfall` (grey rocks drop onto defender), `dig` (attacker sinks, dust, erupts under defender), `wrap` (purple rings tighten round defender), `sludge` (purple blobs arc and splat), `fang` (two white wedges snap shut), `slash` (three white diagonal streaks). Effects use the seeded RNG passed in, never `Math.random`, so they are deterministic under the harness.

Evolution sequence (promotion): 1200 ms total, silhouette alternates pawn and target sprite with accelerating period (`EVOLVE_START_PERIOD_MS = 300`, `EVOLVE_END_PERIOD_MS = 60`), white flash, both text lines. Skippable. vs Computer promotions use the engine's chosen piece.

### 4.6 AI (`src/ai`)

- Copy `node_modules/stockfish/bin/stockfish-19-lite-single.js` and `.wasm` into `public/engine/` at build (postinstall or vite plugin). Load lazily only when vs Computer level 2+ is chosen.
- UCI flow: `uci` → `isready` → `setoption name Skill Level value N` → `position fen …` → `go movetime M` → parse `bestmove`.
- Levels from Part I §5, in `config.ts` as `AI_LEVELS`. `AI_MIN_THINK_MS = 600`.
- Youngster: seeded RNG over `chess.moves({verbose:true})`, `YOUNGSTER_CAPTURE_BIAS = 0.5`.
- Failure: if the worker errors or exceeds `AI_TIMEOUT_MS = 5000`, show `ai.failed` and continue as Youngster. The game must never hang.

### 4.7 Assets (`scripts/fetch-assets.mjs`)

For every `dex` in the roster, download from `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/`:

| File | Path | Verified 5 Oct 2026 (Pikachu) |
|---|---|---|
| Front animated | `versions/generation-v/black-white/animated/{dex}.gif` | HTTP 200, 23,958 bytes |
| Back animated | `versions/generation-v/black-white/animated/back/{dex}.gif` | HTTP 200, 21,063 bytes |
| Gen 1 retro | `versions/generation-i/red-blue/transparent/{dex}.png` | HTTP 200, 462 bytes |

And cries from `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/{dex}.ogg` (Pikachu: HTTP 200, 6,020 bytes, 5 Oct 2026), transcoded to `.mp3` with ffmpeg when available (keep `.ogg` and pick by `canPlayType` at runtime). Write `public/assets/manifest.json` listing every file and its byte size. Idempotent: skip files that already exist. Fail the build if any file is missing. Never hotlink at runtime.

### 4.8 Persistence and settings

Keys under `kc:v1:`: `settings`, `game` (FEN, PGN, mode, side, level), `lastQuickPlay`. Every read and write in try/catch; the game works with storage blocked. Settings: animations (Full, Quick, Off), sound (on, off, volume 0 to 1), teaching captions, glyphs, auto flip, take back (Two Players only).

### 4.9 Share and release surface

- Title screen **Share** button: `navigator.share({ url })` with clipboard fallback and a "Link copied" toast.
- Footer on title and How to Play: the `footer.disclaimer` string, GitHub link, Discord link only if `config.DISCORD_URL` is set.
- README: one paragraph pitch, screenshot placeholder (owner adds), how to run (`npm i && npm run assets && npm run dev`), the disclaimer from Part I §9, licence table, takedown statement.
- CREDITS.md: `Cousin Mew`, chess.js (BSD-2-Clause), Stockfish.js (GPLv3, © 2026 Chess.com LLC), PokeAPI sprites and cries (art © The Pokémon Company), and an invitation to contact if credit is missing.

## 5. Phase plan (report after each; no phase starts until the previous gate passes)

Every gate below **also** requires: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, the boot gate (§6.3) and grep gates G1 to G6, all green, plus CI green on the pushed branch. Commit once per phase, conventional format, gate results in the body.

### Phase 0. Scaffold and guardrails (no gameplay)

Scope: create the repo at `~/Code/pokefan-chess`, set the repo's git author locally (`git config --local`) to `Cousin Mew` and the noreply address of the Cousin Mew GitHub account (never the global git identity, which may be a studio address; G1 checks this), Vite + strict TS (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`), ESLint with all rules as errors and max-lines 750, Vitest, Playwright (use `executablePath: '/opt/pw-browsers/chromium'` if the pinned browser is not present), husky pre-commit (lint) and pre-push (build), commit message check, CI workflow, LICENSE, LICENSES/, REUSE.toml, README stub, `config.ts`, `rng.ts`, roster JSON + schema test, `fetch-assets.mjs`, grep gate script, harness skeleton.

Gate 0:
- Roster test: 2 teams × 6 roles resolve to a species; both bishop square colours resolve; every species has a `move` that exists in `moves`; every move has an `fx` id.
- `npm run assets` downloads 14 × 3 sprites + 14 cries, manifest lists 56 or more files, rerun downloads 0.
- `git ls-files public/assets` returns nothing.
- `__kc` gate (T-12) on `dist/`.

### Phase 1. Board and rules, Two Players

Scope: chess wrapper, DOM board, tap and drag, highlights, glyphs, promotion picker (4 team Pokémon with glyphs), check, all end states with the copy deck text, text box, teaching captions, flip, keyboard and aria-live. No battle overlay yet: captures apply instantly.

Gate 1:
- Unit: species lookup for all 32 starting squares; promotion to q, r, b, n on a light and a dark square gives the right species. Fixed cases: Eevee promoting to bishop on b8 (dark) becomes **Venusaur**, on a8 (light) **Blastoise**; Rattata promoting to bishop on c1 (dark) becomes **Weezing**, on b1 (light) **Arbok**. Castling both sides both colours emits `castle` text with the right names. En passant FEN captures correctly.
- Unit: end detection from FENs for mate (both colours), stalemate, threefold, 50 move, insufficient material, each emitting the right string key.
- E2E at 360×640 and 1280×800: play Scholar's Mate by clicks (`e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#`) → end screen shows `mate.rocketLoses`. Play Fool's Mate (`f3 e5 g4 Qh4#`) → `mate.redLoses`. T-8 and T-10 pass.

### Phase 2. Battle overlay, evolution, audio

Scope: overlay sequence, 14 FX recipes, effectiveness text, fallback rule, Quick and Off modes, skip, evolution sequence, cries and synth SFX, settings for animations and sound.

Gate 2:
- Harness runs every attacker × defender pair across teams (7 × 7 × 2 = 98 pairs) through the overlay with `step()`: zero errors, and the emitted text lines equal a committed snapshot.
- Unit: every non 1 multiplier in Part I §2.1 reproduced; Pikachu vs each Ground type uses QUICK ATTACK; Dugtrio vs Charizard uses SLASH.
- Determinism: `playFx('bolt', seed 1234)` stepped 36 frames twice gives identical `dumpState()`; seed 9999 differs.
- T-4, T-5, T-6 measured and reported as numbers.

### Phase 3. Computer opponent

Scope: worker, 4 levels, Youngster, lazy load, minimum think time, timeout and failure fallback, take back.

Gate 3:
- For 20 seeded random positions (generated by playing 10 to 40 random legal plies from the start), each level returns a legal move within its movetime + 1000 ms.
- Champion beats Youngster in 5 of 5 seeded games (sanity of the ladder).
- Same seed Youngster game of 40 plies is identical twice and differs for another seed.
- E2E with requests to `/engine/*` aborted: choosing Gym Leader shows `ai.failed`, then the game continues and finishes.
- T-2 measured and reported.

### Phase 4. Game shell

Scope: splash, title with Battle! quick play, team select, level select, intro card, How to Play (both team legends), settings screen, end screen with Rematch and Menu, persistence and resume, Share button, footer disclaimer, reduced motion default. Stretch (only if all else is green): Retro mode.

Gate 4:
- E2E full flow: splash → title → Battle! reaches an interactive board in exactly 2 taps (T-1 measured).
- T-9, T-11 pass. Storage blocked (Playwright context with storage denied, or `localStorage` throwing via init script): full flow still works.
- Every string on screen comes from `strings.en.json` (grep: no literal user facing English in `src/ui` outside the loader).

### Phase 5. Release

Scope: `deploy.yml` (build with assets, upload Pages artifact, deploy), README complete, CREDITS.md, `reuse lint` in CI, final docs.

Gate 5:
- Playwright against the live Pages URL: boots, quick play reaches the board, one capture plays, zero console errors.
- G1 to G6 run against the deployed bundle (download it) as well as the repo.
- T-3 and T-13 measured and reported.
- `reuse lint` passes.

### Phase 6. Human playtest (owner, not the agent)

Run Part I §10 with 5 testers including the cousin. Feed results into `docs/PLAYTEST-NOTES.md`. Then review all `[T]` calls in one sitting.

## 6. Verification harness

### 6.1 `window.__kc` (only behind `?debug=1`, built into `dist/` and inert without the flag)

| Method | Contract |
|---|---|
| `seed(n)` | Reseeds the RNG used by Youngster and FX. Returns `n` |
| `loadFen(fen, opts?)` | Loads a position, mode and side |
| `move(uci)` | Plays a move through the same path as UI input, including the overlay unless animations are Off |
| `step(frames, dt=1/60)` | Advances overlay, evolution and slide animations on a fixed timestep |
| `bench(frames=240)` | Synchronously runs overlay update and render, returns `{frames, avgMs, medianMs, p95Ms, worstMs, budgetMs: 16.67}` |
| `playFx(id, seed?)` | Starts one FX recipe on a staged battle |
| `stage()` | Lays out one of each of the 14 species on the board (bishops on both colours) for the recognition screenshot |
| `aiMove()` | Asks the current level for a move and returns the UCI string |
| `dumpState()` | Stable JSON: schema, FEN, turn, mode, level, settings, overlay phase and t rounded to 3 dp, last text keys, RNG call count. Excludes cosmetic idle bob by construction, listed in `excludes` |
| `metrics()` | Load timings (T-1, T-2), last bench, counts of captures, skips, mode changes |

Grow it when a gate needs it, and log each addition in DECISIONS.md.

### 6.2 Grep gates (`scripts/grep-gates.mjs`, run in CI and in every gate)

| ID | Assertion |
|---|---|
| G1 | No term from `.brandguard` (locally) or `$BRANDGUARD` (CI), case insensitive, in tracked files, `dist/`, or `git log --format='%an %ae %s %b'`. The script fails if neither source is present, so the gate can never pass silently |
| G2 | No `fetch(`, `XMLHttpRequest`, `WebSocket` or absolute `http` URL in `src/` except the GitHub and Discord links in `config.ts` |
| G3 | `Math.random` absent from `src/` (seeded RNG only) |
| G4 | No empty `catch {}` blocks |
| G5 | No files under `public/assets/` tracked by git |
| G6 | No `ads`, `donate`, `sponsor`, `paypal`, `ko-fi`, `analytics`, `gtag` strings in `src/` or `dist/` |

### 6.3 Boot gate

Open `dist/index.html` through `vite preview`, wait 2 s, fail on any `pageerror` or console error, or if the board root has zero children. Run it every phase.

### 6.4 Rig quirks

Background or headless panes may never fire `requestAnimationFrame`; drive animations with `step()` and time them with `bench()`. `bench()` measures script and canvas call cost only, not GPU composite or vsync, so report it as a floor and name the remaining test (a real mid range Android phone) in PLAYTEST-NOTES.

## 7. Output contract

Per phase, return: the updated code, a `CHANGELOG.md` entry (what and why, gate results with numbers), new `docs/DECISIONS.md` entries (two short paragraphs each: the call, then why, naming the pillar), and `docs/PLAYTEST-NOTES.md` updates (what a human must feel test, open tuning questions with the constant name, measurement caveats, what was verified by machine). At the end: the live URL and the batched `[T]` list.

## 8. Known failure modes (do not)

- Letting Pokémon logic touch chess legality or results.
- Committing any sprite, cry or Nintendo derived file.
- Any studio name, studio email or studio path in code, docs, commits or author fields.
- Hotlinking sprites or cries at runtime.
- Using `Math.random` (breaks determinism gates).
- Loading Stockfish on boot (it is 1.8 MB; lazy load only).
- Shipping the 99 MB full Stockfish build (`stockfish-19.wasm`).
- Forgetting that the inline entry script must be a module: if anything inlines the bundle, it uses `<script type="module">`, or the page boots blank while every other check passes.
- Modal stacking: the promotion picker, battle overlay, evolution and end screen never overlap. One at a time, queued.
- Locking the board forever when the engine fails.
- Marking a phase done with a failing check. Bypassing hooks with `--no-verify`.
- Burying a tunable in logic instead of `config.ts`.
- Adding anything from the kill list or the never list.

## 9. Iteration playbook (for every session after v1.0)

Each future change starts with: read `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/PLAYTEST-NOTES.md`; run the full gate suite green at HEAD before touching anything.

| Change | How | Gate |
|---|---|---|
| Tune feel | Edit `config.ts` only | Gate 2 snapshot unchanged except intended timings |
| New move effect | Add a recipe to `fxRecipes.ts` and point a move's `fx` at it | Pair sweep still zero errors; determinism test for the new id |
| New team (e.g. a gym leader) | Add species, moves and a team block to the roster JSON, rerun assets | **Contributor test:** zero edits outside `src/data/` and `src/battle/fxRecipes.ts`; team appears in team select; pair sweep passes |
| Swap a `[T]` default | Edit data or config, log the decision with the owner's call | Gates green |
| Online play (v2) | New contract. Start with PeerJS room codes, validate moves with chess.js on both ends | Its own phase plan |

Prove the contributor test once during Phase 4: add a throwaway "Team Brock" (Onix rooks, Geodude pawns, any Gen 1 fill), confirm zero code edits were needed, then delete it before the phase closes and log the result.

---

## Sources (all checked 5 October 2026)

- Bulbapedia, Giovanni: Red and Blue teams (Rocket Hideout, Silph Co., Viridian Gym). https://bulbapedia.bulbagarden.net/wiki/Giovanni
- Bulbapedia, Red (game): Mt. Silver team in Gold, Silver and Crystal. https://bulbapedia.bulbagarden.net/wiki/Red_(game)
- Bulbapedia, Snorlax: blocks Routes 12 and 16 in Red and Blue, woken with the Poké Flute. https://bulbapedia.bulbagarden.net/wiki/Snorlax_(Pokémon)
- Bulbapedia, Jessie and James: Ekans to Arbok, Koffing to Weezing; "Looks like Team Rocket's blasting off again!" https://bulbapedia.bulbagarden.net/wiki/Jessie_and_James
- Bulbapedia, Team Rocket Grunt: Zubat, Rattata/Raticate, Koffing, Ekans most used in Red and Blue. https://bulbapedia.bulbagarden.net/wiki/Team_Rocket_Grunt
- PokéAPI `/pokemon/{id}` (red-blue learnsets, Gen 1 past types) and `/type/{name}` (Gen 1 past damage relations). https://pokeapi.co
- PokeAPI/sprites and PokeAPI/cries raw paths, HTTP status and sizes measured by request. https://github.com/PokeAPI/sprites , https://github.com/PokeAPI/cries
- npm registry: chess.js 1.4.0 (BSD-2-Clause), chessground 9.2.1 (GPL-3.0-or-later), stockfish 19.0.0 (GPL-3.0), file sizes from the published tarball. https://www.npmjs.com/package/stockfish
- Stockfish.js README in the 19.0.0 package: lite single threaded build recommended, no CORS headers needed.
- Release and attribution posture: the owner's research report "Pokémon Chess: Attribution, Release and Build Plan", 5 Oct 2026, which cites Aftermath (13 Mar 2024), GitHub's DMCA repo, and the PokéRogue, Pokémon Auto Chess, Infinite Fusion and Showdown repos.
