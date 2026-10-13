// SPDX-License-Identifier: AGPL-3.0-only
// Tunables from config.ts as CSS variables (moved out of main.ts).
import { ARROW_IN_MS, BADGE_IN_MS, BADGE_SHINE_MS, BOARD_CHROME_PX, BOARD_SIDE_GUTTER_PX, CARD_IN_MS, CHECK_PULSE_MS, CLEARED_ROW_MS, DIM_IN_MS, END_ANIM_MS, GLYPH_SIZE, LEGAL_DOT_SIZE, LINE_IN_MS, MAP_STAMP_MS, MIN_SQUARE_PX, MISS_SHAKE_MS, NEXT_PULSE_MS, PATH_NEW_MS, PIECE_SCALE, REDUCED_FADE_MS, REVIEW_IN_MS, SCREEN_IN_MS, SELECT_HOP_PX, SOLVED_STAMP_MS, STAMP_EDGE_MS, STICKER_IN_MS, STORY_IN_MS, TRAINER_IN_MS, TRAINER_SPOT_MS, WIN_CARD_IN_MS, WIN_PIP_STEP_MS, YELLOW_CHEER_MS } from '../config';

/** Pacing (12 Oct): every duration the stylesheet animates with, by its CSS name. */
const PACE: Record<string, number> = {
  '--screen-in': SCREEN_IN_MS, '--dim-in': DIM_IN_MS, '--card-in': CARD_IN_MS, '--story-in': STORY_IN_MS, '--line-in': LINE_IN_MS,
  '--trainer-in': TRAINER_IN_MS, '--spot': TRAINER_SPOT_MS, '--stamp-ms': SOLVED_STAMP_MS, '--stamp-edge': STAMP_EDGE_MS,
  '--review-in': REVIEW_IN_MS, '--arrow-in': ARROW_IN_MS, '--shake': MISS_SHAKE_MS, '--win-card-in': WIN_CARD_IN_MS,
  '--pip-step': WIN_PIP_STEP_MS, '--badge-in': BADGE_IN_MS, '--badge-shine': BADGE_SHINE_MS, '--map-stamp': MAP_STAMP_MS,
  '--cleared-row': CLEARED_ROW_MS, '--next-pulse': NEXT_PULSE_MS, '--cheer': YELLOW_CHEER_MS, '--sticker-in': STICKER_IN_MS,
  '--path-new': PATH_NEW_MS, '--reduced-fade': REDUCED_FADE_MS,
};

export function setCssVars(): void {
  const s = document.documentElement.style;
  s.setProperty('--gutter', `${BOARD_SIDE_GUTTER_PX}px`);
  s.setProperty('--chrome', `${BOARD_CHROME_PX}px`);
  s.setProperty('--min-sq', `${MIN_SQUARE_PX}px`);
  s.setProperty('--piece-scale', String(PIECE_SCALE));
  s.setProperty('--dot', String(LEGAL_DOT_SIZE));
  s.setProperty('--glyph', String(GLYPH_SIZE));
  s.setProperty('--pulse', `${CHECK_PULSE_MS}ms`);
  s.setProperty('--hop', `${SELECT_HOP_PX}px`);
  s.setProperty('--end-anim', `${END_ANIM_MS}ms`);
  for (const [name, ms] of Object.entries(PACE)) s.setProperty(name, `${ms}ms`);
}
