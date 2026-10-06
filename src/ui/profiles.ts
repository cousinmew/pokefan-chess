// SPDX-License-Identifier: AGPL-3.0-only
// Save slots (§B18 item 2): up to 4 players per device, each with its own trainer, cartridge, language and progress.
// Delete needs a 2 second press and hold, then a confirm, so small children can't wipe a save by accident.
import { CARTRIDGE_HOLD_MS } from '../config';
import { fmt, type StringKey } from '../game/text';
import { MAX_SLOTS } from '../store/persist';
import { button, el, screen } from './dom';
import { mon, trainerSprite } from './kanto';
import { holdButton } from './settings';

export interface SlotSummary {
  n: number;
  name: string;
  cart: 'yellow' | 'blue' | null;
  /** The player's trainer sprite id (RED, or MEIR). */
  trainer: string;
  lang: string;
  badges: number;
  dex: number;
  /** Play time, h:mm. */
  time: string;
}

export interface ProfileActions {
  pick(n: number): void;
  add(): void;
  rename(n: number, name: string): void;
  remove(n: number): void;
  /** Redraws the screen (Keep after a delete hold). */
  refresh(): void;
  back?: () => void;
}

function nameRow(done: (name: string) => void): HTMLElement {
  const row = el('div', 'buttons profile-names');
  for (let i = 1; i <= 6; i++) row.append(button(`name.${i}` as StringKey, () => done(fmt(`name.${i}` as StringKey)), `rename-${i}`));
  return row;
}

function slotCard(s: SlotSummary, current: boolean, a: ProfileActions): HTMLElement {
  const card = el('div', `profile-slot${current ? ' current' : ''}${s.cart ? ` cart-${s.cart}` : ''}`);
  card.dataset.testid = `slot-${s.n}`;
  const pick = el('button', 'profile-pick');
  pick.type = 'button';
  pick.dataset.testid = `slot-pick-${s.n}`;
  const info = el('span', 'profile-info');
  const name = el('b');
  name.textContent = s.name;
  const sub = el('small');
  sub.textContent = [s.cart ? fmt(`shelf.${s.cart}.name` as StringKey) : '', s.lang.toUpperCase(), fmt('profiles.badges', { n: String(s.badges) }), fmt('profiles.dex', { n: String(s.dex) }), s.time].filter(Boolean).join(' · ');
  info.append(name, sub);
  pick.append(s.cart === 'yellow' ? mon('pikachu', 'profile-sprite', false, false, true) : trainerSprite(s.trainer, 'trainer-sprite profile-sprite'), info);
  pick.onclick = () => a.pick(s.n);
  const tools = el('div', 'profile-tools');
  const rename = button('profiles.rename', () => tools.replaceChildren(nameRow((nm) => a.rename(s.n, nm))), `slot-rename-${s.n}`, 'secondary');
  const del = holdButton(fmt('profiles.delete'), CARTRIDGE_HOLD_MS, () => {
    const q = el('p', 'profile-confirm');
    q.textContent = fmt('profiles.confirm', { name: s.name });
    tools.replaceChildren(q, button('profiles.yes', () => a.remove(s.n), `slot-delete-yes-${s.n}`, 'danger'), button('profiles.no', a.refresh, `slot-delete-no-${s.n}`, 'secondary'));
  }, `slot-delete-${s.n}`);
  tools.append(rename, del);
  card.append(pick, tools);
  return card;
}

export function profileScreen(slots: SlotSummary[], current: number, a: ProfileActions): HTMLElement {
  const list = el('div', 'profile-list');
  for (const s of slots) list.append(slotCard(s, s.n === current, a));
  const kids: Node[] = [el('h2', '', 'profiles.title'), list];
  if (slots.length < MAX_SLOTS) kids.push(button('profiles.new', a.add, 'slot-new'));
  if (a.back) kids.push(button('back', a.back, 'back', 'secondary'));
  return screen('profiles', ...kids);
}
