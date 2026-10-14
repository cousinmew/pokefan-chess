// SPDX-License-Identifier: AGPL-3.0-only
// Loading (fix, 14 Oct; owner: "all the sprites and animations to load in a timely fashion"): board, battle and menu
// sprites and cries arrive before they are needed. Slow 4G and Fast 4G are the CDP profiles of the brief, in a fresh
// context (empty HTTP cache) with the service worker blocked. Real timings: no sleeps to wait out a guard.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { arm, battleOver, blankFrames, blueSave, boot, cartBlue, FAST_4G, FEN_D5, firstFrame, fresh, kc, ld, median, now, QUIET1, SLOW_4G, type Frame, type Ld } from './loadwatch';
import { tapSplash } from './pace';

const BATTLE_READY_MS = 2500; // src/ui/transitions.ts: the longest a battle cover waits for its board's images

/** No blank piece from the cover's open on. A cover that opened at its cap (its wait for the board's images ran out
 * after BATTLE_READY_MS: data-capped, set by src/ui/transitions.ts under ?debug=1) did so on images still in flight,
 * as a busy runner on HTTP/1.1 can make it: blanks then are noted, not failed, except under `strict` (@perf). A cover
 * that opened before its cap with a blank piece missed an image, and fails however late it opened (review, 14 Oct,
 * round 3: the cap was guessed from the tap, so a wait that began late counted as capped). Logged either way. */
function drawnWhenOpen(frames: Frame[], t0: number, open: Frame, what: string, strict: boolean): void {
  const later = blankFrames(frames, open.t).map((f) => `${Math.round(f.t - t0)}:${f.blanks.join(',')}`);
  const capped = open.capped;
  console.log(`${what}: cover open ${Math.round(open.t - t0)} ms after the tap${capped ? ` (at its ${BATTLE_READY_MS} ms cap)` : ''}, blank at open ${open.blanks.length}/${open.total}`);
  if (capped && !strict && (open.blanks.length || later.length)) {
    test.info().annotations.push({ type: 'capped', description: `${what}: the cover opened at its ${BATTLE_READY_MS} ms cap with ${open.blanks.length} of ${open.total} pieces still loading` });
    return;
  }
  expect(open.blanks, 'blank pieces when the cover opens').toEqual([]);
  expect(later).toEqual([]);
}

/** vs Computer L2 from the team picker, cold: the cover opens on a drawn board and the intro card on a drawn king. */
async function vsComputerL2(browser: Browser, run: number, strict: boolean): Promise<void> {
  const { context, page } = await fresh(browser, cartBlue, SLOW_4G);
  await boot(page);
  await page.getByTestId('vs-computer').click({ timeout: 60_000 });
  await page.getByTestId('team-red').click({ timeout: 60_000 });
  await page.getByTestId('level-2').waitFor({ timeout: 60_000 });
  // A player reads the ladder for a moment (the audit's 1.5 s); a tap before its images are in cancels them.
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="screen-level"] img')].every((i) => i.complete), null, { timeout: 1500 }).catch(() => undefined);
  await arm(page);
  const t0 = await now(page);
  await page.getByTestId('level-2').click({ timeout: 60_000 });
  await page.getByTestId('intro').waitFor({ timeout: 60_000 });
  await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
  await page.waitForTimeout(1000); // the board is the player's: sample a second of play
  const l = await ld(page);
  const open = firstFrame(l.frames, t0, (f) => f.cover === 'battle:open');
  expect(open, 'the battle cover opened').toBeTruthy();
  drawnWhenOpen(l.frames, t0, open!, `vs Computer L2 run ${run}`, strict);
  // The level picker no longer holds the connections with animated previews (review, 14 Oct: about 2.2 s before).
  if (strict) expect(open!.t - t0, 'tap to the bars opening').toBeLessThanOrEqual(1500);
  // The intro card's Pokémon is already drawn when the card goes in.
  expect(l.intros[0], 'intro card').toMatchObject({ complete: true });
  expect(l.intros[0]!.w).toBeGreaterThan(0);
  await context.close();
}

/** Two Players straight from the hub (a quick tap), cold. */
async function twoPlayers(browser: Browser, run: number, strict: boolean): Promise<void> {
  const { context, page } = await fresh(browser, cartBlue, SLOW_4G);
  await boot(page);
  await page.getByTestId('two-players').waitFor({ timeout: 60_000 });
  await arm(page);
  const t0 = await now(page);
  await page.getByTestId('two-players').click({ timeout: 60_000 });
  await page.getByTestId('intro').waitFor({ timeout: 60_000 });
  await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
  await page.waitForTimeout(1000);
  const l = await ld(page);
  const open = firstFrame(l.frames, t0, (f) => f.cover === 'battle:open');
  expect(open, 'the battle cover opened').toBeTruthy();
  drawnWhenOpen(l.frames, t0, open!, `Two Players run ${run}`, strict);
  expect(l.intros[0], 'intro card').toMatchObject({ complete: true });
  await context.close();
}

