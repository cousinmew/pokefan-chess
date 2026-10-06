// SPDX-License-Identifier: AGPL-3.0-only
// YELLOW's team and linear unlocks (fix 3). A fixed list of 30 stickers: each finished Pikachu's Path lesson gives the
// next one, then each win vs Computer. No chance anywhere. Stickers and team live in the shared save, so BLUE catches
// show here too. The King is always Pikachu in YELLOW; bishops use one species for both squares.
import type { TeamSkin } from '../board/pieces';
import { LESSON_COUNT } from './path';
import { addCatch, DEX, type Campaign } from './kanto';
import { whyNot, type SkinRole } from '../../worker/src/team';
import data from '../data/yellow-unlocks.json';

export const UNLOCKS: readonly string[] = data.unlocks;
export type YellowSlot = 'p' | 'n' | 'b' | 'r' | 'q';
export const YELLOW_SLOTS: readonly YellowSlot[] = ['p', 'n', 'b', 'r', 'q'];

/** Unlocks earned: one per lesson, then one per win once all 12 lessons are done. */
export const unlockCount = (c: Campaign) => Math.min(UNLOCKS.length, c.path + (c.path >= LESSON_COUNT ? c.yellowWins : 0));

/** The next sticker and how to get it, or null when all 30 are in. */
export function nextUnlock(c: Campaign): { id: string; by: 'lesson' | 'win' } | null {
  const n = unlockCount(c);
  return n < UNLOCKS.length ? { id: UNLOCKS[n]!, by: c.path < LESSON_COUNT ? 'lesson' : 'win' } : null;
}

/** Puts every earned unlock not yet given into the sticker book. Returns the new save and what arrived. */
export function grantUnlocks(c: Campaign): { campaign: Campaign; got: string[] } {
  const n = unlockCount(c);
  const got = UNLOCKS.slice(c.yellowGiven, n);
  let out = c;
  for (const id of got) out = addCatch(out, id, false, 'yellow');
  return { campaign: { ...out, yellowGiven: Math.max(c.yellowGiven, n) }, got: [...got] };
}

/** A win vs Computer in YELLOW counts only after the 12 lessons. */
export const countWin = (c: Campaign): Campaign => (c.path >= LESSON_COUNT ? { ...c, yellowWins: c.yellowWins + 1 } : c);

const roleOf = (slot: YellowSlot): SkinRole => (slot === 'b' ? 'bLight' : slot);

/** Stickers allowed in a slot (B14 rules, applied silently). YELLOW has no badges, so the queen slot is open. */
export function eligible(c: Campaign, slot: YellowSlot): string[] {
  return DEX.filter((id) => c.caught[id] && whyNot(roleOf(slot), id, null, 1) === null);
}

export function pick(c: Campaign, slot: YellowSlot, id: string): Campaign {
  if (!eligible(c, slot).includes(id)) return c;
  const team = slot === 'b' ? { ...c.team, bLight: id, bDark: id } : { ...c.team, [slot]: id };
  return { ...c, team };
}

/** Classic team: the YELLOW slots go back to the default Red team (a BLUE king choice is kept for BLUE). */
export const classicTeam = (c: Campaign): Campaign => ({ ...c, team: c.team.k ? { k: c.team.k } : {} });

/** The skins YELLOW plays with: the team without its king (always Pikachu here). */
export function yellowSkin(c: Campaign): TeamSkin {
  const { k: _king, ...rest } = c.team as TeamSkin;
  void _king;
  return rest;
}
