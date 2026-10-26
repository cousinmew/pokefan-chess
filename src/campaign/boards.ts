// SPDX-License-Identifier: AGPL-3.0-only
// A Journey trainer's own Pokémon on their pieces (playtest, 23 Oct: BROCK played on Team Rocket's): a canon loadout
// per trainer from src/data/journey-boards.json, sourced like trainer-teams.json. As with BLUE (partyOf), no species
// stands on both sides: one on yours gives way to the trainer's next free spare.
import boards from '../data/journey-boards.json';
import { SKIN_ROLES, type TeamSkin } from '../board/pieces';
import type { Trainer } from './journey';
import type { Campaign } from './kanto';
import { yourSpecies } from './rivalTeam';

interface Board {
  team: Required<TeamSkin>;
  spare: string[];
  source: string;
}
export const BOARDS = boards.trainers as Record<string, Board>;

/** The trainer's pieces for this save, or undefined for a trainer with no loadout (the rivals, from their party). */
export function boardOf(c: Campaign, t: Trainer): TeamSkin | undefined {
  const b = BOARDS[t.id];
  if (!b) return undefined;
  const yours = yourSpecies(c);
  const free = b.spare.filter((s) => !yours.has(s) && !Object.values(b.team).includes(s));
  const swap = new Map<string, string>();
  const out: TeamSkin = {};
  for (const key of SKIN_ROLES) {
    const id = b.team[key];
    if (!yours.has(id)) out[key] = id;
    else {
      if (!swap.has(id) && free.length) swap.set(id, free.shift()!);
      out[key] = swap.get(id) ?? id; // kept as it is when no spare is free
    }
  }
  return out;
}
