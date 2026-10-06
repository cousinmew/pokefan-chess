// SPDX-License-Identifier: AGPL-3.0-only
// The game's two modal panels: the promotion picker and the end screen (moved out of main.ts).
import { GLYPHS, speciesFor, spriteUrl, type Color, type Role } from '../board/pieces';
import { fmt, type Line } from '../game/text';
import { button, el } from './dom';

export function promotionPanel(color: Color, to: string, pick: (role: Role) => void, cancel: () => void): HTMLElement {
  const panel = el('div', 'panel promo');
  panel.setAttribute('role', 'dialog');
  panel.dataset.testid = 'promotion';
  const row = el('div', 'promo-row');
  for (const role of ['q', 'r', 'b', 'n'] as Role[]) {
    const sp = speciesFor(color, role, to);
    const btn = el('button');
    btn.dataset.role = role;
    btn.setAttribute('aria-label', sp.name);
    const img = el('img');
    img.src = spriteUrl(sp.dex);
    img.alt = '';
    const name = el('span');
    name.textContent = sp.name;
    const glyph = el('b');
    glyph.textContent = GLYPHS[color][role];
    btn.append(img, name, glyph);
    btn.onclick = () => pick(role);
    row.append(btn);
  }
  const x = el('button', 'cancel');
  x.textContent = '✕';
  x.setAttribute('aria-label', fmt('promote.cancel'));
  x.onclick = cancel;
  panel.append(el('p', '', 'promote.title'), row, x);
  return panel;
}

export interface EndActions {
  captions: boolean;
  rematch(swap: boolean): void;
  menu(): void;
  /** Online shows "swap sides" for the rematch. */
  online: boolean;
}

export function endPanel(line: Line, a: EndActions): HTMLElement {
  const panel = el('div', 'panel end');
  panel.dataset.testid = 'end-screen';
  panel.dataset.endKey = line.key;
  const p = el('p', '', line.key);
  p.dataset.testid = 'end-text';
  const cap = el('p', 'tb-caption');
  if (line.caption && a.captions) cap.textContent = fmt(line.caption);
  const row = el('div', 'end-buttons');
  const box = el('input');
  row.append(button('end.rematch', () => a.rematch(box.checked), 'rematch'), button('end.menu', a.menu, 'end-menu'));
  if (a.online) {
    const swap = el('label', 'swap');
    box.type = 'checkbox';
    box.dataset.testid = 'swap-sides';
    swap.append(box, el('span', '', 'online.swap'));
    panel.append(p, cap, swap, row);
  } else panel.append(p, cap, row);
  return panel;
}
