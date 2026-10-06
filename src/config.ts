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
export const BOARD_SIDE_GUTTER_PX = 16; // horizontal room left around the board
export const BOARD_CHROME_PX = 220; // vertical room kept for the text box and header
export const END_ANIM_MS = 1400; // blasting off / fainting animation on mate
export const ASSET_BASE = 'assets/'; // same origin sprite and cry folder, filled by fetch-assets
export const DEFAULT_SETTINGS = { glyphs: true, captions: true, autoFlip: false, anim: 'full' as AnimMode, sound: true, volume: 1, music: 0.3, takeBack: false, v: 2 }; // v: settings schema // settings defaults (reduced motion starts on Quick)
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
export const MAX_FRAME_MS = 100; // clamp for a real frame delta (tab switches)
export const EVOLVE_MS = 1200; // whole evolution sequence
export const EVOLVE_START_PERIOD_MS = 300; // first silhouette swap period
export const EVOLVE_END_PERIOD_MS = 60; // last silhouette swap period
export const EVOLVE_FLASH_MS = 150; // white flash at the end of the evolution
export const CRY_VOLUME = 0.35; // cry volume in battles and on check
export const SELECT_CRY_VOLUME = 0.12; // short quiet cry when a piece is selected
export const SFX_VOLUME = 0.08; // synth blips and ticks
export const ANIM_MODES = ['full', 'quick', 'off'] as const; // battle animation settings, Full is default
export type AnimMode = (typeof ANIM_MODES)[number];
export const AI_LEVELS = [
  { id: 1, name: 'Youngster', skill: null, movetimeMs: 0 }, // seeded random legal move, no engine
  { id: 2, name: 'Gym Leader', skill: 3, movetimeMs: 200 }, // punishes hanging pieces
  { id: 3, name: 'Elite Four', skill: 10, movetimeMs: 600 }, // a real club game
  { id: 4, name: 'Champion', skill: 20, movetimeMs: 1200 }, // unbeatable for almost everyone
] as const;
export type AiLevel = (typeof AI_LEVELS)[number]['id'];
export const AI_MIN_THINK_MS = 600; // the computer never moves faster than this
export const AI_TIMEOUT_MS = 5000; // engine load or search slower than this falls back to Youngster
export const YOUNGSTER_CAPTURE_BIAS = 0.5; // chance Youngster takes a capture when one exists
export const TAKE_BACK_LEVELS: readonly number[] = [1, 2]; // levels that allow take back
export const ENGINE_URL = 'engine/stockfish-19-lite-single.js'; // same origin worker, copied at build
export const SPLASH_AUTO_MS = 2500; // splash moves on by itself after this, or on the first tap
export const INTRO_MS = 1200; // "X wants to battle!" card, tap to skip
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
export const PUZZLE_SEEN_MAX = 400; // remember this many solved or missed puzzle ids to avoid repeats
export const PUZZLE_REPLY_MS = 450; // pause before the puzzle's own moves auto play
export const RARE_SLOT_BELOW = 10; // a slot under 10% is rare (§B4)
export const CATCH = { first: { common: 1, rare: 0.6 }, hint: { common: 0.5, rare: 0.2 } }; // catch chance by solve (§B4)
export const STREAK_FOR_RARE = 3; // first try solves in a row on a route that guarantee the next rare catch
export const MASTERY_WINDOW = 10; // route mastery looks at the last 10 tall grass puzzles
export const MASTERY_NEED = 8; // of which 8 solved (a solve with a hint counts)
export const ENCOUNTER_PAUSE_MS = 700; // pause after a solve before the wild Pokémon appears
export const CANDY_PER_CATCH = 3; // candy per catch, for that family (§B12)
export const CANDY_PER_OAK = 1; // candy for each duplicate sent to Oak
export const CANDY_COST = { first: 25, second: 50 }; // candy to evolve from a first or second stage
export const SHINY_ODDS = 1 / 64; // shiny chance per wild encounter
export const SHINY_STREAK = 5; // first try solves in a row on a route that guarantee a shiny
export const STAR_STEPS = [3, 6, 10]; // duplicates sent to Oak for 1, 2 and 3 stars
export const TRAINER_NEXT_MS = 1400; // pause between puzzles in a trainer battle
export const PLAYTIME_TICK_MS = 5000; // playtime counter step while the page is visible
