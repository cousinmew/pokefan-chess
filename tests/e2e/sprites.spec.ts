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
