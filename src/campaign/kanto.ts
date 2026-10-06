// SPDX-License-Identifier: AGPL-3.0-only
// Kanto campaign rules (§B3, §B4): real Red tall grass slots, catch odds earned by how you solved,
// route mastery, and saved progress. Pure logic: the screens live in src/ui/kanto.ts.
import kanto from '../data/kanto.json';
import { CANDY_COST, CANDY_PER_CATCH, CANDY_PER_OAK, CATCH, MASTERY_NEED, MASTERY_WINDOW, RARE_SLOT_BELOW, SHINY_ODDS, SHINY_STREAK, STAR_STEPS, STREAK_FOR_RARE } from '../config';
import { PLACES, placeUnlocked } from './journey';
import sources from '../data/sources.kanto.json';
import { enforce, type SkinRole } from '../../worker/src/team';
import type { Rng } from '../game/rng';
import { load, save } from '../store/persist';
import type { TeamSkin } from '../board/pieces';

export interface Encounter {
  species: string;
  slots: number[];
  min: number;
  max: number;
}
export interface Route {
  id: string;
  name: string;
  area: string;
  themes: string[];
  encounters: Encounter[];
  /** Blue's table for the same area (§B12): both versions' exclusives are catchable. */
  blue: Encounter[];
}
export interface Slot {
  species: string;
  chance: number;
}

export const ROUTES = kanto.routes as Route[];
export const STARTERS = kanto.starters;

/** The route's slots in PokéAPI order, one entry per slot with its own chance (percent). Red unless asked for Blue. */
export function slotsOf(route: Route, version: 'red' | 'blue' = 'red'): Slot[] {
  return (version === 'blue' ? route.blue : route.encounters).flatMap((e) => e.slots.map((chance) => ({ species: e.species, chance })));
}

/** Which slot (index into slotsOf) the tall grass picks: a roll over the slot chances, as in Red. */
export function rollSlotIndex(route: Route, rng: Rng, version: 'red' | 'blue' = 'red'): number {
  const slots = slotsOf(route, version);
  const total = slots.reduce((n, s) => n + s.chance, 0);
  let r = rng.next() * total;
  for (let i = 0; i < slots.length; i++) {
    r -= slots[i]!.chance;
    if (r < 0) return i;
  }
  return slots.length - 1;
}

export const rollSlot = (route: Route, rng: Rng): Slot => slotsOf(route)[rollSlotIndex(route, rng)]!;

/** A tall grass encounter (§B12): Red or Blue table at even odds, then shiny at SHINY_ODDS or by a first try streak. */
export function rollEncounter(c: Campaign, route: Route, solve: Solve, rng: Rng): { slot: Slot; shiny: boolean } {
  const version = rng.next() < 0.5 ? 'red' : 'blue';
  const slot = slotsOf(route, version)[rollSlotIndex(route, rng, version)]!;
  const streak = c.routes[route.id]?.shinyStreak ?? 0;
  const shiny = (solve === 'first' && streak >= SHINY_STREAK) || rng.next() < SHINY_ODDS;
  return { slot, shiny };
}

export const isRare = (slot: Slot) => slot.chance < RARE_SLOT_BELOW;

export type Solve = 'first' | 'hint';

export function catchChance(slot: Slot, solve: Solve, streak: number): number {
  if (isRare(slot) && solve === 'first' && streak >= STREAK_FOR_RARE) return 1;
  return CATCH[solve][isRare(slot) ? 'rare' : 'common'];
}

