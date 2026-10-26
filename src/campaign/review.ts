// SPDX-License-Identifier: AGPL-3.0-only
// The review moment after every puzzle (§B15): frames for a line, the theme's key idea drawn on the board, and
// one line of text from a template. Pure logic over chess.js; the puzzle player shows it.
import { Chess, type Square } from 'chess.js';
import { speciesFor, type Color, type Role } from '../board/pieces';
import type { StringKey, Vars } from '../game/text';

export interface Arrow {
  from: string;
  to: string;
  color: 'green' | 'red' | 'blue';
}
export interface Frame {
  fen: string;
  arrows: Arrow[];
  /** Squares circled: covered escape squares, a hanging piece, a promotion square. */
  marks: string[];
  /** The move into this frame slides on the board, its two squares lit (§B21 item 1). */
  slide?: { from: string; to: string };
  /** Squares whose piece shows faded (your wrong move). */
  faded?: string[];
  /** The line the review shows with this frame, if it changes. */
  text?: string;
}
export interface Idea {
  lines: Arrow[];
  marks: string[];
  text: { key: StringKey; vars?: Vars };
}

const asMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
const VALUE: Record<Role, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const FILES = 'abcdefgh';

/** Frame 0 is the start; frame k shows the position after k moves with that move's arrow. */
export function lineFrames(startFen: string, moves: string[], color: Arrow['color']): Frame[] {
  const chess = new Chess(startFen);
  const frames: Frame[] = [{ fen: chess.fen(), arrows: [], marks: [] }];
  for (const m of moves) {
    chess.move(asMove(m));
    frames.push({ fen: chess.fen(), arrows: [{ from: m.slice(0, 2), to: m.slice(2, 4), color }], marks: [], slide: { from: m.slice(0, 2), to: m.slice(2, 4) } });
  }
  return frames;
}

const nameAt = (chess: Chess, sq: string) => {
  const p = chess.get(sq as Square);
  return p ? speciesFor(p.color, p.type, sq).name : '';
};

/** Walks a ray from `sq` and returns the squares of the first two pieces met. */
function ray(chess: Chess, sq: string, df: number, dr: number): string[] {
  const hits: string[] = [];
  let f = FILES.indexOf(sq[0]!) + df;
  let r = Number(sq[1]) + dr;
  while (f >= 0 && f < 8 && r >= 1 && r <= 8 && hits.length < 2) {
    const s = `${FILES[f]}${r}`;
    if (chess.get(s as Square)) hits.push(s);
    f += df;
    r += dr;
  }
  return hits;
}

const DIRS: Record<'b' | 'r' | 'q', [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};

type Family = 'fork' | 'pin' | 'skewer' | 'discovered' | 'mate' | 'hanging' | 'promotion' | 'castle' | null;
const FAMILY: Record<string, Family> = {
  fork: 'fork', pin: 'pin', skewer: 'skewer', xRayAttack: 'skewer', discoveredAttack: 'discovered', discoveredCheck: 'discovered', doubleCheck: 'discovered',
  mateIn1: 'mate', mateIn2: 'mate', backRankMate: 'mate', hangingPiece: 'hanging', capturingDefender: 'hanging', trappedPiece: 'hanging', advantage: 'hanging',
  promotion: 'promotion', advancedPawn: 'promotion', castling: 'castle',
};

