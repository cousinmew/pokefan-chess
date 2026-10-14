// SPDX-License-Identifier: AGPL-3.0-only
// The rival's starter never stands on your side (playtest, 12 Oct): once BLUE has taken CHARMANDER, the default Red
// team's queen CHARMANDER (or a later stage of it) on your side read as BLUE's Pokémon. Like the W3 rule for your
// own starter (look.ts puzzleTeam), only the default team's slots change; My Team's choices stay as they are.
// The other way round (merge review, 14 Oct): BLUE's team never brings a species that stands on your side (partyOf).
import { defaultSpecies, parseVariant, SKIN_ROLES, type TeamSkin } from '../board/pieces';
import { stageFor, stageSkin, type Stage } from '../board/stages';
import { puzzleTeam } from '../look';
import { RIVAL, teamOf, type Trainer } from './journey';
import { EVOLUTIONS, familyOf, type Campaign } from './kanto';

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

/** Your side in a Journey puzzle (W3, design D), as configure() sets it: My Team with your starter as king, and no
 * default slot of the rival's starter line. Empty before a starter is chosen. */
export function yourPuzzleTeam(c: Campaign, stage: Stage): TeamSkin {
  return c.starter ? withoutRival(puzzleTeam(c.team, c.starter, stage), c.starter, stage) : {};
}

/** Every species standing on your side in the save's Journey puzzles (the story stage's Red team where My Team and
 * the starter leave a slot). */
export function yourSpecies(c: Campaign): Set<string> {
  const stage = stageFor(c.badges.length);
  const skin: TeamSkin = { ...stageSkin('w', stage), ...yourPuzzleTeam(c, stage) };
  return new Set(SKIN_ROLES.map((key) => parseVariant(skin[key] ?? defaultSpecies('w', key === 'bLight' || key === 'bDark' ? 'b' : key, key === 'bDark')).base));
}

/** BLUE's Gen 1 party lines, in the order he brings them along (Route 22, Cerulean, the S.S. Anne, Silph Co.). */
const BLUE_PARTY = ['pidgey', 'pidgeotto', 'pidgeot', 'rattata', 'raticate', 'abra', 'kadabra', 'alakazam', 'growlithe', 'arcanine', 'exeggcute', 'exeggutor', 'rhyhorn', 'rhydon', 'gyarados'];
const stageOf = (id: string) => EVOLUTIONS.find((e) => e.to === id)?.stage ?? 0;
/** A species and its later stages, in order. */
const lineFrom = (id: string): string[] => {
  const next = EVOLUTIONS.find((e) => e.from === id)?.to;
  return [id, ...(next ? lineFrom(next) : [])];
};

/** A trainer's team for this save (journey.ts teamOf). A rival's (J12: his puzzles' pieces, his card, his goal card)
 * never brings a species that stands on your side (merge review, 14 Oct: the warm-up's PIDGEY pawns met PIDGEY in all
 * his roles but the king): such a member, or one his team already has, gives way to the first free species of his
 * Gen 1 party at its stage (else any free one); his lead, BLUE's starter, grows into its next free stage first (only a
 * My Team pick can put it on your side). Kept as it is when nothing is free. */
export function partyOf(c: Campaign, t: Trainer): string[] {
  const team = teamOf(c, t);
  if (!t.team.includes('@counter')) return team;
  const yours = yourSpecies(c);
  const out: string[] = [];
  const free = (id: string) => !yours.has(id) && !out.includes(id);
  team.forEach((id, i) => {
    const instead = [...(i === 0 ? lineFrom(id) : [id]), ...BLUE_PARTY.filter((x) => stageOf(x) === stageOf(id)), ...BLUE_PARTY];
    out.push(instead.find(free) ?? id);
  });
  return out;
}
