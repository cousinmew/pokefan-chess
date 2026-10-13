// SPDX-License-Identifier: AGPL-3.0-only
// Who stands beside the board and how each team looks (§B18 items 5, 7 and 8). Per profile: the player's trainer
// (RED, or MEIR once the secret code is entered). BLUE's story stage comes from the badges.
import type { Look } from '../worker/src/protocol';
import type { Color, TeamSkin } from './board/pieces';
import { defaultSpecies, lookOf, parseVariant, setStages, setWears, SKIN_ROLES } from './board/pieces';
import { ROCKET_STAGE_TRAINERS, stageFor, stageSkin, type Stage } from './board/stages';
import { loadout } from './board/loadouts';
import trainers from './data/trainers.json';
import { load, PLAYER_TRAINER, save } from './store/persist';
import { saveCampaign, type Campaign } from './campaign/kanto';
import { sound } from './audio/audio';
import { toast } from './ui/dom';

export type PlayerTrainer = 'red' | 'meir';
const PEOPLE = trainers.people as Record<string, string>;

export const myTrainer = (): PlayerTrainer => (load<string>(PLAYER_TRAINER) === 'meir' ? 'meir' : 'red');
/** Sprite id for a player trainer: MEIR is original art (public/art), the rest come from the fetched set. */
export const trainerSpriteId = (t: PlayerTrainer | 'blue') => (t === 'meir' ? 'meir' : (PEOPLE[t] ?? 'red-gen1'));

/** YELLOW keeps the final forms (stage 2); BLUE follows the badges. */
export const storyStage = (blue: boolean, badges: number): Stage => (blue ? stageFor(badges) : 2);

export const myLook = (blue: boolean, badges: number): Look => ({ stage: storyStage(blue, badges), trainer: myTrainer() });

/** Applies each side's stage to the default teams; online each side brings its own (§B18 item 5). The stage team
 * follows the look a colour wears (Red's on black in a black to move puzzle); `red` first moves Red's look there. */
export function applyLooks(looks: Partial<Record<Color, Look>>, red?: Color): void {
  if (red) setWears(red);
  setStages({ w: stageSkin(lookOf('w'), looks.w?.stage ?? 2), b: stageSkin(lookOf('b'), looks.b?.stage ?? 2) });
}

// The computer's trainer follows its level (§B20 item 1): Team Rocket when it plays Rocket, a Kanto ladder
// (Youngster, Brock, BLUE, RED) when it plays Red. In BLUE story games it follows the team's stage (§B18 item 8).
const ROCKET_LADDER = ['rocketgrunt', 'rocketgruntf', 'jessiejames-gen1', 'giovanni-gen1'];
const RED_LADDER = ['youngster-gen1', 'brock-gen1', 'blue-gen1', 'red-gen1'];
const STAGE_TRAINER = ROCKET_STAGE_TRAINERS;
const NAME_KEY: Record<string, string> = { rocketgrunt: 'plate.grunt', rocketgruntf: 'plate.gruntf', 'jessiejames-gen1': 'plate.jessiejames', 'giovanni-gen1': 'plate.giovanni', 'blue-gen1': 'plate.blue', 'red-gen1': 'plate.red', meir: 'plate.meir', 'youngster-gen1': 'plate.youngster', 'brock-gen1': 'plate.brock' };
// Titles on the name plates (§B20 item 3): "GIOVANNI · Boss", "MEIR · Trainer".
const TITLE_KEY: Record<string, string> = { rocketgrunt: 'title.rocket', rocketgruntf: 'title.rocket', 'jessiejames-gen1': 'title.rocket', 'giovanni-gen1': 'title.boss', 'blue-gen1': 'title.rival', 'brock-gen1': 'title.gymLeader', 'youngster-gen1': 'title.trainer', 'red-gen1': 'title.trainer', meir: 'title.trainer' };
/** The computer's trainer for a level; `computer` is the colour it plays (default Rocket). */
export const levelTrainer = (level: number, computer: Color = 'b') => (computer === 'b' ? ROCKET_LADDER : RED_LADDER)[Math.min(4, Math.max(1, level)) - 1]!;
export const trainerTitleKey = (sprite: string, level?: number) => (sprite === 'red-gen1' && level === 4 ? 'title.champion' : (TITLE_KEY[sprite] ?? 'title.trainer'));
export const stageTrainer = (stage: Stage) => STAGE_TRAINER[stage]!;
export const trainerNameKey = (sprite: string) => NAME_KEY[sprite] ?? 'plate.red';

export interface Standing {
  mode: string;
  level: number;
  human: Color;
  stage: Stage;
  myName: string;
  looks?: Partial<Record<Color, Look>>;
  /** Two Players with saves (change C): each side's own trainer and name. */
  duo?: Record<Color, { name: string; trainer: PlayerTrainer }> | null;
  /** Puzzles (W3): who you face, e.g. the route trainer; the Journey's games (C9): Champion BLUE or PROF. OAK for a
   * drill. Default the story stage's trainer. */
  them?: Side | null;
}

