// SPDX-License-Identifier: AGPL-3.0-only
// Every tunable lives here (D11). One line comment each.

export const PIECE_SCALE = 0.9; // sprite size as a fraction of the square
export const LEGAL_DOT_SIZE = 0.28; // legal move dot diameter as a fraction of the square
export const GLYPH_SIZE = 0.3; // chess glyph size as a fraction of the square
export const CHECK_PULSE_MS = 900; // period of the red pulse on a king in check
export const MOVE_SLIDE_MS = 160; // quiet move slide duration
export const SELECT_HOP_PX = 4; // how far a selected piece hops
export const DRAG_THRESHOLD_PX = 6; // pointer travel before a press becomes a drag
export const MIN_SQUARE_PX = 44; // smallest board square (D10)
export const YELLOW_BOARD_PX = 8 * 52 + 6; // YELLOW's board when the window allows it: 52 px squares (W2: asked of the fitter)
export const BOARD_SIDE_GUTTER_PX = 8; // horizontal room left around the board: phones use the full width minus 8 px (§B19 item 7)
export const BOARD_CHROME_PX = 220; // vertical room kept for the text box and header
export const END_ANIM_MS = 1400; // blasting off / fainting animation on mate, seen on the undimmed board before the end panel (pacing)
export const ASSET_BASE = 'assets/'; // same origin sprite and cry folder, filled by fetch-assets
export const DEFAULT_SETTINGS = { glyphs: true, captions: true, autoFlip: false, anim: 'full' as AnimMode, sound: true, volume: 1, music: 0.3, takeBack: false, v: 2, pieceStyle: 'pokemon' as PieceStyle, animate: true, legend: 'auto' as 'auto' | 'on' | 'off', battleStyle: 'anime' as BattleStyle, coords: false }; // v: settings schema // settings defaults (reduced motion starts on Quick)
export const REPO_URL = 'https://github.com/cousinmew/pokefan-chess'; // the only external link (G2)
export const BATTLE = {
  // T4: about 1.9 s in all with an effectiveness line, 1.62 s without (owner call, 2026-10-05).
  inMs: 175, // dim board, slide in sprites
  usedMs: 310, // "{A} used {MOVE}!" typing
  fxMs: 415, // the move's effect
  flashMs: 165, // defender flashes 3 times
  flashCount: 3, // number of defender flashes
  drainMs: 175, // HP bar drains to zero
  effMs: 280, // effectiveness line, only when there is one
  faintMs: 240, // "{D} fainted!" plus the faint drop
  outMs: 140, // slide out, then the board applies the capture
  tickEveryChars: 2, // text tick sound every N revealed characters
  faintPitch: 0.9, // defender cry playback rate on faint (10% lower)
  spriteWaitMs: 400, // longest wait for both battle sprites to decode before the battle starts
} as const;
export const QUICK_FX_MS = 400; // Quick mode: effect on the board square, no overlay
/** Anime battle style (§B18 item 6), inside the same BATTLE timeline (about 1.9 s). */
export const ANIME = {
  speedLines: 22, // radial lines in the type coloured backdrop
  zoom: 0.1, // camera push in toward the defender, as a fraction of the screen
  slowFrom: 0.7, // the effect's last 30% of time plays its last 15% of motion: the slow beat before impact
  slowShare: 0.85,
  ghosts: 5, // afterimages behind the attacker
  particles: 28, // glow particles at the hit
  shakePx: 6, // camera shake at the hit
  koSpinDeg: 540, // KO spin out
  koScale: 0.8, // extra scale while it spins away
  maxFlashesPerSec: 3, // WCAG 2.3.1: never more than 3 flashes in any 1 s window
};
export const MAX_FRAME_MS = 100; // clamp for a real frame delta (tab switches)
export const EVOLVE_MS = 1200; // whole evolution sequence
export const EVOLVE_START_PERIOD_MS = 300; // first silhouette swap period
export const EVOLVE_END_PERIOD_MS = 60; // last silhouette swap period
export const EVOLVE_FLASH_MS = 150; // white flash at the end of the evolution
export const CRY_VOLUME = 0.35; // cry volume in battles and on check
export const SELECT_CRY_VOLUME = 0.12; // short quiet cry when a piece is selected
export const SFX_VOLUME = 0.08; // synth blips and ticks
export const BATTLE_STYLES = ['classic', 'anime'] as const; // §B18 item 6: Anime in BLUE, Classic in YELLOW
export type BattleStyle = (typeof BATTLE_STYLES)[number];
export const ANIM_MODES = ['full', 'quick', 'off'] as const; // battle animation settings, Full is default
export type AnimMode = (typeof ANIM_MODES)[number];
export const AI_LEVELS = [
  { id: 1, name: 'Youngster', skill: null, movetimeMs: 0 }, // seeded random legal move, no engine
  { id: 2, name: 'Gym Leader', skill: 3, movetimeMs: 200 }, // punishes hanging pieces
  { id: 3, name: 'Elite Four', skill: 10, movetimeMs: 600 }, // a real club game
  { id: 4, name: 'Champion', skill: 20, movetimeMs: 1200 }, // unbeatable for almost everyone
] as const;
export type AiLevel = (typeof AI_LEVELS)[number]['id'];
export const AI_MIN_THINK_MS = 600; // the computer never moves faster than this; a hold, so a skip after HOLD_MIN_MS cuts only this minimum
export const AI_TIMEOUT_MS = 5000; // engine load or search slower than this falls back to Youngster
export const YOUNGSTER_CAPTURE_BIAS = 0.5; // chance Youngster takes a capture when one exists
export const TAKE_BACK_LEVELS: readonly number[] = [1, 2]; // levels that allow take back
export const ENGINE_URL = 'engine/stockfish-19-lite-single.js'; // same origin worker, copied at build
export const SPLASH_AUTO_MS = 2500; // splash moves on by itself after this (from the show), or on a tap, Enter, Space or B after HOLD_MIN_MS
/** Trainers on the battle screen (§B20 item 2): they slide in over the first TRAINER_SLIDE_MS of the battle (the intro
 * step, 175 ms, plus the start of the "used" line, so the battle is no longer) and slide out early in the move. */
