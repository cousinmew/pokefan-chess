// SPDX-License-Identifier: AGPL-3.0-only
// Battle sprite preload and the bounded wait before a battle starts. Loading fix, 14 Oct: one cache of decoded images
// for the board, the battles and the menus. The board warms what stands on it (warmBoard: cries, backs, fronts, in
// the loader's priority lane), the idle preload follows the cartridge and the save (preloadBattleSprites), the
// Journey's next panels get their cries ahead, in idle time (panelCries), and a battle slot never holds an image that
// has not decoded.
import roster from '../data/roster.gen1.json';
import trainers from '../data/trainers.json';
import { ASSET_BASE, BATTLE } from '../config';
import { defaultSpecies, SKIN_ROLES, species, spriteUrl, type Color, type Role, type Species, type SpeciesId, type TeamSkin } from '../board/pieces';
import { stageFor, stageSkin } from '../board/stages';
import { idleDrained, whenFree, whenIdle } from '../ui/loader';
import { boardCries, preloadCries } from '../audio/audio';
import { load } from '../store/persist';
import { loadCampaign, routeSpecies, STARTERS, type Campaign } from '../campaign/kanto';
import { journeyState, nextGoal, PLACES, placeUnlocked, RIVAL, routeOf, teamOf, type Place, type Trainer } from '../campaign/journey';
import { FIRST_CATCH } from '../campaign/warmup';
import { myTrainer, trainerSpriteId } from '../look';
import { trainerSrc } from '../ui/kanto';

export const STAND_IN_MS = 300; // a battle slot with no decoded sprite at spriteWaitMs waits this much longer for a still or the retro sprite
export const PLAN_RETRY_MS = 1000; // no cartridge yet (the shelf): the idle preload looks again this often
export const PLAN_GIVE_UP_MS = 600_000; // ...for at most this long after the splash
export const PANEL_CRIES_EVERY_MS = 1000; // a board drawn looks at the save for the Journey's next panel cries at most this often

interface Entry {
  img: HTMLImageElement;
  ok: Promise<boolean>;
  /** null while loading, then whether it decoded. */
  done: boolean | null;
}

/** Decoded images kept for the page's lifetime. The overlay shows these exact elements, so no refetch is needed, and
 * an <img> given the same URL is drawn in the frame it goes in. */
const cache = new Map<string, Entry>();
const waiting = new Map<string, ((src: string) => void)[]>();

function entry(url: string, priority: 'high' | 'low' | 'auto' = 'auto'): Entry {
  const known = cache.get(url);
  if (known) return known;
  const img = new Image();
  img.alt = '';
  img.fetchPriority = priority;
  img.src = url;
  const decode = () => img.decode().then(() => true, () => false);
  // An animated WebP the browser cannot show falls back to its GIF, on the same element.
  const ok = decode().then((good) => (good || !url.endsWith('.webp') ? good : ((img.src = url.replace(/\.webp$/, '.gif')), decode())));
  const made: Entry = { img, ok, done: null };
  cache.set(url, made);
  void ok.then((good) => {
    made.done = good;
    const then = waiting.get(url) ?? [];
    waiting.delete(url);
    if (good) for (const fn of then) fn(img.src);
  });
  return made;
}

/** The still frame a board piece shows until its animated sprite has decoded (about 0.8 KB). */
export const stillUrl = (dex: number, shiny = false): string => `${ASSET_BASE}static/${shiny ? 'shiny' : 'front'}/${dex}.png`;

/** The URL to show for `url` now, if it has decoded (its GIF when the WebP failed); else null. */
export function decodedSrc(url: string): string | null {
  const e = cache.get(url);
  return e?.done ? e.img.src : null;
}

/** Starts loading `url` at once (a still on screen, a trainer for the next battle); resolves true once decoded. */
export function decodeImage(url: string, priority: 'high' | 'low' | 'auto' = 'high'): Promise<boolean> {
  return entry(url, priority).ok;
}

/** Calls `then` with the URL to show once `url` has decoded, whoever loads it (the board's lane, a battle). */
export function onDecoded(url: string, then: (src: string) => void): void {
  const e = cache.get(url);
  if (e) {
    void e.ok.then((good) => good && then(e.img.src));
    return;
  }
  const list = waiting.get(url);
  if (list) list.push(then);
  else waiting.set(url, [then]);
}

