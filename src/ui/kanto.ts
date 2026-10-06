// SPDX-License-Identifier: AGPL-3.0-only
// Kanto Journey screens (§B11, §B12): story boxes, name and starter, the journey map, a route with its trainers,
// trainer intros, the Trainer Card, Training, the 151 Pokédex with candy and stars, My Team, and the encounter panel.
import { MASTERY_NEED, MASTERY_WINDOW, STAR_STEPS } from '../config';
import { SKIN_ROLES, SPECIES, speciesIdFor, spriteUrl, variantId, type TeamSkin } from '../board/pieces';
import { DEX, evolutionsOf, evolveCost, familyOf, routeSpecies, SOURCES, starsOf, STARTERS, teamBadges, type Campaign, type Evolution, type Route } from '../campaign/kanto';
import { furthest, nextTrainer, PLACES, placeCleared, placeUnlocked, routeOf, teamOf, type Place, type Trainer } from '../campaign/journey';
import { fmt, type StringKey, type Vars } from '../game/text';
import { button, el, screen } from './dom';
import { whyNot } from '../../worker/src/team';
import { myTrainer, trainerSpriteId } from '../look';
import { listenForWord } from './secret';

/** A Pokémon sprite that is never an empty box (§B14 bug): the tiny Gen 1 sprite shows while the animated GIF
 * loads (behind a queue of battle preloads on a slow phone), and stays if the GIF fails. */
export function mon(id: string, cls = 'menu-sprite', silhouette = false, shiny = false, eager = false): HTMLImageElement {
  const img = el('img', cls + (silhouette ? ' silhouette' : ''));
  const dex = SPECIES[id]!.dex;
  const retro = spriteUrl(dex, 'retro');
  img.alt = silhouette ? fmt('dex.unknown') : SPECIES[id]!.name;
  img.dataset.species = id;
  img.decoding = 'async';
  if (eager) img.fetchPriority = 'high';
  img.style.backgroundImage = `url("${retro}")`;
  img.onload = () => (img.style.backgroundImage = '');
  img.onerror = () => {
    img.onerror = null;
    img.src = retro;
  };
  img.src = spriteUrl(dex, 'front', shiny);
  return img;
}

/** A trainer sprite from assets/trainers/, or a CSS silhouette when it is missing (§B14). */
/** URL of a trainer sprite: MEIR is original art in public/art, the rest are fetched at build time. */
export const trainerSrc = (sprite: string) => (sprite === 'meir' ? 'art/meir.png' : `assets/trainers/${sprite}.png`);

export function trainerSprite(sprite: string | undefined, cls = 'trainer-sprite'): HTMLElement {
  const box = el('div', cls);
  if (!sprite) {
    box.classList.add('sil');
    return box;
  }
  const img = el('img');
  img.alt = '';
  img.dataset.trainer = sprite;
  img.onerror = () => {
    img.remove();
    box.classList.remove('loading');
    box.classList.add('sil');
  };
  // MEIR is original art shipped with the game (§B18 item 7); every other trainer is fetched at build time.
  img.src = trainerSrc(sprite);
  // A silhouette stands in until the sprite arrives (§B22 item 1).
  if (!img.complete) {
    box.classList.add('loading');
    img.addEventListener('load', () => box.classList.remove('loading'), { once: true });
  }
  box.append(img);
  return box;
}

function line(key: StringKey, vars?: Vars, cls = ''): HTMLElement {
  const p = el('p', cls);
  p.textContent = fmt(key, vars);
  return p;
}

/** Gen 1 style text boxes over the screen, one per tap (§B11); a trainer can slide in beside them (§B14). */
export function story(host: HTMLElement, texts: string[], done: () => void, sprite?: string): void {
  const box = el('div', 'panel story');
  if (sprite) host.append(trainerSprite(sprite, 'trainer-sprite story-trainer slide-in'));
  box.dataset.testid = 'story';
  const p = el('p', 'story-text');
  p.dataset.testid = 'story-text';
  const tick = el('span', 'tb-tick', 'story.tap');
  box.append(p, tick);
  let i = 0;
  const show = () => {
    p.textContent = texts[i] ?? '';
  };
  host.onclick = () => {
    i++;
    if (i < texts.length) return show();
    host.onclick = null;
    host.hidden = true;
    host.replaceChildren();
    done();
  };
  show();
  host.querySelectorAll('.panel').forEach((n) => n.remove());
  if (!sprite) host.querySelectorAll('.story-trainer').forEach((n) => n.remove());
  host.append(box);
  host.hidden = false;
}

