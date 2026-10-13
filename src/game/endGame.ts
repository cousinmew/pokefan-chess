// SPDX-License-Identifier: AGPL-3.0-only
// The end of a game and what undoes or leaves one (moved out of main.ts, 14 Oct): the mate's hold and the end panel,
// the promotion picker, Take back and QUIT's question. main.ts is the host.
import { END_HOLD_MS, TAKE_BACK_LEVELS } from '../config';
import { SPECIES, type Color, type Role } from '../board/pieces';
import { music } from '../audio/music';
import type { App, Setup } from '../appTypes';
import type { DrillStatus } from '../campaign/drill';
import { loadFrom, saveTo } from '../store/persist';
import { toast } from '../ui/dom';
import { endPanel, promotionPanel, quitPanel } from '../ui/gamePanels';
import { hold } from '../ui/pace';
import type { Plates } from '../ui/plates';
import type { Away } from './away';
import type { Outcome } from './chess';
import type { Line } from './text';

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
  /** A YELLOW Play win: the next sticker. */
  yellowWin(): void;
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
}

export class EndGame {
  constructor(private readonly h: EndHost) {}

  canTakeBack(): boolean {
    const { app } = this.h;
    if (app.mode === 'online' || app.mode === 'puzzle' || app.mode === 'challenge' || app.mode === 'path') return false;
    if (this.h.yellow()) return true; // YELLOW: take back always (§B17)
    if (app.mode === 'two-players') return app.settings.takeBack;
    return TAKE_BACK_LEVELS.includes(app.level);
  }

  takeBack(): boolean {
    const { app, away, modal } = this.h;
    const { game, board } = app;
    if (!this.canTakeBack() || app.busy || app.ended) return false;
    const n = app.mode === 'computer' && game.turn() === app.human ? 2 : 1;
    let undone = 0;
    while (undone < n && game.undo()) undone++;
    if (!undone) return false;
    board.locked = false;
    modal.hidden = true;
    away.panel = null;
    board.resetMarks();
    app.text.plain(this.h.turnLine(game.turn()));
    this.h.persist();
    this.h.updateTurn();
    this.h.maybeAi();
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
    // An online win evolves trade Pokémon on your team (§B12): saved now, told with the end panel (fix, 13 Oct).
    const evolved = app.mode === 'online' && end.winner === app.human && !this.h.guest() ? this.h.onlineWin() : [];
    const winner = end.winner && this.h.duoSlot(end.winner); // Two Players: the win counts on that player's save
    if (winner) saveTo(winner, 'duoWins', (loadFrom<number>(winner, 'duoWins') ?? 0) + 1);
    if (this.h.yellow() && app.mode === 'computer' && end.winner === app.human) this.h.yellowWin();
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
      void hold(END_HOLD_MS, 'end', r).then((how) => how !== 'cancel' && away.run(r, () => this.showEnd(end.line, evolved)));
    }), slide);
  }

  showEnd(line: Line, evolved: [string, string][] = []): void {
    const { app, away, modal } = this.h;
    // Gone on the first tap, so a second tap or Menu can't act too (fix, 13 Oct); away.panel stays if START cuts the dip.
    const rematch = (swap: boolean) => ((modal.hidden = true), app.mode === 'online' ? ((away.panel = null), app.online.rematch(swap)) : this.h.startGame({ mode: app.mode, human: app.human, level: app.level }));
    modal.onclick = null;
    modal.replaceChildren(endPanel(line, { captions: app.settings.captions, online: app.mode === 'online', rematch, menu: () => this.h.goTitle() }));
    modal.hidden = false;
    away.panel = () => this.showEnd(line); // back from OPTION, the end screen is still there (bugs #7)
    for (const [from, to] of evolved) toast('trade.evolved', { from: SPECIES[from]!.name, to: SPECIES[to]!.name });
  }

  pickPromotion(from: string, to: string): void {
    const { app, away, modal } = this.h;
    const close = () => ((modal.hidden = true), (away.panel = null));
    modal.onclick = null;
    modal.replaceChildren(promotionPanel(app.game.turn(), to, (role) => (close(), this.h.submit(from, to, role)), () => (close(), app.board.clearSelection())));
    modal.hidden = false;
    away.panel = () => this.pickPromotion(from, to);
  }

  /** A guest's game in progress is lost on QUIT, so QUIT asks first (playtest, 12 Oct). */
  guestInGame(): boolean {
    const { app } = this.h;
    return this.h.guest() && this.h.onBoard() && !app.ended && app.game.chess.history().length > 0;
  }

  askQuit(): void {
    const { away, modal } = this.h;
    const stay = () => ((modal.hidden = true), modal.replaceChildren(), (away.panel = null));
    modal.onclick = null;
    modal.replaceChildren(quitPanel(() => (stay(), this.h.quit()), stay));
    modal.hidden = false;
    away.panel = () => this.askQuit();
  }
}