/** A piece on the board, by colour and role, with its species (My Team, the story stage and shiny included). */
export interface OnBoard {
  color: Color;
  role: Role;
  sp: Species;
}

/** Capture order: pawns and knights take first, the king last. */
const ROLE_ORDER: Role[] = ['p', 'n', 'b', 'q', 'r', 'k'];
let boardSig = '';

/** The board was drawn with a new set of species: what its moves will need next goes in the loader's priority lane,
 * after the board's own images. `mine` stands near in battles (in Two Players the side that moved, so the other
 * colour's backs come last): its select cries, its backs, every front (the board's animated pieces), then the other
 * colour's cries and backs. The Journey's panel cries come after all that, in idle time (review, 14 Oct: queued in
 * the same lane, about 30 of them on a late save held a board's select cries and backs back for seconds). */
export function warmBoard(mons: OnBoard[], mine: Color | null): void {
  const sig = mons.map((m) => `${m.color}${m.sp.dex}${m.sp.shiny ? 's' : ''}`).sort().join();
  if (sig !== boardSig) {
    boardSig = sig;
    warm(mons, mine);
  }
  // Then the Journey's next panel cries, in idle time: they never go before what this board's moves need.
  panelCries();
}

function warm(mons: OnBoard[], mine: Color | null): void {
  const near: Color = mine ?? 'w';
  const side = (c: Color) => {
    const list: Species[] = [];
    for (const role of ROLE_ORDER) for (const m of mons) if (m.color === c && m.role === role && !list.some((s) => s.dex === m.sp.dex && !!s.shiny === !!m.sp.shiny)) list.push(m.sp);
    return list;
  };
  const mineList = side(near);
  const theirs = side(near === 'w' ? 'b' : 'w');
  const queue = (urls: string[]) => urls.forEach((u) => whenFree(() => entry(u).ok));
  boardCries(mineList.map((s) => s.dex));
  queue(mineList.map((s) => spriteUrl(s.dex, 'back', s.shiny)));
  queue([...new Set([...mineList, ...theirs].map((s) => spriteUrl(s.dex, 'front', s.shiny)))]);
  boardCries(theirs.map((s) => s.dex));
  queue(theirs.map((s) => spriteUrl(s.dex, 'back', s.shiny)));
}

let panelAt = -Infinity;
/** The cries the Journey's next panels play (src/audio/audio.ts lets a panel's cry come late, within limits, but a
 * file not asked for ahead takes a round trip, so on a phone network it was never heard). Only fetched (a few KB
 * each) in idle time, ahead of the other idle work, and decoded when first heard. From the plan, and as boards are
 * drawn (at most every PANEL_CRIES_EVERY_MS), so a route entered since is covered while its tall grass puzzle is
 * solved. */
function panelCries(c?: Campaign): void {
  const at = performance.now();
  if (!c && at - panelAt < PANEL_CRIES_EVERY_MS) return;
  panelAt = at;
  if (!c && load<string>('cartridge') !== 'blue') return;
  preloadCries(ids(panelSpecies(c ?? loadCampaign())).map((s) => s.dex), true);
}

/** The species whose cries the Journey's next panels play, the nearest first: the starters while the save has none,
 * the wild Pokémon of the next goal's route, the gifts and gift choices still to come at the places open now (each
 * gift shows a card with its cry; '@starter-other' and '@starter-rival' resolved as journeyGame.ts reward() does),
 * then the wild Pokémon of every route walked, the latest first. */
export function panelSpecies(c: Campaign): string[] {
  const state = journeyState(c);
  const counter = RIVAL.counter[c.starter ?? ''] ?? 'squirtle';
  const gift = (g: string) => (g === '@starter-other' ? (STARTERS.find((s) => s !== c.starter && s !== counter) ?? 'bulbasaur') : g === '@starter-rival' ? counter : g);
  const wild = (p: Place | undefined) => {
    const route = p && routeOf(p);
    return route ? routeSpecies(route) : [];
  };
  const names: string[] = c.starter ? [] : [...STARTERS];
  names.push(...wild(nextGoal(state)?.place));
  PLACES.forEach((p, i) => {
    if (p.reward && !c.rewards.includes(p.id) && placeUnlocked(state, i)) names.push(...(p.reward.gift ?? []).map(gift), ...(p.reward.choice ?? []));
  });
  for (const id of [...c.journey.visited].reverse()) names.push(...wild(PLACES.find((p) => p.id === id)));
  return [...new Set(names)];
}