export interface RouteStats {
  last: boolean[];
  streak: number;
  /** First try solves in a row, for the guaranteed shiny (§B12). */
  shinyStreak?: number;
}
export interface Campaign {
  v: number;
  name: string;
  starter: string | null;
  /** How many of each species you own, shinies included. */
  caught: Record<string, number>;
  /** How many of those are shiny. */
  shiny: Record<string, number>;
  /** Duplicates sent to Oak, which earn stars. */
  oak: Record<string, number>;
  /** Candy per family (keyed by the family's first species). */
  candy: Record<string, number>;
  seen: string[];
  caughtAt: Record<string, string>;
  routes: Record<string, RouteStats>;
  journey: { cleared: string[]; beaten: string[]; visited: string[] };
  team: TeamSkin;
  playMs: number;
  /** Gym badges earned (C3). The queen slot opens with the first. */
  badges: string[];
  /** Oak's intro was seen once, so it can be skipped (§B14). */
  introSeen: boolean;
  /** Themes whose mini lesson Oak has shown. */
  lessonsSeen: string[];
  /** Team rules version applied to `team`, and the one time notice of what the rules reverted. */
  teamRules: number;
  teamNotice: [SkinRole, string][];
  /** Saves created before C2c keep the queen slot open without a badge (grandfathered). */
  queenOpen: boolean;
  champion: boolean;
  hallOfFame: { date: string; team: string[] }[];
  /** Places whose rewards were given, so a replay gives nothing twice. */
  rewards: string[];
}

export const TEAM_RULES_VERSION = 2;
/** Badges for the team rules: a grandfathered save counts as having the first. */
export const teamBadges = (c: Campaign) => Math.max(c.badges.length, c.queenOpen ? 1 : 0);

export const CAMPAIGN_VERSION = 2;
const FAMILIES = kanto.families as Record<string, string>;
export const familyOf = (id: string) => FAMILIES[id] ?? id;

const fresh = (): Campaign => ({
  v: CAMPAIGN_VERSION, name: '', starter: null, caught: {}, shiny: {}, oak: {}, candy: {}, seen: [], caughtAt: {}, routes: {},
  journey: { cleared: [], beaten: [], visited: [] }, team: {}, playMs: 0,
  badges: [], introSeen: false, lessonsSeen: [], teamRules: TEAM_RULES_VERSION, teamNotice: [],
  queenOpen: false, champion: false, hallOfFame: [], rewards: [],
});

/** Loads the save, migrating a C2 (v1) save without losing a single catch:
 * every catch so far earns its candy, caught species count as seen, and a mastered route counts as cleared. */
export function loadCampaign(): Campaign {
  const c = load<Partial<Campaign>>('campaign');
  const out: Campaign = {
    ...fresh(), ...c,
    caught: { ...c?.caught }, shiny: { ...c?.shiny }, oak: { ...c?.oak }, candy: { ...c?.candy }, seen: [...(c?.seen ?? [])],
    caughtAt: { ...c?.caughtAt }, routes: { ...c?.routes }, team: { ...c?.team },
    badges: [...(c?.badges ?? [])], lessonsSeen: [...(c?.lessonsSeen ?? [])], teamNotice: [...(c?.teamNotice ?? [])],
    hallOfFame: [...(c?.hallOfFame ?? [])], rewards: [...(c?.rewards ?? [])],
    // Grandfathered queen (C3 quick fix): a save with a starter but no introSeen predates C2c's Oak intro.
    queenOpen: c?.queenOpen ?? (!!c?.starter && !c?.introSeen),
    // Saves from before §B14 have no teamRules: their teams are checked once below.
    teamRules: c ? (c.teamRules ?? 0) : TEAM_RULES_VERSION,
    journey: { cleared: [...(c?.journey?.cleared ?? [])], beaten: [...(c?.journey?.beaten ?? [])], visited: [...(c?.journey?.visited ?? [])] },
  };
  if (c && (c.v ?? 1) < CAMPAIGN_VERSION) {
    for (const [id, n] of Object.entries(out.caught)) {
      out.candy[familyOf(id)] = (out.candy[familyOf(id)] ?? 0) + n * CANDY_PER_CATCH;
      if (!out.seen.includes(id)) out.seen.push(id);
    }
    // C2 opened routes by mastery: keep everything up to the last mastered route open.
    const last = Math.max(-1, ...PLACES.map((p, i) => (p.route && mastered(out, p.route) ? i : -1)));
    for (const p of PLACES.slice(0, last + 1)) {
      if (p.id !== 'pallet' && p.kind !== 'gym' && !out.journey.cleared.includes(p.id)) out.journey.cleared.push(p.id);
      for (const t of p.trainers ?? []) if (!out.journey.beaten.includes(t.id)) out.journey.beaten.push(t.id);
      if (p.route && !out.journey.visited.includes(p.id)) out.journey.visited.push(p.id);
    }
    out.v = CAMPAIGN_VERSION;
  }
  if (out.teamRules < 1) {
    // Migrated, not rejected (§B14 addendum): ineligible slots go back to the default piece, with one notice.
    const { team, dropped } = enforce(out.team, out.starter, teamBadges(out));
    out.team = team;
    out.teamNotice = [...out.teamNotice, ...dropped];
  }
  if (out.teamRules < 2 && out.queenOpen && !out.team.q) {
    // C2c reverted grandfathered queens; give back an eligible one that is still in the notice.
    const back = out.teamNotice.find(([role, id]) => role === 'q' && enforce({ q: id }, out.starter, 1).team.q);
    if (back) {
      out.team = { ...out.team, q: back[1] };
      out.teamNotice = out.teamNotice.filter((n) => n !== back);
    }
  }
  if (out.teamRules < TEAM_RULES_VERSION) {
    out.teamRules = TEAM_RULES_VERSION;
    save('campaign', out);
  }
  return out;
}

