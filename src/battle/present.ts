// SPDX-License-Identifier: AGPL-3.0-only
// A move's capture battle and evolution, before the board shows the result (moved out of main.ts with the pacing
// pass, 12 Oct). The battle itself keeps its 1.9 s (owner decision T4).
import type { AnimMode } from '../config';
import type { Board } from '../board/board';
import type { Color } from '../board/pieces';
import type { Outcome } from '../game/chess';
import { fmt } from '../game/text';
import { music } from '../audio/music';
import { trainerSrc } from '../ui/kanto';
import type { Plates } from '../ui/plates';
import type { Overlay } from './overlay';
import { prepareSprites } from './sprites';

export interface PresentHost {
  overlay: Overlay;
  plates: Plates;
  board: Board;
  /** 'off' while another screen shows (a puzzle's reply under OPTION), 'quick' for a puzzle's set up move (W3, ux #6),
   * else the setting. */
  mode(): AnimMode;
  /** Whether the side that moved stands near (the player's Pokémon; in Two Players the side that just moved). */
  near(mover: Color): boolean;
}

export async function present(h: PresentHost, out: Outcome, from: string, to: string): Promise<void> {
  const mode = h.mode();
  if (out.battle && mode !== 'off') music.play('battle');
  if (out.battle && mode === 'full') {
    const attackerNear = h.near(out.move.color);
    const { attacker, defender } = out.battle;
    const sprites = attackerNear ? await prepareSprites(attacker, defender) : await prepareSprites(defender, attacker);
    // Both trainers step in behind their Pokémon with a one word reaction (§B20 item 2).
    const them: Color = out.move.color === 'w' ? 'b' : 'w';
    const src = (c: Color) => (h.plates.spriteOf(c) ? trainerSrc(h.plates.spriteOf(c)!) : null);
    const [near, far] = attackerNear ? [out.move.color, them] : [them, out.move.color];
    h.overlay.trainers(src(near), src(far), { near: fmt(near === out.move.color ? 'say.go' : 'say.ohno'), far: fmt(far === out.move.color ? 'say.go' : 'say.ohno') });
    await h.overlay.battle(attacker, defender, undefined, sprites, attackerNear);
  } else if (out.battle && mode === 'quick') {
    // Quick mode: no battle screen, the reactions show on the name plates (§B20 item 2).
    h.plates.say(out.move.color, fmt('say.go'));
    h.plates.say(out.move.color === 'w' ? 'b' : 'w', fmt('say.ohno'));
    await h.overlay.quick(h.board.el, from, to, out.battle.attacker, out.battle.defender);
  }
  if (out.evolve && mode === 'full') {
    music.play('evolution');
    await h.overlay.evolve(out.evolve.pawn, out.evolve.into);
  }
}
