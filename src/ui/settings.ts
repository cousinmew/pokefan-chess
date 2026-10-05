// SPDX-License-Identifier: AGPL-3.0-only
// Settings screen (§4.8): animations, sound and volume, captions, glyphs, auto flip, take back.
import { ANIM_MODES, type DEFAULT_SETTINGS } from '../config';
import type { StringKey } from '../game/text';
import { button, el, screen } from './dom';

type Settings = typeof DEFAULT_SETTINGS;
type Toggle = 'sound' | 'captions' | 'glyphs' | 'autoFlip' | 'takeBack';

export function settingsScreen(s: Settings, changed: () => void, back: () => void): HTMLElement {
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

  const vol = el('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.1';
  vol.value = String(s.volume);
  vol.dataset.testid = 'set-volume';
  vol.oninput = () => {
    s.volume = Number(vol.value);
    changed();
  };
  row('settings.volume', vol);

  toggle('captions', 'settings.captions');
  toggle('glyphs', 'settings.glyphs');
  toggle('autoFlip', 'settings.autoFlip');
  toggle('takeBack', 'settings.takeBack');
  return screen('settings', el('h2', '', 'title.settings'), rows, button('back', back, 'back', 'secondary'));
}
