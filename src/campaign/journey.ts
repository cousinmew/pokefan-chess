// SPDX-License-Identifier: AGPL-3.0-only
// The story layer (§B11): places, trainers and the rival from src/data/journey.kanto.json, so a later region is a
// data file. Pure logic over the saved campaign; the screens live in src/ui/journey.ts.
import journey from '../data/journey.kanto.json';
import kanto from '../data/kanto.json';
import { fmt, type StringKey } from '../game/text';
import type { Campaign } from './kanto';

/** What the journey rules read from a save: enough for a summary of a save that is not loaded (the start menu). */
export type JourneyState = Pick<Campaign, 'starter' | 'badges' | 'champion' | 'journey'>;

export interface Trainer {
  id: string;
  class: StringKey;
  name: StringKey;
  team: string[];
  defeat: StringKey;
  puzzles: number;
  need: number;
  themes?: 'route' | 'learned';
  /** Fixed puzzle themes (gyms, Elite Four, challenges); "mixed" means every theme. */
  topics?: string[];
  /** A person's sprite (leaders, Elite Four), or "-" for none (a wild legendary). */
  sprite?: string;
  /** Puzzles this much above your Trainer Level (rising ratings, §B2). */
  boost?: number;
  /** Lesson strings key for the goal card, when it is not a single theme. */
  lesson?: string;
  /** The first trainers (W5, design G): mate in 1 positions with the fewest pieces. */
  easy?: boolean;
}
export interface Drill {
  id: string;
  title: StringKey;
  goal: StringKey;
  fen: string;
  limit: number;
}
export interface Place {
  id: string;
  kind: 'town' | 'route' | 'rival' | 'gym' | 'challenge' | 'drill' | 'league' | 'champion';
  name?: StringKey;
  route?: string;
  story?: StringKey[];
  trainers?: Trainer[];
  /** Gym leader sprite id. */
  leader?: string;
  /** Gym badge id, earned by beating the leader (C3). */
  badge?: string;
  /** Side places (fossils, prize, legendaries) never block the journey. */
  optional?: boolean;
  /** Before CERULEAN GYM (playtest, 23 Oct): one move puzzles where the theme has them, and authored castling. */
  oneMove?: boolean;
  /** Pokémon given once, when the place is first cleared (§B12 part 2); "@starter-…" are resolved in code. */
  reward?: { gift?: string[]; choice?: string[] };
  drills?: Drill[];
  /** A town's one line about what is there (W5), shown on its card after the story. */
  here?: StringKey;
}

export const PLACES = journey.places as Place[];
export const RIVAL = journey.rival as { class: StringKey; name: StringKey; counter: Record<string, string> };
const routeById = new Map(kanto.routes.map((r) => [r.id, r]));

export const placeIndex = (id: string) => PLACES.findIndex((p) => p.id === id);
export const routeOf = (p: Place) => (p.route ? routeById.get(p.route) : undefined);
export const placeName = (p: Place) => routeOf(p)?.name ?? (p.name ? fmt(p.name) : p.id);
/** Oak's warm-up runs the first time a save enters this place (W5). */
export const WARMUP_PLACE = 'route-1';

/** A place is done when its story was read (towns), all its trainers are beaten, its badge is won (gyms, C3)
 * or the Champion is beaten. */
export function placeCleared(c: JourneyState, p: Place): boolean {
  if (p.id === 'pallet') return c.starter !== null;
  if (p.kind === 'gym') return !!p.badge && c.badges.includes(p.badge);
  if (p.kind === 'champion') return c.champion;
  return c.journey.cleared.includes(p.id);
}

/** Open when every earlier place that is not optional is cleared. A place already cleared stays open, so gyms that
 * started blocking in C3 never take back progress made before. */
export function placeUnlocked(c: JourneyState, index: number): boolean {
  if (index <= 0) return true;
  const p = PLACES[index];
  if (p && p.kind !== 'gym' && p.kind !== 'champion' && c.journey.cleared.includes(p.id)) return true;
  return PLACES.slice(0, index).every((x) => x.optional || placeCleared(c, x));
}

