// SPDX-License-Identifier: AGPL-3.0-only
// docs/hub/: the home hub at phone and desktop sizes, for the owner's review (§B16). Run: npm run sheets
import { test } from '@playwright/test';

for (const [w, h] of [[360, 640], [1280, 800]] as const) {
  test(`@hubsheet hub ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(() => {
      localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'RED', starter: 'squirtle', introSeen: true, teamRules: 2, caught: { squirtle: 1, pidgey: 2, rattata: 1 }, badges: ['boulder', 'cascade'], team: { k: 'squirtle' }, journey: { cleared: ['route-1', 'viridian', 'rival-1', 'viridian-forest', 'route-3'], beaten: [], visited: ['route-1', 'route-3'] } }));
      localStorage.setItem('kc:v1:last', JSON.stringify('journey'));
      localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'full' }));
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.waitForLoadState('networkidle');
    // Park the pointer off the tiles so no hover tooltip covers them.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `docs/hub/hub-${w}x${h}.png`, fullPage: true });
  });
}
