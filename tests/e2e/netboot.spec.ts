// SPDX-License-Identifier: AGPL-3.0-only
// Netboot (14 Oct): the first load fetches only the language in use (N1); the service worker keeps sprites across
// deploys and stores the cries played in full (N2); Online says what is happening (N5 to N9): a rematch request, a
// friend who is back, your own move at once, reactions and Give up that answer, "Making a room...".
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { deployHost, type DeployHost } from './host';

const strings = (l: string) => JSON.parse(readFileSync(`src/data/strings.${l}.json`, 'utf8')) as Record<string, string>;
const SLOW4G = { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 };
/** Slow 4G cold first contentful paint before N1 (audit, median of 3): 3.30 s. N1 takes at least 0.7 s off. */
const FCP_BEFORE_MS = 3300;

test.use({ viewport: { width: 390, height: 844 } });

test.describe('N1 the first load fetches one language', () => {
  test('a French save boots in French: no English frame, and only French tables are fetched', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kc:v1:lang', JSON.stringify('fr'));
      // Every painted frame's text, from the first one.
      const frames: string[] = ((window as unknown as { frames_: string[] }).frames_ = []);
      const tick = () => {
        const t = document.getElementById('app')?.innerText.trim();
        if (t && frames.at(-1) !== t) frames.push(t);
        if (frames.length < 50) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const tables: string[] = [];
    page.on('request', (r) => /\/(strings|names)\.[\w-]+-[\w-]+\.js$/.test(r.url()) && tables.push(r.url().split('/').pop()!.replace(/-[\w-]+\.js$/, '')));
    await page.goto('./?debug=1');
    await expect(page.getByTestId('screen-splash')).toContainText(strings('fr')['splash.tap']!);
    const frames = await page.evaluate(() => (window as unknown as { frames_: string[] }).frames_);
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) expect(f).not.toContain(strings('en')['splash.tap']);
    expect(frames[0]).toContain(strings('fr')['splash.tap']);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
    expect(tables.sort()).toEqual(['names.fr', 'strings.fr']);
  });

  test('switching language on the shelf and in OPTION loads it on demand', async ({ browser, page }) => {
    const tablesOf = (p: Page) => {
      const tables: string[] = [];
      p.on('request', (r) => /\/strings\.[\w-]+-[\w-]+\.js$/.test(r.url()) && tables.push(r.url().split('/').pop()!.replace(/-[\w-]+\.js$/, '')));
      return tables;
    };
    // First launch: the shelf.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
    const shelf = await ctx.newPage();
    const fetched = tablesOf(shelf);
    await shelf.goto('./?debug=1');
    await shelf.getByTestId('screen-splash').click();
    await expect(shelf.getByTestId('screen-shelf')).toBeVisible();
    expect(fetched).toEqual([]); // an English device fetches no table at all
    await shelf.getByTestId('lang-fr').click();
    await expect(shelf.getByTestId('screen-shelf').locator('h2')).toHaveText(strings('fr')['shelf.title']!);
    expect(await shelf.evaluate(() => document.documentElement.lang)).toBe('fr');
    expect(fetched).toEqual(['strings.fr']);
    await ctx.close();
    // OPTION.
    const fetched2 = tablesOf(page);
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('settings').first().click();
    await page.getByTestId('lang-de').click();
    await expect(page.getByTestId('screen-settings').locator('h2').first()).toHaveText(strings('de')['title.settings']!);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
    expect(fetched2).toEqual(['strings.de']);
  });

  test('@perf Slow 4G cold first contentful paint (median of 3)', async ({ browser }) => {
    test.setTimeout(120_000);
    const fcp = async (lang?: string) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      if (lang) await ctx.addInitScript((l) => localStorage.setItem('kc:v1:lang', JSON.stringify(l)), lang);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', SLOW4G);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto('./', { waitUntil: 'commit' });
      const t = await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime, null, { timeout: 60_000 });
      const ms = (await t.jsonValue()) as number;
      await ctx.close();
      return ms;
    };
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[1]!;
    const en: number[] = [];
    const fr: number[] = [];
    for (let i = 0; i < 3; i++) en.push(await fcp());
    for (let i = 0; i < 3; i++) fr.push(await fcp('fr'));
    console.log(`N1 Slow 4G cold FCP, English device: ${en.map(Math.round).join(', ')} ms (median ${Math.round(median(en))}); French save: ${fr.map(Math.round).join(', ')} ms (median ${Math.round(median(fr))}); before N1 ${FCP_BEFORE_MS} ms`);
    expect(median(en)).toBeLessThanOrEqual(FCP_BEFORE_MS - 700);
  });
});

