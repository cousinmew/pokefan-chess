// SPDX-License-Identifier: AGPL-3.0-only
// Own DOM board (D6): CSS grid of 64 cells, Pointer Events, highlights, glyphs, keyboard.
import { DRAG_THRESHOLD_PX, MOVE_SLIDE_MS } from '../config';
import type { Game } from '../game/chess';
import { GLYPHS, speciesFor, spriteUrl, type Color, type Role } from './pieces';
import { fmt } from '../game/text';

const FILES = 'abcdefgh';

export interface BoardHooks {
  /** Called with a legal from/to; the host decides promotion and plays it. */
  onMove(from: string, to: string): void;
  settings(): { glyphs: boolean };
  announce(text: string): void;
  onSelect?(square: string): void;
}

interface Press {
  from: string;
  x: number;
  y: number;
  img: HTMLElement | null;
  dragging: boolean;
  pointerId: number;
}

export class Board {
  readonly el: HTMLElement;
  orientation: Color = 'w';
  locked = false;
  private selected: string | null = null;
  private lastMove: [string, string] | null = null;
  /** Squares outlined by a puzzle hint; cleared by the next move. */
  hints: string[] = [];
  /** Pikachu's Path targets (§B17), drawn as a star. */
  stars: string[] = [];
  private press: Press | null = null;
  private focus = 'e2';
  private readonly cells = new Map<string, HTMLElement>();

  constructor(private readonly game: Game, private readonly hooks: BoardHooks) {
    this.el = document.createElement('div');
    this.el.className = 'board';
    this.el.id = 'board';
    this.el.setAttribute('role', 'grid');
    this.el.tabIndex = 0;
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('pointermove', (e) => this.onMoveEvt(e));
    this.el.addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('pointercancel', () => this.cancelDrag());
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.render();
  }

  setLastMove(from: string, to: string): void {
    this.lastMove = [from, to];
    this.selected = null;
    this.hints = [];
  }

  /** Clears the selection and the last move tint (restart, take back). */
  resetMarks(): void {
    this.lastMove = null;
    this.hints = [];
    this.stars = [];
    this.clearSelection();
  }

  clearSelection(): void {
    this.selected = null;
    this.render();
  }

  squareEl(sq: string): HTMLElement | undefined {
    return this.cells.get(sq);
  }