export function saveCampaign(c: Campaign): void {
  save('campaign', c);
}

export function chooseStarter(c: Campaign, id: string): Campaign {
  return addCatch({ ...c, starter: id }, id, false, 'pallet');
}

/** One more of a species: candy for its family, seen, and where it was first caught. */
export function addCatch(c: Campaign, id: string, shiny: boolean, where: string): Campaign {
  const fam = familyOf(id);
  return {
    ...c,
    caught: { ...c.caught, [id]: (c.caught[id] ?? 0) + 1 },
    shiny: shiny ? { ...c.shiny, [id]: (c.shiny[id] ?? 0) + 1 } : c.shiny,
    candy: { ...c.candy, [fam]: (c.candy[fam] ?? 0) + CANDY_PER_CATCH },
    seen: c.seen.includes(id) ? c.seen : [...c.seen, id],
    caughtAt: c.caughtAt[id] ? c.caughtAt : { ...c.caughtAt, [id]: where },
  };
}

export function markSeen(c: Campaign, ids: string[]): Campaign {
  const add = ids.filter((id) => !c.seen.includes(id));
  return add.length ? { ...c, seen: [...c.seen, ...add] } : c;
}

export interface Evolution {
  from: string;
  to: string;
  trigger: string;
  level: number | null;
  item: string | null;
  stage: number;
}
export const EVOLUTIONS = kanto.evolutions as Evolution[];

/** Candy evolutions open to a species (§B12). Trade evolutions happen after an online win instead (C3). */
export const evolutionsOf = (id: string) => EVOLUTIONS.filter((e) => e.from === id && e.trigger !== 'trade');
export const evolveCost = (e: Evolution) => (e.stage >= 2 ? CANDY_COST.second : CANDY_COST.first);

/** Evolves one owned Pokémon with candy: the new species joins the Pokédex and the old one stays caught. */
export function evolve(c: Campaign, e: Evolution): Campaign | null {
  const fam = familyOf(e.from);
  if (!c.caught[e.from] || (c.candy[fam] ?? 0) < evolveCost(e) || e.trigger === 'trade') return null;
  const paid = { ...c, candy: { ...c.candy, [fam]: (c.candy[fam] ?? 0) - evolveCost(e) - CANDY_PER_CATCH } };
  return addCatch(paid, e.to, false, 'evolution');
}

/** Sends a duplicate to Oak for one candy; a normal one goes before a shiny. Always keeps at least one. */
export function sendToOak(c: Campaign, id: string): Campaign | null {
  const have = c.caught[id] ?? 0;
  if (have < 2) return null;
  const shinies = c.shiny[id] ?? 0;
  const fam = familyOf(id);
  return {
    ...c,
    caught: { ...c.caught, [id]: have - 1 },
    shiny: have - 1 < shinies ? { ...c.shiny, [id]: shinies - 1 } : c.shiny,
    oak: { ...c.oak, [id]: (c.oak[id] ?? 0) + 1 },
    candy: { ...c.candy, [fam]: (c.candy[fam] ?? 0) + CANDY_PER_OAK },
  };
}

/** 0 to 3 stars from duplicates sent to Oak (3, 6, 10). */
export const starsOf = (c: Campaign, id: string) => STAR_STEPS.filter((n) => (c.oak[id] ?? 0) >= n).length;

