// SPDX-License-Identifier: AGPL-3.0-only
// Boot, screen routing and the game controller (Two Players and vs Computer).
import './style.css';
import { AI_MIN_THINK_MS, CHALLENGE_END_MS, REFUTATION_LEVEL, REVIEW_COLORS, BOARD_CHROME_PX, BOARD_SIDE_GUTTER_PX, CHECK_PULSE_MS, DEFAULT_SETTINGS, END_ANIM_MS, GLYPH_SIZE, LEGAL_DOT_SIZE, MIN_SQUARE_PX, PIECE_SCALE, SELECT_CRY_VOLUME, SELECT_HOP_PX, TAKE_BACK_LEVELS, type AiLevel } from './config';
import { Board } from './board/board';
import { GLYPHS, speciesFor, spriteUrl, teamOf, type Color, type Role } from './board/pieces';
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
import { JourneyGame } from './campaign/journeyGame';
import { furthest, PLACES, trainingThemes } from './campaign/journey';
import { DEX } from './campaign/kanto';
import { placeName } from './ui/kanto';
import type { Page } from './ui/manual';
import type { StringKey } from './game/text';
import { drillStatus, type DrillStatus } from './campaign/drill';
import type { Frame } from './campaign/review';
import type { Rng } from './game/rng';
import { setSkins } from './board/pieces';
import { createRoom } from './net/online';
import { message, onlineMenu } from './ui/online';
import { CODE_RE } from '../worker/src/protocol';

export type Mode = 'two-players' | 'computer' | 'online' | 'puzzle' | 'challenge';

