// SPDX-License-Identifier: AGPL-3.0-only
// Team rules (§B14), shared by the game's My Team screen and the relay. Skins stay cosmetic, but follow logic:
// King: the starter's family. Queen: fully evolved or legendary (legendaries only here), after the first badge.
// Rooks, knights, bishops: evolved or single stage, never legendary. Pawns: first stage, never legendary.
import rules from './species-rules.json';
import type { Skin } from './protocol';

interface Rule {
  fam: string;
  evolved: boolean;
  final: boolean;
  legendary: boolean;
}
const RULES = rules as Record<string, Rule>;
export const STARTER_FAMILIES = ['bulbasaur', 'charmander', 'squirtle'];

export type SkinRole = keyof Skin;
export type Ineligible = 'king' | 'queenLocked' | 'queen' | 'minor' | 'pawn' | 'unknown';

/** Why a species may not fill a role, or null when it may. `starter` null means any starter family (relay). */
export function whyNot(role: SkinRole, id: string, starter: string | null, badges: number): Ineligible | null {
  const base = id.split(':')[0] ?? '';
  const r = RULES[base];
  if (!r) return 'unknown';
  switch (role) {
    case 'k':
      return (starter ? r.fam === (RULES[starter]?.fam ?? starter) : STARTER_FAMILIES.includes(r.fam)) ? null : 'king';
    case 'q':
      if (badges < 1) return 'queenLocked';
      return r.final || r.legendary ? null : 'queen';
    case 'p':
      return !r.evolved && !r.legendary ? null : 'pawn';
    default:
      return (r.evolved || r.final) && !r.legendary ? null : 'minor';
  }
}

/** Keeps the eligible slots of a team; returns the kept team and the roles that were dropped. */
export function enforce(team: Skin, starter: string | null, badges: number): { team: Skin; dropped: [SkinRole, string][] } {
  const out: Skin = {};
  const dropped: [SkinRole, string][] = [];
  for (const [role, id] of Object.entries(team) as [SkinRole, string][]) {
    if (!id) continue;
    if (whyNot(role, id, starter, badges) === null) out[role] = id;
    else dropped.push([role, id]);
  }
  return { team: out, dropped };
}