export const TRAINER_SLIDE_MS = 250;
export const TRAINER_OUT_SHARE = 0.4; // share of the effect phase used to slide out
export const INTRO_MS = 1800; // vs Computer, Two Players and YELLOW Play "X wants to battle!" card, held from the end of its pop (pacing: was 1200); skippable after HOLD_MIN_MS
export const TOAST_MS = 1600; // "Link copied" toast
export const DISCORD_URL = ''; // optional project Discord, link shown only when set
export const STORAGE_NS = 'kc:v1:'; // localStorage namespace
export const RELAY_URL = 'https://pokefan-chess-relay.cousinmew.workers.dev'; // the only runtime network origin (V7, G2)
export const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 5000]; // client socket retry delays
export const FX_SCALE = 2; // battle effects drawn this much larger than the v1 recipes
export const TYPE_FLASH_MS = 120; // full screen flash tinted by move type at the start of an effect
export const TYPE_FLASH_ALPHA = 0.5; // peak opacity of that flash
export const TYPE_COLORS: Record<string, string> = { electric: '#f8e030', fire: '#f08030', grass: '#48c048', water: '#3888f0', rock: '#9a7848', ground: '#d8b878', poison: '#a040c0', normal: '#ffffff' }; // tint per move type
export type MusicCue = 'title' | 'board' | 'battle' | 'victory' | 'defeat' | 'evolution';
export const MUSIC_LOOPS: Partial<Record<MusicCue, [number, number]>> = { title: [0, 0], board: [0, 0] }; // loop [start, end] s in the mp3; 0 = whole file
export const MUSIC_STING_GAIN = 0.7; // one-shot cues relative to the sound effects volume
export const HP_TICK_MS = 45; // HP drain tick sound interval
export const RATING_START = { r: 600, rd: 350, vol: 0.06 }; // Trainer Rating start: 600 for this audience (Lichess starts at 1500)
export const RATING_TAU = 0.5; // Glicko-2 system constant
export const PUZZLE_RD = 75; // assumed deviation of a well played Lichess puzzle (the JSON keeps only its rating)
export const PUZZLE_WINDOW = 150; // serve puzzles within this many points of the Trainer Rating
export const PUZZLE_WIDEN = 100; // widen the window by this much when a theme runs dry
export const EASY_MAX_PIECES = 16; // the first trainers' puzzles (W5): mate in 1 with at most this many pieces
export const RATING_SETTLE = 10; // rated puzzles (solved or missed) before the Trainer Level shows a number (playtest, 12 Oct)
export const PUZZLE_SEEN_MAX = 400; // remember this many solved or missed puzzle ids to avoid repeats
export const PUZZLE_REPLY_MS = 900; // the puzzle's own moves (set up and replies) play this slowly, same as OPPONENT_REPLY_MS (§B15)
export const PUZZLE_SETUP_MS = 1500; // W3: the position and "{them} moves first. Watch!" stay this long before the set up move
export const SOLVED_STAMP_MS = 900; // W3 (design J): the "SOLVED!" stamp over the board: STAMP_EDGE_MS in, the hold, STAMP_EDGE_MS out (pacing: was 600)
export const RARE_SLOT_BELOW = 10; // a slot under 10% is rare (§B4)
export const CATCH = { first: { common: 1, rare: 0.6 }, hint: { common: 0.5, rare: 0.2 } }; // catch chance by solve (§B4)
export const STREAK_FOR_RARE = 3; // first try solves in a row on a route that guarantee the next rare catch
export const MASTERY_WINDOW = 10; // route mastery looks at the last 10 tall grass puzzles
export const MASTERY_NEED = 8; // of which 8 solved (a solve with a hint counts)
export const CANDY_PER_CATCH = 3; // candy per catch, for that family (§B12)
export const CANDY_PER_OAK = 1; // candy for each duplicate sent to Oak
export const CANDY_COST = { first: 25, second: 50 }; // candy to evolve from a first or second stage
export const SHINY_ODDS = 1 / 64; // shiny chance per wild encounter
export const SHINY_STREAK = 5; // first try solves in a row on a route that guarantee a shiny
export const STAR_STEPS = [3, 6, 10]; // duplicates sent to Oak for 1, 2 and 3 stars
export const PLAYTIME_TICK_MS = 5000; // playtime counter step while the page is visible
export const LESSON_STEP_MS = 900; // mini lesson example: one move per step, then it loops
export const CHALLENGE_END_MS = 1600; // hold on the final position of a drill or Champion game before the story, skippable after HOLD_MIN_MS
export const DRILL_LEVEL = 3; // Victory Road drills: the lone king defends at Elite Four strength
export const REVIEW_MOVE_MS = 900; // review: one move per step when a line replays (§B15)
export const OPPONENT_REPLY_MS = 900; // the opponent's moves inside a puzzle, and the refutation, never snap (§B15)
export const REFUTATION_LEVEL = 4; // Stockfish level that finds the punishing reply to a wrong move
export const GYM_NEED_EARLY = 3; // gyms 1 to 4: solve 3 of 5 to win the badge
export const GYM_NEED_LATE = 4; // gyms 5 to 8: solve 4 of 5
export const REVIEW_COLORS: [string, string][] = [['green', '#30a030'], ['red', '#e03030'], ['blue', '#3070e0']]; // review arrows: your line, mistakes and key ideas, the opponent's reply
export const CARTRIDGE_HOLD_MS = 2000; // press and hold to switch cartridge (§B17)
export const YELLOW_DEFAULT_ANIM = 'quick'; // YELLOW battles start on Quick (toggle to Full in settings)
export type PieceStyle = 'pokemon' | 'badge' | 'classic'; // piece style setting (§B19 item 3)
export const PIECE_STYLES: PieceStyle[] = ['pokemon', 'badge', 'classic'];
export const PIECE_FILL = 0.92; // a trimmed sprite fills this share of its square (§B19 item 1)
export const HOLD_MS = 500; // press and hold a piece this long for its card (§B19 item 5)
export const LEGEND_FIRST_GAMES = 3; // the Who's who legend is on for a save's first games, then off (§B19 item 4)

