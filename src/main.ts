// SPDX-License-Identifier: AGPL-3.0-only
// Boot, screen routing and the game controller (Two Players and vs Computer).
import './style.css';
import { AI_MIN_THINK_MS, BOARD_CHROME_PX, BOARD_SIDE_GUTTER_PX, CHECK_PULSE_MS, DEFAULT_SETTINGS, END_ANIM_MS, GLYPH_SIZE, LEGAL_DOT_SIZE, MIN_SQUARE_PX, PIECE_SCALE, SELECT_CRY_VOLUME, SELECT_HOP_PX, TAKE_BACK_LEVELS, type AiLevel } from './config';
import { Board } from './board/board';
import { GLYPHS, species, speciesFor, spriteUrl, teamOf, type Color, type Role, type SpeciesId } from './board/pieces';
import { Overlay } from './battle/overlay';
import { preloadBattleSprites, prepareSprites } from './battle/sprites';
import { sound } from './audio/audio';
import { music } from './audio/music';
import { rng } from './game/rng';
import roster from './data/roster.gen1.json';
import { Game, type Outcome } from './game/chess';
import { fmt, type Line } from './game/text';
import { Engine, youngsterMove } from './ai/engine';
import { TextBox } from './ui/textBox';
import { button, el } from './ui/dom';
import { howTo, intro, levelSelect, splash, teamSelect, title } from './ui/screens';
import { settingsScreen } from './ui/settings';
import { load, remove, save } from './store/persist';
import { installHarness } from './debug/harness';
import { OnlineGame } from './net/onlineGame';
import { PuzzleGame } from './campaign/puzzleGame';
import { createRoom } from './net/online';
import { message, onlineMenu } from './ui/online';
import { CODE_RE } from '../worker/src/protocol';

export type Mode = 'two-players' | 'computer' | 'online' | 'puzzle';
export interface Setup {
  mode: Mode;
  human: Color;
  level: AiLevel;
}
interface SavedGame extends Setup {
  fen: string;
  pgn: string;
}

export interface App {
  game: Game;
  board: Board;
  text: TextBox;
  overlay: Overlay;
  settings: typeof DEFAULT_SETTINGS;
  mode: Mode;
  level: AiLevel;
  human: Color;
  engine: Engine;
  online: OnlineGame;
  puzzle: PuzzleGame;
  aiFailed: boolean;
  ended: boolean;
  busy: boolean;
  playMove(from: string, to: string, promotion?: Role): Outcome | null;
  restart(fen?: string): void;
  setMode(mode: Mode, level?: AiLevel, human?: Color): void;
  takeBack(): boolean;
}