export function nameScreen(pick: (name: string) => void, back: () => void, red?: string, meir = false): HTMLElement {
  const row = el('div', 'buttons');
  for (let i = 1; i <= 6; i++) row.append(button(`name.${i}` as StringKey, () => pick(fmt(`name.${i}` as StringKey)), `name-${i}`));
  const side = el('div', 'name-step');
  side.append(trainerSprite(red, 'trainer-sprite slide-in'), row);
  const view = screen('name', el('h2', '', 'name.choose'), side, button('back', back, 'back', 'secondary'));
  if (meir) listenForWord(view, 'MEIR', () => pick('MEIR'));
  return view;
}

export function oakScreen(pick: (id: string) => void, back: () => void): HTMLElement {
  const row = el('div', 'cards');
  for (const id of STARTERS) {
    const b = el('button', 'card');
    b.dataset.testid = `starter-${id}`;
    // Animated, bouncing on hover or tap; the cry plays when chosen (main passes it in `pick`).
    b.append(mon(id, 'menu-sprite bounce', false, false, true), document.createTextNode(SPECIES[id]!.name));
    b.onclick = () => pick(id);
    row.append(b);
  }
  return screen('oak', el('h2', '', 'oak.title'), el('p', '', 'oak.line'), row, button('back', back, 'back', 'secondary'));
}

export interface MapActions {
  place(index: number): void;
  dex(): void;
  team(): void;
  card(): void;
  training(): void;
  back(): void;
  hof?(): void;
}

export const placeName = (p: Place) => routeOf(p)?.name ?? (p.name ? fmt(p.name) : p.id);

export function mapScreen(c: Campaign, a: MapActions): HTMLElement {
  const caught = DEX.filter((s) => c.caught[s]).length;
  const list = el('div', 'kanto-map');
  const here = furthest(c);
  PLACES.forEach((p, i) => {
    const open = placeUnlocked(c, i);
    const done = placeCleared(c, p);
    const testid = p.route ? `route-${p.route}` : `place-${p.id}`;
    const b = el('button', `node ${p.kind}${open ? '' : ' locked'}${i === here ? ' here' : ''}`);
    b.dataset.testid = testid;
    b.disabled = !open;
    const title = el('b');
    title.textContent = `${placeName(p)}${done ? ' ✓' : ''}`;
    b.append(title);
    b.dataset.kind = p.kind;
    if (p.kind === 'gym' && p.badge) {
      const won = c.badges.includes(p.badge);
      const badge = el('p', `small badge-line${won ? ' won' : ''}`);
      badge.textContent = `${fmt(`badge.${p.badge}` as StringKey)}${won ? ' ✓' : ''}`;
      b.append(badge);
    }
    if (p.optional) b.classList.add('optional');
    else if (p.route) {
      const r = routeOf(p)!;
      const sp = routeSpecies(r as Route);
      b.append(line('route.dex', { caught: String(sp.filter((s) => c.caught[s]).length), total: String(sp.length) }, 'small'));
    }
    if (!open) b.append(line('map.locked', undefined, 'small'));
    b.onclick = () => open && a.place(i);
    list.append(b);
  });
  const top = el('div', 'map-top');
  top.append(
    line('map.pokedex', { caught: String(caught), total: '151' }),
    button('map.card', a.card, 'open-card'),
    button('map.dex', a.dex, 'open-dex'),
    button('map.team', a.team, 'open-team'),
    button('map.training', a.training, 'open-training'),
    ...(c.champion && a.hof ? [button('map.champion', a.hof, 'open-hof')] : []),
  );
  const s = screen('map', el('h2', '', 'map.title'), top, list, button('back', a.back, 'back', 'secondary'));
  // Open on the furthest point reached (§B11).
  requestAnimationFrame(() => list.children[here]?.scrollIntoView({ block: 'center' }));
  return s;
}

