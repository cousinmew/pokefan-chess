// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

type KC = { puzzleAnswer(): string | null; puzzlePhase(): string };
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());
const answer = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzleAnswer());

async function openPuzzles(page: Page) {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  // With storage blocked the cartridge shelf shows every launch: pick BLUE.
  if (await page.getByTestId('cart-blue').isVisible()) await page.getByTestId('cart-blue').click();
  // Off: no battle screens, so the test runs at board speed.
  await page.getByTestId('settings').click();
  await page.getByTestId('set-anim').selectOption('off');
  await page.getByTestId('back').click();
  await page.evaluate(() => (window as unknown as { __kc: { openPuzzles(): void } }).__kc.openPuzzles());
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
}

async function playAnswer(page: Page) {
  const uci = (await answer(page))!;
  await page.click(`[data-square="${uci.slice(0, 2)}"]`);
  await page.click(`[data-square="${uci.slice(2, 4)}"]`);
  if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
}

test.use({ viewport: { width: 360, height: 640 } });

test('puzzles work with storage blocked: solve one, the Trainer Rating moves', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPuzzles(page);
  await expect(page.getByTestId('trainer-rating')).toHaveText('Trainer Rating: about 600 (an estimate, not an official chess rating)');
  for (let i = 0; i < 6 && (await phase(page)) !== 'review'; i++) {
    await playAnswer(page);
    await expect.poll(() => phase(page), { timeout: 8000 }).not.toBe('checking');
    await expect.poll(() => phase(page), { timeout: 8000 }).not.toBe('reply');
  }
  await expect(page.getByTestId('text-main')).toContainText('Solved!');
  await expect(page.getByTestId('review')).toBeVisible();
  await expect(page.getByTestId('trainer-rating')).not.toHaveText(/about 600 /);
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
  await expect(page.getByTestId('text-main')).toContainText('Not quite. The answer was');
  expect(await phase(page)).toBe('review');
  await expect(page.getByTestId('review-answer')).toBeVisible();
});
