// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

type KC = {
  randomPosition(seed: number): string;
  aiMove(level: number, fen: string): Promise<{ uci: string; ms: number; legal: boolean }>;
  setMode(mode: string, level?: number): void;
  loadFen(fen: string): string;
  dumpState(): string;
};
const MOVETIME = [0, 0, 200, 600, 1200];

test('each level returns a legal move from 5 seeded positions', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?debug=1&start=two');
  const res = await page.evaluate(async () => {
    const kc = (window as unknown as { __kc: KC }).__kc;
    const out: { level: number; seed: number; uci: string; ms: number; legal: boolean }[] = [];
    for (const seed of [11, 22, 33, 44, 55]) {
      const fen = kc.randomPosition(seed);
      for (const level of [1, 2, 3, 4]) out.push({ level, seed, ...(await kc.aiMove(level, fen)) });
    }
    return out;
  });
  expect(res).toHaveLength(20);
  for (const r of res) {
    expect(r.legal, `level ${r.level} seed ${r.seed} gave ${r.uci}`).toBe(true);
    expect(r.ms, `level ${r.level} seed ${r.seed} took ${r.ms} ms`).toBeLessThan(MOVETIME[r.level]! + 1000);
  }
  console.log(`ai timings: ${res.map((r) => `L${r.level}:${r.ms}`).join(' ')}`);
});

test('engine blocked: Gym Leader shows ai.failed, then the game finishes', async ({ page }) => {
  await page.route('**/engine/**', (r) => r.abort());
  await page.goto('/?debug=1&start=two');
  await page.evaluate(() => {
    const kc = (window as unknown as { __kc: KC }).__kc;
    kc.setMode('computer', 2);
    // Black's only reply is Kh7, then Rh1 is mate.
    kc.loadFen('7k/5K2/8/p7/P7/8/8/1R6 w - - 0 1');
  });
  await page.click('[data-square="b1"]');
  await page.click('[data-square="c1"]');
  await expect(page.getByTestId('text-main')).toContainText('The computer trainer got lost. Switching to Youngster.', { timeout: 8000 });
  await expect(page.locator('[data-square="h7"]')).toHaveAttribute('data-piece', 'bk', { timeout: 8000 });
  await page.click('[data-square="c1"]');
  await page.click('[data-square="h1"]');
  await expect(page.getByTestId('end-screen')).toHaveAttribute('data-end-key', 'mate.rocketLoses');
  const st = JSON.parse(await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.dumpState()));
  expect(st).toMatchObject({ aiFailed: true, level: 1 });
});
