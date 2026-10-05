// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game/chess';
import { speciesIdFor, type Color, type Role } from '../../src/board/pieces';
import { fmt } from '../../src/game/text';

const START: Record<string, string> = {
  a1: 'snorlax', b1: 'rapidash', c1: 'venusaur', d1: 'charizard', e1: 'pikachu', f1: 'blastoise', g1: 'rapidash', h1: 'snorlax',
  a8: 'rhydon', b8: 'dugtrio', c8: 'arbok', d8: 'nidoqueen', e8: 'nidoking', f8: 'weezing', g8: 'dugtrio', h8: 'rhydon',
};

describe('species lookup', () => {
  it('all 32 starting squares', () => {
    const g = new Game();
    for (const f of 'abcdefgh') {
      for (const r of [1, 2, 7, 8]) {
        const sq = `${f}${r}`;
        const p = g.pieceAt(sq);
        expect(p).not.toBeNull();
        const want = START[sq] ?? (r === 2 ? 'eevee' : 'rattata');
        expect(speciesIdFor(p!.color, p!.type, sq)).toBe(want);
      }
    }
  });

  const promo = (fen: string, uci: string, color: Color, role: Role, sq: string) => {
    const g = new Game();
    g.loadFen(fen);
    const out = g.playUci(uci);
    expect(out).not.toBeNull();
    expect(out!.move.promotion).toBe(role);
    return speciesIdFor(color, role, sq);
  };

  it('fixed bishop promotion cases', () => {
    // White pawn on b7 / a7 promoting by push; black pawn on c2 / b2.
    expect(promo('7k/1P6/8/8/8/8/8/K7 w - - 0 1', 'b7b8b', 'w', 'b', 'b8')).toBe('venusaur');
    expect(promo('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8b', 'w', 'b', 'a8')).toBe('blastoise');
    expect(promo('7k/8/8/8/8/8/2p5/K7 b - - 0 1', 'c2c1b', 'b', 'b', 'c1')).toBe('weezing');
    expect(promo('7k/8/8/8/8/8/1p6/7K b - - 0 1', 'b2b1b', 'b', 'b', 'b1')).toBe('arbok');
  });

  it('promotion to q, r, b, n on light and dark squares', () => {
    const want: Record<string, [string, string]> = { q: ['charizard', 'charizard'], r: ['snorlax', 'snorlax'], b: ['blastoise', 'venusaur'], n: ['rapidash', 'rapidash'] };
    for (const role of ['q', 'r', 'b', 'n'] as Role[]) {
      expect(promo('7k/P7/8/8/8/8/8/K7 w - - 0 1', `a7a8${role}`, 'w', role, 'a8')).toBe(want[role]![0]);
      expect(promo('7k/1P6/8/8/8/8/8/K7 w - - 0 1', `b7b8${role}`, 'w', role, 'b8')).toBe(want[role]![1]);
    }
    const g = new Game();
    g.loadFen('7k/1P6/8/8/8/8/8/K7 w - - 0 1');
    const line = g.playUci('b7b8b')!.lines.find((l) => l.key === 'evolve.done')!;
    expect(fmt(line.key, line.vars)).toBe('EEVEE evolved into VENUSAUR!');
  });
});

describe('special moves', () => {
  const castle = (fen: string, uci: string) => {
    const g = new Game();
    g.loadFen(fen);
    const line = g.playUci(uci)!.lines.find((l) => l.key === 'castle')!;
    return fmt(line.key, line.vars);
  };
  it('castling both sides, both colours', () => {
    const fen = (t: Color) => `r3k2r/8/8/8/8/8/8/R3K2R ${t} KQkq - 0 1`;
    expect(castle(fen('w'), 'e1g1')).toBe('PIKACHU hid behind SNORLAX!');
    expect(castle(fen('w'), 'e1c1')).toBe('PIKACHU hid behind SNORLAX!');
    expect(castle(fen('b'), 'e8g8')).toBe('NIDOKING hid behind RHYDON!');
    expect(castle(fen('b'), 'e8c8')).toBe('NIDOKING hid behind RHYDON!');
  });
  it('en passant captures correctly', () => {
    const g = new Game();
    g.loadFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    const out = g.playUci('e5d6')!;
    expect(out.move.isEnPassant()).toBe(true);
    expect(g.pieceAt('d5')).toBeNull();
    expect(out.lines[0]).toMatchObject({ key: 'battle.fainted', vars: { defender: 'RATTATA' }, caption: 'caption.enPassant' });
  });
});

describe('end detection', () => {
  const after = (fen: string, uci: string[]) => {
    const g = new Game();
    if (fen) g.loadFen(fen);
    let end = null;
    for (const u of uci) end = g.playUci(u)!.end;
    return end;
  };
  it('mate, Rocket loses (Scholar)', () => {
    expect(after('', ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'])?.line.key).toBe('mate.rocketLoses');
  });
  it('mate, Red loses (Fool)', () => {
    expect(after('', ['f2f3', 'e7e5', 'g2g4', 'd8h4'])?.line.key).toBe('mate.redLoses');
  });
  it('stalemate', () => {
    expect(after('7k/8/6K1/5Q2/8/8/8/8 w - - 0 1', ['f5f7'])).toMatchObject({ reason: 'stalemate', line: { key: 'draw' } });
  });
  it('threefold', () => {
    const knights = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    expect(after('', [...knights, ...knights])).toMatchObject({ reason: 'threefold', line: { key: 'draw' } });
  });
  it('50 move rule', () => {
    expect(after('7k/8/8/8/8/8/R7/4K3 w - - 99 80', ['a2a3'])).toMatchObject({ reason: 'fifty', line: { key: 'draw' } });
  });
  it('insufficient material', () => {
    expect(after('7k/8/8/8/8/8/4r3/4K3 w - - 0 1', ['e1e2'])).toMatchObject({ reason: 'insufficient', line: { key: 'draw' } });
  });
});
