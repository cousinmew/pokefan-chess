// SPDX-License-Identifier: AGPL-3.0-only
// Species lookup: role + colour + square colour -> species (Part I §2, bishop species rule).
import roster from '../data/roster.gen1.json';
import { ASSET_BASE } from '../config';

export type Color = 'w' | 'b';
export type Role = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type TeamId = keyof typeof roster.teams;
export type SpeciesId = keyof typeof roster.species;
export type MoveId = keyof typeof roster.moves;

export interface Species {
  dex: number;
  name: string;
  types: string[];
  move: string;
  fallback?: string;
}

export const ROLES: Role[] = ['k', 'q', 'r', 'b', 'n', 'p'];
export const GLYPHS: Record<Color, Record<Role, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

export function teamOf(color: Color): TeamId {
  const id = (Object.keys(roster.teams) as TeamId[]).find((t) => roster.teams[t].color === color);
  if (!id) throw new Error(`no team plays ${color}`);
  return id;
}

/** A square is dark when fileIndex + rankNumber is odd (a1 is dark). */
export function isDarkSquare(square: string): boolean {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return (file + rank) % 2 === 1;
}

export function speciesIdFor(color: Color, role: Role, square: string): SpeciesId {
  const entry = roster.teams[teamOf(color)].pieces[role];
  if (typeof entry === 'string') return entry as SpeciesId;
  return (isDarkSquare(square) ? entry.dark : entry.light) as SpeciesId;
}

export function species(id: SpeciesId): Species {
  return roster.species[id];
}

export function speciesFor(color: Color, role: Role, square: string): Species {
  return species(speciesIdFor(color, role, square));
}

export function spriteUrl(dex: number, kind: 'front' | 'back' | 'retro' = 'front'): string {
  if (kind === 'retro') return `${ASSET_BASE}retro/${dex}.png`;
  return `${ASSET_BASE}${kind}/${dex}.gif`;
}