test.describe('@perf no blank piece when the cover opens, never at its cap (Slow 4G cold)', () => {
  for (const run of [1, 2, 3]) {
    test(`vs Computer L2, run ${run}`, async ({ browser }) => (test.setTimeout(180_000), vsComputerL2(browser, run, true)));
    test(`Two Players, run ${run}`, async ({ browser }) => (test.setTimeout(180_000), twoPlayers(browser, run, true)));
  }
});

test.describe('no blank piece when the cover opens (vs Computer L2, Two Players, tall grass, YELLOW lesson 1), Slow 4G cold', () => {
  for (const run of [1, 2, 3]) {
    test(`vs Computer L2 (team picker, level), run ${run}`, async ({ browser }) => (test.setTimeout(180_000), vsComputerL2(browser, run, false)));
    test(`Two Players from the hub, run ${run}`, async ({ browser }) => (test.setTimeout(180_000), twoPlayers(browser, run, false)));
  }

  test('tall grass and a route trainer: every piece drawn when the Watch! hold starts', async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await fresh(browser, { ...blueSave, 'kc:v1:settings': { v: 2, anim: 'off' } }, SLOW_4G);
    await boot(page);
    await page.getByTestId('kanto').click({ timeout: 60_000 });
    await page.getByTestId('route-route-1').click({ timeout: 60_000 });
    await page.getByTestId('walk-grass').waitFor({ timeout: 60_000 });
    await arm(page);
    let t0 = await now(page);
    await page.getByTestId('walk-grass').click({ timeout: 60_000 });
    await page.locator('body[data-hold="setup"]').waitFor({ state: 'attached', timeout: 90_000 });
    await page.waitForTimeout(300);
    let l = await ld(page);
    let setup = firstFrame(l.frames, t0, (f) => f.hold === 'setup');
    console.log(`tall grass: Watch! ${Math.round(setup!.t - t0)} ms after the tap, blank then ${setup!.blanks.length}/${setup!.total}`);
    expect(setup!.blanks, 'tall grass: blank pieces when Watch! starts').toEqual([]);
    expect(blankFrames(l.frames, setup!.t)).toEqual([]);
    await page.getByTestId('leave-grass').click({ timeout: 60_000 });
    await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
    await page.getByTestId('battle-trainer').click({ timeout: 60_000 });
    await page.getByTestId('trainer-intro').click({ timeout: 60_000 });
    t0 = await now(page);
    await page.getByTestId('goal-card').click({ timeout: 60_000 });
    await page.locator('body[data-hold="setup"]').waitFor({ state: 'attached', timeout: 90_000 });
    await page.waitForTimeout(300);
    l = await ld(page);
    setup = firstFrame(l.frames, t0, (f) => f.hold === 'setup');
    console.log(`route trainer: Watch! ${Math.round(setup!.t - t0)} ms after the tap, blank then ${setup!.blanks.length}/${setup!.total}`);
    expect(setup!.blanks, 'route trainer: blank pieces when Watch! starts').toEqual([]);
    expect(blankFrames(l.frames, setup!.t)).toEqual([]);
    await context.close();
  });

  test('YELLOW lesson 1: no blank piece at the first accepted input', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, { 'kc:v1:cartridge': 'yellow', 'kc:v1:campaign': { v: 2, name: '', introSeen: true, caught: {}, team: {}, journey: { cleared: [], beaten: [], visited: [] } } }, SLOW_4G);
    await boot(page);
    await page.getByTestId('yellow-learn').click({ timeout: 60_000 });
    await page.getByTestId('lesson-1').waitFor({ timeout: 60_000 });
    await arm(page);
    const t0 = await now(page);
    await page.getByTestId('lesson-1').click({ timeout: 60_000 });
    await page.getByTestId('path-progress').waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => document.documentElement.dataset.transition === undefined, null, { timeout: 60_000 });
    await page.waitForTimeout(1000);
    const l = await ld(page);
    // Input is accepted from the first frame with the board up and no cover or dip over it.
    const input = firstFrame(l.frames, t0, (f) => f.board && f.total > 0 && !f.trans && !f.cover);
    expect(input, 'the lesson board took input').toBeTruthy();
    console.log(`YELLOW lesson 1: input ${Math.round(input!.t - t0)} ms after the tap, blank then ${input!.blanks.length}/${input!.total}`);
    expect(input!.blanks).toEqual([]);
    expect(blankFrames(l.frames, input!.t)).toEqual([]);
    await context.close();
  });
});