export interface RouteActions {
  battle(t: Trainer): void;
  walk(): void;
  back(): void;
}

export function routeScreen(p: Place, c: Campaign, a: RouteActions): HTMLElement {
  const r = routeOf(p) as Route;
  const st = c.routes[r.id];
  const trainers = el('div', 'trainers');
  const next = nextTrainer(c, p);
  for (const t of p.trainers ?? []) {
    const row = el('div', 'trainer-row');
    const beaten = c.journey.beaten.includes(t.id);
    row.textContent = `${fmt(t.class)} ${fmt(t.name)}${beaten ? ` ✓ ${fmt('trainer.beaten')}` : ''}`;
    trainers.append(row);
  }
  const fight = next
    ? button('trainer.next', () => a.battle(next), 'battle-trainer', 'primary')
    : line('trainer.cleared', undefined, 'cleared');
  if (next) fight.textContent = fmt('trainer.next', { class: fmt(next.class), name: fmt(next.name) });
  const dex = el('div', 'dex-grid');
  for (const s of routeSpecies(r)) {
    const cell = el('div', 'dex-cell');
    cell.append(mon(s, 'dex-sprite', !c.caught[s]), document.createTextNode(c.caught[s] ? SPECIES[s]!.name : fmt('dex.unknown')));
    dex.append(cell);
  }
  const h = el('h2');
  h.textContent = r.name;
  const played = st?.last.length ?? 0;
  const solved = st?.last.filter(Boolean).length ?? 0;
  return screen(
    'route',
    h,
    trainers,
    fight,
    button('route.walk', a.walk, 'walk-grass', 'secondary-wide'),
    line('route.mastery', { solved: String(solved), played: String(played), need: String(MASTERY_NEED), window: String(MASTERY_WINDOW) }, 'small'),
    dex,
    button('back', a.back, 'back', 'secondary'),
  );
}

/** Battle intro card (§B14): the trainer slides in, "{CLASS} {NAME} wants to battle!" and their 1 to 3 Pokémon. */
export function trainerIntro(c: Campaign, t: Trainer, sprite: string | undefined | null): HTMLElement {
  const p = el('div', 'panel trainer-intro');
  p.dataset.testid = 'trainer-intro';
  const team = el('div', 'kings');
  for (const s of teamOf(c, t)) team.append(mon(s, 'dex-sprite', false, false, true));
  // null: no trainer at all (a wild legendary), only its sprite.
  if (sprite !== null) p.append(trainerSprite(sprite, 'trainer-sprite slide-in'));
  p.append(line('trainer.wants', { class: fmt(t.class), name: fmt(t.name) }), team, el('span', 'tb-tick', 'story.tap'));
  return p;
}

/** A goal card with its own title and goal text (Victory Road drills, Champion BLUE). */
export function textGoalCard(title: string, goal: string, extra?: string): HTMLElement {
  const p = el('div', 'panel goal-card');
  p.dataset.testid = 'goal-card';
  const h = el('h3');
  h.textContent = title;
  const g = el('p');
  g.textContent = goal;
  p.append(h, g);
  if (extra) {
    const x = el('p', 'small');
    x.textContent = extra;
    p.append(x);
  }
  p.append(el('span', 'tb-tick', 'goal.start'));
  return p;
}

/** Pick one of several gifts (fossils, the Fighting Dojo). */
export function choiceScreen(ids: string[], pick: (id: string) => void): HTMLElement {
  const row = el('div', 'cards');
  for (const id of ids) {
    const b = el('button', 'card');
    b.dataset.testid = `choose-${id}`;
    b.append(mon(id, 'menu-sprite bounce', false, false, true), document.createTextNode(SPECIES[id]!.name));
    b.onclick = () => pick(id);
    row.append(b);
  }
  return screen('choice', el('h2', '', 'reward.choose'), row);
}

/** Hall of Fame (§B2 row 12): your name, your partner and your team. */
/** The player's own trainer, RED or MEIR (§B18 item 7). */
function playerSprite(): HTMLElement {
  const t = trainerSprite(trainerSpriteId(myTrainer()), 'trainer-sprite player-trainer');
  t.dataset.testid = 'player-trainer';
  return t;
}

