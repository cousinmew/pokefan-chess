// SPDX-License-Identifier: AGPL-3.0-only
// Victory Road drills (§B2 row 10): mate a lone king within a move limit. chess.js decides the result.
import type { Chess } from 'chess.js';
import type { Color } from '../board/pieces';

export type DrillStatus = 'playing' | 'mate' | 'lost' | 'draw' | 'limit';

/** After any move: mate by you wins; a draw or being mated fails; your turn again with no moves left fails. */
export function drillStatus(chess: Chess, yourMoves: number, limit: number, you: Color): DrillStatus {
  if (chess.isCheckmate()) return chess.turn() === you ? 'lost' : 'mate';
  if (chess.isDraw()) return 'draw';
  if (chess.turn() === you && yourMoves >= limit) return 'limit';
  return 'playing';
}
