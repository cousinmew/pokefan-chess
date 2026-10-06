// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { addCatch, awardMew, championLevel, chooseStarter, DEX, loadCampaign, teamBadges, tradeEvolve } from '../../src/campaign/kanto';
import { PLACES, placeIndex, placeUnlocked } from '../../src/campaign/journey';
import { drillStatus } from '../../src/campaign/drill';

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
};
afterEach(() => store.clear());

describe('queen grandfathering (C3 quick fix)', () => {
  it('a save from before C2c keeps its queen slot, even with no badge', () => {
    store.set('kc:v1:campaign', JSON.stringify({ v: 2, starter: 'charmander', caught: { charmander: 1, charizard: 1 }, team: { q: 'charizard' } }));
    const c = loadCampaign();
    expect(c.queenOpen).toBe(true);
    expect(teamBadges(c)).toBe(1);
    expect(c.team.q).toBe('charizard');
  });

  it('a pre C2c save that C2c already reverted gets its eligible queen back from the notice', () => {
    store.set('kc:v1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', caught: { squirtle: 1, blastoise: 1 }, team: {}, teamRules: 1, teamNotice: [['q', 'blastoise'], ['p', 'blastoise']] }));
    const c = loadCampaign();
    expect(c.team.q).toBe('blastoise');
    expect(c.teamNotice).toEqual([['p', 'blastoise']]);
    expect(c.teamRules).toBe(2);
  });

  it('a save made after C2c (intro seen) waits for the first badge', () => {
    store.set('kc:v1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', introSeen: true, teamRules: 1, caught: { squirtle: 1 } }));
    expect(teamBadges(loadCampaign())).toBe(0);
  });
});

describe('gyms block the journey (C3)', () => {
  it('Route 3 opens only with the BOULDERBADGE; a place cleared before C3 stays open', () => {
    let c = chooseStarter(loadCampaign(), 'squirtle');
    c = { ...c, journey: { ...c.journey, cleared: ['route-1', 'viridian', 'rival-1', 'viridian-forest'] } };
    const r3 = placeIndex('route-3');
    expect(placeUnlocked(c, placeIndex('pewter-gym'))).toBe(true);
    expect(placeUnlocked(c, r3)).toBe(false);
    expect(placeUnlocked({ ...c, badges: ['boulder'] }, r3)).toBe(true);
    expect(placeUnlocked({ ...c, journey: { ...c.journey, cleared: [...c.journey.cleared, 'route-3'] } }, r3)).toBe(true);
    // Mewtwo's cave (optional, after the Champion) opens only once BLUE is beaten.
    const all = PLACES.filter((p) => !p.optional && p.kind !== 'gym' && p.kind !== 'champion').map((p) => p.id);
    const done = { ...c, badges: PLACES.flatMap((p) => (p.badge ? [p.badge] : [])), journey: { ...c.journey, cleared: all } };
    expect(placeUnlocked(done, placeIndex('cerulean-cave'))).toBe(false);
    expect(placeUnlocked({ ...done, champion: true }, placeIndex('cerulean-cave'))).toBe(true);
    // Optional places never block: the Mt. Moon fossil test can be skipped.
    expect(PLACES[placeIndex('mt-moon')]!.optional).toBe(true);
  });
});

describe('Victory Road and Champion', () => {
  it('the K+Q vs K drill detects mate within the move limit, and running out of moves', () => {
    const chess = new Chess('k7/8/1K6/8/8/8/8/7Q w - - 0 1');
    expect(drillStatus(chess, 0, 15, 'w')).toBe('playing');
    chess.move('Qh8#');
    expect(drillStatus(chess, 1, 15, 'w')).toBe('mate');
    const slow = new Chess('8/8/8/4k3/8/8/8/4K2Q w - - 0 1');
    slow.move('Qh2+');
    slow.move('Ke6');
    expect(drillStatus(slow, 15, 15, 'w')).toBe('limit');
    // Leaving the lone king no moves without check is a stalemate: the drill fails as a draw.
    const stale = new Chess('k7/8/1K6/8/8/8/8/2Q5 w - - 0 1');
    stale.move('Qc7');
    expect(drillStatus(stale, 1, 15, 'w')).toBe('draw');
  });

  it('Champion BLUE plays at a level set by the Trainer Level', () => {
    expect([600, 900, 1200, 1500].map(championLevel)).toEqual([1, 2, 3, 4]);
  });
});

describe('§B12 part 2', () => {
  it('a save with 150 caught receives Mew, once', () => {
    let c = loadCampaign();
    for (const s of DEX.filter((x) => x !== 'mew')) c = addCatch(c, s, false, 'route-1');
    const m = awardMew(c)!;
    expect(m.caught.mew).toBe(1);
    expect(awardMew(m)).toBeNull();
    expect(awardMew(loadCampaign())).toBeNull();
  });

  it('an online win evolves trade Pokémon on the team, keeping the old one', () => {
    let c = chooseStarter(loadCampaign(), 'squirtle');
    c = addCatch(c, 'kadabra', false, 'route-1');
    c = { ...c, team: { n: 'kadabra:s' } };
    const r = tradeEvolve(c);
    expect(r.evolved).toEqual([['kadabra', 'alakazam']]);
    expect(r.campaign.caught.alakazam).toBe(1);
    expect(r.campaign.caught.kadabra).toBe(1);
    expect(tradeEvolve({ ...c, team: {} }).evolved).toEqual([]);
  });
});
