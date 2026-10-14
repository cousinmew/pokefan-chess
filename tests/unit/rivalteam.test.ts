// SPDX-License-Identifier: AGPL-3.0-only
// J12 (Fix, 13 Oct): a rival battle's puzzles carry BLUE's team, the one his goal card and intro show ("BLUE leads with
// BULBASAUR."), instead of the story stage's Rocket species.
import { describe, expect, it } from 'vitest';
import { EVOLUTIONS, loadCampaign, rivalSkin, STARTERS } from '../../src/campaign/kanto';
import { PLACES, RIVAL, teamOf } from '../../src/campaign/journey';
import { SKIN_ROLES } from '../../src/board/pieces';
import { partyOf, yourSpecies } from '../../src/campaign/rivalTeam';

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

// Merge review, 14 Oct: the controller group's configure() now puts opponent.team on the board, so rival 1's BLUE had
// PIDGEY in every role but the king, facing the warm-up's PIDGEY pawns. His team now gives way to what is on your side.
describe('partyOf: BLUE never brings a species of your side', () => {
  /** A save that reached `id` after Oak's warm-up (PIDGEY caught and on the pawns), with the badges of the gyms before. */
  const reached = (id: string, starter: string, extra: object = {}) => ({
    ...loadCampaign(), starter, warmup: true, caught: { [starter]: 1, pidgey: 1 }, team: { p: 'pidgey' },
    badges: PLACES.slice(0, PLACES.findIndex((p) => p.id === id)).flatMap((p) => (p.kind === 'gym' && p.badge ? [p.badge] : [])),
    ...extra,
  });
  const rivals = PLACES.filter((x) => x.kind === 'rival');

  it('a warm-up save, every rival battle, every starter: no species on both sides, BLUE still leads with his starter', () => {
    expect(rivals.map((p) => p.id)).toEqual(['rival-1', 'rival-2', 'rival-3']);
    for (const starter of STARTERS) {
      for (const p of rivals) {
        const c = reached(p.id, starter);
        const yours = yourSpecies(c);
        expect(yours.has('pidgey'), "the warm-up's pawns").toBe(true);
        const party = partyOf(c, p.trainers![0]!);
        const skin = rivalSkin(party);
        expect(SKIN_ROLES.map((r) => skin[r]!).filter((s) => yours.has(s)), `${p.id} ${starter}`).toEqual([]);
        expect(party.filter((s) => yours.has(s)), `${p.id} ${starter}`).toEqual([]);
        expect(party[0], `${p.id} ${starter}`).toBe(RIVAL.counter[starter]);
        expect(new Set(party).size).toBe(party.length);
      }
    }
  });

  it("rival 1: RATTATA, the next first stage of his Gen 1 party, stands where PIDGEY stood", () => {
    const c = reached('rival-1', 'bulbasaur');
    const t = rivals[0]!.trainers![0]!;
    expect(teamOf(c, t)).toEqual(['charmander', 'pidgey']); // as written
    expect(partyOf(c, t)).toEqual(['charmander', 'rattata']);
    expect(rivalSkin(partyOf(c, t))).toEqual({ k: 'charmander', q: 'rattata', r: 'rattata', n: 'rattata', bLight: 'rattata', bDark: 'rattata', p: 'rattata' });
  });

  it("My Team picks: BLUE's starter on your side grows a stage, a member gives way at its stage; other trainers keep theirs", () => {
    const c = reached('rival-3', 'bulbasaur', { caught: { bulbasaur: 1, charmander: 1, pidgeotto: 1 }, team: { p: 'charmander', n: 'pidgeotto' } });
    expect(partyOf(c, rivals[2]!.trainers![0]!)).toEqual(['charmeleon', 'raticate', 'growlithe']);
    const brock = PLACES.find((p) => p.id === 'pewter-gym')!.trainers![0]!;
    expect(partyOf(reached('pewter-gym', 'bulbasaur'), brock)).toEqual(teamOf(reached('pewter-gym', 'bulbasaur'), brock));
  });
});