/** The theme's key idea on a solved line (§B15). `moves` starts with your first move; you play `you`. */
export function keyIdea(theme: string, startFen: string, moves: string[], you: Color): Idea {
  const chess = new Chess(startFen);
  const key = moves[0]!;
  const before = new Chess(startFen);
  chess.move(asMove(key));
  const to = key.slice(2, 4);
  const them: Color = you === 'w' ? 'b' : 'w';
  const end = new Chess(startFen);
  for (const m of moves) end.move(asMove(m));
  let family = FAMILY[theme] ?? null;
  if (!family && end.isCheckmate()) family = 'mate';
  const red = (from: string, sq: string): Arrow => ({ from, to: sq, color: 'red' });

  if (family === 'fork') {
    const targets = chess.board().flat().filter((p) => p && p.color === them && p.type !== 'p' && chess.attackers(p.square, you).includes(to as Square)).map((p) => p!.square as string);
    if (targets.length >= 2) return { lines: targets.map((t) => red(to, t)), marks: [], text: { key: 'review.fork', vars: { piece: nameAt(chess, to), a: nameAt(chess, targets[0]!), b: nameAt(chess, targets[1]!) } } };
  }
  if (family === 'pin' || family === 'skewer') {
    const mover = chess.get(to as Square);
    for (const [df, dr] of mover && mover.type in DIRS ? DIRS[mover.type as 'b' | 'r' | 'q'] : []) {
      const [a, b] = ray(chess, to, df, dr);
      const pa = a ? chess.get(a as Square) : undefined;
      const pb = b ? chess.get(b as Square) : undefined;
      if (!a || !b || !pa || !pb || pa.color !== them || pb.color !== them) continue;
      const pinned = VALUE[pb.type] > VALUE[pa.type];
      if ((family === 'pin') === pinned || theme === 'xRayAttack') {
        return { lines: [red(to, a), red(a, b)], marks: [], text: { key: pinned ? 'review.pin' : 'review.skewer', vars: { front: nameAt(chess, a), back: nameAt(chess, b) } } };
      }
    }
  }
  if (family === 'discovered') {
    const from = key.slice(0, 2);
    for (const p of chess.board().flat()) {
      if (!p || p.color !== you || !(p.type in DIRS) || p.square === to) continue;
      for (const [df, dr] of DIRS[p.type as 'b' | 'r' | 'q']) {
        const was = ray(before, p.square, df, dr)[0];
        const now = ray(chess, p.square, df, dr)[0];
        const hit = now ? chess.get(now as Square) : undefined;
        if (was === from && now && hit?.color === them) {
          return { lines: [red(p.square, now)], marks: [], text: { key: 'review.discovered', vars: { mover: nameAt(chess, to), slider: nameAt(chess, p.square) } } };
        }
      }
    }
  }
  if (family === 'mate' && end.isCheckmate()) {
    const king = end.board().flat().find((p) => p && p.type === 'k' && p.color === end.turn())!;
    const f = FILES.indexOf(king.square[0]!);
    const r = Number(king.square[1]);
    const marks: string[] = [];
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const s = `${FILES[f + df] ?? ''}${r + dr}`;
        if ((df || dr) && /^[a-h][1-8]$/.test(s) && end.get(s as Square)?.color !== end.turn()) marks.push(s);
      }
    }
    return { lines: [], marks, text: { key: 'review.mate', vars: { king: nameAt(end, king.square) } } };
  }
  if (family === 'hanging') {
    const cap = moves.filter((_, i) => i % 2 === 0).find((m, i) => {
      const pos = new Chess(startFen);
      for (const x of moves.slice(0, i * 2)) pos.move(asMove(x));
      return !!pos.get(m.slice(2, 4) as Square);
    });
    if (cap) {
      const pos = new Chess(startFen);
      for (const x of moves.slice(0, moves.indexOf(cap))) pos.move(asMove(x));
      return { lines: [], marks: [cap.slice(2, 4)], text: { key: 'review.hanging', vars: { piece: nameAt(pos, cap.slice(2, 4)) } } };
    }
  }
  if (family === 'castle') {
    // The king tucked away and the rook beside it (playtest, 23 Oct: a castling solve ended on "Solved!").
    const pos = new Chess(startFen);
    for (const [i, m] of moves.entries()) {
      const mv = pos.move(asMove(m));
      if (i % 2 === 0 && (mv.isKingsideCastle() || mv.isQueensideCastle())) {
        const rook = `${mv.isKingsideCastle() ? 'f' : 'd'}${mv.to[1]}`;
        return { lines: [], marks: [mv.to, rook], text: { key: 'review.castle', vars: { king: nameAt(pos, mv.to), rook: nameAt(pos, rook) } } };
      }
    }
  }
  if (family === 'promotion') {
    const promo = moves.find((m) => m.length > 4);
    if (promo) return { lines: [], marks: [promo.slice(2, 4)], text: { key: 'review.promotion', vars: { piece: nameAt(end, promo.slice(2, 4)) || nameAt(chess, to) } } };
  }
  return { lines: [], marks: [], text: { key: 'review.solved' } };
}

/** Your biggest piece that the piece on `sq` now attacks and that it can win: undefended, or worth more than it. */
function threatened(chess: Chess, sq: string, you: Color): { square: string; color: Color; type: Role } | null {
  const mover = chess.get(sq as Square);
  if (!mover || mover.color === you) return null;
  const hits = chess.board().flat().filter((p) => p && p.color === you && p.type !== 'k' && chess.attackers(p.square, mover.color).includes(sq as Square) && (VALUE[p.type] > VALUE[mover.type] || chess.attackers(p.square, you).length === 0));
  const top = hits.sort((a, b) => VALUE[b!.type] - VALUE[a!.type])[0];
  return top ? { square: top.square, color: top.color, type: top.type } : null;
}

/** One line about the punishing reply to a wrong move (§B15), true to what it does (playtest, 23 Oct: a quiet queen
 * retreat read "that one hurts!"): it mates, takes, checks, now attacks one of yours, or gets away from your attack. */