const PEOPLE = trainers.people as Record<string, string>;
const CLASSES = trainers.classes as Record<string, string>;
/** A Journey trainer's sprite id, as the route rows and the intro card show it (journeyGame.ts). */
const goalSprite = (t: Trainer): string | null => (t.sprite === '-' ? null : t.sprite ? (t.sprite === 'red' ? trainerSpriteId(myTrainer()) : (PEOPLE[t.sprite] ?? null)) : (CLASSES[t.class] ?? null));

/** Every species of a team: the skin's, else the default team's for that role. */
function teamIds(color: Color, skin: TeamSkin): SpeciesId[] {
  return SKIN_ROLES.map((key) => skin[key] ?? defaultSpecies(color, key === 'bLight' || key === 'bDark' ? 'b' : key, key === 'bDark'));
}
const asSpecies = (id: SpeciesId): Species | null => {
  try {
    return species(id);
  } catch (err) {
    console.warn('preload: unknown species', id, err instanceof Error ? err.message : err);
    return null;
  }
};
const ids = (list: (string | null | undefined)[]) => list.filter((x): x is string => !!x).map(asSpecies).filter((s): s is Species => !!s);

/** What this player sees next, in idle time after the menus (load fix), by cartridge and save (loading fix, 14 Oct):
 * no cartridge yet (the shelf, a guest), only the default teams' stills (it looks again until one is chosen);
 * YELLOW, its own boards' fronts (stage 2 teams, YELLOW's My Team), no backs; BLUE, the player's trainer, the
 * warm-up's first catch and its cry, the Journey's next panel cries, the next goal's trainer and team, the boards'
 * stills, My Team's and the story stage's fronts with your backs; the default teams' sprites come last. A battle that
 * starts first loads its own two sprites straight away. */
export function preloadBattleSprites(): void {
  plan(0);
}

function plan(tries: number): void {
  const cart = load<string>('cartridge');
  if (cart !== 'yellow' && cart !== 'blue') {
    // The shelf or a guest (PLAY CHESS): the default teams' stills (about 11 KB), so a first board is drawn sooner.
    if (!tries) for (const s of ids([...teamIds('w', {}), ...teamIds('b', {})])) whenFree(() => entry(stillUrl(s.dex, s.shiny), 'high').ok);
    if ((tries + 1) * PLAN_RETRY_MS <= PLAN_GIVE_UP_MS) window.setTimeout(() => plan(tries + 1), PLAN_RETRY_MS);
    return;
  }
  const c = loadCampaign();
  const urls: string[] = [];
  const add = (...u: (string | null | undefined)[]) => u.forEach((x) => x && !urls.includes(x) && urls.push(x));
  const front = (s: Species) => spriteUrl(s.dex, 'front', s.shiny);
  const back = (s: Species) => spriteUrl(s.dex, 'back', s.shiny);
  const still = (s: Species) => stillUrl(s.dex, s.shiny);
  if (cart === 'yellow') {
    // YELLOW (§B17): the final forms, YELLOW's own team on Red's side (its king is always PIKACHU); all in idle time,
    // after the home's images.
    const { k: _king, ...team } = c.team;
    void _king;
    const mine = ids([...teamIds('w', {}), ...teamIds('w', team)]);
    const theirs = ids(teamIds('b', {}));
    add(...mine.map(still), ...theirs.map(still), ...mine.map(front), ...theirs.map(front));
  } else {
    // Your side: the story stage's Red team, alone (Two Players) and with My Team and your starter (vs Computer, a
    // puzzle's king); theirs: the stage's Rocket. Their stills and the plates' trainers go in the priority lane
    // (tiny, so the next board is drawn the moment it shows), the rest in idle time.
    const stage = stageFor(c.badges.length);
    const mine = ids([...teamIds('w', stageSkin('w', stage)), ...Object.values(c.team), c.starter]);
    const theirs = ids(teamIds('b', stageSkin('b', stage)));
    const first = [trainerSrc(trainerSpriteId(myTrainer())), trainerSrc('blue-gen1'), ...new Set([...mine, ...theirs].map(still))];
    for (const u of first) whenFree(() => entry(u, 'high').ok);
    panelCries(c);
    blue(c, mine, theirs, add, { front, back });
  }
  for (const u of urls) whenIdle(() => entry(u).ok);
}

