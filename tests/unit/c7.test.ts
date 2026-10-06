// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { stageEvolutions, stageFor, stageSkin } from '../../src/board/stages';
import { defaultSpecies, setStages, speciesIdFor, SPECIES } from '../../src/board/pieces';
import { codeReader, SECRET, type CodeKey } from '../../src/ui/secret';
import { AnimeLayer, FlashGuard } from '../../src/battle/anime';

describe('BLUE story stages (§B18 item 5)', () => {
  it('evolves at 3 and 6 badges', () => {
    expect([0, 2, 3, 5, 6, 8].map(stageFor)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('follows the table, and every stage species exists', () => {
    setStages({ w: stageSkin('w', 0), b: stageSkin('b', 0) });
    expect(['d1', 'c1', 'f1', 'b1', 'a1', 'e1', 'a2'].map((sq) => speciesIdFor('w', ({ d1: 'q', c1: 'b', f1: 'b', b1: 'n', a1: 'r', e1: 'k', a2: 'p' } as const)[sq as 'd1'], sq))).toEqual(['charmander', 'bulbasaur', 'squirtle', 'ponyta', 'snorlax', 'pikachu', 'eevee']);
    expect(['e8', 'd8', 'c8', 'f8', 'b8', 'a8', 'a7'].map((sq) => speciesIdFor('b', ({ e8: 'k', d8: 'q', c8: 'b', f8: 'b', b8: 'n', a8: 'r', a7: 'p' } as const)[sq as 'e8'], sq))).toEqual(['nidoran-m', 'nidoran-f', 'ekans', 'koffing', 'diglett', 'rhyhorn', 'rattata']);
    setStages({ w: stageSkin('w', 1), b: stageSkin('b', 1) });
    expect(speciesIdFor('b', 'q', 'd8')).toBe('nidorina');
    setStages({ w: stageSkin('w', 2), b: stageSkin('b', 2) });
    expect(speciesIdFor('w', 'q', 'd1')).toBe('charizard');
    for (const c of ['w', 'b'] as const) for (const st of [0, 1] as const) for (const id of Object.values(stageSkin(c, st))) expect(SPECIES[id!], id).toBeDefined();
  });

  it('lists every piece that evolves at a threshold', () => {
    const base = (c: 'w' | 'b') => (role: 'k' | 'q' | 'r' | 'b' | 'n' | 'p', dark: boolean) => defaultSpecies(c, role, dark);
    expect(stageEvolutions('w', 0, 1, base('w'))).toEqual([['charmander', 'charmeleon'], ['ponyta', 'rapidash'], ['squirtle', 'wartortle'], ['bulbasaur', 'ivysaur']]);
    expect(stageEvolutions('w', 1, 2, base('w'))).toEqual([['charmeleon', 'charizard'], ['wartortle', 'blastoise'], ['ivysaur', 'venusaur']]);
    expect(stageEvolutions('b', 1, 2, base('b')).map((e) => e[1])).toEqual(['nidoking', 'nidoqueen']);
    expect(stageEvolutions('w', 1, 1, base('w'))).toEqual([]);
  });
});

describe('secret code (§B18 item 7)', () => {
  it('opens only on the full sequence, and recovers from a slip', () => {
    const read = codeReader();
    expect(SECRET.map(read).at(-1)).toBe(true);
    const r2 = codeReader();
    expect((['up', 'down', ...SECRET] as CodeKey[]).map((k) => r2(k)).at(-1)).toBe(true);
    const r3 = codeReader();
    expect((SECRET.slice(0, 9).concat(['b']) as CodeKey[]).some((k) => r3(k))).toBe(false);
  });
});

describe('anime safety (§B18 item 6)', () => {
  it('never allows a 4th flash inside 1 s', () => {
    const g = new FlashGuard();
    expect([0, 100, 200, 300, 1100].map((t) => g.allow(t))).toEqual([true, true, true, false, true]);
    expect(g.worstSecond()).toBe(3);
  });

  it('the slow beat keeps the ends and only slows the last stretch', () => {
    expect(AnimeLayer.slowBeat(0)).toBe(0);
    expect(AnimeLayer.slowBeat(1)).toBeCloseTo(1);
    expect(AnimeLayer.slowBeat(0.9) - AnimeLayer.slowBeat(0.8)).toBeLessThan(0.1);
  });
});
