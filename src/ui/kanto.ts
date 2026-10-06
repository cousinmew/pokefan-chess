// SPDX-License-Identifier: AGPL-3.0-only
// Kanto campaign screens: Oak's starter, the node map, a route, the Pokédex, My Team and the encounter panel.
import { MASTERY_NEED, MASTERY_WINDOW } from '../config';
import { SKIN_ROLES, SPECIES, speciesIdFor, spriteUrl, type TeamSkin } from '../board/pieces';
import { allSpecies, mastered, routeSpecies, ROUTES, STARTERS, unlocked, type Campaign, type Route } from '../campaign/kanto';
import { fmt, type StringKey } from '../game/text';
import { button, el, screen } from './dom';

function mon(id: string, cls = 'menu-sprite', silhouette = false): HTMLImageElement {
  const img = el('img', cls + (silhouette ? ' silhouette' : ''));
  img.src = spriteUrl(SPECIES[id]!.dex);
  img.alt = silhouette ? fmt('dex.unknown') : SPECIES[id]!.name;
  return img;
}

function line(key: StringKey, vars?: Record<string, string>, cls = ''): HTMLElement {
  const p = el('p', cls);
  p.textContent = fmt(key, vars);
  return p;
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
  route(index: number): void;
  dex(): void;
  team(): void;
  back(): void;
}

export function mapScreen(c: Campaign, a: MapActions): HTMLElement {
  const total = allSpecies().length;
  const caught = allSpecies().filter((s) => c.caught[s]).length;
  const list = el('div', 'kanto-map');
  const node = (label: string, cls: string) => {
    const n = el('div', `node ${cls}`);
    n.textContent = label;
    list.append(n);
    return n;
  };
  node(fmt('map.pallet'), 'town');
  ROUTES.forEach((r, i) => {
    const open = unlocked(c, i);
    const b = button('route.walk', () => open && a.route(i), `route-${r.id}`, `node route ${open ? '' : 'locked'}`);
    b.textContent = '';
    b.disabled = !open;
    const here = routeSpecies(r);
    b.append(el('b'), line('route.dex', { caught: String(here.filter((s) => c.caught[s]).length), total: String(here.length) }, 'small'));
    (b.firstChild as HTMLElement).textContent = `${r.name}${mastered(c, r.id) ? ' ★' : ''}`;
    if (!open) b.append(line('map.locked', undefined, 'small'));
    list.append(b);
    if (i > 0) {
      const gym = node(fmt(`gym.${i}` as StringKey), 'gym');
      gym.append(line('map.gymSoon', undefined, 'small'));
    }
  });
  const top = el('div', 'map-top');
  top.append(line('map.pokedex', { caught: String(caught), total: String(total) }), button('map.dex', a.dex, 'open-dex'), button('map.team', a.team, 'open-team'));
  return screen('map', el('h2', '', 'map.title'), top, list, button('back', a.back, 'back', 'secondary'));
}

export function routeScreen(r: Route, c: Campaign, walk: () => void, back: () => void): HTMLElement {
  const st = c.routes[r.id];
  const played = st?.last.length ?? 0;
  const solved = st?.last.filter(Boolean).length ?? 0;
  const dex = el('div', 'dex-grid');
  for (const s of routeSpecies(r)) {
    const cell = el('div', 'dex-cell');
    cell.append(mon(s, 'dex-sprite', !c.caught[s]), document.createTextNode(c.caught[s] ? SPECIES[s]!.name : fmt('dex.unknown')));
    dex.append(cell);
  }
  const h = el('h2');
  h.textContent = r.name;
  return screen(
    'route',
    h,
    line('route.mastery', { solved: String(solved), played: String(played), need: String(MASTERY_NEED), window: String(MASTERY_WINDOW) }),
    ...(mastered(c, r.id) ? [line('route.mastered')] : []),
    button('route.walk', walk, 'walk-grass', 'primary'),
    dex,
    button('back', back, 'back', 'secondary'),
  );
}

export function dexScreen(c: Campaign, back: () => void): HTMLElement {
  const grid = el('div', 'dex-grid');
  for (const s of allSpecies()) {
    const cell = el('div', 'dex-cell');
    cell.dataset.species = s;
    cell.append(mon(s, 'dex-sprite', !c.caught[s]), document.createTextNode(c.caught[s] ? SPECIES[s]!.name : fmt('dex.unknown')));
    grid.append(cell);
  }
  const caught = allSpecies().filter((s) => c.caught[s]).length;
  return screen('dex', el('h2', '', 'map.dex'), line('map.pokedex', { caught: String(caught), total: String(allSpecies().length) }), grid, button('back', back, 'back', 'secondary'));
}

const ROLE_LABEL: Record<(typeof SKIN_ROLES)[number], StringKey> = { k: 'role.k', q: 'role.q', r: 'role.r', bLight: 'role.bLight', bDark: 'role.bDark', n: 'role.n', p: 'role.p' };
const ROLE_SQUARE: Record<(typeof SKIN_ROLES)[number], [string, 'k' | 'q' | 'r' | 'b' | 'n' | 'p']> = { k: ['e1', 'k'], q: ['d1', 'q'], r: ['a1', 'r'], bLight: ['f1', 'b'], bDark: ['c1', 'b'], n: ['b1', 'n'], p: ['a2', 'p'] };

export function teamScreen(c: Campaign, change: (team: TeamSkin) => void, back: () => void): HTMLElement {
  const rows = el('div', 'settings');
  const team: TeamSkin = { ...c.team };
  const owned = Object.keys(c.caught).filter((s) => c.caught[s] && SPECIES[s]);
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
    for (const s of owned) {
      const o = el('option');
      o.value = s;
      o.textContent = SPECIES[s]!.name;
      sel.append(o);
    }
    sel.value = team[role] ?? '';
    const preview = mon(team[role] || speciesIdFor('w', piece, sq), 'team-sprite');
    sel.onchange = () => {
      if (sel.value) team[role] = sel.value;
      else delete team[role];
      preview.src = spriteUrl(SPECIES[sel.value || speciesIdFor('w', piece, sq)]!.dex);
      change({ ...team });
    };
    r.append(preview, el('span', '', ROLE_LABEL[role]), sel);
    rows.append(r);
  }
  return screen('team', el('h2', '', 'team.title'), el('p', 'small', 'team.note'), rows, button('back', back, 'back', 'secondary'));
}

/** The panel shown over the board after a tall grass solve. */
export function encounterPanel(id: string, throwBall: () => boolean, again: () => void, map: () => void): HTMLElement {
  const p = el('div', 'panel encounter');
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
  p.append(mon(id), msg, row);
  return p;
}
