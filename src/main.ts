// SPDX-License-Identifier: AGPL-3.0-only
// Boot and Two Players flow. Screens (title, team select, settings) arrive in S4.
import './style.css';
import { ANIM_MODES, BOARD_CHROME_PX, BOARD_SIDE_GUTTER_PX, CHECK_PULSE_MS, DEFAULT_SETTINGS, END_ANIM_MS, GLYPH_SIZE, LEGAL_DOT_SIZE, MIN_SQUARE_PX, PIECE_SCALE, SELECT_CRY_VOLUME, SELECT_HOP_PX } from './config';
import { Board } from './board/board';
import { GLYPHS, species, speciesFor, spriteUrl, teamOf, type Role, type SpeciesId } from './board/pieces';
import { Overlay } from './battle/overlay';
import { sound } from './audio/audio';
import { rng } from './game/rng';
import roster from './data/roster.gen1.json';
import { Game, type Outcome } from './game/chess';
import { fmt } from './game/text';
import { TextBox } from './ui/textBox';
import { installHarness } from './debug/harness';

export interface App {
  game: Game;
  board: Board;
  text: TextBox;
  overlay: Overlay;
  settings: typeof DEFAULT_SETTINGS;
  mode: 'two-players';
  ended: boolean;
  busy: boolean;
  playMove(from: string, to: string, promotion?: Role): Outcome | null;
  restart(fen?: string): void;
}

function setCssVars(): void {
  const s = document.documentElement.style;
  s.setProperty('--gutter', `${BOARD_SIDE_GUTTER_PX}px`);
  s.setProperty('--chrome', `${BOARD_CHROME_PX}px`);
  s.setProperty('--min-sq', `${MIN_SQUARE_PX}px`);
  s.setProperty('--piece-scale', String(PIECE_SCALE));
  s.setProperty('--dot', String(LEGAL_DOT_SIZE));
  s.setProperty('--glyph', String(GLYPH_SIZE));
  s.setProperty('--pulse', `${CHECK_PULSE_MS}ms`);
  s.setProperty('--hop', `${SELECT_HOP_PX}px`);
  s.setProperty('--end-anim', `${END_ANIM_MS}ms`);
}

