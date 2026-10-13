// SPDX-License-Identifier: AGPL-3.0-only
// Puzzle player: sets up a Lichess puzzle, checks each answer, auto plays the replies, gives hints and
// updates the Trainer Rating. Moves go through the normal board path, so captures still battle.
import { CARD_GUARD_MS, MOVE_SLIDE_MS, OPPONENT_REPLY_MS, PUZZLE_SETUP_MS, REVIEW_MOVE_MS, SOLVE_BEAT_MS, SOLVED_STAMP_MS, THINKING_LINE_MS, TURN_LINE_DELAY_MS } from '../config';
import { Chess } from 'chess.js';
import { describeMove, keyIdea, lineFrames, refutationText, type Frame } from './review';
import type { Color } from '../board/pieces';
import { createRng } from '../game/rng';
import { fmt, type StringKey, type Vars } from '../game/text';
import { button, el } from '../ui/dom';
import type { App } from '../main';
import type { Side } from '../look';
import { objective, PuzzleRun, type Answer, type PuzzleRow } from './puzzle';
import { loadTrainer, pick, pickEasy, pool, record, shownLevel, THEMES } from './trainer';
import { cancelHold, guard, hold, holding, onScreen, type HoldEnd, type HoldKind } from '../ui/pace';
import { warmEngine } from '../ai/engine';

export const REFUTATION_READ_MS = 3000; // a miss review's line that says why (the engine's reply) stays this long, or until a tap after HOLD_MIN_MS

/** The first puzzles of a save say how to move (W3). */
const TAP_HELP_PUZZLES = 3;
/** Every puzzle hold belongs to the game screen (fix, 13 Oct): one that starts while OPTION shows (a review step, the
 * solve) waits there on time but never takes OPTION's taps or keys. `wait`: the "Watch!" and reply holds stop while
 * OPTION or START is open and go on once the board is back (fix, 14 Oct), so no move is played unseen; reviews play on. */
const boardHold = (ms: number, kind: HoldKind, wait = false): Promise<HoldEnd> => hold(ms, kind, undefined, 'screen-game', { pauseAway: wait });
/** A reply to a wrong move: Stockfish's, or any legal one when the engine is out. */
type Reply = { uci: string; source: 'stockfish' | 'fallback' };

export interface PuzzleHost {
  app: App;
  /** Sets up the board with you at the bottom; `human` is the colour you play (you are always TEAM RED, W3). */
  startBoard(fen: string, human: Color): void;
  /** The opponent's name for lines like "{them} moves first. Watch!" (the plate's name). */
  them(): string;
  /** Counts a new puzzle on the save: how many were started before it, and whether the coach marks show (once). */
  firstSteps(): { n: number; coach: boolean };
  /** Coach marks (W3, design F): start them, add the "they moved" step, or close them when you move. 'start' may
   * return a promise that resolves once its bubbles are read, skipped or closed (fix, 14 Oct). */
  coach(event: 'start' | 'setup' | 'stop'): void | Promise<void>;
  /** The solve moment (W3, design J): stamp (unless `stamp` is false), sound, the opponent's "Oh no!". */
  solvedMoment(stamp?: boolean): void;
  /** The SOLVED! stamp goes (its hold is over, the review opens, a new position). */
  unstamp(): void;
  /** A wrong move (pacing A14): the piece on `square` shakes. */
  miss(square: string): void;
  /** Pacing: whether the game screen shows now; a new puzzle then dips the board, else the battle bars close first. */
  onBoard(): boolean;
  /** The battle bars close (resolves when shut) and wait for the board; uncover() shows whatever is mounted. */
  cover(): Promise<void>;
  uncover(): void;
  /** A new position on the game screen: the board dips and `swap` runs at the peak. */
  dip(swap: () => void | Promise<void>): Promise<void>;
  /** Resolves once no cover or dip is up. */
  revealed(): Promise<void>;
  /** Review (§B15): shows a position with arrows and marks, frozen; clears them again. */
  showFrame(frame: Frame): void;
  clearFrames(): void;
  /** Stockfish's best reply in a position (the refutation of a wrong move). */
  engineReply(fen: string): Promise<string>;
  applyMove(uci: string): boolean;
  say(key: StringKey, vars?: Vars): void;
  hint(squares: string[]): void;
}