/** Pacing (owner, 12 Oct: "transitions between screens ... cut too hard"). Screen changes enter only, under one cover
 * layer (src/ui/transitions.ts); holds over 400 ms are skippable after HOLD_MIN_MS (src/ui/pace.ts). Every value in ms. */
export const SCREEN_IN_MS = 180; // menus, pickers, OPTION, Pokédex, YELLOW screens, back to a game: a paper cover fades .8 to 0 (also the input guard)
export const AREA_IN_MS = 320; // Journey area change (map, route, map to hub, splash out): a Gen 1 fade from white in 4 steps of 80
export const BATTLE_CLOSE_MS = 200; // 8 black bars close on the tap that starts a new game on the board (each bar takes 200 - 7 x stagger)
export const BATTLE_IN_MS = 420; // the bars open on the board, odd ones to inline start, even ones to inline end
export const BATTLE_STAGGER_MS = 10; // between the 8 battle bars, closing and opening
export const SPLASH_IN_MS = 600; // first show of a page load: the title fades in from white in 4 steps of 150
export const COVER_LABEL_MS = 400; // a cover or dip still waiting on a load says "Finding a puzzle…" only after this
export const COVER_MAX_MS = 8000; // longest a waiting cover stays up before it shows whatever is mounted (also on an error)
export const REDUCED_FADE_MS = 120; // reduced motion: every cover, dip, pop, slam, stamp and bar is an opacity fade this long
export const HOLD_MIN_MS = 250; // unskippable start of every hold (and of the capture battle's tap skip), so a double tap skips nothing
export const CARD_GUARD_MS = 250; // a tap-wait card or panel button ignores input this long, then gets data-ready and its ▼
export const LINE_GUARD_MS = 200; // each new story line ignores taps and keys this long
export const DIM_IN_MS = 160; // the modal dim fades in when the modal opens (not on card swaps)
export const CARD_IN_MS = 180; // card pop: scale .94 to 1.03 to 1, opacity in by half way (cards, end panel, badge and unlock cards)
export const STORY_IN_MS = 140; // the story box rises 12 px and fades in when it opens
export const LINE_IN_MS = 120; // a new story line fades in within the same box
export const TRAINER_IN_MS = 400; // a story or card trainer slides in, only on its first appearance in a modal sequence
export const TRAINER_SPOT_MS = 350; // Gen 1 "!" over the tapped trainer row or ▶ card before the dim and the intro card
export const THEIR_SLIDE_MS = 240; // the opponent's moves slide this slowly (set up, replies, refutation, computer); yours keep MOVE_SLIDE_MS
export const TURN_LINE_DELAY_MS = 300; // "Your turn!" and "Good! Keep going." this long after the opponent's slide ends
export const SOLVE_BEAT_MS = 500; // the mate alone on the board (line and pip) before the SOLVED stamp
export const STAMP_EDGE_MS = 180; // the SOLVED stamp's scale-in (1.8 to 1) and its fade-out
export const REVIEW_IN_MS = 160; // the review panel fades in (opacity only); it never refits the board
export const ARROW_IN_MS = 150; // review arrows, marks and the red miss arrow fade in
export const BOARD_DIP_MS = 240; // paper dip over the board only (up to .85, the swap at the peak, back down): a new position, a rematch, Path Next, a review rewind
export const MISS_SHAKE_MS = 300; // a wrongly moved piece shakes 4 px on its square
export const THINKING_LINE_MS = 900; // "{trainer} is thinking…" only after this (vs Computer and the refutation)
export const WIN_BEAT_MS = 400; // after the last Continue: the board, the plates and the victory sting before the win card; input blocked
export const WIN_CARD_IN_MS = 260; // "You won!" card slam: scale 1.5 to .96 to 1, rotate -4° to 0
export const WIN_PIP_STEP_MS = 120; // the win card's pips light one by one after the slam
export const BADGE_IN_MS = 500; // the 96 px badge spins in on the badge card (scale 0 to 1.15 to 1, -180° to 0)
export const BADGE_SHINE_MS = 500; // a shine sweeps across the badge after it lands, mirrored in RTL
export const MAP_STAMP_DELAY_MS = 200; // after the map's reveal, before the CLEARED stamp slams
export const MAP_STAMP_MS = 400; // CLEARED stamp slam on the map row and on the unlock card
export const CLEARED_ROW_MS = 600; // the just cleared map row flashes twice in soft yellow, with the stamp
export const STAMP_PAUSE_MS = 700; // from the map stamp to the ▶ pulse (moved from journeyMap.ts); scrolls only when ▶ is off screen
export const NEXT_PULSE_MS = 800; // the ▶ current place card pulses twice
export const END_HOLD_MS = 1600; // vs Computer, Two Players, online and YELLOW: the mate and the blast-off or faint before the end panel
export const YELLOW_CHEER_MS = 600; // 6 CSS stars burst on the target square after a right Pikachu's Path move
export const PATH_NEXT_DELAY_MS = 350; // Next fades into the Hint button's slot this long after the right move lands
export const STICKER_IN_MS = 600; // lesson sticker card bounce (scale .5 to 1.12 at 60% to 1), the sprite hops twice
export const PATH_NEW_MS = 900; // the newly opened lesson on the Path pulses twice after returning
