// SPDX-License-Identifier: AGPL-3.0-only
// J12 (Fix, 13 Oct): a rival battle's puzzles carry BLUE's team, the one his goal card and intro show ("BLUE leads with
// BULBASAUR."), instead of the story stage's Rocket species.
import { describe, expect, it } from 'vitest';
import { EVOLUTIONS, loadCampaign, rivalSkin, STARTERS } from '../../src/campaign/kanto';
import { PLACES, RIVAL, teamOf } from '../../src/campaign/journey';

const stage = (id: string) => EVOLUTIONS.find((e) => e.to === id)?.stage ?? 0;

describe('rivalSkin (J12)', () => {
  it('the lead is the king, then queen, rooks, knights and bishops; the pawns are the most basic species', () => {
    expect(rivalSkin(['squirtle', 'pidgey'])).toEqual({ k: 'squirtle', q: 'pidgey', p: 'pidgey' });
    expect(rivalSkin(['bulbasaur', 'pidgeotto', 'rattata'])).toEqual({ k: 'bulbasaur', q: 'pidgeotto', r: 'rattata', p: 'rattata' });
    expect(rivalSkin(['wartortle', 'pidgeotto', 'growlithe', 'kadabra', 'exeggcute'])).toEqual({ k: 'wartortle', q: 'pidgeotto', r: 'growlithe', n: 'kadabra', bLight: 'exeggcute', bDark: 'exeggcute', p: 'exeggcute' });
    expect(rivalSkin(['ivysaur', 'pidgeotto'])).toEqual({ k: 'ivysaur', q: 'pidgeotto', p: 'pidgeotto' }); // a tie: the later one
    expect(rivalSkin(['eevee'])).toEqual({ k: 'eevee', p: 'eevee' });
    expect(rivalSkin([])).toEqual({});
  });

  it('every rival battle, for every starter: BLUE\'s starter is the king and the pawns are never more evolved than the rest', () => {
    for (const starter of STARTERS) {
      const c = { ...loadCampaign(), starter };
      for (const p of PLACES.filter((x) => x.kind === 'rival')) {
        const team = teamOf(c, p.trainers![0]!);
        const skin = rivalSkin(team);
        expect(skin.k, `${p.id} ${starter}`).toBe(RIVAL.counter[starter]);
        expect(team).toContain(skin.p);
        expect(Math.min(...team.map(stage)), `${p.id} ${starter}`).toBe(stage(skin.p!));
      }
    }
  });
});