const QUICK_DEFAULT: Setup = { mode: 'computer', human: 'w', level: 1 };
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

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
  const stored = load<Partial<typeof DEFAULT_SETTINGS>>('settings');
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  // v1 forced Quick (no battle screen) under reduced motion and could save it. Reduced motion now keeps Full, calmer.
  if (stored && stored.v !== DEFAULT_SETTINGS.v && stored.anim === 'quick') settings.anim = 'full';
  settings.v = DEFAULT_SETTINGS.v;
  const applySettings = () => {
    sound.enabled = settings.sound;
    sound.volume = settings.volume;
    music.setVolumes(settings.music, settings.volume, settings.sound);
  };
  applySettings();
  const overlay = new Overlay(rng);
  overlay.calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  const game = new Game();
  const live = el('div', 'sr-only');
  live.setAttribute('aria-live', 'polite');
  const announce = (t: string) => (live.textContent = t);
  const text = new TextBox(() => settings.captions);
  const stage = el('div', 'stage');
  const modal = el('div', 'overlay');
  modal.hidden = true;

  const app: App = {
    game,
    board: undefined as unknown as Board,
    text,
    overlay,
    settings,
    mode: 'two-players',
    level: 1,
    human: 'w',
    engine: new Engine(),
    online: undefined as unknown as OnlineGame,
    puzzle: undefined as unknown as PuzzleGame,
    aiFailed: false,
    ended: false,
    busy: false,
    playMove,
    restart,
    setMode,
    takeBack,
  };
  let gen = 0;
  let notice: Line | null = null;
  let introOpen = false;

  const board = new Board(game, {
    onMove: (from, to) => {
      if (game.isPromotion(from, to)) pickPromotion(from, to);
      else submit(from, to);
    },
    settings: () => settings,
    announce,
    onSelect: (sq) => {
      const p = game.pieceAt(sq);
      sound.pickup();
      if (p) sound.cry(speciesFor(p.color, p.type, sq).dex, SELECT_CRY_VOLUME);
    },
  });
  board.el.setAttribute('aria-label', fmt('board.label'));
  app.board = board;

  // Game view: header (Menu, turn, Take back), board, text box.
  const header = el('header', 'game-header');
  const turnEl = el('p', 'turn');
  turnEl.dataset.testid = 'turn';
  const backBtn = button('game.takeBack', () => takeBack(), 'takeback');
  header.append(button('game.menu', () => goTitle(), 'menu'), turnEl, backBtn);
  const gameView = el('div', 'game-view');
  gameView.dataset.testid = 'screen-game';
  const main = el('main');
  const online = new OnlineGame({
    app,
    show,
    goTitle,
    startBoard: (moves, human) => {
      configure({ mode: 'online', human, level: 1 });
      show(gameView);
      restart(undefined, undefined, false, moves);
      text.plain(fmt('online.you', { team: fmt(human === 'w' ? 'team.red' : 'team.rocket') }));
      lockForTurn();
    },
    applyRemote: (uci) => playMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as Role | undefined) || undefined) !== null,
    endWith: (key) => {
      app.ended = true;
      board.locked = true;
      text.show([{ key }]);
      music.stop();
      music.play(key.endsWith('Win') ? 'victory' : 'defeat');
      showEnd({ key });
    },
    say: (key) => text.plain(fmt(key)),
  });
  app.online = online;
  const puzzle = new PuzzleGame({
    app,
    startBoard: (fen, human) => {
      configure({ mode: 'puzzle', human, level: 1 });
      show(gameView);
      restart(fen);
    },
    applyMove: (uci) => playMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as Role | undefined) || undefined) !== null,
    say: (key, vars) => text.plain(fmt(key, vars)),
    hint: (squares) => {
      board.hints = squares;
      board.render();
    },
  });
  app.puzzle = puzzle;
  main.append(board.el, text.el, online.bar, puzzle.bar);
  gameView.append(header, main);

  function show(view: HTMLElement): void {
    if (view !== gameView) {
      gen++;
      overlay.skip();
      modal.hidden = true;
    }
    if (view === gameView) music.play('board');
    stage.replaceChildren(view);
    window.scrollTo(0, 0);
  }

  function savedGame(): SavedGame | null {
    const g = load<SavedGame>('game');
    return g && typeof g.pgn === 'string' && typeof g.fen === 'string' ? g : null;
  }

  function goTitle(): void {
    online.close();
    puzzle.stop();
    music.play('title');
    show(
      title({
        canContinue: savedGame() !== null,
        battle: () => startGame(load<Setup>('lastQuickPlay') ?? QUICK_DEFAULT),
        resume: () => {
          const g = savedGame();
          if (g) startGame(g, g);
        },
        computer: () => show(teamSelect((human) => show(levelSelect((level) => startGame({ mode: 'computer', human, level }), goTitle)), goTitle)),
        twoPlayers: () => startGame({ mode: 'two-players', human: 'w', level: 1 }),
        puzzles: () => void puzzle.start(),
        howTo: () => show(howTo(goTitle)),
        online: () =>
          show(
            onlineMenu(
              () => {
                show(message('online.joining', goTitle, { code: '...' }));
                createRoom().then(
                  (code) => online.join(code),
                  (err: unknown) => {
                    console.warn('relay unavailable:', err instanceof Error ? err.message : err);
                    show(message('online.offline', goTitle));
                  },
                );
              },
              (code) => online.join(code),
              goTitle,
            ),
          ),
        settings: () =>
          show(
            settingsScreen(
              settings,
              () => {
                save('settings', settings);
                applySettings();
              },
              goTitle,
            ),
          ),
      }),
    );
  }

  function configure(setup: Setup): void {
    app.mode = setup.mode;
    app.human = setup.mode === 'two-players' ? 'w' : setup.human;
    app.level = setup.level;
    app.aiFailed = false;
  }

  function startGame(setup: Setup, resume?: SavedGame, withIntro = true): void {
    configure(setup);
    save('lastQuickPlay', { mode: app.mode, human: app.human, level: app.level });
    show(gameView);
    restart(undefined, resume?.pgn, withIntro);
  }

  function persistGame(): void {
    if (app.mode === 'online' || app.mode === 'puzzle') return;
    if (app.ended || game.chess.history().length === 0) remove('game');
    else save('game', { mode: app.mode, human: app.human, level: app.level, fen: game.fen(), pgn: game.pgn() });
  }

  function updateTurn(): void {
    turnEl.textContent = app.ended ? '' : fmt(game.turn() === 'w' ? 'turn.red' : 'turn.rocket');
    backBtn.hidden = !canTakeBack();
  }

  function playMove(from: string, to: string, promotion?: Role): Outcome | null {
    if (app.ended || app.busy) return null;
    const out = game.play(from, to, promotion);
    if (!out) return null;
    app.busy = true;
    board.locked = true;
    const g = gen;
    void present(out, from, to).then(() => g === gen && settle(out, from, to));
    return out;
  }

  /** Capture battle and evolution, before the board shows the result. */
  async function present(out: Outcome, from: string, to: string): Promise<void> {
    const mode = settings.anim;
    if (out.battle && mode !== 'off') music.play('battle');
    if (out.battle && mode === 'full') {
      // The player's Pokémon is always the near one. Two Players: the side that just moved.
      const attackerNear = app.mode === 'two-players' || out.move.color === app.human;
      const { attacker, defender } = out.battle;
      const sprites = attackerNear ? await prepareSprites(attacker, defender) : await prepareSprites(defender, attacker);
      await overlay.battle(attacker, defender, undefined, sprites, attackerNear);
    }
    else if (out.battle && mode === 'quick') await overlay.quick(board.el, from, to, out.battle.attacker, out.battle.defender);
    if (out.evolve && mode === 'full') music.play('evolution');
    if (out.evolve && mode === 'full') await overlay.evolve(out.evolve.pawn, out.evolve.into);
  }

  function settle(out: Outcome, from: string, to: string): void {
    app.busy = false;
    board.locked = false;
    board.setLastMove(from, to);
    if (settings.autoFlip && app.mode === 'two-players' && !out.end) board.orientation = game.turn();
    board.render({ from, to });
    const sp = speciesFor(out.move.color, out.move.promotion ?? out.move.piece, to);
    const lines = notice ? [notice, ...out.lines] : out.lines;
    notice = null;
    if (lines.length) text.show(lines);
    else text.plain(fmt('moved', { piece: sp.name, square: to }));
    announce([fmt('moved', { piece: sp.name, square: to }), ...out.lines.map((l) => fmt(l.key, l.vars))].join(' '));
    if (out.move.isKingsideCastle() || out.move.isQueensideCastle()) sound.castle();
    else if (!out.battle) sound.place();
    if (game.checkedKing()) sound.alarm();
    if (game.checkedKing()) sound.cry(species(roster.teams[teamOf(game.turn())].pieces.k as SpeciesId).dex);
    if (out.end) finish(out);
    persistGame();
    updateTurn();
    void maybeAi();
    if (app.mode === 'online') {
      lockForTurn();
      online.drain();
    }
    if (app.mode === 'puzzle') puzzle.settled();
  }

  /** Online: only the player whose turn it is may touch the board. */
  function lockForTurn(): void {
    board.locked = app.ended || app.busy || (app.mode === 'online' && game.turn() !== app.human);
  }

  function submit(from: string, to: string, promotion?: Role): void {
    if (app.mode === 'online') online.submit(from + to + (promotion ?? ''));
    else if (app.mode === 'puzzle') puzzle.submit(from + to + (promotion ?? ''));
    else playMove(from, to, promotion);
  }

  function canTakeBack(): boolean {
    if (app.mode === 'online' || app.mode === 'puzzle') return false;
    if (app.mode === 'two-players') return settings.takeBack;
    return TAKE_BACK_LEVELS.includes(app.level);
  }

  /** Computer turn: Youngster or Stockfish, never faster than AI_MIN_THINK_MS, never hangs. */
  async function maybeAi(): Promise<void> {
    if (app.mode !== 'computer' || app.ended || introOpen || app.busy || game.turn() === app.human) return;
    const g = gen;
    app.busy = true;
    board.locked = true;
    text.show([{ key: 'ai.loading', vars: { trainer: roster.teams[teamOf(game.turn())].label } }]);
    const t0 = performance.now();
    let uci: string;
    try {
      uci = app.level === 1 ? youngsterMove(game.chess, rng) : await app.engine.bestMove(game.fen(), app.level);
    } catch (err) {
      if (g !== gen) return;
      console.warn('computer trainer fell back to Youngster:', err instanceof Error ? err.message : err);
      app.level = 1;
      app.aiFailed = true;
      notice = { key: 'ai.failed' };
      text.show([notice]);
      uci = youngsterMove(game.chess, rng);
    }
    const wait = AI_MIN_THINK_MS - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
    if (g !== gen) return;
    app.busy = false;
    playMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as Role | undefined) || undefined);
  }

  function setMode(mode: Mode, level: AiLevel = 1, human: Color = 'w'): void {
    startGame({ mode, level, human }, undefined, false);
  }

  function takeBack(): boolean {
    if (!canTakeBack() || app.busy) return false;
    const n = app.mode === 'computer' && game.turn() === app.human ? 2 : 1;
    let undone = 0;
    while (undone < n && game.undo()) undone++;
    if (!undone) return false;
    app.ended = false;
    board.locked = false;
    modal.hidden = true;
    board.resetMarks();
    text.plain(fmt(game.turn() === 'w' ? 'turn.red' : 'turn.rocket'));
    persistGame();
    updateTurn();
    void maybeAi();
    return true;
  }

  function finish(out: Outcome): void {
    const end = out.end;
    if (!end) return;
    app.ended = true;
    board.locked = true;
    // A puzzle that ends in mate is finished by the puzzle player, not the end screen.
    if (app.mode === 'puzzle') return;
    text.show([end.line]);
    music.stop();
    if (end.winner) music.play(app.mode === 'two-players' || end.winner === app.human ? 'victory' : 'defeat');
    if (end.reason === 'checkmate') {
      const king = game.checkedKing();
      const img = king ? board.squareEl(king)?.querySelector('.piece') : null;
      img?.classList.add(end.winner === 'w' ? 'blast-off' : 'faint');
    }
    showEnd(end.line);
  }

  function showEnd(line: Line): void {
    const panel = el('div', 'panel end');
    panel.dataset.testid = 'end-screen';
    panel.dataset.endKey = line.key;
    const p = el('p', '', line.key);
    p.dataset.testid = 'end-text';
    const cap = el('p', 'tb-caption');
    if (line.caption && settings.captions) cap.textContent = fmt(line.caption);
    const row = el('div', 'end-buttons');
    if (app.mode === 'online') {
      const swap = el('label', 'swap');
      const box = el('input');
      box.type = 'checkbox';
      box.dataset.testid = 'swap-sides';
      swap.append(box, el('span', '', 'online.swap'));
      row.append(
        button('end.rematch', () => {
          modal.hidden = true;
          online.rematch(box.checked);
        }, 'rematch'),
        button('end.menu', () => goTitle(), 'end-menu'),
      );
      panel.append(p, cap, swap, row);
    } else {
      row.append(
        button('end.rematch', () => startGame({ mode: app.mode, human: app.human, level: app.level }), 'rematch'),
        button('end.menu', () => goTitle(), 'end-menu'),
      );
      panel.append(p, cap, row);
    }
    modal.replaceChildren(panel);
    modal.hidden = false;
  }

  function pickPromotion(from: string, to: string): void {
    const color = game.turn();
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
      btn.onclick = () => {
        modal.hidden = true;
        submit(from, to, role);
      };
      row.append(btn);
    }
    const cancel = el('button', 'cancel');
    cancel.textContent = '✕';
    cancel.setAttribute('aria-label', fmt('promote.cancel'));
    cancel.onclick = () => {
      modal.hidden = true;
      board.clearSelection();
    };
    panel.append(el('p', '', 'promote.title'), row, cancel);
    modal.replaceChildren(panel);
    modal.hidden = false;
  }

  /** New game in the current mode (or a FEN / PGN to restore), optionally with the intro card. */
  function restart(fen?: string, pgn?: string, withIntro = false, moves?: string[]): void {
    gen++;
    notice = null;
    overlay.skip();
    if (pgn) game.loadPgn(pgn);
    else if (fen) game.loadFen(fen);
    else game.reset();
    for (const uci of moves ?? []) game.playUci(uci);
    app.ended = false;
    app.busy = false;
    board.locked = false;
    board.orientation = app.human;
    modal.hidden = true;
    board.resetMarks();
    const opponent: Color = app.human === 'w' ? 'b' : 'w';
    const introKey = app.mode === 'two-players' || app.human === 'w' ? 'intro.vsRocket' : 'intro.vsRed';
    text.plain(fmt(introKey));
    persistGame();
    updateTurn();
    if (withIntro) {
      introOpen = true;
      board.locked = true;
      const g = gen;
      gameView.append(
        intro(introKey, app.mode === 'two-players' ? 'b' : opponent, () => {
          introOpen = false;
          if (g !== gen) return;
          board.locked = false;
          void maybeAi();
        }),
      );
    } else {
      void maybeAi();
    }
  }

  root.replaceChildren(stage, modal, overlay.el, live);
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') ?? '').toUpperCase();
  if (CODE_RE.test(room)) {
    preloadBattleSprites();
    online.join(room);
  } else if (params.has('debug') && params.get('start') === 'two') startGame({ mode: 'two-players', human: 'w', level: 1 }, undefined, false);
  else
    show(
      splash(() => {
        preloadBattleSprites();
        goTitle();
      }),
    );
  return app;
}

const app = boot();
if (new URLSearchParams(location.search).has('debug')) installHarness(app);
