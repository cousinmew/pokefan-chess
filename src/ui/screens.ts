// SPDX-License-Identifier: AGPL-3.0-only
// Splash, title, team select, level select, How to Play and the intro card (Part I §5).
import { AI_LEVELS, SPLASH_AUTO_MS, type AiLevel } from '../config';
import { hold } from './pace';
import { faceoff, opponentTag } from './ladder';
import type { Side } from '../look';
import { parseVariant, SKIN_ROLES, species, speciesFor, speciesIdFor, spriteUrl, type Color, type Role, type TeamSkin } from '../board/pieces';
import { fmt, type StringKey } from '../game/text';
import { sound } from '../audio/audio';
import { button, el, footer, screen, toast } from './dom';
import { manualScreen, type Page } from './manual';
import { mon, trainerSprite, trainerSrc } from './kanto';
import { levelNewVars, type ShownLevel } from '../campaign/trainer';
import { itemIcon, pixelIcon, type PixelIcon } from './icons';
import { decodedSrc, decodeImage, onDecoded, stillUrl } from '../battle/sprites';

export const INTRO_SPRITE_WAIT_MS = 400; // the intro card stays clear at most this long for its Pokémon to decode, then pops
/** A Poké Ball outline drawn under a menu sprite's retro stand-in: its box is never empty while both load. */
const WAITING = 'radial-gradient(circle, transparent 0 9%, rgba(128, 128, 128, 0.45) 9% 13%, transparent 13% 31%, rgba(128, 128, 128, 0.45) 31% 35%, transparent 35%)';

/** A menu Pokémon (team picker, intro card) that is never an empty box (loading fix, 13 Oct): kanto.ts mon(), whose
 * retro sprite stands in while the animated one loads, over a drawn outline while the retro one loads too. */
function sprite(color: Color, role: Role, square: string, cls = 'menu-sprite'): HTMLImageElement {
  const { base, shiny } = parseVariant(speciesIdFor(color, role, square));
  const img = mon(base, cls, false, shiny, true);
  img.style.backgroundImage = [img.style.backgroundImage, WAITING].filter(Boolean).join(', ');
  return img;
}

function heading(): HTMLElement {
  const h = el('div', 'logo');
  h.append(el('h1', '', 'title.name'), el('p', 'sub', 'title.sub'));
  return h;
}

/** The title: moves on by itself after SPLASH_AUTO_MS, or on a tap, Enter, Space or B once HOLD_MIN_MS has passed
 * (a hold, pacing E1), so the tap that loaded the page never skips it. */
export function splash(onDone: () => void): HTMLElement {
  const s = screen('splash', heading(), el('p', 'credit', 'splash.credit'), el('p', 'hint', 'splash.tap'));
  // Started once the splash is on screen (the hold belongs to the screen showing then).
  queueMicrotask(() => void hold(SPLASH_AUTO_MS, 'splash').then((how) => how !== 'cancel' && s.isConnected && onDone()));
  return s;
}

export type HubTile = 'journey' | 'training' | 'battle' | 'computer' | 'two' | 'online' | 'dex' | 'team' | 'card' | 'settings' | 'share';

/** What the hub shows about you: the Continue target, the mini Trainer Card and each tile's progress chip. */
export interface HubData {
  continueText: string | null;
  /** `level` is null before the first puzzle (shown as "new"). */
  card: { name: string; level: ShownLevel; badges: string[] };
  chips: Partial<Record<HubTile, string>>;
  /** A tile subtitle in place of its usual one (the Battle tile on a brand-new save). */
  subs?: Partial<Record<HubTile, StringKey>>;
}

// Tile icons (§B16 addendum): item sprites where PokeAPI has one, original pixel art otherwise. No mascots.
const ICONS: Record<HubTile, { item: string } | { pixel: PixelIcon }> = {
  journey: { item: 'town-map' }, training: { item: 'teachy-tv' }, battle: { item: 'poke-ball' }, computer: { item: 'vs-seeker' },
  two: { pixel: 'two-balls' }, online: { pixel: 'link-cable' }, dex: { pixel: 'dex' }, team: { pixel: 'six-balls' },
  card: { item: 'card-key' }, settings: { pixel: 'gear' }, share: { item: 'oaks-parcel' },
};

export interface TitleActions {
  canContinue: boolean;
  battle(): void;
  resume(): void;
  computer(): void;
  twoPlayers(): void;
  howTo(page?: Page): void;
  settings(): void;
  online(): void;
  kanto(): void;
  training(): void;
  dex(): void;
  team(): void;
  card(): void;
  /** The hub's data; absent in old callers, then the tiles show no chips. */
  hub?: HubData;
}

