// SPDX-License-Identifier: AGPL-3.0-only
// docs/legibility/: the three piece styles at 360x640, for review (§B19). Run: npm run sheets
import { test } from '@playwright/test';

for (const style of ['pokemon', 'badge', 'classic']) {
  test(`@legibilitysheet ${style}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.addInitScript((s) => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, pieceStyle: s, legend: 'on', anim: 'off' })), style);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?debug=1&start=two');
    await page.click('[data-square="e2"]');
    await page.click('[data-square="e4"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/legibility/${style}-360x640.png` });
  });
}