export function hofScreen(c: Campaign, team: string[], done: () => void): HTMLElement {
  const grid = el('div', 'kings hof-team');
  grid.dataset.testid = 'hof-team';
  for (const id of team) grid.append(mon(id, 'menu-sprite', false, false, true));
  const entry = c.hallOfFame[c.hallOfFame.length - 1];
  return screen(
    'hof',
    el('h2', '', 'hof.title'),
    playerSprite(),
    line('hof.line', { name: c.name || fmt('name.1') }),
    el('p', 'small', 'hof.team'),
    grid,
    ...(entry ? [line('hof.date', { date: entry.date }, 'small')] : []),
    button('lesson.ok', done, 'hof-ok', 'primary'),
  );
}

/** Goal card (§B14): the lesson title, a one line goal in kid language, one pip per puzzle. Tap to start. */
export function goalCard(theme: string, puzzles: number, need: number, extra?: string): HTMLElement {
  const p = el('div', 'panel goal-card');
  p.dataset.testid = 'goal-card';
  const title = el('h3');
  title.textContent = fmt(`lesson.${theme}.title` as StringKey);
  const pips = el('p', 'pips');
  pips.textContent = '○'.repeat(puzzles);
  pips.dataset.testid = 'pips';
  p.append(title, line(`lesson.${theme}.goal` as StringKey), pips, line('goal.need', { need: String(need), total: String(puzzles) }, 'small'));
  if (extra) {
    const x = el('p', 'small');
    x.textContent = extra;
    p.append(x);
  }
  p.append(el('span', 'tb-tick', 'goal.start'));
  return p;
}

export function cardScreen(c: Campaign, rating: number, back: () => void): HTMLElement {
  const caught = DEX.filter((s) => c.caught[s]).length;
  const seen = DEX.filter((s) => c.seen.includes(s) || c.caught[s]).length;
  const mins = Math.floor(c.playMs / 60000);
  const time = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  const badges = el('div', 'badges');
  const ALL = ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'];
  for (const b of ALL) {
    const dot = el('span', `badge ${c.badges.includes(b) ? `won ${b}` : 'empty'}`);
    dot.title = c.badges.includes(b) ? fmt(`badge.${b}` as StringKey) : '';
    badges.append(dot);
  }
  badges.dataset.testid = 'badges';
  const card = el('div', 'trainer-card');
  card.dataset.testid = 'trainer-card';
  card.append(
    playerSprite(),
    line('card.name', { name: c.name || fmt('name.1') }),
    line('card.level', { level: String(Math.round(rating)) }, 'level'),
    line('card.levelNote', undefined, 'small'),
    el('p', 'small', 'card.badges'),
    badges,
    line('card.dex', { seen: String(seen), caught: String(caught), pct: String(Math.round((caught / 151) * 100)) }),
    line('card.starter', { starter: c.starter ? SPECIES[c.starter]!.name : '-' }),
    line('card.time', { time }),
  );
  return screen('card', el('h2', '', 'card.title'), card, button('back', back, 'back', 'secondary'));
}

export function trainingScreen(themes: string[], start: (theme: string) => void, back: () => void, lesson: (theme: string) => void): HTMLElement {
  const list = el('div', 'buttons');
  for (const t of themes) {
    const row = el('div', 'train-row');
    row.append(button(`theme.${t}` as StringKey, () => start(t), `train-${t}`), button('lesson.again', () => lesson(t), `lesson-${t}`, 'secondary'));
    list.append(row);
  }
  return screen('training', el('h2', '', 'training.title'), el('p', 'small', themes.length ? 'training.note' : 'training.none'), list, button('back', back, 'back', 'secondary'));
}

