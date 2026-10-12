// SPDX-License-Identifier: AGPL-3.0-only
// W3 puzzle clarity (playtest 12 Oct): the goal from theme and length, you are always TEAM RED, the YOU plate, and
// the save's coach mark defaults.
import { afterEach, describe, expect, it } from 'vitest';
import { objective, playerMoves } from '../../src/campaign/puzzle';
import { fmt } from '../../src/game/text';
import { lookOf, setWears, speciesIdFor } from '../../src/board/pieces';
import { applyLooks, puzzleTeam, standing } from '../../src/look';
import { loadCampaign } from '../../src/campaign/kanto';

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
};
afterEach(() => {
  store.clear();
  applyLooks({}, 'w');
});

const t = (k: Parameters<typeof fmt>[0], v?: Parameters<typeof fmt>[1]) => fmt(k, v);

describe('objective() (design C)', () => {
  it('counts only your moves: the first move of a Lichess line is the set up', () => {
    expect(playerMoves('e2e1 d1e1')).toBe(1);
    expect(playerMoves('f3g4 f8f1 g4d1 f1d1')).toBe(2);
    expect(playerMoves('a b c d e f')).toBe(3);
  });

  it('mate themes say "Checkmate in N"', () => {
    expect(objective('mateIn1', 'g4h5 a4h4', t)).toBe('Checkmate in 1 move');
    expect(objective('mateIn2', 'f3g4 f8f1 g4d1 f1d1', t)).toBe('Checkmate in 2 moves');
    expect(objective('backRankMate', 'a1a2 e1e8', t)).toBe('Checkmate in 1 move');
    expect(objective('backRankMate', 'a b c d', t)).toBe('Checkmate in 2 moves');
  });

  it('other themes give the goal, with the length when it is more than one move', () => {
    expect(objective('fork', 'f7e6 b3e6 g8f8 e6c8', t)).toBe('Goal: win material with a fork (2 moves)');
    expect(objective('fork', 'f7e6 b3e6', t)).toBe('Goal: win material with a fork');
    expect(objective('hangingPiece', 'a b', t)).toBe('Goal: grab the piece nobody defends');
    expect(objective('pin', 'a b c d e f', t)).toBe('Goal: win with a pin (3 moves)');
  });
});

describe('you are always TEAM RED (design D)', () => {
  it('a black to move puzzle puts Red\'s look on black and Rocket\'s on white', () => {
    applyLooks({ w: { stage: 0, trainer: 'red' }, b: { stage: 0, trainer: 'red' } }, 'b');
    expect(lookOf('b')).toBe('w');
    expect(speciesIdFor('b', 'k', 'g7')).toBe('pikachu');
    expect(speciesIdFor('b', 'q', 'd8')).toBe('charmander'); // Red's stage 0 queen
    expect(speciesIdFor('w', 'k', 'g1')).toBe('raticate'); // the Grunt's king
    expect(speciesIdFor('w', 'p', 'a2')).toBe('rattata');
    applyLooks({ w: { stage: 0, trainer: 'red' }, b: { stage: 0, trainer: 'red' } }, 'w');
    expect(speciesIdFor('w', 'k', 'e1')).toBe('pikachu');
    expect(speciesIdFor('b', 'k', 'e8')).toBe('raticate');
  });

  it('your puzzle team: My Team, the starter as king, PIKACHU where the story team had the starter', () => {
    expect(puzzleTeam({}, 'bulbasaur', 0)).toEqual({ k: 'bulbasaur', bDark: 'pikachu' });
    expect(puzzleTeam({ p: 'pidgey' }, 'charmander', 0)).toEqual({ k: 'charmander', q: 'pikachu', p: 'pidgey' });
    expect(puzzleTeam({}, 'squirtle', 2)).toEqual({ k: 'squirtle' }); // stage 2 has BLASTOISE, not SQUIRTLE
    expect(puzzleTeam({ k: 'ivysaur' }, 'bulbasaur', 0)).toEqual({ k: 'ivysaur' });
  });

  it('every other mode keeps Red on white', () => {
    setWears('w');
    expect([lookOf('w'), lookOf('b')]).toEqual(['w', 'b']);
  });

  it('puzzles: your plate says YOU and the top plate is the trainer who set the puzzle', () => {
    const them = { sprite: 'youngster-gen1', name: 'YOUNGSTER TOBY', title: '' };
    const s = standing({ mode: 'puzzle', level: 1, human: 'b', stage: 0, myName: 'LEAF', them }, (k) => k);
    expect(s?.b).toMatchObject({ name: 'LEAF', you: true });
    expect(s?.w).toEqual(them);
    // Without a trainer (tall grass, Training): the story stage's trainer.
    expect(standing({ mode: 'puzzle', level: 1, human: 'w', stage: 0, myName: 'LEAF' }, (k) => k)?.b.name).toBe('plate.grunt');
    // vs Computer has no YOU tag.
    expect(standing({ mode: 'computer', level: 1, human: 'w', stage: 0, myName: 'LEAF' }, (k) => k)?.w.you).toBeUndefined();
  });

  it('the vs Computer ladder names both grunts apart (ux #5)', () => {
    const names = [1, 2].map((level) => standing({ mode: 'computer', level, human: 'w', stage: 0, myName: 'LEAF' }, (k) => k)?.b.name);
    expect(names).toEqual(['plate.grunt', 'plate.gruntf']);
  });
});

describe('coach marks once per save (design F)', () => {
  it('a new save has seen none; a save that already beat a trainer skips them', () => {
    expect(loadCampaign()).toMatchObject({ tips: [], puzzlesStarted: 0 });
    store.set('kc:v1:p1:campaign', JSON.stringify({ v: 2, starter: 'bulbasaur', journey: { cleared: [], beaten: ['r1-toby'], visited: [] } }));
    expect(loadCampaign()).toMatchObject({ tips: ['puzzle'], puzzlesStarted: 3 });
    store.set('kc:v1:p1:campaign', JSON.stringify({ v: 2, starter: 'bulbasaur', tips: [], puzzlesStarted: 1, journey: { cleared: [], beaten: ['r1-toby'], visited: [] } }));
    expect(loadCampaign()).toMatchObject({ tips: [], puzzlesStarted: 1 });
  });
});
