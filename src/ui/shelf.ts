// SPDX-License-Identifier: AGPL-3.0-only
// The cartridge shelf and YELLOW's screens (§B17): two original cartridge drawings (no Nintendo cartridge art),
// a language picker in each language's own name, the three tile YELLOW home, Pikachu's Path and the sticker reward.
import { LESSON_COUNT } from '../campaign/path';
import { LANGS, fmt, type Lang, type StringKey } from '../game/text';
import { button, el, screen } from './dom';
import { pixelIcon } from './icons';
import { codeReader, dpad, listenForCode } from './secret';
import { mon } from './kanto';

export type Cartridge = 'yellow' | 'blue';

/** Three taps on the YELLOW label within this window open the secret D-pad instead of picking (§B18 item 7). */
const LABEL_TAPS = 3;
const LABEL_TAP_MS = 400;

function cartridge(kind: Cartridge, pick: () => void, secret?: () => void): HTMLElement {
  const b = el('button', `cartridge ${kind}`);
  b.type = 'button';
  b.dataset.testid = `cart-${kind}`;
  const label = el('span', 'cart-label');
  label.append(el('b', '', `shelf.${kind}.name` as StringKey), el('small', '', `shelf.${kind}.sub` as StringKey));
  b.append(el('span', 'cart-notch'), label, el('span', 'cart-pins'));
  let taps = 0;
  let timer = 0;
  b.onclick = (e) => {
    if (!secret || !label.contains(e.target as Node)) return pick();
    // A tap on the label waits a moment for more taps; one or two taps still pick the cartridge.
    taps++;
    window.clearTimeout(timer);
    if (taps >= LABEL_TAPS) {
      taps = 0;
      return secret();
    }
    timer = window.setTimeout(() => ((taps = 0), pick()), LABEL_TAP_MS);
  };
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

/** The always visible language button (§B18 item 3): the current code, one tap from the four languages.
 * With `picker` (the shelf already shows one) the tap moves to that picker instead of opening a second. */
export function langButton(current: Lang, pick: (l: Lang) => void, picker?: HTMLElement): HTMLElement {
  const wrap = el('div', 'lang-top');
  const b = el('button', 'lang-code');
  b.type = 'button';
  b.dataset.testid = 'lang-button';
  b.textContent = current.split('-')[0]!.toUpperCase(); // zh-Hans shows ZH
  b.setAttribute('aria-label', `${fmt('shelf.lang')}: ${fmt(`lang.${current}` as StringKey)}`);
  b.setAttribute('aria-expanded', 'false');
  if (picker) {
    b.onclick = () => (picker.querySelector<HTMLElement>('.on') ?? picker).focus();
    wrap.append(b);
    return wrap;
  }
  const pop = langPicker(current, pick);
  pop.classList.add('lang-pop');
  pop.hidden = true;
  b.onclick = () => {
    pop.hidden = !pop.hidden;
    b.setAttribute('aria-expanded', String(!pop.hidden));
  };
  wrap.append(b, pop);
  return wrap;
}

export function shelfScreen(current: Lang, pick: (c: Cartridge) => void, lang: (l: Lang) => void, unlock: () => void): HTMLElement {
  const row = el('div', 'shelf');
  const read = codeReader();
  const view = screen('shelf');
  const openPad = () => view.querySelector('.dpad') ?? row.after(dpad(read, unlock));
  row.append(cartridge('yellow', () => pick('yellow'), openPad), cartridge('blue', () => pick('blue')));
  const picker = langPicker(current, lang);
  view.append(langButton(current, lang, picker), el('h2', '', 'shelf.title'), row, el('h3', '', 'shelf.lang'), picker);
  listenForCode(view, unlock, read);
  return view;
}

/** YELLOW's Play tile opens this (§B18 item 4): the four levels as big buttons with 1 to 4 stars, Youngster first. */
export function yellowLevels(pick: (level: 1 | 2 | 3 | 4) => void, back: () => void): HTMLElement {
  const list = el('div', 'yellow-levels');
  for (const n of [1, 2, 3, 4] as const) {
    const b = el('button', `big-level${n === 1 ? ' default' : ''}`);
    b.type = 'button';
    b.dataset.testid = `yellow-level-${n}`;
    const stars = el('span', 'stars');
    stars.textContent = '★'.repeat(n);
    stars.setAttribute('aria-hidden', 'true');
    b.append(el('b', '', `yellow.level.${n}` as StringKey), stars);
    b.setAttribute('aria-label', `${fmt(`yellow.level.${n}` as StringKey)}, ${fmt('yellow.stars', { n: String(n) })}`);
    b.onclick = () => pick(n);
    list.append(b);
  }
  const view = screen('yellow-levels', el('h2', '', 'yellow.levels'), list, button('back', back, 'back', 'secondary'));
  window.setTimeout(() => (list.firstElementChild as HTMLElement | null)?.focus(), 0);
  return view;
}

export interface YellowActions {
  lang: HTMLElement;
  play(): void;
  /** The secret code unlocks MEIR here too (keyboard). */
  unlock(): void;
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
  const top = el('div', 'yellow-top');
  top.append(a.lang, gear);
  const view = screen('yellow', top, tile('play', 'pikachu', a.play), tile('learn', 'eevee', a.learn), tile('friend', 'snorlax', a.friend));
  listenForCode(view, a.unlock);
  return view;
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
