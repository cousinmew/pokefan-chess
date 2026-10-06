// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import Ajv from 'ajv';
import journey from '../../src/data/journey.kanto.json';
import schema from '../../schemas/journey.schema.json';
import strings from '../../src/data/strings.en.json';
import { addCatch, chooseStarter, DEX, evolutionsOf, evolve, loadCampaign, SOURCES, sendToOak, starsOf } from '../../src/campaign/kanto';
import { beatTrainer, clearPlace, PLACES, placeUnlocked } from '../../src/campaign/journey';
import { SPECIES } from '../../src/board/pieces';

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
};
afterEach(() => store.clear());

describe('journey data (§B11)', () => {
  it('validates against schemas/journey.schema.json', () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    expect(validate(journey), JSON.stringify(validate.errors)).toBe(true);
  });

  it('every trainer, place and story line string is in strings.en.json', () => {
    const keys: string[] = [journey.rival.class, journey.rival.name];
    for (const p of journey.places) {
      if (p.name) keys.push(p.name);
      keys.push(...(p.story ?? []));
      for (const t of p.trainers ?? []) keys.push(t.class, t.name, t.defeat);
    }
    keys.push('story.oak.starter', 'story.route.cleared', 'trainer.wants', 'trainer.lost');
    for (const k of keys) expect(strings, k).toHaveProperty([k]);
  });

  it('Route 1 has 2 trainers; the rival comes after Viridian and fights with 5 puzzles', () => {
    const ids = PLACES.map((p) => p.id);
    expect(ids.slice(0, 4)).toEqual(['pallet', 'route-1', 'viridian', 'rival-1']);
    expect(PLACES[1]!.trainers).toHaveLength(2);
    expect(PLACES[3]!.trainers![0]).toMatchObject({ puzzles: 5, themes: 'learned' });
    for (const t of PLACES.flatMap((p) => p.trainers ?? [])) for (const s of t.team) if (s !== '@counter') expect(SPECIES[s], s).toBeDefined();
  });

  it('beating both Route 1 trainers, reading Viridian and beating the rival opens Viridian Forest', () => {
    let c = chooseStarter(loadCampaign(), 'squirtle');
    const [, r1, viridian, rival, forest] = PLACES;
    expect(placeUnlocked(c, 1)).toBe(true);
    expect(placeUnlocked(c, 2)).toBe(false);
    for (const t of r1!.trainers!) c = beatTrainer(c, r1!, t);
    expect(placeUnlocked(c, 2)).toBe(true);
    c = clearPlace(c, viridian!);
    expect(placeUnlocked(c, 3)).toBe(true);
    c = beatTrainer(c, rival!, rival!.trainers![0]!);
    expect(placeUnlocked(c, PLACES.indexOf(forest!))).toBe(true);
  });
});