function blue(c: Campaign, mine: Species[], theirs: Species[], add: (...u: (string | null | undefined)[]) => void, f: Record<'front' | 'back', (s: Species) => string>): void {
  if (!c.warmup) {
    const first = asSpecies(FIRST_CATCH);
    if (first) {
      add(f.front(first));
      preloadCries([first.dex]);
    }
  }
  const goal = nextGoal(journeyState(c));
  if (goal?.trainer) {
    const sprite = goalSprite(goal.trainer);
    add(sprite ? trainerSrc(sprite) : null, ...ids(teamOf(c, goal.trainer)).map(f.front));
  }
  add(...mine.map(f.front), ...theirs.map(f.front), ...mine.map(f.back));
  // The default teams last (Two Players without saves, vs Computer as a guest).
  for (const s of Object.values(roster.species)) add(spriteUrl(s.dex, 'front'), spriteUrl(s.dex, 'back'));
}

/** Resolves when every preload started so far has settled; true when every Pokémon sprite decoded. */
export async function preloadSettled(): Promise<boolean> {
  await idleDrained();
  return (await Promise.all([...cache].filter(([u]) => /\/(shiny\/)?(front|back)\//.test(u)).map(([, e]) => e.ok))).every(Boolean);
}

export interface BattleSprites {
  near: HTMLImageElement;
  far: HTMLImageElement;
  mirrorNear: boolean;
}

/** Settles when `ready()` holds (checked as each entry settles) or after `ms`. */
function until(entries: Entry[], ready: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ready()) return resolve();
    const t = window.setTimeout(resolve, ms);
    for (const e of entries) void e.ok.then(() => ready() && (window.clearTimeout(t), resolve()));
  });
}

/** Waits up to BATTLE.spriteWaitMs for the player's Pokémon from behind (near) and the opponent's front (far), and for
 * `people` (the trainers' sprites, so the overlay draws them on its first frame). A slot only ever gets an image
 * that has decoded: near, the back, else the front mirrored; far, the front; failing those, the still the board
 * shows or the retro sprite (a front view, so mirrored near), up to STAND_IN_MS more. */
export async function prepareSprites(nearId: SpeciesId, farId: SpeciesId, people: string[] = []): Promise<BattleSprites> {
  const ns = species(nearId);
  const fs = species(farId);
  const back = entry(spriteUrl(ns.dex, 'back', ns.shiny), 'high');
  const front = entry(spriteUrl(ns.dex, 'front', ns.shiny), 'high');
  const far = entry(spriteUrl(fs.dex, 'front', fs.shiny), 'high');
  const extra = people.map((u) => entry(u, 'high'));
  // Ready: the far front and the near back settled (the near front too when the back failed), and the trainers.
  const ready = () => far.done !== null && back.done !== null && (back.done || front.done !== null) && extra.every((e) => e.done !== null);
  await until([back, front, far, ...extra], ready, BATTLE.spriteWaitMs);
  let near = back.done ? back.img : front.done ? front.img : null;
  let mirrorNear = !back.done && !!front.done;
  let farImg = far.done ? far.img : null;
  if (!near || !farImg) {
    const standIns = (s: Species) => [entry(stillUrl(s.dex, s.shiny), 'high'), entry(spriteUrl(s.dex, 'retro'), 'high')];
    const nearIns = near ? [] : standIns(ns);
    const farIns = farImg ? [] : standIns(fs);
    const any = (list: Entry[]) => !list.length || list.some((e) => e.done) || list.every((e) => e.done !== null);
    await until([...nearIns, ...farIns], () => any(nearIns) && any(farIns), STAND_IN_MS);
    const pick = (list: Entry[]) => (list.find((e) => e.done) ?? list[1]!).img;
    if (!near) {
      near = pick(nearIns);
      mirrorNear = true;
    }
    farImg ??= pick(farIns);
  }
  // The same front on both sides (a twin whose back is not in): one element cannot stand in two slots.
  if (near === farImg) near = near.cloneNode() as HTMLImageElement;
  return { near, far: farImg, mirrorNear };
}
