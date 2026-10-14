// SPDX-License-Identifier: AGPL-3.0-only
// Real trainer art (loading fix, 14 Oct): the trainer sprites (public/assets/trainers/) and the hub's item sheet
// (assets/items/hub-sheet.png) are fetched at build time; where the build ran without network they are 695-byte
// stand-ins. These checks run in CI (process.env.CI) or with REAL_ART=1; on the stand-ins, the assertions that need
// the real files (byte sizes, exact dimensions, opaque cells) are skipped with a note. Millisecond budgets under Slow
// 4G are @perf (PERF=1) and log their numbers. Each test's title starts with its number in the brief.
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

test.skip(!process.env.CI && !process.env.REAL_ART, 'Real trainer art is in CI and production only (network policy here); REAL_ART=1 runs these on the stand-ins.');

const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 };
const RELAY = `&relay=${process.env.RELAY_URL ?? 'http://localhost:8788'}`; // the config's local relay; RELAY_URL for another one
const ALL_THEMES = ['advancedPawn', 'advantage', 'backRankMate', 'capturingDefender', 'castling', 'deflection', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'fork', 'hangingPiece', 'mateIn1', 'mateIn2', 'pin', 'promotion', 'skewer', 'trappedPiece', 'xRayAttack'];
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, team: { p: 'pidgey' }, warmup: true, lessonsSeen: ALL_THEMES, tips: ['puzzle'], puzzlesStarted: 5, journey: { cleared: [], beaten: [], visited: ['route-1'] } };
/** Mate in 1 by a capture (a battle): the set up a2-a3, then Re8xe1#. */
const CAPTURE1 = ['pace1', '4r1k1/5ppp/8/8/8/8/P4PPP/4N1K1 w - - 0 1', 'a2a3 e8e1', 600];
const data = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', name), 'utf8'));
const trainers = data('trainers.json') as { people: Record<string, string>; classes: Record<string, string> };
const hubItems = data('hub-items.json') as { cell: number; items: string[] };
const PEOPLE = trainers.people;
const CLASSES = trainers.classes;

type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);

/** The build's trainer PNGs are the 695-byte stand-ins (no network when it ran), not the real art. */
async function standIns(request: APIRequestContext): Promise<boolean> {
  return (await (await request.get('assets/trainers/oak.png')).body()).length === 695;
}
/** True when an assertion needs the real files; on the stand-ins it is skipped with a note. */
function realOnly(stand: boolean, what: string): boolean {
  if (stand) test.info().annotations.push({ type: 'stand-in', description: `skipped on the 695-byte stand-ins: ${what} (checked in CI)` });
  return !stand;
}

/** Frame by frame: cover phases with what the trainer sprites, plates, board and hub icons show at each change, and
 * the battle overlay's first frame. */
