// SPDX-License-Identifier: AGPL-3.0-only
// The story layer (§B11): places, trainers and the rival from src/data/journey.kanto.json, so a later region is a
// data file. Pure logic over the saved campaign; the screens live in src/ui/journey.ts.
import journey from '../data/journey.kanto.json';
import kanto from '../data/kanto.json';
import type { StringKey } from '../game/text';
import type { Campaign } from './kanto';

export interface Trainer {
  id: string;
  class: StringKey;
  name: StringKey;
  team: string[];
  defeat: StringKey;
  puzzles: number;
  need: number;
  themes?: 'route' | 'learned';
}
export interface Place {
  id: string;
  kind: 'town' | 'route' | 'rival' | 'gym';
  name?: StringKey;
  route?: string;
  story?: StringKey[];
  trainers?: Trainer[];
  /** Gym leader sprite id (C3 gyms; a placeholder card until then). */
  leader?: string;
}

export const PLACES = journey.places as Place[];
export const RIVAL = journey.rival as { class: StringKey; name: StringKey; counter: Record<string, string> };
const routeById = new Map(kanto.routes.map((r) => [r.id, r]));

export const placeIndex = (id: string) => PLACES.findIndex((p) => p.id === id);
export const routeOf = (p: Place) => (p.route ? routeById.get(p.route) : undefined);

/** A place is done when its story was read (towns) or all its trainers are beaten. Gyms wait for C3 and never block. */
export function placeCleared(c: Campaign, p: Place): boolean {
  if (p.kind === 'gym') return true;
  if (p.id === 'pallet') return c.starter !== null;
  return c.journey.cleared.includes(p.id);
}

export function placeUnlocked(c: Campaign, index: number): boolean {
  if (index <= 0) return true;
  return PLACES.slice(0, index).every((p) => placeCleared(c, p));
}

/** The furthest place the player can stand on: where the map opens. */
export function furthest(c: Campaign): number {
  let i = 0;
  while (i + 1 < PLACES.length && placeUnlocked(c, i + 1)) i++;
  return i;
}

export function nextTrainer(c: Campaign, p: Place): Trainer | null {
  return p.trainers?.find((t) => !c.journey.beaten.includes(t.id)) ?? null;
}

/** Themes for a trainer: the route's own, or (rival) every theme learned on the routes before. */
export function themesFor(p: Place, t: Trainer): string[] {
  if (t.themes === 'learned') {
    const before = PLACES.slice(0, placeIndex(p.id)).flatMap((x) => routeOf(x)?.themes ?? []);
    return [...new Set(before.length ? before : ['mateIn1'])];
  }
  return routeOf(p)?.themes ?? ['mixed'];
}

/** The trainer's team as species ids; "@counter" is the rival's starter, strong against yours. */
export function teamOf(c: Campaign, t: Trainer): string[] {
  return t.team.map((s) => (s === '@counter' ? (RIVAL.counter[c.starter ?? 'bulbasaur'] ?? 'squirtle') : s));
}

export function beatTrainer(c: Campaign, p: Place, t: Trainer): Campaign {
  const beaten = c.journey.beaten.includes(t.id) ? c.journey.beaten : [...c.journey.beaten, t.id];
  const done = (p.trainers ?? []).every((x) => beaten.includes(x.id));
  const cleared = done && !c.journey.cleared.includes(p.id) ? [...c.journey.cleared, p.id] : c.journey.cleared;
  return { ...c, journey: { ...c.journey, beaten, cleared } };
}

export function clearPlace(c: Campaign, p: Place): Campaign {
  return c.journey.cleared.includes(p.id) ? c : { ...c, journey: { ...c.journey, cleared: [...c.journey.cleared, p.id] } };
}

export function visit(c: Campaign, p: Place): Campaign {
  return c.journey.visited.includes(p.id) ? c : { ...c, journey: { ...c.journey, visited: [...c.journey.visited, p.id] } };
}

/** Training (§B11): the themes of every route visited so far. */
export function trainingThemes(c: Campaign): string[] {
  return [...new Set(PLACES.filter((p) => c.journey.visited.includes(p.id)).flatMap((p) => routeOf(p)?.themes ?? []))];
}