// 'solved': the solve beat and stamp before the review (pacing A11).
type Phase = 'idle' | 'setup' | 'player' | 'checking' | 'reply' | 'solved' | 'review' | 'over';
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
  /** The first trainers (W5): positions with the fewest pieces first, whatever the rating. */
  easy?: boolean;
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
  /** `play` counts replays: a newer one (or ◀ ▶, or the end) stops the one running. */
  private review: { frames: Frame[]; idx: number; play: number; result: Result; pre: string } | null = null;
  private readonly acts: HTMLElement;
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
    // "Back" (fix, 14 Oct): it returns to the route or the Training list, not the map ('route.leave' read "Map").
    this.leaveBtn = button('back', () => this.context?.onLeave(), 'leave-grass');
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
      replay: mk('review.replay', 'replay', () => void this.replay(0), 'review.replayLabel'),
      answer: mk('review.answer', 'answer', () => this.showAnswer()),
      new: mk('review.new', 'new', () => this.finishReview()),
      continue: mk('review.continue', 'continue', () => this.finishReview()),
    };
    const nav = el('div', 'review-nav');
    nav.append(this.btn.prev, this.btn.replay, this.btn.next);
    const acts = el('div', 'review-acts');
    this.acts = acts;
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

  /** Starts a puzzle. `ctx`: a route's tall grass; null: plain puzzles; omitted: keep the current one.
   * Pacing (§2): from another screen the battle bars close on the tap and open on the board; on the game screen the
   * board dips and the new position comes in at the peak. Either one waits there while the theme's puzzles load, and
   * the "Watch!" hold starts once it is gone (after a first puzzle's coach marks are read, fix 14 Oct). A load that
   * ends while OPTION shows leaves the new position for the way back, where it comes in with its own dip (fix, 14 Oct:
   * it pulled the player off OPTION). */
  async start(ctx?: PuzzleContext | null): Promise<void> {
    if (ctx !== undefined) this.context = ctx;
    warmEngine(); // a miss review asks the engine: its first load starts with the puzzle (fix, 14 Oct)
    const g = ++this.gen;
    this.phase = 'idle';
    this.hints = 0;
    const wanted = this.context ? this.context.themes : [this.theme];
    const choices = wanted.includes('mixed') ? THEMES : wanted.filter((t) => THEMES.includes(t));
    const forced = this.forced;
    this.forced = null;
    const theme = forced?.theme ?? choices[Math.floor(this.rng.next() * choices.length)] ?? THEMES[0]!;
    const load = forced ? Promise.resolve([forced.row]) : pool(theme);
    load.catch(() => undefined); // handled where it is awaited
    const got: { setup: { move: string; coach: boolean } | null } = { setup: null };
    /** `board`: only while the game screen shows (a dip's peak); the cover's own swap is how the board first shows. */
    const setUp = async (board: boolean) => {
      const rows = await load;
      if (g === this.gen && !got.setup && (!board || this.host.onBoard())) got.setup = this.setUp(rows, theme);
    };
    // "Finding a puzzle…" only when the load is slow: on the cover or the dip after COVER_LABEL_MS (no 20 ms flash).
    if (this.host.onBoard()) {
      await this.host.dip(() => setUp(true));
      // Not in yet: the load ended behind OPTION, or outlasted the dip (COVER_MAX_MS). It comes in on the board.
      while (!got.setup) {
        if (!(await load.then(() => true, () => false)) || g !== this.gen) return;
        if (got.setup) break; // the first dip's swap got it in after all
        if (!(await onScreen('screen-game', () => g !== this.gen)) || g !== this.gen) return;
        await this.host.dip(() => setUp(true));
        if (g !== this.gen) return;
      }
    } else {
      // A load that fails, or never shows the board, still lifts the cover (COVER_MAX_MS at the latest).
      try {
        await this.host.cover();
        await setUp(false);
      } finally {
        this.host.uncover();
      }
    }
    const s = got.setup;
    if (!s || g !== this.gen) return;
    await this.host.revealed();
    if (g !== this.gen) return;
    // The coach marks first, then the "Watch!" hold (fix, 14 Oct: the move played under the first bubble).
    if (s.coach) await this.host.coach('start');
    if (g !== this.gen) return;
    // The position first, then the opponent's set up move (W3, ux #6): the player sees what is about to happen.
    if ((await boardHold(PUZZLE_SETUP_MS, 'setup', true)) === 'cancel' || g !== this.gen) return;
    this.host.applyMove(s.move);
  }

  /** The new position, at the dip's peak or under the cover: its set up move, and whether the coach marks show. */
  private setUp(rows: PuzzleRow[], theme: string): { move: string; coach: boolean } {
    this.themeSel.hidden = this.context !== null;
    this.leaveBtn.hidden = this.context === null;
    this.nextBtn.hidden = this.context?.battle === true;
    if (!this.context?.battle) this.setBanner(null);
    this.bar.hidden = false;
    this.puzzleTheme = theme;
    this.endReview();
    this.ratingEl.hidden = true;
    this.row = (this.context?.easy ? pickEasy(rows, this.trainer.seen) : null) ?? pick(rows, this.trainer.rating.r + (this.context?.boost ?? 0), this.trainer.seen, this.rng);
    this.run = new PuzzleRun(this.row);
    const move = this.run.first();
    const first = this.host.firstSteps();
    this.tapHelp = first.n < TAP_HELP_PUZZLES;
    this.refreshBanner(this.context?.battle === true && this.host.onBoard()); // the pips pop with the new position (A13)
    this.host.startBoard(this.row[1], this.run.side);
    this.host.app.board.locked = true;
    this.phase = 'setup';
    this.host.say('puzzle.watch', { them: this.host.them() });
    return { move, coach: first.coach };
  }

  stop(): void {
    if (this.phase !== 'idle') cancelHold(); // its "Watch!", reply or solve hold goes with it
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

  /** Called by the game once a move is made and starts to slide (`slide` ms: the opponent's are slower, pacing). */
  settled(slide = MOVE_SLIDE_MS): void {
    const g = this.gen;
    const board = this.host.app.board;
    if (this.phase === 'setup' || this.phase === 'reply') {
      const was = this.phase;
      this.pending = null;
      board.locked = true;
      // The board opens when their piece lands, and the line follows a moment later (A9, A10), so it is read after
      // the move it is about. You are always TEAM RED (W3): no side names here, just whose turn it is.
      window.setTimeout(() => {
        if (g !== this.gen || this.phase !== was) return;
        this.phase = 'player';
        board.locked = false;
        if (was === 'setup') this.host.coach('setup');
        const line = was === 'reply' ? 'puzzle.correct' : this.tapHelp ? 'puzzle.yourTurnTap' : 'puzzle.yourTurn';
        window.setTimeout(() => g === this.gen && this.phase === 'player' && this.host.say(line), TURN_LINE_DELAY_MS);
      }, slide);
    } else if (this.phase === 'checking' && this.pending && this.row) {
      const res = this.pending;
      if (res.done) {
        const before = this.trainer.rating.r;
        const result = this.hints > 0 ? 'assisted' : 'solved';
        this.trainer = record(this.trainer, this.row, result);
        board.locked = true;
        this.phase = 'solved';
        // A small "+12" only when the rating went up (W3, design J) and has settled (playtest, 12 Oct: no "+494" on a
        // first solve); no numbers mid-puzzle otherwise.
        const up = Math.round(this.trainer.rating.r) - Math.round(before);
        this.ratingEl.hidden = up <= 0 || shownLevel(this.trainer).r === null;
        this.ratingEl.textContent = fmt('puzzle.ratingUp', { n: String(up) });
        const mate = !!this.run && new Chess(this.run.currentFen()).isCheckmate();
        window.setTimeout(() => g === this.gen && void this.solveBeat(result, mate ? 'puzzle.solvedMate' : 'puzzle.solved'), slide);
      } else {
        this.phase = 'reply';
        board.locked = true;
        // Your move's line stays while they answer (A10, A18): a hold a tap can cut after HOLD_MIN_MS.
        void boardHold(OPPONENT_REPLY_MS, 'reply', true).then((how) => how !== 'cancel' && g === this.gen && this.phase === 'reply' && res.reply && this.host.applyMove(res.reply));
      }
    }
  }

  /** The solve (pacing A11), from the moment the mating piece lands: the line and the pip at once, the board alone for
   * SOLVE_BEAT_MS, then the stamp, the sound and "Oh no!" for SOLVED_STAMP_MS, then the review. One hold; a skip
   * after HOLD_MIN_MS opens the review at once. */
  private async solveBeat(result: Result, line: StringKey): Promise<void> {
    const g = this.gen;
    this.host.say(result === 'assisted' ? 'puzzle.assisted' : line);
    this.context?.onAttempt?.(result);
    let stamped = false;
    const stamp = window.setTimeout(() => {
      stamped = true;
      this.host.solvedMoment();
    }, SOLVE_BEAT_MS);
    const how = await boardHold(SOLVE_BEAT_MS + SOLVED_STAMP_MS, 'solved');
    window.clearTimeout(stamp);
    this.host.unstamp(); // the stamp ends with its hold, also skipped or cancelled (fix, 13 Oct)
    if (how === 'cancel' || g !== this.gen) return;
    if (!stamped) this.host.solvedMoment(false); // skipped early: the sound and "Oh no!" still, no stamp over the review
    this.reviewSolved(result);
  }

  /** Solved (pacing A12): the final position with the theme's key idea for REVIEW_MOVE_MS, the board dips back to the
   * start, the line replays one move per REVIEW_MOVE_MS and ends on the key idea again. A skip jumps to the key idea. */
  private reviewSolved(result: Result): void {
    const run = this.run!;
    const frames = lineFrames(run.startFen, run.played, 'green');
    const idea = keyIdea(this.puzzleTheme, run.startFen, run.played, run.side);
    const last = frames[frames.length - 1]!;
    frames[frames.length - 1] = { ...last, arrows: [...last.arrows, ...idea.lines], marks: idea.marks };
    this.openReview(result, frames, fmt(idea.text.key, idea.text.vars), run.startFen);
    this.show(frames.length - 1);
    void this.replay(0, { wait: true });
  }

  /** Wrong (pacing A14): your move in red (the piece shakes), then it slides in faded, then the punishing reply (at the
   * earliest OPPONENT_REPLY_MS later; "{them} is thinking…" while the engine is still out) with the line that says why,
   * held REFUTATION_READ_MS (fix, 14 Oct: it went after 0.9 s, under half the time to read it), back to the position
   * and the right move. Each step is a hold a tap can cut after HOLD_MIN_MS. ◀ ▶ ↺ stop only the playback: the reply
   * and the right move join the line whenever the engine answers (fix, 13 Oct: a tap in the first second lost them). */
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
    this.host.miss(w.from);
    const r = this.review!;
    const t = ++r.play;
    /** This review is still up (the frames may grow), and nothing took over its playback (it may go on). */
    const ours = () => g === this.gen && this.review === r;
    const live = () => ours() && r.play === t;
    const right = this.rightFrames(pre, answer);
    const over = chess.isGameOver();
    let answered = false;
    const thinking = fmt('ai.loading', { trainer: this.host.them() });
    // The engine works while the player looks at the miss.
    const built = (over ? Promise.resolve<Reply>({ uci: '', source: 'fallback' }) : this.refutation(after, chess)).then(({ uci, source }) => {
      answered = true;
      if (!ours()) return false;
      if (uci) {
        const end = new Chess(after);
        end.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        // The opponent by name (W3): "That lets YOUNGSTER TOBY take your BULBASAUR", never your own team's name. A
        // fallback is just a legal move, so it never claims to hurt (fix, 14 Oct): "Here is one answer."
        const said = source === 'stockfish' ? refutationText(after, uci, you, this.host.them()) : { key: 'review.wrong.any' as const, vars: {} };
        const m = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
        frames.push({ fen: end.fen(), arrows: [{ ...m, color: 'blue' }], marks: [], slide: m, faded: [w.to], text: fmt(said.key, said.vars) });
      }
      frames.push(...right);
      // The wait is over (fix, 14 Oct): "… is thinking" stayed after ◀ ▶ on a frame with no line of its own.
      if (this.reviewText.textContent === thinking) this.setReviewText(r.frames[r.idx]?.text ?? fmt('puzzle.wrong'));
      this.nav(); // ▶ comes back on wherever the player is
      return uci !== '';
    });
    if ((await boardHold(OPPONENT_REPLY_MS, 'miss')) === 'cancel' || !live()) return;
    this.show(1);
    if (over) {
      await built;
      if (!ours() || !live()) return;
      this.setReviewText(fmt('review.wrong.over'));
      return this.replay(2, { ms: OPPONENT_REPLY_MS, wait: true, skip: 'step' }, t);
    }
    const slow = window.setTimeout(() => !answered && live() && this.setReviewText(thinking), THINKING_LINE_MS);
    if ((await boardHold(OPPONENT_REPLY_MS, 'miss')) === 'cancel' || !live()) return window.clearTimeout(slow);
    const replied = await built;
    window.clearTimeout(slow);
    if (!ours() || !live()) return;
    this.show(2);
    // Their reply and why it hurts: read, then the right move (a tap after HOLD_MIN_MS moves on).
    if ((await boardHold(replied ? REFUTATION_READ_MS : OPPONENT_REPLY_MS, 'miss')) === 'cancel' || !live()) return;
    return this.replay(3, { ms: OPPONENT_REPLY_MS, skip: 'step' }, t);
  }

  /** Stockfish's punishing reply to a wrong move, or any legal one when the engine is out. */
  private async refutation(after: string, chess: Chess): Promise<Reply> {
    let reply: string;
    let source: Reply['source'] = 'stockfish';
    try {
      reply = await this.host.engineReply(after);
    } catch (err) {
      console.warn('refutation engine unavailable:', err instanceof Error ? err.message : err);
      // Any legal reply keeps the review going: the biggest capture, else the first move.
      const moves = chess.moves({ verbose: true }).sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
      reply = moves[0] ? moves[0].from + moves[0].to + (moves[0].promotion ?? '') : '';
      source = 'fallback';
    }
    if (reply) this.lastRefutation = { fen: after, uci: reply, source };
    return { uci: reply, source };
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
    void this.replay(0);
  }

  private openReview(result: Result, frames: Frame[], text: string, pre: string): void {
    this.endReview();
    this.phase = 'review';
    this.review = { frames, idx: 0, play: 0, result, pre };
    this.reviewEl.hidden = false;
    // The panel fades in (REVIEW_IN_MS, opacity only) and never refits the board (R5); Continue waits CARD_GUARD_MS.
    this.reviewEl.classList.remove('review-in');
    void this.reviewEl.offsetWidth;
    this.reviewEl.classList.add('review-in');
    guard(this.acts, CARD_GUARD_MS);
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
    this.select(i);
    this.host.showFrame(r.frames[r.idx]!);
  }

  /** The frame index, its line and ◀ ▶ at once; the board follows (at a dip's peak when it goes back). */
  private select(i: number): void {
    const r = this.review!;
    r.idx = Math.max(0, Math.min(r.frames.length - 1, i));
    const text = r.frames[r.idx]!.text;
    if (text) this.setReviewText(text);
    this.nav();
  }

  /** ◀ ▶ for the frame shown, also when frames join the line later (the miss review's reply and right move). */
  private nav(): void {
    const r = this.review;
    if (!r) return;
    this.btn.prev.disabled = r.idx === 0;
    this.btn.next.disabled = r.idx === r.frames.length - 1;
  }

  /** To frame `i`: a move slides in; going back, or to a position that is not one move on, dips the board (§2). */
  private async goTo(i: number): Promise<void> {
    const r = this.review;
    if (!r) return;
    if (i < r.idx || (i !== r.idx && !r.frames[i]?.slide)) {
      this.select(i);
      const at = r.idx;
      await this.host.dip(() => (this.review === r && r.idx === at ? this.host.showFrame(r.frames[at]!) : undefined));
    } else this.show(i);
  }

  /** ◀ and ▶ stop a replay and step one frame. */
  private step(d: number): void {
    const r = this.review;
    if (!r) return;
    r.play++;
    this.stopReplayHold();
    void this.goTo(Math.max(0, Math.min(r.frames.length - 1, r.idx + d)));
  }

  /** Back to `from`, then one frame per `ms` to the end, each step a hold. `wait` holds on the frame shown first. A skip
   * ends on the last frame (the key idea), or with `skip: 'step'` only cuts that step short. `token` continues a
   * replay already running (the miss review). */
  private async replay(from: number, o: { ms?: number; wait?: boolean; skip?: 'end' | 'step' } = {}, token?: number): Promise<void> {
    const r = this.review;
    if (!r) return;
    const t = token ?? ++r.play;
    const live = () => this.review === r && r.play === t;
    for (let i = from; i < r.frames.length; i++) {
      if (i > from || o.wait) {
        const how = await boardHold(o.ms ?? REVIEW_MOVE_MS, o.skip === 'step' ? 'miss' : 'review');
        if (how === 'cancel' || !live()) return;
        if (how === 'skip' && o.skip !== 'step') return this.show(r.frames.length - 1);
      }
      await this.goTo(i);
      if (!live()) return;
    }
  }

  /** A replay's step hold goes with the replay, so it never eats the next tap. */
  private stopReplayHold(): void {
    if (holding() === 'review' || holding() === 'miss') cancelHold();
  }

  /** `keepSlot`: the panel goes invisible but keeps its room until the next position (R5: nothing below the board
   * jumps on Continue); else it goes away. */
  private endReview(keepSlot = false): void {
    if (this.review) this.review.play++;
    this.stopReplayHold();
    this.host.unstamp(); // a review that opens, a new position, a puzzle left (fix, 13 Oct)
    this.review = null;
    this.reviewEl.classList.toggle('gone', keepSlot);
    this.reviewEl.hidden = !keepSlot;
    this.host.clearFrames();
  }

  /** Continue (or "Try a new one"): only now does the battle, tall grass or Training move on. */
  private finishReview(): void {
    const r = this.review;
    if (!r) return;
    this.endReview(true);
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
