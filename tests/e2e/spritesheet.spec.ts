// SPDX-License-Identifier: AGPL-3.0-only
// docs/sprite-sheet.png: every species' front and back battle sprite, normal then shiny, for one check by eye (§B8, §B12).
// Run: npm run sheets
import { test } from '@playwright/test';

test('@spritesheet every front/back pair, normal and shiny', async ({ page }) => {
  await page.goto('./?debug=1');
  const list = await page.evaluate(() => (window as unknown as { __kc: { species(): [number, string][] } }).__kc.species());
  await page.evaluate((all) => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;background:#fff;display:grid;grid-template-columns:repeat(5,196px);gap:3px;padding:6px;font:9px monospace';
    for (const [dex, name] of all) {
      const cell = document.createElement('div');
      cell.style.cssText = 'border:1px solid #ccc;text-align:center';
      const img = (p: string) => `<img src="assets/${p}/${dex}.gif" style="width:46px;height:46px;object-fit:contain;image-rendering:pixelated">`;
      cell.innerHTML = `${img('front')}${img('back')}${img('shiny/front')}${img('shiny/back')}<br>#${dex} ${name}`;
      document.body.append(cell);
    }
  }, list);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/sprite-sheet.png', fullPage: true });
});
