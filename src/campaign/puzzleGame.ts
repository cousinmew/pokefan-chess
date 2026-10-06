// SPDX-License-Identifier: AGPL-3.0-only
// Puzzle player: sets up a Lichess puzzle, checks each answer, auto plays the replies, gives hints and
// updates the Trainer Rating. Moves go through the normal board path, so captures still battle.
import { OPPONENT_REPLY_MS, PUZZLE_REPLY_MS, REVIEW_MOVE_MS } from '../config';
import { Chess } from 'chess.js';
import { keyIdea, lineFrames, refutationText, type Frame } from './review';
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
  /** Review (§B15): shows a position with arrows and marks, frozen; clears them again. */
  showFrame(frame: Frame): void;
  clearFrames(): void;
  /** Stockfish's best reply in a position (the refutation of a wrong move). */
  engineReply(fen: string): Promise<string>;
  applyMove(uci: string): boolean;
  say(key: StringKey, vars?: Vars): void;
  hint(squares: string[]): void;
}

type Phase = 'idle' | 'setup' | 'player' | 'checking' | 'reply' | 'review' | 'over';
type Result = 'solved' | 'assisted' | 'missed';

/** Tall grass on a Kanto route (§B3): the route's themes, and what happens after each result. */
export interface PuzzleContext {
  themes: string[];
  onResult(result: 'solved' | 'assisted' | 'missed'): void;
  onLeave(): void;
  /** A trainer battle: the battle decides what comes after Continue, so Next and "Try a new one" are hidden. */
  battle?: boolean;
  /** The host decides what follows Continue (tall grass shows an encounter); otherwise a new puzzle starts. */
  ownsNext?: boolean;
  /** Puzzles this much above the Trainer Level (gyms, Elite Four, legendaries). */
  boost?: number;
  /** The banner above the board for each puzzle, given the side you play (§B14). */
  banner?: (side: 'w' | 'b') => string;
}

