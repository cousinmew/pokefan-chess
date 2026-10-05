// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';

const SIZES = [
  { width: 360, height: 640 },
  { width: 1280, height: 800 },
];
const MATES = [
  { name: "Scholar's Mate", moves: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'], key: 'mate.rocketLoses', text: "Looks like Team Rocket's blasting off again!" },
  { name: "Fool's Mate", moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], key: 'mate.redLoses', text: 'PIKACHU fainted! RED blacked out!' },
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test('boot gate', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/');
      await page.waitForTimeout(2000);
      await expect(page.locator('[data-testid="screen-splash"], [data-testid="screen-title"]')).toBeVisible();
      expect(await page.locator('#app .stage').evaluate((b) => b.children.length)).toBeGreaterThan(0);
      expect(errors).toEqual([]);

    });

    for (const mate of MATES) {
      test(`${mate.name} by clicks`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto('/?debug=1&start=two');
        for (const uci of mate.moves) {
          await page.click(`[data-square="${uci.slice(0, 2)}"]`);
          await page.click(`[data-square="${uci.slice(2, 4)}"]`);
        }
        const end = page.getByTestId('end-screen');
        await expect(end).toHaveAttribute('data-end-key', mate.key);
        await expect(page.getByTestId('end-text')).toHaveText(mate.text);
        expect(errors).toEqual([]);
      });
    }
  });
}

test('__kc only behind ?debug=1 (T-12)', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => 'kc' in window || '__kc' in window)).toBe(false);
  await page.goto('/?debug=1');
  const state = await page.evaluate(() => {
    const kc = (window as unknown as { __kc: { seed(n: number): number; move(u: string): string; dumpState(): string } }).__kc;
    kc.seed(7);
    kc.move('e2e4');
    return JSON.parse(kc.dumpState());
  });
  expect(state.turn).toBe('b');
});

test('promotion picker shows four team Pokémon', async ({ page }) => {
  await page.goto('/?debug=1&start=two');
  await page.evaluate(() => (window as unknown as { __kc: { loadFen(f: string): string } }).__kc.loadFen('7k/1P5p/8/8/8/8/8/K7 w - - 0 1'));
  await page.click('[data-square="b7"]');
  await page.click('[data-square="b8"]');
  await expect(page.getByTestId('promotion').locator('button[data-role]')).toHaveCount(4);
  await page.click('[data-testid="promotion"] button[data-role="b"]');
  await expect(page.locator('[data-square="b8"] img')).toHaveAttribute('alt', 'VENUSAUR');
  await expect(page.getByTestId('text-main')).toHaveText('EEVEE evolved into VENUSAUR!');
});
