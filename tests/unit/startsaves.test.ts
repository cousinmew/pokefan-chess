// SPDX-License-Identifier: AGPL-3.0-only
// Playtest 12 Oct (W1): which saves count as progress, the NEW GAME "creating" flag, the double tap latch, and boot
// dropping only a NEW GAME left empty (data loss review: never a save from before, whatever it holds).
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
  it('a cartridge, settings, a language or an intro seen are not progress', async () => {
    const { hasProgress } = await fresh();
    expect(hasProgress(1)).toBe(false);
    set('p1:cartridge', 'blue');
    set('p1:campaign', { introSeen: true, caught: {}, path: 0, playMs: 0, badges: [], routes: { route1: { last: [false], streak: 0 } } });
    set('p1:settings', { v: 2, sound: false, anim: 'off' });
    set('p1:lang', 'de');
    set('p1:yellowAnim', true);
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
    // Data loss review: everything else a player earns.
    ['the MEIR code', 'playerTrainer', 'meir'], // its own key since 13 Oct ('trainer' is the puzzle record)
    ['a puzzle result', 'trainer', { rating: { r: 1450, rd: 200, vol: 0.06 }, solved: 0, missed: 1, assisted: 0, seen: ['00sHx'] }],
    ['a badge', 'campaign', { badges: ['boulder'] }],
    ['a trainer beaten', 'campaign', { journey: { cleared: [], beaten: ['route1-youngster'], visited: [] } }],
    ['a route solve', 'campaign', { routes: { route1: { last: [true], streak: 1 } } }],
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
  it('NEW GAME on an empty save reuses it: no new slot, and no note (it is not NEW GAME\'s own)', async () => {
    const { bootProfiles, addProfile, reuseEmpty, isCreating } = await fresh();
    set('p1:cartridge', 'blue');
    bootProfiles();
    expect(reuseEmpty()).toBe(true);
    expect(isCreating()).toBe(true);
    addProfile();
    expect(meta()).toEqual({ slots: [1], current: 1 });
    expect(store.has('kc:v1:dev:newGames')).toBe(false);
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
  const HOLD = 30 * 60 * 1000;
  const note = (n: Record<number, number>) => set('dev:newGames', n);
  const notes = () => JSON.parse(store.get('kc:v1:dev:newGames') ?? 'null') as Record<string, number> | null;
  /** ASH's device, NEW GAME tapped (slot 2, BLUE picked, no name yet) and the page reloaded. */
  const newGameFromAsh = async () => {
    store.clear();
    session.clear();
    let m = await fresh();
    set('profiles', { slots: [1], current: 1 });
    set('p1:campaign', { name: 'ASH' });
    m.bootSaves();
    m.addProfile();
    m = await fresh();
    m.bootSaves();
    m.saveTo(2, 'cartridge', 'blue');
    return m;
  };

  /** Every stored key and value but the slot list. */
  const saves = () => JSON.stringify([...store].filter(([k]) => k !== 'kc:v1:profiles').sort());

  it('never drops a save from before, whatever it holds: settings, a language, the MEIR code (data loss review)', async () => {
    const m = await fresh();
    set('profiles', { slots: [1, 2, 3, 4], current: 2 });
    set('p1:campaign', { name: 'ASH' });
    set('p2:cartridge', 'blue');
    set('p2:settings', { v: 2, sound: false });
    set('p2:lang', 'de');
    set('p3:playerTrainer', 'meir');
    set('p4:campaign', { introSeen: true });
    const before = saves();
    // The sweep before this review dropped 2, 3 and 4 here. Launch opens ASH, the first save with progress (13 Oct).
    expect(m.bootSaves()).toEqual({ slots: [1, 2, 3, 4], current: 1 });
    expect(saves()).toBe(before);
    expect(m.currentSlot()).toBe(1);
  });

  it('launch opens a save with progress when boot drops the current NEW GAME, never a kept empty save (review, 13 Oct)', async () => {
    let m = await fresh();
    set('profiles', { slots: [1, 2, 3], current: 3 });
    set('p1:cartridge', 'blue'); // a save from before, empty: kept, but not opened
    set('p1:settings', { v: 2, sound: false });
    set('p2:campaign', { name: 'ASH' });
    set('p3:cartridge', 'blue');
    note({ 3: 0 });
    expect(m.bootSaves()).toEqual({ slots: [1, 2], current: 2 });
    expect(m.currentSlot()).toBe(2);
    expect(m.profileData(1)).toEqual({ cartridge: 'blue', settings: { v: 2, sound: false } });
    // This tab's NEW GAME names the save it came from: that one opens, not the first with progress.
    store.clear();
    m = await fresh();
    set('profiles', { slots: [1, 2, 3, 4], current: 3 });
    set('p1:campaign', { name: 'ASH' });
    set('p2:campaign', { name: 'SKY' });
    set('p3:cartridge', 'blue');
    set('p4:cartridge', 'blue');
    session.set('kc:v1:creating', '2:4');
    note({ 3: 0, 4: Date.now() });
    expect(m.bootSaves()).toEqual({ slots: [1, 2, 4], current: 2 });
  });

  it('an old empty save does not take over launch from a save with progress; nothing is deleted (review, 13 Oct)', async () => {
    let m = await fresh();
    set('profiles', { slots: [1, 2], current: 1 });
    set('p1:cartridge', 'blue');
    set('p1:lang', 'de');
    set('p2:campaign', { name: 'ASH' });
    const before = saves();
    expect(m.bootSaves()).toEqual({ slots: [1, 2], current: 2 });
    expect(meta()).toEqual({ slots: [1, 2], current: 2 });
    expect(saves()).toBe(before);
    // This tab's own NEW GAME stays current (a reload while naming it), and so does a device with no progress yet.
    m = await newGameFromAsh();
    expect(m.bootSaves()).toEqual({ slots: [1, 2], current: 2 });
    store.clear();
    session.clear();
    m = await fresh();
    set('profiles', { slots: [1, 2], current: 2 });
    set('p1:cartridge', 'blue');
    set('p2:lang', 'de');
    expect(m.bootSaves()).toEqual({ slots: [1, 2], current: 2 });
  });

  it('restoring a backup into a save forgets its NEW GAME note, so boot never drops what was restored (review, 13 Oct)', async () => {
    let m = await fresh();
    set('profiles', { slots: [1], current: 1 });
    set('p1:cartridge', 'blue');
    note({ 1: 0 }); // a NEW GAME left unfinished: the last save, so it stays
    expect(m.bootSaves()).toEqual({ slots: [1], current: 1 });
    // OPTION, Import: a backup with settings, a language and My Team (no progress), then the restore's reload.
    const data = { cartridge: 'blue', settings: { v: 2, sound: false }, lang: 'de', campaign: { introSeen: true, team: { q: 'onix' } } };
    m.restoreProfile(1, data);
    m.forgetNewGame(1);
    m.switchTo(1, 'continue');
    expect(notes()).toBeNull();
    // Another save with progress comes along (a second player): the restored save is still kept.
    set('profiles', { slots: [1, 2], current: 1 });
    set('p2:campaign', { name: 'ASH' });
    m = await fresh();
    expect(m.bootSaves().slots).toEqual([1, 2]);
    expect(m.profileData(1)).toEqual(data);
  });

  it('shelf BACK on a NEW GAME reused after a reload dates its note 0, and the next boot drops it', async () => {
    let m = await newGameFromAsh();
    m.removeFrom(2, 'cartridge'); // still on the shelf
    m = await fresh(); // the page reloaded on the shelf: the save is reused in place
    m.bootSaves();
    expect(m.reuseEmpty()).toBe(true);
    expect(m.creatingInPlace()).toBe(true);
    m.leaveCreating(); // the shelf's ◀ BACK: the menu in place
    expect(notes()).toEqual({ 2: 0 });
    expect(m.isCreating()).toBe(false);
    m = await fresh();
    expect(m.bootSaves()).toEqual({ slots: [1], current: 1 });
    expect(notes()).toBeNull();
  });

  it("YELLOW's new game ends the NEW GAME at once: the note goes and boot keeps the save", async () => {
    let m = await newGameFromAsh();
    m.saveTo(2, 'cartridge', 'yellow');
    m.endCreating(); // main.ts newGame(): YELLOW goes straight to its home
    expect(notes()).toBeNull();
    expect(m.isCreating()).toBe(false);
    m = await fresh();
    expect(m.bootSaves()).toEqual({ slots: [1, 2], current: 2 });
  });

  it('drops a NEW GAME left empty once its note is stale, current or not, and clears the note', async () => {
    const m = await fresh();
    set('profiles', { slots: [1, 2, 3], current: 3 });
    set('p1:campaign', { name: 'ASH' });
    set('p2:cartridge', 'blue');
    set('p3:campaign', { introSeen: true });
    note({ 2: Date.now() - HOLD - 1, 3: 0 });
    expect(m.bootSaves()).toEqual({ slots: [1], current: 1 });
    expect([...store.keys()].filter((k) => /^kc:v1:p[23]:/.test(k))).toEqual([]);
    expect(notes()).toBeNull();
    expect(m.currentSlot()).toBe(1);
  });

  it("keeps a fresh note's save (another tab is making it), this tab's own, a named one, and the last save", async () => {
    let m = await fresh();
    set('profiles', { slots: [1, 2, 3, 4], current: 4 });
    set('p1:campaign', { name: 'ASH' });
    set('p2:cartridge', 'blue'); // another tab's NEW GAME, a minute old
    set('p3:campaign', { name: 'SKY' }); // named, then its tab was closed
    set('p4:cartridge', 'blue'); // this tab's NEW GAME, older than the hold
    session.set('kc:v1:creating', '1:4');
    const old = Date.now() - HOLD - 1;
    note({ 2: Date.now() - 60_000, 3: old, 4: old });
    expect(m.bootSaves()).toEqual({ slots: [1, 2, 3, 4], current: 4 });
    expect(Object.keys(notes() ?? {})).toEqual(['2', '4']); // SKY's save is real: its note went
    store.clear();
    session.clear();
    m = await fresh();
    set('p1:cartridge', 'blue');
    note({ 1: 0 });
    expect(m.bootSaves()).toEqual({ slots: [1], current: 1 });
    expect(store.has('kc:v1:p1:cartridge')).toBe(true);
  });

  it('another tab booting keeps a save this tab is still making, until the hold is over (review fix)', async () => {
    const tabA = await fresh();
    set('profiles', { slots: [1], current: 1 });
    set('p1:campaign', { name: 'ASH' });
    tabA.bootSaves();
    tabA.addProfile(); // slot 2, still unnamed
    tabA.saveTo(2, 'cartridge', 'blue');
    // Tab B: its own session storage, the same device storage.
    session.clear();
    let tabB = await fresh();
    expect(tabB.bootSaves().slots).toEqual([1, 2]);
    expect(store.has('kc:v1:p2:cartridge')).toBe(true);
    // Half an hour later the note is stale (a tab closed mid NEW GAME): the empty save goes.
    tabB = await fresh();
    expect(tabB.bootSaves(Date.now() + HOLD + 1)).toEqual({ slots: [1], current: 1 });
    expect(store.has('kc:v1:p2:cartridge')).toBe(false);
    expect(notes()).toBeNull();
  });

  it('the starter or BACK clears the note; leaving another way dates it, and the next boot drops the save (bugs #2)', async () => {
    let m = await newGameFromAsh();
    expect(m.beingMade(2)).toBe(true);
    m.saveTo(2, 'campaign', { name: 'JO', starter: 'squirtle' });
    m.endCreating(); // the starter
    expect(notes()).toBeNull();
    m = await newGameFromAsh();
    m.abandonNewGame(); // ◀ BACK
    expect(notes()).toBeNull();
    expect(meta()).toEqual({ slots: [1], current: 1 });
    m = await newGameFromAsh();
    m.switchTo(1, 'continue'); // SWITCH TRAINER back to ASH, the new save unnamed
    expect(notes()).toEqual({ 2: 0 });
    m = await fresh();
    expect(m.bootSaves()).toEqual({ slots: [1], current: 1 });
    expect(notes()).toBeNull();
  });

  it('BACK on a reused save removes keys only from a save NEW GAME made; boot drops only that one', async () => {
    // A save from before (no note), with no progress anywhere: BACK keeps every key it has, My Team included, and
    // undoes only the progress typed on the way, a name and the MEIR code (review, 13 Oct).
    let m = await fresh();
    set('profiles', { slots: [1, 2], current: 2 });
    set('p1:settings', { v: 1 });
    set('p2:settings', { v: 2, sound: false });
    set('p2:campaign', { introSeen: true, team: { q: 'onix' } });
    m.bootSaves();
    expect(m.reuseEmpty()).toBe(true);
    m.saveTo(2, 'cartridge', 'blue');
    m.saveTo(2, 'playerTrainer', 'meir'); // the MEIR code on the shelf
    m.saveTo(2, 'campaign', { introSeen: true, team: { q: 'onix' }, name: 'JO' }); // named, then Back from the starter
    m.abandonNewGame();
    m = await fresh();
    expect(m.bootSaves()).toEqual({ slots: [1, 2], current: 2 }); // a save from before: kept
    expect(m.profileData(2)).toEqual({ settings: { v: 2, sound: false }, campaign: { introSeen: true, team: { q: 'onix' } }, cartridge: 'blue' });
    expect(m.hasProgress(2)).toBe(false);
    // A reload in the middle of a NEW GAME reuses its save in place; BACK forgets what it wrote and leaves it for boot.
    m = await newGameFromAsh();
    expect(m.reuseEmpty()).toBe(true);
    m.saveTo(2, 'playerTrainer', 'meir');
    m.abandonNewGame();
    expect(m.profileData(2)).toEqual({});
    m = await fresh();
    expect(m.bootSaves()).toEqual({ slots: [1], current: 1 });
  });
});
