// SPDX-License-Identifier: AGPL-3.0-only
// Thin wrapper over chess.js. chess.js decides every legal move and every end (prime directive 2).
import { Chess, type Move, type Square } from 'chess.js';
import { species, speciesFor, teamOf, type Color, type Role } from '../board/pieces';
import roster from '../data/roster.gen1.json';
import type { Line, StringKey } from './text';

export type EndReason = 'checkmate' | 'stalemate' | 'threefold' | 'fifty' | 'insufficient';

export interface EndInfo {
  reason: EndReason;
  winner: Color | null;
  line: Line;
}

export interface Outcome {
  move: Move;
  lines: Line[];
  end: EndInfo | null;
}

const DRAW_CAPTION: Record<Exclude<EndReason, 'checkmate'>, StringKey> = {
  stalemate: 'caption.stalemate',
  threefold: 'caption.threefold',
  fifty: 'caption.fifty',
  insufficient: 'caption.insufficient',
};

export class Game {
  readonly chess = new Chess();

  loadFen(fen: string): void {
    this.chess.load(fen);
  }

  reset(): void {
    this.chess.reset();
  }

  fen(): string {
    return this.chess.fen();
  }

  turn(): Color {
    return this.chess.turn();
  }

  pieceAt(square: string): { color: Color; type: Role } | null {
    return this.chess.get(square as Square) ?? null;
  }

  legalFrom(square: string): Move[] {
    return this.chess.moves({ square: square as Square, verbose: true });
  }

  isPromotion(from: string, to: string): boolean {
    return this.legalFrom(from).some((m) => m.to === to && m.promotion);
  }

  /** The king square of the side to move when it is in check, else null. */
  checkedKing(): string | null {
    if (!this.chess.inCheck()) return null;
    const color = this.turn();
    for (const row of this.chess.board()) {
      for (const cell of row) if (cell && cell.type === 'k' && cell.color === color) return cell.square;
    }
    return null;
  }

  /** Plays a move by UCI or from/to. Returns null if illegal. */
  play(from: string, to: string, promotion?: Role): Outcome | null {
    let move: Move;
    try {
      move = this.chess.move({ from, to, promotion });
    } catch (err) {
      if (err instanceof Error) return null;
      throw err;
    }
    return { move, lines: this.linesFor(move), end: this.endState() };
  }

  playUci(uci: string): Outcome | null {
    const promo = uci.length > 4 ? (uci[4] as Role) : undefined;
    return this.play(uci.slice(0, 2), uci.slice(2, 4), promo);
  }

  endState(): EndInfo | null {
    const c = this.chess;
    if (c.isCheckmate()) {
      const loser = this.turn();
      const key = roster.teams[teamOf(loser)].mateKey as StringKey;
      return { reason: 'checkmate', winner: loser === 'w' ? 'b' : 'w', line: { key, caption: 'caption.checkmate' } };
    }
    let reason: Exclude<EndReason, 'checkmate'> | null = null;
    if (c.isStalemate()) reason = 'stalemate';
    else if (c.isInsufficientMaterial()) reason = 'insufficient';
    else if (c.isThreefoldRepetition()) reason = 'threefold';
    else if (c.isDrawByFiftyMoves()) reason = 'fifty';
    if (!reason) return null;
    return { reason, winner: null, line: { key: 'draw', caption: DRAW_CAPTION[reason] } };
  }

  private linesFor(m: Move): Line[] {
    const lines: Line[] = [];
    const mover = speciesFor(m.color, m.piece, m.from);
    if (m.isKingsideCastle() || m.isQueensideCastle()) {
      const rookTo = m.isKingsideCastle() ? `f${m.to[1]}` : `d${m.to[1]}`;
      const rook = speciesFor(m.color, 'r', rookTo);
      lines.push({ key: 'castle', vars: { king: mover.name, rook: rook.name }, caption: 'caption.castle' });
    }
    if (m.captured) {
      const them: Color = m.color === 'w' ? 'b' : 'w';
      const capSquare = m.isEnPassant() ? `${m.to[0]}${m.from[1]}` : m.to;
      const victim = speciesFor(them, m.captured, capSquare);
      lines.push({
        key: 'battle.fainted',
        vars: { defender: victim.name },
        ...(m.isEnPassant() ? { caption: 'caption.enPassant' as StringKey } : {}),
      });
    }
    if (m.promotion) {
      const into = speciesFor(m.color, m.promotion, m.to);
      lines.push({ key: 'evolve.done', vars: { pawn: mover.name, piece: into.name }, caption: 'caption.promotion' });
    }
    const king = this.checkedKing();
    if (king && !this.chess.isCheckmate()) {
      const k = species(teamKing(this.turn()));
      lines.push({ key: 'check', vars: { king: k.name }, caption: 'caption.check' });
    }
    return lines;
  }
}

function teamKing(color: Color) {
  return roster.teams[teamOf(color)].pieces.k as keyof typeof roster.species;
}