export function refutationText(afterWrong: string, reply: string, you: Color, sideName: string): { key: StringKey; vars: Vars } {
  const chess = new Chess(afterWrong);
  const from = reply.slice(0, 2);
  const to = reply.slice(2, 4);
  const mover = chess.get(from as Square);
  const victim = chess.get(to as Square);
  const fled = !!mover && chess.attackers(from as Square, you).length > 0;
  const mv = chess.move(asMove(reply));
  if (chess.isCheckmate()) return { key: 'review.wrong.mate', vars: { side: sideName } };
  if (victim && victim.color === you) return { key: 'review.wrong.capture', vars: { side: sideName, piece: speciesFor(victim.color, victim.type, to).name } };
  if (chess.inCheck()) return { key: 'review.wrong.check', vars: { side: sideName, san: mv.san } };
  const hit = threatened(chess, to, you);
  if (hit) return { key: 'review.wrong.threat', vars: { side: sideName, piece: speciesFor(hit.color, hit.type, hit.square).name } };
  if (fled && mover) return { key: 'review.wrong.escape', vars: { side: sideName, piece: speciesFor(mover.color, mover.type, from).name } };
  return { key: 'review.wrong.move', vars: { side: sideName, san: mv.san } };
}

/** What their reply did, said between your moves (playtest, 23 Oct: "Good! Keep going." hid that they took your queen,
 * so the obvious recapture looked right). `before` is the position before their reply. */
export function replyLine(before: string, reply: string, you: Color, them: string): { key: StringKey; vars?: Vars } {
  const chess = new Chess(before);
  const to = reply.slice(2, 4);
  const victim = chess.get(to as Square);
  chess.move(asMove(reply));
  if (victim && victim.color === you) return { key: 'reply.took', vars: { them, piece: speciesFor(victim.color, victim.type, to).name } };
  if (chess.inCheck()) return { key: 'reply.check', vars: { them } };
  const hit = threatened(chess, to, you);
  if (hit) return { key: 'reply.attacks', vars: { them, piece: speciesFor(hit.color, hit.type, hit.square).name } };
  return { key: 'puzzle.correct' };
}

/** Material for `you` minus the other side, in points (pawn 1, knight and bishop 3, rook 5, queen 9). */
export function material(fen: string, you: Color): number {
  let n = 0;
  for (const p of new Chess(fen).board().flat()) if (p && p.type !== 'k') n += (p.color === you ? 1 : -1) * VALUE[p.type];
  return n;
}

/** "Your move: behind by 3. The right line: ahead by 3." (playtest, 23 Oct: the miss review showed what was right, not
 * what it was worth). Points against the puzzle's start, so a queen lost on the way counts; a line that mates says so. */
export function compareText(start: string, yours: string, right: string, you: Color, t: (key: StringKey, vars?: Vars) => string): string {
  const base = material(start, you);
  const say = (fen: string) => {
    if (new Chess(fen).isCheckmate()) return t('review.pts.mate');
    const d = material(fen, you) - base;
    return d > 0 ? t('review.pts.up', { n: String(d) }) : d < 0 ? t('review.pts.down', { n: String(-d) }) : t('review.pts.even');
  };
  return t('review.compare', { yours: say(yours), right: say(right) });
}

/** The right move in plain words (§B21 item 1): the piece, how it moves and what it does, never notation. Square names
 * only when the coordinates setting is on. `names` picks Pokémon names, or chess role names in Classic style. */
export function describeMove(fen: string, uci: string, names: 'species' | 'role', coords: boolean, t: (key: StringKey) => string): { key: StringKey; vars: Vars } {
  const chess = new Chess(fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const mover = chess.get(from as Square)!;
  const victim = chess.get(to as Square);
  const label = (p: { color: Color; type: Role }, sq: string) => (names === 'role' ? t(`role.${p.type}` as StringKey) : speciesFor(p.color, p.type, sq).name);
  const vars: Vars = { piece: label(mover, from), action: t(`review.act.${mover.type}` as StringKey), squares: coords ? ` (${from}-${to})` : '' };
  const mv = chess.move(asMove(uci));
  if (chess.isCheckmate()) return { key: 'review.right.mate', vars };
  // Castling says so (playtest, 23 Oct: it read "steps over: that's the best square").
  if (mv.isKingsideCastle() || mv.isQueensideCastle()) {
    const rookFrom = `${mv.isKingsideCastle() ? 'h' : 'a'}${from[1]}`;
    const rook = new Chess(fen).get(rookFrom as Square);
    if (rook) return { key: 'review.right.castle', vars: { ...vars, rook: label(rook, rookFrom) } };
  }
  if (victim) return { key: 'review.right.capture', vars: { ...vars, victim: label(victim, to) } };
  if (chess.inCheck()) return { key: 'review.right.check', vars };
  // The biggest piece it now attacks, if any.
  const target = chess.board().flat().filter((p) => p && p.color !== mover.color && p.type !== 'k' && chess.attackers(p.square, mover.color).includes(to as Square)).sort((a, b) => VALUE[b!.type] - VALUE[a!.type])[0];
  if (target) return { key: 'review.right.attack', vars: { ...vars, victim: label(target, target.square) } };
  return { key: 'review.right.quiet', vars };
}

