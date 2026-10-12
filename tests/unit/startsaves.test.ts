// SPDX-License-Identifier: AGPL-3.0-only
// Playtest 12 Oct (W1): which saves count as progress, the NEW GAME "creating" flag, the double tap latch, and boot
// dropping an empty save left behind.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const session = new Map<string, string>();
let reloads = 0;
const storage = (m: Map<string, string>) =>
  new Proxy(
    { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) },
    { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) },
  );
(globalThis as unknown as { window: unknown }).window = { localStorage: storage(store), sessionStorage: storage(session) };
(globalThis as unknown as { location: unknown }).location = { reload: () => void reloads++ };

/** Fresh modules for each test, so the latch starts open. */
async function fresh() {
  vi.resetModules();
  const persist = await import('../../src/store/persist');
  const profiles = await import('../../src/profiles');
  return { ...persist, ...profiles };
}
await fresh(); // the first import transforms the whole game data; done here, outside the per test timeout
const set = (k: string, v: unknown) => store.set(`kc:v1:${k}`, JSON.stringify(v));
const meta = () => JSON.parse(store.get('kc:v1:profiles') ?? 'null') as { slots: number[]; current: number } | null;

beforeEach(() => {
  store.clear();
  session.clear();
  reloads = 0;
});

describe('hasProgress', () => {
  it('a cartridge alone, or an intro seen, is not progress', async () => {
    const { hasProgress } = await fresh();
    expect(hasProgress(1)).toBe(false);
    set('p1:cartridge', 'blue');
    set('p1:campaign', { introSeen: true, caught: {}, path: 0, playMs: 0 });
    expect(hasProgress(1)).toBe(false);
  });

  it.each([
    ['a starter', 'campaign', { starter: 'charmander' }],
    ['a name', 'campaign', { name: 'JADE' }],
    ['a YELLOW lesson', 'campaign', { path: 1 }],
    ['a YELLOW win', 'campaign', { yellowWins: 1 }],
    ['a catch', 'campaign', { caught: { pidgey: 1 } }],
    ['a game played', 'gamesPlayed', 1],
    ['a Two Players win', 'duoWins', 2],
    ['a game in progress', 'game', { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', pgn: '' }],
  ])('%s is progress', async (_, key, value) => {
    const { hasProgress } = await fresh();
    set(`p2:${key}`, value);
    expect(hasProgress(2)).toBe(true);
    expect(hasProgress(1)).toBe(false);
  });

  it('summaries leave empty saves out, except for the replace list', async () => {
    const { summaries } = await fresh();
    set('profiles', { slots: [1, 2], current: 1 });
    set('p1:cartridge', 'blue');
    set('p2:campaign', { name: 'SKY', path: 0 });
    expect(summaries().map((s) => s.n)).toEqual([2]);
    expect(summaries(true).map((s) => s.n)).toEqual([1, 2]);
  });

  it('a YELLOW save counts once the cartridge is chosen (it has no name step)', async () => {
    const { hasProgress } = await fresh();
    set('p1:cartridge', 'yellow');
    expect(hasProgress(1)).toBe(true);
  });
});

describe('NEW GAME and BACK', () => {
  it('NEW GAME on an empty save reuses it: no new slot', async () => {
    const { bootProfiles, addProfile, reuseEmpty, isCreating } = await fresh();
    set('p1:cartridge', 'blue');
    bootProfiles();
    expect(reuseEmpty()).toBe(true);
    expect(isCreating()).toBe(true);
    addProfile();
    expect(meta()).toEqual({ slots: [1], current: 1 });
  });

  it('a double tap on NEW GAME makes one save', async () => {
    const { bootProfiles, addProfile } = await fresh();
    set('p1:campaign', { name: 'ASH' });
    bootProfiles();
    addProfile();
    addProfile();
    expect(meta()).toEqual({ slots: [1, 2], current: 2 });
    expect(reloads).toBe(1);
  });

  it('BACK drops only the save being created, and only while it is current', async () => {
    let m = await fresh();
    set('profiles', { slots: [1, 2], current: 1 });
    set('p1:campaign', { name: 'ASH' });
    set('p2:campaign', { name: 'SKY' });
    m.bootProfiles();
    m.addProfile(); // slot 3, from 1
    expect(meta()).toEqual({ slots: [1, 2, 3], current: 3 });
    // The reload; then the player switches to SKY without naming the new save (the bugs.md #2 repro).
    m = await fresh();
    m.bootProfiles();
    expect(m.isCreating()).toBe(true);
    m.switchTo(2, 'continue');
    expect(session.has('kc:v1:creating')).toBe(false);
    m = await fresh();
    m.bootProfiles();
    expect(m.isCreating()).toBe(false);
    m.abandonNewGame();
    expect(store.get('kc:v1:p2:campaign')).toBe('{"name":"SKY"}');
    expect(meta()?.slots).toContain(2);
    // Even with a stale flag naming another save, BACK leaves SKY alone.
    session.set('kc:v1:creating', '1:3');
    m.abandonNewGame();
    expect(store.get('kc:v1:p2:campaign')).toBe('{"name":"SKY"}');
    expect(reloads).toBe(2); // NEW GAME and the switch to SKY; neither BACK reloaded
  });

  it('BACK from a new save returns to the previous one with storage as it was', async () => {
    let m = await fresh();
    set('profiles', { slots: [1], current: 1 });
    set('p1:campaign', { name: 'ASH', starter: 'squirtle' });
    const before = JSON.stringify([...store].sort());
    m.bootProfiles();
    m.addProfile();
    m = await fresh();
    m.bootProfiles();
    m.saveTo(2, 'cartridge', 'blue');
    m.abandonNewGame();
    expect(JSON.stringify([...store].sort())).toBe(before);
    expect(m.isCreating()).toBe(false);
  });
});

describe('boot', () => {
  const abandoned = (m: Awaited<ReturnType<typeof fresh>>) => (n: number) => !m.hasProgress(n) && !m.isCreating(n);

  it('drops an empty current save when others exist', async () => {
    const m = await fresh();
    set('profiles', { slots: [1, 2], current: 2 });
    set('p1:campaign', { name: 'ASH' });
    set('p2:cartridge', 'blue');
    expect(m.bootProfiles(abandoned(m))).toEqual({ slots: [1], current: 1 });
    expect(store.has('kc:v1:p2:cartridge')).toBe(false);
    expect(m.currentSlot()).toBe(1);
  });

  it('drops an empty save left behind that is not current, too', async () => {
    const m = await fresh();
    set('profiles', { slots: [1, 2, 3], current: 2 });
    set('p1:campaign', { name: 'ASH' });
    set('p2:campaign', { name: 'SKY' });
    set('p3:cartridge', 'blue');
    expect(m.bootProfiles(abandoned(m))).toEqual({ slots: [1, 2], current: 2 });
  });

  it('keeps it while it is being created, and keeps a lone empty save', async () => {
    let m = await fresh();
    set('profiles', { slots: [1, 2], current: 2 });
    set('p1:campaign', { name: 'ASH' });
    session.set('kc:v1:creating', '1:2');
    expect(m.bootProfiles(abandoned(m))).toEqual({ slots: [1, 2], current: 2 });
    store.clear();
    session.clear();
    m = await fresh();
    set('p1:cartridge', 'blue');
    expect(m.bootProfiles(abandoned(m))).toEqual({ slots: [1], current: 1 });
    expect(store.has('kc:v1:p1:cartridge')).toBe(true);
  });

  it('another tab booting keeps a save this tab is still making, until the name is confirmed (review fix)', async () => {
    const tabA = await fresh();
    set('profiles', { slots: [1], current: 1 });
    set('p1:campaign', { name: 'ASH' });
    tabA.bootProfiles();
    tabA.addProfile(); // slot 2, still unnamed
    tabA.saveTo(2, 'cartridge', 'blue');
    // Tab B: its own session storage, the same device storage.
    session.clear();
    const tabB = await fresh();
    const gone = (n: number) => !tabB.hasProgress(n) && !tabB.isCreating(n) && !tabB.beingMade(n);
    expect(tabB.bootProfiles(gone).slots).toEqual([1, 2]);
    expect(store.has('kc:v1:p2:cartridge')).toBe(true);
    // Half an hour later the note is stale (a tab closed mid NEW GAME): the empty save goes.
    expect(tabB.beingMade(2, Date.now() + tabB.NEW_GAME_HOLD_MS + 1)).toBe(false);
  });

  it('confirming the name or BACK clears the device note', async () => {
    let m = await fresh();
    set('profiles', { slots: [1], current: 1 });
    set('p1:campaign', { name: 'ASH' });
    m.bootProfiles();
    m.addProfile();
    m = await fresh();
    m.bootProfiles();
    expect(m.beingMade(2)).toBe(true);
    m.endCreating();
    expect(m.beingMade(2)).toBe(false);
    m.addProfile(); // slot 2 has no progress: reused in place
    m = await fresh();
    m.bootProfiles();
    expect(m.beingMade(2)).toBe(true);
    m.abandonNewGame();
    expect(m.beingMade(2)).toBe(false);
  });
});
