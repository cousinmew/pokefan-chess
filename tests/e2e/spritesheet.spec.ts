// SPDX-License-Identifier: AGPL-3.0-only
// docs/sprite-sheet.png: every species' front and back battle sprite side by side, for one check by eye (§B8).
// Run: npm run sheets
import { test } from '@playwright/test';

test('@spritesheet every front/back pair', async ({ page }) => {
  await page.goto('./?debug=1');
  const list = await page.evaluate(() => (window as unknown as { __kc: { species(): [number, string][] } }).__kc.species());
  await page.evaluate((all) => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;background:#fff;display:grid;grid-template-columns:repeat(6,160px);gap:4px;padding:8px;font:10px monospace';
    for (const [dex, name] of all) {
      const cell = document.createElement('div');
      cell.style.cssText = 'border:1px solid #ccc;text-align:center';
      cell.innerHTML = `<img src="assets/front/${dex}.gif" style="width:72px;height:72px;object-fit:contain;image-rendering:pixelated"><img src="assets/back/${dex}.gif" style="width:72px;height:72px;object-fit:contain;image-rendering:pixelated"><br>#${dex} ${name}`;
      document.body.append(cell);
    }
  }, list);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/sprite-sheet.png', fullPage: true });
});
