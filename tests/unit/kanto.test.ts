// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { catchChance, chooseStarter, loadCampaign, mastered, recordRoute, rollSlotIndex, ROUTES, slotsOf, throwBall, unlocked } from '../../src/campaign/kanto';
import { createRng } from '../../src/game/rng';
import { SPECIES, setSkins, speciesIdFor } from '../../src/board/pieces';

describe('Kanto encounter tables', () => {
  it('Route 1 matches PokéAPI (Red, walk): Pidgey 20/10/10/5/4/1, Rattata 20/15/10/5', () => {
    const r1 = ROUTES[0]!;
    expect(r1.area).toBe('kanto-route-1-area');
    expect(r1.encounters.map((e) => [e.species, e.slots])).toEqual([
      ['pidgey', [20, 10, 10, 5, 4, 1]],
      ['rattata', [20, 15, 10, 5]],
    ]);
  });

  it('every route sums to 100% (Red and Blue) and every species is known', () => {
    for (const r of ROUTES) {
      expect(slotsOf(r).reduce((n, s) => n + s.chance, 0), r.id).toBe(100);
      expect(slotsOf(r, 'blue').reduce((n, s) => n + s.chance, 0), `${r.id} blue`).toBe(100);
      for (const e of r.encounters) expect(SPECIES[e.species], e.species).toBeDefined();
    }
  });

  it.each(ROUTES.map((r) => [r.id, r] as const))('10,000 seeded rolls on %s land within 2 points of each slot, Red and Blue', (_id, route) => {
    for (const version of ['red', 'blue'] as const) {
      const rng = createRng(151);
      const slots = slotsOf(route, version);
      const hits = slots.map(() => 0);
      for (let i = 0; i < 10_000; i++) hits[rollSlotIndex(route, rng, version)]!++;
      slots.forEach((s, i) => expect(Math.abs((hits[i]! / 10_000) * 100 - s.chance), `${version} ${s.species} ${s.chance}%`).toBeLessThanOrEqual(2));
    }
  });
});

describe('catching and mastery', () => {
  it('catch chances follow §B4', () => {
    const common = { species: 'pidgey', chance: 20 };
    const rare = { species: 'pidgey', chance: 4 };
    expect([catchChance(common, 'first', 0), catchChance(rare, 'first', 0), catchChance(common, 'hint', 0), catchChance(rare, 'hint', 0)]).toEqual([1, 0.6, 0.5, 0.2]);
    expect(catchChance(rare, 'first', 3)).toBe(1);
  });

  it('a streak of 3 first try solves guarantees the next rare catch, then resets', () => {
    let c = chooseStarter(loadCampaign(), 'charmander');
    for (let i = 0; i < 3; i++) c = recordRoute(c, 'route-1', 'solved');
    const fail = { next: () => 0.99, seed: (n: number) => n, calls: () => 0 };
    const res = throwBall(c, 'route-1', { species: 'pidgey', chance: 1 }, 'first', fail);
    expect(res.caught).toBe(true);
    expect(res.campaign.routes['route-1']!.streak).toBe(0);
    expect(res.campaign.caught.pidgey).toBe(1);
  });

  it('8 of the last 10 solved still measures mastery; routes now open by beating trainers (§B11)', () => {
    let c = chooseStarter(loadCampaign(), 'bulbasaur');
    expect(unlocked(c, 0)).toBe(true);
    expect(unlocked(c, 1)).toBe(false);
    for (let i = 0; i < 7; i++) c = recordRoute(c, 'route-1', 'solved');
    c = recordRoute(c, 'route-1', 'missed');
    expect(mastered(c, 'route-1')).toBe(false);
    c = recordRoute(c, 'route-1', 'assisted');
    expect(mastered(c, 'route-1')).toBe(true);
    expect(unlocked(c, 1)).toBe(false);
    c = { ...c, journey: { ...c.journey, cleared: ['route-1', 'viridian', 'rival-1'] } };
    expect(unlocked(c, 1)).toBe(true);
  });

  it('a skin replaces the default species for that side only', () => {
    setSkins({ w: { q: 'charmander', bDark: 'pidgey' } });
    expect(speciesIdFor('w', 'q', 'd1')).toBe('charmander');
    expect(speciesIdFor('w', 'b', 'c1')).toBe('pidgey');
    expect(speciesIdFor('w', 'b', 'f1')).toBe('blastoise');
    expect(speciesIdFor('b', 'q', 'd8')).toBe('nidoqueen');
    setSkins({});
    expect(speciesIdFor('w', 'q', 'd1')).toBe('charizard');
  });
});
