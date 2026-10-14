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

  test('a language whose table comes late never takes the player back to where it was tapped (shelf, OPTION, YELLOW)', async ({ browser }) => {
    // The tapped language's tables arrive 1.5 s late, as on a slow network; meanwhile the player moves on.
    const open = async (cartridge: string | null) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
      const p = await ctx.newPage();
      await p.addInitScript((c) => {
        if (c) localStorage.setItem('kc:v1:cartridge', JSON.stringify(c));
        const w = window as unknown as { screens: string[] };
        w.screens = [];
        new MutationObserver(() => {
          const s = document.body?.dataset.screen ?? '';
          if (s && w.screens.at(-1) !== s) w.screens.push(s);
        }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-screen'] }); // before <html> exists
      }, cartridge);
      const asked: string[] = [];
      const served: string[] = [];
      await p.route(/\/(strings|names)\.fr-[\w-]+\.js$/, async (r) => {
        asked.push(r.request().url());
        await new Promise((done) => setTimeout(done, 1500));
        await r.continue();
        served.push(r.request().url());
      });
      await p.goto('./?debug=1');
      await p.getByTestId('screen-splash').click();
      return { p, asked, served };
    };
    type Late = Awaited<ReturnType<typeof open>>;
    /** The tables have arrived and run: a pick still waiting for them would have happened by now. */
    const arrived = async ({ p, asked, served }: Late) => {
      await expect.poll(() => served.length, { timeout: 10_000 }).toBe(2);
      await p.evaluate(async (us) => {
        await Promise.all(us.map((u) => import(u)));
        await new Promise((done) => setTimeout(done, 100));
      }, asked);
    };
    const screens = (p: Page) => p.evaluate(() => (window as unknown as { screens: string[] }).screens);
    /** Taps a language, moves on before its tables come, and checks the screen it moved to stays. */
    const moveOn = async (late: Late, from: string, go: () => Promise<void>) => {
      await late.p.getByTestId('lang-fr').click();
      await expect(late.p.getByTestId('lang-fr')).toHaveClass(/\bon\b/); // the tap shows at once
      await expect(late.p.getByTestId('lang-fr')).toHaveAttribute('aria-busy', 'true'); // and that it is loading
      await go();
      await expect(late.p.getByTestId(from)).toHaveCount(0);
      const to = (await screens(late.p)).at(-1)!;
      expect(late.served).toEqual([]); // the player moved on while the tables were still on their way
      await arrived(late);
      expect((await screens(late.p)).slice(-2)).toEqual([from, to]);
      expect(await late.p.evaluate(() => document.documentElement.lang)).toBe('en');
      await late.p.context().close();
    };
    // First launch: Français, then BLUE at once.
    const shelf = await open(null);
    await moveOn(shelf, 'screen-shelf', () => shelf.p.getByTestId('cart-blue').click());
    // OPTION: Français, then Back.
    const option = await open('blue');
    await option.p.getByTestId('settings').first().click();
    await moveOn(option, 'screen-settings', () => option.p.getByTestId('screen-settings').getByTestId('back').click());
    // YELLOW's language button: Français, then Play.
    const yellow = await open('yellow');
    await yellow.p.getByTestId('lang-button').click();
    await moveOn(yellow, 'screen-yellow', () => yellow.p.getByTestId('yellow-play').click());
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
// RELAY_URL: a relay of your own (the config's webServer starts one on :8788).
const RELAY_URL = process.env.RELAY_URL ?? 'http://localhost:8788';
const RELAY = `&relay=${RELAY_URL}`;
type KC = { netSend(m: unknown): void };
const send = (p: Page, m: unknown) => p.evaluate((m) => (window as unknown as { __kc: KC }).__kc.netSend(m), m);
type Size = { width: number; height: number };
const newPage = async (browser: Browser, viewport: Size = { width: 390, height: 844 }) => (await browser.newContext({ viewport })).newPage();
/** No cover or dip is up, so a press lands on the screen (tests/e2e/pace.ts noTransition(), copied here). */
const noTransition = (p: Page) => p.waitForFunction(() => document.documentElement.dataset.transition === undefined && !document.querySelector('.board-dip'), null, { timeout: 15_000 });
/** A card takes input (its guard is over): tests/e2e/pace.ts ready(), copied here. */
const ready = (p: Page, testid: string) => p.locator(`[data-testid="${testid}"][data-ready]`).first().waitFor({ state: 'attached', timeout: 15_000 });
/** Both end panels are up and take taps (a tap inside the card guard is dropped). */
const ended = async (...ps: Page[]) => {
  for (const p of ps) await expect(p.getByTestId('end-screen')).toBeVisible({ timeout: 8000 });
  for (const p of ps) await ready(p, 'end-screen');
};
/** Lets the fitter run (it lays the screen out on the next animation frame after a size change). */
const frames = (p: Page) => p.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
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
/** Placeholders on screen now or in the recorded lines: "Welcome back! {turn}" reached the friend's return when two
 * groups both added "online.back" (online merge, 14 Oct). Always []. */
const holes = (p: Page) =>
  p.evaluate(() => [document.body.innerText, ...((window as unknown as { lines?: [number, string][] }).lines ?? []).map(([, t]) => t)].flatMap((t) => t.match(/\{\w+\}/g) ?? []));

async function createRoom(browser: Browser, before?: (a: Page) => Promise<unknown>, viewport?: Size): Promise<{ a: Page; code: string }> {
  const a = await newPage(browser, viewport);
  await before?.(a);
  await a.goto(`./?debug=1${RELAY}`);
  await a.getByTestId('screen-splash').click();
  await a.getByTestId('play-online').click();
  await a.getByTestId('create-room').click();
  const code = (await a.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
  return { a, code };
}
async function pair(browser: Browser, before?: (a: Page) => Promise<unknown>, viewport?: Size) {
  const { a, code } = await createRoom(browser, before, viewport);
  const b = await newPage(browser, viewport);
  await b.goto(`./?debug=1${RELAY}&room=${code}`);
  for (const p of [a, b]) await expect(p.locator('#board')).toBeVisible({ timeout: 10_000 });
  for (const p of [a, b]) await noTransition(p); // the battle bars open on the board and take the pointer meanwhile
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
    await ended(a, b);
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
    // B says yes: neither screen shows the waiting line from then on. The new game says the sides swapped (C11): A
    // now plays black, B white.
    await recordLines(a);
    await b.getByTestId('rematch').click();
    for (const [p, line] of [[a, 'Sides swapped: you play TEAM ROCKET now.'], [b, 'Sides swapped: you play TEAM RED now.']] as const) await expect(p.getByTestId('text-main')).toHaveText(line, { timeout: 8000 });
    for (const p of [a, b]) expect((await lines(p)).map(([, t]) => t)).not.toContain(WAIT);
    await expect(a.getByTestId('online-menu')).toBeHidden();
    for (const p of [a, b]) expect(await holes(p)).toEqual([]);
  });

  test('N5 the friend leaves instead: the asker is told and taps Menu', async ({ browser }) => {
    const { a, b } = await pair(browser);
    await send(b, { type: 'resign' });
    await ended(a, b);
    await a.getByTestId('rematch').click();
    await expect(b.getByTestId('rematch')).toHaveClass(/asked/);
    await b.getByTestId('end-menu').click();
    await expect(a.getByTestId('text-main')).toHaveText('Your friend left.', { timeout: 5000 });
    await a.getByTestId('online-menu').click();
    await expect(a.getByTestId('screen-title')).toBeVisible();
  });

  test('N5 Rematch after the friend left says they left (no waiting line); a friend back at the end screen is said', async ({ browser }) => {
    const { a, b, code } = await pair(browser);
    await send(b, { type: 'resign' });
    await ended(a, b);
    const ctx = b.context();
    await b.getByTestId('end-menu').click();
    await expect(a.getByTestId('text-main')).toHaveText('Your friend left.', { timeout: 5000 });
    // B opens the room again, without asking for a rematch: A is told B is back.
    await recordLines(a);
    const b2 = await ctx.newPage();
    await b2.goto(`./?debug=1${RELAY}&room=${code}`);
    await expect(b2.locator('#board')).toBeVisible({ timeout: 10_000 });
    await expect(a.getByTestId('text-main')).toHaveText('Your friend is back!', { timeout: 5000 });
    for (const p of [a, b2]) expect(await holes(p)).toEqual([]);
    // B leaves again; A asks anyway: told B is gone, with Menu, never "Waiting for your friend to say yes...".
    await b2.close();
    await expect(a.getByTestId('text-main')).toHaveText('Your friend left.', { timeout: 5000 });
    await recordLines(a);
    await a.getByTestId('rematch').click();
    await expect(a.getByTestId('online-menu')).toBeVisible();
    await expect(a.getByTestId('text-main')).toHaveText('Your friend left.');
    expect((await lines(a)).map(([, t]) => t)).not.toContain(WAIT);
  });

  test('N5 with C1: a request that comes while START holds back your end panel still lights its Rematch', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await pair(browser);
    // A fool's mate: B wins. A opens START in the mate's end hold (as the mate line shows), so A's end panel waits
    // (C1), and reads OPTION.
    await play(a, b, 'f2f3');
    await play(b, a, 'e7e5');
    await play(a, b, 'g2g4');
    await a.evaluate(() =>
      new MutationObserver((_, o) => {
        if (!/blacked out/.test(document.querySelector('[data-testid="text-main"]')?.textContent ?? '')) return;
        o.disconnect();
        document.querySelector<HTMLElement>('[data-testid="start-button"]')!.click();
      }).observe(document.body, { subtree: true, childList: true, characterData: true }),
    );
    await play(b, a, 'd8h4');
    await a.getByTestId('start-menu-option').click();
    await expect(a.getByTestId('screen-settings')).toBeVisible();
    // B asks for a rematch meanwhile, while A's end panel is not built yet.
    await ended(b);
    await b.getByTestId('rematch').click();
    await expect(b.getByTestId('text-main')).toHaveText(WAIT);
    await a.waitForTimeout(6000); // A reads OPTION for a while (the request used to light only a panel built within 5 s)
    await a.getByTestId('back').click();
    await expect(a.getByTestId('end-screen')).toBeVisible({ timeout: 8000 });
    await expect(a.getByTestId('rematch')).toHaveClass(/asked/);
    await expect(a.getByTestId('text-main')).toHaveText('Your friend wants a rematch!');
  });

  test('N5 with C1: START open when the mate comes; the request is still what the text box says with the end panel', async ({ browser }) => {
    test.setTimeout(60_000);
    const { a, b } = await pair(browser);
    await play(a, b, 'f2f3');
    await play(b, a, 'e7e5');
    await play(a, b, 'g2g4');
    // A opens START while B thinks; B mates and asks for a rematch while A's game waits under START (C1).
    await a.getByTestId('start-button').click();
    await expect(a.getByTestId('start-menu-close')).toBeVisible();
    await b.click('[data-square="d8"]');
    await b.click('[data-square="h4"]');
    await ended(b);
    await b.getByTestId('swap-sides').check();
    await b.getByTestId('rematch').click();
    await expect(b.getByTestId('text-main')).toHaveText(WAIT);
    // A closes START: the mate, its line and the end hold come now, and the request after them.
    await recordLines(a);
    await a.getByTestId('start-menu-close').click();
    await ended(a);
    await expect(a.getByTestId('rematch')).toHaveClass(/asked/);
    await expect(a.getByTestId('text-main')).toHaveText('Your friend wants a rematch! (sides swap)');
    expect((await lines(a)).map(([, t]) => t)).toContain('PIKACHU fainted! RED blacked out!'); // the mate line came first
  });

  test('N8 Give up\'s question and the rematch wait keep the bar\'s place: the board does not move (360x640)', async ({ browser }) => {
    const { a, b } = await pair(browser, undefined, { width: 360, height: 640 });
    const layout = () =>
      a.evaluate(() => {
        const r = (s: string) => document.querySelector(s)?.getBoundingClientRect();
        return { board: [r('#board')?.top, r('#board')?.width], bar: r('.reactions')?.height };
      });
    await frames(a);
    const play = await layout();
    expect(play.bar).toBeGreaterThan(0);
    await a.getByTestId('resign').click();
    await expect(a.getByTestId('resign-ask')).toBeVisible();
    await frames(a);
    expect(await layout()).toEqual(play);
    await a.getByTestId('resign-no').click();
    await expect(a.getByTestId('react-0')).toBeVisible();
    await frames(a);
    expect(await layout()).toEqual(play);
    // After the game, Rematch's wait row (Menu) keeps it too.
    await send(b, { type: 'resign' });
    await ended(a);
    await a.getByTestId('rematch').click();
    await expect(a.getByTestId('online-menu')).toBeVisible();
    await frames(a);
    expect((await layout()).bar).toBe(play.bar);
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
    // Then the prompt: black to move, by the friend's plate as the header says it (C8: BLUE, the second RED seat).
    await expect(a.getByTestId('text-main')).toHaveText('BLUE to move', { timeout: 5000 });
    await expect(a.getByTestId('turn')).toHaveText('BLUE to move');
    // The friend's own screen welcomes them back with the turn line filled in (C11), their own turn.
    await expect(b2.getByTestId('text-main')).toHaveText('Welcome back! TEAM ROCKET to move');
    for (const p of [a, b2]) expect(await holes(p)).toEqual([]);
    await play(b2, a, 'e7e5');
  });

  test('N7 your own move answers at once: no selection or dots 100 ms after the release, the piece marked as sent', async ({ browser }) => {
    // The relay's answers reach the mover 300 ms late, as on a phone (CDP's network emulation does not slow a
    // WebSocket's frames, so the socket itself is routed).
    let late = 0;
    const { a, b } = await pair(browser, (a) =>
      a.routeWebSocket((u) => u.host === new URL(RELAY_URL).host, (ws) => {
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
    test.setTimeout(60_000); // two players and four moves: about 20 s with three of these running at once
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
