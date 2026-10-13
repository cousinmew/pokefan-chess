// SPDX-License-Identifier: AGPL-3.0-only
// Pikachu's Path controller (§B17, YELLOW): one move puzzles on the main board, free hints, one sticker per lesson.
import { Chess } from 'chess.js';
import { SPECIES, speciesFor } from '../board/pieces';
import type { Rng } from '../game/rng';
import { fmt, type StringKey } from '../game/text';
import { button, el } from '../ui/dom';
import { pathScreen, stickerPanel } from '../ui/shelf';
import { loadCampaign, saveCampaign, type Campaign } from './kanto';
import { grantUnlocks, UNLOCKS } from './yellowTeam';
import { AUTHORED, hintMove, meets, mateLessons, type Lesson, type PathPuzzle } from './path';
import { pool } from './trainer';
import { MOVE_SLIDE_MS, PATH_NEXT_DELAY_MS } from '../config';
import { sound } from '../audio/audio';
import { guard } from '../ui/pace';

export interface PathHost {
  show(view: HTMLElement): void;
  modal: HTMLElement;
  /** Shows a position on the board in "path" mode, your side to move. */
  startBoard(fen: string): void;
  applyMove(uci: string): boolean;
  say(key: StringKey, vars?: Record<string, string>): void;
  /** Star and hint squares on the board. */
  marks(stars: string[], hints: string[]): void;
  home(): void;
  stickers(back: () => void): void;
  rng: Rng;
  /** Pacing (§2): the next position comes in under a dip of the board. */
  dip(swap: () => void | Promise<void>): Promise<void>;
  /** A cover up while lessons 10 to 12 load; uncover() shows what is mounted. */
  cover(): Promise<void>;
  uncover(): void;
  /** Six stars burst from a square (a right move, D4). */
  cheer(square: string): void;
}

/** Oak's warm-up in BLUE (W5): what follows the last move, or Skip. No sticker. */
export interface WarmupHooks {
  done(): void;
  skip(): void;
}

export class PathGame {
  readonly bar: HTMLElement;
  phase: 'idle' | 'player' | 'moving' | 'solved' = 'idle';
  private lesson: Lesson | null = null;
  private idx = 0;
  private readonly progress: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly hintBtn: HTMLButtonElement;
  /** Set while Oak's warm-up runs (W5): no sticker at the end, Skip instead of Back, the step goal in the header. */
  private hooks: WarmupHooks | null = null;

  constructor(private readonly host: PathHost) {
    this.bar = el('div', 'path-bar');
    this.bar.hidden = true;
    this.progress = el('p', 'path-progress');
    this.progress.dataset.testid = 'path-progress';
    this.nextBtn = button('path.next', () => this.next(), 'path-next', 'primary');
    this.backBtn = button('back', () => this.open(), 'path-back', 'secondary');
    this.skipBtn = button('warm.skip', () => this.leave('skip'), 'warmup-skip', 'secondary');
    this.hintBtn = button('path.hint', () => this.hint(), 'path-hint');
    this.bar.append(this.progress, this.hintBtn, this.nextBtn, this.backBtn, this.skipBtn);
  }

  /** Oak's warm-up (W5): the lesson's positions on the main board, then `hooks.done` (or `hooks.skip`). */
  run(lesson: Lesson, hooks: WarmupHooks): void {
    this.lesson = lesson;
    this.hooks = hooks;
    this.idx = 0;
    this.puzzle();
  }

  private leave(how: keyof WarmupHooks): void {
    const h = this.hooks;
    this.stop();
    h?.[how]();
  }

  /** The step's goal for the header: the warm-up's ("Take the RATTATA!"), or the lesson's in YELLOW, so it stays
   * there while the text box says "Try again!" (playtest, 12 Oct). */
  objective(): string {
    const p = this.current;
    if (!p) return '';
    if (!this.hooks) return fmt(`path.goal.${p.goal}` as StringKey);
    const take = p.goal === 'capture' ? hintMove(p) : null;
    const them = new Chess(p.fen).turn() === 'w' ? 'b' : 'w';
    const piece = take?.captured ? speciesFor(them, take.captured, take.to).name : '';
    return fmt(`warm.${this.idx + 1}` as StringKey, { piece });
  }

  private get campaign(): Campaign {
    return loadCampaign();
  }

  /** The Path; `fresh`, a lesson that just opened, pulses twice once the screen is in (pacing D7). */
  open(fresh?: number): void {
    this.stop();
    const view = pathScreen(this.campaign.path, { lesson: (n) => void this.start(n), stickers: () => this.host.stickers(() => this.open()), back: () => this.host.home() });
    if (fresh) view.querySelector(`[data-testid="lesson-${fresh}"]:not([disabled])`)?.classList.add('path-new');
    this.host.show(view);
  }

  stop(): void {
    this.phase = 'idle';
    this.lesson = null;
    this.hooks = null;
    this.bar.hidden = true;
    this.bar.classList.remove('gone');
  }

