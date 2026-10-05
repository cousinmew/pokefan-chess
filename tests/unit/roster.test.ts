// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import roster from '../../src/data/roster.gen1.json';
import { ROLES, speciesIdFor, type Color } from '../../src/board/pieces';

describe('roster', () => {
  it('2 teams x 6 roles resolve to a species, both bishop colours too', () => {
    for (const color of ['w', 'b'] as Color[]) {
      for (const role of ROLES) {
        for (const sq of ['a1', 'b1']) expect(roster.species).toHaveProperty(speciesIdFor(color, role, sq));
      }
      expect(speciesIdFor(color, 'b', 'a1')).not.toBe(speciesIdFor(color, 'b', 'b1'));
    }
  });
  it('every species move and fallback exists, every move has an fx id', () => {
    for (const s of Object.values(roster.species) as { move: string; fallback?: string }[]) {
      expect(roster.moves).toHaveProperty(s.move);
      if (s.fallback) expect(roster.moves).toHaveProperty(s.fallback);
    }
    for (const m of Object.values(roster.moves)) expect(m.fx).toMatch(/^[a-z]+$/);
  });
});
