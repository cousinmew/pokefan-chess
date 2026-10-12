// SPDX-License-Identifier: AGPL-3.0-only
// INSTALL FOR OFFLINE PLAY in OPTION (owner, 12 Oct): Chromium's prompt, the installed state, iOS steps, the hint,
// and the warm up that makes the first offline launch complete.
import { expect, test, type Page } from '@playwright/test';

const enter = async (page: Page, q = '?debug=1') => {
  await page.goto(`./${q}`);
  await page.getByTestId('screen-splash').click();
};
const option = async (page: Page) => {
  await page.getByTestId('settings').first().click();
  await expect(page.getByTestId('install-box')).toBeVisible();
};
/** A synthetic Chromium install prompt whose prompt() is counted and whose choice is `outcome`. */
const offerInstall = (page: Page, outcome: 'accepted' | 'dismissed') =>
  page.evaluate((outcome) => {
    const w = window as unknown as { prompted: number };
    w.prompted = 0;
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => ((w.prompted += 1), Promise.resolve()),
      userChoice: Promise.resolve({ outcome, platform: 'web' }),
    });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  }, outcome);
const prompted = (page: Page) => page.evaluate(() => (window as unknown as { prompted: number }).prompted);

test('no prompt yet: a hint instead of a dead button, without errors under ?debug', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await option(page);
  await expect(page.getByTestId('install-hint')).toHaveText('Open in Chrome or Edge to install');
  await expect(page.getByTestId('install')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the install prompt is kept, opened from OPTION, and its outcome shown', async ({ page }) => {
  await enter(page);
  expect(await offerInstall(page, 'dismissed')).toBe(true); // preventDefault: no browser mini bar
  await option(page);
  const btn = page.getByTestId('install');
  await expect(btn).toHaveText('INSTALL FOR OFFLINE PLAY');
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  expect(await prompted(page)).toBe(1);
  await expect(page.getByTestId('install-result')).toHaveText('Not installed. You can try again any time.');
  // A prompt can be used once (no button, and no "open in Chrome" hint in Chrome); Chromium offers a new one later.
  await expect(page.getByTestId('install')).toHaveCount(0);
  await expect(page.getByTestId('install-hint')).toHaveCount(0);
  await offerInstall(page, 'accepted');
  await page.getByTestId('install').click();
  expect(await prompted(page)).toBe(1);
  await expect(page.getByTestId('install-result')).toHaveText('Installing. You will find it with your apps.');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByTestId('install-installed')).toHaveText('Installed ✓ — plays offline');
  await expect(page.getByTestId('install')).toHaveCount(0);
});

test('opened as an installed app: Installed, no button', async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q === '(display-mode: standalone)' ? ({ ...real(q), matches: true, media: q } as MediaQueryList) : real(q));
  });
  await enter(page);
  await offerInstall(page, 'accepted');
  await option(page);
  await expect(page.getByTestId('install-installed')).toHaveText('Installed ✓ — plays offline');
  await expect(page.getByTestId('install')).toHaveCount(0);
});

test.describe('iPhone Safari', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  test('the button opens the Share → Add to Home Screen steps', async ({ page }) => {
    await enter(page);
    await option(page);
    await page.getByTestId('install').click();
    const panel = page.getByTestId('install-ios');
    await expect(panel).toContainText('Add to Home Screen to keep your progress safe');
    await expect(panel).toContainText('Tap Share');
    await page.getByTestId('install-ios-ok').click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe('getting ready for offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('after install the core files are cached, so the first offline launch has the engine and puzzles', async ({ page, context }) => {
    // A returning player: a cartridge alone is no progress, and the first launch would go straight into NEW GAME.
    await page.addInitScript(() => localStorage.getItem('kc:v1:p1:campaign') ?? localStorage.setItem('kc:v1:campaign', JSON.stringify({ name: 'ASH' })));
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    });
    await page.getByTestId('screen-splash').click();
    await page.getByRole('menuitem', { name: 'OPTION' }).click(); // without ?debug the title menu comes first
    await expect(page.getByTestId('install-box')).toBeVisible();
    // Every progress line shown, in order (review fix: one warm up however often it is asked for, never back from ready).
    await page.evaluate(() => {
      const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
      const box = document.querySelector('[data-testid="install-box"]')!;
      new MutationObserver(() => {
        const t = box.querySelector('[data-testid="install-progress"]')?.textContent;
        if (t && seen.at(-1) !== t) seen.push(t);
      }).observe(box, { childList: true, subtree: true, characterData: true });
    });
    // Accepting the prompt and appinstalled both ask for it.
    await page.evaluate(() => (window.dispatchEvent(new Event('appinstalled')), window.dispatchEvent(new Event('appinstalled'))));
    await expect(page.getByTestId('install-progress')).toHaveText('Ready to play offline', { timeout: 30000 });
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('install-progress')).toHaveText('Ready to play offline');
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
    expect(seen.at(-1)).toBe('Ready to play offline');
    expect(seen.indexOf('Ready to play offline')).toBe(seen.length - 1);
    const pcts = seen.slice(0, -1).map((t) => Number(/\d+/.exec(t)?.[0]));
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b));
    const { files } = (await (await page.request.get('./offline.json')).json()) as { files: string[] };
    expect(files).toContain('engine/stockfish-19-lite-single.wasm');
    expect(files.filter((f) => /^assets\/[^/]+\.js$/.test(f)).length).toBeGreaterThan(1);
    // The starters' lines, BLUE's stage teams and Route 1's first catch are in the list (review fix): CHARIZARD 6,
    // PONYTA 77, PIDGEY 16.
    for (const dex of [6, 77, 16]) expect(files).toContain(`assets/cries/${dex}.ogg`);
    const missing = await page.evaluate(async (fs) => (await Promise.all(fs.map(async (f) => ((await caches.match(f)) ? null : f)))).filter(Boolean), files);
    expect(missing).toEqual([]);
    // The worker cached them itself, the sprites into its build's own cache.
    const inBuild = await page.evaluate(async (fs) => {
      const key = (await caches.keys()).find((k) => k.startsWith('pfc-assets-'))!;
      const c = await caches.open(key);
      return (await Promise.all(fs.filter((f) => f.startsWith('assets/')).map(async (f) => !!(await c.match(f, { ignoreVary: true }))))).every(Boolean);
    }, files);
    expect(inBuild).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('screen-splash')).toBeVisible();
    const chunk = files.find((f) => /^assets\/mateIn1-.*\.js$/.test(f))!;
    expect(await page.evaluate(async (u) => (await fetch(u)).ok, chunk)).toBe(true);
    await context.setOffline(false);
  });
});
