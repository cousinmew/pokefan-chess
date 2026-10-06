// SPDX-License-Identifier: AGPL-3.0-only
// Kanto campaign rules (§B3, §B4): real Red tall grass slots, catch odds earned by how you solved,
// route mastery, and saved progress. Pure logic: the screens live in src/ui/kanto.ts.
import kanto from '../data/kanto.json';
import { CATCH, MASTERY_NEED, MASTERY_WINDOW, RARE_SLOT_BELOW, STREAK_FOR_RARE } from '../config';
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
}
export interface Slot {
  species: string;
  chance: number;
}

export const ROUTES = kanto.routes as Route[];
export const STARTERS = kanto.starters;

/** The route's slots in PokéAPI order, one entry per slot with its own chance (percent). */
export function slotsOf(route: Route): Slot[] {
  return route.encounters.flatMap((e) => e.slots.map((chance) => ({ species: e.species, chance })));
}

/** Which slot (index into slotsOf) the tall grass picks: a roll over the slot chances, as in Red. */
export function rollSlotIndex(route: Route, rng: Rng): number {
  const slots = slotsOf(route);
  const total = slots.reduce((n, s) => n + s.chance, 0);
  let r = rng.next() * total;
  for (let i = 0; i < slots.length; i++) {
    r -= slots[i]!.chance;
    if (r < 0) return i;
  }
  return slots.length - 1;
}

export const rollSlot = (route: Route, rng: Rng): Slot => slotsOf(route)[rollSlotIndex(route, rng)]!;

export const isRare = (slot: Slot) => slot.chance < RARE_SLOT_BELOW;

export type Solve = 'first' | 'hint';

export function catchChance(slot: Slot, solve: Solve, streak: number): number {
  if (isRare(slot) && solve === 'first' && streak >= STREAK_FOR_RARE) return 1;
  return CATCH[solve][isRare(slot) ? 'rare' : 'common'];
}

export interface RouteStats {
  last: boolean[];
  streak: number;
}
export interface Campaign {
  starter: string | null;
  caught: Record<string, number>;
  routes: Record<string, RouteStats>;
  team: TeamSkin;
}

const fresh = (): Campaign => ({ starter: null, caught: {}, routes: {}, team: {} });

export function loadCampaign(): Campaign {
  const c = load<Partial<Campaign>>('campaign');
  return { ...fresh(), ...c, caught: { ...c?.caught }, routes: { ...c?.routes }, team: { ...c?.team } };
}

export function saveCampaign(c: Campaign): void {
  save('campaign', c);
}

export function chooseStarter(c: Campaign, id: string): Campaign {
  return { ...c, starter: id, caught: { ...c.caught, [id]: (c.caught[id] ?? 0) + 1 } };
}

/** Records a tall grass result on a route: the last MASTERY_WINDOW results and the first try streak. */
export function recordRoute(c: Campaign, routeId: string, result: 'solved' | 'assisted' | 'missed'): Campaign {
  const st = c.routes[routeId] ?? { last: [], streak: 0 };
  const next: RouteStats = { last: [...st.last, result !== 'missed'].slice(-MASTERY_WINDOW), streak: result === 'solved' ? st.streak + 1 : 0 };
  return { ...c, routes: { ...c.routes, [routeId]: next } };
}

export function mastered(c: Campaign, routeId: string): boolean {
  return (c.routes[routeId]?.last.filter(Boolean).length ?? 0) >= MASTERY_NEED;
}

/** Route 1 opens once you have a starter; each later route after mastering the one before. */
export function unlocked(c: Campaign, index: number): boolean {
  if (index === 0) return c.starter !== null;
  const prev = ROUTES[index - 1];
  return !!prev && mastered(c, prev.id);
}

/** Throws a Poké Ball. A guaranteed rare catch spends the streak. */
export function throwBall(c: Campaign, routeId: string, slot: Slot, solve: Solve, rng: Rng): { campaign: Campaign; caught: boolean } {
  const st = c.routes[routeId] ?? { last: [], streak: 0 };
  const guaranteed = isRare(slot) && solve === 'first' && st.streak >= STREAK_FOR_RARE;
  const caught = guaranteed || rng.next() < catchChance(slot, solve, st.streak);
  let next = c;
  if (guaranteed) next = { ...next, routes: { ...next.routes, [routeId]: { ...st, streak: 0 } } };
  if (caught) next = { ...next, caught: { ...next.caught, [slot.species]: (next.caught[slot.species] ?? 0) + 1 } };
  return { campaign: next, caught };
}

/** Distinct species of a route, in table order. */
export const routeSpecies = (route: Route) => [...new Set(route.encounters.map((e) => e.species))];
/** Every species of the campaign: starters, then each route's new ones. */
export const allSpecies = () => [...new Set([...STARTERS, ...ROUTES.flatMap(routeSpecies)])];