/** The 151 Pokédex: caught in colour, seen as a silhouette with its name, unseen as ???. */
export function dexScreen(c: Campaign, open: (id: string) => void, back: () => void, stickers = false): HTMLElement {
  const grid = el('div', 'dex-grid');
  for (const s of DEX) {
    const caught = !!c.caught[s];
    const seen = caught || c.seen.includes(s);
    const cell = el('button', `dex-cell${caught ? ' caught' : ''}`);
    cell.dataset.species = s;
    cell.dataset.testid = `dex-${s}`;
    const num = el('small');
    num.textContent = `#${String(SPECIES[s]!.dex).padStart(3, '0')}`;
    const stars = starsOf(c, s);
    const name = document.createTextNode(seen ? SPECIES[s]!.name + (c.shiny[s] ? ' ✨' : '') + (stars ? ' ' + '★'.repeat(stars) : '') : fmt('dex.unknown'));
    cell.append(num, mon(s, 'dex-sprite', !caught, (c.shiny[s] ?? 0) > 0), name);
    cell.disabled = !caught;
    cell.onclick = () => caught && open(s);
    grid.append(cell);
  }
  const caught = DEX.filter((s) => c.caught[s]).length;
  // YELLOW shows the same 151 slots as a sticker book (§B17).
  if (stickers) return screen('dex', el('h2', '', 'stickers.title'), line('stickers.count', { n: String(caught) }), grid, button('back', back, 'back', 'secondary'));
  return screen('dex', el('h2', '', 'dex.title'), line('map.pokedex', { caught: String(caught), total: '151' }), grid, button('back', back, 'back', 'secondary'));
}

export interface DexActions {
  evolve(e: Evolution): void;
  oak(): void;
  close(): void;
}

const whereName = (where: string) => {
  const p = PLACES.find((x) => x.id === where || x.route === where);
  return p ? placeName(p) : where === 'evolution' ? fmt('place.caughtEvolution') : where;
};

/** One caught species: candy, evolutions, Oak, stars, shiny, where it was caught and where to find it. */
export function dexDetail(c: Campaign, id: string, a: DexActions): HTMLElement {
  const p = el('div', 'panel dex-detail');
  p.dataset.testid = 'dex-detail';
  const fam = familyOf(id);
  const rows = el('div', 'buttons');
  for (const e of evolutionsOf(id)) {
    const b = button('dex.evolve', () => a.evolve(e), `evolve-${e.to}`);
    b.textContent = fmt('dex.evolve', { to: SPECIES[e.to]!.name, cost: String(evolveCost(e)) });
    b.disabled = (c.candy[fam] ?? 0) < evolveCost(e);
    rows.append(b);
  }
  if ((c.caught[id] ?? 0) > 1) rows.append(button('dex.oak', a.oak, 'send-oak'));
  rows.append(button('dex.close', a.close, 'dex-close'));
  const stars = starsOf(c, id);
  const src = (SOURCES[id] ?? []).map((s) => fmt(`source.${s.kind}` as StringKey, { from: s.from ? SPECIES[s.from]!.name : '' }));
  const h = el('h3');
  h.textContent = `${SPECIES[id]!.name} x${c.caught[id] ?? 0}`;
  p.append(
    h,
    mon(id, 'menu-sprite', false, (c.shiny[id] ?? 0) > 0),
    line('dex.candy', { family: SPECIES[fam]!.name, n: String(c.candy[fam] ?? 0) }, 'candy'),
    line('dex.stars', { stars: `${'★'.repeat(stars) || '-'} (${c.oak[id] ?? 0} / ${STAR_STEPS.join(', ')})` }, 'small'),
    ...(c.shiny[id] ? [line('dex.shiny', undefined, 'small')] : []),
    ...(c.caughtAt[id] ? [line('dex.caughtAt', { where: whereName(c.caughtAt[id]!) }, 'small')] : []),
    line('dex.find', { where: [...new Set(src)].join('; ') }, 'small'),
    rows,
  );
  return p;
}

const ROLE_LABEL: Record<(typeof SKIN_ROLES)[number], StringKey> = { k: 'role.k', q: 'role.q', r: 'role.r', bLight: 'role.bLight', bDark: 'role.bDark', n: 'role.n', p: 'role.p' };
const ROLE_SQUARE: Record<(typeof SKIN_ROLES)[number], [string, 'k' | 'q' | 'r' | 'b' | 'n' | 'p']> = { k: ['e1', 'k'], q: ['d1', 'q'], r: ['a1', 'r'], bLight: ['f1', 'b'], bDark: ['c1', 'b'], n: ['b1', 'n'], p: ['a2', 'p'] };

