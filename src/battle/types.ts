// SPDX-License-Identifier: AGPL-3.0-only
// Gen 1 effectiveness for the types in this roster (Part I §2.1). Cosmetic only: never touches chess.
import { MOVES, species, type MoveId, type Species, type SpeciesId } from '../board/pieces';
import type { StringKey } from '../game/text';

type T = 'electric' | 'fire' | 'flying' | 'normal' | 'grass' | 'poison' | 'water' | 'ground' | 'rock';

/** Attacking type -> defending type -> multiplier. Missing entries are 1. */
export const CHART: Partial<Record<T, Partial<Record<T, number>>>> = {
  electric: { electric: 0.5, flying: 2, grass: 0.5, water: 2, ground: 0 },
  fire: { fire: 0.5, grass: 2, water: 0.5, rock: 0.5 },
  normal: { rock: 0.5 },
  grass: { fire: 0.5, flying: 0.5, grass: 0.5, poison: 0.5, water: 2, ground: 2, rock: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2 },
  rock: { fire: 2, flying: 2, ground: 0.5 },
  ground: { electric: 2, fire: 2, poison: 2, rock: 2, grass: 0.5, flying: 0 },
  poison: { poison: 0.5, ground: 0.5, rock: 0.5, grass: 2 },
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