test.describe('battle sprites, Slow 4G with the cache on', () => {
  /** vs Computer L1 as a BLUE save with PIDGEY pawns; the board after the intro, with a pawn on d5 to take. */
  async function board(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const f = await fresh(browser, blueSave, SLOW_4G);
    await boot(f.page);
    await f.page.getByTestId('vs-computer').click({ timeout: 60_000 });
    await f.page.getByTestId('team-red').click({ timeout: 60_000 });
    await f.page.getByTestId('level-1').click({ timeout: 60_000 });
    await f.page.getByTestId('intro').waitFor({ timeout: 60_000 });
    await f.page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
    await kc(f.page, 'loadFen', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    return f;
  }
  const capture = async (page: Page) => {
    await page.click('[data-square="e4"]');
    await page.click('[data-square="d5"]');
    await page.getByTestId('battle').waitFor({ state: 'visible', timeout: 30_000 });
  };

  test('a quick capture with My Team PIDGEY pawns never shows an empty slot', async ({ browser }) => {
    test.setTimeout(240_000);
    for (const run of [1, 2, 3]) {
      const { context, page } = await board(browser);
      await arm(page);
      await capture(page); // within a second of the board
      await battleOver(page, 0);
      const b = (await ld(page)).battles[0]!;
      console.log(`quick capture run ${run}: att ${b.att.src} ${b.att.w}px${b.att.mirror ? ' mirrored' : ''}, def ${b.def.src} ${b.def.w}px`);
      expect(b.att.w, `run ${run}: the attacker's slot`).toBeGreaterThan(0);
      expect(b.def.w, `run ${run}: the defender's slot`).toBeGreaterThan(0);
      await context.close();
    }
  });

  test('after 2.5 s on the board the near Pokémon is its back sprite', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await board(browser);
    await page.waitForTimeout(2500);
    await arm(page);
    // Three captures (the median of their start times; the first one is what the brief measures).
    const starts: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (i) await kc(page, 'loadFen', FEN_D5);
      await capture(page);
      await battleOver(page, i);
      const l = await ld(page);
      const tap = l.taps.filter((x) => x.sq === 'd5' && x.up).at(-1)!; // a capture moves on the release
      const b = l.battles[i]!;
      starts.push(b.t - tap.t);
      console.log(`2.5 s on the board, capture ${i + 1}: att ${b.att.src} ${b.att.w}px${b.att.mirror ? ' mirrored' : ''}, the battle ${Math.round(b.t - tap.t)} ms after the tap`);
      expect(b.att.src).toMatch(/^back\/16\.(gif|webp)$/);
      expect(b.att.mirror).toBe(false);
      expect(b.att.w).toBeGreaterThan(0);
      expect(b.def.w).toBeGreaterThan(0);
    }
    // Both sprites are in: the battle starts at once.
    expect(median(starts)).toBeLessThanOrEqual(100);
    await context.close();
  });

  test('a capture tap shows a change within 100 ms', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await board(browser);
    // What a capture tap changes on screen: a class on a square or a piece, or the battle itself (the median of 3).
    const changes: (number | null)[] = [];
    for (let i = 0; i < 3; i++) {
      if (i) {
        await kc(page, 'loadFen', FEN_D5);
        await page.waitForFunction(() => (window as unknown as { __ld: Ld }).__ld.battleOn === false && document.querySelector('[data-testid="battle"]')?.hasAttribute('hidden'), null, { timeout: 30_000 }).catch(() => undefined);
      }
      await page.click('[data-square="e4"]');
      await page.waitForTimeout(400); // the selection's hop is over
      await page.evaluate(() => {
        const w = window as unknown as { __chg: number | null; __tap: number };
        const sig = () => [...document.querySelectorAll('.board .sq')].map((s) => `${s.className}|${s.querySelector('.piece')?.className ?? ''}`).join(';') + (document.querySelector<HTMLElement>('[data-testid="battle"]')?.hidden === false ? 'B' : '');
        const was = sig();
        w.__chg = null;
        window.addEventListener('pointerup', () => {
          w.__tap = performance.now();
          const look = () => (sig() !== was ? (w.__chg = performance.now() - w.__tap) : performance.now() - w.__tap < 1000 && requestAnimationFrame(look));
          requestAnimationFrame(look);
        }, { once: true, capture: true });
      });
      await page.click('[data-square="d5"]');
      await page.waitForFunction(() => (window as unknown as { __chg: number | null }).__chg !== null || performance.now() - (window as unknown as { __tap: number }).__tap > 1000, null, { timeout: 10_000 });
      const ms = await page.evaluate(() => (window as unknown as { __chg: number | null }).__chg);
      console.log(`capture tap ${i + 1}: first change ${ms === null ? 'none in 1 s' : `${Math.round(ms)} ms`} after the release`);
      changes.push(ms);
      await page.getByTestId('battle').waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByTestId('battle').waitFor({ state: 'hidden', timeout: 10_000 });
    }
    expect(changes.every((c) => c !== null), 'a visible change after every capture tap').toBe(true);
    expect(median(changes as number[])).toBeLessThanOrEqual(100);
    await context.close();
  });
});

