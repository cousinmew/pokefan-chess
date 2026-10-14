// SPDX-License-Identifier: AGPL-3.0-only
// Pacing (12 Oct, R8): every value of the spec lives in config.ts with its value, and something uses it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as config from '../../src/config';

const SPEC: Record<string, number> = {
  SCREEN_IN_MS: 180, AREA_IN_MS: 320, BATTLE_CLOSE_MS: 200, BATTLE_IN_MS: 420, BATTLE_STAGGER_MS: 10, SPLASH_IN_MS: 600,
  SPLASH_AUTO_MS: 2500, COVER_LABEL_MS: 400, COVER_MAX_MS: 8000, REDUCED_FADE_MS: 120, HOLD_MIN_MS: 250, CARD_GUARD_MS: 250,
  LINE_GUARD_MS: 200, DIM_IN_MS: 160, CARD_IN_MS: 180, STORY_IN_MS: 140, LINE_IN_MS: 120, TRAINER_IN_MS: 400,
  TRAINER_SPOT_MS: 350, INTRO_MS: 1800, PUZZLE_SETUP_MS: 1500, THEIR_SLIDE_MS: 240, TURN_LINE_DELAY_MS: 300,
  OPPONENT_REPLY_MS: 900, SOLVE_BEAT_MS: 500, SOLVED_STAMP_MS: 900, STAMP_EDGE_MS: 180, REVIEW_IN_MS: 160, REVIEW_MOVE_MS: 900,
  ARROW_IN_MS: 150, BOARD_DIP_MS: 240, MISS_SHAKE_MS: 300, THINKING_LINE_MS: 900, AI_MIN_THINK_MS: 600, WIN_BEAT_MS: 400,
  WIN_CARD_IN_MS: 260, WIN_PIP_STEP_MS: 120, BADGE_IN_MS: 500, BADGE_SHINE_MS: 500, MAP_STAMP_DELAY_MS: 200, MAP_STAMP_MS: 400,
  CLEARED_ROW_MS: 600, STAMP_PAUSE_MS: 700, NEXT_PULSE_MS: 800, END_HOLD_MS: 1600, END_ANIM_MS: 1400, CHALLENGE_END_MS: 1600,
  YELLOW_CHEER_MS: 600, PATH_NEXT_DELAY_MS: 350, STICKER_IN_MS: 600, PATH_NEW_MS: 900,
  // Fix, 13 Oct (journey): the evolved form's hold, the catch's beat, the battle card's sprite wait, My Team's previews.
  EVOLVE_DONE_MS: 1200, CATCH_BEAT_MS: 1200, CARD_SPRITE_WAIT_MS: 1500, TEAM_PREVIEW_WAIT_MS: 350,
  // Merge review, 14 Oct: a changed My Team row keeps its old preview until the new one can paint.
  TEAM_SWAP_WAIT_MS: 1000,
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.ts$/.test(f) ? [p] : [];
  });
}
const src = new URL('../../src', import.meta.url).pathname;
const code = sources(src).filter((f) => !f.endsWith('config.ts')).map((f) => readFileSync(f, 'utf8')).join('\n');

describe('pacing constants (R8)', () => {
  it.each(Object.entries(SPEC))('%s is %i ms in config.ts and used', (name, ms) => {
    expect((config as Record<string, unknown>)[name]).toBe(ms);
    expect(code).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('INTRO_CARD_MS is gone: the "wants to battle!" card waits for a tap', () => {
    expect('INTRO_CARD_MS' in config).toBe(false);
    expect(code).not.toMatch(/INTRO_CARD_MS/);
  });

  it('no timed wait is left as a bare setTimeout over 400 ms in the pacing files', () => {
    // Waits over 400 ms go through hold() (R3); the timers left are beats of 400 ms or less, or decoration.
    for (const f of ['campaign/puzzleGame.ts', 'campaign/journeyGame.ts', 'campaign/pathGame.ts', 'ui/screens.ts']) {
      const text = readFileSync(join(src, f), 'utf8');
      expect(text, f).not.toMatch(/setTimeout\([^;]*(PUZZLE_SETUP_MS|OPPONENT_REPLY_MS|REVIEW_MOVE_MS|INTRO_MS|SPLASH_AUTO_MS|END_HOLD_MS|CHALLENGE_END_MS)\)/);
    }
  });
});