function watcher(): void {
  type Snap = Record<string, unknown>;
  const T = { events: [] as Snap[], battles: [] as Snap[], slides: 0, gifts: [] as Snap[], bad: [] as string[], armed: true };
  (window as unknown as { __ta: typeof T }).__ta = T;
  const ok = (i: HTMLImageElement | null | undefined) => !!i && i.complete && i.naturalWidth > 0;
  const plate = (id: string) => {
    const i = document.querySelector<HTMLImageElement>(`[data-testid="${id}"] .plate-sprite img`);
    return i ? { trainer: i.dataset.trainer ?? '', ok: ok(i), src: i.getAttribute('src') ?? '' } : null;
  };
  const snap = (): Snap => ({
    t: performance.now(),
    scr: document.querySelector('#app .stage > [data-testid]')?.getAttribute('data-testid') ?? '',
    cover: (() => {
      const c = document.querySelector<HTMLElement>('.screen-cover');
      return c ? `${c.dataset.kind}:${c.dataset.phase ?? 'up'}` : '';
    })(),
    top: plate('plate-top'),
    bottom: plate('plate-bottom'),
    notDrawn: [...document.querySelectorAll<HTMLImageElement>('#app img[data-trainer]')].filter((i) => i.getClientRects().length && !ok(i)).map((i) => i.dataset.trainer),
    loading: document.querySelectorAll('#app .trainer-sprite.loading').length,
    sil: document.querySelectorAll('#app .trainer-sprite.sil').length,
    board: [...document.querySelectorAll<HTMLImageElement>('.board img')].filter((i) => !ok(i)).length,
    sheet: document.documentElement.dataset.hubSheet ?? '',
  });
  let last = '';
  let battleOn = false;
  const tick = () => {
    if (T.armed) {
      const s = snap();
      const key = `${s.scr}|${s.cover}`;
      if (key !== last) T.events.push(s);
      last = key;
      const bat = document.querySelector<HTMLElement>('[data-testid="battle"]');
      const on = !!bat && !bat.hidden && bat.style.opacity !== '0' && getComputedStyle(bat).display !== 'none';
      if (on && !battleOn) {
        const im = (sel: string) => {
          const i = bat!.querySelector<HTMLImageElement>(sel);
          return i ? { ok: ok(i), src: i.getAttribute('src') ?? '', hidden: i.hidden } : null;
        };
        T.battles.push({ t: performance.now(), near: im('.t-near img'), far: im('.t-far img'), top: s.top, bottom: s.bottom });
      }
      battleOn = on;
      // Any plate or battle trainer shown without its picture.
      for (const i of document.querySelectorAll<HTMLImageElement>('.plate-sprite img, [data-testid="battle"] .trainer img')) {
        if (i.getClientRects().length && !i.hidden && i.getAttribute('src') && i.complete && i.naturalWidth === 0) T.bad.push(i.getAttribute('src')!);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  new MutationObserver((recs) => {
    for (const r of recs) {
      for (const n of r.addedNodes) {
        if (n instanceof HTMLElement && n.matches('.story-trainer.slide-in')) T.slides++;
        // A first clear's gift card (J4), the moment it goes in: is its Pokémon drawn?
        const gift = n instanceof HTMLElement && n.matches('[data-testid="gift-card"]') ? n.querySelector<HTMLImageElement>('img') : null;
        if (gift) T.gifts.push({ species: gift.dataset.species ?? '', ok: ok(gift) });
      }
    }
  }).observe(document, { childList: true, subtree: true });
}
type Ev = { t: number; scr: string; cover: string; top: { trainer: string; ok: boolean; src: string } | null; bottom: { trainer: string; ok: boolean; src: string } | null; notDrawn: string[]; loading: number; sil: number; board: number; sheet: string };
type Ta = { events: Ev[]; battles: { t: number; near: { ok: boolean; src: string; hidden: boolean } | null; far: { ok: boolean; src: string; hidden: boolean } | null; top: Ev['top']; bottom: Ev['bottom'] }[]; slides: number; gifts: { species: string; ok: boolean }[]; bad: string[] };
const ta = (page: Page) => page.evaluate(() => (window as unknown as { __ta: Ta }).__ta);

async function fresh(browser: Browser, store: Record<string, unknown>, slow = false): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(watcher);
  await context.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, store);
  const page = await context.newPage();
  if (slow) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  return { context, page };
}
const blue = (save: object | null = SAVE, extra: Record<string, unknown> = {}) => ({ 'kc:v1:cartridge': 'blue', ...(save ? { 'kc:v1:campaign': save } : {}), 'kc:v1:settings': { v: 2, anim: 'off' }, ...extra });
async function boot(page: Page, query = '?debug=1'): Promise<void> {
  await page.goto(`./${query}`, { timeout: 120_000 });
  await page.getByTestId('screen-splash').click({ timeout: 120_000 });
}
/** No cover or dip, no hold. */
const settled = (page: Page, timeout = 30_000) =>
  page.waitForFunction(() => document.documentElement.dataset.transition === undefined && !document.querySelector('.board-dip') && document.body.dataset.hold === undefined, null, { timeout });
/** Every trainer sprite in `scope` is drawn and none stands in as a silhouette. */
async function drawnTrainers(page: Page, scope: string, min = 1): Promise<string[]> {
  await expect.poll(() => page.locator(`${scope} img[data-trainer]`).count(), { timeout: 15_000, message: `${scope}: trainer sprites` }).toBeGreaterThanOrEqual(min);
  await expect.poll(() => page.$$eval(`${scope} img[data-trainer]`, (imgs) => imgs.filter((i) => !((i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)).map((i) => (i as HTMLImageElement).dataset.trainer)), { timeout: 15_000, message: scope }).toEqual([]);
  expect(await page.locator(`${scope} .trainer-sprite.sil`).count(), `${scope}: silhouettes`).toBe(0);
  return page.$$eval(`${scope} img[data-trainer]`, (imgs) => imgs.map((i) => (i as HTMLImageElement).dataset.trainer ?? ''));
}

/** A trainer row's tap: Oak's mini lesson first when the theme is new (Got it!), then the "wants to battle!" card. */
async function lessonThenIntro(page: Page): Promise<void> {
  await page.getByTestId('trainer-intro').or(page.getByTestId('lesson-ok')).first().waitFor({ timeout: 60_000 });
  if (await page.getByTestId('lesson-ok').isVisible()) await page.getByTestId('lesson-ok').click();
  await page.getByTestId('trainer-intro').waitFor({ timeout: 60_000 });
}

/** Plays what the Journey shows (stories, cards, puzzles by their answers) until the map is back with nothing over it. */
async function playThrough(page: Page, stop: () => Promise<boolean> = async () => false) {
  for (let i = 0; i < 1500; i++) {
    if (await stop()) return;
    const vis = (id: string) => page.getByTestId(id).first().isVisible();
    if (await page.locator('body[data-skippable]').count()) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      await page.keyboard.press('Space');
    } else if (await vis('story')) await page.getByTestId('story').first().click().catch(() => undefined);
    else if (await vis('goal-card')) await page.getByTestId('goal-card').click().catch(() => undefined);
    else if (await vis('trainer-intro')) await page.getByTestId('trainer-intro').click().catch(() => undefined);
    else if (await vis('lesson-ok')) await page.getByTestId('lesson-ok').click().catch(() => undefined);
    else if (await vis('review-continue')) await page.getByTestId('review-continue').click().catch(() => undefined);
    else if (await page.locator('.overlay .progress-card').first().isVisible()) await page.locator('.overlay .progress-card').first().click().catch(() => undefined);
    else if (await page.locator('[data-testid^="choose-"]').first().isVisible()) await page.locator('[data-testid^="choose-"]').first().click().catch(() => undefined);
    else if (await vis('hof-ok')) return;
    else if ((await kc<string>(page, 'puzzlePhase')) === 'player' && (await page.getByTestId('screen-game').isVisible())) {
      const uci = (await kc<string>(page, 'puzzleAnswer'))!;
      await page.click(`[data-square="${uci.slice(0, 2)}"]`).catch(() => undefined);
      await page.click(`[data-square="${uci.slice(2, 4)}"]`).catch(() => undefined);
      if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`).catch(() => undefined);
    } else if ((await vis('screen-map')) && !(await page.locator('#app > .overlay:not([hidden]), [data-testid="screen-cover"]').count())) return;
    await page.waitForTimeout(150);
  }
  throw new Error('playThrough did not get back to the map');
}

test.describe('trainer art', () => {
  test('1 assets: every trainer sprite and the hub sheet are served, decode and are small', async ({ page, request }) => {
    const stand = await standIns(request);
    const ids = [...new Set([...Object.values(PEOPLE), ...Object.values(CLASSES)])];
    for (const id of ids) {
      const r = await request.get(`assets/trainers/${id}.png`);
      expect(r.status(), `assets/trainers/${id}.png`).toBe(200);
      if (realOnly(stand, `${id}.png at most 6 KB`)) expect((await r.body()).length, `${id}.png bytes`).toBeLessThanOrEqual(6 * 1024);
    }
    await page.goto('./?debug=1');
    const widths = await page.evaluate(async (list) => Promise.all(list.map(async (id) => {
      const i = new Image();
      i.src = `assets/trainers/${id}.png`;
      await i.decode().catch(() => undefined);
      return [id, i.naturalWidth] as const;
    })), ids);
    for (const [id, w] of widths) expect(w, `${id}.png decodes`).toBeGreaterThan(0);
    const sheet = await page.evaluate(async ({ cell, n }) => {
      const i = new Image();
      i.src = 'assets/items/hub-sheet.png';
      await i.decode();
      const c = document.createElement('canvas');
      c.width = i.naturalWidth;
      c.height = i.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(i, 0, 0);
      const opaque: boolean[] = [];
      for (let k = 0; k < n; k++) opaque.push(Array.from(g.getImageData(k * cell, 0, cell, cell).data).some((v, j) => j % 4 === 3 && v > 0));
      return { w: i.naturalWidth, h: i.naturalHeight, opaque };
    }, { cell: hubItems.cell, n: hubItems.items.length });
    expect(sheet.w).toBeGreaterThan(0);
    if (realOnly(stand, 'hub-sheet.png is 210x30 with 7 opaque 30 px cells')) {
      expect([sheet.w, sheet.h]).toEqual([hubItems.cell * hubItems.items.length, hubItems.cell]);
      expect(sheet.opaque).toEqual(hubItems.items.map(() => true));
    }
  });

  test("2 Oak's first box, cold Slow 4G: Oak is drawn as the cover goes, and oak.png is fetched once", async ({ browser }) => {
    test.setTimeout(180_000);
    const camp = { v: 2, name: 'JADE', starter: 'charmander', introSeen: true, teamRules: 2, badges: ['boulder'], caught: { charmander: 1 }, playMs: 600_000 };
    const { context, page } = await fresh(browser, blue(camp), true);
    await boot(page, '?debug=1&menu=1');
    await page.getByTestId('start-new').click({ timeout: 60_000 });
    await page.getByTestId('screen-splash').click({ timeout: 120_000 });
    await page.getByTestId('cart-blue').click({ timeout: 60_000 });
    await page.getByTestId('story').waitFor({ timeout: 60_000 });
    const first = await page.getByTestId('story-text').textContent();
    await expect.poll(() => page.locator('.screen-intro [data-trainer="oak"]').evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0), { timeout: 15_000 }).toBe(true);
    await expect(page.locator('.screen-intro .trainer-sprite.loading')).toHaveCount(0);
    expect(await page.getByTestId('story-text').textContent()).toBe(first);
    const oak = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /assets\/trainers\/oak\.png$/.test(r.name)).length);
    expect(oak, 'oak.png requests in this page load').toBe(1);
    // When the cover went, Oak was already drawn (logged; the 100 ms budget is in @perf below).
    await settled(page, 60_000);
    const gone = (await ta(page)).events.find((e) => e.scr === 'screen-intro' && e.cover === '');
    console.log(`2: cover gone on the first intro box, trainers not drawn then: ${JSON.stringify(gone?.notDrawn)}`);
    await context.close();
  });

  test('3 hub sheet, returning player, cold Slow 4G: ready before the hub cover goes, fetched once', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, blue(), true);
    await boot(page);
    await page.getByTestId('screen-title').waitFor({ timeout: 60_000 });
    await settled(page, 60_000);
    const l = await ta(page);
    const gone = l.events.find((e) => e.scr === 'screen-title' && e.cover === '');
    expect(gone, 'the hub was revealed').toBeTruthy();
    expect(gone!.sheet, 'html[data-hub-sheet] when the hub cover went').toBe('ready');
    const icons = await page.$$eval('.sheet-icon', (els) => els.map((e) => getComputedStyle(e).backgroundImage));
    expect(icons.length).toBeGreaterThan(0);
    for (const bg of icons) expect(bg).toMatch(/assets\/items\/hub-sheet\.png"?\)$/);
    expect(await page.locator('.tile-pic').count()).toBeGreaterThan(0);
    expect(await page.$$eval('.tile-pic', (els) => els.filter((e) => !e.querySelector('svg, .sheet-icon')).length)).toBe(0);
    const n = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /assets\/items\/hub-sheet\.png$/.test(r.name)).length);
    expect(n, 'hub-sheet.png requests in this page load').toBe(1);
    await context.close();
  });

  test('4 no silhouettes: the name step, Route 1 rows, the trainer intro, Brock, the rival, the level picker, plates', async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await fresh(browser, blue(null));
    await boot(page);
    await page.getByTestId('kanto').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
    expect(await drawnTrainers(page, '.screen-name')).toContain('red-gen1');
    await page.getByTestId('name-1').click();
    await page.getByTestId('starter-bulbasaur').click();
    for (let i = 0; i < 2; i++) await page.getByTestId('story').click();
    await page.getByTestId('route-route-1').click();
    await page.getByTestId('warmup-skip').click();
    await drawnTrainers(page, '.trainer-row .row-sprite', 2);
    await page.getByTestId('battle-trainer').click();
    await lessonThenIntro(page);
    await drawnTrainers(page, '[data-testid="trainer-intro"]');
    // Pewter Gym: Brock's story, then his card with exactly one Brock on screen.
    await kc(page, 'enterPlace', 'pewter-gym');
    expect(await drawnTrainers(page, '.overlay')).toContain('brock-gen1');
    for (let i = 0; i < 8 && !(await page.getByTestId('trainer-intro').isVisible()); i++) await page.getByTestId('story').click();
    await expect(page.getByTestId('trainer-intro')).toBeVisible();
    await expect(page.locator('.overlay .trainer-sprite img[data-trainer]')).toHaveCount(1);
    await drawnTrainers(page, '.overlay');
    // The rival.
    await kc(page, 'enterPlace', 'rival-1');
    await expect.poll(async () => (await page.locator('.overlay img[data-trainer="blue-gen1"]').count()) > 0, { timeout: 15_000 }).toBe(true);
    await drawnTrainers(page, '.overlay');
    // vs Computer: the level picker's four trainers and yours, then the plates at levels 1 to 4.
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('vs-computer').click();
    await page.getByTestId('team-red').click();
    const ladder = await drawnTrainers(page, '[data-testid="screen-level"]', 5);
    for (const id of ['rocketgrunt', 'rocketgruntf', 'jessiejames-gen1', 'giovanni-gen1', 'red-gen1']) expect(ladder).toContain(id);
    for (const level of [1, 2, 3, 4]) {
      await kc(page, 'setMode', 'computer', level, 'w');
      await settled(page);
      await drawnTrainers(page, '[data-testid="plate-top"]');
      await drawnTrainers(page, '[data-testid="plate-bottom"]');
    }
    await kc(page, 'setMode', 'two-players', 1, 'w');
    await settled(page);
    expect([...(await drawnTrainers(page, '[data-testid="plate-top"]')), ...(await drawnTrainers(page, '[data-testid="plate-bottom"]'))]).toEqual(['blue-gen1', 'red-gen1']);
    expect((await ta(page)).bad).toEqual([]);
    await context.close();
  });

  test('4 no silhouettes: Two Players with two saves, the START summary and the profile picker', async ({ browser }) => {
    test.setTimeout(180_000);
    const camp = (name: string) => ({ v: 2, name, starter: 'charmander', introSeen: true, teamRules: 2, badges: ['boulder'], caught: { charmander: 1 }, playMs: 600_000 });
    const { context, page } = await fresh(browser, { 'kc:v1:profiles': { slots: [1, 2], current: 1 }, 'kc:v1:p1:cartridge': 'blue', 'kc:v1:p1:campaign': camp('JADE'), 'kc:v1:p1:settings': { v: 2, anim: 'off' }, 'kc:v1:p2:cartridge': 'blue', 'kc:v1:p2:campaign': camp('SKY'), 'kc:v1:p2:playerTrainer': 'meir' });
    await boot(page, '?debug=1&menu=1');
    await page.getByTestId('screen-start').waitFor();
    await drawnTrainers(page, '[data-testid="start-summary"]');
    await page.getByTestId('start-switch').click();
    await drawnTrainers(page, '[data-testid="slot-1"]');
    await drawnTrainers(page, '[data-testid="slot-2"]');
    await page.getByTestId('slot-pick-1').click();
    await page.getByTestId('screen-splash').click();
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('two-players').click();
    const duo = await drawnTrainers(page, '[data-testid="screen-duo"]', 0);
    console.log(`4: the duo picker shows ${JSON.stringify(duo)}`);
    await page.getByTestId('duo-w-1').click();
    await page.getByTestId('duo-b-2').click();
    await page.getByTestId('duo-start').click();
    await page.getByTestId('intro').waitFor();
    // Both plates are drawn before the intro card's hold ends.
    const plates = await page.$$eval('.plate-sprite img', (imgs) => imgs.map((i) => [(i as HTMLImageElement).dataset.trainer, (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0]));
    expect(plates.map((p) => p[0]).sort()).toEqual(['meir', 'red-gen1']);
    expect(plates.every((p) => p[1]), JSON.stringify(plates)).toBe(true);
    await context.close();
  });

  test('4 no silhouettes: the Champion, the Hall of Fame, and a rival win with its gift card', async ({ browser }) => {
    test.setTimeout(420_000);
    const { context, page } = await fresh(browser, blue({ ...SAVE, caught: { bulbasaur: 1, venusaur: 1 }, team: { k: 'venusaur' } }));
    await boot(page);
    await page.getByTestId('kanto').click();
    // Rival 1's win and its gift. J4 (Fix, 13 Oct) made the gift a card, the Pokémon with OAK's line under it, where
    // OAK stood beside story lines before (merge review, 14 Oct: this check still waited for him). BLUE stands beside
    // his defeat quote, drawn, and slides in once for the whole sequence; the card's SQUIRTLE (the starter neither of
    // them took) is drawn the moment the card goes in.
    await kc(page, 'enterPlace', 'rival-1');
    const quote = "BLUE: What? I picked the strong one! ...Fine. Next time it's mine.";
    await playThrough(page, async () => (await page.locator('.overlay [data-testid="story-text"]').allTextContents()).includes(quote));
    expect(await drawnTrainers(page, '.overlay .story-trainer')).toEqual(['blue-gen1']);
    const slidesAtQuote = (await ta(page)).slides;
    await page.getByTestId('story').click();
    await expect(page.getByTestId('gift-card')).toContainText("OAK: Here's a partner for you too. SQUIRTLE wanted to come along!");
    expect((await ta(page)).gifts).toEqual([{ species: 'squirtle', ok: true }]);
    expect(await page.locator('#app .trainer-sprite.sil').count(), 'silhouettes').toBe(0);
    await playThrough(page);
    expect((await ta(page)).slides, 'a story trainer slid in again within one sequence').toBe(slidesAtQuote);
    // The Champion's card: BLUE in his Champion art.
    await kc(page, 'enterPlace', 'champion');
    for (let i = 0; i < 4 && !(await page.getByTestId('trainer-intro').isVisible()); i++) await page.getByTestId('story').click();
    await expect(page.locator('[data-testid="trainer-intro"] img[data-trainer="blue-gen1champion"]')).toHaveCount(1);
    await drawnTrainers(page, '[data-testid="trainer-intro"]');
    await page.getByTestId('trainer-intro').click();
    await page.getByTestId('goal-card').click();
    await page.getByTestId('screen-game').waitFor();
    await settled(page);
    await kc(page, 'loadFen', 'k7/8/1K6/8/8/8/8/7Q w - - 0 1');
    await page.click('[data-square="h1"]');
    await page.click('[data-square="h8"]');
    await expect(page.getByTestId('story-text')).toContainText("CHAMPION", { timeout: 10_000 });
    await page.getByTestId('story').click();
    await page.getByTestId('hof-ok').waitFor();
    await drawnTrainers(page, '[data-testid="player-trainer"]');
    const hof = (await ta(page)).events.find((e) => e.scr === 'screen-hof' && /:open$/.test(e.cover));
    if (hof) expect(hof.notDrawn, 'the Hall of Fame trainer when revealed').toEqual([]);
    await context.close();
  });

  test('5 battle trainers: drawn on the first frame of a vs Computer capture and a gym puzzle capture', async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await fresh(browser, blue(SAVE, { 'kc:v1:settings': { v: 2, anim: 'full', battleStyle: 'anime' } }));
    await boot(page);
    await kc(page, 'setMode', 'computer', 1, 'w');
    await settled(page);
    await kc(page, 'loadFen', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    await page.click('[data-square="e4"]');
    await page.click('[data-square="d5"]');
    await page.getByTestId('battle').waitFor({ state: 'visible' });
    await expect.poll(async () => (await ta(page)).battles.length).toBeGreaterThan(0);
    let b = (await ta(page)).battles[0]!;
    expect(b.near?.ok && b.far?.ok, JSON.stringify(b)).toBe(true);
    expect(b.near!.src).toBe(b.bottom!.src);
    expect(b.far!.src).toBe(b.top!.src);
    await settled(page);
    // A gym puzzle whose answer is a capture.
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-quit').click().catch(() => undefined);
    await kc(page, 'enterPlace', 'pewter-gym');
    await kc(page, 'forcePuzzle', CAPTURE1, 'mateIn1');
    for (let i = 0; i < 8 && !(await page.getByTestId('trainer-intro').isVisible()); i++) await page.getByTestId('story').click();
    await page.getByTestId('trainer-intro').click();
    if (await page.getByTestId('lesson-ok').isVisible().catch(() => false)) await page.getByTestId('lesson-ok').click();
    await page.getByTestId('goal-card').click();
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 20_000 }).toBe('player');
    const before = (await ta(page)).battles.length;
    const uci = (await kc<string>(page, 'puzzleAnswer'))!;
    await page.click(`[data-square="${uci.slice(0, 2)}"]`);
    await page.click(`[data-square="${uci.slice(2, 4)}"]`);
    await expect.poll(async () => (await ta(page)).battles.length).toBeGreaterThan(before);
    b = (await ta(page)).battles[before]!;
    expect(b.near?.ok && b.far?.ok, JSON.stringify(b)).toBe(true);
    expect(b.near!.src).toBe(b.bottom!.src);
    expect(b.far!.src).toBe(b.top!.src);
    await context.close();
  });

  test('6 plates: drawn before the first vs Computer reveal ends (cold Slow 4G), and at every Journey battle cover', async ({ browser }) => {
    test.setTimeout(420_000);
    const slow = await fresh(browser, blue(), true);
    await boot(slow.page);
    await slow.page.getByTestId('vs-computer').click({ timeout: 60_000 });
    await slow.page.getByTestId('team-red').click({ timeout: 60_000 });
    await slow.page.getByTestId('level-1').click({ timeout: 60_000 });
    await slow.page.getByTestId('intro').waitFor({ timeout: 60_000 });
    const ev = (await ta(slow.page)).events;
    const open = ev.findIndex((e) => e.scr === 'screen-game' && e.cover === 'battle:open');
    const end = ev.slice(open).find((e) => e.cover === '');
    console.log(`6: first vs Computer game, plates when the reveal ended: ${JSON.stringify([end?.top, end?.bottom])}`);
    expect(end?.top?.ok && end?.bottom?.ok, 'both plates drawn before the reveal ended').toBe(true);
    await slow.context.close();
    // Journey battles: the top plate's trainer is drawn when the bars open.
    const { context, page } = await fresh(browser, blue({ ...SAVE, badges: ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'] }));
    await boot(page);
    await page.getByTestId('kanto').click();
    for (const [place, row] of [['route-1', 'battle-trainer'], ['pewter-gym', ''], ['indigo-plateau', ''], ['rival-1', ''], ['cerulean-cave', '']] as const) {
      await kc(page, 'enterPlace', place);
      if (row) await page.getByTestId(row).click();
      const t0 = await page.evaluate(() => performance.now());
      for (let i = 0; i < 12 && !(await page.getByTestId('screen-game').isVisible()); i++) {
        if (await page.getByTestId('goal-card').isVisible()) await page.getByTestId('goal-card').click();
        else if (await page.getByTestId('trainer-intro').isVisible()) await page.getByTestId('trainer-intro').click();
        else if (await page.getByTestId('lesson-ok').isVisible()) await page.getByTestId('lesson-ok').click();
        else if (await page.getByTestId('story').isVisible()) await page.getByTestId('story').click();
        await page.waitForTimeout(200);
      }
      await settled(page);
      const opened = (await ta(page)).events.filter((e) => e.t > t0 && e.scr === 'screen-game' && e.cover === 'battle:open')[0];
      console.log(`6: ${place}: the top plate ${JSON.stringify(opened?.top)} when the cover opened, ${opened ? Math.round(opened.t - t0) : '?'} ms after the place`);
      expect(opened, `${place}: the battle cover opened`).toBeTruthy();
      if (opened!.top) expect(opened!.top.ok, `${place}: the top plate's trainer`).toBe(true);
      await page.getByTestId('start-button').click();
      await page.getByTestId('start-menu-close').click();
      await kc(page, 'journey'); // still alive
      await page.goto('./?debug=1');
      await page.getByTestId('screen-splash').click();
      await page.getByTestId('kanto').click();
    }
    await context.close();
  });

  test('8 online looks: the top plate shows the friend’s trainer, swaps seats on a swap rematch, never a blank trainer', async ({ browser }) => {
    test.setTimeout(240_000);
    const a = await fresh(browser, blue(SAVE, { 'kc:v1:playerTrainer': 'meir' }));
    const b = await fresh(browser, blue(SAVE));
    await a.page.goto(`./?debug=1${RELAY}`);
    await a.page.getByTestId('screen-splash').click();
    await a.page.getByTestId('play-online').click();
    await a.page.getByTestId('create-room').click();
    const code = (await a.page.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
    await b.page.goto(`./?debug=1${RELAY}&room=${code}`);
    for (const p of [a.page, b.page]) await expect(p.locator('#board')).toBeVisible({ timeout: 15_000 });
    const top = (p: Page) => p.locator('[data-testid="plate-top"] .plate-sprite [data-trainer]').getAttribute('data-trainer');
    await expect.poll(() => top(a.page)).toBe('red-gen1');
    await expect.poll(() => top(b.page)).toBe('meir');
    // A swap rematch: the sprites change seats within 300 ms of the new board.
    await a.page.click('[data-square="f2"]');
    await a.page.click('[data-square="f3"]');
    await b.page.click('[data-square="e7"]', { timeout: 10_000 });
    await b.page.click('[data-square="e5"]');
    await a.page.click('[data-square="g2"]', { timeout: 10_000 });
    await a.page.click('[data-square="g4"]');
    await b.page.click('[data-square="d8"]', { timeout: 10_000 });
    await b.page.click('[data-square="h4"]');
    for (const p of [a.page, b.page]) await p.getByTestId('end-text').waitFor({ timeout: 15_000 });
    // In A's page, each frame: which colour is at the bottom and who stands on each plate.
    await a.page.evaluate(() => {
      const w = window as unknown as { __seats: { t: number; bottom: string; me: string; them: string }[] };
      w.__seats = [];
      const tick = () => {
        const who = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"] .plate-sprite [data-trainer]`)?.dataset.trainer ?? '';
        const s = { t: performance.now(), bottom: document.querySelector<HTMLElement>('[data-testid="plate-bottom"]')?.dataset.color ?? '', me: who('plate-bottom'), them: who('plate-top') };
        const last = w.__seats.at(-1);
        if (!last || last.bottom !== s.bottom || last.me !== s.me || last.them !== s.them) w.__seats.push(s);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // A swap rematch: A (MEIR, white) asks to swap; B accepts. A now plays black and still stands at the bottom.
    await a.page.getByTestId('swap-sides').check();
    await a.page.getByTestId('rematch').click();
    await b.page.getByTestId('rematch').click({ timeout: 10_000 });
    await expect(a.page.locator('[data-testid="plate-bottom"]')).toHaveAttribute('data-color', 'b', { timeout: 15_000 });
    await a.page.waitForTimeout(400);
    const seats = await a.page.evaluate(() => (window as unknown as { __seats: { t: number; bottom: string; me: string; them: string }[] }).__seats);
    const flip = seats.findIndex((x) => x.bottom === 'b');
    const settledAt = seats.slice(flip).find((x) => x.me === 'meir' && x.them === 'red-gen1');
    console.log(`8: seats after the swap rematch: ${JSON.stringify(seats.slice(Math.max(0, flip - 1)).map((x) => ({ ...x, t: Math.round(x.t - seats[flip]!.t) })))}`);
    expect(settledAt, 'MEIR and RED in their seats on the new board').toBeTruthy();
    expect(settledAt!.t - seats[flip]!.t).toBeLessThanOrEqual(300);
    expect(seats.slice(flip).every((x) => x.me && x.them), 'a plate without its trainer on the new board').toBe(true);
    for (const p of [a.page, b.page]) expect((await ta(p)).bad, 'a plate or battle trainer shown blank').toEqual([]);
    await a.context.close();
    await b.context.close();
  });

  test('8 no blank trainer image across Two Players and vs Computer levels 1 and 4', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, blue(SAVE, { 'kc:v1:settings': { v: 2, anim: 'full' } }));
    await boot(page);
    for (const [mode, level] of [['two-players', 1], ['computer', 1], ['computer', 4]] as const) {
      await kc(page, 'setMode', mode, level, 'w');
      await settled(page);
      await kc(page, 'loadFen', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
      await page.click('[data-square="e4"]');
      await page.click('[data-square="d5"]');
      await page.getByTestId('battle').waitFor({ state: 'visible' });
      await settled(page);
    }
    expect((await ta(page)).bad).toEqual([]);
    await context.close();
  });

  test('9 real WebPs: in the build, and board pieces ask for them', async ({ page }) => {
    const dist = join(process.cwd(), 'dist', 'assets');
    test.skip(!existsSync(dist), 'no dist/ (run npm run build first)');
    const webps = ['front', 'back', 'shiny/front', 'shiny/back'].flatMap((d) => (existsSync(join(dist, d)) ? readdirSync(join(dist, d)).filter((f) => f.endsWith('.webp')) : []));
    expect(webps.length).toBeGreaterThanOrEqual(270);
    const bundle = readdirSync(dist).filter((f) => /^index-.*\.js$/.test(f)).map((f) => readFileSync(join(dist, f), 'utf8')).join('');
    expect(bundle, "the bundle's __WEBP__ list").toContain('front/19');
    await page.goto('./?debug=1&start=two');
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name.replace(/^.*\/assets\//, '')).filter((u) => /^(front\/19|back\/133)\./.test(u))), { timeout: 15_000 }).toEqual(expect.arrayContaining(['front/19.webp', 'back/133.webp']));
  });

  test('10 with real art, every board image has decoded when the battle cover opens', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, blue(), true);
    await boot(page);
    await page.getByTestId('two-players').click({ timeout: 60_000 });
    await page.getByTestId('intro').waitFor({ timeout: 60_000 });
    const open = (await ta(page)).events.find((e) => e.scr === 'screen-game' && e.cover === 'battle:open');
    expect(open, 'the battle cover opened').toBeTruthy();
    expect(open!.board, 'board images not decoded at the open').toBe(0);
    await context.close();
  });
});

test.describe('@perf trainer art budgets', () => {
  test("2 Oak's first box: drawn within 100 ms of the cover's removal", async ({ browser }) => {
    test.setTimeout(180_000);
    const camp = { v: 2, name: 'JADE', starter: 'charmander', introSeen: true, teamRules: 2, badges: ['boulder'], caught: { charmander: 1 }, playMs: 600_000 };
    const { context, page } = await fresh(browser, blue(camp), true);
    await boot(page, '?debug=1&menu=1');
    await page.getByTestId('start-new').click({ timeout: 60_000 });
    await page.getByTestId('screen-splash').click({ timeout: 120_000 });
    await page.getByTestId('cart-blue').click({ timeout: 60_000 });
    await page.getByTestId('story').waitFor({ timeout: 60_000 });
    await settled(page, 60_000);
    const ev = (await ta(page)).events.filter((e) => e.scr === 'screen-intro');
    const gone = ev.find((e) => e.cover === '');
    const drawnAt = await page.evaluate(() => (performance.getEntriesByType('resource').find((r) => /trainers\/oak\.png$/.test(r.name)) as PerformanceResourceTiming | undefined)?.responseEnd ?? -1);
    expect(gone, 'the first intro box was revealed').toBeTruthy();
    const late = Math.max(0, drawnAt - gone!.t);
    console.log(`@perf 2: Oak drawn ${Math.round(late)} ms after the cover went (not drawn then: ${JSON.stringify(gone!.notDrawn)})`);
    expect(drawnAt).toBeGreaterThan(0);
    expect(late).toBeLessThanOrEqual(100);
    await context.close();
  });

  test('3 hub icons: ms from navigation to the hub drawn', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, blue(), true);
    await boot(page);
    await settled(page, 60_000);
    const gone = (await ta(page)).events.find((e) => e.scr === 'screen-title' && e.cover === '');
    console.log(`@perf 3: hub revealed with its icons ${Math.round(gone?.t ?? -1)} ms from navigation (sheet ${gone?.sheet})`);
    expect(gone?.sheet).toBe('ready');
    await context.close();
  });

  test('7 silhouette budget: every loading trainer clears within 800 ms of its reveal (rows 1500 ms)', async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await fresh(browser, blue(null), true);
    await page.addInitScript(() => {
      const w = window as unknown as { __sil: { t: number; scr: string; n: number }[]; __card: { in: number; drawn: number } | null };
      w.__sil = [];
      w.__card = null;
      // The "wants to battle!" card: when it goes in, and the first frame its trainer is drawn.
      new MutationObserver(() => {
        const card = document.querySelector('[data-testid="trainer-intro"]');
        if (card && !w.__card) w.__card = { in: performance.now(), drawn: -1 };
      }).observe(document, { childList: true, subtree: true });
      const drawn = () => {
        const i = document.querySelector<HTMLImageElement>('[data-testid="trainer-intro"] img[data-trainer]');
        if (w.__card && w.__card.drawn < 0 && i?.complete && i.naturalWidth > 0) w.__card.drawn = performance.now();
        requestAnimationFrame(drawn);
      };
      requestAnimationFrame(drawn);
      const tick = () => {
        const n = document.querySelectorAll('#app .trainer-sprite.loading').length;
        const scr = document.querySelector('#app .stage > [data-testid]')?.getAttribute('data-testid') ?? '';
        const last = w.__sil.at(-1);
        if (!last || last.n !== n || last.scr !== scr) w.__sil.push({ t: performance.now(), scr, n });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await boot(page);
    await page.getByTestId('kanto').click({ timeout: 60_000 });
    for (let i = 0; i < 3; i++) await page.getByTestId('story').click({ timeout: 60_000 });
    await page.getByTestId('name-1').click({ timeout: 60_000 });
    await page.getByTestId('starter-bulbasaur').click({ timeout: 60_000 });
    for (let i = 0; i < 2; i++) await page.getByTestId('story').click({ timeout: 60_000 });
    await page.getByTestId('route-route-1').click({ timeout: 60_000 });
    await page.getByTestId('warmup-skip').click({ timeout: 60_000 });
    await page.waitForTimeout(1000);
    await page.getByTestId('battle-trainer').click({ timeout: 60_000 });
    await lessonThenIntro(page);
    await settled(page, 60_000);
    const covers = (await ta(page)).events;
    const sil = await page.evaluate(() => (window as unknown as { __sil: { t: number; scr: string; n: number }[] }).__sil);
    const worst: Record<string, number> = {};
    for (const gone of covers.filter((e) => e.cover === '')) {
      const after = sil.filter((s) => s.t >= gone.t && s.scr === gone.scr);
      const clear = after.find((s) => s.n === 0);
      if (after[0] && after[0].n > 0) worst[gone.scr] = Math.max(worst[gone.scr] ?? 0, Math.round((clear?.t ?? performance.now()) - gone.t));
    }
    const card = await page.evaluate(() => (window as unknown as { __card: { in: number; drawn: number } | null }).__card);
    const cardMs = card ? Math.round(card.drawn - card.in) : -1;
    console.log(`@perf 7: the longest silhouette after a reveal, per screen: ${JSON.stringify(worst)}; the battle card's trainer drawn ${cardMs} ms after the card went in`);
    for (const [scr, ms] of Object.entries(worst)) expect(ms, scr).toBeLessThanOrEqual(scr === 'screen-route' ? 1500 : 800);
    expect(card, 'the battle card').toBeTruthy();
    expect(cardMs, "the card's trainer, before its 250 ms guard ends").toBeLessThanOrEqual(250);
    await context.close();
  });
});
