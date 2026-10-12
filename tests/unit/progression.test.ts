// SPDX-License-Identifier: AGPL-3.0-only
// W5 journey progression: Oak's warm-up positions, nextGoal, the easy first trainers, and play time that never
// overwrites a save written elsewhere (bugs #6).
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { hintMove, meets, WARMUP } from '../../src/campaign/path';
import { addPlayTime, chooseStarter, loadCampaign, saveCampaign, throwBall, type Campaign } from '../../src/campaign/kanto';
import { beatTrainer, clearPlace, goalLine, journeyState, nextGoal, PLACES, progress, unlockText } from '../../src/campaign/journey';
import { pickEasy, pieceCount, shownLevel, type Trainer } from '../../src/campaign/trainer';
import { createRng } from '../../src/game/rng';
import { rivalStarter, withoutRival } from '../../src/campaign/rivalTeam';
import type { PuzzleRow } from '../../src/campaign/puzzle';

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
};
afterEach(() => store.clear());

const place = (id: string) => PLACES.find((p) => p.id === id)!;
const started = (): Campaign => chooseStarter({ ...loadCampaign(), name: 'JADE' }, 'bulbasaur');
const beat = (c: Campaign, id: string) => {
  const p = PLACES.find((x) => x.trainers?.some((t) => t.id === id))!;
  return beatTrainer(c, p, p.trainers!.find((t) => t.id === id)!);
};

describe("Oak's Route 1 warm-up (W5, design G)", () => {
  it('three legal positions, white to move: a capture, a check and a mate in 1, each solvable in one move', () => {
    expect(WARMUP.puzzles.map((p) => p.goal)).toEqual(['capture', 'check', 'mate']);
    for (const p of WARMUP.puzzles) {
      const c = new Chess(p.fen);
      expect(c.turn(), p.fen).toBe('w');
      expect(c.isGameOver(), p.fen).toBe(false);
      expect(c.inCheck(), p.fen).toBe(false);
      const m = hintMove(p);
      expect(m, p.fen).not.toBeNull();
      const after = new Chess(p.fen);
      after.move(m!);
      expect(meets(p, m!, after), p.fen).toBe(true);
    }
    // The mate is the back rank mate Ra8#, and only a few pieces stand on each board.
    const mate = new Chess(WARMUP.puzzles[2]!.fen);
    mate.move('Ra8');
    expect(mate.isCheckmate()).toBe(true);
    for (const p of WARMUP.puzzles) expect(pieceCount(p.fen)).toBeLessThanOrEqual(6);
  });

  it('a new save plays it; saves that already beat a Route 1 trainer or walked Route 1 skip it', () => {
    expect(loadCampaign().warmup).toBe(false);
    store.set('kc:v1:p1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', journey: { cleared: [], beaten: ['r1-toby'], visited: [] } }));
    expect(loadCampaign().warmup).toBe(true);
    store.set('kc:v1:p1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', journey: { cleared: [], beaten: [], visited: ['route-1'] } }));
    expect(loadCampaign().warmup).toBe(true);
    store.set('kc:v1:p1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', journey: { cleared: [], beaten: [], visited: [] } }));
    expect(loadCampaign().warmup).toBe(false);
    store.set('kc:v1:p1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', warmup: true, journey: { cleared: [], beaten: [], visited: [] } }));
    expect(loadCampaign().warmup).toBe(true);
  });

  it('the first catch cannot fail (force), even with an unlucky roll', () => {
    const rng = createRng(1);
    rng.next = () => 0.999999;
    const c = started();
    expect(throwBall(c, 'route-1', { species: 'pidgey', chance: 20 }, 'hint', rng).caught).toBe(false);
    const res = throwBall(c, 'route-1', { species: 'pidgey', chance: 20 }, 'hint', rng, false, true);
    expect(res.caught).toBe(true);
    expect(res.campaign.caught.pidgey).toBe(1);
  });
});

describe('easy first trainers (W5)', () => {
  it('Route 1 trainers are easy; their pick is at most 16 pieces, the fewest first, then the lowest rating', () => {
    expect(place('route-1').trainers!.every((t) => t.easy)).toBe(true);
    expect(PLACES.flatMap((p) => p.trainers ?? []).filter((t) => t.easy).map((t) => t.id)).toEqual(['r1-toby', 'r1-mina']);
    const rows = JSON.parse(readFileSync('src/data/puzzles/mateIn1.json', 'utf8')) as PuzzleRow[];
    const seen: string[] = [];
    let last = [0, 0];
    for (let i = 0; i < 6; i++) {
      const row = pickEasy(rows, seen)!;
      expect(pieceCount(row[1])).toBeLessThanOrEqual(16);
      const key = [pieceCount(row[1]), row[3]];
      expect(key[0]! > last[0]! || (key[0] === last[0] && key[1]! >= last[1]!)).toBe(true);
      last = key;
      seen.push(row[0]);
    }
    const big: PuzzleRow = ['big', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4 e7e5', 600];
    expect(pickEasy([big], [])).toBeNull();
  });

  it('never opens with a promotion: no promoting set up move or answer (playtest, 12 Oct)', () => {
    const rows: PuzzleRow[] = [
      ['promo-setup', '7k/1P6/8/8/8/8/6K1/r7 b - - 0 1', 'a1a8 b7a8q', 400],
      ['promo-answer', '6k1/1P3ppp/8/8/8/8/8/6K1 b - - 0 1', 'g8h8 b7b8q', 400],
      ['plain', '6k1/5ppp/8/8/8/8/1R6/1r4K1 b - - 0 1', 'b1a1 b2b8', 500],
    ];
    expect(pickEasy(rows, [])?.[0]).toBe('plain');
    const pool = JSON.parse(readFileSync('src/data/puzzles/mateIn1.json', 'utf8')) as PuzzleRow[];
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) {
      const row = pickEasy(pool, seen)!;
      expect(row[2].split(' ').every((m) => m.length === 4), row[0]).toBe(true);
      seen.push(row[0]);
    }
  });
});

