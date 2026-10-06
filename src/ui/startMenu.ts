// SPDX-License-Identifier: AGPL-3.0-only
// The start menu (change C), in the style of the Gen 1 games but drawn with our own CSS: double line pixel boxes
// with rivet corners, a ▶ cursor and big text. Arrow keys move the cursor, Enter or a tap selects.
import { fmt, type StringKey } from '../game/text';
import { el, screen } from './dom';
import { mon, trainerSprite } from './kanto';
import type { SlotSummary } from './profiles';

export interface MenuItem {
  id: 'continue' | 'new' | 'play' | 'option' | 'switch';
  run(): void;
}

/** A Gen 1 style summary box for one save: player, cartridge, badges, Pokédex and time. */
export function summaryBox(s: SlotSummary, testid = 'start-summary'): HTMLElement {
  const box = el('div', 'gb-box summary');
  box.dataset.testid = testid;
  const sprite = s.cart === 'yellow' && s.trainer !== 'meir' ? mon('pikachu', 'summary-sprite', false, false, true) : trainerSprite(s.trainer, 'trainer-sprite summary-sprite');
  const rows = el('dl', 'summary-rows');
  const row = (key: StringKey, value: string, id: string) => {
    const dt = el('dt', '', key);
    const dd = el('dd');
    dd.textContent = value;
    dd.dataset.testid = `${testid}-${id}`;
    rows.append(dt, dd);
  };
  row('start.player', s.name, 'name');
  row('start.cart', s.cart ? fmt(`shelf.${s.cart}.name` as StringKey) : '-', 'cart');
  row('start.badges', String(s.badges), 'badges');
  row('start.dex', String(s.dex), 'dex');
  row('start.time', s.time, 'time');
  box.append(sprite, rows);
  return box;
}

export function startMenu(items: MenuItem[], summary: HTMLElement | null): HTMLElement {
  const list = el('div', 'gb-box start-list');
  list.setAttribute('role', 'menu');
  let at = 0;
  const buttons = items.map((it, i) => {
    const b = el('button', 'start-item');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.dataset.testid = `start-${it.id}`;
    const cursor = el('span', 'start-cursor');
    cursor.textContent = '▶';
    cursor.setAttribute('aria-hidden', 'true');
    b.append(cursor, el('span', '', `start.${it.id}` as StringKey));
    b.onclick = it.run;
    b.onfocus = () => move(i);
    b.onpointerenter = () => move(i);
    list.append(b);
    return b;
  });
  const move = (i: number) => {
    at = (i + buttons.length) % buttons.length;
    buttons.forEach((b, j) => b.classList.toggle('on', j === at));
  };
  move(0);
  const view = screen('start', list, ...(summary ? [summary] : []));
  const onKey = (e: KeyboardEvent) => {
    if (!view.isConnected) return window.removeEventListener('keydown', onKey);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(at + (e.key === 'ArrowDown' ? 1 : -1));
      buttons[at]?.focus();
    } else if (e.key === 'Enter' && document.activeElement?.closest('.start-list') === null) items[at]?.run();
  };
  window.addEventListener('keydown', onKey);
  window.setTimeout(() => buttons[0]?.focus(), 0);
  return view;
}
