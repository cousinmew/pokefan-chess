// SPDX-License-Identifier: AGPL-3.0-only
// BLUE's story teams start unevolved and evolve with badges (§B18 item 5): 0 to 2 badges, 3 to 5, 6 or more.
// YELLOW keeps the classic final forms; My Team skins still win over a stage.
import type { Color, Role, TeamSkin } from './pieces';
import { loadout } from './loadouts';

export type Stage = 0 | 1 | 2;
export const STAGE_BADGES = [3, 6] as const;
export const stageFor = (badges: number): Stage => (badges >= STAGE_BADGES[1] ? 2 : badges >= STAGE_BADGES[0] ? 1 : 0);

// Red: stage 2 is the v1 roster itself, so it needs no entry. Light bishops are Squirtle, dark Bulbasaur.
const RED: [TeamSkin, TeamSkin] = [
  { q: 'charmander', bLight: 'squirtle', bDark: 'bulbasaur', n: 'ponyta' },
  { q: 'charmeleon', bLight: 'wartortle', bDark: 'ivysaur', n: 'rapidash' },
];
// Rocket (change B, replacing B18's Rocket table): the stage's trainer brings their own team.
export const ROCKET_STAGE_TRAINERS = ['rocketgrunt', 'jessiejames-gen1', 'giovanni-gen1'] as const;

export function stageSkin(color: Color, stage: Stage): TeamSkin {
  if (color === 'b') return loadout(ROCKET_STAGE_TRAINERS[stage]) ?? {};
  return stage === 2 ? {} : { ...RED[stage] };
}

/** Every piece that changes species going from one stage to the next, for the evolution ceremony. */
export function stageEvolutions(color: Color, from: Stage, to: Stage, base: (role: Role, dark: boolean) => string): [string, string][] {
  const a = stageSkin(color, from);
  const b = stageSkin(color, to);
  const out: [string, string][] = [];
  for (const [key, role, dark] of [['k', 'k', false], ['q', 'q', false], ['r', 'r', false], ['n', 'n', false], ['bLight', 'b', false], ['bDark', 'b', true]] as const) {
    const x = a[key] ?? base(role, dark);
    const y = b[key] ?? base(role, dark);
    if (x !== y) out.push([x, y]);
  }
  return out;
}