// Which manual page a tile's "?" opens (§B16): every mode tile, plus Pokédex and My Team.
const HELP: Partial<Record<HubTile, Page>> = { journey: 'journey', training: 'training', battle: 'battle', computer: 'computer', two: 'two', online: 'online', dex: 'catching', team: 'pieces' };
const TESTID: Record<HubTile, string> = { journey: 'kanto', training: 'training', battle: 'quick-battle', computer: 'vs-computer', two: 'two-players', online: 'play-online', dex: 'hub-dex', team: 'hub-team', card: 'hub-card', settings: 'settings', share: 'share' };

/** The home hub (§B16): three zones of chunky tiles, each with a mascot, a subtitle that is always visible,
 * a progress chip and a "?" that opens its manual page. One column on phones, three on desktops. */
export function title(a: TitleActions): HTMLElement {
  const data = a.hub;
  const act: Record<HubTile, () => void> = {
    journey: a.kanto, training: a.training, battle: a.battle, computer: a.computer, two: a.twoPlayers, online: a.online,
    dex: a.dex, team: a.team, card: a.card, settings: a.settings, share: () => void share(),
  };
  const tile = (id: HubTile) => {
    const wrap = el('div', 'tile-wrap');
    const t = el('button', `tile tile-${id}`);
    t.type = 'button';
    t.dataset.testid = TESTID[id];
    const pic = el('span', 'tile-pic');
    const icon = ICONS[id];
    pic.append('item' in icon ? itemIcon(icon.item) : pixelIcon(icon.pixel));
    const txt = el('span', 'tile-text');
    const h = el('span', 'tile-title', `hub.${id}.title` as StringKey);
    const sub = el('span', 'tile-sub', data?.subs?.[id] ?? (`hub.${id}.sub` as StringKey));
    txt.append(h, sub);
    const chip = data?.chips[id];
    if (chip) {
      const c = el('span', 'tile-chip');
      c.textContent = chip;
      txt.append(c);
    }
    const tip = el('span', 'tile-tip', `hub.${id}.tip` as StringKey);
    tip.setAttribute('aria-hidden', 'true');
    t.append(pic, txt, tip);
    t.onclick = () => {
      sound.blip();
      act[id]();
    };
    wrap.append(t);
    const page = HELP[id];
    if (page) {
      const q = el('button', 'tile-help');
      q.type = 'button';
      q.append(itemIcon('tm-normal', 'help-icon'));
      q.dataset.testid = `help-${id}`;
      q.setAttribute('aria-label', fmt('hub.help', { mode: fmt(`hub.${id}.title` as StringKey) }));
      q.onclick = () => a.howTo(page);
      wrap.append(q);
    }
    return wrap;
  };
  const zone = (name: StringKey, ids: HubTile[], oak = false) => {
    const z = el('section', 'hub-zone');
    const h = el('h2', 'zone-title', name);
    // Professor Oak appears once, static, in the Journey header (§B16 addendum).
    if (oak) h.append(trainerSprite('oak', 'trainer-sprite zone-oak'));
    z.append(h, ...ids.map(tile));
    return z;
  };
  const top = el('div', 'hub-top');
  if (a.canContinue && data?.continueText) {
    const c = el('button', 'hub-continue');
    c.dataset.testid = 'continue';
    c.append(el('b', '', 'hub.continue'), el('span'));
    (c.lastChild as HTMLElement).textContent = data.continueText;
    c.onclick = () => {
      sound.blip();
      a.resume();
    };
    top.append(c);
  }
  if (data) {
    const mini = el('button', 'hub-card');
    mini.dataset.testid = 'hub-card-mini';
    const name = el('b');
    name.textContent = data.card.name;
    const lvl = el('span');
    const level = data.card.level;
    lvl.textContent = level.r === null ? fmt('hub.card.miniLevelNew', levelNewVars(level)) : fmt('hub.card.miniLevel', { level: String(Math.round(level.r)) });
    const dots = el('span', 'badges');
    for (const b of ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']) dots.append(el('span', `badge ${data.card.badges.includes(b) ? `won ${b}` : 'empty'}`));
    mini.append(name, lvl, dots);
    mini.onclick = a.card;
    top.append(mini);
  }
  const manual = button('hub.manual', () => a.howTo(), 'how-to', 'hub-manual');
  manual.prepend(itemIcon('tm-normal', 'help-icon'));
  top.append(manual);
  const zones = el('div', 'hub-zones');
  zones.append(
    zone('hub.zone.journey', ['journey', 'training'], true),
    zone('hub.zone.battle', ['battle', 'computer', 'two', 'online']),
    zone('hub.zone.trainer', ['dex', 'team', 'card', 'settings', 'share']),
  );
  return screen('title', heading(), top, zones, footer());
}

async function share(): Promise<void> {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ url, title: fmt('title.name') });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('toast.copied');
  } catch (err) {
    // The person closed the share sheet: nothing to do. Anything else falls back to the clipboard.
    if (err instanceof DOMException && err.name === 'AbortError') return;
    await navigator.clipboard?.writeText(url).then(() => toast('toast.copied'), (e: unknown) => console.warn('share failed:', e));
  }
}

