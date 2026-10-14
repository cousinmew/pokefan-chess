// SPDX-License-Identifier: AGPL-3.0-only
// Leaving the game screen half way (bugs #7, playtest 12 Oct): START → OPTION or the Pokédex keeps the game as it is.
// A move, a computer reply, the intro card or a Journey game's end that comes due meanwhile waits here and runs on the
// way back. `round` changes only with a new game, so nothing waits into a later one. The end screen or the promotion
// picker over the board comes back too. START open over the board, or a question over it, stops the game's clock the
// same way (C1, 14 Oct): what comes due waits for CLOSE.
export class Away {
  round = 0;
  /** Shows the end screen or promotion picker again; null when none is up. */
  panel: (() => void) | null = null;
  private parked: (() => void) | null = null;

  constructor(private readonly onBoard: () => boolean) {}

  /** A new game: whatever waited for the one before is dropped. */
  newRound(): void {
    this.round++;
    this.parked = null;
    this.panel = null;
  }

  /** Runs `fn` for game `r` now if the game screen shows, else when it shows again; never for a later game. */
  run(r: number, fn: () => void): void {
    if (r !== this.round) return;
    if (this.onBoard()) fn();
    else this.parked = fn;
  }

  /** The game screen shows again. Waits a microtask, so a caller that starts a new game right after (startGame, the
   * puzzles) changes `round` first and nothing old runs. `panel` false: START or a question closed over the board,
   * whose end screen or picker is still up, so only the work that waited runs. */
  back(panel = true): void {
    const r = this.round;
    queueMicrotask(() => {
      if (r !== this.round || !this.onBoard()) return;
      const fn = this.parked;
      this.parked = null;
      fn?.();
      if (panel) this.panel?.();
    });
  }
}
