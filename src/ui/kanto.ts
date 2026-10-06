// SPDX-License-Identifier: AGPL-3.0-only
// Kanto Journey screens (§B11, §B12): story boxes, name and starter, the journey map, a route with its trainers,
// trainer intros, the Trainer Card, Training, the 151 Pokédex with candy and stars, My Team, and the encounter panel.
import { MASTERY_NEED, MASTERY_WINDOW, STAR_STEPS } from '../config';
import { SKIN_ROLES, SPECIES, speciesIdFor, spriteUrl, variantId, type TeamSkin } from '../board/pieces';
import { DEX, evolutionsOf, evolveCost, familyOf, routeSpecies, SOURCES, starsOf, STARTERS, type Campaign, type Evolution, type Route } from '../campaign/kanto';
import { furthest, nextTrainer, PLACES, placeCleared, placeUnlocked, routeOf, teamOf, type Place, type Trainer } from '../campaign/journey';
import { fmt, type StringKey, type Vars } from '../game/text';
import { button, el, screen } from './dom';

function mon(id: string, cls = 'menu-sprite', silhouette = false, shiny = false): HTMLImageElement {
  const img = el('img', cls + (silhouette ? ' silhouette' : ''));
  img.src = spriteUrl(SPECIES[id]!.dex, 'front', shiny);
  img.alt = silhouette ? fmt('dex.unknown') : SPECIES[id]!.name;
  return img;
}

function line(key: StringKey, vars?: Vars, cls = ''): HTMLElement {
  const p = el('p', cls);
  p.textContent = fmt(key, vars);
  return p;
}

/** Gen 1 style text boxes over the screen, one per tap (§B11). */
export function story(host: HTMLElement, texts: string[], done: () => void): void {
  const box = el('div', 'panel story');
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
    done();
  };
  show();
  host.replaceChildren(box);
  host.hidden = false;
}

export function nameScreen(pick: (name: string) => void, back: () => void): HTMLElement {
  const row = el('div', 'buttons');
  for (let i = 1; i <= 6; i++) row.append(button(`name.${i}` as StringKey, () => pick(fmt(`name.${i}` as StringKey)), `name-${i}`));
  return screen('name', el('h2', '', 'name.choose'), row, button('back', back, 'back', 'secondary'));
}

export function oakScreen(pick: (id: string) => void, back: () => void): HTMLElement {
  const row = el('div', 'cards');
  for (const id of STARTERS) {
    const b = el('button', 'card');
    b.dataset.testid = `starter-${id}`;
    b.append(mon(id), document.createTextNode(SPECIES[id]!.name));
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
    b.disabled = !open || p.kind === 'gym';
    const title = el('b');
    title.textContent = `${placeName(p)}${done && p.kind !== 'gym' ? ' ✓' : ''}`;
    b.append(title);
    if (p.kind === 'gym') b.append(line('map.gymSoon', undefined, 'small'));
    else if (p.route) {
      const r = routeOf(p)!;
      const sp = routeSpecies(r as Route);
      b.append(line('route.dex', { caught: String(sp.filter((s) => c.caught[s]).length), total: String(sp.length) }, 'small'));
    }
    if (!open && p.kind !== 'gym') b.append(line('map.locked', undefined, 'small'));
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

/** "{CLASS} {NAME} wants to battle!" with the trainer's team (no trainer sprites, §B11). */
export function trainerIntro(c: Campaign, t: Trainer): HTMLElement {
  const p = el('div', 'panel trainer-intro');
  p.dataset.testid = 'trainer-intro';
  const team = el('div', 'kings');
  for (const s of teamOf(c, t)) team.append(mon(s, 'dex-sprite'));
  p.append(line('trainer.wants', { class: fmt(t.class), name: fmt(t.name) }), team, el('span', 'tb-tick', 'story.tap'));
  return p;
}

export function cardScreen(c: Campaign, rating: number, back: () => void): HTMLElement {
  const caught = DEX.filter((s) => c.caught[s]).length;
  const seen = DEX.filter((s) => c.seen.includes(s) || c.caught[s]).length;
  const mins = Math.floor(c.playMs / 60000);
  const time = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  const badges = el('div', 'badges');
  for (let i = 0; i < 8; i++) badges.append(el('span', 'badge empty'));
  const card = el('div', 'trainer-card');
  card.dataset.testid = 'trainer-card';
  card.append(
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

export function trainingScreen(themes: string[], start: (theme: string) => void, back: () => void): HTMLElement {
  const list = el('div', 'buttons');
  for (const t of themes) list.append(button(`theme.${t}` as StringKey, () => start(t), `train-${t}`));
  return screen('training', el('h2', '', 'training.title'), el('p', 'small', themes.length ? 'training.note' : 'training.none'), list, button('back', back, 'back', 'secondary'));
}

/** The 151 Pokédex: caught in colour, seen as a silhouette with its name, unseen as ???. */
export function dexScreen(c: Campaign, open: (id: string) => void, back: () => void): HTMLElement {
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

export function teamScreen(c: Campaign, change: (team: TeamSkin) => void, back: () => void): HTMLElement {
  const rows = el('div', 'settings');
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
    for (const f of owned) {
      const o = el('option');
      o.value = f.id;
      o.textContent = f.label;
      sel.append(o);
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

