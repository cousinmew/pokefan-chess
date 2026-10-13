// SPDX-License-Identifier: AGPL-3.0-only
// Loading (fix, 13 Oct; owner: "all the sprites and animations to load in a timely fashion"): board, battle and menu
// sprites and cries arrive before they are needed. Slow 4G and Fast 4G are the CDP profiles of the brief, in a fresh
// context (empty HTTP cache) with the service worker blocked. Real timings: no sleeps to wait out a guard.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 };
const FAST_4G = { offline: false, latency: 165, downloadThroughput: 1_012_500, uploadThroughput: 84_375 };
const ALL_THEMES = ['advancedPawn', 'advantage', 'backRankMate', 'capturingDefender', 'castling', 'deflection', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'fork', 'hangingPiece', 'mateIn1', 'mateIn2', 'pin', 'promotion', 'skewer', 'trappedPiece', 'xRayAttack'];
/** A BLUE save past the warm-up: PIDGEY pawns (the warm-up's first catch puts them there). */
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, team: { p: 'pidgey' }, warmup: true, lessonsSeen: ALL_THEMES, tips: ['puzzle'], puzzlesStarted: 5, journey: { cleared: [], beaten: [], visited: ['route-1'] } };
/** A mate in 1 for Route 1's trainer (the set up a6-a8, then e2-e1). */
const QUIET1 = ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480];

type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);

/** Frame by frame what the player sees (in the page, from its first script): the cover, holds, blank board pieces,
 * the intro card when it is inserted, the battle's first frame, cries as they start, and taps. */
