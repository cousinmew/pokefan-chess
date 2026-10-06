// SPDX-License-Identifier: AGPL-3.0-only
// §B15 gate: the review stays until Continue; ◀ ▶ walk the whole line; the refutation is a legal Stockfish move.
import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

type KC = { puzzleAnswer(): string | null; puzzlePhase(): string; openPuzzles(): void; dumpState(): string; refutation(): { fen: string; uci: string; source: string } | null };
const kc = <T>(page: Page, f: keyof KC) => page.evaluate((name) => (window as unknown as { __kc: Record<string, () => unknown> }).__kc[name]!() as T, f);

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ anim: 'off', v: 2 })));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.openPuzzles());
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toBe('player');
}

const fen = async (page: Page) => (JSON.parse(await kc<string>(page, 'dumpState')) as { fen: string }).fen;

test.use({ viewport: { width: 360, height: 640 } });

test('solved: the review stays after 10 s, and ◀ ▶ walk the full line', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  for (let i = 0; i < 6 && (await kc<string>(page, 'puzzlePhase')) !== 'review'; i++) {
    const uci = (await kc<string>(page, 'puzzleAnswer'))!;
    await page.click(`[data-square="${uci.slice(0, 2)}"]`);
    await page.click(`[data-square="${uci.slice(2, 4)}"]`);
    if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toMatch(/player|review/);
  }
  await expect(page.getByTestId('review')).toBeVisible();
  await expect(page.locator('[data-testid="review-layer"] line[data-color="green"]').first()).toBeAttached();
  await page.waitForTimeout(10_000);
  expect(await kc<string>(page, 'puzzlePhase')).toBe('review');
  await expect(page.getByTestId('review')).toBeVisible();
  // Walk back to the start, then forward to the end: every frame is a different position.
  const seen = [await fen(page)];
  while (await page.getByTestId('review-prev').isEnabled()) {
    await page.getByTestId('review-prev').click();
    seen.push(await fen(page));
  }
  const steps = seen.length - 1;
  expect(steps).toBeGreaterThanOrEqual(1);
  const forward: string[] = [];
  while (await page.getByTestId('review-next').isEnabled()) {
    await page.getByTestId('review-next').click();
    forward.push(await fen(page));
  }
  expect(forward).toHaveLength(steps);
  expect(forward.at(-1)).toBe(seen[0]);
  await page.getByTestId('review-continue').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toBe('player');
});

test('missed: your move in red, a legal Stockfish refutation, the review stays, Show answer', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  const want = (await kc<string>(page, 'puzzleAnswer'))!;
  const squares = await page.locator('.sq[data-piece]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.square!));
  for (const sq of squares) {
    await page.click(`[data-square="${sq}"]`);
    const targets = await page.locator('.sq.dot, .sq.capture').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.square!));
    const to = targets.find((t) => sq + t !== want.slice(0, 4));
    if (to) {
      await page.click(`[data-square="${to}"]`);
      break;
    }
  }
  await expect(page.getByTestId('review')).toBeVisible();
  await expect(page.locator('[data-testid="review-layer"] line[data-color="red"]')).toBeAttached();
  await expect.poll(() => kc<{ source: string } | null>(page, 'refutation'), { timeout: 15_000 }).not.toBeNull();
  const ref = (await kc<{ fen: string; uci: string; source: string }>(page, 'refutation'))!;
  expect(ref.source).toBe('stockfish');
  const legal = new Chess(ref.fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
  expect(legal).toContain(ref.uci);
  await expect(page.getByTestId('review-text')).toHaveText(/take your|checkmate you|answers/);
  await page.waitForTimeout(10_000);
  expect(await kc<string>(page, 'puzzlePhase')).toBe('review');
  await page.getByTestId('review-answer').click();
  await expect(page.locator('[data-testid="review-layer"] line[data-color="green"]').first()).toBeAttached({ timeout: 5000 });
  await expect(page.getByTestId('review-new')).toBeVisible();
});