describe('Trainer Level for kids (playtest, 12 Oct)', () => {
  const t = (solved: number, missed: number, assisted = 0): Trainer => ({ rating: { r: 1111, rd: 80, vol: 0.06 }, solved, missed, assisted, seen: [] });
  it('no number until 10 rated puzzles; hints do not count', () => {
    expect(shownLevel(t(0, 0))).toEqual({ r: null, n: 0 });
    expect(shownLevel(t(3, 2, 4))).toEqual({ r: null, n: 5 });
    expect(shownLevel(t(7, 2, 9))).toEqual({ r: null, n: 9 });
    expect(shownLevel(t(8, 2))).toEqual({ r: 1111, n: 10 });
  });
});

describe('nextGoal (W5, design H)', () => {
  it('walks Route 1, Viridian, the rival and the first gym, with a display string', () => {
    let c = started();
    expect(nextGoal(c)).toMatchObject({ place: { id: 'route-1' }, trainer: { id: 'r1-toby' }, text: 'YOUNGSTER TOBY at ROUTE 1' });
    expect(goalLine(c)).toBe('Next: YOUNGSTER TOBY at ROUTE 1');
    c = beat(c, 'r1-toby');
    expect(nextGoal(c)?.text).toBe('LASS MINA at ROUTE 1');
    c = beat(c, 'r1-mina');
    expect(nextGoal(c)).toMatchObject({ place: { id: 'viridian' }, trainer: null, text: 'Go to VIRIDIAN CITY' });
    c = clearPlace(c, place('viridian'));
    expect(nextGoal(c)?.text).toBe('Battle RIVAL BLUE');
    c = beat(c, 'rival-1');
    for (const id of ['vf-oskar', 'vf-liam', 'vf-pip']) c = beat(c, id);
    expect(nextGoal(c)).toMatchObject({ place: { id: 'pewter-gym' }, trainer: { id: 'gym-brock' } });
    expect(nextGoal(c)?.text).toMatch(/BROCK at /);
    c = { ...c, badges: ['boulder'] };
    expect(nextGoal(c)?.place.id).toBe('route-3');
  });

  it('none before the starter or after the Champion; progress and the lock line follow the goal', () => {
    expect(goalLine(loadCampaign())).toBeNull();
    const c = started();
    expect(progress(c)).toBeGreaterThan(0);
    expect(unlockText(c)).toBe('Beat the trainers on ROUTE 1');
    const done = { ...c, champion: true, badges: ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'], journey: { ...c.journey, cleared: PLACES.map((p) => p.id) } };
    expect(nextGoal(done)).toBeNull();
    expect(progress(done)).toBe(100);
    // A save as the start menu reads it (partial, not loaded) gives the same goal.
    expect(goalLine(journeyState({ starter: 'squirtle' }))).toBe('Next: YOUNGSTER TOBY at ROUTE 1');
  });
});

describe('play time (bugs #6)', () => {
  it('merges into the stored save: a rename written elsewhere survives the tick', () => {
    const memory = started();
    saveCampaign({ ...memory, playMs: 10_000 });
    // Somewhere else (Settings, Switch player, Rename) writes a new name to storage.
    saveCampaign({ ...loadCampaign(), name: 'SKY' });
    const after = addPlayTime(5000);
    expect(after).toMatchObject({ name: 'SKY', playMs: 15_000 });
    expect(loadCampaign()).toMatchObject({ name: 'SKY', playMs: 15_000 });
    expect(memory.name).toBe('JADE'); // the old copy in memory is not what gets saved
  });
});

describe("the rival's starter never stands on your side (playtest, 12 Oct)", () => {
  it('swaps the default slots of the rival line for a stand in outside every starter line; your own picks stay', () => {
    expect(rivalStarter('bulbasaur')).toBe('charmander');
    expect(rivalStarter(null)).toBeNull();
    // BULBASAUR: BLUE takes CHARMANDER, so the default queen (CHARMANDER, CHARMELEON, CHARIZARD by stage) is replaced.
    expect(withoutRival({ k: 'bulbasaur' }, 'bulbasaur', 0)).toEqual({ k: 'bulbasaur', q: 'growlithe' });
    expect(withoutRival({ k: 'bulbasaur' }, 'bulbasaur', 2)).toEqual({ k: 'bulbasaur', q: 'arcanine' });
    // SQUIRTLE: BLUE takes BULBASAUR, the dark bishop line.
    expect(withoutRival({ k: 'squirtle' }, 'squirtle', 1)).toEqual({ k: 'squirtle', bDark: 'gloom' });
    // A slot My Team filled is the player's choice.
    expect(withoutRival({ q: 'charmeleon' }, 'bulbasaur', 1)).toEqual({ q: 'charmeleon' });
    expect(withoutRival({}, null, 0)).toEqual({});
  });
});
