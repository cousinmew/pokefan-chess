// SPDX-License-Identifier: AGPL-3.0-only
// Sprite load times on Slow 4G (Chrome DevTools preset: 562.5 ms RTT, 1.6 Mbps down, 750 kbps up). Run on demand:
// PERF=1 npx playwright test --project perf. Reports, per run: hub icons visible (after the hub opens, and from
// navigation) and the 3 starter sprites visible after the starter screen opens. Cold = empty cache; warm = a revisit.
import { expect, test, type Page } from '@playwright/test';

const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 };
type Marks = { hubShown?: number; hubReady?: number; oakShown?: number; oakReady?: number };

/** Records, from navigation, when the hub and the starter screen appear and when all their images are loaded. */
function recorder(): void {
  const w = window as unknown as { __perf: Marks };
  w.__perf = {};
  const loaded = (root: Element, sel: string, n: number) => {
    const els = [...root.querySelectorAll(sel)];
    const ok = els.filter((e) => (e instanceof HTMLImageElement ? e.complete && e.naturalWidth > 0 && !e.style.backgroundImage : e instanceof SVGElement || document.documentElement.dataset.hubSheet === 'ready'));
    return els.length >= n && ok.length === els.length;
  };
  const tick = () => {
    const p = w.__perf;
    const hub = document.querySelector('[data-testid="screen-title"] .hub-zones');
    if (hub && !p.hubShown) p.hubShown = performance.now();
    if (hub && !p.hubReady && loaded(hub, '[data-icon]', 5)) p.hubReady = performance.now();
    const oak = document.querySelector('[data-testid="screen-oak"]');
    if (oak && !p.oakShown) p.oakShown = performance.now();
    if (oak && !p.oakReady && loaded(oak, 'img.menu-sprite', 3)) p.oakReady = performance.now();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function run(page: Page, label: string): Promise<string> {
  await page.goto('./');
  const splash = page.getByTestId('screen-splash');
  await Promise.race([splash.click().catch(() => undefined), page.getByTestId('kanto').waitFor()]);
  await page.waitForFunction(() => (window as unknown as { __perf: Marks }).__perf.hubReady, undefined, { timeout: 120_000 });
  await page.getByTestId('kanto').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
  await page.getByTestId('name-1').click();
  await page.waitForFunction(() => (window as unknown as { __perf: Marks }).__perf.oakReady, undefined, { timeout: 120_000 });
  const m = await page.evaluate(() => (window as unknown as { __perf: Required<Marks> }).__perf);
  const line = `${label}: hub icons ${Math.round(m.hubReady - m.hubShown)} ms after the hub opens (${Math.round(m.hubReady)} ms from navigation); starters ${Math.round(m.oakReady - m.oakShown)} ms after the starter screen opens`;
  console.log(line);
  return line;
}

test.describe('@perf', () => {
  test.use({ serviceWorkers: 'allow', viewport: { width: 360, height: 640 } });
  test('Slow 4G cold and warm load', async ({ page }) => {
    test.setTimeout(300_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await page.addInitScript(recorder);
    const cold = await run(page, 'cold');
    // Warm: a fresh start of the journey in the same browser (HTTP cache and service worker in place).
    await page.evaluate(() => localStorage.removeItem('kc:v1:p1:campaign'));
    const warm = await run(page, 'warm');
    expect(cold && warm).toBeTruthy();
  });
});
