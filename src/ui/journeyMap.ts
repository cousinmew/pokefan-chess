// SPDX-License-Identifier: AGPL-3.0-only
// The journey map and a route's screen (W5, design I): what you won, where you are, what is next. Cleared places are
// compact with a CLEARED stamp, the current one is a card with ▶ and a button straight into the next battle, and only
// the next locked place shows (as ???), with what opens it. Also the small cards between battles: a trainer beaten, a
// place cleared and what it opened, a town, Oak's warm-up and the first catch.
import { SPECIES } from '../board/pieces';
import { DEX, routeSpecies, type Campaign, type Route } from '../campaign/kanto';
import { nextGoal, nextTrainer, PLACES, placeCleared, placeName, placeUnlocked, progress, routeOf, trainerName, unlockText, type Goal, type Place, type Trainer } from '../campaign/journey';
import { fmt, type StringKey, type Vars } from '../game/text';
import { AREA_IN_MS, MAP_STAMP_DELAY_MS, STAMP_PAUSE_MS } from '../config';
import { warmEngine } from '../ai/engine';
import trainers from '../data/trainers.json';
import { button, el, screen } from './dom';
import { mon, trainerSprite, trainerSrc } from './kanto';
import { preloadNow } from './loader';

export const BADGE_SHOW_MS = 1200; // a gym just won: the strip with the new badge pulsing shows this long before the map scrolls to the gym's row
export const MAP_SCROLL_MS = 450; // that scroll's time, before the row's CLEARED stamp slams

const BADGES = ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'];
const PEOPLE = trainers.people as Record<string, string>;
const CLASSES = trainers.classes as Record<string, string>;
/** A trainer's sprite file, as journeyGame's spriteOf picks it ("-": none). */
const spriteFile = (t: Trainer): string | null => (t.sprite === '-' ? null : ((t.sprite ? PEOPLE[t.sprite] : CLASSES[t.class]) ?? null));
const warmed = new Set<string>();

/** A place is about to be played (fix, 14 Oct): its trainers' sprites load while the map is read (Route 1's rows
 * showed silhouettes for up to half a second on Slow 4G), and a place with battles starts the engine's first load
 * (route trainers, gyms, the rival, the Elite Four, legendaries, drills, the Champion), so it is in for the first
 * miss review or the first reply of a game. */
function warmFor(p: Place, engine = false): void {
  const urls = (p.trainers ?? []).map(spriteFile).filter((s): s is string => !!s && !warmed.has(s));
  urls.forEach((s) => warmed.add(s));
  if (urls.length) preloadNow(urls.map(trainerSrc));
  if (engine && (p.trainers?.length || p.drills?.length || p.kind === 'champion')) warmEngine();
}

function line(key: StringKey, vars?: Vars, cls = ''): HTMLElement {
  const p = el('p', cls);
  p.textContent = fmt(key, vars);
  return p;
}

function text(tag: 'b' | 'p' | 'span', value: string, cls = ''): HTMLElement {
  const e = el(tag, cls);
  e.textContent = value;
  return e;
}

const stamp = () => el('span', 'stamp', 'map.cleared');
const testidOf = (p: Place) => (p.route ? `route-${p.route}` : `place-${p.id}`);

/** The 8 badge slots, won ones in their colour (the hub and the Trainer Card draw the same dots). */
export function badgeRow(won: string[]): HTMLElement {
  const row = el('div', 'badges');
  row.dataset.testid = 'map-badges';
  for (const b of BADGES) {
    const dot = el('span', `badge ${won.includes(b) ? `won ${b}` : 'empty'}`);
    dot.title = won.includes(b) ? fmt(`badge.${b}` as StringKey) : '';
    row.append(dot);
  }
  return row;
}

/** The top strip: badges, Pokédex and how far the journey is. */
function strip(c: Campaign): HTMLElement {
  const box = el('div', 'map-strip');
  box.dataset.testid = 'map-strip';
  const pct = progress(c);
  const bar = el('div', 'journey-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-valuenow', String(pct));
  const fill = el('span');
  fill.style.width = `${pct}%`;
  bar.append(fill);
  const label = line('map.progress', { n: String(pct) }, 'small');
  label.dataset.testid = 'map-progress';
  const caught = DEX.filter((s) => c.caught[s]).length;
  box.append(badgeRow(c.badges), line('map.pokedex', { caught: String(caught), total: '151' }, 'small'), label, bar);
  return box;
}

