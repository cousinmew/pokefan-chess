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
export const DEFAULT_SETTINGS = { glyphs: true, captions: true, autoFlip: false }; // settings defaults
export const REPO_URL = 'https://github.com/cousinmew/pokefan-chess'; // the only external link (G2)