/** Paths (from the site root) of every request the service worker sends to the network. */
const workerRequests = (context: BrowserContext) => {
  const got: string[] = [];
  context.on('request', (r) => void (r.serviceWorker() && got.push(new URL(r.url()).pathname.slice(1))));
  return got;
};
const controlled = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
/** The worker that controls the page: is its build ready offline, and which build is it. */
const ask = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ ready: boolean; build: string } | null>((r) => {
        const w = navigator.serviceWorker.controller;
        if (!w) return r(null);
        const c = new MessageChannel();
        c.port1.onmessage = (e) => r(e.data as { ready: boolean; build: string });
        w.postMessage({ type: 'ready?' }, [c.port2]);
        setTimeout(() => r(null), 2000);
      }),
  );
/** Asks the worker for offline.json's files and waits for the end of the run. */
const warmNow = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ ok: boolean; build: string }>((r) => {
        navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ warm?: unknown; ok: boolean; build: string }>) => e.data?.warm === 'done' && r(e.data));
        navigator.serviceWorker.controller!.postMessage({ type: 'warm' });
      }),
  );
/** The cache (by name) that holds `file`, or null. */
const holder = (page: Page, file: string) =>
  page.evaluate(async (f) => {
    for (const k of await caches.keys()) if (await (await caches.open(k)).match(f, { ignoreVary: true })) return k;
    return null;
  }, file);

