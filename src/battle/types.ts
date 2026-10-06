// SPDX-License-Identifier: AGPL-3.0-only
// Gen 1 type effectiveness (Part I §2.1, extended to every Gen 1 type in C2b). Cosmetic only: never touches chess.
import { MOVES, species, type MoveId, type Species, type SpeciesId } from '../board/pieces';
import type { StringKey } from '../game/text';

type T = 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon';

/** Gen 1 chart, all 15 types: attacking type -> defending type -> multiplier. Missing entries are 1.
 * Gen 1 quirks kept: Ghost does nothing to Psychic, Bug and Poison hit each other hard, Ice is neutral on Fire.
 * tests/unit/types.test.ts checks every pair against PokéAPI's Gen 1 relations (src/data/types.gen1.json). */
export const CHART: Record<T, Partial<Record<T, number>>> = {
  normal: { rock: 0.5, ghost: 0 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5 },
  ice: { water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, bug: 2, rock: 0.5, ghost: 0.5 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 2, flying: 0.5, psychic: 2, ghost: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2 },
  ghost: { normal: 0, psychic: 0, ghost: 2 },
  dragon: { dragon: 2 },
};

export function multiplier(moveType: string, defenderTypes: string[]): number {
  const row = CHART[moveType as T] ?? {};
  return defenderTypes.reduce((m, t) => m * (row[t as T] ?? 1), 1);
}

export interface Resolved {
  moveId: MoveId;
  name: string;
  fx: string;
  mult: number;
  effKey: StringKey | null;
}

export function effectivenessKey(mult: number): StringKey | null {
  if (mult >= 2) return 'battle.super';
  if (mult > 0 && mult < 1) return 'battle.weak';
  return null;
}

/** Picks the attacker's move, applying the fallback rule when the main move has no effect. */
export function resolveMove(attacker: Species | SpeciesId, defender: Species | SpeciesId): Resolved {
  const a = typeof attacker === 'string' ? species(attacker) : attacker;
  const d = typeof defender === 'string' ? species(defender) : defender;
  let moveId = a.move as MoveId;
  let mult = multiplier(MOVES[moveId]!.type, d.types);
  if (mult === 0 && a.fallback) {
    moveId = a.fallback as MoveId;
    mult = multiplier(MOVES[moveId]!.type, d.types);
  }
  const m = MOVES[moveId]!;
  return { moveId, name: m.name, fx: m.fx, mult, effKey: effectivenessKey(mult) };
}