/** The furthest required place the player can stand on: where the map opens. */
export function furthest(c: JourneyState): number {
  let at = 0;
  PLACES.forEach((p, i) => {
    if (!p.optional && placeUnlocked(c, i)) at = i;
  });
  return at;
}

export function nextTrainer(c: JourneyState, p: Place): Trainer | null {
  return p.trainers?.find((t) => !c.journey.beaten.includes(t.id)) ?? null;
}

export const trainerName = (t: Trainer) => `${fmt(t.class)} ${fmt(t.name)}`;

export interface Goal {
  index: number;
  place: Place;
  /** The trainer to battle there next (a gym's leader, the rival); null for towns, drills and the Champion. */
  trainer: Trainer | null;
  /** "YOUNGSTER TOBY at ROUTE 1", "Battle RIVAL BLUE", "Go to VIRIDIAN CITY". */
  text: string;
}

/** The next goal (W5, design H): the furthest unlocked, uncleared required place and its next trainer. Null once the
 * journey is done. */
export function nextGoal(c: JourneyState): Goal | null {
  let index = -1;
  PLACES.forEach((p, i) => {
    if (!p.optional && !placeCleared(c, p) && placeUnlocked(c, i)) index = i;
  });
  const place = PLACES[index];
  if (!place) return null;
  const trainer = place.trainers?.length ? (nextTrainer(c, place) ?? place.trainers[0]!) : null;
  // With the trainer named, the place without its ": BROCK" or ": ELITE FOUR" (fix, 14 Oct: "LEADER BROCK at PEWTER
  // GYM: BROCK" took two lines on a phone). The French " : " and the full-width colon of Japanese and Chinese too.
  const vars = { place: trainer ? placeName(place).replace(/\s*[:：].*$/u, '') : placeName(place), trainer: trainer ? trainerName(trainer) : '' };
  const key: StringKey = !trainer ? 'goal.go' : place.kind === 'rival' ? 'goal.battle' : 'goal.at';
  return { index, place, trainer, text: fmt(key, vars) };
}

/** "Next: YOUNGSTER TOBY on ROUTE 1" for the hub, the start menu, START and the win story; null without a goal. */
export function goalLine(c: JourneyState): string | null {
  const g = c.starter ? nextGoal(c) : null;
  return g ? fmt('goal.next', { goal: g.text }) : null;
}

/** A save as stored, possibly partial (the start menu reads saves that are not loaded). */
export const journeyState = (c: Partial<Campaign> | null | undefined): JourneyState => ({
  starter: c?.starter ?? null,
  badges: c?.badges ?? [],
  champion: !!c?.champion,
  journey: { cleared: c?.journey?.cleared ?? [], beaten: c?.journey?.beaten ?? [], visited: c?.journey?.visited ?? [] },
});

/** How far the journey is, in percent of its required places cleared (the map's progress bar). */
export function progress(c: JourneyState): number {
  const req = PLACES.filter((p) => !p.optional);
  return Math.round((100 * req.filter((p) => placeCleared(c, p)).length) / req.length);
}

/** What opens a locked place (W5, ux #8): the goal standing in the way, said plainly ("Beat the trainers on ROUTE 1"). */
export function unlockText(c: JourneyState): string {
  const g = nextGoal(c);
  if (!g) return '';
  const k = g.place.kind;
  const key: StringKey = k === 'route' ? 'map.unlock.route' : k === 'town' ? 'map.unlock.town' : k === 'gym' ? 'map.unlock.gym' : 'map.unlock.win';
  return fmt(key, { place: placeName(g.place) });
}

/** Themes for a trainer: its fixed topics, the route's own, or (rival) every theme learned on the routes before. */
export function themesFor(p: Place, t: Trainer): string[] {
  if (t.topics) return t.topics;
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