/** A route's catch count, or a gym's badge (shown on open places). */
function details(c: Campaign, p: Place): HTMLElement[] {
  if (p.kind === 'gym' && p.badge) return [text('p', fmt(`badge.${p.badge}` as StringKey), 'small badge-line')];
  if (!p.route || p.optional) return [];
  const sp = routeSpecies(routeOf(p) as Route);
  return [line('route.dex', { caught: String(sp.filter((s) => c.caught[s]).length), total: String(sp.length) }, 'small')];
}

export interface MapActions {
  place(index: number): void;
  /** The ▶ button: straight into the next goal's battle. */
  next(): void;
  dex(): void;
  team(): void;
  card(): void;
  training(): void;
  back(): void;
  hof?(): void;
  /** The CLEARED stamp lands (the map sting plays with it, pacing §5). */
  stamped?(): void;
}

/** The current place: a big card with ▶, its details and the one primary button of the map. */
function currentCard(c: Campaign, p: Place, i: number, goal: Goal, a: MapActions): HTMLElement {
  const card = el('div', `node ${p.kind} current`);
  card.dataset.testid = 'map-current';
  card.dataset.kind = p.kind;
  const name = el('button', 'node-name');
  name.dataset.testid = testidOf(p);
  name.append(text('span', '▶', 'pointer'), text('b', placeName(p)));
  name.onclick = () => (warmFor(p, true), a.place(i));
  const go = el('button', 'primary map-next');
  go.dataset.testid = 'map-next';
  go.textContent = `▶ ${goal.text}`;
  go.onclick = () => (warmFor(goal.place, true), a.next());
  card.append(name, ...details(c, p), go);
  return card;
}

/** `justCleared`: a place cleared a moment ago (W5, pacing §5). The map opens with its row in view, its stamp hidden, and
 * stays live; once the reveal is over the CLEARED stamp slams and the row flashes, and STAMP_PAUSE_MS later the map
 * scrolls to ▶ only when it is off screen, and ▶ pulses twice. A gym (fix, 14 Oct) first shows the strip with its new
 * badge pulsing for BADGE_SHOW_MS (it was a 12 px dot on the row, the strip above the fold), then scrolls to the row
 * for the stamp. Under reduced motion the stamp fades in (from hidden too) and nothing flashes or pulses. */
