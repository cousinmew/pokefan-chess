// SPDX-License-Identifier: AGPL-3.0-only
// Computer trainers bring their own teams (change B): src/data/trainer-teams.json, one loadout per trainer sprite.
// Loadouts skip the My Team rules; all 8 pawns are one species. BLUE's Champion team answers your starter.
import data from '../data/trainer-teams.json';
import type { TeamSkin } from './pieces';

type Entry = { team: TeamSkin; byStarter?: Record<string, TeamSkin> };
const TRAINERS = data.trainers as Record<string, Entry>;

/** The trainer's team, or null for a sprite with no loadout (a player's own trainer). */
export function loadout(sprite: string, starter?: string | null): TeamSkin | null {
  const t = TRAINERS[sprite];
  if (!t) return null;
  return { ...t.team, ...(starter ? t.byStarter?.[starter] : undefined) };
}
