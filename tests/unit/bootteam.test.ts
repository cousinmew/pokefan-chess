// SPDX-License-Identifier: AGPL-3.0-only
// Boot fix, 14 Oct: a save whose My Team names a species this build does not know ("missingno": a save from another
// build, an edited backup or save code) crashed boot, since JourneyGame's constructor prefetches My Team's art
// (teamArt read SPECIES[...]!.dex unchecked). Loading drops such slots, teamArt stands the default piece in, and
// Import and save codes (unpackSave) store only known slots.
import { afterEach, describe, expect, it } from 'vitest';

const store = new Map<string, string>();
const storage = new Proxy(
  { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) },
);
(globalThis as unknown as { window: unknown }).window = { localStorage: storage, setTimeout: () => 0 };

const { knownSpecies, knownTeam, SPECIES, spriteUrl } = await import('../../src/board/pieces');
const { loadCampaign } = await import('../../src/campaign/kanto');
const { teamArt } = await import('../../src/ui/kanto');
const { unpackSave } = await import('../../src/store/backup');

const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 } };
const stored = () => JSON.parse(store.get('kc:v1:p1:campaign') ?? 'null') as { team?: object; name?: string } | null;

afterEach(() => store.clear());

describe('knownTeam: My Team keeps the species this build knows', () => {
  it('known species and their variants stay; unknown ids, own-key tricks and non-strings go', () => {
    expect(knownSpecies('pidgey:s:2')).toBe(true);
    expect(knownSpecies('missingno')).toBe(false);
    expect(knownSpecies('constructor')).toBe(false); // SPECIES['constructor'] is Object's, not a species
    expect(knownTeam({ k: 'pikachu', n: 'missingno', p: 'pidgey:s:2', q: 'toString', r: 7, bLight: null, x: 'pidgey' })).toEqual({ k: 'pikachu', p: 'pidgey:s:2' });
  });

  it('the slots keep their order (the §B14 migration lists its notice in it)', () => {
    expect(Object.keys(knownTeam({ n: 'rapidash', bLight: 'missingno', k: 'pikachu', p: 'pidgey' }))).toEqual(['n', 'k', 'p']);
  });

  it('anything that is not a team: none', () => {
    for (const t of [undefined, null, 'pidgey', 3, []]) expect(knownTeam(t)).toEqual({});
  });
});

describe('a save with an unknown My Team species', () => {
  it('loads without it (the base build kept "missingno" and boot threw)', () => {
    store.set('kc:v1:p1:campaign', JSON.stringify({ ...SAVE, team: { n: 'missingno', p: 'pidgey' } }));
    expect(loadCampaign().team).toEqual({ p: 'pidgey' });
  });

  it("teamArt never throws: an unknown slot shows the default piece's Gen 1 sprite, as the board does", () => {
    const c = { ...loadCampaign(), team: { n: 'missingno', p: 'pidgey' } };
    const art = teamArt(c); // base: TypeError, reading 'dex' of undefined
    const plain = teamArt({ ...c, team: { p: 'pidgey' } });
    expect(art).toEqual(plain);
    expect(art).toHaveLength(7);
    expect(art).toContain(spriteUrl(SPECIES.pidgey!.dex, 'retro'));
  });

  it('Import and save codes (unpackSave) store only the known slots, and everything else as it was', () => {
    const data = { cartridge: 'blue', lang: 'de', campaign: { ...SAVE, name: 'SKY', team: { n: 'missingno', p: 'pidgey', k: 'constructor' } } };
    expect(unpackSave({ app: 'pokefan-chess', v: 1, data }, 1)).toBe(true);
    expect(stored()).toEqual({ ...SAVE, name: 'SKY', team: { p: 'pidgey' } }); // base: the unknown ids were stored
    expect(store.get('kc:v1:p1:lang')).toBe('"de"');
    expect(store.get('kc:v1:p1:cartridge')).toBe('"blue"');
  });

  it('a backup without a team, or without a campaign, is restored untouched', () => {
    expect(unpackSave({ app: 'pokefan-chess', v: 1, data: { campaign: SAVE } }, 1)).toBe(true);
    expect(stored()).toEqual(SAVE);
    expect(unpackSave({ app: 'pokefan-chess', v: 1, data: { cartridge: 'yellow' } }, 1)).toBe(true);
    expect(stored()).toBeNull();
    expect(store.get('kc:v1:p1:cartridge')).toBe('"yellow"');
  });
});