  render(slide?: { from: string; to: string }): void {
    const before = slide ? this.cells.get(slide.from)?.getBoundingClientRect() : undefined;
    this.el.replaceChildren();
    this.cells.clear();
    const legal = this.selected ? this.game.legalFrom(this.selected) : [];
    const checked = this.game.checkedKing();
    const glyphs = this.hooks.settings().glyphs;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const file = this.orientation === 'w' ? f : 7 - f;
        const rank = this.orientation === 'w' ? 8 - r : r + 1;
        const sq = `${FILES[file]}${rank}`;
        const cell = document.createElement('div');
        cell.className = `sq ${(file + rank) % 2 === 1 ? 'dark' : 'light'}`;
        cell.dataset.square = sq;
        cell.setAttribute('role', 'gridcell');
        if (this.lastMove?.includes(sq)) cell.classList.add('last');
        if (sq === this.selected) cell.classList.add('selected');
        if (sq === checked) cell.classList.add('check');
        if (this.hints.includes(sq)) cell.classList.add('hint');
        if (this.stars.includes(sq)) cell.classList.add('star');
        if (sq === this.focus && this.el.matches(':focus-visible')) cell.classList.add('focus');
        const target = legal.find((m) => m.to === sq);
        if (target) cell.classList.add(target.captured ? 'capture' : 'dot');
        const piece = this.game.pieceAt(sq);
        if (piece) {
          const sp = speciesFor(piece.color, piece.type, sq);
          cell.dataset.piece = `${piece.color}${piece.type}`;
          cell.setAttribute('aria-label', fmt('square.piece', { piece: sp.name, square: sq }));
          const img = document.createElement('img');
          img.className = 'piece';
          img.src = spriteUrl(sp.dex, 'front', sp.shiny);
          img.alt = sp.name;
          img.draggable = false;
          cell.append(img);
          if (sp.stars) {
            const star = document.createElement('span');
            star.className = 'star-badge';
            star.textContent = '★'.repeat(sp.stars);
            cell.append(star);
          }
          if (glyphs) cell.append(glyph(piece.color, piece.type));
        } else {
          cell.setAttribute('aria-label', sq);
        }
        this.cells.set(sq, cell);
        this.el.append(cell);
      }
    }
    if (slide && before) {
      const img = this.cells.get(slide.to)?.querySelector('.piece') as HTMLElement | null;
      const after = this.cells.get(slide.to)?.getBoundingClientRect();
      if (img && after && typeof img.animate === 'function') {
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        img.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOVE_SLIDE_MS, easing: 'ease-out' });
      }
    }
  }

  private squareAt(x: number, y: number): string | null {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('.sq');
    return hit?.dataset.square ?? null;
  }

  private ownPiece(sq: string): boolean {
    return this.game.pieceAt(sq)?.color === this.game.turn();
  }

  private tryTarget(sq: string): boolean {
    if (!this.selected) return false;
    const legal = this.game.legalFrom(this.selected);
    // King then own rook also castles: the rook's file picks the side.
    const castle = legal.find((m) => (m.isKingsideCastle() && sq[0] === 'h') || (m.isQueensideCastle() && sq[0] === 'a'));
    const to = legal.some((m) => m.to === sq) ? sq : castle && this.game.pieceAt(sq)?.type === 'r' && sq[1] === castle.from[1] ? castle.to : null;
    if (!to) return false;
    const from = this.selected;
    this.selected = null;
    this.hooks.onMove(from, to);
    return true;
  }

  private select(sq: string): void {
    this.selected = sq;
    this.focus = sq;
    this.render();
    this.hooks.onSelect?.(sq);
    this.cells.get(sq)?.querySelector('.piece')?.classList.add('hop');
  }

  private onDown(e: PointerEvent): void {
    if (this.locked || e.button > 0) return;
    const sq = this.squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (this.selected && sq !== this.selected && this.tryTarget(sq)) return;
    if (!this.ownPiece(sq)) {
      if (this.selected) this.clearSelection();
      return;
    }
    if (sq !== this.selected) this.select(sq);
    const img = this.cells.get(sq)?.querySelector<HTMLElement>('.piece') ?? null;
    this.press = { from: sq, x: e.clientX, y: e.clientY, img, dragging: false, pointerId: e.pointerId };
    this.el.setPointerCapture?.(e.pointerId);
  }

  private onMoveEvt(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.pointerId !== e.pointerId || !p.img) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    p.dragging = true;
    p.img.classList.add('dragging');
    p.img.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private onUp(e: PointerEvent): void {
    const p = this.press;
    this.press = null;
    if (!p || !p.dragging) return;
    const sq = this.squareAt(e.clientX, e.clientY);
    if (sq && sq !== p.from && this.tryTarget(sq)) return;
    this.render();
  }

  private cancelDrag(): void {
    this.press = null;
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.locked) return;
    const dir: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dir[e.key];
    if (d) {
      e.preventDefault();
      const s = this.orientation === 'w' ? 1 : -1;
      const f = Math.min(7, Math.max(0, FILES.indexOf(this.focus[0] ?? 'e') + d[0] * s));
      const r = Math.min(8, Math.max(1, Number(this.focus[1]) + d[1] * s));
      this.focus = `${FILES[f]}${r}`;
      this.render();
      const p = this.game.pieceAt(this.focus);
      this.hooks.announce(p ? fmt('square.piece', { piece: speciesFor(p.color, p.type, this.focus).name, square: this.focus }) : this.focus);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this.tryTarget(this.focus)) return;
      if (this.ownPiece(this.focus)) this.select(this.focus);
    } else if (e.key === 'Escape') {
      this.clearSelection();
    }
  }
}

function glyph(color: Color, role: Role): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('aria-hidden', 'true');
  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', '10');
  t.setAttribute('y', '16');
  t.setAttribute('text-anchor', 'middle');
  t.textContent = GLYPHS[color][role];
  svg.append(t);
  return svg;
}