test.describe('cries', () => {
  test('the first select cry starts within 50 ms once the board is set', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, cartBlue, SLOW_4G);
    await boot(page);
    await page.getByTestId('two-players').click({ timeout: 60_000 });
    await page.getByTestId('intro').waitFor({ timeout: 60_000 });
    await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
    await page.waitForTimeout(2000); // the board has been up over 2 s (the bars' reveal and the intro before this)
    // Three of your pieces, three species (the median of their cries' starts); a tap on e5 puts each one down.
    const lags: number[] = [];
    for (const sq of ['e2', 'b1', 'f1']) {
      const cries = async () => (await ld(page)).cries.filter((c) => c.url.startsWith('cries/'));
      const before = (await cries()).length;
      await page.click(`[data-square="${sq}"]`);
      await expect.poll(async () => (await cries()).length, { timeout: 10_000 }).toBeGreaterThan(before);
      const l = await ld(page);
      const tap = l.taps.filter((x) => x.sq === sq && !x.up).at(-1)!;
      const cry = (await cries())[before]!;
      console.log(`select cry ${sq}: ${cry.url} ${Math.round(cry.t - tap.t)} ms after the tap (${cry.how})`);
      lags.push(cry.t - tap.t);
      await page.click('[data-square="e5"]');
    }
    expect(median(lags)).toBeLessThanOrEqual(50);
    await context.close();
  });

  test('a late cry is skipped, never played after its battle', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await fresh(browser, { ...cartBlue, 'kc:v1:settings': { v: 2, anim: 'full', battleStyle: 'classic' } }, null);
    // RATTATA's cry (Rocket's pawns) arrives 6 s after it is asked for.
    await context.route(/\/assets\/cries\/19\.(ogg|mp3)$/, async (route) => {
      await new Promise((r) => setTimeout(r, 6000));
      await route.continue().catch(() => undefined);
    });
    await boot(page);
    await page.getByTestId('two-players').click();
    await page.getByTestId('intro').waitFor();
    await arm(page);
    await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 10_000 });
    await kc(page, 'loadFen', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    await page.click('[data-square="e4"]');
    await page.click('[data-square="d5"]');
    await battleOver(page, 0);
    const off = await now(page);
    // The file arrives 6 s after it was asked for (the board asked first); a moment to decode it.
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /cries\/19\./.test(r.name)), null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    const l = await ld(page);
    const late = l.cries.filter((c) => /^cries\/19\./.test(c.url) && c.t > off);
    console.log(`late cry: ${JSON.stringify(l.cries.map((c) => ({ ...c, t: Math.round(c.t - off) })))}`);
    expect(late, 'RATTATA cried after the battle was over').toEqual([]);
    // Kept for next time: the next RATTATA capture cries on time.
    await kc(page, 'loadFen', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    await page.click('[data-square="e4"]');
    await page.click('[data-square="d5"]');
    await battleOver(page, 1);
    const off2 = await now(page);
    await page.waitForTimeout(500);
    const again = (await ld(page)).cries.filter((c) => /^cries\/19\./.test(c.url) && c.t > off);
    console.log(`again: ${JSON.stringify((await ld(page)).cries.map((c) => ({ ...c, t: Math.round(c.t - off) })))} ${JSON.stringify(await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((r) => /cries\/19/.test(r.name)).map((r) => [Math.round(r.startTime), Math.round(r.responseEnd)])))} off=${Math.round(off)} off2=${Math.round(off2)}`);
    expect(again.length, 'the second RATTATA faint cries').toBeGreaterThan(0);
    expect(again.every((c) => c.t <= off2)).toBe(true);
    await context.close();
  });
});

/** A YELLOW save's first screen after the splash, cold Slow 4G: the loads that started between the splash tap and the
 * home's images all drawn (none of them the home's own), when SNORLAX (front/143, 70 KB) arrived after the home's
 * reveal, and every request of the session (8 s more of idle time). */
