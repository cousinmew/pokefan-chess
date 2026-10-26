// SPDX-License-Identifier: AGPL-3.0-only
// Kanto Journey screens (§B11, §B12): story boxes, name and starter, the journey map, a route with its trainers,
// trainer intros, the Trainer Card, Training, the 151 Pokédex with candy and stars, My Team, and the encounter panel.
// The map and a route's screen moved to src/ui/journeyMap.ts (W5).
import { ASSET_BASE, CARD_SPRITE_WAIT_MS, CATCH_BEAT_MS, DEX_EAGER_CELLS, DEX_LAZY_MARGIN_PX, LINE_GUARD_MS, STAR_STEPS, TEAM_SWAP_WAIT_MS } from '../config';
import { guard, hold } from './pace';
import { knownSpecies, parseVariant, SKIN_ROLES, SPECIES, speciesIdFor, spriteUrl, variantId, type TeamSkin } from '../board/pieces';
import { DEX, evolutionsOf, evolveCost, familyOf, SOURCES, starsOf, STARTERS, teamBadges, type Campaign, type CatchGains, type Evolution } from '../campaign/kanto';
import { levelNewVars, stepKey, type ShownLevel } from '../campaign/trainer';
import { PLACES, placeName, type Trainer } from '../campaign/journey';
import { partyOf } from '../campaign/rivalTeam';

export { placeName };
import { fmt, type StringKey, type Vars } from '../game/text';
import { button, el, screen } from './dom';
import { whyNot } from '../../worker/src/team';
import { myTrainer, trainerSpriteId } from '../look';
import { listenForWord } from './secret';
import { sound } from '../audio/audio';
import { music } from '../audio/music';

/** A Pokémon sprite that is never an empty box (§B14 bug): the tiny Gen 1 sprite shows while the animated GIF
 * loads (behind a queue of battle preloads on a slow phone), and stays if the GIF fails. `o.still`: the still PNG
 * (about 0.8 KB, no placeholder of its own; a caller's goes once it is in), for small icons (paint lint, 26 Oct);
 * `o.lazy`: no src yet, it waits in data-src for the caller (J8). */
export function mon(id: string, cls = 'menu-sprite', silhouette = false, shiny = false, eager = false, o: { still?: boolean; lazy?: boolean } = {}): HTMLImageElement {
  const img = el('img', cls + (silhouette ? ' silhouette' : ''));
  const dex = SPECIES[id]!.dex;
  const retro = spriteUrl(dex, 'retro');
  img.alt = silhouette ? fmt('dex.unknown') : SPECIES[id]!.name;
  img.dataset.species = id;
  img.decoding = 'async';
  if (eager) img.fetchPriority = 'high';
  if (!o.still) img.style.backgroundImage = `url("${retro}")`;
  img.onload = () => (img.style.backgroundImage = '');
  img.onerror = () => {
    img.onerror = null;
    img.src = retro;
  };
  const src = o.still ? `${ASSET_BASE}static/${shiny ? 'shiny' : 'front'}/${dex}.png` : spriteUrl(dex, 'front', shiny);
  if (o.lazy) {
    img.loading = 'lazy';
    img.dataset.src = src;
  } else img.src = src;
  return img;
}

/** What the "wants to battle!" card shows (J6): the trainer's sprite and the team's animated fronts, to fetch ahead. */
export const battleArt = (c: Campaign, t: Trainer, sprite: string | undefined | null): string[] => [
  ...(sprite ? [trainerSrc(sprite)] : []),
  ...partyOf(c, t).map((s) => spriteUrl(SPECIES[s]!.dex, 'front')),
];

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

/** Gen 1 style text boxes over the screen, one per tap (§B11); a trainer can slide in beside them (§B14). Pacing (§3):
 * the box rises in, each line fades in and ignores taps and keys for LINE_GUARD_MS (then its ▼ shows), and the same
 * trainer stays where it is from one box to the next (it slides in once per modal sequence, src/ui/cards.ts). `ready`
 * (J6): the last line before a battle keeps its ▼ until the battle card's sprites are in, CARD_SPRITE_WAIT_MS at most. */