  async start(n: number): Promise<void> {
    if (n <= AUTHORED.length) this.lesson = AUTHORED[n - 1]!;
    else {
      void this.host.cover(); // lessons 10 to 12 come from the puzzle file: the cover waits for it (pacing §2)
      try {
        this.lesson = mateLessons(await pool('mateIn1'))[n - AUTHORED.length - 1] ?? null;
      } finally {
        this.host.uncover();
      }
    }
    if (!this.lesson) return this.open();
    this.idx = 0;
    this.puzzle();
  }

  private get current(): PathPuzzle | null {
    return this.lesson?.puzzles[this.idx] ?? null;
  }

  private puzzle(): void {
    const p = this.current;
    if (!p) return;
    this.host.startBoard(p.fen);
    this.host.marks(p.star ? [p.star] : [], []);
    this.bar.hidden = false;
    this.bar.classList.remove('gone');
    this.nextBtn.hidden = true;
    this.hintBtn.hidden = false;
    this.backBtn.hidden = !!this.hooks;
    this.skipBtn.hidden = !this.hooks;
    this.progress.textContent = fmt(this.hooks ? 'warm.step' : 'path.progress', { n: String(this.idx + 1) });
    // The warm-up says the idea in plain words (playtest, 12 Oct: "check means attack the king"); its goal is in the header.
    this.host.say(this.hooks ? (`warm.teach.${this.idx + 1}` as StringKey) : (`path.goal.${p.goal}` as StringKey));
    this.phase = 'player';
  }

  /** A move from the board: right moves play, wrong ones are put back with "Try again!". */
  submit(uci: string): void {
    const p = this.current;
    if (this.phase !== 'player' || !p) return;
    const after = new Chess(p.fen);
    const move = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!meets(p, move, after)) {
      // The board first: starting it clears the text box, and the line must outlive it (playtest, 12 Oct).
      this.host.startBoard(p.fen);
      this.host.marks(p.star ? [p.star] : [], []);
      this.host.say('path.again');
      return;
    }
    this.phase = 'moving';
    this.lastTo = uci.slice(2, 4);
    this.host.applyMove(uci);
  }

  /** The square the last right move went to (the stars burst there). */
  private lastTo = '';

  /** A right move landed (pacing D4): at the end of its slide the stars, "Great job!" and a chime; Next fades into the
   * Hint button's place PATH_NEXT_DELAY_MS later and ignores taps for CARD_GUARD_MS. */
  settled(slide = MOVE_SLIDE_MS): void {
    if (this.phase !== 'moving') return;
    this.phase = 'solved';
    const lesson = this.lesson;
    const idx = this.idx;
    const same = () => this.lesson === lesson && this.idx === idx && this.phase === 'solved';
    window.setTimeout(() => {
      if (!same()) return;
      this.host.say('path.good');
      if (this.lastTo) this.host.cheer(this.lastTo);
      sound.sparkle();
      window.setTimeout(() => {
        if (!same()) return;
        this.hintBtn.hidden = true; // nothing left to hint after a solve (playtest, 12 Oct)
        this.nextBtn.hidden = false;
        this.nextBtn.classList.add('fade-in');
        guard(this.nextBtn);
      }, PATH_NEXT_DELAY_MS);
    }, slide);
  }

  /** Free and unlimited: the piece and where it goes. */
  hint(): void {
    const p = this.current;
    const m = p && this.phase === 'player' ? hintMove(p) : null;
    if (m) this.host.marks(p?.star ? [p.star] : [], [m.from, m.to]);
  }

  private next(): void {
    if (this.phase !== 'solved' || !this.lesson) return;
    if (this.idx < this.lesson.puzzles.length - 1) {
      this.idx++;
      this.phase = 'idle';
      // The board dips and the next position comes in at the peak, with the progress chip popping (pacing D5).
      return void this.host.dip(() => {
        this.puzzle();
        this.progress.classList.remove('pop');
        void this.progress.offsetWidth;
        this.progress.classList.add('pop');
      });
    }
    if (this.hooks) return this.leave('done');
    this.finish(this.lesson.n);
  }

  /** Lesson done: the next sticker from YELLOW's fixed list (fix 3, no chance), then back to the path. A replayed
   * lesson shows the sticker it gave the first time. */
  private finish(n: number): void {
    const opened = n > this.campaign.path ? n + 1 : undefined;
    this.stop();
    this.bar.hidden = false;
    this.bar.classList.add('gone'); // the bar keeps its place under the sticker card (pacing D6, R5)
    const c = this.campaign;
    const { campaign, got } = grantUnlocks({ ...c, path: Math.max(c.path, n) });
    saveCampaign(campaign);
    const id = got[0] ?? UNLOCKS[Math.min(n, UNLOCKS.length) - 1]!;
    const modal = this.host.modal;
    // The sticker bounces in and hops twice; OK ignores taps for CARD_GUARD_MS (src/ui/cards.ts).
    modal.replaceChildren(
      stickerPanel(id, SPECIES[id]!.name, () => {
        modal.hidden = true;
        this.open(opened);
      }),
    );
    modal.hidden = false;
  }
}
