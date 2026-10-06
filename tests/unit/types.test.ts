// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import roster from '../../src/data/roster.gen1.json';
import { multiplier, resolveMove } from '../../src/battle/types';
import type { SpeciesId } from '../../src/board/pieces';

// Part I §2.1, every multiplier that is not 1.
const TABLE: Record<string, Partial<Record<SpeciesId, number>>> = {
  thunderbolt: { pikachu: 0.5, charizard: 2, venusaur: 0.5, blastoise: 2, nidoking: 0, nidoqueen: 0, rhydon: 0, dugtrio: 0 },
  flamethrower: { charizard: 0.5, venusaur: 2, blastoise: 0.5, rapidash: 0.5, rhydon: 0.5 },
  normal: { rhydon: 0.5 },
  'razor-leaf': { rhydon: 4, dugtrio: 2, blastoise: 2, arbok: 0.5, weezing: 0.5, charizard: 0.25, venusaur: 0.25, rapidash: 0.5 },
  'hydro-pump': { rhydon: 4, nidoking: 2, nidoqueen: 2, dugtrio: 2, charizard: 2, rapidash: 2, venusaur: 0.5, blastoise: 0.5 },
  'rock-slide': { charizard: 4, rapidash: 2, nidoking: 0.5, nidoqueen: 0.5, rhydon: 0.5, dugtrio: 0.5 },
  dig: { pikachu: 2, rapidash: 2, nidoking: 2, nidoqueen: 2, rhydon: 2, arbok: 2, weezing: 2, charizard: 0 },
  sludge: { nidoking: 0.25, nidoqueen: 0.25, rhydon: 0.25, dugtrio: 0.5, arbok: 0.5, weezing: 0.5 },
};
const NORMAL_MOVES = ['body-slam', 'quick-attack', 'stomp', 'horn-attack', 'wrap', 'hyper-fang', 'slash'];
const ALL = Object.keys(roster.species) as SpeciesId[];
const moves = roster.moves as Record<string, { type: string; name: string }>;

describe('Gen 1 type chart', () => {
  for (const [move, row] of Object.entries(TABLE)) {
    const ids = move === 'normal' ? NORMAL_MOVES : [move];
    for (const id of ids) {
      it(`${id} against all 14 species`, () => {
        for (const sp of ALL) expect(multiplier(moves[id]!.type, (roster.species as Record<string, { types: string[] }>)[sp]!.types), `${id} vs ${sp}`).toBe(row[sp] ?? 1);
      });
    }
  }
  it('Pikachu vs each Ground type uses QUICK ATTACK', () => {
    for (const d of ['nidoking', 'nidoqueen', 'rhydon', 'dugtrio'] as SpeciesId[]) expect(resolveMove('pikachu', d).name).toBe('QUICK ATTACK');
    expect(resolveMove('pikachu', 'rattata').name).toBe('THUNDERBOLT');
  });
  it('Dugtrio vs Charizard uses SLASH', () => {
    expect(resolveMove('dugtrio', 'charizard')).toMatchObject({ name: 'SLASH', effKey: null });
    expect(resolveMove('dugtrio', 'pikachu')).toMatchObject({ name: 'DIG', effKey: 'battle.super' });
  });
});