export class PuzzleGame {
  readonly bar: HTMLElement;
  trainer = loadTrainer();
  run: PuzzleRun | null = null;
  phase: Phase = 'idle';
  private row: PuzzleRow | null = null;
  private pending: Answer | null = null;
  private hints = 0;
  private theme = 'mixed';
  private context: PuzzleContext | null = null;
  private readonly themeSel: HTMLSelectElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly banner: HTMLElement;
  /** The theme of the puzzle on the board (the picker's choice may be "mixed"). */
  private puzzleTheme = '';
  // Review moment (§B15): never auto-advances; the player taps Continue.
  private readonly reviewEl: HTMLElement;
  private readonly reviewText: HTMLElement;
  private readonly btn: Record<'prev' | 'next' | 'replay' | 'answer' | 'new' | 'continue', HTMLButtonElement>;
  private review: { frames: Frame[]; idx: number; timer: number; result: Result; pre: string } | null = null;
  /** The last refutation shown, for the harness: position, reply and whether Stockfish found it. */
  lastRefutation: { fen: string; uci: string; source: 'stockfish' | 'fallback' } | null = null;
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
    this.themeSel = sel;
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
    this.leaveBtn = button('route.leave', () => this.context?.onLeave(), 'leave-grass');
    this.nextBtn = button('puzzle.next', () => void this.start(), 'next-puzzle');
    row.append(sel, button('puzzle.hint', () => this.hint(), 'hint'), this.nextBtn, this.leaveBtn);
    this.banner = el('p', 'puzzle-banner');
    this.banner.dataset.testid = 'puzzle-banner';
    this.banner.hidden = true;
    this.reviewEl = el('div', 'review');
    this.reviewEl.dataset.testid = 'review';
    this.reviewEl.hidden = true;
    this.reviewText = el('p', 'review-text');
    this.reviewText.dataset.testid = 'review-text';
    const mk = (key: StringKey, id: string, fn: () => void, label?: StringKey) => {
      const b = button(key, fn, `review-${id}`, `review-btn ${id}`);
      if (label) b.setAttribute('aria-label', fmt(label));
      return b;
    };
    this.btn = {
      prev: mk('review.prev', 'prev', () => this.step(-1), 'review.prevLabel'),
      next: mk('review.next', 'next', () => this.step(1), 'review.nextLabel'),
      replay: mk('review.replay', 'replay', () => this.play(0), 'review.replayLabel'),
      answer: mk('review.answer', 'answer', () => this.showAnswer()),
      new: mk('review.new', 'new', () => this.finishReview()),
      continue: mk('review.continue', 'continue', () => this.finishReview()),
    };
    const nav = el('div', 'review-nav');
    nav.append(this.btn.prev, this.btn.replay, this.btn.next);
    const acts = el('div', 'review-acts');
    acts.append(this.btn.answer, this.btn.new, this.btn.continue);
    this.reviewEl.append(this.reviewText, nav, acts);
    this.bar.append(this.reviewEl, this.banner, this.ratingEl, this.stepEl, row);
    this.label();
  }

  /** Starts a puzzle. `ctx`: a route's tall grass; null: plain puzzles; omitted: keep the current one. */
  async start(ctx?: PuzzleContext | null): Promise<void> {
    if (ctx !== undefined) this.context = ctx;
    this.themeSel.hidden = this.context !== null;
    this.leaveBtn.hidden = this.context === null;
    this.nextBtn.hidden = this.context?.battle === true;
    if (!this.context?.battle) this.setBanner(null);
    const g = ++this.gen;
    this.phase = 'idle';
    this.hints = 0;
    this.bar.hidden = false;
    this.host.say('puzzle.loading');
    const wanted = this.context ? this.context.themes : [this.theme];
    const choices = wanted.includes('mixed') ? THEMES : wanted.filter((t) => THEMES.includes(t));
    const theme = choices[Math.floor(this.rng.next() * choices.length)] ?? THEMES[0]!;
    this.puzzleTheme = theme;
    this.endReview();
    const rows = await pool(theme);
    if (g !== this.gen) return;
    this.row = pick(rows, this.trainer.rating.r + (this.context?.boost ?? 0), this.trainer.seen, this.rng);
    this.run = new PuzzleRun(this.row);
    const setup = this.run.first();
    this.refreshBanner();
    this.host.startBoard(this.row[1], this.run.side);
    this.host.app.board.locked = true;
    this.phase = 'setup';
    window.setTimeout(() => g === this.gen && this.host.applyMove(setup), PUZZLE_REPLY_MS);
  }

  stop(): void {
    this.endReview();
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
      this.host.app.board.locked = true;
      this.host.say('puzzle.wrong', { move: san });
      this.label();
      void this.reviewMiss(run.currentFen(), uci, answer);
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
        board.locked = true;
        this.label();
        this.host.say(this.hints > 0 ? 'puzzle.assisted' : 'puzzle.solved', { rating: String(Math.round(this.trainer.rating.r)) });
        this.reviewSolved(this.hints > 0 ? 'assisted' : 'solved');
      } else {
        this.phase = 'reply';
        board.locked = true;
        window.setTimeout(() => g === this.gen && res.reply && this.host.applyMove(res.reply), OPPONENT_REPLY_MS);
      }
    }
  }

  /** Solved: the board freezes on the final position, the line replays once, then the theme's key idea is drawn. */
  private reviewSolved(result: Result): void {
    const run = this.run!;
    const frames = lineFrames(run.startFen, run.played, 'green');
    const idea = keyIdea(this.puzzleTheme, run.startFen, run.played, run.side);
    const last = frames[frames.length - 1]!;
    frames[frames.length - 1] = { ...last, arrows: [...last.arrows, ...idea.lines], marks: idea.marks };
    this.openReview(result, frames, fmt(idea.text.key, idea.text.vars), run.startFen);
    this.show(frames.length - 1);
    const g = this.gen;
    window.setTimeout(() => g === this.gen && this.phase === 'review' && this.play(0), REVIEW_MOVE_MS);
  }

  /** Wrong: your move in red, then Stockfish's punishing reply, slowly, and one line about it. */
  private async reviewMiss(pre: string, wrong: string, answer: string): Promise<void> {
    const g = this.gen;
    const chess = new Chess(pre);
    const you = chess.turn();
    chess.move({ from: wrong.slice(0, 2), to: wrong.slice(2, 4), promotion: wrong[4] });
    const after = chess.fen();
    const frames: Frame[] = [
      { fen: pre, arrows: [{ from: wrong.slice(0, 2), to: wrong.slice(2, 4), color: 'red' }], marks: [] },
      { fen: after, arrows: [{ from: wrong.slice(0, 2), to: wrong.slice(2, 4), color: 'red' }], marks: [] },
    ];
    this.openReview('missed', frames, fmt('puzzle.wrong', { move: this.run?.expectedSan() ?? answer }), pre);
    this.show(0);
    if (chess.isGameOver()) return this.setReviewText(fmt('review.wrong.over'));
    let reply: string;
    let source: 'stockfish' | 'fallback' = 'stockfish';
    try {
      reply = await this.host.engineReply(after);
    } catch (err) {
      console.warn('refutation engine unavailable:', err instanceof Error ? err.message : err);
      // Any legal reply keeps the review going: the biggest capture, else the first move.
      const moves = chess.moves({ verbose: true }).sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
      reply = moves[0] ? moves[0].from + moves[0].to + (moves[0].promotion ?? '') : '';
      source = 'fallback';
    }
    if (g !== this.gen || !this.review || !reply) return;
    this.lastRefutation = { fen: after, uci: reply, source };
    const end = new Chess(after);
    end.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
    this.review.frames.push({ fen: end.fen(), arrows: [{ from: reply.slice(0, 2), to: reply.slice(2, 4), color: 'blue' }], marks: [] });
    const side = fmt(you === 'w' ? 'team.rocket' : 'team.red');
    const t = refutationText(after, reply, you, side);
    this.setReviewText(fmt(t.key, t.vars));
    this.play(1, OPPONENT_REPLY_MS);
  }

  /** "Show answer": the correct line from before your move, in green. */
  private showAnswer(): void {
    if (!this.review || !this.run) return;
    this.review.frames = lineFrames(this.review.pre, this.run.rest(), 'green');
    this.btn.answer.hidden = true;
    this.play(0);
  }

  private openReview(result: Result, frames: Frame[], text: string, pre: string): void {
    this.endReview();
    this.phase = 'review';
    this.review = { frames, idx: 0, timer: 0, result, pre };
    this.reviewEl.hidden = false;
    this.nextBtn.hidden = true;
    const battle = this.context?.battle === true;
    this.btn.answer.hidden = result !== 'missed';
    this.btn.new.hidden = result !== 'missed' || battle || this.context?.ownsNext === true;
    this.setReviewText(text);
  }

  private setReviewText(text: string): void {
    this.reviewText.textContent = text;
  }

  private show(i: number): void {
    const r = this.review;
    if (!r) return;
    r.idx = Math.max(0, Math.min(r.frames.length - 1, i));
    this.host.showFrame(r.frames[r.idx]!);
    this.btn.prev.disabled = r.idx === 0;
    this.btn.next.disabled = r.idx === r.frames.length - 1;
  }

  private step(d: number): void {
    if (!this.review) return;
    window.clearInterval(this.review.timer);
    this.show(this.review.idx + d);
  }

  /** Plays the line from `from` to the end, one move per `ms`, once. */
  private play(from: number, ms = REVIEW_MOVE_MS): void {
    const r = this.review;
    if (!r) return;
    window.clearInterval(r.timer);
    this.show(from);
    r.timer = window.setInterval(() => {
      if (this.review !== r || r.idx >= r.frames.length - 1) return window.clearInterval(r.timer);
      this.show(r.idx + 1);
    }, ms);
  }

  private endReview(): void {
    if (this.review) window.clearInterval(this.review.timer);
    this.review = null;
    this.reviewEl.hidden = true;
    this.host.clearFrames();
  }

  /** Continue (or "Try a new one"): only now does the battle, tall grass or Training move on. */
  private finishReview(): void {
    const r = this.review;
    if (!r) return;
    this.endReview();
    this.phase = 'over';
    this.nextBtn.hidden = this.context?.battle === true;
    const ctx = this.context;
    ctx?.onResult(r.result);
    if (!ctx?.battle && !ctx?.ownsNext) void this.start();
  }

  /** Recomputes the context's banner for the current puzzle. */
  refreshBanner(): void {
    if (this.context?.banner && this.run) this.setBanner(this.context.banner(this.run.side));
  }

  /** A line above the rating, e.g. a trainer battle's progress. */
  setBanner(text: string | null): void {
    this.banner.hidden = text === null;
    this.banner.textContent = text ?? '';
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