export function story(host: HTMLElement, texts: string[], done: () => void, sprite?: string, ready?: Promise<unknown>): void {
  const box = el('div', 'panel story');
  host.querySelectorAll<HTMLElement>('.story-trainer').forEach((n) => (!sprite || n.dataset.sprite !== sprite) && n.remove());
  if (sprite && !host.querySelector('.story-trainer')) {
    const s = trainerSprite(sprite, 'trainer-sprite story-trainer slide-in');
    s.dataset.sprite = sprite;
    host.append(s);
  }
  box.dataset.testid = 'story';
  const p = el('p', 'story-text');
  p.dataset.testid = 'story-text';
  const tick = el('span', 'tb-tick', 'story.tap');
  box.append(p, tick);
  let i = 0;
  const show = () => {
    p.textContent = texts[i] ?? '';
    p.classList.remove('line-in');
    void p.offsetWidth; // restart the fade
    p.classList.add('line-in');
    if (!ready || i < texts.length - 1) return guard(box, LINE_GUARD_MS);
    const t0 = performance.now();
    guard(box, CARD_SPRITE_WAIT_MS);
    void ready.then(() => box.isConnected && guard(box, Math.max(0, LINE_GUARD_MS - (performance.now() - t0))));
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

/** Battle intro card (§B14): the trainer slides in, "{CLASS} {NAME} wants to battle!" and their 1 to 3 Pokémon. */
export function trainerIntro(c: Campaign, t: Trainer, sprite: string | undefined | null): HTMLElement {
  const p = el('div', 'panel trainer-intro');
  p.dataset.testid = 'trainer-intro';
  const team = el('div', 'kings');
  for (const s of partyOf(c, t)) team.append(mon(s, 'dex-sprite', false, false, true));
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
    b.onclick = () => {
      // Review (R2): "You received …!" and the unlock card come over this screen, so it shows only the pick from now on
      // (the other choice stayed on offer behind them); one pick, as the buttons go dead.
      for (const x of row.querySelectorAll('button')) {
        x.disabled = true;
        x.hidden = x !== b;
      }
      pick(id);
    };
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

/** Goal card (§B14): the lesson title, a one line goal in kid language, one pip per puzzle. Tap to start. `done`: the
 * pips of a battle left half way this session (J5), e.g. "●●○○○". */
export function goalCard(theme: string, puzzles: number, need: number, extra?: string, done?: string): HTMLElement {
  const p = el('div', 'panel goal-card');
  p.dataset.testid = 'goal-card';
  const title = el('h3');
  title.textContent = fmt(`lesson.${theme}.title` as StringKey);
  const pips = el('p', 'pips');
  pips.textContent = done ?? '○'.repeat(puzzles);
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

/** `level.r` is null until the level settles: it then reads "new (3/10)" (ux #15, playtest 12 Oct). */
export function cardScreen(c: Campaign, level: ShownLevel, back: () => void): HTMLElement {
  const rating = level.r;
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
    rating === null ? line('card.levelNew', levelNewVars(level), 'level') : line('card.level', { level: String(Math.round(rating)) }, 'level'),
    line('card.levelNote', undefined, 'small'),
    line(stepKey(rating ?? 0), undefined, 'small'), // moved here from the puzzle bar (W3)
    el('p', 'small', 'card.badges'),
    badges,
    line('card.dex', { seen: String(seen), caught: String(caught), pct: String(Math.round((caught / 151) * 100)) }),
    line('card.starter', { starter: c.starter ? SPECIES[c.starter]!.name : '-' }),
    line('card.time', { time }),
  );
  return screen('card', el('h2', '', 'card.title'), card, button('back', back, 'back', 'secondary'));
}

/** Training (J10: with the Trainer Level its solves move, as the Trainer Card shows it). */
export function trainingScreen(themes: string[], start: (theme: string) => void, back: () => void, lesson: (theme: string) => void, level?: ShownLevel): HTMLElement {
  const list = el('div', 'buttons');
  for (const t of themes) {
    const row = el('div', 'train-row');
    row.append(button(`theme.${t}` as StringKey, () => start(t), `train-${t}`), button('lesson.again', () => lesson(t), `lesson-${t}`, 'secondary'));
    list.append(row);
  }
  const lv = !level ? [] : [level.r === null ? line('card.levelNew', levelNewVars(level), 'level') : line('card.level', { level: String(Math.round(level.r)) }, 'level')];
  return screen('training', el('h2', '', 'training.title'), ...lv, el('p', 'small', themes.length ? 'training.note' : 'training.none'), list, button('back', back, 'back', 'secondary'));
}

/** The 151 Pokédex: caught in colour, seen as a silhouette with its name, unseen as ???. J8 (Fix, 13 Oct): every cell
 * is a still (about 0.8 KB, not a 32 KB animation; unseen ones grey) and only the opened entry animates; the first
 * DEX_EAGER_CELLS load at high priority and the rest as they scroll near (native lazy loading fetches up to 2500 px
 * ahead, the whole grid on a phone: about 280 requests and 4 MB per open before). */
export function dexScreen(c: Campaign, open: (id: string) => void, back: () => void, stickers = false): HTMLElement {
  const grid = el('div', 'dex-grid');
  for (const [i, s] of DEX.entries()) {
    const caught = !!c.caught[s];
    const seen = caught || c.seen.includes(s);
    const cell = el('button', `dex-cell${caught ? ' caught' : ''}`);
    cell.dataset.species = s;
    cell.dataset.testid = `dex-${s}`;
    const num = el('small');
    num.textContent = `#${String(SPECIES[s]!.dex).padStart(3, '0')}`;
    const stars = starsOf(c, s);
    const name = document.createTextNode(seen ? SPECIES[s]!.name + (c.shiny[s] ? ' ✨' : '') + (stars ? ' ' + '★'.repeat(stars) : '') : fmt('dex.unknown'));
    cell.append(num, mon(s, 'dex-sprite', !caught, (c.shiny[s] ?? 0) > 0, i < DEX_EAGER_CELLS, { still: true, lazy: i >= DEX_EAGER_CELLS }), name);
    cell.disabled = !caught;
    cell.onclick = () => caught && open(s);
    grid.append(cell);
  }
  const caught = DEX.filter((s) => c.caught[s]).length;
  // YELLOW shows the same 151 slots as a sticker book (§B17).
  const view = stickers
    ? screen('dex', el('h2', '', 'stickers.title'), line('stickers.count', { n: String(caught) }), grid, button('back', back, 'back', 'secondary'))
    : screen('dex', el('h2', '', 'dex.title'), line('map.pokedex', { caught: String(caught), total: '151' }), grid, button('back', back, 'back', 'secondary'));
  const later = [...grid.querySelectorAll<HTMLImageElement>('img[data-src]')];
  const load = (img: HTMLImageElement) => {
    img.src = img.dataset.src!;
    delete img.dataset.src;
  };
  if (typeof IntersectionObserver === 'undefined') later.forEach(load);
  else {
    // The grid scrolls in the screen's body, so that is the root: a row below the visible ones starts loading.
    const io = new IntersectionObserver((seen) => seen.forEach((e) => e.isIntersecting && (io.unobserve(e.target), load(e.target as HTMLImageElement))), { root: grid.parentElement, rootMargin: `0px 0px ${DEX_LAZY_MARGIN_PX}px 0px` });
    later.forEach((img) => io.observe(img));
  }
  return view;
}

/** The stills the Pokédex loads first (its first DEX_EAGER_CELLS cells, as dexScreen asks for them): the map fetches
 * them ahead of its POKéDEX tap (paint lint, 26 Oct). */
export const dexStills = (c: Campaign): string[] => DEX.slice(0, DEX_EAGER_CELLS).map((s) => `${ASSET_BASE}static/${(c.shiny[s] ?? 0) > 0 ? 'shiny' : 'front'}/${SPECIES[s]!.dex}.png`);

export interface DexActions {
  evolve(e: Evolution): void;
  oak(): void;
  close(): void;
}

const whereName = (where: string) => {
  const p = PLACES.find((x) => x.id === where || x.route === where);
  return p ? placeName(p) : where === 'evolution' ? fmt('place.caughtEvolution') : where;
};

/** One caught species: candy, evolutions, Oak, stars, shiny, where it was caught and where to find it. `note` (J1): what
 * just happened ("CHARMANDER evolved into CHARMELEON!", OAK's thanks), kept until the entry is closed; `changed`: the
 * numbers it changed, highlighted for a moment. */
export function dexDetail(c: Campaign, id: string, a: DexActions, note?: string, changed: ('count' | 'candy' | 'stars')[] = []): HTMLElement {
  const p = el('div', 'panel dex-detail');
  p.dataset.testid = 'dex-detail';
  const fam = familyOf(id);
  const rows = el('div', 'buttons');
  for (const e of evolutionsOf(id)) {
    const b = button('dex.evolve', () => a.evolve(e), `evolve-${e.to}`, '', { to: SPECIES[e.to]!.name, cost: String(evolveCost(e)) });
    b.disabled = (c.candy[fam] ?? 0) < evolveCost(e);
    rows.append(b);
  }
  if ((c.caught[id] ?? 0) > 1) rows.append(button('dex.oak', a.oak, 'send-oak'));
  rows.append(button('dex.close', a.close, 'dex-close'));
  const stars = starsOf(c, id);
  const src = (SOURCES[id] ?? []).map((s) => fmt(`source.${s.kind}` as StringKey, { from: s.from ? SPECIES[s.from]!.name : '' }));
  const h = el('h3', changed.includes('count') ? 'changed' : '');
  h.textContent = `${SPECIES[id]!.name} x${c.caught[id] ?? 0}`;
  const said = note ? [Object.assign(el('p', 'dex-note'), { textContent: note })] : [];
  p.append(
    h,
    mon(id, 'menu-sprite', false, (c.shiny[id] ?? 0) > 0),
    ...said,
    line('dex.candy', { family: SPECIES[fam]!.name, n: String(c.candy[fam] ?? 0) }, `candy${changed.includes('candy') ? ' changed' : ''}`),
    line('dex.stars', { stars: `${'★'.repeat(stars) || '-'} (${c.oak[id] ?? 0} / ${STAR_STEPS.join(', ')})` }, `small${changed.includes('stars') ? ' changed' : ''}`),
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

/** My Team. `ready` (the Journey's fetch ahead) settles once the given files are in: a changed row keeps its old preview
 * until the new one can paint, at most TEAM_SWAP_WAIT_MS (merge review, 14 Oct: the new pick's box was empty for about
 * 0.6 s on Slow 4G, its placeholder one round trip away). A preview is the form's still (paint lint, 26 Oct: its
 * animation, 10 to 60 KB for a 40 px icon, came in after the screen on Slow 4G). */
export function teamScreen(c: Campaign, change: (team: TeamSkin) => void, back: () => void, clearNotice: () => void, ready?: (urls: string[]) => Promise<unknown>): HTMLElement {
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
    // J9: a new preview element on a change (a src swap kept the old Pokémon's frame until the new one came, about
    // 790 ms on a slow phone).
    const previewOf = (v: string) => {
      const { base, shiny } = parseVariant(knownSpecies(v) ? v : speciesIdFor('w', piece, sq));
      return Object.assign(mon(base, 'team-sprite', false, shiny, false, { still: true }), { alt: '' });
    };
    let preview = previewOf(team[role] ?? '');
    let picks = 0;
    sel.onchange = () => {
      if (sel.value) team[role] = sel.value;
      else delete team[role];
      const next = previewOf(sel.value);
      const pick = ++picks; // a later change of this row replaces this one
      const loaded = new Promise((done) => (next.complete ? done(null) : next.addEventListener('load', done, { once: true })));
      const capped = new Promise((done) => window.setTimeout(done, TEAM_SWAP_WAIT_MS));
      void (ready ? Promise.race([ready([teamStill(sel.value, role)]), loaded, capped]) : Promise.resolve()).then(() => {
        if (pick !== picks) return;
        preview.replaceWith(next);
        preview = next;
      });
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

/** The still a My Team row's preview shows (paint lint, 26 Oct; its Gen 1 placeholder before): the picked form, else
 * that square's default. A species this build does not know (a save from another build) stands for the default piece,
 * as on the board (boot fix, 14 Oct: it threw at boot). */
const teamStill = (id: string | undefined, role: (typeof SKIN_ROLES)[number]): string => {
  const { base, shiny } = parseVariant(knownSpecies(id) ? id : speciesIdFor('w', ROLE_SQUARE[role][1], ROLE_SQUARE[role][0]));
  return `${ASSET_BASE}static/${shiny ? 'shiny' : 'front'}/${SPECIES[base]!.dex}.png`;
};

/** My Team's seven previews (J9), to fetch before the screen shows. */
export const teamArt = (c: Campaign): string[] => SKIN_ROLES.map((role) => teamStill(c.team[role], role));

/** The preview of every other pick a row offers (each form you own, each square's default), fetched once MY TEAM
 * shows, so a changed row's new preview is usually in at once (merge review, 14 Oct). */
export const teamOptionArt = (c: Campaign): string[] => [...new Set([...forms(c).map((f) => teamStill(f.id, 'p')), ...SKIN_ROLES.map((role) => teamStill('', role))])];

/** A gift for a first clear (J4): the Pokémon, the new Pokédex count and OAK's line under it, before the unlock card. */
export function giftCard(id: string, caught: number, oak?: string): HTMLElement {
  const p = el('div', 'panel progress-card gift-card');
  p.dataset.testid = 'gift-card';
  const title = el('b', 'card-title');
  title.textContent = fmt('reward.gift', { name: SPECIES[id]!.name });
  p.append(mon(id, 'menu-sprite', false, false, true), title, line('map.pokedex', { caught: String(caught), total: '151' }, 'small'));
  if (oak) p.append(Object.assign(el('p', 'here'), { textContent: oak }));
  return p;
}

/** The panel shown over the board after a tall grass solve. A shiny shows from the start (§B12). With `next` (the
 * warm-up's first catch, W5) one Continue follows the throw instead of "walk again" and the way back, which names
 * `place` (J11: "Map" went to the route). J3 (Fix, 13 Oct): Throw starts the ball's beat, then the result and what it
 * gave (the candy, and the Pokédex count for a new species or "x2" for one you had), then the buttons. */
export function encounterPanel(id: string, shiny: boolean, throwBall: () => { caught: boolean; gains: CatchGains }, again: () => void, map: () => void, next?: () => void, place?: string): HTMLElement {
  const p = el('div', `panel encounter${shiny ? ' shiny' : ''}`);
  p.dataset.testid = 'encounter';
  const name = SPECIES[id]!.name;
  const msg = line('enc.appeared', { name });
  msg.dataset.testid = 'encounter-text';
  const row = el('div', 'end-buttons');
  const stage = el('div', 'catch-stage');
  stage.append(mon(id, 'menu-sprite', false, shiny));
  const ball = button('enc.throw', () => {
    const { caught, gains: g } = throwBall();
    ball.disabled = true;
    ball.style.visibility = 'hidden'; // gone for the beat, its room kept (the panel does not narrow and widen again)
    void catchBeat(p, stage, caught).then(() => {
      if (!p.isConnected) return;
      if (caught) music.play('victory');
      msg.textContent = fmt(caught ? 'enc.caught' : 'enc.fled', { name });
      const got = !caught ? [] : [line('enc.candy', { n: String(g.candy), name: SPECIES[g.family]!.name }, 'enc-gain'), g.dex === null ? line('enc.dupe', { name, n: String(g.count) }, 'enc-gain') : line('enc.new', { n: String(g.dex) }, 'enc-gain')];
      got.forEach((x) => (x.dataset.testid = 'enc-gains'));
      msg.after(...got);
      const back = button('route.leave', map, 'to-map');
      if (place) back.textContent = fmt('enc.back', { place: place.replace(/ (?=\S+$)/, ' ') }); // "ROUTE 1" on one line
      row.replaceChildren(...(next ? [button('review.continue', next, 'enc-next', 'primary')] : [button('enc.again', again, 'walk-again'), back]));
      guard(p); // the buttons that replace Throw sit under the same finger (pacing R4)
    });
  }, 'throw-ball');
  row.append(ball);
  p.append(stage, ...(shiny ? [line('enc.shiny', undefined, 'shiny-note')] : []), msg, row);
  return p;
}

/** J3: the throw's beat, CATCH_BEAT_MS, a hold (a tap after HOLD_MIN_MS skips it). The ball flies to the Pokémon, which
 * goes into it; the ball wobbles (three times for a catch, twice before it breaks free) and clicks shut, or pops open
 * and the Pokémon comes back out. The CSS draws it (src/style.css, the journey block); under reduced motion the ball
 * fades in and the Pokémon fades out, nothing moves. */
async function catchBeat(p: HTMLElement, stage: HTMLElement, caught: boolean): Promise<void> {
  const ball = el('span', 'catch-ball');
  ball.setAttribute('aria-hidden', 'true');
  stage.append(ball);
  p.style.setProperty('--catch-beat', `${CATCH_BEAT_MS}ms`);
  p.classList.add('throwing', caught ? 'caught' : 'fled');
  // The sounds on the CSS timeline (shares of the beat): a thunk per wobble, then the click shut or the pop.
  const beats: [number, () => void][] = caught ? [[0.3, sound.place], [0.48, sound.place], [0.66, sound.place], [0.88, sound.tick]] : [[0.3, sound.place], [0.48, sound.place], [0.7, sound.blip]];
  const timers = beats.map(([at, f]) => window.setTimeout(() => f.call(sound), at * CATCH_BEAT_MS));
  await hold(CATCH_BEAT_MS, 'reply'); // pace.ts has no 'catch' kind: the beat is the wild Pokémon's answer to the ball
  timers.forEach((t) => window.clearTimeout(t));
  ball.remove();
  p.classList.remove('throwing', 'caught', 'fled');
}

