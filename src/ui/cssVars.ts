// SPDX-License-Identifier: AGPL-3.0-only
// Tunables from config.ts as CSS variables (moved out of main.ts).
import { BOARD_CHROME_PX, BOARD_SIDE_GUTTER_PX, CHECK_PULSE_MS, END_ANIM_MS, GLYPH_SIZE, LEGAL_DOT_SIZE, MIN_SQUARE_PX, PIECE_SCALE, SELECT_HOP_PX } from '../config';

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
}