export function mapScreen(c: Campaign, a: MapActions, justCleared?: string, calm = false): HTMLElement {
  const goal = nextGoal(c);
  const list = el('div', 'kanto-map');
  let locked = 0;
  let optional = false;
  let current: HTMLElement | null = null;
  let stamped: HTMLElement | null = null;
  PLACES.forEach((p, i) => {
    if (!placeUnlocked(c, i)) {
      // Only the next locked place shows, as ???, with what opens it; the rest fold into one line.
      if (locked++) return;
      const b = el('button', 'node locked');
      b.dataset.testid = testidOf(p);
      b.disabled = true;
      b.append(text('b', fmt('map.unknown')), text('p', unlockText(c), 'small unlock'));
      return list.append(b);
    }
    optional ||= !!p.optional;
    if (goal && i === goal.index) return list.append((current = currentCard(c, p, i, goal, a)));
    const done = placeCleared(c, p);
    const b = el('button', `node ${p.kind}${done ? ' cleared' : ''}${p.optional ? ' optional' : ''}`);
    b.dataset.testid = testidOf(p);
    b.dataset.kind = p.kind;
    const row = el('span', 'node-row');
    row.append(text('b', placeName(p)));
    if (done && p.kind === 'gym' && p.badge) row.append(el('span', `badge won ${p.badge}`));
    if (done) row.append(stamp());
    b.append(row, ...(done ? [] : details(c, p)));
    b.onclick = () => (warmFor(p, true), a.place(i));
    if (p.id === justCleared) {
      stamped = b;
      b.classList.add('stamp-wait'); // its stamp hidden until it slams (Fix, 13 Oct: it showed, blinked out, slammed)
    }
    list.append(b);
  });
  if (locked > 1) {
    const more = line('map.more', { n: String(locked - 1) }, 'small map-more');
    more.dataset.testid = 'map-more';
    list.append(more);
  }
  const tools = el('div', 'map-top');
  tools.append(
    button('map.card', a.card, 'open-card'),
    button('map.dex', a.dex, 'open-dex'),
    button('map.team', a.team, 'open-team'),
    button('map.training', a.training, 'open-training'),
    ...(c.champion && a.hof ? [button('map.champion', a.hof, 'open-hof')] : []),
  );
  const legend = optional ? [line('map.optional', undefined, 'small map-legend')] : [];
  const top = strip(c);
  const s = screen('map', el('h2', '', 'map.title'), top, tools, ...legend, list, button('back', a.back, 'back', 'secondary'));
  if (goal) warmFor(goal.place); // the current place's trainers load while the map is read
  const won = PLACES.find((p) => p.id === justCleared && p.kind === 'gym')?.badge;
  const badge = won ? top.querySelector<HTMLElement>(`.badge.won.${won}`) : null;
  badge?.classList.add('badge-new');
  requestAnimationFrame(() => {
    const at = stamped as HTMLElement | null;
    const here = current as HTMLElement | null;
    if (!at) return here?.scrollIntoView({ block: 'center' });
    if (badge) {
      top.scrollIntoView({ block: 'start' });
      window.setTimeout(() => at.isConnected && at.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' }), AREA_IN_MS + BADGE_SHOW_MS);
    } else at.scrollIntoView({ block: 'center' });
    window.setTimeout(() => {
      if (!at.isConnected) return;
      at.classList.replace('stamp-wait', 'stamp-now');
      a.stamped?.();
      window.setTimeout(() => {
        if (!here?.isConnected) return;
        const r = here.getBoundingClientRect();
        const box = here.closest('.menu-body')?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
        if (r.top < box.top || r.bottom > box.bottom) here.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
        if (!calm) here.classList.add('next-pulse');
      }, STAMP_PAUSE_MS);
    }, AREA_IN_MS + MAP_STAMP_DELAY_MS + (badge ? BADGE_SHOW_MS + MAP_SCROLL_MS : 0));
  });
  return s;
}

export interface RouteActions {
  battle(t: Trainer): void;
  walk(): void;
  back(): void;
  /** A trainer's sprite (class or person); undefined: the silhouette. */
  sprite(t: Trainer): string | undefined;
}

/** A route: its trainers with ✓, how many are beaten, the next one as the primary button, the tall grass and its
 * Pokémon. (The C2 mastery line went: it no longer opens anything, W5.) */
export function routeScreen(p: Place, c: Campaign, a: RouteActions): HTMLElement {
  const r = routeOf(p) as Route;
  const trainers = el('div', 'trainers');
  const next = nextTrainer(c, p);
  const all = p.trainers ?? [];
  for (const t of all) {
    const beaten = c.journey.beaten.includes(t.id);
    const row = el('div', `trainer-row${beaten ? ' beaten' : ''}${t === next ? ' next' : ''}`);
    row.dataset.testid = `trainer-${t.id}`;
    row.append(trainerSprite(a.sprite(t), 'trainer-sprite row-sprite'), text('span', trainerName(t), 'trainer-name'));
    if (beaten) row.append(text('span', `✓ ${fmt('trainer.beaten')}`, 'check'));
    trainers.append(row);
  }
  const count = line('route.trainers', { beaten: String(all.filter((t) => c.journey.beaten.includes(t.id)).length), total: String(all.length) }, 'small');
  count.dataset.testid = 'route-trainers';
  const fight = next ? button('trainer.next', () => (warmEngine(), a.battle(next)), 'battle-trainer', 'primary', { class: fmt(next.class), name: fmt(next.name) }) : line('trainer.cleared', undefined, 'cleared');
  const dex = el('div', 'dex-grid');
  for (const s of routeSpecies(r)) {
    const cell = el('div', 'dex-cell');
    cell.append(mon(s, 'dex-sprite', !c.caught[s]), document.createTextNode(c.caught[s] ? SPECIES[s]!.name : fmt('dex.unknown')));
    dex.append(cell);
  }
  const h = el('h2');
  h.textContent = r.name;
  return screen('route', h, count, trainers, fight, button('route.walk', a.walk, 'walk-grass', 'secondary-wide'), dex, button('back', a.back, 'back', 'secondary'));
}

/** A card over the screen (W5): tap anywhere to go on. Only a tap on this card counts, not the one that opened it. */
export function tapCard(modal: HTMLElement, card: HTMLElement, done: () => void): void {
  card.append(el('span', 'tb-tick', 'story.tap'));
  modal.replaceChildren(card);
  modal.hidden = false;
  modal.onclick = (e) => {
    if (!card.contains(e.target as Node)) return;
    modal.onclick = null;
    modal.hidden = true;
    modal.replaceChildren();
    done();
  };
}

function card(testid: string, title: string): HTMLElement {
  const p = el('div', `panel progress-card ${testid}`);
  p.dataset.testid = testid;
  p.append(text('b', title, 'card-title'));
  return p;
}

/** A trainer beaten (W5): ✓ and the name, the pips, how many trainers of the place are beaten. The card slams in and
 * the pips light one by one (pacing §5); a badge has its own card next. */
export function winCard(c: Campaign, p: Place, t: Trainer, sprite: string | undefined | null, pips: string): HTMLElement {
  const box = card('win-card', fmt('win.title'));
  if (sprite !== null) box.append(trainerSprite(sprite, 'trainer-sprite'));
  const row = el('p', 'pips');
  row.setAttribute('aria-label', pips);
  [...pips].forEach((pip, i) => {
    const s = text('span', pip, 'pip');
    s.style.setProperty('--i', String(i));
    row.append(s);
  });
  box.append(text('p', `✓ ${trainerName(t)}`, 'win-trainer'), row);
  const all = p.trainers ?? [];
  if (all.length > 1) box.append(line('route.trainers', { beaten: String(all.filter((x) => c.journey.beaten.includes(x.id)).length), total: String(all.length) }, 'small'));
  return box;
}

/** A badge won (pacing §5): "You received the …!" and the badge spinning in, then a shine across it. */
export function badgeCard(badge: string): HTMLElement {
  const box = card('badge-card', fmt('badge.received', { badge: fmt(`badge.${badge}` as StringKey) }));
  box.append(el('span', `badge won ${badge} badge-big`));
  return box;
}

/** A place cleared (W5): the stamp, what opened, and the next goal. A town's card says what is there instead. */
export function placeCard(p: Place, next: Goal | null, town = false): HTMLElement {
  const box = card(town ? 'town-card' : 'unlock-card', town ? placeName(p) : fmt('unlock.cleared', { place: placeName(p) }));
  box.prepend(stamp());
  if (p.here) box.append(line(p.here, undefined, 'here'));
  if (!town && next && next.place !== p) box.append(line('unlock.open', { place: placeName(next.place) }, 'open'));
  if (next) box.append(line('goal.next', { goal: next.text }, 'small next'));
  return box;
}

/** Oak before Route 1's trainers (W5, design G): three quick moves, or Skip for players who know chess. */
export function warmupIntro(oak: string | undefined, go: () => void, skip: () => void): HTMLElement {
  const box = el('div', 'panel warmup-intro');
  box.dataset.testid = 'warmup-intro';
  const row = el('div', 'end-buttons');
  row.append(button('warm.go', go, 'warmup-go', 'primary'), button('warm.skip', skip, 'warmup-skip', 'secondary'));
  box.append(trainerSprite(oak, 'trainer-sprite'), line('warm.intro'), row);
  return box;
}

/** The first catch (W5): the Pokémon, the Pokédex count and, when it became your pawns, where to change that. */
export function firstCatchCard(id: string, dex: number, pawns: boolean): HTMLElement {
  const box = card('catch-card', fmt('warm.firstCatch', { n: String(dex) }));
  box.prepend(mon(id, 'menu-sprite', false, false, true));
  if (pawns) box.append(line('warm.pawns', { name: SPECIES[id]!.name }));
  return box;
}
