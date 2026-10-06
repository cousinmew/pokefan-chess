// SPDX-License-Identifier: AGPL-3.0-only
// Species lookup: role + colour + square colour -> species (Part I §2, bishop species rule).
import roster from '../data/roster.gen1.json';
import kanto from '../data/kanto.json';
import { ASSET_BASE } from '../config';

export type Color = 'w' | 'b';
export type Role = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type TeamId = keyof typeof roster.teams;
export type SpeciesId = string;
export type MoveId = string;

export interface MoveInfo {
  name: string;
  type: string;
  fx: string;
}

/** Every species the game knows: the two v1 teams plus the Kanto route Pokémon. The v1 roster wins on overlap. */
export const SPECIES: Record<SpeciesId, Species> = { ...(kanto.species as Record<string, Species>), ...(roster.species as Record<string, Species>) };
export const MOVES: Record<MoveId, MoveInfo> = { ...(kanto.moves as Record<string, MoveInfo>), ...(roster.moves as Record<string, MoveInfo>) };

/** A player's chosen skins (§B5): any role left out keeps the default team's species. */
export interface TeamSkin {
  k?: SpeciesId;
  q?: SpeciesId;
  r?: SpeciesId;
  n?: SpeciesId;
  p?: SpeciesId;
  bLight?: SpeciesId;
  bDark?: SpeciesId;
}
export const SKIN_ROLES = ['k', 'q', 'r', 'bLight', 'bDark', 'n', 'p'] as const;
let skins: Partial<Record<Color, TeamSkin>> = {};

/** Sets the skins in use (vs Computer: the player's side; online: both sides; otherwise none). */
export function setSkins(next: Partial<Record<Color, TeamSkin>>): void {
  skins = next;
}

export interface Species {
  dex: number;
  name: string;
  types: string[];
  move: string;
  fallback?: string;
  /** Variant flags from a skin id like "pidgey:s:2" (§B12): shiny sprite, 1 to 3 stars. */
  shiny?: boolean;
  stars?: number;
}

/** Splits a skin or species id "name[:s][:1-3]" into its base species and variant flags. */
export function parseVariant(id: string): { base: string; shiny: boolean; stars: number } {
  const [base = '', ...flags] = id.split(':');
  const star = flags.find((f) => /^[1-3]$/.test(f));
  return { base, shiny: flags.includes('s'), stars: star ? Number(star) : 0 };
}

export function variantId(base: string, shiny: boolean, stars: number): string {
  return base + (shiny ? ':s' : '') + (stars ? `:${stars}` : '');
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
  const skin = skins[color];
  const pick = skin?.[role === 'b' ? (isDarkSquare(square) ? 'bDark' : 'bLight') : role];
  if (pick && SPECIES[parseVariant(pick).base]) return pick;
  const entry = roster.teams[teamOf(color)].pieces[role];
  if (typeof entry === 'string') return entry;
  return isDarkSquare(square) ? entry.dark : entry.light;
}

const variants = new Map<string, Species>();

/** A species by id; a variant id ("pidgey:s:2") returns that species with its shiny and star flags. */
export function species(id: SpeciesId): Species {
  const direct = SPECIES[id];
  if (direct) return direct;
  let v = variants.get(id);
  if (!v) {
    const { base, shiny, stars } = parseVariant(id);
    const s = SPECIES[base];
    if (!s) throw new Error(`unknown species ${id}`);
    v = { ...s, shiny, stars };
    variants.set(id, v);
  }
  return v;
}

export function speciesFor(color: Color, role: Role, square: string): Species {
  return species(speciesIdFor(color, role, square));
}

export function spriteUrl(dex: number, kind: 'front' | 'back' | 'retro' = 'front', shiny = false): string {
  if (kind === 'retro') return `${ASSET_BASE}retro/${dex}.png`;
  return `${ASSET_BASE}${shiny ? 'shiny/' : ''}${kind}/${dex}.gif`;
}
