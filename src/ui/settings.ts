// SPDX-License-Identifier: AGPL-3.0-only
// Settings screen (§4.8): animations, sound and volume, captions, glyphs, auto flip, take back.
import { ANIM_MODES, CARTRIDGE_HOLD_MS, PIECE_STYLES, type DEFAULT_SETTINGS } from '../config';
import { fmt, type Lang } from '../game/text';
import { langPicker, type Cartridge } from './shelf';
import type { StringKey } from '../game/text';
import { button, el, screen } from './dom';

type Settings = typeof DEFAULT_SETTINGS;
type Toggle = 'sound' | 'captions' | 'glyphs' | 'autoFlip' | 'takeBack' | 'animate';

/** Language and cartridge (§B17). Switching cartridge needs a 2 second press and hold, so small children can't by accident. */
export interface CartridgeSettings {
  lang: Lang;
  onLang(l: Lang): void;
  cartridge: Cartridge;
  onSwitch(): void;
}

export function holdButton(label: string, ms: number, done: () => void, testid = 'switch-cartridge'): HTMLButtonElement {
  const b = el('button', 'hold-btn');
  b.type = 'button';
  b.dataset.testid = testid;
  const fill = el('span', 'hold-fill');
  const text = el('span', 'hold-text');
  text.textContent = label;
  b.append(fill, text);
  let timer = 0;
  const start = (e: Event) => {
    e.preventDefault();
    if (timer) return;
    fill.style.transition = `width ${ms}ms linear`;
    fill.style.width = '100%';
    timer = window.setTimeout(() => {
      timer = 0;
      done();
    }, ms);
  };
  const stop = () => {
    window.clearTimeout(timer);
    timer = 0;
    fill.style.transition = 'none';
    fill.style.width = '0';
  };
  b.addEventListener('pointerdown', start);
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointerleave', stop);
  b.addEventListener('pointercancel', stop);
  b.addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start(e));
  b.addEventListener('keyup', stop);
  return b;
}

export function settingsScreen(s: Settings, changed: () => void, back: () => void, cart?: CartridgeSettings, extra?: HTMLElement): HTMLElement {
  const rows = el('div', 'settings');
  const row = (label: StringKey, control: HTMLElement) => {
    const r = el('label', 'setting');
    r.append(el('span', '', label), control);
    rows.append(r);
  };

  const anim = el('select');
  anim.dataset.testid = 'set-anim';
  for (const m of ANIM_MODES) {
    const o = el('option', '', `anim.${m}` as StringKey);
    o.value = m;
    anim.append(o);
  }
  anim.value = s.anim;
  anim.onchange = () => {
    s.anim = anim.value as Settings['anim'];
    changed();
  };
  row('settings.anim', anim);

  const toggle = (key: Toggle, label: StringKey) => {
    const box = el('input');
    box.type = 'checkbox';
    box.checked = s[key];
    box.dataset.testid = `set-${key}`;
    box.onchange = () => {
      s[key] = box.checked;
      changed();
    };
    row(label, box);
  };
  toggle('sound', 'settings.sound');

  const slider = (key: 'volume' | 'music', label: StringKey) => {
    const r = el('input');
    r.type = 'range';
    r.min = '0';
    r.max = '1';
    r.step = '0.1';
    r.value = String(s[key]);
    r.dataset.testid = `set-${key}`;
    r.oninput = () => {
      s[key] = Number(r.value);
      changed();
    };
    row(label, r);
  };
  slider('volume', 'settings.volume');
  slider('music', 'settings.music');

  // Board legibility (§B19): piece style, animated or still sprites, and the Who's who legend.
  const choose = <K extends 'pieceStyle' | 'legend'>(key: K, values: readonly Settings[K][], prefix: string, label: StringKey) => {
    const sel = el('select');
    sel.dataset.testid = `set-${key}`;
    for (const v of values) {
      const o = el('option', '', `${prefix}.${v}` as StringKey);
      o.value = v;
      sel.append(o);
    }
    sel.value = s[key];
    sel.onchange = () => {
      s[key] = sel.value as Settings[K];
      changed();
    };
    row(label, sel);
  };
  choose('pieceStyle', PIECE_STYLES, 'style', 'settings.pieceStyle');
  toggle('animate', 'settings.animate');
  choose('legend', ['auto', 'on', 'off'] as const, 'legend', 'settings.legend');
  toggle('captions', 'settings.captions');
  toggle('glyphs', 'settings.glyphs');
  toggle('autoFlip', 'settings.autoFlip');
  toggle('takeBack', 'settings.takeBack');
  if (cart) {
    const lr = el('div', 'setting lang-setting');
    lr.append(el('span', '', 'settings.lang'), langPicker(cart.lang, cart.onLang));
    rows.prepend(lr);
    const sw = el('div', 'setting cart-setting');
    const now = el('span');
    now.textContent = fmt('settings.cartridgeNow', { name: fmt(`shelf.${cart.cartridge}.name` as StringKey) });
    sw.append(now, holdButton(`${fmt('settings.cartridge')} (${fmt('settings.cartridgeHold')})`, CARTRIDGE_HOLD_MS, cart.onSwitch));
    rows.prepend(sw);
  }
  return screen('settings', el('h2', '', 'title.settings'), rows, ...(extra ? [extra] : []), button('back', back, 'back', 'secondary'));
}