export function teamSelect(pick: (c: Color) => void, back: () => void): HTMLElement {
  const row = el('div', 'cards');
  for (const [color, name, note] of [['w', 'team.red', 'team.redNote'], ['b', 'team.rocket', 'team.rocketNote']] as [Color, StringKey, StringKey][]) {
    const card = button(name, () => pick(color), `team-${color === 'w' ? 'red' : 'rocket'}`, 'card');
    card.prepend(sprite(color, 'k', color === 'w' ? 'e1' : 'e8'));
    card.append(el('small', '', note));
    row.append(card);
  }
  return screen('team', el('h2', '', 'team.pick'), row, button('back', back, 'back', 'secondary'));
}

/** Who stands at each level, and you (§B20 item 1). */
export interface Faces {
  me: Side;
  them(level: AiLevel): Side;
}

export function levelSelect(pick: (l: AiLevel) => void, back: () => void, faces?: Faces): HTMLElement {
  const list = el('div', 'buttons');
  let view: HTMLElement | null = null;
  for (const lvl of AI_LEVELS) {
    const b = button(`level.${lvl.id}` as StringKey, () => (leaving(view, faces?.them(lvl.id), faces?.me), pick(lvl.id)), `level-${lvl.id}`, 'level');
    b.append(el('small', '', `level.${lvl.id}.feel` as StringKey));
    if (faces) b.append(opponentTag(faces.them(lvl.id), lvl.id));
    list.append(b);
  }
  view = screen('level', el('h2', '', 'level.pick'), faces ? faceoff(faces.me, list) : list, button('back', back, 'back', 'secondary'));
  return view;
}

/** A level is chosen (loading fix, 13 Oct): the picker's loads still going stop (the bars close over them), so the
 * board gets the connections, and the chosen trainer's board starts loading while the bars close: its stills, then
 * its animated fronts at low priority, behind the board's own pieces. */
function leaving(view: HTMLElement | null, them: Side | undefined, me: Side | undefined): void {
  // The two trainers stay decoded for the plates (a new <img> would ask the server again).
  for (const side of [them, me]) if (side) void decodeImage(trainerSrc(side.sprite));
  const team: TeamSkin | null | undefined = them?.team;
  for (const img of view?.querySelectorAll('img') ?? []) {
    if (img.complete) continue;
    img.onerror = null;
    img.style.backgroundImage = '';
    img.removeAttribute('src');
  }
  const mons = SKIN_ROLES.map((key) => team?.[key]).filter((id): id is string => !!id).map((id) => species(id));
  void Promise.all(mons.map((s) => decodeImage(stillUrl(s.dex, s.shiny), 'high'))).then(() => mons.forEach((s) => void decodeImage(spriteUrl(s.dex, 'front', s.shiny), 'low')));
}

/** How to Play is now the manual (§B16), open on `page`. */
export function howTo(back: () => void, page: Page = 'journey', tryIt: (p: Page) => void = () => undefined): HTMLElement {
  return manualScreen(page, tryIt, back, footer());
}

/** "X wants to battle!": the game holds it INTRO_MS (a hold, skippable after HOLD_MIN_MS, pacing C3). */
export function intro(key: StringKey, opponent: Color): HTMLElement {
  const card = el('div', 'intro');
  card.dataset.testid = 'intro';
  const inner = el('div', 'panel');
  const square = opponent === 'w' ? 'e1' : 'e8';
  const img = sprite(opponent, 'k', square);
  // Drawn the moment the card goes in (loading fix, 13 Oct): the animated king once it has decoded, else the still
  // the board already shows (the animated one replaces it when it decodes). With neither, the card stays clear until
  // its sprite decodes, at most INTRO_SPRITE_WAIT_MS, then pops.
  const sp = speciesFor(opponent, 'k', square);
  const front = spriteUrl(sp.dex, 'front', sp.shiny);
  const now = decodedSrc(front) ?? decodedSrc(stillUrl(sp.dex, sp.shiny));
  if (now) img.src = now;
  if (!decodedSrc(front)) onDecoded(front, (src) => (img.src = src));
  if (!img.complete) {
    card.classList.add('intro-wait');
    let cap = 0;
    const pop = () => (window.clearTimeout(cap), card.classList.remove('intro-wait'));
    cap = window.setTimeout(pop, INTRO_SPRITE_WAIT_MS);
    img.decode().then(pop, pop);
  }
  inner.append(img, el('p', '', key));
  card.append(inner);
  sound.sparkle();
  return card;
}
