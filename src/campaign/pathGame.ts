// SPDX-License-Identifier: AGPL-3.0-only
// Pikachu's Path controller (§B17, YELLOW): one move puzzles on the main board, free hints, one sticker per lesson.
import { Chess } from 'chess.js';
import { SPECIES } from '../board/pieces';
import type { Rng } from '../game/rng';
import { fmt, type StringKey } from '../game/text';
import { button, el } from '../ui/dom';
import { pathScreen, stickerPanel } from '../ui/shelf';
import { loadCampaign, saveCampaign, type Campaign } from './kanto';
import { grantUnlocks, UNLOCKS } from './yellowTeam';
import { AUTHORED, hintMove, meets, mateLessons, type Lesson, type PathPuzzle } from './path';
import { pool } from './trainer';

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
}

export class PathGame {
  readonly bar: HTMLElement;
  phase: 'idle' | 'player' | 'moving' | 'solved' = 'idle';
  private lesson: Lesson | null = null;
  private idx = 0;
  private readonly progress: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;

  constructor(private readonly host: PathHost) {
    this.bar = el('div', 'path-bar');
    this.bar.hidden = true;
    this.progress = el('p', 'path-progress');
    this.progress.dataset.testid = 'path-progress';
    this.nextBtn = button('path.next', () => this.next(), 'path-next', 'primary');
    this.bar.append(this.progress, button('path.hint', () => this.hint(), 'path-hint'), this.nextBtn, button('back', () => this.open(), 'path-back', 'secondary'));
  }

  private get campaign(): Campaign {
    return loadCampaign();
  }

  open(): void {
    this.stop();
    this.host.show(pathScreen(this.campaign.path, { lesson: (n) => void this.start(n), stickers: () => this.host.stickers(() => this.open()), back: () => this.host.home() }));
  }

  stop(): void {
    this.phase = 'idle';
    this.lesson = null;
    this.bar.hidden = true;
  }

  async start(n: number): Promise<void> {
    this.lesson = n <= AUTHORED.length ? AUTHORED[n - 1]! : (mateLessons(await pool('mateIn1'))[n - AUTHORED.length - 1] ?? null);
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
    this.nextBtn.hidden = true;
    this.progress.textContent = fmt('path.progress', { n: String(this.idx + 1) });
    this.host.say(`path.goal.${p.goal}` as StringKey);
    this.phase = 'player';
  }

  /** A move from the board: right moves play, wrong ones are put back with "Try again!". */
  submit(uci: string): void {
    const p = this.current;
    if (this.phase !== 'player' || !p) return;
    const after = new Chess(p.fen);
    const move = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!meets(p, move, after)) {
      this.host.say('path.again');
      this.host.startBoard(p.fen);
      this.host.marks(p.star ? [p.star] : [], []);
      return;
    }
    this.phase = 'moving';
    this.host.applyMove(uci);
  }

  settled(): void {
    if (this.phase !== 'moving') return;
    this.phase = 'solved';
    this.host.say('path.good');
    this.nextBtn.hidden = false;
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
      return this.puzzle();
    }
    this.finish(this.lesson.n);
  }

  /** Lesson done: the next sticker from YELLOW's fixed list (fix 3, no chance), then back to the path. A replayed
   * lesson shows the sticker it gave the first time. */
  private finish(n: number): void {
    this.stop();
    const c = this.campaign;
    const { campaign, got } = grantUnlocks({ ...c, path: Math.max(c.path, n) });
    saveCampaign(campaign);
    const id = got[0] ?? UNLOCKS[Math.min(n, UNLOCKS.length) - 1]!;
    const modal = this.host.modal;
    modal.replaceChildren(
      stickerPanel(id, SPECIES[id]!.name, () => {
        modal.hidden = true;
        this.open();
      }),
    );
    modal.hidden = false;
  }
}
