// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

type KC = { loadFen(f: string): string };

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`@webkit iPhone 13: a tapped capture plays the battle screen (reduced motion: ${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').tap();
    await page.getByTestId('two-players').tap();
    await page.getByTestId('intro').tap();
    await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.loadFen('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'));
    await page.locator('[data-square="e4"]').tap();
    await page.locator('[data-square="d5"]').tap();
    await expect(page.getByTestId('battle')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('battle-text')).toContainText('EEVEE used QUICK ATTACK!');
    const widths = await page.evaluate(() => ['.mon.att img', '.mon.def img'].map((s) => (document.querySelector(s) as HTMLImageElement | null)?.naturalWidth ?? 0));
    for (const w of widths) expect(w).toBeGreaterThan(0);
    await expect(page.locator('[data-square="d5"] img')).toHaveAttribute('alt', 'EEVEE', { timeout: 5000 });
    expect(errors).toEqual([]);
  });
}