/** Mew (§B12): awarded once 150 other species are caught. */
export function awardMew(c: Campaign): Campaign | null {
  const others = DEX.filter((s) => s !== 'mew' && c.caught[s]).length;
  return others >= 150 && !c.caught.mew ? addCatch(c, 'mew', false, 'award') : null;
}

/** Trade evolutions (§B12): after an online win, team members that evolve by trade do so (the old one stays). */
export function tradeEvolve(c: Campaign): { campaign: Campaign; evolved: [string, string][] } {
  let next = c;
  const evolved: [string, string][] = [];
  const team = new Set(Object.values(c.team).map((id) => (id ?? '').split(':')[0]!));
  for (const e of EVOLUTIONS) {
    if (e.trigger !== 'trade' || !team.has(e.from) || !c.caught[e.from]) continue;
    next = addCatch(next, e.to, false, 'trade');
    evolved.push([e.from, e.to]);
  }
  return { campaign: next, evolved };
}

/** Champion BLUE's level from the Trainer Level (§B2 row 12). */
export function championLevel(rating: number): 1 | 2 | 3 | 4 {
  return rating < 800 ? 1 : rating < 1100 ? 2 : rating < 1400 ? 3 : 4;
}

/** How each of the 151 is obtained (generated from PokéAPI plus the planned C3 sources). */
export const SOURCES = sources as Record<string, { kind: string; from?: string; where?: string[] }[]>;

/** Records a tall grass result on a route: the last MASTERY_WINDOW results and the first try streak. */
export function recordRoute(c: Campaign, routeId: string, result: 'solved' | 'assisted' | 'missed'): Campaign {
  const st = c.routes[routeId] ?? { last: [], streak: 0 };
  const next: RouteStats = {
    last: [...st.last, result !== 'missed'].slice(-MASTERY_WINDOW),
    streak: result === 'solved' ? st.streak + 1 : 0,
    shinyStreak: result === 'solved' ? (st.shinyStreak ?? 0) + 1 : 0,
  };
  return { ...c, routes: { ...c.routes, [routeId]: next } };
}

export function mastered(c: Campaign, routeId: string): boolean {
  return (c.routes[routeId]?.last.filter(Boolean).length ?? 0) >= MASTERY_NEED;
}

/** A route is open when its journey place is (§B11: clearing a place's trainers opens the next). */
export function unlocked(c: Campaign, index: number): boolean {
  const route = ROUTES[index];
  const at = PLACES.findIndex((p) => p.route === route?.id);
  return at >= 0 && c.starter !== null && placeUnlocked(c, at);
}

/** Throws a Poké Ball. A guaranteed rare catch spends the streak. */
export function throwBall(c: Campaign, routeId: string, slot: Slot, solve: Solve, rng: Rng, shiny = false): { campaign: Campaign; caught: boolean } {
  const st = c.routes[routeId] ?? { last: [], streak: 0 };
  const guaranteed = isRare(slot) && solve === 'first' && st.streak >= STREAK_FOR_RARE;
  const caught = guaranteed || rng.next() < catchChance(slot, solve, st.streak);
  let next = c;
  if (guaranteed) next = { ...next, routes: { ...next.routes, [routeId]: { ...st, streak: 0 } } };
  if (caught && shiny && (next.routes[routeId]?.shinyStreak ?? 0) >= SHINY_STREAK) next = { ...next, routes: { ...next.routes, [routeId]: { ...next.routes[routeId]!, shinyStreak: 0 } } };
  if (caught) next = addCatch(next, slot.species, shiny, routeId);
  return { campaign: next, caught };
}

/** Distinct species of a route, in table order. */
export const routeSpecies = (route: Route) => [...new Set([...route.encounters, ...route.blue].map((e) => e.species))];
/** Every species of the campaign: starters, then each route's new ones. */
export const allSpecies = () => [...new Set([...STARTERS, ...ROUTES.flatMap(routeSpecies)])];
/** The 151 Pokédex in number order. */
export const DEX = Object.entries(kanto.species as Record<string, { dex: number }>).sort((a, b) => a[1].dex - b[1].dex).map(([id]) => id);
