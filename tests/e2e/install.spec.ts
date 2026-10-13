// SPDX-License-Identifier: AGPL-3.0-only
// INSTALL FOR OFFLINE PLAY in OPTION (owner, 12 Oct): Chromium's prompt, the installed state, iOS steps, the hint,
// and the warm up that makes the first offline launch complete.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { deployHost } from './host';

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
  // ?debug has no service worker, so nothing is ready offline: no "plays offline" claim (N4, 14 Oct).
  await expect(page.getByTestId('install-installed')).toHaveText('Installed ✓');
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
  await expect(page.getByTestId('install-installed')).toHaveText('Installed ✓'); // no worker under ?debug (N4)
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
    // The worker cached them itself: sprites, cries, trainers and items into the asset set's cache (kept across
    // deploys while the files stay the same, N2), code chunks into this build's own cache.
    const placed = await page.evaluate(async (fs) => {
      const keys = await caches.keys();
      const all = async (key: string | undefined, list: string[]) => !!key && (await Promise.all(list.map(async (f) => !!(await (await caches.open(key)).match(f, { ignoreVary: true }))))).every(Boolean);
      return {
        sprites: await all(keys.find((k) => k.startsWith('pfc-assets-')), fs.filter((f) => /^assets\/[^/]+\//.test(f))),
        code: await all(keys.find((k) => k.startsWith('pfc-code-')), fs.filter((f) => /^assets\/[^/]+$/.test(f))),
      };
    }, files);
    expect(placed).toEqual({ sprites: true, code: true });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('screen-splash')).toBeVisible();
    const chunk = files.find((f) => /^assets\/mateIn1-.*\.js$/.test(f))!;
    expect(await page.evaluate(async (u) => (await fetch(u)).ok, chunk)).toBe(true);
    await context.setOffline(false);
  });

  // Considerate warm up (12 Oct): on its own only once per build per device, never on data saver or 2G, and a warm up
  // downloads only what is not cached yet.
  /** Every launch opens as an installed app (display-mode: standalone) for a returning player; `connection` stands in
   * for the Network Information API. */
  const asApp = (context: BrowserContext, connection?: { saveData?: boolean; effectiveType?: string }) =>
    context.addInitScript((connection) => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q === '(display-mode: standalone)' ? ({ ...real(q), matches: true, media: q } as MediaQueryList) : real(q));
      if (connection) Object.defineProperty(Navigator.prototype, 'connection', { get: () => connection, configurable: true });
      if (localStorage.getItem('kc:v1:p1:campaign') === null) localStorage.setItem('kc:v1:campaign', JSON.stringify({ name: 'ASH' }));
    }, connection);
  /** Paths (from the site root) of every request the service worker sends to the network, in order. */
  const workerRequests = (context: BrowserContext) => {
    const got: string[] = [];
    context.on('request', (r) => void (r.serviceWorker() && got.push(new URL(r.url()).pathname.slice(1))));
    return got;
  };
  const lists = (got: string[]) => got.filter((p) => p === 'offline.json').length;
  const controlled = (page: Page) =>
    page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    });
  const remembered = (page: Page) => page.evaluate(() => localStorage.getItem('kc:v1:dev:offlineBuild'));
  const workerBuild = async (page: Page) => `"${/const BUILD = '(\w+)'/.exec(await (await page.request.get('./sw.js')).text())![1]}"`;
  /** OPTION in an installed app; while its offline files wait, the status line makes no "plays offline" claim. */
  const openOption = async (page: Page, status = 'Installed ✓ — plays offline') => {
    await page.getByRole('menuitem', { name: 'OPTION' }).click();
    await expect(page.getByTestId('install-installed')).toHaveText(status);
  };

  test('an app launch gets ready once per build: the next launch of the same build downloads nothing', async ({ page, context }) => {
    await asApp(context);
    const got = workerRequests(context);
    await page.goto('./');
    // The automatic warm up (3 s after launch) remembers the worker's build on this device once every file is cached.
    await expect.poll(() => remembered(page), { timeout: 30000 }).toBe(await workerBuild(page));
    expect(lists(got)).toBe(1);
    await page.close();
    got.length = 0;
    const again = await context.newPage();
    await again.goto('./');
    await again.getByTestId('screen-splash').click();
    await again.waitForTimeout(4500); // past the launch timer
    await openOption(again); // OPTION in an installed app would start it too
    await expect(again.getByTestId('install-progress')).toHaveText('Ready to play offline');
    await again.waitForTimeout(1000);
    expect(lists(got)).toBe(0); // every warm up starts by fetching the list
  });

  test('data saver: no automatic download, OPTION offers it and the button gets ready', async ({ page, context }) => {
    await asApp(context, { saveData: true, effectiveType: '4g' });
    const got = workerRequests(context);
    await page.goto('./');
    await controlled(page);
    await page.getByTestId('screen-splash').click();
    await page.waitForTimeout(3500); // past the launch timer
    // Fix, 13 Oct: no "plays offline" claim right above a line saying the offline files wait, and plain words for kids.
    await openOption(page, 'Installed ✓');
    await expect(page.getByTestId('install-held')).toHaveText('Offline files not downloaded yet, to save data.');
    await expect(page.getByTestId('install-progress')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(lists(got)).toBe(0);
    expect(await remembered(page)).toBeNull();
    const btn = page.getByTestId('install-warm');
    await expect(btn).toHaveText('GET READY FOR OFFLINE NOW');
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await btn.click();
    await expect(page.getByTestId('install-progress')).toHaveText('Ready to play offline', { timeout: 30000 });
    await expect(page.getByTestId('install-installed')).toHaveText('Installed ✓ — plays offline');
    await expect(page.getByTestId('install-warm')).toHaveCount(0);
    await expect(page.getByTestId('install-held')).toHaveCount(0);
    expect(lists(got)).toBe(1);
    expect(await remembered(page)).toBe(await workerBuild(page));
  });

  // Fix, 13 Oct: Chromium can evict an origin's Cache Storage under storage pressure and keep its localStorage, so the
  // device note alone must not make an app launch skip the warm up, or OPTION say ready.
  test('caches evicted, the device note kept: not ready, so OPTION offers it on data saver and a launch gets ready', async ({ page, context }) => {
    test.slow(); // two warm ups
    await asApp(context);
    const got = workerRequests(context);
    await page.goto('./');
    const build = await workerBuild(page);
    await expect.poll(() => remembered(page), { timeout: 30000 }).toBe(build);
    await page.evaluate(async () => {
      for (const k of await caches.keys()) await caches.delete(k);
    });
    await page.close();
    got.length = 0;
    // Data saver: OPTION must not claim ready; it offers the button.
    const saver = await context.newPage();
    await saver.addInitScript(() => Object.defineProperty(Navigator.prototype, 'connection', { get: () => ({ saveData: true }), configurable: true }));
    await saver.goto('./');
    await controlled(saver);
    await saver.getByTestId('screen-splash').click();
    await saver.waitForTimeout(3500); // past the launch timer
    await saver.getByRole('menuitem', { name: 'OPTION' }).click();
    await expect(saver.getByTestId('install-held')).toBeVisible();
    await expect(saver.getByTestId('install-warm')).toBeVisible();
    await expect(saver.getByTestId('install-progress')).toHaveCount(0);
    await expect(saver.getByTestId('install-installed')).toHaveText('Installed ✓');
    expect(lists(got)).toBe(0);
    await saver.close();
    // A normal launch gets ready again by itself, once, and puts the files back.
    const again = await context.newPage();
    await again.goto('./');
    await again.getByTestId('screen-splash').click();
    await expect.poll(() => lists(got), { timeout: 15000 }).toBe(1);
    await openOption(again);
    await expect(again.getByTestId('install-progress')).toHaveText('Ready to play offline', { timeout: 30000 });
    expect(await remembered(again)).toBe(build);
    const { files } = (await (await again.request.get('./offline.json')).json()) as { files: string[] };
    const missing = await again.evaluate(async (fs) => (await Promise.all(fs.map(async (f) => ((await caches.match(f, { ignoreVary: true })) ? null : f)))).filter(Boolean), files);
    expect(missing).toEqual([]);
    expect(lists(got)).toBe(1);
  });

  // The per-build half (review, 13 Oct): a device that got ready for an earlier build gets ready again for this one.
  // N4 (14 Oct): a ready mark from another build sits in every cache this worker could look in by mistake (the shell
  // cache, an old build's caches), so a check that is not tied to this build's own cache fails here.
  test('ready for an older build: an app launch gets ready once for this one and remembers it', async ({ page, context }) => {
    await context.addInitScript(() => {
      // Once per tab, so the reload below sees what the warm up wrote.
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('kc:v1:dev:offlineBuild', JSON.stringify('oldbuild1'));
      if (localStorage.getItem('kc:v1:p1:campaign') === null) localStorage.setItem('kc:v1:campaign', JSON.stringify({ name: 'ASH' }));
    });
    const got = workerRequests(context);
    await page.goto('./'); // in the browser first: the worker installs, nothing warms up
    await controlled(page);
    await page.evaluate(async () => {
      const ready = new URL('offline-ready', location.href).href;
      for (const k of ['pfc-shell-v1', 'pfc-assets-oldbuild1', 'pfc-code-oldbuild1']) await (await caches.open(k)).put(ready, new Response('oldbuild1'));
    });
    await asApp(context);
    await page.reload(); // now as the app
    const build = await workerBuild(page);
    expect(await remembered(page)).toBe('"oldbuild1"');
    await expect.poll(() => remembered(page), { timeout: 30000 }).toBe(build);
    expect(lists(got)).toBe(1);
    await page.reload();
    await page.getByTestId('screen-splash').click();
    await page.waitForTimeout(4500); // past the launch timer
    await openOption(page);
    await expect(page.getByTestId('install-progress')).toHaveText('Ready to play offline');
    expect(lists(got)).toBe(1);
    expect(await remembered(page)).toBe(build);
  });

  // N4 (14 Oct): after a deploy the outgoing worker can still answer the first check; once the new one takes over,
  // the page asks again, so a "ready" from the old build does not last the session.
  test('a deploy while OPTION is open: the old worker\'s "ready" is asked again, and the new build gets ready once', async ({ page, context }) => {
    test.slow(); // two warm ups
    const host = await deployHost();
    try {
      await asApp(context);
      await context.addInitScript(() => localStorage.getItem('kc:v1:p1:cartridge') ?? localStorage.setItem('kc:v1:cartridge', JSON.stringify('blue')));
      const got = workerRequests(context);
      host.build = 'deploya';
      await page.goto(host.url);
      await expect.poll(() => remembered(page), { timeout: 30000 }).toBe('"deploya"');
      await page.close();
      host.build = 'deployb';
      host.delay = 3000; // a phone network's update check
      got.length = 0;
      const next = await context.newPage();
      await next.goto(host.url);
      await next.getByTestId('screen-splash').click();
      await next.getByRole('menuitem', { name: 'OPTION' }).click(); // at once: the old worker is still in charge
      await expect.poll(() => remembered(next), { timeout: 30000 }).toBe('"deployb"');
      await expect(next.getByTestId('install-progress')).toHaveText('Ready to play offline');
      await expect(next.getByTestId('install-installed')).toHaveText('Installed ✓ — plays offline');
      expect(lists(got)).toBe(1);
    } finally {
      await host.close();
    }
  });

  // N4 (14 Oct): a hard reload leaves the page without a controller, so nothing can be asked: that is no answer, not
  // "not ready", and a ready device shows neither the held line nor the failure line.
  test('a hard reload on a ready device: no held or failure line while no worker controls the page', async ({ page, context }) => {
    await asApp(context, { saveData: true });
    await page.goto('./');
    await controlled(page);
    await page.getByTestId('screen-splash').click();
    await page.getByRole('menuitem', { name: 'OPTION' }).click();
    await page.getByTestId('install-warm').click();
    await expect(page.getByTestId('install-progress')).toHaveText('Ready to play offline', { timeout: 30000 });
    await page.addInitScript(() => {
      const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
      new MutationObserver(() => {
        for (const id of ['install-held', 'install-failed', 'install-warm']) if (document.querySelector(`[data-testid="${id}"]`) && !seen.includes(id)) seen.push(id);
      }).observe(document, { childList: true, subtree: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.reload', { ignoreCache: true });
    await expect(page.getByTestId('screen-splash')).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    await page.getByTestId('screen-splash').click();
    await page.getByRole('menuitem', { name: 'OPTION' }).click();
    // The check ends at once with no answer: the active worker already claimed the pages it will (sw.js
    // clients.claim), so no controller is coming for this one; it used to wait 10 s for one.
    await expect(page.getByTestId('install-box')).toHaveAttribute('data-check', 'unknown', { timeout: 3000 });
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([]);
    await expect(page.getByTestId('install-installed')).toHaveText('Installed ✓');
    // Opening OPTION again asks again, with the same answer and still no held or failure line.
    await page.getByTestId('screen-settings').getByTestId('back').click();
    await page.getByRole('menuitem', { name: 'OPTION' }).click();
    await expect(page.getByTestId('install-box')).toHaveAttribute('data-check', 'unknown', { timeout: 3000 });
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([]);
  });

  // N4 (14 Oct): before the check answers, the status line claims nothing it cannot know yet.
  test('OPTION right after launch: no "plays offline" before the check answers', async ({ page, context }) => {
    await asApp(context, { saveData: true });
    await context.addInitScript(() => {
      localStorage.setItem('kc:v1:dev:offlineBuild', JSON.stringify('evicted1')); // the note kept, its caches gone
      const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
      new MutationObserver(() => {
        const t = document.querySelector('[data-testid="install-installed"]')?.textContent;
        if (t && seen.at(-1) !== t) seen.push(t);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto('./');
    await page.getByTestId('screen-splash').click();
    await page.getByRole('menuitem', { name: 'OPTION' }).click();
    await expect(page.getByTestId('install-held')).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['Installed ✓']);
  });

  // Fix, 13 Oct: progress shows only once a worker answers, and finding none says so instead of a line that vanishes.
  test('no service worker to ask: no 0%, a plain "try again later" line', async ({ page }) => {
    await page.addInitScript(() => {
      // Registration fails (as in some private windows): nothing ever controls the page.
      navigator.serviceWorker.register = () => Promise.reject(new Error('blocked for the test'));
      if (localStorage.getItem('kc:v1:p1:campaign') === null) localStorage.setItem('kc:v1:campaign', JSON.stringify({ name: 'ASH' }));
    });
    await page.goto('./');
    await page.getByTestId('screen-splash').click();
    await page.getByRole('menuitem', { name: 'OPTION' }).click();
    await expect(page.getByTestId('install-box')).toBeVisible();
    await page.evaluate(() => {
      const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
      const box = document.querySelector('[data-testid="install-box"]')!;
      new MutationObserver(() => {
        const t = box.querySelector('[data-testid="install-progress"]')?.textContent;
        if (t && seen.at(-1) !== t) seen.push(t);
      }).observe(box, { childList: true, subtree: true, characterData: true });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.getByTestId('install-failed')).toHaveText("Can't get ready for offline right now. Try again later.");
    await expect(page.getByTestId('install-installed')).toHaveText('Installed ✓');
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([]);
  });

  // Fix, 13 Oct: the page asks the worker for its build, so the code chunks name no build and keep their hashes
  // across builds without a code change; only sw.js changes with every build.
  test('no code chunk carries the build id', async ({ page }) => {
    const build = JSON.parse(await workerBuild(page)) as string;
    const { files } = (await (await page.request.get('./offline.json')).json()) as { files: string[] };
    const chunks = files.filter((f) => /^assets\/[^/]+\.js$/.test(f));
    expect(chunks.length).toBeGreaterThan(1);
    const named: string[] = [];
    for (const f of chunks) if ((await (await page.request.get(`./${f}`)).text()).includes(build)) named.push(f);
    expect(named).toEqual([]);
  });

  test('a warm up downloads only the files that are not cached yet', async ({ page, context }) => {
    await page.addInitScript(() => localStorage.getItem('kc:v1:p1:campaign') ?? localStorage.setItem('kc:v1:campaign', JSON.stringify({ name: 'ASH' })));
    const got = workerRequests(context);
    await page.goto('./');
    await controlled(page);
    await page.getByTestId('screen-splash').click();
    await page.getByRole('menuitem', { name: 'OPTION' }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.getByTestId('install-progress')).toHaveText('Ready to play offline', { timeout: 30000 });
    const { files } = (await (await page.request.get('./offline.json')).json()) as { files: string[] };
    // index.html, cached when the worker installed (the page itself asks for ./), is not fetched again.
    expect(got.filter((p) => p === 'index.html')).toHaveLength(1);
    // Drop one shell file and one sprite from the caches, then ask again: only those two and the list are fetched.
    const shell = files.find((f) => f.startsWith('engine/') && f.endsWith('.js'))!;
    const sprite = files.find((f) => f.startsWith('assets/cries/'))!;
    await page.evaluate(async (fs) => {
      for (const k of await caches.keys()) for (const f of fs) await (await caches.open(k)).delete(f, { ignoreVary: true });
    }, [shell, sprite]);
    got.length = 0;
    const done = await page.evaluate(
      () =>
        new Promise((r) => {
          navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ warm?: unknown }>) => e.data?.warm === 'done' && r(e.data));
          navigator.serviceWorker.controller!.postMessage({ type: 'warm' });
        }),
    );
    expect(done).toEqual({ warm: 'done', ok: true, build: JSON.parse(await workerBuild(page)) });
    expect(got.sort()).toEqual(['offline.json', shell, sprite].sort());
  });
});
