// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

type KC = { spritesReady(): Promise<boolean>; loadFen(f: string): string };

test('battle sprites are drawn on Slow 3G with the cache disabled', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  // The preload starts after the splash; a player reads the title while it finishes.
  expect(await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.spritesReady())).toBe(true);
  await page.getByTestId('two-players').click();
  await page.getByTestId('intro').click();
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.loadFen('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  // Chrome DevTools "Slow 3G": 2000 ms latency, 50,000 B/s each way.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 });
  await page.click('[data-square="e4"]');
  await page.click('[data-square="d5"]');
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 5000 });
  const imgs = await page.evaluate(() =>
    ['.mon.att img', '.mon.def img'].map((s) => {
      const img = document.querySelector(s) as HTMLImageElement | null;
      return { s, w: img?.naturalWidth ?? 0, src: img?.src.split('/').slice(-2).join('/') };
    }),
  );
  expect(await page.getByTestId('battle').isVisible()).toBe(true);
  for (const i of imgs) expect(i.w, JSON.stringify(i)).toBeGreaterThan(0);
  // Animated WebP where it is smaller than the GIF (load fix).
  expect(imgs.map((i) => i.src?.replace(/\.(gif|webp)$/, ''))).toEqual(['back/133', 'front/19']);
});

// Loading fix, 14 Oct (real WebPs, CI check 9): board pieces swap their stills for the animated WebP once it has
// decoded, the board's backs come as WebP too, and so does the Pokédex detail. RATTATA (19) and EEVEE's back (133)
// have a smaller WebP; the board here is Two Players at BLUE's first story stage (Rocket's pawns are RATTATA).
test('board pieces and the Pokédex detail use the animated WebP where one exists', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'RED', starter: 'squirtle', introSeen: true, teamRules: 2, caught: { squirtle: 1, rattata: 1 }, seen: ['squirtle', 'rattata'], journey: { cleared: [], beaten: [], visited: [] } })));
  await page.goto('./?debug=1&start=two');
  await expect(page.locator('[data-square="e7"] img.piece')).toHaveAttribute('src', /\/front\/19\.webp$/, { timeout: 15_000 });
  const asked = () => page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name.replace(/^.*\/assets\//, '')).filter((u) => /^(front\/19|back\/133)\./.test(u)));
  await expect.poll(asked, { timeout: 15_000 }).toEqual(expect.arrayContaining(['front/19.webp', 'back/133.webp']));
  expect(await asked()).not.toContain('front/19.gif');
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('open-dex').click();
  await page.getByTestId('dex-rattata').click();
  const img = page.getByTestId('dex-detail').locator('img[data-species="rattata"]');
  await expect(img).toHaveAttribute('src', /\/front\/19\.webp$/);
  await expect.poll(() => img.evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)).toBe(true);
});