function recorder(): void {
  type Img = { w: number; complete: boolean; src: string; mirror?: boolean };
  const w = window as unknown as { __ld: Record<string, unknown> };
  const L = {
    armed: false,
    frames: [] as Record<string, unknown>[],
    intros: [] as { t: number; complete: boolean; w: number; opacity: string }[],
    battles: [] as { t: number; att: Img; def: Img; near: Img; far: Img }[],
    cries: [] as { t: number; url: string; how: string; called?: number }[],
    taps: [] as { t: number; sq: string; up?: boolean }[],
    encounters: [] as { t: number; complete: boolean; w: number }[],
  };
  w.__ld = L;
  const short = (u: string) => u.replace(/^.*?\/assets\//, '');
  const imgOf = (i: HTMLImageElement | null | undefined): Img => ({ w: i?.naturalWidth ?? 0, complete: !!i?.complete, src: short(i?.currentSrc || i?.src || ''), mirror: !!i?.closest('.mirror') });
  const shown = (e: HTMLElement | null) => !!e && !e.hidden && e.style.opacity !== '0' && getComputedStyle(e).display !== 'none';
  let battleOn = false;
  const tick = () => {
    try {
      sample();
    } catch (err) {
      console.warn('loading.spec recorder:', err);
    }
    requestAnimationFrame(tick);
  };
  const sample = () => {
    if (L.armed) {
      const cov = document.querySelector<HTMLElement>('.screen-cover');
      const board = document.querySelector('.board');
      const blanks: string[] = [];
      let total = 0;
      if (board?.isConnected) {
        for (const sq of board.querySelectorAll<HTMLElement>('.sq[data-piece]')) {
          total++;
          const img = sq.querySelector<HTMLImageElement>('img.piece');
          if (!img || !img.complete || !img.naturalWidth) blanks.push(`${sq.dataset.square!}${img ? `:${short(img.src)}` : ''}`);
        }
      }
      const intro = document.querySelector<HTMLElement>('[data-testid="intro"]');
      const introImg = intro?.querySelector('img');
      L.frames.push({
        t: performance.now(),
        cover: cov ? `${cov.dataset.kind}:${cov.dataset.phase ?? 'up'}` : '',
        trans: document.documentElement.dataset.transition !== undefined || !!document.querySelector('.board-dip'),
        hold: document.body.dataset.hold ?? '',
        board: !!board?.isConnected,
        total,
        blanks,
        intro: intro ? { op: getComputedStyle(intro.querySelector('.panel') ?? intro).opacity, ok: !!introImg && introImg.complete && introImg.naturalWidth > 0 } : null,
        selected: !!document.querySelector('.sq.selected'),
        scr: document.querySelector('#app .stage > [data-testid]')?.getAttribute('data-testid') ?? '',
        // Trainer sprites on the screen not drawn yet, and silhouettes standing in.
        tr: [...document.querySelectorAll<HTMLImageElement>('#app .stage img[data-trainer]')].filter((i) => !i.complete || !i.naturalWidth).length,
        sil: document.querySelectorAll('#app .stage .trainer-sprite.loading, #app .stage .trainer-sprite.sil').length,
      });
      const bat = document.querySelector<HTMLElement>('[data-testid="battle"]');
      const on = shown(bat);
      if (on && !battleOn) L.battles.push({ t: performance.now(), att: imgOf(bat!.querySelector('.mon.att img')), def: imgOf(bat!.querySelector('.mon.def img')), near: imgOf(bat!.querySelector('.t-near img')), far: imgOf(bat!.querySelector('.t-far img')) });
      battleOn = on;
      (L as unknown as { battleOn: boolean }).battleOn = on;
    }
  };
  requestAnimationFrame(tick);
  // The intro card and the encounter panel, the moment they are inserted.
  new MutationObserver((recs) => {
    for (const r of recs) {
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const intro = n.matches('[data-testid="intro"]') ? n : n.querySelector<HTMLElement>('[data-testid="intro"]');
        if (intro) {
          const img = intro.querySelector('img');
          L.intros.push({ t: performance.now(), complete: !!img?.complete, w: img?.naturalWidth ?? 0, opacity: getComputedStyle(intro.querySelector('.panel') ?? intro).opacity });
        }
        const enc = n.matches('[data-testid="encounter"]') ? n : n.querySelector<HTMLElement>('[data-testid="encounter"]');
        if (enc) {
          const img = enc.querySelector('img');
          L.encounters.push({ t: performance.now(), complete: !!img?.complete, w: img?.naturalWidth ?? 0 });
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
  // Cries as they start: a Web Audio buffer (traced back to its file) or a media element's 'playing'.
  const urlOf = new WeakMap<object, string>();
  const ab = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function (this: Response) {
    const url = this.url;
    return ab.call(this).then((b) => (urlOf.set(b, url), b));
  };
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer, ...rest: unknown[]) {
    const url = urlOf.get(data) ?? '';
    return (decode as (...a: unknown[]) => Promise<AudioBuffer>).call(this, data, ...rest).then((buf) => (url && urlOf.set(buf, url), buf));
  } as typeof decode;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...a: unknown[]) {
    L.cries.push({ t: performance.now(), url: short((this.buffer && urlOf.get(this.buffer)) ?? ''), how: `buffer:${this.context.state}` });
    return (start as (...x: unknown[]) => void).apply(this, a);
  } as typeof start;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const called = performance.now();
    this.addEventListener('playing', () => L.cries.push({ t: performance.now(), called, url: short(this.currentSrc || this.src), how: 'media' }), { once: true });
    return play.call(this);
  };
  window.addEventListener('pointerdown', (e) => {
    const sq = (e.target as Element | null)?.closest?.('[data-square]') as HTMLElement | null;
    L.taps.push({ t: performance.now(), sq: sq?.dataset.square ?? '' });
  }, true);
  window.addEventListener('pointerup', (e) => {
    const sq = (e.target as Element | null)?.closest?.('[data-square]') as HTMLElement | null;
    L.taps.push({ t: performance.now(), sq: sq?.dataset.square ?? '', up: true });
  }, true);
}

type Frame = { t: number; cover: string; trans: boolean; hold: string; board: boolean; total: number; blanks: string[]; intro: { op: string; ok: boolean } | null; selected: boolean; scr: string; tr: number; sil: number };
type Ld = { frames: Frame[]; intros: { t: number; complete: boolean; w: number; opacity: string }[]; battles: { t: number; att: { w: number; complete: boolean; src: string; mirror: boolean }; def: { w: number; complete: boolean; src: string; mirror: boolean }; near: { w: number; src: string }; far: { w: number; src: string } }[]; cries: { t: number; url: string; how: string; called?: number }[]; taps: { t: number; sq: string; up?: boolean }[]; encounters: { t: number; complete: boolean; w: number }[]; battleOn: boolean };
const ld = (page: Page) => page.evaluate(() => (window as unknown as { __ld: Ld }).__ld);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const FEN_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

/** The recorder saw battle number `n` (from 0) come and go. */
async function battleOver(page: Page, n: number): Promise<void> {
  await page.waitForFunction((i) => (window as unknown as { __ld: Ld }).__ld.battles.length > i, n, { timeout: 30_000 });
  await page.waitForFunction(() => !(window as unknown as { __ld: Ld }).__ld.battleOn, null, { timeout: 30_000 });
}
const arm = (page: Page) => page.evaluate(() => ((window as unknown as { __ld: { armed: boolean; frames: unknown[] } }).__ld.armed = true));
const now = (page: Page) => page.evaluate(() => performance.now());

/** A fresh context (empty HTTP cache) on a network profile, the recorder in, `store` seeded once. */
async function fresh(browser: Browser, store: Record<string, unknown>, net: typeof SLOW_4G | null, cpu = 4): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(recorder);
  await context.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, store);
  const page = await context.newPage();
  if (net) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', net);
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  return { context, page };
}

