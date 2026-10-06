// SPDX-License-Identifier: AGPL-3.0-only
// Who stands beside the board and how each team looks (§B18 items 5, 7 and 8). Per profile: the player's trainer
// (RED, or MEIR once the secret code is entered). BLUE's story stage comes from the badges.
import type { Look } from '../worker/src/protocol';
import type { Color } from './board/pieces';
import { setStages } from './board/pieces';
import { stageFor, stageSkin, type Stage } from './board/stages';
import trainers from './data/trainers.json';
import { load } from './store/persist';

export type PlayerTrainer = 'red' | 'meir';
const PEOPLE = trainers.people as Record<string, string>;

export const myTrainer = (): PlayerTrainer => (load<string>('trainer') === 'meir' ? 'meir' : 'red');
/** Sprite id for a player trainer: MEIR is original art (public/art), the rest come from the fetched set. */
export const trainerSpriteId = (t: PlayerTrainer | 'blue') => (t === 'meir' ? 'meir' : (PEOPLE[t] ?? 'red-gen1'));

/** YELLOW keeps the final forms (stage 2); BLUE follows the badges. */
export const storyStage = (blue: boolean, badges: number): Stage => (blue ? stageFor(badges) : 2);

export const myLook = (blue: boolean, badges: number): Look => ({ stage: storyStage(blue, badges), trainer: myTrainer() });

/** Applies each side's stage to the default teams; online each side brings its own (§B18 item 5). */
export function applyLooks(looks: Partial<Record<Color, Look>>): void {
  setStages({ w: stageSkin('w', looks.w?.stage ?? 2), b: stageSkin('b', looks.b?.stage ?? 2) });
}

// The computer's trainer follows its level; in BLUE story games it follows the team's stage (§B18 item 8).
const LEVEL_TRAINER = ['rocketgrunt', 'rocketgruntf', 'jessiejames-gen1', 'giovanni-gen1'];
const STAGE_TRAINER = ['rocketgrunt', 'jessiejames-gen1', 'giovanni-gen1'];
const NAME_KEY: Record<string, string> = { rocketgrunt: 'plate.grunt', rocketgruntf: 'plate.grunt', 'jessiejames-gen1': 'plate.jessiejames', 'giovanni-gen1': 'plate.giovanni', 'blue-gen1': 'plate.blue', 'red-gen1': 'plate.red', meir: 'plate.meir' };
export const levelTrainer = (level: number) => LEVEL_TRAINER[Math.min(4, Math.max(1, level)) - 1]!;
export const stageTrainer = (stage: Stage) => STAGE_TRAINER[stage]!;
export const trainerNameKey = (sprite: string) => NAME_KEY[sprite] ?? 'plate.red';

export interface Standing {
  mode: string;
  level: number;
  human: Color;
  stage: Stage;
  myName: string;
  looks?: Partial<Record<Color, Look>>;
}

/** Who stands on each side (§B18 item 8), or null for no plates (Pikachu's Path lessons). */
export function standing(o: Standing, name: (key: string) => string): Record<Color, { sprite: string; name: string }> | null {
  if (o.mode === 'path') return null;
  const me = { sprite: trainerSpriteId(myTrainer()), name: o.myName };
  const other: Color = o.human === 'w' ? 'b' : 'w';
  const npc = (sprite: string) => ({ sprite, name: name(trainerNameKey(sprite)) });
  if (o.mode === 'computer') return { [o.human]: me, [other]: npc(levelTrainer(o.level)) } as Record<Color, { sprite: string; name: string }>;
  if (o.mode === 'two-players') return { w: me, b: myTrainer() === 'red' ? npc('blue-gen1') : me };
  if (o.mode === 'online') {
    const w = o.looks?.w?.trainer ?? 'red';
    const b = o.looks?.b?.trainer ?? 'red';
    // Both RED: the second seat shows BLUE.
    const pick = (c: Color, t: PlayerTrainer) => (c === o.human ? me : npc(c === 'b' && t === 'red' && w === 'red' ? 'blue-gen1' : trainerSpriteId(t)));
    return { w: pick('w', w), b: pick('b', b) };
  }
  return { [o.human]: me, [other]: npc(stageTrainer(o.stage)) } as Record<Color, { sprite: string; name: string }>;
}
