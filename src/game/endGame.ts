// SPDX-License-Identifier: AGPL-3.0-only
// The end of a game and what undoes or leaves one (moved out of main.ts, 14 Oct): the mate's hold and the end panel,
// the promotion picker, Take back and the questions before a game is left. main.ts is the host.
// 14 Oct (controller): Take back says what it undid and slides each piece back, also during the computer's think (C2);
// a YELLOW sticker and online trade evolutions are told with the end panel, or as toasts if the player leaves before
// it (C5); the panel names the winner (C8); START's items that end a game in progress ask first (C7); the promotion
// picker's sprites are fetched once a pawn can promote (C13).
import { END_HOLD_MS, TAKE_BACK_LEVELS, THEIR_SLIDE_MS } from '../config';
import { SPECIES, parseVariant, speciesFor, speciesIdFor, spriteUrl, type Color, type Role } from '../board/pieces';
import { music } from '../audio/music';
import type { App, Setup } from '../appTypes';
import type { DrillStatus } from '../campaign/drill';
import { loadFrom, saveTo } from '../store/persist';
import { toast } from '../ui/dom';
import { endPanel, promotionPanel, quitPanel, stickerLine } from '../ui/gamePanels';
import { preloadNow } from '../ui/loader';
import { hold } from '../ui/pace';
import type { Plates } from '../ui/plates';
import type { Away } from './away';
import type { Outcome } from './chess';
import { tookBack } from './lines';
import { fmt, type Line, type StringKey } from './text';

export interface EndHost {
  app: App;
  away: Away;
  modal: HTMLElement;
  plates: Plates;
  yellow(): boolean;
  guest(): boolean;
  onBoard(): boolean;
  /** Two Players with saves: the save a side plays for (its win counts there). */
  duoSlot(c: Color): number | null | undefined;
  /** An online win's trade evolutions, saved at once (§B12). */
  onlineWin(): [string, string][];
  /** A YELLOW Play win: the stickers it unlocked, saved at once. */
  yellowWin(): string[];
  /** A Journey drill's result for the position now, or null outside a challenge. */
  drill(): DrillStatus | null;
  endChallenge(result: DrillStatus): void;
  startGame(setup: Setup): void;
  goTitle(): void;
  quit(): void;
  submit(from: string, to: string, role: Role): void;
  turnLine(c: Color): string;
  persist(): void;
  updateTurn(): void;
  maybeAi(): void;
  /** Take back during the computer's think: drops its reply (src/ai/turn.ts); false when it is not thinking. */
  cancelThink(): boolean;
  /** Take back undid moves: the bar's kept lines go (C4). */
  undone(): void;
}

