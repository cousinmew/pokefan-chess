// SPDX-License-Identifier: AGPL-3.0-only
// Boot, screen routing and the game controller (Two Players and vs Computer).
import './style.css';
import { LEGEND_FIRST_GAMES, CARD_IN_MS, CHALLENGE_END_MS, END_HOLD_MS, HOLD_MIN_MS, INTRO_MS, MOVE_SLIDE_MS, REFUTATION_LEVEL, DEFAULT_SETTINGS, SELECT_CRY_VOLUME, TAKE_BACK_LEVELS, THEIR_SLIDE_MS, YELLOW_BOARD_PX, type AiLevel } from './config';
import { Board } from './board/board';
import { lookOf, setSkins, setWears, SPECIES, speciesFor, spriteUrl, teamOf, type Color, type Role, type TeamSkin } from './board/pieces';
import { withoutRival } from './campaign/rivalTeam';
import { puzzleMoments } from './ui/puzzleMoments';
import { Overlay } from './battle/overlay';
import { preloadBattleSprites } from './battle/sprites';
import { present, type PresentHost } from './battle/present';
import { prewarmAudio, sound } from './audio/audio';
import { music } from './audio/music';
import { rng, type Rng } from './game/rng';
import roster from './data/roster.gen1.json';
import { Game, type Outcome } from './game/chess';
import { currentLang, fmt, type Line, type StringKey } from './game/text';
import { Engine } from './ai/engine';
import { computerTurn } from './ai/turn';
import { TextBox } from './ui/textBox';
import { button, el } from './ui/dom';
import { howTo, intro, levelSelect, splash, teamSelect, title } from './ui/screens';
import { settingsScreen, type CartridgeSettings } from './ui/settings';
import { bootProfiles, currentSlot, enterGuest, isGuest, leaveGuest, load, loadFrom, remove, save, saveTo } from './store/persist';
import { installHarness } from './debug/harness';
import { OnlineGame } from './net/onlineGame';
import { PuzzleGame } from './campaign/puzzleGame';
import { JourneyGame } from './campaign/journeyGame';
import { goalLine } from './campaign/journey';
import { continueLine, hubData } from './ui/hubData';
import { dexScreen, trainerSrc } from './ui/kanto';
import type { Page } from './ui/manual';
import { Modes } from './ui/modes';
import { Legend, pieceCard } from './ui/legend';
import { drillStatus, type DrillStatus } from './campaign/drill';
import type { Frame } from './campaign/review';
import { drawFrame } from './ui/reviewLayer';
import { applyLanguage, savedLang } from './i18n';
import { langButton, yellowHome, yellowLevels, type Cartridge } from './ui/shelf';
import { beingMade, endCreating, hasProgress, isCreating, slotCount, switchTo } from './profiles';
import { duoSide, StartFlow, type DuoSide } from './startFlow';
import { saveSection } from './ui/saveSettings';
import { decorateHome } from './ui/notices';
import { registerShell } from './pwa';
import { setCssVars } from './ui/cssVars';
import { StartButton, type StartActions } from './ui/startButton';
import { meirJoins } from './look';
import { feedbackButton } from './ui/feedbackPanel';
import { startFeedbackRetry } from './net/feedback';
import { reviewFromUrl } from './ui/reviewMode';
import { Fitter } from './ui/fit';
import { firstYellowDefaults } from './cartridgeDefaults';
import { YellowMode } from './campaign/yellowMode';
import { warmHubSheet } from './ui/icons';
import { preloadNow, releaseIdle } from './ui/loader';
import { endPanel, promotionPanel, quitPanel } from './ui/gamePanels';
import { Plates } from './ui/plates';
import { applyLooks, computerTeam, ladderFaces, myLook, puzzleTeam, standing, storyStage } from './look';
import type { Look } from '../worker/src/protocol';
import { PathGame } from './campaign/pathGame';
import { loadCampaign, STARTERS } from './campaign/kanto';
import { normalizeCode } from './net/online';
import { shownLevel } from './campaign/trainer';
import { Away } from './game/away';
import { cancelHold, guard, hold, installPace } from './ui/pace';
import { Covers, dip, domCovers, kindFor, type CoverKind } from './ui/transitions';
import { watchModal } from './ui/cards';

export type { App, Challenge, Mode, Setup } from './appTypes';
import type { App, Challenge, Mode, SavedGame, Setup } from './appTypes';