describe('151 Pokédex (§B12)', () => {
  it('all 151 species have a planned source and are reachable from a non evolution source', () => {
    expect(DEX).toHaveLength(151);
    const base = new Set(['wild', 'starter', 'gift', 'fossil', 'legendary', 'award', 'prize']);
    const reach = new Set(DEX.filter((s) => SOURCES[s]!.some((x) => base.has(x.kind))));
    for (let pass = 0; pass < 4; pass++) for (const s of DEX) if (SOURCES[s]!.some((x) => x.from && reach.has(x.from))) reach.add(s);
    expect(DEX.filter((s) => !reach.has(s))).toEqual([]);
  });

  it('shiny front and back sprites exist for every catchable species', () => {
    const missing = DEX.filter((s) => !['front', 'back'].every((k) => existsSync(`public/assets/shiny/${k}/${SPECIES[s]!.dex}.gif`)));
    expect(missing).toEqual([]);
  });

  it('candy evolution adds the new species and keeps the old one caught', () => {
    let c = chooseStarter(loadCampaign(), 'charmander');
    for (let i = 0; i < 8; i++) c = addCatch(c, 'charmander', false, 'route-1');
    expect(c.candy.charmander).toBe(27);
    const e = evolutionsOf('charmander')[0]!;
    expect(e).toMatchObject({ to: 'charmeleon', stage: 1 });
    const next = evolve(c, e)!;
    expect(next.caught.charmeleon).toBe(1);
    expect(next.caught.charmander).toBe(9);
    expect(next.candy.charmander).toBe(2);
    expect(evolve(next, evolutionsOf('charmeleon')[0]!)).toBeNull();
    expect(evolutionsOf('kadabra')).toEqual([]);
  });

  it('duplicates sent to Oak earn candy and stars', () => {
    let c = addCatch(loadCampaign(), 'pidgey', false, 'route-1');
    for (let i = 0; i < 3; i++) c = addCatch(c, 'pidgey', false, 'route-1');
    for (let i = 0; i < 3; i++) c = sendToOak(c, 'pidgey')!;
    expect(c.caught.pidgey).toBe(1);
    expect(starsOf(c, 'pidgey')).toBe(1);
    expect(sendToOak(c, 'pidgey')).toBeNull();
  });

  it('a C2 (v1) save migrates without losing a catch', () => {
    store.set('kc:v1:p1:campaign', JSON.stringify({ starter: 'charmander', caught: { charmander: 1, pidgey: 2 }, routes: { 'route-1': { last: [true, true, true, true, true, true, true, true], streak: 2 } }, team: { q: 'pidgey' } }));
    const c = loadCampaign();
    expect(c.caught).toEqual({ charmander: 1, pidgey: 2 });
    // The team rules (§B14) then revert the queen slot: locked until a badge, and Pidgey is not fully evolved.
    expect(c.team).toEqual({});
    expect(c.teamNotice).toEqual([['q', 'pidgey']]);
    expect(c.candy).toEqual({ charmander: 3, pidgey: 6 });
    expect(c.seen).toEqual(expect.arrayContaining(['charmander', 'pidgey']));
    expect(c.journey.cleared).toContain('route-1');
    expect(c.v).toBe(2);
  });
});

describe('team rules (§B14)', () => {
  it('a real C2b save with an ineligible team migrates slot by slot, with one notice', async () => {
    const { whyNot } = await import('../../worker/src/team');
    // Shape and values of a save written by 07fb1c0 (C2b).
    store.set('kc:v1:p1:campaign', JSON.stringify({
      v: 2, name: 'RED', starter: 'charmander', caught: { charmander: 2, charmeleon: 1, pidgey: 4, pidgeotto: 1, rattata: 2, mewtwo: 1 }, shiny: { pidgey: 1 },
      oak: { pidgey: 3 }, candy: { charmander: 4, pidgey: 10, rattata: 6 }, seen: ['charmander', 'charmeleon', 'pidgey', 'pidgeotto', 'rattata', 'mewtwo'],
      caughtAt: { charmander: 'pallet', pidgey: 'route-1' }, routes: { 'route-1': { last: [true, true], streak: 2, shinyStreak: 2 } },
      journey: { cleared: ['route-1'], beaten: ['r1-toby', 'r1-mina'], visited: ['route-1'] },
      team: { k: 'charmeleon', q: 'charmander', r: 'pidgeotto', n: 'mewtwo', p: 'pidgey:s:1', bLight: 'rattata' }, playMs: 120000,
    }));
    const c = loadCampaign();
    expect(c.team).toEqual({ k: 'charmeleon', r: 'pidgeotto', p: 'pidgey:s:1' });
    expect(c.teamNotice).toEqual([['q', 'charmander'], ['n', 'mewtwo'], ['bLight', 'rattata']]);
    expect(c.caught.mewtwo).toBe(1);
    // Saved once: the next load keeps the team and does not repeat the notice list.
    expect(JSON.parse(store.get('kc:v1:p1:campaign')!).teamRules).toBe(2);
    expect(whyNot('q', 'mewtwo', 'charmander', 1)).toBeNull();
    expect(whyNot('n', 'tauros', 'charmander', 1)).toBeNull();
    expect(whyNot('p', 'tauros', 'charmander', 1)).toBeNull();
    expect(whyNot('k', 'squirtle', 'charmander', 1)).toBe('king');
    expect(whyNot('k', 'blastoise', null, 1)).toBeNull();
  });
});