/** Every caught form (§B12): normal and shiny, each with that species' stars. */
function forms(c: Campaign): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const s of DEX) {
    const have = c.caught[s] ?? 0;
    if (!have) continue;
    const stars = starsOf(c, s);
    const tail = stars ? ` ${'★'.repeat(stars)}` : '';
    if (have > (c.shiny[s] ?? 0)) out.push({ id: variantId(s, false, stars), label: SPECIES[s]!.name + tail });
    if (c.shiny[s]) out.push({ id: variantId(s, true, stars), label: `${SPECIES[s]!.name} ✨${tail}` });
  }
  return out;
}

export function teamScreen(c: Campaign, change: (team: TeamSkin) => void, back: () => void, clearNotice: () => void): HTMLElement {
  const rows = el('div', 'settings');
  if (c.teamNotice.length) {
    const note = el('div', 'panel team-notice');
    note.dataset.testid = 'team-notice';
    const list = c.teamNotice.map(([role, id]) => `${fmt(ROLE_LABEL[role])}: ${SPECIES[id.split(':')[0] ?? '']?.name ?? id}`).join(', ');
    note.append(line('team.notice', { list }), button('team.noticeOk', () => {
      note.remove();
      clearNotice();
    }, 'team-notice-ok'));
    rows.append(note);
  }
  const team: TeamSkin = { ...c.team };
  const owned = forms(c);
  for (const role of SKIN_ROLES) {
    const r = el('label', 'setting team-row');
    const [sq, piece] = ROLE_SQUARE[role];
    const sel = el('select');
    sel.dataset.testid = `team-${role}`;
    const def = el('option');
    def.value = '';
    // The default is the Red team's species for that square (no skins are active on menu screens).
    def.textContent = fmt('team.default', { name: SPECIES[speciesIdFor('w', piece, sq)]!.name });
    sel.append(def);
    // Ineligible Pokémon are greyed out (§B14); the row says why.
    let reason: ReturnType<typeof whyNot> = null;
    for (const f of owned) {
      const o = el('option');
      o.value = f.id;
      o.textContent = f.label;
      const why = whyNot(role, f.id, c.starter, teamBadges(c));
      o.disabled = why !== null;
      reason ??= why;
      sel.append(o);
    }
    if (role === 'q' && teamBadges(c) < 1) {
      sel.disabled = true;
      reason = 'queenLocked';
    }
    sel.value = team[role] ?? '';
    const previewOf = (v: string) => {
      const [base = '', ...flags] = (v || speciesIdFor('w', piece, sq)).split(':');
      return spriteUrl(SPECIES[base]!.dex, 'front', flags.includes('s'));
    };
    const preview = el('img', 'team-sprite');
    preview.src = previewOf(team[role] ?? '');
    preview.alt = '';
    sel.onchange = () => {
      if (sel.value) team[role] = sel.value;
      else delete team[role];
      preview.src = previewOf(sel.value);
      change({ ...team });
    };
    r.append(preview, el('span', '', ROLE_LABEL[role]), sel);
    rows.append(r);
    if (reason) {
      const why = line(`team.why.${reason}` as StringKey, undefined, 'small why');
      why.dataset.testid = `why-${role}`;
      rows.append(why);
    }
  }
  return screen('team', el('h2', '', 'team.title'), el('p', 'small', 'team.note'), rows, button('back', back, 'back', 'secondary'));
}

/** The panel shown over the board after a tall grass solve. A shiny shows from the start (§B12). */
export function encounterPanel(id: string, shiny: boolean, throwBall: () => boolean, again: () => void, map: () => void): HTMLElement {
  const p = el('div', `panel encounter${shiny ? ' shiny' : ''}`);
  p.dataset.testid = 'encounter';
  const msg = line('enc.appeared', { name: SPECIES[id]!.name });
  msg.dataset.testid = 'encounter-text';
  const row = el('div', 'end-buttons');
  const ball = button('enc.throw', () => {
    const caught = throwBall();
    msg.textContent = fmt(caught ? 'enc.caught' : 'enc.fled', { name: SPECIES[id]!.name });
    row.replaceChildren(button('enc.again', again, 'walk-again'), button('route.leave', map, 'to-map'));
  }, 'throw-ball');
  row.append(ball);
  p.append(mon(id, 'menu-sprite', false, shiny), ...(shiny ? [line('enc.shiny', undefined, 'shiny-note')] : []), msg, row);
  return p;
}

