// SPDX-License-Identifier: AGPL-3.0-only
// The rival's starter never stands on your side (playtest, 12 Oct): once BLUE has taken CHARMANDER, the default Red
// team's queen CHARMANDER (or a later stage of it) on your side read as BLUE's Pokémon. Like the W3 rule for your
// own starter (look.ts puzzleTeam), only the default team's slots change; My Team's choices stay as they are.
import { defaultSpecies, parseVariant, SKIN_ROLES, type TeamSkin } from '../board/pieces';
import { stageSkin, type Stage } from '../board/stages';
import { RIVAL } from './journey';
import { familyOf } from './kanto';

/** Same role and stage, outside every starter's line: the queen stays fire, the bishops water and grass. */
const STAND_IN: Record<string, string> = {
  charmander: 'growlithe', charmeleon: 'growlithe', charizard: 'arcanine',
  squirtle: 'poliwag', wartortle: 'poliwhirl', blastoise: 'poliwrath',
  bulbasaur: 'oddish', ivysaur: 'gloom', venusaur: 'vileplume',
};

/** The rival's starter for yours ("@counter"), or null before a starter is chosen. */
export const rivalStarter = (starter: string | null | undefined): string | null => (starter ? (RIVAL.counter[starter] ?? null) : null);

/** `skin` (your side) with every default slot of the rival's starter line taken by a stand in. */
export function withoutRival(skin: TeamSkin, starter: string | null | undefined, stage: Stage): TeamSkin {
  const rival = rivalStarter(starter);
  if (!rival) return skin;
  const line = familyOf(rival);
  const stageTeam = stageSkin('w', stage);
  const out: TeamSkin = { ...skin };
  for (const key of SKIN_ROLES) {
    if (skin[key]) continue; // your own pick or the starter's place
    const id = stageTeam[key] ?? defaultSpecies('w', key === 'bLight' || key === 'bDark' ? 'b' : key, key === 'bDark');
    const base = parseVariant(id).base;
    if (familyOf(base) === line && STAND_IN[base]) out[key] = STAND_IN[base];
  }
  return out;
}