/** A Journey game vs the computer (Victory Road drills, Champion BLUE): optional move limit, result to the Journey. */
export interface Challenge {
  fen?: string;
  level: AiLevel;
  limit?: number;
  onEnd(result: DrillStatus): void;
}
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
  campaignRng: Rng;
  journey: JourneyGame;
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
    campaignRng: undefined as unknown as Rng,
    journey: undefined as unknown as JourneyGame,
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
      if (key.endsWith('Win')) journey.onlineWin();
      showEnd({ key });
    },
    say: (key) => text.plain(fmt(key)),
    mySkin: () => journey.campaign.team,
    applySkins: (skins) => {
      setSkins(skins);
      board.render();
    },
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
    showFrame: (frame) => {
      game.loadFen(frame.fen);
      board.locked = true;
      board.resetMarks();
      drawReview(frame);
    },
    clearFrames: () => reviewLayer.replaceChildren(),
    engineReply: (fen) => app.engine.bestMove(fen, REFUTATION_LEVEL),
  });
  app.puzzle = puzzle;
  const journey = new JourneyGame({
    show,
    modal,
    puzzle,
    goTitle,
    gen: () => gen,
    evolveAnim: (from, to) => overlay.evolve(from, to),
    startChallenge: (ch) => startChallenge(ch),
  });
  app.journey = journey;
  app.campaignRng = journey.rng;
  // Review arrows and marks (§B15) sit on an SVG layer over the board.
  const boardWrap = el('div', 'board-wrap');
  const reviewLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  reviewLayer.setAttribute('class', 'review-layer');
  reviewLayer.dataset.testid = 'review-layer';
  boardWrap.append(board.el, reviewLayer);
  main.append(boardWrap, text.el, online.bar, puzzle.bar);

  function drawReview(frame: Frame): void {
    const ns = 'http://www.w3.org/2000/svg';
    const box = boardWrap.getBoundingClientRect();
    reviewLayer.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const centre = (sq: string) => {
      const r = board.squareEl(sq)?.getBoundingClientRect();
      return r ? { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, s: r.width } : { x: 0, y: 0, s: 0 };
    };
    const parts: SVGElement[] = [];
    const defs = document.createElementNS(ns, 'defs');
    for (const c of REVIEW_COLORS) {
      const m = document.createElementNS(ns, 'marker');
      Object.entries({ id: `head-${c[0]}`, viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '3', markerHeight: '3', orient: 'auto-start-reverse' }).forEach(([k, v]) => m.setAttribute(k, v));
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
      path.setAttribute('fill', c[1]);
      m.append(path);
      defs.append(m);
    }
    parts.push(defs);
    for (const a of frame.arrows) {
      const p = centre(a.from);
      const q = centre(a.to);
      const line = document.createElementNS(ns, 'line');
      const color = REVIEW_COLORS.find((c) => c[0] === a.color)?.[1] ?? '#30a030';
      Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: color, 'stroke-width': p.s * 0.16, 'stroke-linecap': 'round', opacity: '0.85', 'marker-end': `url(#head-${a.color})` }).forEach(([k, v]) => line.setAttribute(k, String(v)));
      line.dataset.arrow = `${a.from}${a.to}`;
      line.dataset.color = a.color;
      parts.push(line);
    }
    for (const sq of frame.marks) {
      const c = centre(sq);
      const ring = document.createElementNS(ns, 'circle');
      Object.entries({ cx: c.x, cy: c.y, r: c.s * 0.38, fill: 'none', stroke: '#e03030', 'stroke-width': c.s * 0.08, opacity: '0.85' }).forEach(([k, v]) => ring.setAttribute(k, String(v)));
      ring.dataset.mark = sq;
      parts.push(ring);
    }
    reviewLayer.replaceChildren(...parts);
  }
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

  function showOnline(): void {
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
    );
  }

  /** The manual's "Try it" (§B16): straight into that page's mode. */
  function tryMode(p: Page): void {
    const quick = load<Setup>('lastQuickPlay') ?? QUICK_DEFAULT;
    if (p === 'journey' || p === 'catching') return journey.open();
    if (p === 'training') return journey.openFromHub('training', goTitle);
    if (p === 'battle') return startGame(quick);
    if (p === 'computer') return show(teamSelect((human) => show(levelSelect((level) => startGame({ mode: 'computer', human, level }), goTitle)), goTitle));
    if (p === 'two') return startGame({ mode: 'two-players', human: 'w', level: 1 });
    if (p === 'pieces') return journey.openFromHub('team', goTitle);
    showOnline();
  }

  function goTitle(): void {
    online.close();
    puzzle.stop();
    setSkins({});
    music.play('title');
    // Continue resumes the last thing (§B16): the journey spot or a game in progress.
    const g = savedGame();
    const c = journey.campaign;
    const last = load<string>('last');
    const journeyFirst = !!c.starter && (last === 'journey' || !g);
    const here = PLACES[furthest(c)];
    const quick = load<Setup>('lastQuickPlay') ?? QUICK_DEFAULT;
    const rating = puzzle.trainer.rating.r;
    show(
      title({
        canContinue: !!g || !!c.starter,
        hub: {
          continueText: journeyFirst ? fmt('hub.continue.journey', { place: here ? placeName(here) : '' }) : g ? fmt('hub.continue.game') : null,
          card: { name: c.name || fmt('name.1'), level: rating, badges: c.badges },
          chips: {
            journey: c.champion ? fmt('hub.chip.champion') : c.starter ? fmt('hub.chip.badges', { n: String(c.badges.length) }) : fmt('hub.chip.new'),
            training: fmt('hub.chip.lessons', { n: String(trainingThemes(c).length) }),
            battle: quick.mode === 'two-players' ? fmt('hub.chip.quickTwo') : fmt('hub.chip.quickLevel', { level: fmt(`level.${quick.level}` as StringKey) }),
            computer: fmt('hub.chip.levels'),
            two: fmt('hub.chip.device'),
            online: fmt('hub.chip.code'),
            dex: fmt('hub.chip.dex', { n: String(DEX.filter((s) => c.caught[s]).length) }),
            team: fmt('hub.chip.team', { n: String(Object.values(c.team).filter(Boolean).length) }),
            card: fmt('hub.chip.level', { n: String(Math.round(rating)) }),
          },
          mascots: { journey: c.starter ?? 'pikachu', training: 'trainer:oak', battle: 'charizard', computer: 'nidoking', two: 'snorlax', online: 'porygon', dex: 'bulbasaur', team: 'eevee', card: 'trainer:red-gen1', settings: 'magnemite', share: 'pidgey' },
        },
        battle: () => startGame(quick),
        resume: () => {
          if (journeyFirst) return journey.open();
          if (g) startGame(g, g);
        },
        training: () => journey.openFromHub('training', goTitle),
        dex: () => journey.openFromHub('dex', goTitle),
        team: () => journey.openFromHub('team', goTitle),
        card: () => journey.openFromHub('card', goTitle),
        computer: () => show(teamSelect((human) => show(levelSelect((level) => startGame({ mode: 'computer', human, level }), goTitle)), goTitle)),
        twoPlayers: () => startGame({ mode: 'two-players', human: 'w', level: 1 }),
        kanto: () => journey.open(),
        howTo: (page) => show(howTo(goTitle, page, (p) => tryMode(p))),
        online: () => showOnline(),
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
    // Skins (§B5): your team on your side vs Computer; online sets both sides from the relay.
    if (setup.mode === 'computer') setSkins({ [setup.human]: journey.campaign.team });
    else if (setup.mode !== 'online') setSkins({}); // Journey games (challenge) and Training use default teams (§B14).
    app.mode = setup.mode;
    app.human = setup.mode === 'two-players' ? 'w' : setup.human;
    app.level = setup.level;
    app.aiFailed = false;
  }

  function startGame(setup: Setup, resume?: SavedGame, withIntro = true): void {
    configure(setup);
    if (setup.mode === 'two-players' || setup.mode === 'computer') save('last', 'game');
    save('lastQuickPlay', { mode: app.mode, human: app.human, level: app.level });
    show(gameView);
    restart(undefined, resume?.pgn, withIntro);
  }

  function persistGame(): void {
    if (app.mode === 'online' || app.mode === 'puzzle' || app.mode === 'challenge') return;
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
    const checked = game.checkedKing();
    if (checked) sound.cry(speciesFor(game.turn(), 'k', checked).dex);
    if (out.end) finish(out);
    persistGame();
    updateTurn();
    void maybeAi();
    if (app.mode === 'online') {
      lockForTurn();
      online.drain();
    }
    if (app.mode === 'challenge' && challenge && !app.ended) {
      if (out.move.color === app.human) challenge.made++;
      if (challenge.limit && drillStatus(game.chess, challenge.made, challenge.limit, app.human) === 'limit') endChallenge('limit');
    }
    if (app.mode === 'puzzle') puzzle.settled();
  }

  /** Online: only the player whose turn it is may touch the board. */
  function lockForTurn(): void {
    board.locked = app.ended || app.busy || (app.mode === 'online' && game.turn() !== app.human);
  }

  let challenge: (Challenge & { made: number }) | null = null;

  function startChallenge(ch: Challenge): void {
    configure({ mode: 'challenge', human: 'w', level: ch.level });
    challenge = { ...ch, made: 0 };
    show(gameView);
    restart(ch.fen);
  }

  function endChallenge(result: DrillStatus): void {
    const ch = challenge;
    if (!ch || result === 'playing') return;
    challenge = null;
    app.ended = true;
    board.locked = true;
    music.play(result === 'mate' ? 'victory' : 'defeat');
    const g = gen;
    window.setTimeout(() => g === gen && ch.onEnd(result), CHALLENGE_END_MS);
  }

  function submit(from: string, to: string, promotion?: Role): void {
    if (app.mode === 'online') online.submit(from + to + (promotion ?? ''));
    else if (app.mode === 'puzzle') puzzle.submit(from + to + (promotion ?? ''));
    else playMove(from, to, promotion);
  }

  function canTakeBack(): boolean {
    if (app.mode === 'online' || app.mode === 'puzzle' || app.mode === 'challenge') return false;
    if (app.mode === 'two-players') return settings.takeBack;
    return TAKE_BACK_LEVELS.includes(app.level);
  }

  /** Computer turn: Youngster or Stockfish, never faster than AI_MIN_THINK_MS, never hangs. */
  async function maybeAi(): Promise<void> {
    if ((app.mode !== 'computer' && app.mode !== 'challenge') || app.ended || introOpen || app.busy || game.turn() === app.human) return;
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
    if (app.mode === 'challenge') return endChallenge(drillStatus(game.chess, challenge?.made ?? 0, challenge?.limit ?? 999, app.human));
    // An online win evolves trade Pokémon on your team (§B12).
    if (app.mode === 'online' && end.winner === app.human) journey.onlineWin();
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