export interface Side {
  sprite: string;
  name: string;
  /** "Boss", "Trainer", "Gym Leader"... (§B20 item 3) */
  title: string;
  /** A computer trainer's own team (change B), for the level picker's preview. */
  team?: TeamSkin | null;
  /** A "YOU" tag on the plate (puzzles, W3). */
  you?: boolean;
}

/** Who stands on each side (§B18 item 8), or null for no plates (Pikachu's Path lessons). */
export function standing(o: Standing, name: (key: string) => string): Record<Color, Side> | null {
  if (o.mode === 'path') return null;
  const me: Side = { sprite: trainerSpriteId(myTrainer()), name: o.myName, title: name('title.trainer') };
  const other: Color = o.human === 'w' ? 'b' : 'w';
  const npc = (sprite: string): Side => ({ sprite, name: name(trainerNameKey(sprite)), title: name(trainerTitleKey(sprite, o.mode === 'computer' ? o.level : undefined)) });
  const pair = (mine: Side, theirs: Side) => ({ [o.human]: mine, [other]: theirs }) as Record<Color, Side>;
  if (o.mode === 'computer') return pair(me, npc(levelTrainer(o.level, other)));
  if (o.mode === 'two-players' && o.duo) {
    const d = o.duo;
    const side = (c: Color): Side => ({ sprite: c === 'b' && d.b.trainer === 'red' && d.w.trainer === 'red' ? 'blue-gen1' : trainerSpriteId(d[c].trainer), name: d[c].name, title: name('title.trainer') });
    return { w: side('w'), b: side('b') };
  }
  if (o.mode === 'two-players') return { w: me, b: myTrainer() === 'red' ? npc('blue-gen1') : me };
  if (o.mode === 'online') {
    const w = o.looks?.w?.trainer ?? 'red';
    const b = o.looks?.b?.trainer ?? 'red';
    // Both RED: the second seat shows BLUE.
    const pick = (c: Color, t: PlayerTrainer) => (c === o.human ? me : npc(c === 'b' && t === 'red' && w === 'red' ? 'blue-gen1' : trainerSpriteId(t)));
    return { w: pick('w', w), b: pick('b', b) };
  }
  // Puzzles (W3): you always stand at the bottom with a YOU tag, facing the trainer who set the puzzle.
  if (o.mode === 'puzzle') return pair({ ...me, title: '', you: true }, o.them ?? npc(stageTrainer(o.stage)));
  return pair(me, o.them ?? npc(stageTrainer(o.stage)));
}

type SkinKey = (typeof SKIN_ROLES)[number];

/** Your side in puzzles (W3, design D): My Team with your starter as king. No Pokémon stands twice on your side
 * (review fix): where the story team already has the starter (a stage 0 queen or bishop), PIKACHU stands instead,
 * or the role's own default when PIKACHU is taken; a starter My Team placed already is not made king as well. */
export function puzzleTeam(team: TeamSkin, starter: string, stage: Stage): TeamSkin {
  if (team.k) return { ...team };
  const story = stageSkin('w', stage);
  const out: TeamSkin = { ...team };
  const fallback = (key: SkinKey) => defaultSpecies('w', key === 'bLight' || key === 'bDark' ? 'b' : key, key === 'bDark');
  const shown = (key: SkinKey) => parseVariant(out[key] ?? story[key] ?? fallback(key)).base;
  const used = (id: string, but: SkinKey) => SKIN_ROLES.some((k) => k !== but && shown(k) === id);
  const king = !Object.values(team).some((id) => parseVariant(id).base === starter);
  if (king) out.k = starter;
  for (const key of SKIN_ROLES) {
    if (team[key] || (king && key === 'k') || !used(shown(key), key)) continue;
    const free = ['pikachu', fallback(key), ...SKIN_ROLES.map(fallback)].find((id) => !used(id, key));
    if (free) out[key] = free;
  }
  return out;
}

/** The level picker's faces (§B20 item 1): you, and the computer's ladder for the side it plays. */
export function ladderFaces(human: Color, myName: string, name: (key: string) => string, starter?: string | null): { me: Side; them(level: number): Side } {
  const computer: Color = human === 'w' ? 'b' : 'w';
  const side = (sprite: string, level?: number): Side => ({ sprite, name: name(trainerNameKey(sprite)), title: name(trainerTitleKey(sprite, level)) });
  return {
    me: { sprite: trainerSpriteId(myTrainer()), name: myName, title: name('title.trainer') },
    them: (level) => ({ ...side(levelTrainer(level, computer), level), team: loadout(levelTrainer(level, computer), starter) }),
  };
}

/** The computer's team for a level and side (change B); BLUE answers your starter. */
export const computerTeam = (level: number, computer: Color, starter?: string | null): TeamSkin => loadout(levelTrainer(level, computer), starter) ?? {};

/** The secret code worked (§B18 item 7): MEIR is this player's trainer and name. Returns the saved campaign. */
export function meirJoins(c: Campaign): Campaign {
  save(PLAYER_TRAINER, 'meir');
  const next = { ...c, name: 'MEIR' };
  saveCampaign(next);
  sound.shimmer();
  toast('secret.meir');
  return next;
}

