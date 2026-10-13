// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

type Row = [string, string, string, number];
type KC = { puzzleAnswer(): string | null; puzzlePhase(): string; forcePuzzle(row: Row, theme: string): void; openPuzzles(): void };
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());
const answer = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzleAnswer());
/** Lichess 0BLbM, mate in 1 (as in pacing.spec.ts): the set up Ra6-a8, then your Re2-e1#. */
const MATE_IN_1: Row = ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480];

/** Plain puzzles; `row` pins the first one (a mate in 1) instead of a random theme's. */
async function openPuzzles(page: Page, row?: Row) {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  // With storage blocked the cartridge shelf shows every launch: pick BLUE.
  if (await page.getByTestId('cart-blue').isVisible()) await page.getByTestId('cart-blue').click();
  // Off: no battle screens, so the test runs at board speed.
  await page.getByTestId('settings').click();
  await page.getByTestId('set-anim').selectOption('off');
  await page.getByTestId('back').click();
  if (row) await page.evaluate((r) => (window as unknown as { __kc: KC }).__kc.forcePuzzle(r, 'mateIn1'), row);
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.openPuzzles());
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
}

async function playAnswer(page: Page) {
  const uci = (await answer(page))!;
  await page.click(`[data-square="${uci.slice(0, 2)}"]`);
  await page.click(`[data-square="${uci.slice(2, 4)}"]`);
  if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
}

test.use({ viewport: { width: 360, height: 640 } });

test('puzzles work with storage blocked: a solve counts toward the Trainer Level', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPuzzles(page, MATE_IN_1);
  // W3: no rating line mid-puzzle (the Trainer Card has it); the goal is in the header.
  await expect(page.getByTestId('trainer-rating')).toBeHidden();
  await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move');
  expect(await answer(page)).toBe('e2e1');
  await playAnswer(page);
  // Pacing: a solve has its beat ('solved') before the review.
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('review');
  const fen = await page.evaluate(() => (JSON.parse((window as unknown as { __kc: { dumpState(): string } }).__kc.dumpState()) as { fen: string }).fen);
  expect(new Chess(fen).isCheckmate()).toBe(true);
  await expect(page.getByTestId('text-main')).toHaveText('Checkmate! Well done.');
  await expect(page.getByTestId('review')).toBeVisible();
  // A first solve raises the rating, but no "+N" until the level settles after 10 rated puzzles (playtest, 12 Oct).
  await expect(page.getByTestId('trainer-rating')).toBeHidden();
  // The solve still counts with storage blocked: back home, the Trainer Level reads new (1/10).
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-quit').click();
  await expect(page.getByTestId('hub-card-mini')).toContainText('Trainer Level: new (1/10)');
  expect(errors).toEqual([]);
});

test('hint outlines the piece, then its square; a wrong move shows the answer', async ({ page }) => {
  await openPuzzles(page);
  const uci = (await answer(page))!;
  await page.getByTestId('hint').click();
  await expect(page.locator('.sq.hint')).toHaveCount(1);
  await expect(page.locator(`[data-square="${uci.slice(0, 2)}"]`)).toHaveClass(/hint/);
  await page.getByTestId('hint').click();
  await expect(page.locator('.sq.hint')).toHaveCount(2);
  // The next one is pinned: a random one can leave a piece selected that has no wrong move to try, and the next square
  // tried then captures with it, so `played` stays false (about 1 run in 80, e.g. "SNORLAX to c1 SANDSLASH fainted!").
  await page.evaluate((r) => (window as unknown as { __kc: KC }).__kc.forcePuzzle(r, 'mateIn1'), MATE_IN_1);
  await page.getByTestId('next-puzzle').click();
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  // Play a legal move that is not the answer: try each piece until one has another target.
  const want = (await answer(page))!;
  const before = (JSON.parse(await page.evaluate(() => (window as unknown as { __kc: { dumpState(): string } }).__kc.dumpState())) as { fen: string }).fen;
  const squares = await page.locator('.sq[data-piece]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.square!));
  let played = false;
  for (const sq of squares) {
    await page.click(`[data-square="${sq}"]`);
    const targets = await page.locator('.sq.dot, .sq.capture').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.square!));
    // Any mating move counts as solved (as on Lichess), so the "wrong" move must not mate.
    const to = targets.find((t) => {
      if (sq + t === want.slice(0, 4)) return false;
      const c = new Chess(before);
      try {
        c.move({ from: sq, to: t, promotion: 'q' });
      } catch {
        return false;
      }
      return !c.isCheckmate();
    });
    if (to) {
      await page.click(`[data-square="${to}"]`);
      played = true;
      break;
    }
  }
  expect(played).toBe(true);
  await expect(page.getByTestId('text-main')).toContainText('Not quite. Watch what happens, then the right move.');
  expect(await phase(page)).toBe('review');
  await expect(page.getByTestId('review-answer')).toBeVisible();
});
