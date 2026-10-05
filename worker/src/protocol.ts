// SPDX-License-Identifier: AGPL-3.0-only
// Wire protocol shared by the relay and the game client. JSON over one WebSocket per player.

export type Seat = 'w' | 'b';
export const REACTION_COUNT = 6;
export const CODE_RE = /^[A-HJ-NP-Z]{4}$/;

export interface Result {
  reason: 'checkmate' | 'draw' | 'timeout' | 'resign';
  winner: Seat | null;
}

export type ClientMsg =
  | { type: 'join'; token: string }
  | { type: 'move'; uci: string }
  | { type: 'reaction'; id: number }
  | { type: 'resign' }
  | { type: 'rematch'; swap?: boolean };

export interface SeatInfo {
  taken: boolean;
  online: boolean;
}

export type ServerMsg =
  | { type: 'state'; you: Seat; moves: string[]; fen: string; seats: Record<Seat, SeatInfo>; result: Result | null; rematch: Seat[] }
  | { type: 'reject'; reason: string }
  | { type: 'reaction'; id: number; from: Seat }
  | { type: 'error'; reason: 'unknown' | 'full' | 'replaced' };
