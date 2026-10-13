// SPDX-License-Identifier: AGPL-3.0-only
// J12 (Fix, 13 Oct): a rival battle's puzzles carry BLUE's team, the one his goal card and intro show ("BLUE leads with
// BULBASAUR."), instead of the story stage's Rocket species.
import { describe, expect, it } from 'vitest';
import { EVOLUTIONS, loadCampaign, rivalSkin, STARTERS } from '../../src/campaign/kanto';
import { PLACES, RIVAL, teamOf } from '../../src/campaign/journey';
import { SKIN_ROLES } from '../../src/board/pieces';

const stage = (id: string) => EVOLUTIONS.find((e) => e.to === id)?.stage ?? 0;

describe('rivalSkin (J12)', () => {
  // Review (R2): roles past the team's size were left unset, so they fell back to Rocket's species on BLUE's board; the
  // rest of the team now takes them in turn.
  it('the lead is the king, then queen, rooks, knights and bishops, the rest of the team in turn; the pawns are the most basic species', () => {
    expect(rivalSkin(['squirtle', 'pidgey'])).toEqual({ k: 'squirtle', q: 'pidgey', r: 'pidgey', n: 'pidgey', bLight: 'pidgey', bDark: 'pidgey', p: 'pidgey' });
    expect(rivalSkin(['bulbasaur', 'pidgeotto', 'rattata'])).toEqual({ k: 'bulbasaur', q: 'pidgeotto', r: 'rattata', n: 'pidgeotto', bLight: 'rattata', bDark: 'rattata', p: 'rattata' });
    expect(rivalSkin(['wartortle', 'pidgeotto', 'growlithe', 'kadabra', 'exeggcute'])).toEqual({ k: 'wartortle', q: 'pidgeotto', r: 'growlithe', n: 'kadabra', bLight: 'exeggcute', bDark: 'exeggcute', p: 'exeggcute' });
    expect(rivalSkin(['ivysaur', 'pidgeotto'])).toEqual({ k: 'ivysaur', q: 'pidgeotto', r: 'pidgeotto', n: 'pidgeotto', bLight: 'pidgeotto', bDark: 'pidgeotto', p: 'pidgeotto' }); // a tie: the later one
    expect(rivalSkin(['eevee'])).toEqual({ k: 'eevee', q: 'eevee', r: 'eevee', n: 'eevee', bLight: 'eevee', bDark: 'eevee', p: 'eevee' });
    expect(rivalSkin([])).toEqual({});
  });

  it('every rival battle, for every starter: BLUE\'s starter is the king and the pawns are never more evolved than the rest', () => {
    for (const starter of STARTERS) {
      const c = { ...loadCampaign(), starter };
      for (const p of PLACES.filter((x) => x.kind === 'rival')) {
        const team = teamOf(c, p.trainers![0]!);
        const skin = rivalSkin(team);
        expect(skin.k, `${p.id} ${starter}`).toBe(RIVAL.counter[starter]);
        for (const role of SKIN_ROLES) expect(team, `${p.id} ${starter} ${role}`).toContain(skin[role]); // no role left to Rocket
        expect(team).toContain(skin.p);
        expect(Math.min(...team.map(stage)), `${p.id} ${starter}`).toBe(stage(skin.p!));
      }
    }
  });
});
