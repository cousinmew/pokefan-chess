// SPDX-License-Identifier: AGPL-3.0-only
// Puzzle player: sets up a Lichess puzzle, checks each answer, auto plays the replies, gives hints and
// updates the Trainer Rating. Moves go through the normal board path, so captures still battle.
import { PUZZLE_REPLY_MS } from '../config';
import type { Color } from '../board/pieces';
import { createRng } from '../game/rng';
import { fmt, type StringKey, type Vars } from '../game/text';
import { button, el } from '../ui/dom';
import type { App } from '../main';
import { PuzzleRun, type Answer, type PuzzleRow } from './puzzle';
import { loadTrainer, pick, pool, record, stepKey, THEMES } from './trainer';

export interface PuzzleHost {
  app: App;
  startBoard(fen: string, human: Color): void;
  applyMove(uci: string): boolean;
  say(key: StringKey, vars?: Vars): void;
  hint(squares: string[]): void;
}

type Phase = 'idle' | 'setup' | 'player' | 'checking' | 'reply' | 'over';

export class PuzzleGame {
  readonly bar: HTMLElement;
  trainer = loadTrainer();
  run: PuzzleRun | null = null;
  phase: Phase = 'idle';
  private row: PuzzleRow | null = null;
  private pending: Answer | null = null;
  private hints = 0;
  private theme = 'mixed';
  private gen = 0;
  // Seeded per visit from the clock (the seeded RNG is the only randomness, G3), so visits differ.
  private readonly rng = createRng(Date.now() >>> 0);
  private readonly ratingEl: HTMLElement;
  private readonly stepEl: HTMLElement;

  constructor(private readonly host: PuzzleHost) {
    this.bar = el('div', 'puzzle-bar');
    this.bar.hidden = true;
    this.ratingEl = el('p', 'rating');
    this.ratingEl.dataset.testid = 'trainer-rating';
    this.stepEl = el('p', 'step');
    const sel = el('select');
    sel.dataset.testid = 'puzzle-theme';
    sel.setAttribute('aria-label', fmt('puzzle.theme'));
    for (const t of ['mixed', ...THEMES]) {
      const o = el('option', '', t === 'mixed' ? 'puzzle.mixed' : (`theme.${t}` as StringKey));
      o.value = t;
      sel.append(o);
    }
    sel.onchange = () => {
      this.theme = sel.value;
      void this.start();
    };
    const row = el('div', 'puzzle-buttons');
    row.append(sel, button('puzzle.hint', () => this.hint(), 'hint'), button('puzzle.next', () => void this.start(), 'next-puzzle'));
    this.bar.append(this.ratingEl, this.stepEl, row);
    this.label();
  }

  async start(): Promise<void> {
    const g = ++this.gen;
    this.phase = 'idle';
    this.hints = 0;
    this.bar.hidden = false;
    this.host.say('puzzle.loading');
    const theme = this.theme === 'mixed' ? THEMES[Math.floor(this.rng.next() * THEMES.length)]! : this.theme;
    const rows = await pool(theme);
    if (g !== this.gen) return;
    this.row = pick(rows, this.trainer.rating.r, this.trainer.seen, this.rng);
    this.run = new PuzzleRun(this.row);
    const setup = this.run.first();
    this.host.startBoard(this.row[1], this.run.side);
    this.host.app.board.locked = true;
    this.phase = 'setup';
    window.setTimeout(() => g === this.gen && this.host.applyMove(setup), PUZZLE_REPLY_MS);
  }

  stop(): void {
    this.gen++;
    this.phase = 'idle';
    this.bar.hidden = true;
  }

  /** A player's move from the board. Wrong ends the attempt without playing it. */
  submit(uci: string): void {
    const run = this.run;
    if (this.phase !== 'player' || !run || !this.row) return;
    const answer = run.expected();
    const san = run.expectedSan();
    const res = run.answer(uci);
    if (!res.ok) {
      this.trainer = record(this.trainer, this.row, 'missed');
      this.phase = 'over';
      this.host.app.board.locked = true;
      this.host.say('puzzle.wrong', { move: san });
      this.host.hint([answer.slice(0, 2), answer.slice(2, 4)]);
      this.label();
      return;
    }
    this.pending = res;
    this.phase = 'checking';
    this.host.applyMove(uci);
  }

  /** Called by the game after every move has finished animating. */
  settled(): void {
    const g = this.gen;
    const board = this.host.app.board;
    if (this.phase === 'setup' || this.phase === 'reply') {
      const first = this.phase === 'setup';
      this.phase = 'player';
      this.pending = null;
      board.locked = false;
      this.host.say(first ? 'puzzle.yourMove' : 'puzzle.correct', { team: fmt(this.run?.side === 'w' ? 'team.red' : 'team.rocket') });
    } else if (this.phase === 'checking' && this.pending && this.row) {
      const res = this.pending;
      if (res.done) {
        this.trainer = record(this.trainer, this.row, this.hints > 0 ? 'assisted' : 'solved');
        this.phase = 'over';
        board.locked = true;
        this.label();
        this.host.say(this.hints > 0 ? 'puzzle.assisted' : 'puzzle.solved', { rating: String(Math.round(this.trainer.rating.r)) });
      } else {
        this.phase = 'reply';
        board.locked = true;
        window.setTimeout(() => g === this.gen && res.reply && this.host.applyMove(res.reply), PUZZLE_REPLY_MS);
      }
    }
  }

  hint(): void {
    if (this.phase !== 'player' || !this.run) return;
    this.hints++;
    const uci = this.run.expected();
    this.host.hint(this.hints === 1 ? [uci.slice(0, 2)] : [uci.slice(0, 2), uci.slice(2, 4)]);
  }

  private label(): void {
    const r = Math.round(this.trainer.rating.r);
    this.ratingEl.textContent = fmt('puzzle.rating', { rating: String(r) });
    this.stepEl.textContent = fmt(stepKey(r));
  }
}
