// SPDX-License-Identifier: AGPL-3.0-only
// Data loss review, 13 Oct: the MEIR unlock and the puzzle record shared the save key 'trainer', so the first rated
// puzzle after the MEIR code put RED back (the name stayed MEIR), and the MEIR code after puzzles wiped the Trainer
// Level. MEIR has its own key now; boot and a restored backup move an old unlock there, never a puzzle record.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRow } from '../../src/campaign/puzzle';

vi.mock('../../src/ui/dom', async (real) => ({ ...(await real<typeof import('../../src/ui/dom')>()), toast: () => undefined }));

const store = new Map<string, string>();
const session = new Map<string, string>();
const storage = (m: Map<string, string>) =>
  new Proxy(
    { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) },
    { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) },
  );
(globalThis as unknown as { window: unknown }).window = { localStorage: storage(store), sessionStorage: storage(session), setTimeout: () => 0 };

const { bootProfiles, profileData, useProfile } = await import('../../src/store/persist');
const { packSave, unpackSave } = await import('../../src/store/backup');
const { meirJoins, myLook, myTrainer } = await import('../../src/look');
const { loadTrainer, record } = await import('../../src/campaign/trainer');
const { loadCampaign } = await import('../../src/campaign/kanto');
const { hasProgress, summaries } = await import('../../src/profiles');
const { duoSide } = await import('../../src/startFlow');

const ROW: PuzzleRow = ['00sHx', '8/8/8/8/8/8/8/K6k w - - 0 1', 'a1a2 h1h2', 1200];
const ROW2: PuzzleRow = ['00xyz', '8/8/8/8/8/8/8/K6k w - - 0 1', 'a1b1 h1g1', 1300];
/** Everything that shows the player's trainer: the sprite, the relay look, a Two Players side and the save list. */
const meirEverywhere = () => [myTrainer(), myLook(true, 0).trainer, duoSide(1, 'w').trainer, summaries(true)[0]?.trainer];

afterEach(() => {
  store.clear();
  session.clear();
});

describe('MEIR and the puzzle record keep their own keys', () => {
  it('MEIR, then a rated puzzle: MEIR stays', () => {
    bootProfiles();
    meirJoins(loadCampaign());
    const t = record(loadTrainer(), ROW, 'solved');
    expect(meirEverywhere()).toEqual(['meir', 'meir', 'meir', 'meir']);
    expect(loadTrainer()).toEqual(t);
    expect(loadCampaign().name).toBe('MEIR');
  });

  it('rated puzzles, then MEIR: the record stays', () => {
    bootProfiles();
    const t = record(record(loadTrainer(), ROW, 'solved'), ROW2, 'missed');
    meirJoins(loadCampaign());
    expect(loadTrainer()).toEqual(t);
    expect([t.solved, t.missed, t.seen]).toEqual([1, 1, ['00sHx', '00xyz']]);
    expect(meirEverywhere()).toEqual(['meir', 'meir', 'meir', 'meir']);
    expect(hasProgress(1)).toBe(true);
  });

  it('boot moves an old MEIR unlock to its own key in every save; a puzzle record is never touched', () => {
    const rec = JSON.stringify({ rating: { r: 1450, rd: 200, vol: 0.06 }, solved: 3, missed: 1, assisted: 0, seen: ['00sHx'] });
    store.set('kc:v1:profiles', JSON.stringify({ slots: [1, 2, 3], current: 2 }));
    store.set('kc:v1:p1:trainer', '"meir"');
    store.set('kc:v1:p1:campaign', '{"name":"MEIR"}');
    store.set('kc:v1:p2:trainer', rec);
    store.set('kc:v1:p3:trainer', '"meir"');
    bootProfiles();
    expect([...store].filter(([k]) => /rainer$/.test(k)).sort()).toEqual([['kc:v1:p1:playerTrainer', '"meir"'], ['kc:v1:p2:trainer', rec], ['kc:v1:p3:playerTrainer', '"meir"']]);
    expect(hasProgress(3)).toBe(true); // the MEIR code is progress (data loss review, 12 Oct)
    // The first rated puzzle after the move keeps MEIR.
    useProfile(1);
    record(loadTrainer(), ROW, 'solved');
    expect(meirEverywhere()).toEqual(['meir', 'meir', 'meir', 'meir']);
    expect(loadTrainer().solved).toBe(1);
  });

  it('a save from before profiles: its MEIR moves into slot 1, then to its own key', () => {
    store.set('kc:v1:trainer', '"meir"');
    bootProfiles();
    expect(profileData(1)).toEqual({ playerTrainer: 'meir' });
    expect(myTrainer()).toBe('meir');
  });

  it('Export and save codes carry both keys; an old backup restores MEIR to its own key', () => {
    bootProfiles();
    meirJoins(loadCampaign());
    const t = record(loadTrainer(), ROW, 'solved');
    const file = JSON.parse(JSON.stringify(packSave(1))) as ReturnType<typeof packSave>;
    expect(file.data).toMatchObject({ playerTrainer: 'meir', trainer: t });
    expect(unpackSave(file, 2)).toBe(true);
    expect(profileData(2)).toEqual(profileData(1));
    // A file or code made before this fix: 'trainer' holds "meir".
    expect(unpackSave({ app: 'pokefan-chess', v: 1, data: { trainer: 'meir', campaign: { name: 'MEIR' } } }, 3)).toBe(true);
    expect(profileData(3)).toEqual({ playerTrainer: 'meir', campaign: { name: 'MEIR' } });
  });
});
