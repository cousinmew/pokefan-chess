// SPDX-License-Identifier: AGPL-3.0-only
// Puzzle player: sets up a Lichess puzzle, checks each answer, auto plays the replies, gives hints and
// updates the Trainer Rating. Moves go through the normal board path, so captures still battle.
import { OPPONENT_REPLY_MS, PUZZLE_SETUP_MS, REVIEW_MOVE_MS } from '../config';
import { Chess } from 'chess.js';
import { describeMove, keyIdea, lineFrames, refutationText, type Frame } from './review';
import type { Color } from '../board/pieces';
import { createRng } from '../game/rng';
import { fmt, type StringKey, type Vars } from '../game/text';
import { button, el } from '../ui/dom';
import type { App } from '../main';
import type { Side } from '../look';
import { objective, PuzzleRun, type Answer, type PuzzleRow } from './puzzle';
import { loadTrainer, pick, pool, record, THEMES } from './trainer';

/** The first puzzles of a save say how to move (W3). */
const TAP_HELP_PUZZLES = 3;

export interface PuzzleHost {
  app: App;
  /** Sets up the board with you at the bottom; `human` is the colour you play (you are always TEAM RED, W3). */
  startBoard(fen: string, human: Color): void;
  /** The opponent's name for lines like "{them} moves first. Watch!" (the plate's name). */
  them(): string;
  /** Counts a new puzzle on the save: how many were started before it, and whether the coach marks show (once). */
  firstSteps(): { n: number; coach: boolean };
  /** Coach marks (W3, design F): start them, add the "they moved" step, or close them when you move. */
  coach(event: 'start' | 'setup' | 'stop'): void;
  /** The solve moment (W3, design J): stamp, sound, the opponent's "Oh no!". */
  solvedMoment(): void;
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
  /** The banner for each puzzle: a trainer battle's trainer, pips and what is still needed (W3: the goal is in the header). */
  banner?: () => string;
  /** Who set the puzzle (W3): the route trainer, gym leader or rival on the top plate; default the story stage's trainer. */
  opponent?: Side;
  /** Called the moment a puzzle is decided, before the review (pips update at once, design J). */
  onAttempt?(result: 'solved' | 'assisted' | 'missed'): void;
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
  /** W3: the rating and step lines left the puzzle bar (the Trainer Card has them); a small "+12" shows after a solve. */
  private readonly ratingEl: HTMLElement;
  /** A puzzle to play next instead of a random one (the harness, for tests). */
  forced: { row: PuzzleRow; theme: string } | null = null;
  /** The first puzzles of a save: "Tap your Pokémon, then a square." */
  private tapHelp = false;

  constructor(private readonly host: PuzzleHost) {
    this.bar = el('div', 'puzzle-bar');
    this.bar.hidden = true;
    this.ratingEl = el('p', 'rating-up');
    this.ratingEl.dataset.testid = 'trainer-rating';
    this.ratingEl.hidden = true;
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
    this.bar.append(this.reviewEl, this.banner, this.ratingEl, row);
  }

  /** Who set the puzzle, for the top plate (W3); undefined: the story stage's trainer. */
  opponent(): Side | undefined {
    return this.context?.opponent;
  }

  /** What to do in this puzzle, for the header (W3): "Checkmate in 1 move", "Goal: win material with a fork". */
  objective(): string {
    return this.row ? objective(this.puzzleTheme, this.row[2], (k, v) => fmt(k, v)) : '';
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
    const forced = this.forced;
    this.forced = null;
    const theme = forced?.theme ?? choices[Math.floor(this.rng.next() * choices.length)] ?? THEMES[0]!;
    this.puzzleTheme = theme;
    this.endReview();
    this.ratingEl.hidden = true;
    const rows = forced ? [forced.row] : await pool(theme);
    if (g !== this.gen) return;
    this.row = pick(rows, this.trainer.rating.r + (this.context?.boost ?? 0), this.trainer.seen, this.rng);
    this.run = new PuzzleRun(this.row);
    const setup = this.run.first();
    const first = this.host.firstSteps();
    this.tapHelp = first.n < TAP_HELP_PUZZLES;
    this.refreshBanner();
    this.host.startBoard(this.row[1], this.run.side);
    this.host.app.board.locked = true;
    this.phase = 'setup';
    // The position first, then the opponent's set up move (W3, ux #6): the player sees what is about to happen.
    this.host.say('puzzle.watch', { them: this.host.them() });
    if (first.coach) this.host.coach('start');
    window.setTimeout(() => g === this.gen && this.host.applyMove(setup), PUZZLE_SETUP_MS);
  }

  stop(): void {
    this.endReview();
    this.gen++;
    this.phase = 'idle';
    this.bar.hidden = true;
    this.host.coach('stop');
  }

