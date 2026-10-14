// SPDX-License-Identifier: AGPL-3.0-only
// Wire protocol shared by the relay and the game client. JSON over one WebSocket per player.

export type Seat = 'w' | 'b';
export const REACTION_COUNT = 6;
export const CODE_RE = /^[A-HJ-NP-Z]{4}$/;
/** A player's piece skins (§B5): role -> species id. The client ignores ids it does not know. */
export type Skin = Partial<Record<'k' | 'q' | 'r' | 'n' | 'p' | 'bLight' | 'bDark', string>>;
export const SKIN_KEYS = ['k', 'q', 'r', 'n', 'p', 'bLight', 'bDark'] as const;
/** How a side looks (§B18 items 5 and 8): its BLUE evolution stage (0 to 2) and the trainer standing beside the board. */
export interface Look {
  stage?: 0 | 1 | 2;
  trainer?: 'red' | 'meir';
}

export interface Result {
  reason: 'checkmate' | 'draw' | 'timeout' | 'resign';
  winner: Seat | null;
}

export type ClientMsg =
  | { type: 'join'; token: string; skin?: Skin; look?: Look }
  | { type: 'move'; uci: string }
  | { type: 'reaction'; id: number }
  | { type: 'resign' }
  | { type: 'rematch'; swap?: boolean };

export interface SeatInfo {
  taken: boolean;
  online: boolean;
}

export type ServerMsg =
  /** `rematch`: the seats that asked for a rematch since the result; `swap`: one of them asked to swap sides (an older
   * relay sends no swap). */
  | { type: 'state'; you: Seat; moves: string[]; fen: string; seats: Record<Seat, SeatInfo>; result: Result | null; rematch: Seat[]; swap?: boolean; skins: Partial<Record<Seat, Skin>>; looks?: Partial<Record<Seat, Look>> }
  | { type: 'reject'; reason: string }
  | { type: 'reaction'; id: number; from: Seat }
  | { type: 'error'; reason: 'unknown' | 'full' | 'replaced' };
