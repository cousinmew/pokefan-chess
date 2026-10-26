// SPDX-License-Identifier: AGPL-3.0-only
// Journey trainers play on their own Pokémon (playtest, 23 Oct: BROCK wore Team Rocket's pieces).
import { describe, expect, it } from 'vitest';
import { BOARDS, boardOf } from '../../src/campaign/boards';
import { PLACES, type Trainer } from '../../src/campaign/journey';
import { loadCampaign } from '../../src/campaign/kanto';
import { yourSpecies } from '../../src/campaign/rivalTeam';
import { knownSpecies, SKIN_ROLES } from '../../src/board/pieces';
import sources from '../../src/data/journey-boards.sources.json';

const SOURCES = sources.trainers as Record<string, string>;

const trainers = PLACES.flatMap((p) => (p.trainers ?? []).map((t) => ({ p, t })));
const brock = trainers.find((x) => x.t.id === 'gym-brock')!.t;

describe('Journey trainers\' boards (playtest, 23 Oct)', () => {
  it('every trainer but the rivals has a full canon board with its card team on it, and a source', () => {
    for (const { p, t } of trainers) {
      if (p.kind === 'rival') {
        expect(BOARDS[t.id], t.id).toBeUndefined();
        continue;
      }
      const b = BOARDS[t.id]!;
      expect(b, t.id).toBeDefined();
      for (const role of SKIN_ROLES) expect(knownSpecies(b.team[role]), `${t.id} ${role}`).toBe(true);
      for (const id of t.team) expect(Object.values(b.team), `${t.id} shows ${id} on its card`).toContain(id);
      expect(b.spare.length, t.id).toBeGreaterThan(0);
      expect(SOURCES[t.id], t.id).toMatch(/Bulbapedia/);
      expect(SOURCES[t.id], t.id).not.toMatch(/https?:/);
    }
  });

  it('BROCK plays on his own rock team', () => {
    const c = { ...loadCampaign(), starter: 'squirtle' };
    const skin = boardOf(c, brock)!;
    expect(skin.k).toBe('onix');
    expect(new Set(Object.values(skin))).toEqual(new Set(['onix', 'geodude', 'sandshrew', 'diglett']));
  });

  it('a species on your side gives way to the trainer\'s next free spare, in every slot it held', () => {
    const c = { ...loadCampaign(), starter: 'squirtle', team: { r: 'sandshrew' } };
    expect(yourSpecies(c).has('sandshrew')).toBe(true);
    const skin = boardOf(c, brock)!;
    expect(Object.values(skin)).not.toContain('sandshrew');
    expect(skin.r).toBe('aerodactyl');
    expect(skin.bLight).toBe('aerodactyl');
  });

  it('no trainer\'s board shares a species with your default side', () => {
    const c = { ...loadCampaign(), starter: 'charmander' };
    const yours = yourSpecies(c);
    for (const { t } of trainers) {
      const skin = boardOf(c, t as Trainer);
      if (skin) for (const id of Object.values(skin)) expect(yours.has(id), `${t.id} ${id}`).toBe(false);
    }
  });
});