/** Boots on ?debug=1 and leaves the splash once the first screen's own loads are done (a player reads it). */
async function boot(page: Page, query = '?debug=1', tap = true): Promise<void> {
  await page.goto(`./${query}`, { timeout: 120_000 });
  await page.getByTestId('screen-splash').waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => performance.getEntriesByType('resource').filter((r) => /assets\/(front|retro|trainers)\//.test(r.name)).length >= 4, null, { timeout: 60_000 }).catch(() => undefined);
  if (tap) await page.getByTestId('screen-splash').click({ timeout: 60_000 });
}

/** The first frame at or after `t0` where `pred` holds. */
const firstFrame = (frames: Frame[], t0: number, pred: (f: Frame) => boolean) => frames.find((f) => f.t >= t0 && pred(f));
/** Every frame from `from` on that shows a blank piece. */
const blankFrames = (frames: Frame[], from: number) => frames.filter((f) => f.t >= from && f.board && f.blanks.length > 0);

const cartBlue = { 'kc:v1:cartridge': 'blue' };
const blueSave = { ...cartBlue, 'kc:v1:campaign': SAVE };

test.describe('no blank piece when the cover opens (vs Computer L2, Two Players, tall grass, YELLOW lesson 1), Slow 4G cold', () => {
  for (const run of [1, 2, 3]) {
    test(`vs Computer L2 (team picker, level), run ${run}`, async ({ browser }) => {
      test.setTimeout(180_000);
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
      console.log(`vs Computer L2 run ${run}: cover open ${Math.round(open!.t - t0)} ms after the tap, blank at open ${open!.blanks.length}/${open!.total}`);
      expect(open!.blanks, 'blank pieces when the cover opens').toEqual([]);
      expect(blankFrames(l.frames, open!.t).map((f) => `${Math.round(f.t - t0)}:${f.blanks.join(',')}`)).toEqual([]);
      // The intro card's Pokémon is already drawn when the card goes in.
      expect(l.intros[0], 'intro card').toMatchObject({ complete: true });
      expect(l.intros[0]!.w).toBeGreaterThan(0);
      await context.close();
    });

    test(`Two Players from the hub, run ${run}`, async ({ browser }) => {
      test.setTimeout(180_000);
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
      console.log(`Two Players run ${run}: cover open ${Math.round(open!.t - t0)} ms after the tap, blank at open ${open!.blanks.length}/${open!.total}`);
      expect(open!.blanks, 'blank pieces when the cover opens').toEqual([]);
      expect(blankFrames(l.frames, open!.t).map((f) => `${Math.round(f.t - t0)}:${f.blanks.join(',')}`)).toEqual([]);
      expect(l.intros[0], 'intro card').toMatchObject({ complete: true });
      await context.close();
    });
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
  // A player reads the title while the first screen's own loads finish (at most 2 s: it moves on at 2.5 s).
  for (let i = 0; i < 20 && inflight > 0; i++) await page.waitForTimeout(100);
  await arm(page);
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
  const tap = await now(page);
  await page.getByTestId('screen-splash').click({ timeout: 60_000 });
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
  test('the team picker never shows an empty box', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, cartBlue, SLOW_4G);
    await boot(page);
    await page.getByTestId('vs-computer').waitFor({ timeout: 60_000 });
    // Each frame: both kings show their sprite, or a stand-in (the retro sprite or a drawn placeholder) behind it.
    await page.evaluate(() => {
      const w = window as unknown as { __boxes: { t: number; empty: string[] }[] };
      w.__boxes = [];
      const loaded = (url: string) => performance.getEntriesByType('resource').some((r) => r.name === url);
      const tick = () => {
        const view = document.querySelector('[data-testid="screen-team"]');
        const cover = document.querySelector<HTMLElement>('.screen-cover');
        if (view && (!cover || cover.dataset.phase === 'open')) {
          const empty = [...view.querySelectorAll<HTMLImageElement>('.card img')].filter((i) => {
            if (i.complete && i.naturalWidth > 0) return false;
            const bg = getComputedStyle(i).backgroundImage;
            const urls = [...bg.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]!);
            return !/gradient/.test(bg) && !urls.some(loaded);
          });
          w.__boxes.push({ t: performance.now(), empty: empty.map((i) => i.alt) });
        }
        if (w.__boxes.length < 2000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('vs-computer').click();
    await page.getByTestId('team-red').waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="screen-team"] .card img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 60_000 });
    const boxes = await page.evaluate(() => (window as unknown as { __boxes: { t: number; empty: string[] }[] }).__boxes);
    const empty = boxes.filter((b) => b.empty.length);
    console.log(`team picker: ${empty.length} of ${boxes.length} frames with an empty box (${empty.length ? `${Math.round(empty.at(-1)!.t - empty[0]!.t)} ms` : '0 ms'})`);
    expect(boxes.length).toBeGreaterThan(0);
    expect(empty.map((b) => b.empty.join(','))).toEqual([]);
    await context.close();
  });

  test("the intro card's Pokémon is drawn whenever the card shows", async ({ browser }) => {
    test.setTimeout(240_000);
    for (const run of [1, 2, 3]) {
      const { context, page } = await fresh(browser, cartBlue, SLOW_4G);
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
      console.log(`intro card run ${run}: visible in ${shownFrames.length} frames, sprite missing in ${bad.length}`);
      expect(shownFrames.length).toBeGreaterThan(0);
      expect(bad.length, `run ${run}: frames showing the intro card without its Pokémon`).toBe(0);
      await context.close();
    }
  });
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
