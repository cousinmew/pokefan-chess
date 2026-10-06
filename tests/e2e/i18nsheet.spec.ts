// SPDX-License-Identifier: AGPL-3.0-only
// docs/i18n/: the shelf and both homes in en, fr, he and es, for review (§B17). Run: npm run sheets
import { test } from '@playwright/test';

for (const lang of ['en', 'fr', 'he', 'es']) {
  for (const view of ['shelf', 'yellow', 'blue'] as const) {
    test(`@i18nsheet ${view} ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await page.addInitScript(
        ([l, v]) => {
          localStorage.setItem('kc:v1:lang', JSON.stringify(l));
          // The shelf is first launch only: no cartridge remembered for that shot.
          if (v === 'shelf') localStorage.removeItem('kc:v1:cartridge');
          else localStorage.setItem('kc:v1:cartridge', JSON.stringify(v));
        },
        [lang, view],
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('./?debug=1');
      await page.getByTestId('screen-splash').click();
      await page.mouse.move(0, 0);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `docs/i18n/${view}-${lang}.png`, fullPage: view !== 'blue' });
    });
  }
}
