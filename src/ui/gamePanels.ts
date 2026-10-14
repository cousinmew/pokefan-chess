// SPDX-License-Identifier: AGPL-3.0-only
// The game's two modal panels: the promotion picker and the end screen (moved out of main.ts).
import { GLYPHS, parseVariant, speciesFor, speciesIdFor, type Color, type Role } from '../board/pieces';
import { fmt, type Line, type StringKey } from '../game/text';
import { button, el } from './dom';
import { mon } from './kanto';

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
    // Never an empty box (C13, 14 Oct): the Gen 1 sprite stands in until the animated one is in.
    const { base, shiny } = parseVariant(speciesIdFor(color, role, to));
    const img = mon(base, 'promo-sprite', false, shiny, true);
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
  /** "{name} wins!" under the themed line, by the winner's plate name (C8). */
  winner?: string;
  /** What the game brought, after the lines: YELLOW's new stickers (C5). */
  extra?: HTMLElement[];
  /** Online: the friend asked for a rematch, so Rematch stands out (N5), however late the panel is built. */
  asked?: boolean;
}

export function endPanel(line: Line, a: EndActions): HTMLElement {
  const panel = el('div', 'panel end');
  panel.dataset.testid = 'end-screen';
  panel.dataset.endKey = line.key;
  const p = el('p', '', line.key, line.vars);
  p.dataset.testid = 'end-text';
  const won = el('p', 'end-winner');
  won.dataset.testid = 'end-winner';
  won.textContent = a.winner ?? '';
  won.hidden = !a.winner;
  const cap = el('p', 'tb-caption');
  if (line.caption && a.captions) cap.textContent = fmt(line.caption);
  const row = el('div', 'end-buttons');
  const box = el('input');
  row.append(button('end.rematch', () => a.rematch(box.checked), 'rematch', a.asked ? 'asked' : ''), button('end.menu', a.menu, 'end-menu'));
  panel.append(p, won, ...(a.extra ?? []), cap);
  if (a.online) {
    const swap = el('label', 'swap');
    box.type = 'checkbox';
    box.dataset.testid = 'swap-sides';
    swap.append(box, el('span', '', 'online.swap'));
    panel.append(swap);
  }
  panel.append(row);
  return panel;
}

/** A sticker the win brought (C5): its sprite and "You got {name}!", in the end panel. */
export function stickerLine(id: string, name: string): HTMLElement {
  const row = el('div', 'end-sticker');
  row.dataset.testid = 'end-sticker';
  const text = el('p');
  text.textContent = fmt('yellow.unlocked', { name });
  row.append(mon(id, 'end-sticker-sprite', false, false, true), text);
  return row;
}

/** QUIT in a guest game in progress (playtest, 12 Oct): nothing is saved, so ask first. START's VS FRIEND, VS
 * COMPUTER or JOURNEY over a game in progress asks too (C7, 14 Oct), a save with `ask` 'quit.leave'. */
export function quitPanel(quit: () => void, stay: () => void, ask: StringKey = 'quit.ask'): HTMLElement {
  const panel = el('div', 'panel end');
  panel.setAttribute('role', 'dialog');
  panel.dataset.testid = 'quit-confirm';
  const row = el('div', 'end-buttons');
  row.append(button('quit.yes', quit, 'quit-yes'), button('quit.no', stay, 'quit-no', 'secondary'));
  panel.append(el('p', '', ask), row);
  return panel;
}
