// SPDX-License-Identifier: AGPL-3.0-only
// docs/i18n/: the shelf, both homes, YELLOW's levels, the players screen and the save settings in en, fr, he and es,
// for review (§B17, §B18). Run: npm run sheets
import { test } from '@playwright/test';

for (const lang of (process.env.SHEET_LANGS ?? 'en,fr,he,es,de,it,nl,pt,ja,zh-Hans,ru').split(',')) {
  for (const view of ['shelf', 'yellow', 'blue', 'levels', 'players', 'save'] as const) {
    test(`@i18nsheet ${view} ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await page.addInitScript(
        ([l, v]) => {
          localStorage.setItem('kc:v1:lang', JSON.stringify(l));
          // The shelf is first launch only: no cartridge remembered for that shot.
          if (v === 'shelf') localStorage.removeItem('kc:v1:cartridge');
          else localStorage.setItem('kc:v1:cartridge', JSON.stringify(v === 'levels' ? 'yellow' : v === 'yellow' ? 'yellow' : 'blue'));
          if (v === 'players' && !localStorage.getItem('kc:v1:p2:cartridge')) {
            localStorage.setItem('kc:v1:profiles', JSON.stringify({ slots: [1, 2], current: 1 }));
            localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'JADE', starter: 'squirtle', caught: { squirtle: 1, pidgey: 1 }, badges: ['boulder'] }));
            localStorage.setItem('kc:v1:p2:cartridge', JSON.stringify('yellow'));
            localStorage.setItem('kc:v1:p2:lang', JSON.stringify('fr'));
          }
        },
        [lang, view],
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('./?debug=1');
      await page.getByTestId('screen-splash').click();
      if (view === 'levels') await page.getByTestId('yellow-play').click();
      if (view === 'save') await page.getByTestId('settings').first().click();
      if (view === 'save') await page.getByTestId('save-box').scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      if (view === 'save') await page.getByTestId('save-box').screenshot({ path: `docs/i18n/${view}-${lang}.png` });
      else await page.screenshot({ path: `docs/i18n/${view}-${lang}.png`, fullPage: view !== 'blue' });
    });
  }
}
