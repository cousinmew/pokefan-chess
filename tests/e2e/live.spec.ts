// SPDX-License-Identifier: AGPL-3.0-only
// What only the real host can show (npm run e2e:live, LIVE_URL=https://pokefanchess.com/). Locally it runs against
// vite preview, which also answers a Range request with 206.
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });

// N2 (14 Oct): an <audio> asks with Range and GitHub Pages answers 206, which Cache Storage refuses; the service worker
// keeps a full 200 copy instead, so a cry played once plays offline.
test('@live a 206 cry is cached in full', async ({ page }) => {
  test.setTimeout(90_000);
  const probe = await page.request.get('./assets/cries/25.ogg', { headers: { Range: 'bytes=0-' } });
  test.skip(probe.status() !== 206, `this host answers a Range request with ${probe.status()}: nothing to keep in full`);
  const played = new Set<string>();
  page.on('request', (r) => {
    const m = /\/(assets\/cries\/\d+\.(?:ogg|mp3))$/.exec(r.url());
    if (m) played.add(m[1]!);
  });
  // A returning player, so the splash leads to the start menu and its PLAY CHESS.
  await page.addInitScript(() => localStorage.getItem('kc:v1:p1:campaign') ?? localStorage.setItem('kc:v1:campaign', JSON.stringify({ name: 'ASH' })));
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  // A capture in Two Players as a guest: the cries of the pieces picked up and of the battle.
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('start-play').click();
  await page.getByTestId('quick-friend').click();
  await page.getByTestId('intro').click();
  for (const [from, to] of [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']] as const) {
    await page.click(`[data-square="${from}"]`);
    await page.click(`[data-square="${to}"]`);
    await expect(page.locator(`[data-square="${to}"]`)).toHaveAttribute('data-piece', /^w|^b/, { timeout: 8000 });
  }
  await expect.poll(() => played.size, { timeout: 10_000 }).toBeGreaterThan(0);
  const cached = () =>
    page.evaluate(async (want) => {
      const keys = (await caches.keys()).filter((k) => k.startsWith('pfc-assets-'));
      const ok: string[] = [];
      for (const f of want) {
        for (const k of keys) {
          const r = await (await caches.open(k)).match(f, { ignoreVary: true });
          if (r?.status === 200) ok.push(f);
        }
      }
      return [...new Set(ok)].sort();
    }, [...played]);
  await expect.poll(cached, { timeout: 15_000 }).toEqual([...played].sort());
});