/** What a game's end brought, told with its end panel (C5). */
interface News {
  stickers: string[];
  evolved: [string, string][];
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export class EndGame {
  private undoing = false;
  private news: News | null = null;
  private warmed = new Set<string>();

  constructor(private readonly h: EndHost) {}

  /** A question over the board (QUIT, or a START item that ends the game): the game waits for the answer (C1, C7).
   * Read from the screen, not kept as a flag (review, 14 Oct): whatever else closes the question (the friend's give
   * up putting the end panel over it, a new game, another screen) ends the wait too, so no later game waits for it. */
  get asking(): boolean {
    const { modal } = this.h;
    return !modal.hidden && !!modal.querySelector('[data-testid="quit-confirm"]');
  }

  canTakeBack(): boolean {
    const { app } = this.h;
    if (app.mode === 'online' || app.mode === 'puzzle' || app.mode === 'challenge' || app.mode === 'path') return false;
    if (this.h.yellow()) return true; // YELLOW: take back always (§B17)
    if (app.mode === 'two-players') return app.settings.takeBack;
    return TAKE_BACK_LEVELS.includes(app.level);
  }

  /** Take back (C2): your last move, and the computer's answer if it came; during its think, the reply is dropped and
   * your move undone. The opponent's line goes, your bar says what was undone, each piece slides back (the newest
   * first, THEIR_SLIDE_MS each, the board locked) and the move before stays lit. False while a battle or a slide plays
   * (the button looks disabled then) or the game is over. */
  takeBack(): boolean {
    const { app, away, modal, plates } = this.h;
    const { game, board } = app;
    if (!this.canTakeBack() || app.ended || this.undoing) return false;
    if (app.busy && !this.h.cancelThink()) return false;
    const n = app.mode === 'computer' && game.turn() === app.human ? 2 : 1;
    const moves = game.chess.history({ verbose: true }).slice(-n).reverse();
    if (!moves.length) return false;
    this.undoing = true;
    app.busy = true;
    board.locked = true;
    modal.hidden = true;
    away.panel = null;
    plates.quiet();
    this.h.undone();
    app.text.plain(tookBack(moves.map((m) => ({ piece: speciesFor(m.color, m.piece, m.from).name, square: m.to }))));
    this.h.updateTurn();
    const r = away.round;
    void (async () => {
      for (const [i, m] of moves.entries()) {
        if (i) await sleep(THEIR_SLIDE_MS);
        if (r !== away.round) return void (this.undoing = false);
        game.undo();
        const prev = game.chess.history({ verbose: true }).at(-1);
        if (prev) board.setLastMove(prev.from, prev.to);
        else board.resetMarks();
        board.render({ from: m.to, to: m.from }, THEIR_SLIDE_MS);
      }
      await sleep(THEIR_SLIDE_MS);
      this.undoing = false;
      if (r !== away.round) return;
      app.busy = false;
      board.locked = false;
      if (app.settings.autoFlip && app.mode === 'two-players' && board.orientation !== game.turn()) {
        board.orientation = game.turn(); // the player whose move came back faces the board again
        plates.orient(board.orientation);
        board.render();
      }
      plates.check(game.checkedKing() ? game.turn() : null);
      this.h.persist();
      this.h.updateTurn();
      this.h.maybeAi();
    })();
    return true;
  }

  /** Game over (pacing C6): what it counts for at once; at the slide's end the line, the plates, the sting and the
   * blast-off or faint on the undimmed board; END_HOLD_MS later (or on a skip) the end panel. */
  finish(out: Outcome, slide = 0): void {
    const end = out.end;
    if (!end) return;
    const { app, away, plates } = this.h;
    app.ended = true;
    app.board.locked = true;
    // A puzzle that ends in mate is finished by the puzzle player, not the end screen.
    if (app.mode === 'puzzle' || app.mode === 'path') return; // the Path and the warm-up have their own Next (W5)
    // YELLOW (§B17): no "blacked out"; a gentle line instead.
    if (this.h.yellow()) end.line = { key: !end.winner ? 'yellow.draw' : end.winner === app.human || app.mode === 'two-players' ? 'yellow.win' : 'yellow.lose' };
    const drill = this.h.drill();
    // Saved now, told with the end panel: an online win's trade evolutions (§B12, fix 13 Oct) and YELLOW's sticker (C5).
    const evolved = app.mode === 'online' && end.winner === app.human && !this.h.guest() ? this.h.onlineWin() : [];
    const stickers = this.h.yellow() && app.mode === 'computer' && end.winner === app.human ? this.h.yellowWin() : [];
    this.news = { stickers, evolved };
    const winner = end.winner && this.h.duoSlot(end.winner); // Two Players: the win counts on that player's save
    if (winner) saveTo(winner, 'duoWins', (loadFrom<number>(winner, 'duoWins') ?? 0) + 1);
    const r = away.round;
    window.setTimeout(() => away.run(r, () => {
      app.text.show([end.line]);
      plates.end(end.winner ?? null);
      music.stop();
      if (drill) return this.h.endChallenge(drill);
      if (end.winner) music.play(app.mode === 'two-players' || end.winner === app.human ? 'victory' : 'defeat');
      if (end.reason === 'checkmate') {
        const king = app.game.checkedKing();
        const img = king ? app.board.squareEl(king)?.querySelector('.piece') : null;
        img?.classList.add(end.winner === 'w' ? 'blast-off' : 'faint');
      }
      void hold(END_HOLD_MS, 'end', r).then((how) => how !== 'cancel' && away.run(r, () => this.showEnd(end.line, end.winner)));
    }), slide);
  }

  /** The end panel: the line, "{name} wins!" (C8), a YELLOW sticker (C5); trade evolutions as toasts with it. `evolved`
   * adds those of an end the board cannot see (an online timeout or resign). */
  showEnd(line: Line, winner?: Color | null, evolved: [string, string][] = []): void {
    const news = this.news ?? { stickers: [], evolved: [] };
    this.news = null;
    const name = winner ? this.h.plates.named(winner) : undefined;
    this.panel(line, name ? fmt('end.wins', { name }) : undefined, news.stickers);
    for (const [from, to] of [...news.evolved, ...evolved]) toast('trade.evolved', { from: SPECIES[from]!.name, to: SPECIES[to]!.name });
  }

  private panel(line: Line, winner: string | undefined, stickers: string[]): void {
    const { app, away, modal } = this.h;
    // Gone on the first tap, so a second tap or Menu can't act too (fix, 13 Oct); away.panel stays if START cuts the dip.
    const rematch = (swap: boolean) => ((modal.hidden = true), app.mode === 'online' ? ((away.panel = null), app.online.rematch(swap)) : this.h.startGame({ mode: app.mode, human: app.human, level: app.level }));
    const extra = stickers.map((id) => stickerLine(id, SPECIES[id]!.name));
    modal.onclick = null;
    modal.replaceChildren(endPanel(line, { captions: app.settings.captions, online: app.mode === 'online', rematch, menu: () => this.h.goTitle(), winner, extra }));
    modal.hidden = false;
    away.panel = () => this.panel(line, winner, stickers); // back from OPTION, the end screen is still there (bugs #7)
  }

  /** The player left before the end panel came (START → SAVE & QUIT, JOURNEY, a new game in the end hold): what the
   * game brought is told now, as toasts on the next screen, never lost (C5). */
  flush(): void {
    const news = this.news;
    this.news = null;
    for (const id of news?.stickers ?? []) toast('yellow.unlocked', { name: SPECIES[id]!.name });
    for (const [from, to] of news?.evolved ?? []) toast('trade.evolved', { from: SPECIES[from]!.name, to: SPECIES[to]!.name });
  }

  pickPromotion(from: string, to: string): void {
    const { app, away, modal } = this.h;
    const close = () => ((modal.hidden = true), (away.panel = null));
    modal.onclick = null;
    modal.replaceChildren(promotionPanel(app.game.turn(), to, (role) => (close(), this.h.submit(from, to, role)), () => (close(), app.board.clearSelection())));
    modal.hidden = false;
    away.panel = () => this.pickPromotion(from, to);
  }

  /** A pawn of `color` stands a step from promotion: the picker's four sprites (and their Gen 1 stand-ins) load now,
   * so it never opens on empty boxes (C13). */
  warmPromotion(color: Color): void {
    const rank = color === 'w' ? '7' : '2';
    const last = color === 'w' ? '8' : '1';
    if (!this.h.app.game.chess.board().flat().some((p) => p?.type === 'p' && p.color === color && p.square[1] === rank)) return;
    const ids = new Set((['q', 'r', 'n', 'b'] as Role[]).flatMap((role) => ['a', 'b'].map((f) => speciesIdFor(color, role, f + last))));
    const urls = [...ids].flatMap((id) => {
      const { base, shiny } = parseVariant(id);
      const dex = SPECIES[base]!.dex;
      return [spriteUrl(dex, 'retro'), spriteUrl(dex, 'front', shiny)];
    }).filter((u) => !this.warmed.has(u));
    urls.forEach((u) => this.warmed.add(u));
    if (urls.length) preloadNow(urls);
  }

  /** A vs Computer or Two Players game on the board with moves made and not over: leaving it ends it. */
  inGame(): boolean {
    const { app } = this.h;
    return (app.mode === 'computer' || app.mode === 'two-players') && this.h.onBoard() && !app.ended && app.game.chess.history().length > 0;
  }

  /** A guest's game in progress is lost on QUIT, so QUIT asks first (playtest, 12 Oct). */
  guestInGame(): boolean {
    const { app } = this.h;
    return this.h.guest() && this.h.onBoard() && !app.ended && app.game.chess.history().length > 0;
  }

  /** Asks before `then` ends the game on the board (QUIT; START's VS FRIEND, VS COMPUTER or JOURNEY, C7). The game
   * waits meanwhile; Keep playing goes on with it. */
  askQuit(then: () => void = () => this.h.quit(), ask: StringKey = 'quit.ask'): void {
    const { away, modal } = this.h;
    const close = () => ((modal.hidden = true), modal.replaceChildren(), (away.panel = null));
    modal.onclick = null;
    modal.replaceChildren(quitPanel(() => (close(), then()), () => (close(), away.back(false)), ask));
    modal.hidden = false;
    away.panel = () => this.askQuit(then, ask);
  }
}