/** Warm up build deploy1, deploy deploy2 with the same files, and look at what the device keeps. */
async function deploy(page: Page, context: BrowserContext, host: DeployHost) {
  host.build = 'deploy1';
  await page.goto(host.url);
  await controlled(page);
  expect(await warmNow(page)).toMatchObject({ ok: true, build: 'deploy1' });
  const { files } = (await (await page.request.get(`${host.url}offline.json`)).json()) as { files: string[] };
  const sprites = files.filter((f) => /^assets\/[^/]+\//.test(f));
  const chunk = files.find((f) => /^assets\/index-[\w-]+\.js$/.test(f))!;
  expect(sprites.length).toBeGreaterThan(100);
  const spriteCache = (await holder(page, sprites[0]!))!;
  expect(spriteCache).toMatch(/^pfc-assets-/);
  const before = await page.evaluate(() => caches.keys());
  // The next launch finds a new sw.js: the new worker takes over.
  host.build = 'deploy2';
  await page.reload();
  await expect.poll(async () => (await ask(page))?.build, { timeout: 20_000 }).toBe('deploy2');
  expect(await page.evaluate(() => caches.keys())).toContain(spriteCache);
  // The Pokédex (or any screen) needs no network for a sprite this device already had.
  const got = workerRequests(context);
  const missing = await page.evaluate(async (fs) => (await Promise.all(fs.map(async (f) => ((await caches.match(f, { ignoreVary: true })) ? null : f)))).filter(Boolean), sprites);
  expect(missing).toEqual([]);
  expect(await page.evaluate(async (fs) => (await Promise.all(fs.map(async (f) => (await fetch(f)).ok))).every(Boolean), sprites.slice(0, 60))).toBe(true);
  expect(got.filter((p) => p.startsWith('assets/'))).toEqual([]);
  // Getting ready for the new build fetches its code only.
  expect(await warmNow(page)).toMatchObject({ ok: true, build: 'deploy2' });
  expect(got.filter((p) => /^assets\/[^/]+\//.test(p))).toEqual([]);
  expect(await ask(page)).toEqual({ ready: true, build: 'deploy2' });
  // The code went into a cache of the new build's own.
  const fresh = await page.evaluate(
    async ([was, f]) => {
      const out: string[] = [];
      for (const k of (await caches.keys()).filter((k) => !was.includes(k))) if (await (await caches.open(k)).match(f, { ignoreVary: true })) out.push(k);
      return out;
    },
    [before, chunk] as const,
  );
  expect(fresh).toHaveLength(1);
}

test.describe('N2 the service worker keeps sprites across deploys', () => {
  test.use({ serviceWorkers: 'allow' });

  test('a deploy with the same sprites keeps them: no sprite is fetched again, the code cache is new', async ({ page, context }) => {
    test.slow();
    const host = await deployHost();
    test.info().attach('host', { body: host.url });
    try {
      await deploy(page, context, host);
    } finally {
      await host.close();
    }
  });
  test('a cry the server answers with 206 is kept as one full 200 copy, and plays from it', async ({ page, context }) => {
    const cry = 'assets/cries/150.ogg'; // MEWTWO: on no default team, so nothing preloads it
    const ranged: number[] = [];
    context.on('response', (r) => r.request().serviceWorker() && r.url().endsWith(`/${cry}`) && r.request().headers().range && ranged.push(r.status()));
    const size = (await (await page.request.get(`./${cry}`)).body()).length;
    await page.goto('./');
    await controlled(page);
    expect(await holder(page, cry)).toBeNull();
    const load = () =>
      page.evaluate(
        (src) =>
          new Promise<number>((ok, fail) => {
            const a = new Audio(src);
            a.addEventListener('loadedmetadata', () => ok(a.duration), { once: true });
            a.addEventListener('error', () => fail(new Error(`audio error ${a.error?.code}`)), { once: true });
            a.load();
          }),
        cry,
      );
    expect(await load()).toBeGreaterThan(0);
    expect(ranged[0]).toBe(206); // an <audio> asks with Range, and this server answers 206 (as GitHub Pages does)
    const kept = () =>
      page.evaluate(async (f) => {
        for (const k of await caches.keys()) {
          const r = await (await caches.open(k)).match(f, { ignoreVary: true });
          if (r) return { cache: k, status: r.status, bytes: (await r.arrayBuffer()).byteLength };
        }
        return null;
      }, cry);
    await expect.poll(kept, { timeout: 10_000 }).toMatchObject({ cache: expect.stringMatching(/^pfc-assets-/), status: 200, bytes: size });
    // Played again, from the cache: the worker answers the Range from its full copy, no network.
    const n = ranged.length;
    expect(await load()).toBeGreaterThan(0);
    expect(ranged.length).toBe(n);
  });
});

// Online: two browser contexts against the local relay (online.spec.ts).
const RELAY = '&relay=http://localhost:8788';
type KC = { netSend(m: unknown): void };
const send = (p: Page, m: unknown) => p.evaluate((m) => (window as unknown as { __kc: KC }).__kc.netSend(m), m);
const newPage = async (browser: Browser) => (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
/** Every text the text box shows, with the epoch time it showed (both pages share one clock). */
const recordLines = (p: Page) =>
  p.evaluate(() => {
    const w = window as unknown as { lines: [number, string][] };
    w.lines = [];
    const box = document.querySelector('[data-testid="text-main"]')!;
    const now = () => performance.timeOrigin + performance.now();
    new MutationObserver(() => w.lines.push([now(), box.textContent ?? ''])).observe(box, { childList: true, characterData: true, subtree: true });
  });
const lines = (p: Page) => p.evaluate(() => (window as unknown as { lines: [number, string][] }).lines);
const epoch = (p: Page) => p.evaluate(() => performance.timeOrigin + performance.now());

async function createRoom(browser: Browser, before?: (a: Page) => Promise<unknown>): Promise<{ a: Page; code: string }> {
  const a = await newPage(browser);
  await before?.(a);
  await a.goto(`./?debug=1${RELAY}`);
  await a.getByTestId('screen-splash').click();
  await a.getByTestId('play-online').click();
  await a.getByTestId('create-room').click();
  const code = (await a.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
  return { a, code };
}
async function pair(browser: Browser, before?: (a: Page) => Promise<unknown>) {
  const { a, code } = await createRoom(browser, before);
  const b = await newPage(browser);
  await b.goto(`./?debug=1${RELAY}&room=${code}`);
  for (const p of [a, b]) await expect(p.locator('#board')).toBeVisible({ timeout: 10_000 });
  return { a, b, code };
}
async function play(mover: Page, other: Page, uci: string) {
  await mover.click(`[data-square="${uci.slice(0, 2)}"]`);
  await mover.click(`[data-square="${uci.slice(2, 4)}"]`);
  for (const p of [mover, other]) await expect(p.locator(`[data-square="${uci.slice(2, 4)}"]`)).toHaveAttribute('data-piece', /./, { timeout: 8000 });
  await expect(other.locator(`[data-square="${uci.slice(0, 2)}"]`)).not.toHaveAttribute('data-piece', /./);
}

test.describe('Online (N5 to N9)', () => {
  const WAIT = 'Waiting for your friend to say yes...';

  test('N9 the creator reads "Making a room..." until the waiting room', async ({ browser }) => {
    const a = await newPage(browser);
    // The relay's answer takes a moment, as on a phone network.
    await a.route('**/room', async (route) => (route.request().method() === 'POST' ? setTimeout(() => void route.continue(), 600) : route.continue()));
    await a.addInitScript(() => {
      const seen: string[] = ((window as unknown as { seen: string[] }).seen = []);
      new MutationObserver(() => {
        const t = document.querySelector('[data-testid="online-message"]')?.textContent;
        if (t && seen.at(-1) !== t) seen.push(t);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await a.goto(`./?debug=1${RELAY}`);
    await a.getByTestId('screen-splash').click();
    await a.getByTestId('play-online').click();
    await a.getByTestId('create-room').click();
    await expect(a.getByTestId('online-message')).toHaveText('Making a room...');
    await expect(a.getByTestId('room-code')).toHaveText(/^[A-Z]{4}$/, { timeout: 10_000 });
    expect(await a.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['Making a room...']);
  });

  test('N5 a rematch request shows on the friend\'s screen; the asker can leave; no waiting line once accepted', async ({ browser }) => {
    const { a, b } = await pair(browser);
    await play(a, b, 'e2e4');
    await send(b, { type: 'resign' }); // B gives up (straight to the relay)
    for (const p of [a, b]) await expect(p.getByTestId('end-screen')).toBeVisible({ timeout: 8000 });
    await recordLines(b);
    // When B's screen shows the request and B's Rematch button stands out, from A's tap.
    await b.evaluate(() => {
      const w = window as unknown as { asked: number };
      const box = document.querySelector('[data-testid="text-main"]')!;
      const check = () => {
        if (!w.asked && /wants a rematch/.test(box.textContent ?? '') && document.querySelector('[data-testid="rematch"]')?.classList.contains('asked')) w.asked = performance.timeOrigin + performance.now();
        if (!w.asked) requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    await a.getByTestId('swap-sides').check();
    const tap = await epoch(a);
    await a.getByTestId('rematch').click();
    await expect.poll(() => b.evaluate(() => (window as unknown as { asked?: number }).asked ?? 0), { timeout: 3000 }).toBeGreaterThan(0);
    const asked = await b.evaluate(() => (window as unknown as { asked: number }).asked);
    expect(asked - tap).toBeLessThan(500);
    await expect(b.getByTestId('text-main')).toHaveText('Your friend wants a rematch! (sides swap)');
    // A waits with a way out.
    await expect(a.getByTestId('text-main')).toHaveText(WAIT);
    await expect(a.getByTestId('online-menu')).toBeVisible();
    // B says yes: neither screen shows the waiting line from then on.
    await recordLines(a);
    await b.getByTestId('rematch').click();
    for (const p of [a, b]) await expect(p.getByTestId('text-main')).toHaveText(/^You play /, { timeout: 8000 });
    for (const p of [a, b]) expect((await lines(p)).map(([, t]) => t)).not.toContain(WAIT);
    await expect(a.getByTestId('online-menu')).toBeHidden();
    // Sides swapped: A now plays black.
    await expect(a.getByTestId('text-main')).toHaveText('You play TEAM ROCKET');
  });

  test('N5 the friend leaves instead: the asker is told and taps Menu', async ({ browser }) => {
    const { a, b } = await pair(browser);
    await send(b, { type: 'resign' });
    for (const p of [a, b]) await expect(p.getByTestId('end-screen')).toBeVisible({ timeout: 8000 });
    await a.getByTestId('rematch').click();
    await expect(b.getByTestId('rematch')).toHaveClass(/asked/);
    await b.getByTestId('end-menu').click();
    await expect(a.getByTestId('text-main')).toHaveText('Your friend left.', { timeout: 5000 });
    await a.getByTestId('online-menu').click();
    await expect(a.getByTestId('screen-title')).toBeVisible();
  });

  test('N6 your friend is back: the lost connection line goes within 1 s, then your prompt', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b, code } = await pair(browser);
    await play(a, b, 'e2e4');
    const ctx = b.context();
    await b.close();
    await expect(a.getByTestId('text-main')).toHaveText('Your friend lost connection. Waiting up to 60 seconds...', { timeout: 5000 });
    await recordLines(a);
    const b2 = await ctx.newPage();
    await b2.goto(`./?debug=1${RELAY}&room=${code}`);
    await expect(b2.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp', { timeout: 8000 });
    const back = await epoch(b2);
    await expect.poll(async () => (await lines(a)).some(([t, s]) => s === 'Your friend is back!' && t <= back + 1000), { timeout: 3000 }).toBe(true);
    await expect(a.getByTestId('text-main')).not.toHaveText(/lost connection/);
    // Then the prompt: black to move.
    await expect(a.getByTestId('text-main')).toHaveText('TEAM ROCKET to move', { timeout: 5000 });
    await play(b2, a, 'e7e5');
  });

  test('N7 your own move answers at once: no selection or dots 100 ms after the release, the piece marked as sent', async ({ browser }) => {
    // The relay's answers reach the mover 300 ms late, as on a phone (CDP's network emulation does not slow a
    // WebSocket's frames, so the socket itself is routed).
    let late = 0;
    const { a, b } = await pair(browser, (a) =>
      a.routeWebSocket(/:8788\//, (ws) => {
        const relay = ws.connectToServer();
        relay.onMessage((m) => void setTimeout(() => ws.send(m), late));
        ws.onMessage((m) => relay.send(m));
      }),
    );
    late = 300;
    await a.click('[data-square="e2"]');
    await expect(a.locator('[data-square="e4"]')).toHaveClass(/dot/);
    await a.evaluate(() =>
      document.addEventListener(
        'pointerup',
        () =>
          setTimeout(() => {
            (window as unknown as { after: unknown }).after = {
              selected: document.querySelectorAll('#board .sq.selected').length,
              dots: document.querySelectorAll('#board .sq.dot, #board .sq.capture').length,
              pending: !!document.querySelector('[data-square="e2"] .piece.pending'),
            };
          }, 100),
        { capture: true, once: true },
      ),
    );
    await a.click('[data-square="e4"]');
    await expect.poll(() => a.evaluate(() => (window as unknown as { after?: unknown }).after ?? null)).toEqual({ selected: 0, dots: 0, pending: true });
    // The relay's state lands it as usual.
    for (const p of [a, b]) await expect(p.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp', { timeout: 8000 });
    await expect(a.locator('#board .pending')).toHaveCount(0);
  });

  test('N8 reactions answer the sender, Give up asks first, and the bar goes when the game ends', async ({ browser }) => {
    const { a, b } = await pair(browser);
    // A press shows on a plain button, and the sender sees "Sent!" within 100 ms.
    const react = a.getByTestId('react-1');
    const look = () => react.evaluate((e) => { const c = getComputedStyle(e); return [c.filter, c.backgroundColor, c.transform].join(' / '); });
    const before = await look();
    const box = (await react.boundingBox())!;
    await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await a.mouse.down();
    expect(await look()).not.toBe(before);
    await a.evaluate(() =>
      document.addEventListener('click', () => setTimeout(() => ((window as unknown as { sent: string }).sent = [...document.querySelectorAll('[data-testid="toast"]')].map((t) => t.textContent).join('|')), 100), { capture: true, once: true }),
    );
    await a.mouse.up();
    await expect.poll(() => a.evaluate(() => (window as unknown as { sent?: string }).sent ?? null)).toBe('Sent!');
    await expect(b.getByTestId('toast')).toHaveText('Oops!');
    // One tap on Give up asks; No keeps playing.
    await a.getByTestId('resign').click();
    await expect(a.getByTestId('resign-ask')).toHaveText('Give up?');
    await a.waitForTimeout(1000); // nothing may happen meanwhile
    for (const p of [a, b]) await expect(p.getByTestId('end-screen')).toBeHidden();
    await a.getByTestId('resign-no').click();
    await expect(a.getByTestId('react-0')).toBeVisible();
    await expect(a.getByTestId('resign-ask')).toHaveCount(0);
    // A fool's mate: the reactions and Give up go with the game.
    await play(a, b, 'f2f3');
    await play(b, a, 'e7e5');
    await play(a, b, 'g2g4');
    await play(b, a, 'd8h4');
    for (const p of [a, b]) await expect(p.locator('.reactions')).toBeHidden();
    for (const p of [a, b]) await expect(p.getByTestId('end-screen')).toBeVisible({ timeout: 8000 });
    for (const p of [a, b]) await expect(p.getByTestId('resign')).toBeHidden();
  });

  test('N8 Give up, then Yes, ends the game for both', async ({ browser }) => {
    const { a, b } = await pair(browser);
    await a.getByTestId('resign').click();
    await a.getByTestId('resign-yes').click();
    await expect(a.getByTestId('end-text')).toHaveText('You gave up.', { timeout: 8000 });
    await expect(b.getByTestId('end-text')).toHaveText('Your friend gave up. You win!', { timeout: 8000 });
  });
});
