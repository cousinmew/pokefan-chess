// SPDX-License-Identifier: AGPL-3.0-only
// The cartridge shelf and YELLOW's screens (§B17): two original cartridge drawings (no Nintendo cartridge art),
// a language picker in each language's own name, the three tile YELLOW home, Pikachu's Path and the sticker reward.
import { LESSON_COUNT } from '../campaign/path';
import { LANGS, fmt, type Lang, type StringKey } from '../game/text';
import { button, el, screen } from './dom';
import { pixelIcon } from './icons';
import { mon } from './kanto';

export type Cartridge = 'yellow' | 'blue';

function cartridge(kind: Cartridge, pick: () => void): HTMLElement {
  const b = el('button', `cartridge ${kind}`);
  b.type = 'button';
  b.dataset.testid = `cart-${kind}`;
  const label = el('span', 'cart-label');
  label.append(el('b', '', `shelf.${kind}.name` as StringKey), el('small', '', `shelf.${kind}.sub` as StringKey));
  b.append(el('span', 'cart-notch'), label, el('span', 'cart-pins'));
  b.onclick = pick;
  return b;
}

export function langPicker(current: Lang, pick: (l: Lang) => void): HTMLElement {
  const row = el('div', 'lang-row');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', fmt('shelf.lang'));
  for (const l of LANGS) {
    const b = button(`lang.${l}` as StringKey, () => pick(l), `lang-${l}`, `lang-btn${l === current ? ' on' : ''}`);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(l === current));
    b.lang = l;
    row.append(b);
  }
  return row;
}

export function shelfScreen(current: Lang, pick: (c: Cartridge) => void, lang: (l: Lang) => void): HTMLElement {
  const row = el('div', 'shelf');
  row.append(cartridge('yellow', () => pick('yellow')), cartridge('blue', () => pick('blue')));
  return screen('shelf', el('h2', '', 'shelf.title'), row, el('h3', '', 'shelf.lang'), langPicker(current, lang));
}

export interface YellowActions {
  play(): void;
  learn(): void;
  friend(): void;
  settings(): void;
}

/** YELLOW home: three huge tiles and a small gear. No Online, Training, My Team or Trainer Card. */
export function yellowHome(a: YellowActions): HTMLElement {
  const tile = (id: 'play' | 'learn' | 'friend', icon: string, fn: () => void) => {
    const t = el('button', `big-tile big-${id}`);
    t.type = 'button';
    t.dataset.testid = `yellow-${id}`;
    t.append(mon(icon, 'big-mon', false, false, true), el('b', '', `yellow.${id}` as StringKey), el('span', '', `yellow.${id}.sub` as StringKey));
    t.onclick = fn;
    return t;
  };
  const gear = el('button', 'yellow-gear');
  gear.type = 'button';
  gear.dataset.testid = 'settings';
  gear.setAttribute('aria-label', fmt('title.settings'));
  gear.append(pixelIcon('gear', 'gear-icon'));
  gear.onclick = a.settings;
  return screen('yellow', gear, tile('play', 'pikachu', a.play), tile('learn', 'eevee', a.learn), tile('friend', 'snorlax', a.friend));
}

export interface PathActions {
  lesson(n: number): void;
  stickers(): void;
  back(): void;
}

export function pathScreen(done: number, a: PathActions): HTMLElement {
  const list = el('div', 'path-list');
  for (let n = 1; n <= LESSON_COUNT; n++) {
    const open = n <= done + 1;
    const b = el('button', `path-step${n <= done ? ' done' : ''}${open ? '' : ' locked'}`);
    b.type = 'button';
    b.dataset.testid = `lesson-${n}`;
    b.disabled = !open;
    const num = el('span', 'path-num');
    num.textContent = n <= done ? '★' : String(n);
    b.append(num, el('b', '', `path.lesson.${n}` as StringKey));
    b.onclick = () => open && a.lesson(n);
    list.append(b);
  }
  return screen('path', el('h2', '', 'path.title'), list, button('path.stickers', a.stickers, 'open-stickers', 'primary'), button('back', a.back, 'back', 'secondary'));
}

/** The reward after a lesson: one guaranteed sticker. */
export function stickerPanel(id: string, name: string, ok: () => void): HTMLElement {
  const p = el('div', 'panel sticker');
  p.dataset.testid = 'sticker';
  const t = el('p');
  t.textContent = fmt('path.sticker', { name });
  p.append(el('p', '', 'path.done'), mon(id, 'menu-sprite', false, false, true), t, button('lesson.ok', ok, 'sticker-ok', 'primary'));
  return p;
}