const QUICK_DEFAULT: Setup = { mode: 'computer', human: 'w', level: 1 };
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function boot(): App {
  setCssVars();
  const root = document.getElementById('app') as HTMLElement;
  // The save slot first (§B18 item 2), then its language (§B17) and cartridge (YELLOW simple or BLUE story).
  bootProfiles((n) => !hasProgress(n) && !isCreating(n) && !beingMade(n)); // an empty save left behind is dropped (playtest, 12 Oct; not one another tab is making, review fix)
  registerShell();
  // Load order (load fix): the hub sheet and the three starters first; battle sprites wait for idle time.
  warmHubSheet();
  preloadNow([trainerSrc('oak'), ...STARTERS.flatMap((id) => [spriteUrl(SPECIES[id]!.dex, 'retro'), spriteUrl(SPECIES[id]!.dex)])], releaseIdle); // Oak first (§B22 item 1)
  // An animated WebP the browser cannot show falls back to its GIF.
  document.addEventListener('error', (e) => e.target instanceof HTMLImageElement && e.target.src.endsWith('.webp') && (e.target.src = e.target.src.replace(/\.webp$/, '.gif')), true);
  applyLanguage(reviewFromUrl() ?? savedLang(), false); // ?review=<lang>: translation review mode (§B21 item 3)
  let cart = load<Cartridge>('cartridge');
  const stored = load<Partial<typeof DEFAULT_SETTINGS>>('settings');
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  // v1 forced Quick (no battle screen) under reduced motion and could save it. Reduced motion now keeps Full, calmer.
  if (stored && stored.v !== DEFAULT_SETTINGS.v && stored.anim === 'quick') settings.anim = 'full';
  settings.v = DEFAULT_SETTINGS.v;
  const applySettings = () => {
    sound.enabled = settings.sound;
    overlay.anime = settings.battleStyle === 'anime';
    sound.volume = settings.volume;
    music.setVolumes(settings.music, settings.volume, settings.sound);
  };
  const overlay = new Overlay(rng);
  applySettings();
  overlay.calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  prewarmAudio(); // §B21 item 2: the first tap only resumes audio
  startFeedbackRetry(); // feedback that could not be sent waits on the device (§B23 item 2)
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  const game = new Game();
  const live = el('div', 'sr-only');
  live.setAttribute('aria-live', 'polite');
  const announce = (t: string) => (live.textContent = t);
  const text = new TextBox(() => settings.captions);
  const yellow = () => cart === 'yellow';
  // Reduced motion forces still sprites (§B19 item 6).
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
  let red: Color = 'w'; // the colour wearing Red's look in the game on the board (W3: you, in puzzles and the Path)
  const away = new Away(() => stage.firstElementChild === gameView); // leaving bumps `gen`, not the game (bugs #7)
  // Pacing (12 Oct): holds a tap or Enter, Space or B can skip, cards that ignore a double tap, and screen changes
  // under one cover over #app (src/ui/pace.ts, transitions.ts, cards.ts).
  installPace(() => away.round);
  watchModal(modal);
  const covers = new Covers(domCovers(root, () => fmt('puzzle.loading')), (on) => (on ? (document.documentElement.dataset.transition = '') : delete document.documentElement.dataset.transition));
  /** A new position on the game screen (§2 dip): the board dips, `swap` runs at the peak, the board refits there only. */
  const boardDip = (swap: () => void | Promise<void>) => covers.track(dip(boardWrap, swap, () => fmt('puzzle.loading')));
  const onBoard = () => stage.firstElementChild === gameView;
  /** The opponent's moves slide slower than yours (pacing, the owner's "when moves happen"). */
  const slideOf = (c?: Color) => (c && c !== app.human && app.mode !== 'two-players' ? THEIR_SLIDE_MS : MOVE_SLIDE_MS);

  const board = new Board(game, {
    onMove: (from, to) => {
      if (game.isPromotion(from, to)) pickPromotion(from, to);
      else submit(from, to);
    },
    // YELLOW: glyphs always on (§B17).
    settings: () => ({ ...settings, glyphs: settings.glyphs || yellow(), animate: settings.animate && !reducedMotion() }),
    onHold: (sq) => pieceCard(modal, game, sq),
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
  header.append(backBtn, turnEl); // START replaces Menu (§B24 item 1)
  // START (§B22 item 3), in the top bar on the game screen, in the corner or the top row elsewhere.
  const startBtn = new StartButton(() => startActions(), () => yellow() || !!journey.campaign.starter || isGuest());
  header.append(startBtn.inBar);
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
      if (key.endsWith('Win') && !isGuest()) journey.onlineWin();
      showEnd({ key });
    },
    say: (key) => text.plain(fmt(key)),
    mySkin: () => journey.campaign.team,
    myLook: () => look(),
    applySkins: (skins, theirs) => {
      setSkins(skins);
      looks = theirs;
      applyLooks(looks);
      showPlates();
      board.render();
      legend.render(legendOn());
    },
  });
  app.online = online;
  const puzzle = new PuzzleGame({
    app,
    startBoard: (fen, human) => (configure({ mode: 'puzzle', human, level: 1 }), show(gameView), restart(fen)),
    applyMove: (uci) => playMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as Role | undefined) || undefined) !== null,
    say: (key, vars) => text.plain(fmt(key, vars)),
    hint: (squares) => ((board.hints = squares), board.render()),
    showFrame: (frame) => {
      game.loadFen(frame.fen);
      board.locked = true;
      board.showReview(frame.slide, frame.faded, slideOf(frame.slide && game.pieceAt(frame.slide.to)?.color)); // the move slides in, its squares lit (§B21 item 1)
      drawReview(frame);
    },
    clearFrames: () => reviewLayer.replaceChildren(),
    engineReply: (fen) => app.engine.bestMove(fen, REFUTATION_LEVEL),
    them: () => plates.nameOf(app.human === 'w' ? 'b' : 'w') ?? fmt('team.rocket'), // W3: the opponent by name
    firstSteps: (): { n: number; coach: boolean } => journey.firstSteps(), coach: (event) => moments.coach(event), solvedMoment: (stamp) => moments.solved(stamp),
    onBoard, cover: () => covers.cover('battle'), uncover: () => covers.reveal(), dip: boardDip, revealed: () => covers.revealed(), miss: (sq) => moments.miss(sq),
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
    path: { run: (lesson, hooks) => path.run(lesson, hooks), stop: () => path.stop() }, // Oak's Route 1 warm-up (W5)
    cover: (kind) => covers.cover(kind), uncover: () => covers.reveal(),
    beat: (won) => plates.beat(won === (app.human === 'w') ? 'w' : 'b'),
  });
  app.journey = journey;
  app.campaignRng = journey.rng;
  // Review arrows and marks (§B15) sit on an SVG layer over the board.
  const boardWrap = el('div', 'board-wrap');
  const reviewLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  reviewLayer.setAttribute('class', 'review-layer');
  reviewLayer.dataset.testid = 'review-layer';
  boardWrap.append(board.el, reviewLayer);
  const path = new PathGame({
    show,
    modal,
    startBoard: (fen) => (configure({ mode: 'path', human: fen.split(' ')[1] === 'b' ? 'b' : 'w', level: 1 }), show(gameView), restart(fen)),
    applyMove: (uci) => playMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as Role | undefined) || undefined) !== null,
    say: (key, vars) => text.plain(fmt(key, vars)),
    marks: (stars, hints) => ((board.stars = stars), (board.hints = hints), board.render()),
    home: () => goTitle(),
    stickers: (back) => show(dexScreen(loadCampaign(), () => undefined, back, true)),
    rng: journey.rng,
    dip: boardDip, cover: () => covers.cover('screen'), uncover: () => covers.reveal(), cheer: (sq) => moments.cheer(sq),
  });
  const legend = new Legend(game, board);
  /** Who's who (§B19 item 4): on, off, or auto (YELLOW, and a save's first games). */
  const legendOn = () => settings.legend === 'on' || (settings.legend === 'auto' && (yellow() || (load<number>('gamesPlayed') ?? 0) < LEGEND_FIRST_GAMES));
  const plates = new Plates();
  main.append(plates.top, boardWrap, plates.bottom, legend.el, online.bar, puzzle.bar, path.bar);
  plates.attachText(text.el); // your plate and the text box are one bar (change A)
  const fitter = new Fitter({ header, main, board: boardWrap, legend: legend.el, others: [plates.top, plates.bottom, online.bar, puzzle.bar, path.bar], bars: [puzzle.bar, path.bar], start: startBtn.inBar, minBoard: () => (yellow() ? YELLOW_BOARD_PX : 0) });
  /** Story stage and trainers (§B18 items 5 and 8). Online, each side brings its own look from the relay. */
  const look = () => (isGuest() ? { stage: 2 as const, trainer: 'red' as const } : myLook(!yellow(), journey.campaign.badges.length));
  let looks: Partial<Record<Color, Look>> = {};
  const showPlates = () =>
    plates.set(standing({ mode: app.mode, level: app.level, human: app.human, stage: storyStage(!yellow(), journey.campaign.badges.length), myName: isGuest() ? fmt('duo.guest') : journey.campaign.name || fmt('name.1'), looks, duo, them: puzzle.opponent() }, (k) => fmt(k as StringKey)), board.orientation);
  const yellowMode = new YellowMode({ show, home: () => goTitle(), saved: (c) => (journey.campaign = c) });
  const faces = (human: Color) => ladderFaces(human, isGuest() ? fmt('duo.guest') : journey.campaign.name || fmt('name.1'), // a guest is "Guest" (playtest, 12 Oct)
    (k) => fmt(k as StringKey), journey.campaign.starter);
  const unlockMeir = () => (journey.campaign = meirJoins(journey.campaign));

  /** YELLOW or BLUE (§B17): the home, the text box, battles and the board follow the cartridge. Shared save. */
  function setCart(c: Cartridge): void {
    cart = c;
    save('cartridge', c);
    document.body.classList.toggle('cart-yellow', c === 'yellow');
    text.oneLine = c === 'yellow';
    overlay.simple = c === 'yellow';
    if (c === 'yellow' && firstYellowDefaults(settings)) applySettings();
  }
  if (cart) setCart(cart);

  /** Back to the screen shown now (OPTION, POKéDEX): the hub and the YELLOW home are rebuilt fresh, the rest comes back as it was. */
  const returnHere = (from = stage.firstElementChild as HTMLElement | null): (() => void) => (!from || ['screen-title', 'screen-yellow', 'screen-settings'].includes(from.dataset.testid ?? '') ? goTitle : () => show(from));

  /** OPTION returns to where it was opened (§B23 item 1); a click handler passes its event as `backTo`, hence the check. */
  function showSettings(backTo?: unknown): void {
    const back = typeof backTo === 'function' ? (backTo as () => void) : returnHere();
    const cartSet: CartridgeSettings = { lang: currentLang(), onLang: (l) => (applyLanguage(l), showSettings(back)), cartridge: cart ?? 'blue', ...(isGuest() ? {} : { onSwitch: () => (setCart(yellow() ? 'blue' : 'yellow'), goTitle()) }) }; // a guest can't switch cartridge (bugs #9)
    const extra = [saveSection({ players: () => flow.players(() => showSettings(back)), restored: () => switchTo(currentSlot(), 'continue') }), feedbackButton()];
    show(settingsScreen(settings, () => (save('settings', settings), applySettings()), back, cartSet, extra));
  }

  // After the splash: shelf, start menu, saves, Two Players sides (change C), in src/startFlow.ts.
  const flow = new StartFlow({ show, goTitle: () => goTitle(), resume: () => resume(), settings: (back) => showSettings(back), pickCart: setCart, lang: (l) => applyLanguage(l), currentLang, unlockMeir, hasCart: () => !!cart, quickPlay: (kind) => (enterGuest(), (duo = null), kind === 'computer' ? vsComputer() : kind === 'friend' ? startGame({ mode: 'two-players', human: 'w', level: 1 }) : showOnline()), newGame: () => (yellow() ? (endCreating(), goTitle()) : journey.open()), renamed: () => (journey.campaign = loadCampaign()) });
  /** Two Players: each side as a save or a guest when the device has more than one (change C). */
  let duo: Record<Color, DuoSide> | null = null;
  const twoPlayers = () => (slotCount() > 1 && !isGuest() ? flow.duo((w, b) => ((duo = { w: duoSide(w, 'w'), b: duoSide(b, 'b') }), startGame({ mode: 'two-players', human: 'w', level: 1 })), goTitle) : startGame({ mode: 'two-players', human: 'w', level: 1 }));
  const langBtn = () => langButton(currentLang(), (l) => (applyLanguage(l), goTitle()));

  const drawReview = (frame: Frame) => drawFrame(reviewLayer, boardWrap, board, frame);
  gameView.append(header, main);
  const moments = puzzleMoments({ view: gameView, board, boardWrap, turnEl, plates, human: () => app.human, reducedMotion }); // W3

  /** One screen at a time (pacing R1): the stage swaps at once and the cover above it reveals the new screen; `kind`
   * defaults from the two screens (src/ui/transitions.ts), and a cover already up waiting for this screen opens. */
  let firstShow = true;
  function show(view: HTMLElement, kind?: CoverKind | null): void {
    const staying = view === gameView && stage.firstElementChild === gameView;
    const from = (stage.firstElementChild as HTMLElement | null)?.dataset.testid ?? '';
    if (!staying) {
      gen++;
      overlay.skip();
      // Nothing from the screen before may act later (bugs #8): a popup's click handler and children go with it.
      modal.hidden = true;
      modal.onclick = null;
      modal.classList.remove('clear');
      modal.replaceChildren();
      if (view !== gameView) moments.coach('stop'); // the first puzzle's coach marks stay on the game screen (review fix)
      const wear = view === gameView ? red : 'w'; // W3: menus read the default teams by colour, the game its own (back from OPTION too)
      if (lookOf('w') !== wear) applyLooks({ w: look(), b: look() }, wear);
    }
    if (view === gameView) music.play('board');
    stage.replaceChildren(view);
    document.body.dataset.screen = view.dataset.testid ?? ''; // attached to feedback
    flow.decorate(view); // BACK during an unnamed NEW GAME (§B22 item 2)
    startBtn.place(view);
    if (view !== gameView) fitter.stop();
    else if (!staying) fitter.start();
    window.scrollTo(0, 0);
    if (view === gameView && !staying) away.back(); // finish what leaving cut off, put the end screen back
    covers.reveal(kind !== undefined ? kind : kindFor(from, view.dataset.testid ?? '', firstShow));
    firstShow = false;
  }

  function savedGame(): SavedGame | null {
    const g = load<SavedGame>('game');
    return g && typeof g.pgn === 'string' && typeof g.fen === 'string' ? g : null;
  }

  const modes = new Modes({ show, goTitle, online, journey, startGame: (setup) => startGame(setup), quick: () => load<Setup>('lastQuickPlay') ?? QUICK_DEFAULT });
  const showOnline = () => modes.online();
  const tryMode = (p: Page) => modes.tryIt(p);

  /** CONTINUE (change C) and the hub's Continue: the journey spot or the game in progress, else the home screen. */
  function resume(): void {
    const g = savedGame();
    if (!yellow() && journey.campaign.starter && (load<string>('last') === 'journey' || !g)) return journey.open();
    if (g) return startGame(g, g);
    goTitle();
  }

  /** VS COMPUTER from the hub, START or PLAY CHESS: YELLOW's big levels, or BLUE's team then level. */
  // The level picker's Back goes back one step, to the team picker (ux #14).
  const vsComputer = (): void => (yellow() ? show(yellowLevels((level) => startGame({ mode: 'computer', human: 'w', level }), goTitle, faces('w'))) : show(teamSelect((human) => show(levelSelect((level) => startGame({ mode: 'computer', human, level }), vsComputer, faces(human))), goTitle)));
  /** SAVE & QUIT (§B22 item 3): progress is already saved; back to the start menu. A guest's session just ends. */
  function quit(): void {
    for (const stop of [() => online.close(), () => puzzle.stop(), () => path.stop(), leaveGuest, () => (journey.campaign = loadCampaign())]) stop();
    if ((load<Cartridge>('cartridge') ?? cart) !== cart) setCart(load<Cartridge>('cartridge')!); // the save's own cartridge after a guest game (bugs #9)
    return params.has('debug') && !params.has('menu') ? goTitle() : flow.menu(); // tests skip the start menu, as after the splash
  }
  /** A guest's game in progress is lost on QUIT, so QUIT asks first (playtest, 12 Oct). */
  const guestInGame = () => isGuest() && stage.firstElementChild === gameView && !app.ended && game.chess.history().length > 0;
  function askQuit(): void {
    const stay = () => ((modal.hidden = true), modal.replaceChildren(), (away.panel = null));
    modal.onclick = null;
    modal.replaceChildren(quitPanel(() => (stay(), quit()), stay));
    modal.hidden = false;
    away.panel = askQuit;
  }
  /** What START offers here: the Journey only for a BLUE save, Online only in BLUE, the Pokédex only with a save. */
  const startActions = (): StartActions => ({
    ...(!yellow() && !isGuest() ? { journey: () => journey.open() } : {}),
    computer: vsComputer,
    friend: twoPlayers,
    ...(!yellow() ? { online: () => showOnline() } : {}),
    // POKéDEX's Back returns to where START was opened, like OPTION (ux #14).
    ...(!isGuest() ? { dex: () => (yellow() ? show(dexScreen(loadCampaign(), () => undefined, returnHere(), true)) : journey.openFromHub('dex', returnHere())) } : {}),
    option: () => showSettings(),
    quit: () => (guestInGame() ? askQuit() : quit()),
    guest: isGuest(), // QUIT, not SAVE & QUIT: nothing is saved (ux #14)
    next: yellow() || isGuest() ? null : goalLine(journey.campaign), // W5: the first line says what is next
  });

  function goTitle(): void {
    if (isGuest()) return quit(); // PLAY CHESS ends at the start menu, never at a save's hub (§B22 item 4)
    duo = null;
    journey.campaign = loadCampaign(); // YELLOW's path and team write the save directly
    online.close();
    puzzle.stop();
    path.stop();
    setSkins({});
    music.play('title');
    if (yellow()) {
      // YELLOW home (§B17): Learn (Pikachu's Path), Play (the level picker, §B18 item 4, Youngster first), Friend, My Team.
      const home = yellowHome({ lang: langBtn(), unlock: unlockMeir, play: vsComputer, learn: () => path.open(), friend: twoPlayers, team: () => yellowMode.team(), settings: showSettings });
      return show(decorateHome(home, el('span')));
    }
    // Continue resumes the last thing (§B16): the journey spot or a game in progress.
    const g = savedGame();
    const c = journey.campaign;
    const last = load<string>('last');
    const journeyFirst = !!c.starter && (last === 'journey' || !g);
    const played = load<Setup>('lastQuickPlay');
    const quick = played ?? QUICK_DEFAULT;
    const hub = title({
      canContinue: !!g || !!c.starter,
      hub: hubData(c, shownLevel(puzzle.trainer), played, continueLine(c, journeyFirst, !!g)),
      battle: () => startGame(quick),
      resume,
      training: () => journey.openFromHub('training', goTitle), dex: () => journey.openFromHub('dex', goTitle),
      team: () => journey.openFromHub('team', goTitle), card: () => journey.openFromHub('card', goTitle),
      computer: vsComputer, twoPlayers, kanto: () => journey.open(), online: () => showOnline(), settings: showSettings,
      howTo: (page) => show(howTo(goTitle, page, (p) => tryMode(p))),
    });
    show(decorateHome(hub, langBtn()));
  }

  function configure(setup: Setup): void {
    if (setup.mode !== 'path') path.stop(); // the warm-up's bar never stays under another game (W5)
    red = setup.mode === 'puzzle' || setup.mode === 'path' ? setup.human : 'w';
    setWears(red); // W3: there you are always TEAM RED, whatever colour you play
    // Skins (§B5): your team on your side vs Computer; online sets both sides from the relay.
    const ys = yellow() ? yellowMode.skins(setup.mode, setup.human) : null; // YELLOW's own team (fix 3)
    const cpu: Color = setup.human === 'w' ? 'b' : 'w'; // vs Computer, the trainer brings their own team (change B)
    const mine = (skin: TeamSkin) => withoutRival(skin, journey.campaign.starter, look().stage ?? 2); // no rival's starter on your side (playtest, 12 Oct)
    const theirs = setup.mode === 'computer' ? { [cpu]: computerTeam(setup.level, cpu, journey.campaign.starter) } : {};
    if (duo && setup.mode === 'two-players') setSkins({ w: duo.w.team, b: duo.b.team });
    else if (ys) setSkins({ ...theirs, ...ys });
    else if (setup.mode === 'computer') setSkins({ ...theirs, [setup.human]: isGuest() ? {} : mine(journey.campaign.team) });
    else if (setup.mode === 'puzzle' || setup.mode === 'path') setSkins(isGuest() || !journey.campaign.starter ? {} : { [setup.human]: mine(puzzleTeam(journey.campaign.team, journey.campaign.starter, look().stage ?? 2)) }); // W3, design D; BLUE's warm-up (W5)
    else if (setup.mode !== 'online') setSkins({}); // Journey games (challenge) use default teams (§B14).
    if (setup.mode !== 'online') applyLooks({ w: look(), b: look() });
    app.mode = setup.mode;
    app.human = setup.mode === 'two-players' ? 'w' : setup.human;
    board.mine = app.human;
    board.groundAll = setup.mode === 'puzzle'; // a soft shadow under every one of your pieces (design D)
    app.level = setup.level;
    app.aiFailed = false;
  }

  /** A new game from a menu: the battle bars close first (pacing §2), then the game starts under them and they open on
   * the board; on the game screen (a rematch) the board dips instead. Back to a game in progress is a plain screen
   * change, and the harness (no intro) starts at once. */
  function startGame(setup: Setup, resume?: SavedGame, withIntro = true): void {
    if (resume || !withIntro) return begin(setup, resume, withIntro);
    if (onBoard()) return void boardDip(() => begin(setup, resume, withIntro));
    void covers.cover('battle').then(() => begin(setup, resume, withIntro));
  }

  function begin(setup: Setup, resume?: SavedGame, withIntro = true): void {
    configure(setup);
    if (setup.mode === 'two-players' || setup.mode === 'computer') {
      save('last', 'game');
      save('gamesPlayed', (load<number>('gamesPlayed') ?? 0) + (resume ? 0 : 1));
    }
    save('lastQuickPlay', { mode: app.mode, human: app.human, level: app.level });
    show(gameView);
    restart(undefined, resume?.pgn, withIntro);
  }

  function persistGame(): void {
    if (app.mode === 'online' || app.mode === 'puzzle' || app.mode === 'challenge' || app.mode === 'path') return;
    if (app.ended || game.chess.history().length === 0) remove('game');
    else save('game', { mode: app.mode, human: app.human, level: app.level, fen: game.fen(), pgn: game.pgn() });
  }

  const turnLine = (c: Color) => fmt(lookOf(c) === 'w' ? 'turn.red' : 'turn.rocket'); // by the team the colour wears (W3)
  function updateTurn(): void {
    // W3: a puzzle's goal always (design C); the Path never says "TEAM ROCKET to move" after a solve (ux #11).
    const goal = app.mode === 'puzzle' ? puzzle.objective() : app.mode === 'path' ? path.objective() : ''; // BLUE's warm-up has its step goal (W5)
    turnEl.textContent = goal || (app.ended || (app.mode === 'path' && game.turn() !== app.human) ? '' : turnLine(game.turn()));
    turnEl.classList.toggle('objective', !!goal);
    backBtn.hidden = !canTakeBack();
  }

  function playMove(from: string, to: string, promotion?: Role): Outcome | null {
    if (app.ended || app.busy) return null;
    const out = game.play(from, to, promotion);
    if (!out) return null;
    app.busy = true;
    board.locked = true;
    const r = away.round;
    void present(presenter, out, from, to).then(() => away.run(r, () => settle(out, from, to)));
    return out;
  }

  function settle(out: Outcome, from: string, to: string): void {
    plates.quiet();
    app.busy = false;
    board.locked = false;
    board.setLastMove(from, to);
    legend.refresh(legendOn()); // clears the highlight; rebuilt when the species on the board changed (ux #13)
    if (settings.autoFlip && app.mode === 'two-players' && !out.end) board.orientation = game.turn();
    plates.orient(board.orientation);
    if (out.battle) plates.capture(out.move.color);
    const slide = slideOf(out.move.color); // the opponent's moves slide slower (pacing, "when moves happen")
    board.render({ from, to }, slide);
    const sp = speciesFor(out.move.color, out.move.promotion ?? out.move.piece, to);
    const lines = notice ? [notice, ...out.lines] : out.lines;
    notice = null;
    // Each side's move line goes to that side's plate; yours keeps your prompts (§B24 item 2).
    const said = lines.length ? lines.map((l) => fmt(l.key, l.vars)).join(' ') : fmt('moved', { piece: sp.name, square: to });
    if (!plates.message(out.move.color, said)) text.show(lines.length ? lines : [{ key: 'moved', vars: { piece: sp.name, square: to } }]);
    else if (app.mode !== 'puzzle') text.plain(turnLine(game.turn())); // your bar keeps a prompt; a puzzle says its own
    announce([fmt('moved', { piece: sp.name, square: to }), ...out.lines.map((l) => fmt(l.key, l.vars))].join(' '));
    if (out.move.isKingsideCastle() || out.move.isQueensideCastle()) sound.castle();
    else if (!out.battle) sound.place();
    if (game.checkedKing()) sound.alarm();
    const checked = game.checkedKing();
    if (checked) sound.cry(speciesFor(game.turn(), 'k', checked).dex);
    plates.check(checked ? game.turn() : null);
    if (out.end) finish(out, slide);
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
    if (app.mode === 'puzzle') puzzle.settled(slide);
    if (app.mode === 'path') path.settled(slide);
  }

  // A puzzle's set up move plays Quick, so the player sees the position, not a battle, first (W3, ux #6).
  const presenter: PresentHost = { overlay, plates, board, near: (c) => app.mode === 'two-players' || c === app.human, mode: () => (!onBoard() ? 'off' : app.mode === 'puzzle' && puzzle.phase === 'setup' && settings.anim === 'full' ? 'quick' : settings.anim) };

  /** Online: only the player whose turn it is may touch the board. */
  function lockForTurn(): void {
    board.locked = app.ended || app.busy || (app.mode === 'online' && game.turn() !== app.human);
  }

  let challenge: (Challenge & { made: number }) | null = null;

  function startChallenge(ch: Challenge): void {
    void covers.cover('battle').then(() => {
      configure({ mode: 'challenge', human: 'w', level: ch.level });
      challenge = { ...ch, made: 0 };
      show(gameView);
      restart(ch.fen);
    });
  }

  function endChallenge(result: DrillStatus): void {
    const ch = challenge;
    if (!ch || result === 'playing') return;
    challenge = null;
    app.ended = true;
    board.locked = true;
    music.play(result === 'mate' ? 'victory' : 'defeat');
    const r = away.round;
    // A hold on the final position (pacing): skippable after HOLD_MIN_MS, after OPTION on the way back.
    void hold(CHALLENGE_END_MS, 'end', r).then((how) => how !== 'cancel' && away.run(r, () => ch.onEnd(result)));
  }

  function submit(from: string, to: string, promotion?: Role): void {
    if (app.mode === 'online') online.submit(from + to + (promotion ?? ''));
    else if (app.mode === 'puzzle') puzzle.submit(from + to + (promotion ?? ''));
    else if (app.mode === 'path') path.submit(from + to + (promotion ?? ''));
    else playMove(from, to, promotion);
  }

  function canTakeBack(): boolean {
    if (app.mode === 'online' || app.mode === 'puzzle' || app.mode === 'challenge' || app.mode === 'path') return false;
    if (yellow()) return true; // YELLOW: take back always (§B17)
    if (app.mode === 'two-players') return settings.takeBack;
    return TAKE_BACK_LEVELS.includes(app.level);
  }

  /** Computer turn (src/ai/turn.ts): Youngster or Stockfish, never faster than AI_MIN_THINK_MS, never hangs. */
  function maybeAi(): Promise<void> {
    return computerTurn({
      app, away,
      due: () => (app.mode === 'computer' || app.mode === 'challenge') && !app.ended && !introOpen && !app.busy && game.turn() !== app.human,
      thinking: () => text.show([{ key: 'ai.loading', vars: { trainer: roster.teams[teamOf(game.turn())].label } }]),
      failed: () => text.show([(notice = { key: 'ai.failed' })]),
      play: (uci) => void playMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as Role | undefined) || undefined),
    });
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
    away.panel = null;
    board.resetMarks();
    text.plain(turnLine(game.turn()));
    persistGame();
    updateTurn();
    void maybeAi();
    return true;
  }

  /** Game over (pacing C6): what it counts for at once; at the slide's end the line, the plates, the sting and the
   * blast-off or faint on the undimmed board; END_HOLD_MS later (or on a skip) the end panel. */
  function finish(out: Outcome, slide = 0): void {
    const end = out.end;
    if (!end) return;
    app.ended = true;
    board.locked = true;
    // A puzzle that ends in mate is finished by the puzzle player, not the end screen.
    if (app.mode === 'puzzle' || app.mode === 'path') return; // the Path and the warm-up have their own Next (W5)
    // YELLOW (§B17): no "blacked out"; a gentle line instead.
    if (yellow()) end.line = { key: !end.winner ? 'yellow.draw' : end.winner === app.human || app.mode === 'two-players' ? 'yellow.win' : 'yellow.lose' };
    const drill = app.mode === 'challenge' ? drillStatus(game.chess, challenge?.made ?? 0, challenge?.limit ?? 999, app.human) : null;
    // An online win evolves trade Pokémon on your team (§B12).
    if (app.mode === 'online' && end.winner === app.human && !isGuest()) journey.onlineWin();
    const winner = end.winner && duo?.[end.winner].slot; // Two Players: the win counts on that player's save
    if (winner) saveTo(winner, 'duoWins', (loadFrom<number>(winner, 'duoWins') ?? 0) + 1);
    if (yellow() && app.mode === 'computer' && end.winner === app.human) yellowMode.win();
    const r = away.round;
    window.setTimeout(() => away.run(r, () => {
      text.show([end.line]);
      plates.end(end.winner ?? null);
      music.stop();
      if (drill) return endChallenge(drill);
      if (end.winner) music.play(app.mode === 'two-players' || end.winner === app.human ? 'victory' : 'defeat');
      if (end.reason === 'checkmate') {
        const king = game.checkedKing();
        const img = king ? board.squareEl(king)?.querySelector('.piece') : null;
        img?.classList.add(end.winner === 'w' ? 'blast-off' : 'faint');
      }
      void hold(END_HOLD_MS, 'end', r).then((how) => how !== 'cancel' && away.run(r, () => showEnd(end.line)));
    }), slide);
  }

  function showEnd(line: Line): void {
    const rematch = (swap: boolean) => (app.mode === 'online' ? ((modal.hidden = true), (away.panel = null), online.rematch(swap)) : startGame({ mode: app.mode, human: app.human, level: app.level }));
    modal.onclick = null;
    modal.replaceChildren(endPanel(line, { captions: settings.captions, online: app.mode === 'online', rematch, menu: goTitle }));
    modal.hidden = false;
    away.panel = () => showEnd(line); // back from OPTION, the end screen is still there (bugs #7)
  }

  function pickPromotion(from: string, to: string): void {
    const close = () => ((modal.hidden = true), (away.panel = null));
    modal.onclick = null;
    modal.replaceChildren(promotionPanel(game.turn(), to, (role) => (close(), submit(from, to, role)), () => (close(), board.clearSelection())));
    modal.hidden = false;
    away.panel = () => pickPromotion(from, to);
  }

  /** New game in the current mode (or a FEN / PGN to restore), optionally with the intro card. */
  function restart(fen?: string, pgn?: string, withIntro = false, moves?: string[]): void {
    gen++;
    away.newRound();
    cancelHold();
    introOpen = false;
    gameView.querySelectorAll('[data-testid="intro"]').forEach((n) => n.remove()); // a card from the game before
    reviewLayer.replaceChildren();
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
    showPlates();
    modal.hidden = true;
    board.resetMarks();
    legend.render(legendOn());
    const opponent: Color = app.human === 'w' ? 'b' : 'w';
    const introKey = app.mode === 'two-players' || app.human === 'w' ? 'intro.vsRocket' : 'intro.vsRed';
    // The intro is the opponent's line, in their bar when they have one (change A). A puzzle and the Path say their own
    // (W3; playtest, 12 Oct: a wrong Path move restarts the board, which said "TEAM ROCKET wants to battle!").
    text.plain(app.mode === 'puzzle' || app.mode === 'path' || plates.message(introKey === 'intro.vsRocket' ? 'b' : 'w', fmt(introKey)) ? '' : fmt(introKey));
    persistGame();
    updateTurn();
    // The board keeps its size through a puzzle or a lesson (pacing R5): a new position refits it, nothing else does.
    if (app.mode === 'puzzle' || app.mode === 'path') fitter.freeze();
    if (withIntro) {
      introOpen = true;
      board.locked = true;
      const r = away.round;
      // After the reveal the card pops in and holds INTRO_MS, skippable after HOLD_MIN_MS (pacing C3). It can end while
      // OPTION is open (bugs #7): then the board unlocks and the computer moves on the way back.
      void covers.revealed().then(async () => {
        if (r !== away.round) return;
        const card = intro(introKey, app.mode === 'two-players' ? 'b' : opponent);
        gameView.append(card);
        guard(card, CARD_IN_MS);
        await sleep(CARD_IN_MS);
        if (r !== away.round || !card.isConnected) return; // a new game meanwhile: its hold never starts
        const held = hold(INTRO_MS, 'intro', r);
        guard(card, HOLD_MIN_MS); // a tap counts once the hold can be skipped
        const how = await held;
        card.remove();
        if (how !== 'cancel') away.run(r, () => ((introOpen = false), lockForTurn(), void maybeAi()));
      });
    } else {
      void maybeAi();
    }
  }

  root.replaceChildren(stage, modal, overlay.el, live);
  const params = new URLSearchParams(location.search);
  // A ?room= link joins straight away (any case, stray spaces); the code also prefills the Online field.
  const room = normalizeCode(params.get('room') ?? '');
  if (room.length === 4) {
    preloadBattleSprites();
    online.join(room);
  } else if (params.has('debug') && params.get('start') === 'two') startGame({ mode: 'two-players', human: 'w', level: 1 }, undefined, false);
  else
    show(
      splash(() => {
        preloadBattleSprites();
        flow.afterSplash();
      }),
    );
  return app;
}

const app = boot();
if (new URLSearchParams(location.search).has('debug')) installHarness(app);
