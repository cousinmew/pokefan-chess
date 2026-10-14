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

const EN_NAMES = { species: Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, v.name])), moves: Object.fromEntries(Object.entries(MOVES).map(([k, v]) => [k, v.name])) };
// nl, pt, he and ru have no localized names in PokéAPI: they use the English ones, in Latin script (§B17, §B20 item 4).
// N1 (14 Oct): each table is its own chunk, fetched once by loadNames (src/i18n.ts loadLanguage), not in the entry bundle.
type Names = { species: Record<string, string>; moves: Record<string, string> };
const NAMES = import.meta.glob<Names>('../data/names.*.json', { import: 'default' });
const LOCAL: Record<string, Names> = {};

/** Fetches a language's species and move names once (fr, es, de, it, ja, zh-Hans; the rest have none). */
export async function loadNames(lang: string): Promise<void> {
  const load = NAMES[`../data/names.${lang}.json`];
  if (load && !LOCAL[lang]) LOCAL[lang] = await load();
}

/** Species and move names for a language (§B17): PokéAPI's names for fr, es, de, it, ja (kana) and zh-Hans; English
 * otherwise, and until loadNames has fetched them. Synchronous. */
export function applyNames(lang: string): void {
  const local = LOCAL[lang];
  for (const [id, s] of Object.entries(SPECIES)) s.name = local?.species[id] ?? EN_NAMES.species[id]!;
  for (const [id, m] of Object.entries(MOVES)) m.name = local?.moves[id] ?? EN_NAMES.moves[id]!;
  variants.clear();
}

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

/** Whether this build knows a species, or a variant of one ("pidgey:s:2"): a save from another build or an edited
 * backup can name one it does not ("missingno"), and an own key only (not "constructor"). */
export const knownSpecies = (id: unknown): id is SpeciesId => typeof id === 'string' && Object.hasOwn(SPECIES, parseVariant(id).base);

/** A save's My Team with only the slots this build can show (boot fix, 14 Oct): an unknown species crashed boot (the
 * Journey's My Team prefetch), so its slot goes back to the default piece. The slots keep their order (the §B14
 * migration's notice lists them in it). Anything else that is not a team: none. */
export function knownTeam(team: unknown): TeamSkin {
  const out: TeamSkin = {};
  if (!team || typeof team !== 'object' || Array.isArray(team)) return out;
  for (const [role, id] of Object.entries(team)) if ((SKIN_ROLES as readonly string[]).includes(role) && knownSpecies(id)) out[role as (typeof SKIN_ROLES)[number]] = id;
  return out;
}
let skins: Partial<Record<Color, TeamSkin>> = {};
let stages: Partial<Record<Color, TeamSkin>> = {};
// Which team's look each colour wears (W3, playtest 12 Oct): Red on white and Rocket on black, except in puzzles,
// where you are always TEAM RED, so a black to move puzzle puts Red's look on black.
let wears: Record<Color, Color> = { w: 'w', b: 'b' };

/** You (RED) play `red`: that colour wears Red's look, the other Rocket's. Every other mode keeps Red on white. */
export function setWears(red: Color): void {
  wears = red === 'w' ? { w: 'w', b: 'b' } : { w: 'b', b: 'w' };
}

/** The colour whose team look `color` wears ('w' Red, 'b' Rocket). */
export const lookOf = (color: Color): Color => wears[color];

/** BLUE story stage per side (§B18 item 5): species that stand in for the default team until it evolves. */
export function setStages(next: Partial<Record<Color, TeamSkin>>): void {
  stages = next;
}

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
  const key = role === 'b' ? (isDarkSquare(square) ? 'bDark' : 'bLight') : role;
  const pick = skin?.[key] ?? stages[color]?.[key];
  if (pick && SPECIES[parseVariant(pick).base]) return pick;
  return defaultSpecies(wears[color], role, isDarkSquare(square));
}

/** The v1 roster's species for a role (the fully evolved team). */
export function defaultSpecies(color: Color, role: Role, dark: boolean): SpeciesId {
  const entry = roster.teams[teamOf(color)].pieces[role];
  if (typeof entry === 'string') return entry;
  return dark ? entry.dark : entry.light;
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

const WEBP = new Set<string>(typeof __WEBP__ === 'undefined' ? [] : __WEBP__);

/** Animated sprites are WebP where that file is smaller, else GIF; a WebP that fails falls back to the GIF (main.ts). */
export function spriteUrl(dex: number, kind: 'front' | 'back' | 'retro' = 'front', shiny = false): string {
  if (kind === 'retro') return `${ASSET_BASE}retro/${dex}.png`;
  const path = `${shiny ? 'shiny/' : ''}${kind}/${dex}`;
  return `${ASSET_BASE}${path}.${WEBP.has(path) ? 'webp' : 'gif'}`;
}
