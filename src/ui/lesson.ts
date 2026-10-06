// SPDX-License-Identifier: AGPL-3.0-only
// Oak's intro scene and the first time mini lessons (§B14). A lesson shows the theme's title and goal, and loops an
// example: the first three moves of a real puzzle of that theme, on a small board of Gen 1 sprites.
import { Chess } from 'chess.js';
import { LESSON_STEP_MS } from '../config';
import { speciesFor, spriteUrl, type Color, type Role } from '../board/pieces';
import type { PuzzleRow } from '../campaign/puzzle';
import { fmt, type StringKey } from '../game/text';
import { button, el, screen } from './dom';
import { mon, trainerSprite } from './kanto';

/** Picks the lesson example of a theme: its easiest puzzle with at least three moves. */
export function exampleOf(rows: PuzzleRow[]): PuzzleRow | null {
  return rows.find((r) => r[2].split(' ').length >= 3) ?? rows[0] ?? null;
}

/** A small looping board: the position, then each move with its squares tinted. */
function miniBoard(row: PuzzleRow): HTMLElement {
  const grid = el('div', 'mini-board');
  grid.dataset.testid = 'mini-board';
  const moves = row[2].split(' ').slice(0, 3);
  let step = 0;
  const draw = () => {
    const chess = new Chess(row[1]);
    let last: string[] = [];
    for (const m of moves.slice(0, step)) {
      chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      last = [m.slice(0, 2), m.slice(2, 4)];
    }
    grid.replaceChildren();
    for (let r = 8; r >= 1; r--) {
      for (const f of 'abcdefgh') {
        const sq = `${f}${r}`;
        const cell = el('div', `mini-sq ${('abcdefgh'.indexOf(f) + r) % 2 ? 'dark' : 'light'}${last.includes(sq) ? ' last' : ''}`);
        const p = chess.get(sq as never) as { color: Color; type: Role } | undefined;
        if (p) {
          const img = el('img');
          img.alt = '';
          img.src = spriteUrl(speciesFor(p.color, p.type, sq).dex, 'retro');
          cell.append(img);
        }
        grid.append(cell);
      }
    }
  };
  draw();
  const timer = window.setInterval(() => {
    if (!grid.isConnected) return window.clearInterval(timer);
    step = step >= moves.length ? 0 : step + 1;
    draw();
  }, LESSON_STEP_MS);
  return grid;
}

export function lessonScreen(theme: string, example: PuzzleRow | null, done: () => void, oak: string | undefined): HTMLElement {
  const title = el('h2');
  title.textContent = fmt(`lesson.${theme}.title` as StringKey);
  const goal = el('p', 'lesson-goal');
  goal.textContent = fmt(`lesson.${theme}.goal` as StringKey);
  const head = el('div', 'lesson-head');
  head.append(trainerSprite(oak, 'trainer-sprite slide-in'), el('p', '', 'lesson.oak'));
  const body: HTMLElement[] = [head, title, goal];
  if (example) body.push(el('p', 'small', 'lesson.example'), miniBoard(example));
  const s = screen('lesson', ...body, button('lesson.ok', done, 'lesson-ok', 'primary'));
  return s;
}

/** Oak's intro (§B14): Oak slides in, three lines, then Nidorino appears beside him. Skippable once seen. */
export function oakIntro(lines: string[], oak: string | undefined, canSkip: boolean, done: () => void): HTMLElement {
  const stage = el('div', 'intro-stage');
  const nido = mon('nidorino', 'menu-sprite intro-mon', false, false, true);
  nido.hidden = true;
  stage.append(trainerSprite(oak, 'trainer-sprite big slide-in'), nido);
  const box = el('div', 'panel story inline');
  box.dataset.testid = 'story';
  const p = el('p', 'story-text');
  p.dataset.testid = 'story-text';
  box.append(p, el('span', 'tb-tick', 'story.tap'));
  let i = 0;
  const show = () => {
    p.textContent = lines[i] ?? '';
    // As in the Gen 1 intro, a Pokémon appears beside the professor.
    nido.hidden = i < 1;
  };
  box.onclick = () => {
    i++;
    if (i < lines.length) show();
    else done();
  };
  show();
  const parts: HTMLElement[] = [stage, box];
  if (canSkip) parts.push(button('intro.skip', done, 'intro-skip', 'secondary'));
  return screen('intro', ...parts);
}