async function yellowHome(browser: Browser): Promise<{ between: string[]; snorlax: number; reqs: string[] }> {
  const { context, page } = await fresh(browser, { 'kc:v1:cartridge': 'yellow', 'kc:v1:campaign': { v: 2, name: '', introSeen: true, caught: {}, team: {}, journey: { cleared: [], beaten: [], visited: [] } } }, SLOW_4G);
  const reqs: string[] = [];
  let inflight = 0;
  page.on('request', (r) => (reqs.push(r.url().replace(/^.*?\/assets\//, '')), inflight++));
  page.on('requestfinished', () => inflight--);
  page.on('requestfailed', () => inflight--);
  await boot(page, '?debug=1', false);
  await arm(page); // from the splash on: the frame it leaves on, if it goes by itself before the tap below
  // A player reads the title while the first screen's own loads finish (at most 2 s: it moves on at 2.5 s).
  for (let i = 0; i < 20 && inflight > 0; i++) await page.waitForTimeout(100);
  // In the page: when the splash is tapped and the first frame with every home image drawn.
  await page.evaluate(() => {
    const w = window as unknown as { __home: number | null };
    w.__home = null;
    const look = () => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('.screen-yellow img')];
      if (imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0)) w.__home = performance.now();
      else requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  const asked = await now(page);
  // On a busy runner the splash can leave by itself first (SPLASH_AUTO_MS): the loads then count from that frame.
  const tap = (await tapSplash(page, 60_000)) === 'tapped' ? asked : ((await ld(page)).frames.find((f) => f.scr !== '' && f.scr !== 'screen-splash')?.t ?? asked);
  await page.waitForFunction(() => (window as unknown as { __home: number | null }).__home !== null, null, { timeout: 60_000 });
  await page.waitForTimeout(8000); // what YELLOW queues next, in idle time
  const done = await page.evaluate(() => (window as unknown as { __home: number }).__home);
  // The home's own files: each sprite and its retro stand-in (the same dex).
  const home = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('.screen-yellow img')].flatMap((i) => [i.src, `retro/${/\/(\d+)\.\w+$/.exec(i.src)?.[1]}.png`]).join(' '));
  const started = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((r) => ({ url: r.name.replace(/^.*?\/assets\//, ''), start: r.startTime, end: r.responseEnd })));
  const l = await ld(page);
  const open = l.frames.find((f) => f.scr === 'screen-yellow' && f.cover.endsWith(':open'));
  const snorlax = started.find((r) => /^front\/143\./.test(r.url));
  const between = started.filter((r) => r.start > tap && r.start < done && /^(front|back|shiny|static|cries|trainers|retro)\//.test(r.url) && !home.includes(r.url));
  console.log(`YELLOW home: drawn ${Math.round(done - tap)} ms after the splash tap; SNORLAX done ${snorlax && open ? Math.round(snorlax.end - open.t) : '?'} ms after the reveal; loads started in between: ${JSON.stringify(between.map((r) => r.url))}`);
  expect(open, 'the home was revealed').toBeTruthy();
  await context.close();
  return { between: between.map((r) => r.url), snorlax: snorlax!.end - open!.t, reqs };
}

test.describe('idle preload by cartridge and save, Slow 4G cold', () => {
  // Review, 14 Oct: the shelf and a guest (PLAY CHESS) preloaded nothing, so a guest's first board waited on all of
  // its stills under the bars. The default teams' stills (about 11 KB) now load while the shelf is read.
  test("no cartridge yet: the default teams' stills load while the shelf is read", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await fresh(browser, {}, SLOW_4G, 4, 'no-preference', true);
    await boot(page, ''); // a first launch
    await page.getByTestId('screen-shelf').waitFor({ timeout: 60_000 });
    const stills = () => page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((r) => /\/assets\/static\/front\/\d+\.png$/.test(r.name) && r.responseEnd > 0).length);
    await expect.poll(stills, { timeout: 10_000 }).toBeGreaterThanOrEqual(10);
    console.log(`shelf: ${await stills()} stills in (${JSON.stringify(await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /static\//.test(r.name)).map((r) => r.name.replace(/^.*?\/assets\//, ''))))})`);
    await context.close();
  });

  test('YELLOW never queues BLUE-only art and its home loads first', async ({ browser }) => {
    test.setTimeout(180_000);
    const { between, snorlax, reqs } = await yellowHome(browser);
    expect(between, 'idle loads started before the home was drawn').toEqual([]);
    expect(reqs.filter((u) => u.startsWith('back/')), 'YELLOW asked for back sprites').toEqual([]);
    // The 1.0 s budget is in @perf below (the median of 3); here, a margin a busy runner keeps (base: about 1.3 s).
    expect(snorlax).toBeLessThanOrEqual(1200);
  });

  test("the warm-up's PIDGEY and its cry are ready at the encounter", async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await fresh(browser, { ...cartBlue, 'kc:v1:settings': { v: 2, anim: 'off' } }, SLOW_4G);
    await boot(page);
    await page.getByTestId('kanto').click({ timeout: 60_000 });
    for (let i = 0; i < 2; i++) await page.getByTestId('story').click({ timeout: 60_000 });
    await arm(page);
    await page.getByTestId('story').click({ timeout: 60_000 });
    await page.getByTestId('screen-name').waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => !document.querySelector('.screen-cover'), null, { timeout: 60_000 });
    // RED is drawn when the name step is revealed (no silhouette standing in).
    const named = firstFrame((await ld(page)).frames, 0, (f) => f.scr === 'screen-name' && f.cover.endsWith(':open'));
    console.log(`name step: at the reveal ${named?.tr ?? '?'} trainer sprite(s) not drawn, ${named?.sil ?? '?'} silhouette(s)`);
    expect(named, 'the name step was revealed').toBeTruthy();
    expect(named!.tr, 'RED is drawn on the name step').toBe(0);
    expect(named!.sil).toBe(0);
    await page.getByTestId('name-2').click({ timeout: 60_000 });
    await page.getByTestId('starter-bulbasaur').click({ timeout: 60_000 });
    for (let i = 0; i < 2; i++) await page.getByTestId('story').click({ timeout: 60_000 });
    await page.getByTestId('route-route-1').click({ timeout: 60_000 });
    await page.getByTestId('warmup-go').click({ timeout: 60_000 });
    const move = async (from: string, to: string) => {
      await page.click(`[data-square="${from}"]`, { timeout: 60_000 });
      await page.click(`[data-square="${to}"]`, { timeout: 60_000 });
    };
    await page.getByTestId('path-progress').waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => document.documentElement.dataset.transition === undefined, null, { timeout: 60_000 });
    // The warm-up board takes input with every piece drawn.
    const warm = await ld(page);
    const input = warm.frames.find((f) => f.scr === 'screen-game' && f.board && f.total > 0 && !f.trans && !f.cover);
    console.log(`warm-up board: input with ${input?.blanks.length ?? '?'} of ${input?.total ?? '?'} pieces blank`);
    expect(input, 'the warm-up board took input').toBeTruthy();
    expect(input!.blanks).toEqual([]);
    expect(blankFrames(warm.frames, input!.t)).toEqual([]);
    await move('c1', 'c4');
    await page.getByTestId('path-next').click({ timeout: 60_000 });
    await expect(page.getByTestId('turn')).toHaveText('Put the king in check!', { timeout: 60_000 });
    await move('a1', 'a8');
    await page.getByTestId('path-next').click({ timeout: 60_000 });
    await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move!', { timeout: 60_000 });
    await move('a1', 'a8');
    await page.getByTestId('path-next').click({ timeout: 60_000 });
    await expect(page.getByTestId('story-text')).toHaveText('OAK: Rustling in the grass! Try a Poké Ball!', { timeout: 60_000 });
    await page.getByTestId('story').click({ timeout: 60_000 });
    await page.getByTestId('encounter').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    const l = await ld(page);
    const enc = l.encounters.at(-1)!;
    const cry = l.cries.find((c) => /^cries\/16\./.test(c.url) && c.t >= enc.t - 100);
    console.log(`'Wild PIDGEY appeared!': sprite drawn ${enc.complete && enc.w > 0}, cry ${cry ? `${Math.round(cry.t - enc.t)} ms` : 'none'} (${JSON.stringify(l.cries.slice(-3))})`);
    expect(enc.complete && enc.w > 0, "PIDGEY's front when the panel shows").toBe(true);
    expect(cry, "PIDGEY's cry").toBeTruthy();
    expect(Math.abs(cry!.t - enc.t)).toBeLessThanOrEqual(100);
    await context.close();
  });
});

test.describe('menu sprites, Slow 4G cold', () => {
  // Review, 14 Oct: a computed background naming the placeholder is not proof it is drawn. Each frame, each king's box
  // must be laid out, visible and filled (its sprite decoded, its retro stand-in loaded, or the drawn outline); and
  // while a sprite is still loading, a screenshot of its box must show pixels that differ from the card behind it.
  test('the team picker never shows an empty box', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, cartBlue, SLOW_4G);
    await boot(page);
    await page.getByTestId('vs-computer').waitFor({ timeout: 60_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __boxes: { t: number; empty: string[] }[] };
      w.__boxes = [];
      const loaded = (url: string) => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).some((r) => r.name === url && r.responseEnd > 0);
      const opacity = (e: Element | null): number => (e ? Number(getComputedStyle(e).opacity) * opacity(e.parentElement) : 1);
      const tick = () => {
        const view = document.querySelector('[data-testid="screen-team"]');
        const cover = document.querySelector<HTMLElement>('.screen-cover');
        if (view && (!cover || cover.dataset.phase === 'open')) {
          const empty = [...view.querySelectorAll<HTMLImageElement>('.card img')].filter((i) => {
            const r = i.getBoundingClientRect();
            const cs = getComputedStyle(i);
            if (r.width < 24 || r.height < 24 || cs.visibility !== 'visible' || cs.display === 'none' || opacity(i) < 0.5) return true;
            if (i.complete && i.naturalWidth > 0) return false;
            const urls = [...cs.backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]!);
            return !urls.some(loaded) && !/gradient/.test(cs.backgroundImage);
          });
          w.__boxes.push({ t: performance.now(), empty: empty.map((i) => i.alt || i.src) });
        }
        if (w.__boxes.length < 2000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // The kings' files come late on top of Slow 4G (the retro stand-in 1 s, the animated sprite 2 s), so the shots
    // below see the drawn outline, then the retro sprite, never only the card.
    await context.route(/\/assets\/(retro|front)\/\d+\.(png|gif|webp)$/, async (route) => {
      await new Promise((r) => setTimeout(r, /\/retro\//.test(route.request().url()) ? 1000 : 2000));
      await route.continue().catch(() => undefined);
    });
    await page.getByTestId('vs-computer').click();
    await page.getByTestId('team-red').waitFor({ timeout: 60_000 });
    // While a king is still loading (the screen's cover gone), what its box shows: the share of pixels unlike the card.
    const kings = page.locator('[data-testid="screen-team"] .card img');
    const samples: { n: number; varied: number }[] = [];
    for (let i = 0; i < 60; i++) {
      const state = await page.evaluate(() => ({ cover: !!document.querySelector('.screen-cover'), done: [...document.querySelectorAll<HTMLImageElement>('[data-testid="screen-team"] .card img')].map((img) => img.complete && img.naturalWidth > 0) }));
      if (state.done.length && state.done.every(Boolean)) break;
      if (!state.cover) {
        for (const [n, done] of state.done.entries()) {
          if (done) continue;
          const png = await kings.nth(n).screenshot({ timeout: 5000 }).catch(() => null);
          const still = await kings.nth(n).evaluate((img: HTMLImageElement) => !(img.complete && img.naturalWidth > 0)).catch(() => false);
          if (!png || !still) continue; // drawn by now: this shot shows the sprite, not the stand-in
          const varied = await page.evaluate(async (b64) => {
            const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
            const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            const c = document.createElement('canvas');
            c.width = bmp.width;
            c.height = bmp.height;
            const g = c.getContext('2d')!;
            g.drawImage(bmp, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            const counts = new Map<number, number>();
            for (let p = 0; p < d.length; p += 4) counts.set((d[p]! << 16) | (d[p + 1]! << 8) | d[p + 2]!, (counts.get((d[p]! << 16) | (d[p + 1]! << 8) | d[p + 2]!) ?? 0) + 1);
            const bg = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]![0];
            let differ = 0;
            for (let p = 0; p < d.length; p += 4) if (Math.abs(d[p]! - (bg >> 16)) + Math.abs(d[p + 1]! - ((bg >> 8) & 255)) + Math.abs(d[p + 2]! - (bg & 255)) > 48) differ++;
            return differ / (d.length / 4);
          }, png.toString('base64'));
          samples.push({ n, varied });
        }
      }
      await page.waitForTimeout(100);
    }
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="screen-team"] .card img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 60_000 });
    const boxes = await page.evaluate(() => (window as unknown as { __boxes: { t: number; empty: string[] }[] }).__boxes);
    const empty = boxes.filter((b) => b.empty.length);
    console.log(`team picker: ${empty.length} of ${boxes.length} frames with an empty box (${empty.length ? `${Math.round(empty.at(-1)!.t - empty[0]!.t)} ms` : '0 ms'}); boxes shot while loading: ${JSON.stringify(samples.map((x) => `${x.n}:${(x.varied * 100).toFixed(1)}%`))}`);
    expect(boxes.length).toBeGreaterThan(0);
    expect(empty.map((b) => b.empty.join(','))).toEqual([]);
    expect(samples.length, 'shots of a king still loading').toBeGreaterThan(0);
    for (const x of samples) expect(x.varied, `king ${x.n}: its box showed nothing but the card while it loaded`).toBeGreaterThanOrEqual(0.02);
    await context.close();
  });

  // Review, 14 Oct: the level picker's 24 to 32 px loadout chips loaded 12 animated sprites (about 350 KB) that still
  // held the connections when a level was tapped, so its board's stills queued behind them (the cover held ~2.2 s).
  test("the level picker's loadout chips are cropped stills, the files its board shows first", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await fresh(browser, cartBlue, SLOW_4G);
    await boot(page);
    await page.getByTestId('vs-computer').click({ timeout: 60_000 });
    await page.getByTestId('team-red').click({ timeout: 60_000 });
    await page.getByTestId('level-2').waitFor({ timeout: 60_000 });
    const chips = page.locator('[data-testid="screen-level"] [data-testid="loadout"] img');
    await expect.poll(() => chips.evaluateAll((els) => (els as HTMLImageElement[]).every((i) => i.complete && i.naturalWidth > 0)), { timeout: 30_000 }).toBe(true);
    const shown = await chips.evaluateAll((els) =>
      (els as HTMLImageElement[]).map((i) => {
        const box = (i.parentElement ?? i).getBoundingClientRect();
        const r = i.getBoundingClientRect();
        return { src: i.getAttribute('src') ?? '', species: i.dataset.species ?? '', box: Math.round(box.width), fills: Math.round(Math.max(r.width, r.height) / Math.max(box.width, 1) * 100) };
      }),
    );
    console.log(`level picker loadouts: ${JSON.stringify(shown.map((x) => `${x.species}:${x.src.replace(/^.*?\/assets\//, '')}`))}`);
    expect(shown.length).toBe(12); // King, Queen and Pawn of each of the four levels
    expect(shown.filter((x) => !/assets\/static\/(front|shiny)\/\d+\.png$/.test(x.src)).map((x) => x.src)).toEqual([]);
    // Cropped to the Pokémon (its still is a 96 px square with margins): the drawn image is at least the chip's size,
    // and larger for those with margins.
    expect(shown.filter((x) => x.fills < 99).map((x) => x.species)).toEqual([]);
    expect(shown.filter((x) => x.fills > 110).length).toBeGreaterThan(6);
    await context.close();
  });

  // Classic piece style (review, 14 Oct): its board draws no sprite, so the card was held back ~0.5 s, then popped
  // already skippable and still without its Pokémon. The card shows from its insertion, before it can be skipped.
  for (const style of ['pokemon', 'classic'] as const) {
    test(`the intro card's Pokémon is drawn whenever the card shows${style === 'classic' ? ' (Classic piece style)' : ''}`, async ({ browser }) => {
      test.setTimeout(240_000);
      for (const run of [1, 2, 3]) {
        const { context, page } = await fresh(browser, { ...cartBlue, 'kc:v1:settings': { v: 2, pieceStyle: style } }, SLOW_4G);
        await boot(page);
        await page.getByTestId('vs-computer').click({ timeout: 60_000 });
        await page.getByTestId('team-rocket').click({ timeout: 60_000 });
        await arm(page);
        await page.getByTestId('level-3').click({ timeout: 60_000 });
        await page.getByTestId('intro').waitFor({ timeout: 60_000 });
        await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
        const l = await ld(page);
        const shownFrames = l.frames.filter((f) => f.intro && Number(f.intro.op) > 0.05);
        const bad = shownFrames.filter((f) => !f.intro!.ok);
        const inserted = l.intros[0]!.t;
        const seen = shownFrames[0]?.t ?? Infinity;
        const skip = l.frames.find((f) => f.intro && f.skip)?.t ?? Infinity;
        console.log(`intro card (${style}) run ${run}: visible in ${shownFrames.length} frames, sprite missing in ${bad.length}; visible ${Math.round(seen - inserted)} ms and skippable ${Math.round(skip - inserted)} ms after it went in`);
        expect(shownFrames.length).toBeGreaterThan(0);
        expect(bad.length, `run ${run}: frames showing the intro card without its Pokémon`).toBe(0);
        // Seen as it pops in (CARD_IN_MS), and well before a tap can skip it (HOLD_MIN_MS after the pop).
        expect(seen - inserted, `run ${run}: the card was held back`).toBeLessThanOrEqual(150);
        expect(skip - seen, `run ${run}: the card could be skipped as it appeared`).toBeGreaterThanOrEqual(200);
        await context.close();
      }
    });
  }
});

test.describe('Fast 4G', () => {
  test('all 32 vs Computer pieces are animated by the end of the intro hold', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await fresh(browser, cartBlue, FAST_4G, 1);
    await boot(page);
    await page.getByTestId('vs-computer').click();
    await page.getByTestId('team-red').click();
    await page.getByTestId('level-2').click();
    await page.getByTestId('intro').waitFor();
    await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 30_000 });
    const still = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('.board img.piece')].filter((i) => !/\/(front|shiny\/front)\/\d+\.(gif|webp)$/.test(i.src) || !i.complete || !i.naturalWidth).map((i) => `${i.closest('[data-square]')?.getAttribute('data-square')}:${i.src.replace(/^.*\/assets\//, '')}`));
    const n = await page.locator('.board img.piece').count();
    console.log(`Fast 4G: ${n - still.length} of ${n} pieces animated when the intro hold ends`);
    expect(n).toBe(32);
    expect(still).toEqual([]);
    await context.close();
  });
});

test.describe('@perf loading budgets', () => {
  test("YELLOW's SNORLAX is drawn within 1.0 s of the home's reveal (median of 3, Slow 4G cold)", async ({ browser }) => {
    test.setTimeout(300_000);
    const ms: number[] = [];
    for (let i = 0; i < 3; i++) ms.push((await yellowHome(browser)).snorlax);
    console.log(`@perf YELLOW home: SNORLAX ${ms.map((x) => Math.round(x)).join(', ')} ms after the reveal`);
    expect(median(ms)).toBeLessThanOrEqual(1000);
  });
});
