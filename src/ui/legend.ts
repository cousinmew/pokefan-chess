// SPDX-License-Identifier: AGPL-3.0-only
// Who's who (§B19 item 4): each team's roles with sprite, chip, name and a short move hint; tapping one lights
// those pieces up on the board. Press and hold a piece (item 5) for a card: name, role, how it moves, capture move.
import { lookOf, MOVES, speciesFor, speciesIdFor, spriteUrl, type Color, type Role } from '../board/pieces';
import type { Board } from '../board/board';
import type { Game } from '../game/chess';
import { fmt, type StringKey } from '../game/text';
import { el } from './dom';

const ROLES: Role[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const ROLE_NAME: Record<Role, StringKey> = { k: 'role.k', q: 'role.q', r: 'role.r', b: 'role.b', n: 'role.n', p: 'role.p' };
type Item = { role: Role; id: string; square: string };

/** Runs `fn` once no cover or dip is up (html[data-transition] gone, src/ui/transitions.ts); at once if none is. */
function afterCovers(fn: () => void): void {
  const html = document.documentElement;
  if (html.dataset.transition === undefined) return fn();
  const watch = new MutationObserver(() => {
    if (html.dataset.transition !== undefined) return;
    watch.disconnect();
    fn();
  });
  watch.observe(html, { attributes: true, attributeFilter: ['data-transition'] });
}

function chipEl(color: Color, role: Role): HTMLElement {
  const c = el('span', `chip ${color === 'w' ? 'chip-w' : 'chip-b'} legend-chip`);
  c.textContent = '♚♛♜♝♞♟'['kqrbnp'.indexOf(role)]!;
  return c;
}

export class Legend {
  readonly el: HTMLElement;
  private on: { color: Color; role: Role; id: string } | null = null;
  /** The species on the board when it was last built, so a move only rebuilds it when that changes. */
  private sig = '';

  constructor(private readonly game: Game, private readonly board: Board) {
    this.el = el('div', 'legend-strip');
    this.el.dataset.testid = 'legend';
    this.el.hidden = true;
  }

  /** Each side's roles with the species standing on the board (W3, ux #13): two bishop species show twice; a role
   * with no piece and a side with no pieces (Pikachu's Path) show nothing. TEAM RED's row comes first. */
  private onBoard(): { color: Color; items: Item[] }[] {
    const pieces = this.game.chess.board().flat().filter((p) => !!p);
    const colors: Color[] = lookOf('w') === 'w' ? ['w', 'b'] : ['b', 'w'];
    return colors
      .map((color) => {
        const items: Item[] = [];
        for (const role of ROLES) {
          for (const p of pieces.filter((x) => x.color === color && x.type === role)) {
            const id = speciesIdFor(color, role, p.square);
            if (!items.some((i) => i.role === role && i.id === id)) items.push({ role, id, square: p.square });
          }
        }
        return { color, items };
      })
      .filter((r) => r.items.length);
  }

  /** Rebuilds for the current teams (skins included) and clears any highlight. */
  render(visible: boolean): void {
    this.el.hidden = !visible;
    this.clear();
    if (!visible) return;
    const rows: HTMLElement[] = [];
    const teams = this.onBoard();
    this.sig = JSON.stringify(teams.map((t) => [t.color, t.items.map((i) => i.role + i.id)]));
    for (const { color, items } of teams) {
      const row = el('div', 'legend-team');
      row.append(el('b', 'legend-team-name', lookOf(color) === 'w' ? 'team.red' : 'team.rocket'));
      const count: Partial<Record<Role, number>> = {};
      for (const { role, id, square } of items) {
        const sp = speciesFor(color, role, square);
        const n = (count[role] = (count[role] ?? 0) + 1);
        const item = el('button', 'legend-item');
        item.type = 'button';
        item.dataset.testid = `legend-${color}${role}${n > 1 ? n : ''}`;
        item.dataset.species = id;
        const img = el('img', 'legend-mon');
        // After the board's own pieces (loading fix, 14 Oct): low priority, and only once no cover or dip is up.
        img.loading = 'lazy';
        img.fetchPriority = 'low';
        const src = spriteUrl(sp.dex, 'retro');
        afterCovers(() => (img.src = src));
        img.alt = '';
        const txt = el('span', 'legend-text');
        const name = el('b');
        name.textContent = sp.name;
        txt.append(name, el('small', '', `legend.hint.${role}` as StringKey));
        item.append(img, chipEl(color, role), txt);
        item.onclick = () => this.toggle(color, role, id, item);
        row.append(item);
      }
      rows.push(row);
    }
    this.el.replaceChildren(...rows);
  }

  /** After a move: rebuilds only when the species on the board changed (a capture, a promotion). */
  refresh(visible: boolean): void {
    this.clear();
    const sig = JSON.stringify(this.onBoard().map((t) => [t.color, t.items.map((i) => i.role + i.id)]));
    if (!visible || this.el.hidden || sig !== this.sig) this.render(visible);
  }

  private toggle(color: Color, role: Role, id: string, item: HTMLElement): void {
    const same = this.on?.color === color && this.on.role === role && this.on.id === id;
    this.clear();
    if (same) return;
    this.on = { color, role, id };
    item.classList.add('on');
    this.board.highlight = this.game.chess.board().flat().filter((p) => p && p.color === color && p.type === role && speciesIdFor(color, role, p.square) === id).map((p) => p!.square as string);
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
