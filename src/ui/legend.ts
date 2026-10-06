// SPDX-License-Identifier: AGPL-3.0-only
// Who's who (§B19 item 4): each team's 6 roles with sprite, chip, name and a short move hint; tapping a role lights
// those pieces up on the board. Press and hold a piece (item 5) for a card: name, role, how it moves, capture move.
import { MOVES, speciesFor, spriteUrl, type Color, type Role } from '../board/pieces';
import type { Board } from '../board/board';
import type { Game } from '../game/chess';
import { fmt, type StringKey } from '../game/text';
import { el } from './dom';

const ROLES: Role[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const SQ: Record<Color, Record<Role, string>> = {
  w: { k: 'e1', q: 'd1', r: 'a1', b: 'c1', n: 'b1', p: 'a2' },
  b: { k: 'e8', q: 'd8', r: 'a8', b: 'f8', n: 'b8', p: 'a7' },
};
const ROLE_NAME: Record<Role, StringKey> = { k: 'role.k', q: 'role.q', r: 'role.r', b: 'role.b', n: 'role.n', p: 'role.p' };

function chipEl(color: Color, role: Role): HTMLElement {
  const c = el('span', `chip ${color === 'w' ? 'chip-w' : 'chip-b'} legend-chip`);
  c.textContent = '♚♛♜♝♞♟'['kqrbnp'.indexOf(role)]!;
  return c;
}

export class Legend {
  readonly el: HTMLElement;
  private on: { color: Color; role: Role } | null = null;

  constructor(private readonly game: Game, private readonly board: Board) {
    this.el = el('div', 'legend-strip');
    this.el.dataset.testid = 'legend';
    this.el.hidden = true;
  }

  /** Rebuilds for the current teams (skins included) and clears any highlight. */
  render(visible: boolean): void {
    this.el.hidden = !visible;
    this.clear();
    if (!visible) return;
    const rows: HTMLElement[] = [];
    for (const color of ['w', 'b'] as Color[]) {
      const row = el('div', 'legend-team');
      row.append(el('b', 'legend-team-name', color === 'w' ? 'team.red' : 'team.rocket'));
      for (const role of ROLES) {
        const sp = speciesFor(color, role, SQ[color][role]);
        const item = el('button', 'legend-item');
        item.type = 'button';
        item.dataset.testid = `legend-${color}${role}`;
        const img = el('img', 'legend-mon');
        img.src = spriteUrl(sp.dex, 'retro');
        img.alt = '';
        const txt = el('span', 'legend-text');
        const name = el('b');
        name.textContent = sp.name;
        txt.append(name, el('small', '', `legend.hint.${role}` as StringKey));
        item.append(img, chipEl(color, role), txt);
        item.onclick = () => this.toggle(color, role, item);
        row.append(item);
      }
      rows.push(row);
    }
    this.el.replaceChildren(...rows);
  }

  private toggle(color: Color, role: Role, item: HTMLElement): void {
    const same = this.on?.color === color && this.on.role === role;
    this.clear();
    if (same) return;
    this.on = { color, role };
    item.classList.add('on');
    this.board.highlight = this.game.chess.board().flat().filter((p) => p && p.color === color && p.type === role).map((p) => p!.square as string);
    this.board.render();
  }

  clear(): void {
    this.on = null;
    this.el.querySelectorAll('.legend-item.on').forEach((n) => n.classList.remove('on'));
    if (this.board.highlight.length) {
      this.board.highlight = [];
      this.board.render();
    }
  }
}

/** The press and hold card. Tap anywhere to close. */
export function pieceCard(host: HTMLElement, game: Game, square: string): void {
  const piece = game.pieceAt(square);
  if (!piece) return;
  const sp = speciesFor(piece.color, piece.type, square);
  const card = el('div', 'panel piece-card');
  card.dataset.testid = 'piece-card';
  const img = el('img', 'menu-sprite');
  img.src = spriteUrl(sp.dex, 'front', sp.shiny);
  img.alt = '';
  const name = el('h3');
  name.textContent = sp.name;
  const role = el('p');
  role.textContent = `${'♚♛♜♝♞♟'['kqrbnp'.indexOf(piece.type)]} ${fmt(ROLE_NAME[piece.type])}`;
  const moves = el('p', 'small');
  moves.textContent = fmt('card.moves', { how: fmt(`legend.hint.${piece.type}` as StringKey) });
  const cap = el('p', 'small');
  cap.textContent = fmt('card.capture', { move: MOVES[sp.move]?.name ?? '' });
  card.append(img, name, role, moves, cap, el('span', 'tb-tick', 'story.tap'));
  host.replaceChildren(card);
  host.hidden = false;
  const close = () => {
    host.removeEventListener('pointerdown', close);
    host.hidden = true;
  };
  window.setTimeout(() => host.addEventListener('pointerdown', close), 0);
}
