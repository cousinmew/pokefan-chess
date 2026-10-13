// SPDX-License-Identifier: AGPL-3.0-only
// What the game says about a turn (controller, 14 Oct): lines name the people on the plates (C8), Take back says what
// it undid (C2), YELLOW's one line keeps the check (C4), and a Journey game names who you face (C9).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { introLine, oneLine, tookBack, turnLine } from '../../src/game/lines';
import { standing } from '../../src/look';
import { fmt, type StringKey } from '../../src/game/text';

describe('lines that name the plates (C8)', () => {
  it('"{name} to move" where plates name the sides, else the team the colour wears', () => {
    expect(turnLine('JADE', 'red')).toBe('JADE to move');
    expect(turnLine('GIOVANNI', 'rocket')).toBe('GIOVANNI to move');
    expect(turnLine(undefined, 'red')).toBe('RED to move');
    expect(turnLine(undefined, 'rocket')).toBe('TEAM ROCKET to move');
  });

  it('"{name} wants to battle!" by the opponent plate, else the team line', () => {
    expect(introLine('GIOVANNI', 'intro.vsRocket')).toBe('GIOVANNI wants to battle!');
    expect(introLine(undefined, 'intro.vsRocket')).toBe('TEAM ROCKET wants to battle!');
    expect(introLine(undefined, 'intro.vsRed')).toBe('RED wants to battle!');
  });
});

describe('Take back says what it undid (C2)', () => {
  it('one move, or the reply and yours, newest first', () => {
    expect(tookBack([{ piece: 'PIKACHU', square: 'e4' }])).toBe('Took back PIKACHU to e4.');
    expect(tookBack([{ piece: 'RATTATA', square: 'e6' }, { piece: 'PIKACHU', square: 'e4' }])).toBe('Took back RATTATA to e6 and PIKACHU to e4.');
  });
});

describe("YELLOW's one line (C4)", () => {
  it('a capture that checks says the check; otherwise the first line', () => {
    const fainted = { key: 'battle.fainted' as StringKey, vars: { defender: 'RATTATA' } };
    const check = { key: 'check' as StringKey, vars: { king: 'NIDOKING' } };
    expect(oneLine([fainted, check])).toEqual([check]);
    expect(oneLine([fainted])).toEqual([fainted]);
    expect(oneLine([])).toEqual([]);
    expect(fmt('check', { king: 'NIDOKING' })).toBe('NIDOKING is in danger!');
  });
});

describe('a Journey game names who you face (C9)', () => {
  it('a challenge stands its own opponent on the top plate, never the story stage trainer', () => {
    const oak = { sprite: 'oak', name: 'PROF. OAK', title: 'Professor' };
    const sides = standing({ mode: 'challenge', level: 3, human: 'w', stage: 0, myName: 'JADE', them: oak }, (k) => fmt(k as StringKey))!;
    expect(sides.b).toEqual(oak);
    expect(sides.w.name).toBe('JADE');
    const story = standing({ mode: 'challenge', level: 3, human: 'w', stage: 0, myName: 'JADE' }, (k) => fmt(k as StringKey))!;
    expect(story.b.name).not.toBe('PROF. OAK');
  });
});

describe('the new lines YELLOW shows stay short (R3, review 14 Oct)', () => {
  // YELLOW Play and Friend show these too: START → VS FRIEND or VS COMPUTER asks quit.leave, Friend's auto flip says
  // turn.next, Take back is always on. i18n.test checks only yellow.* and path.* keys.
  const KEYS = ['intro.named', 'turn.named', 'turn.next', 'takeback.one', 'takeback.two', 'end.wins', 'quit.leave'];
  it.each(['en', 'fr', 'he', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh-Hans', 'ru'])('%s: at most 8 words, or 16 characters in Japanese and Chinese', (l) => {
    const t = JSON.parse(readFileSync(`src/data/strings.${l}.json`, 'utf8')) as Record<string, string>;
    const cjk = l === 'ja' || l === 'zh-Hans';
    for (const k of KEYS) {
      const s = t[k]!;
      if (cjk) expect([...s.replace(/\{\w+\}/g, '')].length, `${l} ${k}: ${s}`).toBeLessThanOrEqual(16);
      else expect(s.split(/\s+/).length, `${l} ${k}: ${s}`).toBeLessThanOrEqual(8);
    }
  });
});
