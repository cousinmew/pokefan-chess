// SPDX-License-Identifier: AGPL-3.0-only
// Splash, title, team select, level select, How to Play and the intro card (Part I §5).
import { AI_LEVELS, INTRO_MS, SPLASH_AUTO_MS, type AiLevel } from '../config';
import { GLYPHS, speciesFor, spriteUrl, type Color, type Role } from '../board/pieces';
import { fmt, type StringKey } from '../game/text';
import { sound } from '../audio/audio';
import { button, el, footer, screen, toast } from './dom';

function sprite(color: Color, role: Role, square: string, cls = 'menu-sprite'): HTMLElement {
  const sp = speciesFor(color, role, square);
  const img = el('img', cls);
  img.src = spriteUrl(sp.dex);
  img.alt = sp.name;
  return img;
}

function heading(): HTMLElement {
  const h = el('div', 'logo');
  h.append(el('h1', '', 'title.name'), el('p', 'sub', 'title.sub'));
  return h;
}

export function splash(onDone: () => void): HTMLElement {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    onDone();
  };
  const s = screen('splash', heading(), el('p', 'credit', 'splash.credit'), el('p', 'hint', 'splash.tap'));
  s.onclick = go;
  const timer = window.setTimeout(go, SPLASH_AUTO_MS);
  return s;
}

export interface TitleActions {
  canContinue: boolean;
  battle(): void;
  resume(): void;
  computer(): void;
  twoPlayers(): void;
  howTo(): void;
  settings(): void;
  online(): void;
  kanto(): void;
}

export function title(a: TitleActions): HTMLElement {
  const kings = el('div', 'kings');
  kings.append(sprite('w', 'k', 'e1'), sprite('b', 'k', 'e8'));
  const list = el('div', 'buttons');
  list.append(button('title.battle', a.battle, 'quick-battle', 'primary'));
  if (a.canContinue) list.append(button('title.continue', a.resume, 'continue'));
  list.append(
    button('title.vsComputer', a.computer, 'vs-computer'),
    button('title.twoPlayers', a.twoPlayers, 'two-players'),
    button('title.online', a.online, 'play-online'),
    button('title.kanto', a.kanto, 'kanto', 'primary'),
    button('title.howTo', a.howTo, 'how-to'),
    button('title.settings', a.settings, 'settings'),
    button('title.share', share, 'share'),
  );
  return screen('title', heading(), kings, list, footer());
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

export function levelSelect(pick: (l: AiLevel) => void, back: () => void): HTMLElement {
  const list = el('div', 'buttons');
  for (const lvl of AI_LEVELS) {
    const b = button(`level.${lvl.id}` as StringKey, () => pick(lvl.id), `level-${lvl.id}`, 'level');
    b.append(el('small', '', `level.${lvl.id}.feel` as StringKey));
    list.append(b);
  }
  return screen('level', el('h2', '', 'level.pick'), list, button('back', back, 'back', 'secondary'));
}

export function howTo(back: () => void): HTMLElement {
  const legend = el('div', 'legend');
  const rows: [Role, StringKey, string, string][] = [
    ['k', 'role.k', 'e1', 'e8'],
    ['q', 'role.q', 'd1', 'd8'],
    ['r', 'role.r', 'a1', 'a8'],
    ['b', 'role.bLight', 'f1', 'c8'],
    ['b', 'role.bDark', 'c1', 'f8'],
    ['n', 'role.n', 'b1', 'b8'],
    ['p', 'role.p', 'a2', 'a7'],
  ];
  for (const [role, label, w, b] of rows) {
    const row = el('div', 'legend-row');
    const name = el('span', 'role');
    name.textContent = `${GLYPHS.w[role]} ${fmt(label)}`;
    row.append(sprite('w', role, w, 'legend-sprite'), name, sprite('b', role, b, 'legend-sprite'));
    legend.append(row);
  }
  const teams = el('div', 'legend-row legend-head');
  teams.append(el('b', '', 'team.red'), el('span'), el('b', '', 'team.rocket'));
  return screen('howto', el('h2', '', 'title.howTo'), el('p', 'rules', 'howto.rules'), el('h3', '', 'howto.legend'), teams, legend, button('back', back, 'back', 'secondary'), footer());
}

/** "X wants to battle!" for INTRO_MS, tap to skip. */
export function intro(key: StringKey, opponent: Color, onDone: () => void): HTMLElement {
  let done = false;
  const card = el('div', 'intro');
  card.dataset.testid = 'intro';
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    card.remove();
    onDone();
  };
  const inner = el('div', 'panel');
  inner.append(sprite(opponent, 'k', opponent === 'w' ? 'e1' : 'e8'), el('p', '', key));
  card.append(inner);
  card.onclick = finish;
  const timer = window.setTimeout(finish, INTRO_MS);
  sound.sparkle();
  return card;
}