  /** A player's move from the board. Wrong ends the attempt without playing it. */
  submit(uci: string): void {
    const run = this.run;
    if (this.phase !== 'player' || !run || !this.row) return;
    const answer = run.expected();
    const res = run.answer(uci);
    this.host.coach('stop');
    if (!res.ok) {
      this.trainer = record(this.trainer, this.row, 'missed');
      this.host.app.board.locked = true;
      this.host.say('puzzle.wrong');
      this.context?.onAttempt?.('missed');
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
      // You are always TEAM RED (W3): no side names here, just whose turn it is.
      this.host.say(!first ? 'puzzle.correct' : this.tapHelp ? 'puzzle.yourTurnTap' : 'puzzle.yourTurn');
      if (first) this.host.coach('setup');
    } else if (this.phase === 'checking' && this.pending && this.row) {
      const res = this.pending;
      if (res.done) {
        const before = this.trainer.rating.r;
        const result = this.hints > 0 ? 'assisted' : 'solved';
        this.trainer = record(this.trainer, this.row, result);
        board.locked = true;
        // A small "+12" only when the rating went up (W3, design J); no numbers mid-puzzle otherwise.
        const up = Math.round(this.trainer.rating.r) - Math.round(before);
        this.ratingEl.hidden = up <= 0;
        this.ratingEl.textContent = fmt('puzzle.ratingUp', { n: String(up) });
        const mate = !!this.run && new Chess(this.run.currentFen()).isCheckmate();
        this.host.say(result === 'assisted' ? 'puzzle.assisted' : mate ? 'puzzle.solvedMate' : 'puzzle.solved');
        this.context?.onAttempt?.(result);
        this.host.solvedMoment();
        this.reviewSolved(result);
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
    // Your move first, faded (§B21 item 1); the right one follows on the board, never as notation.
    const w = { from: wrong.slice(0, 2), to: wrong.slice(2, 4) };
    const frames: Frame[] = [
      { fen: pre, arrows: [{ ...w, color: 'red' }], marks: [] },
      { fen: after, arrows: [{ ...w, color: 'red' }], marks: [], slide: w, faded: [w.to] },
    ];
    this.openReview('missed', frames, fmt('puzzle.wrong'), pre);
    this.show(0);
    const right = this.rightFrames(pre, answer);
    if (chess.isGameOver()) {
      this.review?.frames.push(...right);
      this.setReviewText(fmt('review.wrong.over'));
      return this.play(1, OPPONENT_REPLY_MS);
    }
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
    // The opponent by name (W3): "That lets YOUNGSTER TOBY take your BULBASAUR", never your own team's name.
    const t = refutationText(after, reply, you, this.host.them());
    const r = { from: reply.slice(0, 2), to: reply.slice(2, 4) };
    this.review.frames.push({ fen: end.fen(), arrows: [{ ...r, color: 'blue' }], marks: [], slide: r, faded: [w.to], text: fmt(t.key, t.vars) }, ...right);
    this.setReviewText(fmt(t.key, t.vars));
    this.play(1, OPPONENT_REPLY_MS);
  }

  /** The right move (§B21 item 1): back to the position, then the piece slides in, both squares lit, the arrow stays,
   * and one line in plain words. REPLAY (↺) plays it all again. */
  private rightFrames(pre: string, answer: string): Frame[] {
    const s = this.host.app.settings;
    const t = describeMove(pre, answer, s.pieceStyle === 'classic' ? 'role' : 'species', !!s.coords, (k) => fmt(k));
    const text = fmt(t.key, t.vars);
    const m = { from: answer.slice(0, 2), to: answer.slice(2, 4) };
    const end = new Chess(pre);
    end.move({ from: m.from, to: m.to, promotion: answer[4] });
    return [
      { fen: pre, arrows: [{ ...m, color: 'green' }], marks: [], text },
      { fen: end.fen(), arrows: [{ ...m, color: 'green' }], marks: [], slide: m, text },
    ];
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
    const text = r.frames[r.idx]!.text;
    if (text) this.setReviewText(text);
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
  refreshBanner(pop = false): void {
    if (this.context?.banner) this.setBanner(this.context.banner(), pop);
  }

  /** A line in the puzzle bar, e.g. a trainer battle's pips; `pop` bounces it when a pip changes (design J). */
  setBanner(text: string | null, pop = false): void {
    this.banner.hidden = text === null;
    this.banner.textContent = text ?? '';
    this.banner.classList.remove('pop');
    if (pop) {
      void this.banner.offsetWidth; // restart the animation
      this.banner.classList.add('pop');
    }
  }

  hint(): void {
    if (this.phase !== 'player' || !this.run) return;
    this.hints++;
    const uci = this.run.expected();
    this.host.hint(this.hints === 1 ? [uci.slice(0, 2)] : [uci.slice(0, 2), uci.slice(2, 4)]);
  }
}