function boot(): App {
  setCssVars();
  const root = document.getElementById('app') as HTMLElement;
  const settings = { ...DEFAULT_SETTINGS };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) settings.anim = 'quick';
  const overlay = new Overlay(rng);
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  const game = new Game();
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  const announce = (t: string) => (live.textContent = t);
  const text = new TextBox(() => settings.captions);
  const header = document.createElement('header');
  header.innerHTML = '<h1>PokeFan Chess</h1><p class="turn" data-testid="turn"></p><div class="controls"><button data-testid="anim"></button><button data-testid="sound"></button></div>';
  const turnEl = header.querySelector('.turn') as HTMLElement;
  const animBtn = header.querySelector('[data-testid="anim"]') as HTMLButtonElement;
  const soundBtn = header.querySelector('[data-testid="sound"]') as HTMLButtonElement;
  const labelControls = () => {
    animBtn.textContent = `Anim: ${settings.anim.toUpperCase()}`;
    soundBtn.textContent = `Sound: ${settings.sound ? 'ON' : 'OFF'}`;
    sound.enabled = settings.sound;
  };
  animBtn.onclick = () => {
    settings.anim = ANIM_MODES[(ANIM_MODES.indexOf(settings.anim) + 1) % ANIM_MODES.length] ?? 'full';
    labelControls();
  };
  soundBtn.onclick = () => {
    settings.sound = !settings.sound;
    labelControls();
  };
  labelControls();
  const footer = document.createElement('footer');
  footer.textContent = fmt('footer.disclaimer');
  const modal = document.createElement('div');
  modal.className = 'overlay';
  modal.hidden = true;

  const app: App = {
    game,
    board: undefined as unknown as Board,
    text,
    overlay,
    settings,
    mode: 'two-players',
    ended: false,
    busy: false,
    playMove,
    restart,
  };

  const board = new Board(game, {
    onMove: (from, to) => {
      if (game.isPromotion(from, to)) pickPromotion(from, to);
      else playMove(from, to);
    },
    settings: () => settings,
    announce,
    onSelect: (sq) => {
      const p = game.pieceAt(sq);
      if (p) sound.cry(speciesFor(p.color, p.type, sq).dex, SELECT_CRY_VOLUME);
    },
  });
  app.board = board;

  function updateTurn(): void {
    turnEl.textContent = app.ended ? '' : fmt(game.turn() === 'w' ? 'turn.red' : 'turn.rocket');
  }

  function playMove(from: string, to: string, promotion?: Role): Outcome | null {
    if (app.ended || app.busy) return null;
    const out = game.play(from, to, promotion);
    if (!out) return null;
    app.busy = true;
    board.locked = true;
    void present(out, from, to).then(() => settle(out, from, to));
    return out;
  }

  /** Capture battle and evolution, before the board shows the result. */
  async function present(out: Outcome, from: string, to: string): Promise<void> {
    const mode = settings.anim;
    if (out.battle && mode === 'full') await overlay.battle(out.battle.attacker, out.battle.defender);
    else if (out.battle && mode === 'quick') await overlay.quick(board.el, from, to, out.battle.attacker, out.battle.defender);
    if (out.evolve && mode === 'full') await overlay.evolve(out.evolve.pawn, out.evolve.into);
  }

  function settle(out: Outcome, from: string, to: string): void {
    app.busy = false;
    board.locked = false;
    board.setLastMove(from, to);
    if (settings.autoFlip && !out.end) board.orientation = game.turn();
    board.render({ from, to });
    const sp = speciesFor(out.move.color, out.move.promotion ?? out.move.piece, to);
    if (out.lines.length) text.show(out.lines);
    else text.plain(fmt('moved', { piece: sp.name, square: to }));
    announce(`${sp.name} to ${to}. ${out.lines.map((l) => fmt(l.key, l.vars)).join(' ')}`);
    if (!out.battle) sound.step();
    if (game.checkedKing()) sound.cry(species(roster.teams[teamOf(game.turn())].pieces.k as SpeciesId).dex);
    if (out.end) finish(out);
    updateTurn();
  }

  function finish(out: Outcome): void {
    const end = out.end;
    if (!end) return;
    app.ended = true;
    board.locked = true;
    text.show([end.line]);
    if (end.reason === 'checkmate') {
      const king = game.checkedKing();
      const img = king ? board.squareEl(king)?.querySelector('.piece') : null;
      img?.classList.add(end.winner === 'w' ? 'blast-off' : 'faint');
    }
    modal.hidden = false;
    modal.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel end';
    panel.dataset.testid = 'end-screen';
    panel.dataset.endKey = end.line.key;
    const p = document.createElement('p');
    p.dataset.testid = 'end-text';
    p.textContent = fmt(end.line.key);
    const cap = document.createElement('p');
    cap.className = 'tb-caption';
    cap.textContent = end.line.caption && settings.captions ? fmt(end.line.caption) : '';
    const again = document.createElement('button');
    again.textContent = fmt('end.again');
    again.onclick = () => restart();
    panel.append(p, cap, again);
    modal.append(panel);
  }

  function pickPromotion(from: string, to: string): void {
    const color = game.turn();
    modal.hidden = false;
    modal.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'panel promo';
    panel.setAttribute('role', 'dialog');
    panel.dataset.testid = 'promotion';
    const title = document.createElement('p');
    title.textContent = fmt('promote.title');
    const row = document.createElement('div');
    row.className = 'promo-row';
    for (const role of ['q', 'r', 'b', 'n'] as Role[]) {
      const sp = speciesFor(color, role, to);
      const btn = document.createElement('button');
      btn.dataset.role = role;
      btn.setAttribute('aria-label', sp.name);
      btn.innerHTML = `<img src="${spriteUrl(sp.dex)}" alt=""><span>${sp.name}</span><b>${GLYPHS[color][role]}</b>`;
      btn.onclick = () => {
        modal.hidden = true;
        playMove(from, to, role);
      };
      row.append(btn);
    }
    const cancel = document.createElement('button');
    cancel.className = 'cancel';
    cancel.textContent = '✕';
    cancel.setAttribute('aria-label', 'Cancel');
    cancel.onclick = () => {
      modal.hidden = true;
      board.clearSelection();
    };
    panel.append(title, row, cancel);
    modal.append(panel);
  }

  function restart(fen?: string): void {
    if (fen) game.loadFen(fen);
    else game.reset();
    overlay.skip();
    app.ended = false;
    app.busy = false;
    board.locked = false;
    board.orientation = 'w';
    modal.hidden = true;
    board.render();
    text.plain(fmt('intro.vsRocket'));
    updateTurn();
  }

  const main = document.createElement('main');
  main.append(board.el, text.el);
  root.replaceChildren(header, main, footer, modal, overlay.el, live);
  restart();
  return app;
}

const app = boot();
if (new URLSearchParams(location.search).has('debug')) installHarness(app);
