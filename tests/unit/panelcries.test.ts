// SPDX-License-Identifier: AGPL-3.0-only
// Review, 14 Oct (round 3): the Journey's panel cries are fetched in idle time, once each, after everything a board
// asked for (they went in the board's priority lane, ahead of its select cries and backs), and they cover every gift
// still to come, not only the gift choices.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../../src/campaign/kanto';

const stored: Record<string, unknown> = {};
const g = globalThis as unknown as Record<string, unknown>;
g.window = { setTimeout: () => 0, clearTimeout: () => undefined, localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } };
g.Image = class {
  alt = '';
  fetchPriority = 'auto';
  src = '';
  decode = () => Promise.resolve();
};
g.AudioContext = class {
  state = 'suspended';
  decodeAudioData = () => Promise.resolve({});
};
const fetched: string[] = [];
g.fetch = (url: string) => (fetched.push(url), Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));

/** The loader's three queues, run by hand: what each task loads is read from fetch() and the images made. */
const lanes = { free: [] as (() => Promise<unknown>)[], idleFirst: [] as (() => Promise<unknown>)[], idle: [] as (() => Promise<unknown>)[] };
vi.mock('../../src/ui/loader', () => ({
  whenFree: (t: () => Promise<unknown>) => void lanes.free.push(t),
  whenIdleFirst: (t: () => Promise<unknown>) => void lanes.idleFirst.push(t),
  whenIdle: (t: () => Promise<unknown>) => void lanes.idle.push(t),
  idleDrained: () => Promise.resolve(),
  preloadNow: () => undefined,
  releaseIdle: () => undefined,
  pauseWhile: () => undefined,
  neededAtReveal: () => undefined,
  revealNeeds: () => Promise.resolve(),
}));
vi.mock('../../src/store/persist', async (real) => ({ ...(await real<typeof import('../../src/store/persist')>()), load: (k: string) => stored[k] ?? null }));

/** Runs every task queued in `lane` so far; returns the cry files they fetched. */
async function cries(lane: keyof typeof lanes): Promise<string[]> {
  const from = fetched.length;
  for (const t of lanes[lane].splice(0)) await t();
  return fetched.slice(from).filter((u) => /cries\//.test(u));
}
const dexOf = (u: string) => Number(/cries\/(\d+)\./.exec(u)?.[1]);

const ROUTES = ['route-1', 'viridian-forest', 'route-3', 'route-6', 'route-7', 'route-14', 'route-8', 'route-21', 'route-22'];
/** Seven badges, every route walked, no reward given yet. */
const LATE = {
  v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, team: { p: 'pidgey' }, warmup: true, puzzlesStarted: 40,
  badges: ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano'],
  journey: { cleared: ['route-1', 'viridian', 'rival-1', 'viridian-forest', 'route-3', 'rival-2', 'route-6', 'route-7', 'route-14', 'route-8', 'route-21', 'route-22'], beaten: [], visited: ROUTES },
};

beforeEach(() => {
  for (const l of Object.values(lanes)) l.length = 0;
  for (const k of Object.keys(stored)) delete stored[k];
  stored.cartridge = 'blue';
  stored.campaign = LATE;
});

describe('panel cries', () => {
  it('a late save fetches them in idle time, not in the priority lane, and each once', async () => {
    vi.resetModules();
    const { preloadBattleSprites } = await import('../../src/battle/sprites');
    preloadBattleSprites();
    preloadBattleSprites(); // a second plan (the splash again): nothing queued twice
    const lane = await cries('free');
    expect(lane, 'no panel cry in the priority lane').toEqual([]);
    expect(lanes.idleFirst.length, 'one idle task per species').toBeGreaterThanOrEqual(20);
    const idle = await cries('idleFirst');
    expect(new Set(idle).size).toBe(idle.length);
    expect(idle.length).toBeGreaterThanOrEqual(20);
  });

  it("a board's species are decoded in the priority lane even when their cry is already queued for a panel", async () => {
    vi.resetModules();
    const { preloadBattleSprites, warmBoard } = await import('../../src/battle/sprites');
    const { species } = await import('../../src/board/pieces');
    preloadBattleSprites(); // PIDGEY (route 1) is queued for a panel
    warmBoard([{ color: 'w', role: 'p', sp: species('pidgey') }], 'w');
    const lane = await cries('free');
    expect(lane.map(dexOf)).toEqual([16]);
  });

  it("every gift still to come is in the list, the starters resolved as reward() does, the next goal's route first", async () => {
    const { panelSpecies } = await import('../../src/battle/sprites');
    const { loadCampaign } = await import('../../src/campaign/kanto');
    stored.campaign = { ...LATE, rewards: ['rival-1', 'mt-moon'] };
    const late = panelSpecies(loadCampaign());
    expect(late).toEqual(expect.arrayContaining(['zapdos', 'eevee', 'charmander', 'hitmonlee', 'hitmonchan', 'lapras']));
    expect(late).not.toContain('omanyte'); // Mt. Moon's reward was given
    // An early save: the rival's first gift is the starter neither side has (BULBASAUR's rival takes CHARMANDER).
    stored.campaign = { ...LATE, badges: [], journey: { cleared: ['route-1', 'viridian'], beaten: [], visited: ['route-1'] } };
    const early = panelSpecies(loadCampaign() as Campaign);
    expect(early).toContain('squirtle');
    expect(early).not.toContain('bulbasaur');
    // The next goal's wild Pokémon come first (Viridian Forest once the rival is beaten), then the routes walked.
    const { ROUTES, routeSpecies } = await import('../../src/campaign/kanto');
    stored.campaign = { ...LATE, badges: [], rewards: ['rival-1'], journey: { cleared: ['route-1', 'viridian', 'rival-1'], beaten: [], visited: ['route-1'] } };
    const forest = routeSpecies(ROUTES.find((r) => r.id === 'viridian-forest')!);
    const next = panelSpecies(loadCampaign());
    expect(next.slice(0, forest.length)).toEqual(forest);
    expect(next).toEqual(expect.arrayContaining(routeSpecies(ROUTES.find((r) => r.id === 'route-1')!)));
  });
});
