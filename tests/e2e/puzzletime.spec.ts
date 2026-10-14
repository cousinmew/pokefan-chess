// SPDX-License-Identifier: AGPL-3.0-only
// Puzzle timing (fix, 14 Oct; owner: "sprites and animations load in a timely fashion ... everything logically well
// timed for players to understand the inputs and outputs"): the engine is ready when a review or a game needs it, a
// miss review reads at reading speed and never overclaims, the first puzzle's coach marks come before the set up move,
// puzzle holds wait for the player, a slow next puzzle never pulls the player off OPTION, a review that ended behind
// OPTION keeps its arrow, the thinking line goes once the engine answers, Training's way out says Back, the map shows
// a new badge, and Route 1's trainers are in before its screen. Real timings, the patterns of pace.ts.
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Chess } from 'chess.js';
import { settled, skipHold } from './pace';

type Row = [string, string, string, number];
type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);
const state = async (page: Page) => JSON.parse(await kc<string>(page, 'dumpState')) as { fen: string; turn: string; aiFailed: boolean; ended: boolean };
const phase = (page: Page) => kc<string>(page, 'puzzlePhase');
/** Lichess 0BLbM, mate in 1: the set up Ra6-a8, then your Re2-e1#; e2h2 is a wrong move. */
const QUIET1: Row = ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480];
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, warmup: true, tips: ['puzzle'], journey: { cleared: [], beaten: ['r1-toby'], visited: ['route-1'] } };
/** REFUTATION_READ_MS in src/campaign/puzzleGame.ts: the line that says why a move was wrong, at reading speed. */
const READ_MS = 3000;
const SETUP_MS = 1500; // PUZZLE_SETUP_MS
const HOLD_MIN_MS = 250;
/** The theme chunks (src/data/puzzles/*.json): every built script but the main bundle. */
const THEME_CHUNK = /\/assets\/(?!index-)[A-Za-z0-9]+-[\w-]+\.js$/;
const PLACES = (JSON.parse(readFileSync('src/data/journey.kanto.json', 'utf8')) as { places: { id: string; kind: string; optional?: boolean; badge?: string; trainers?: { id: string }[]; drills?: { id: string }[] }[] }).places;

/** A save that has cleared every required place before `id` (and Victory Road's drills when past it). */
function upTo(id: string, extra: Record<string, unknown> = {}) {
  const before = PLACES.slice(0, PLACES.findIndex((p) => p.id === id)).filter((p) => !p.optional);
  return {
    ...SAVE,
    starter: 'squirtle',
    caught: { squirtle: 1 },
    badges: before.flatMap((p) => (p.kind === 'gym' && p.badge ? [p.badge] : [])),
    journey: { cleared: before.flatMap((p) => [p.id, ...(p.drills ?? []).map((d) => d.id)]), beaten: before.flatMap((p) => (p.trainers ?? []).map((t) => t.id)), visited: [] },
    ...extra,
  };
}

function seed(page: Page, campaign: object, settings: object = { v: 2, anim: 'off', sound: false }): Promise<unknown> {
  return page.addInitScript(
    ([c, s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('kc:v1:campaign', JSON.stringify(c));
      localStorage.setItem('kc:v1:settings', JSON.stringify(s));
      localStorage.setItem('kc:v1:trainer', JSON.stringify({ rating: { r: 900, rd: 90, vol: 0.06 }, solved: 40, missed: 10, assisted: 0, seen: [] }));
    },
    [campaign, settings] as const,
  );
}

/** A plain puzzle (QUIET1) from the hub, waiting for your move. */
async function plain(page: Page, row: Row = QUIET1): Promise<void> {
  await seed(page, SAVE);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await kc(page, 'forcePuzzle', row, 'mateIn1');
  await kc(page, 'openPuzzles');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('player');
}

const move = async (page: Page, uci: string) => {
  await page.click(`[data-square="${uci.slice(0, 2)}"]`);
  await page.click(`[data-square="${uci.slice(2, 4)}"]`);
};

/** R7's phone profiles: Slow 4G with a 4x slower CPU, or the CPU alone. */
async function throttle(page: Page, context: BrowserContext, net: boolean, cpu = 4): Promise<void> {
  const cdp = await context.newCDPSession(page);
  if (net) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 });
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}

/** A throttled cold load, up to its splash. Not page.goto's `load`: boot's image preloads (Oak, the starters, the save's
 * boards) hold it back, on Slow 4G about 1.7 s past the splash, which moves on by itself 2.5 s after it shows
 * (SPLASH_AUTO_MS). On a busy runner `load` came later still, and the tap waited 120 s for a splash already gone (P11
 * in the merged CI run, 14 Oct). The splash itself comes about 2.2 s after the navigation (tests/e2e/boot.spec.ts). */
const coldGoto = (page: Page) => page.goto('./?debug=1', { waitUntil: 'commit', timeout: 120_000 });

/** In the page: every change of the review's line, with its time. */
function lineLog(): void {
  const w = window as unknown as { __lines: { t: number; text: string }[] };
  w.__lines = [];
  let last = '';
  const check = () => {
    const e = document.querySelector('[data-testid="review-text"]');
    const text = e && !e.closest('[hidden]') ? (e.textContent ?? '') : '';
    if (text === last) return;
    last = text;
    w.__lines.push({ t: performance.now(), text });
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
}
const lines = (page: Page) => page.evaluate(() => (window as unknown as { __lines: { t: number; text: string }[] }).__lines);
/** A refutation's line: "That lets … take your …", "… answers with check!", "… answers, and that one hurts!". */
const WHY = /That lets|answers/;

/** In the page, each frame: the time, the position, the screen, START, the coach bubble and the hold. */
function frameLog(): void {
  const w = window as unknown as { __frames: { t: number; fen: string; screen: string; start: boolean; bubble: string; hold: string }[]; __kc?: KC };
  w.__frames = [];
  const tick = () => {
    const kc = w.__kc;
    if (kc) {
      const coach = document.querySelector<HTMLElement>('[data-testid="coach"]');
      w.__frames.push({
        t: performance.now(),
        fen: (JSON.parse(kc.dumpState!() as string) as { fen: string }).fen,
        screen: document.body.dataset.screen ?? '',
        start: !!document.querySelector('.start-overlay'),
        bubble: coach && coach.isConnected && !coach.hidden ? (coach.textContent ?? '') : '',
        hold: document.body.dataset.hold ?? '',
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: { t: number; fen: string; screen: string; start: boolean; bubble: string; hold: string }[] }).__frames);

/** In the page: every dip over the board, and whether its board was on screen. */
function dipLog(): void {
  const w = window as unknown as { __dips: { t: number; connected: boolean }[] };
  w.__dips = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...a: Parameters<Element['animate']>) {
    if (this.classList.contains('board-dip')) w.__dips.push({ t: performance.now(), connected: this.isConnected });
    return animate.apply(this, a);
  };
}

/** In the page: when the last hold ended (a review that plays on behind OPTION). */
function holdLog(): void {
  const w = window as unknown as { __holdOff: number };
  w.__holdOff = 0;
  new MutationObserver(() => {
    if (document.body.dataset.hold === undefined) w.__holdOff = performance.now();
    else w.__holdOff = Infinity;
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hold'] });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe('the engine on a cold phone (P1: Slow 4G, 4x CPU, empty cache)', () => {
  // Each waits for the 1.79 MB engine over Slow 4G (about 10 s); the base build gave up at AI_TIMEOUT_MS (5 s).
  test.setTimeout(240_000);

  /** From the map's ▶ into a computer game (the Champion, a drill): story lines and cards tapped as they take input. */
  async function intoGame(page: Page, campaign: object): Promise<void> {
    await seed(page, campaign);
    await coldGoto(page);
    await page.getByTestId('screen-splash').click({ timeout: 120_000 });
    await page.getByTestId('kanto').click({ timeout: 60_000 });
    await page.getByTestId('map-next').click({ timeout: 60_000 });
    for (let i = 0; i < 8 && (await page.locator('#app > .overlay:not([hidden]) > .panel').count()); i++) {
      await page.locator('#app > .overlay:not([hidden]) > .panel').first().click({ timeout: 30_000 });
      await page.waitForFunction(() => document.body.dataset.screen === 'screen-game' || !!document.querySelector('#app > .overlay:not([hidden]) > .panel'), null, { timeout: 30_000 });
    }
    await expect(page.getByTestId('screen-game')).toBeVisible({ timeout: 60_000 });
  }

  /** Plays `uci` and waits for the computer's first reply. */
  async function firstReply(page: Page, uci: string): Promise<{ aiFailed: boolean; said: string }> {
    await move(page, uci);
    const before = (await state(page)).fen;
    await expect.poll(async () => { const s = await state(page); return s.turn === 'w' && s.fen !== before; }, { timeout: 120_000, intervals: [250] }).toBe(true);
    return { aiFailed: (await state(page)).aiFailed, said: (await page.locator('#app').textContent()) ?? '' };
  }

  test("the Champion's first reply comes from the engine", async ({ page, context }) => {
    await throttle(page, context, true);
    await intoGame(page, upTo('champion', { queenOpen: true }));
    const r = await firstReply(page, 'e2e4');
    expect(r.aiFailed).toBe(false); // the base build: "The computer trainer got lost. Switching to the Easy level."
    expect(r.said).not.toContain('got lost');
  });

  test("a Victory Road drill's first reply comes from the engine", async ({ page, context }) => {
    await throttle(page, context, true);
    await intoGame(page, upTo('victory-road'));
    const r = await firstReply(page, 'h1h5');
    expect(r.aiFailed).toBe(false);
    expect(r.said).not.toContain('got lost');
  });

  test("a tall grass miss review's reply comes from the engine", async ({ page, context }) => {
    await throttle(page, context, true);
    await seed(page, SAVE);
    await coldGoto(page);
    await page.getByTestId('screen-splash').click({ timeout: 120_000 });
    await page.getByTestId('kanto').click({ timeout: 60_000 });
    await page.getByTestId('route-route-1').click({ timeout: 60_000 });
    await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
    await page.getByTestId('walk-grass').click({ timeout: 60_000 });
    await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('player');
    await move(page, 'e2h2');
    await expect.poll(() => kc<{ source: string } | null>(page, 'refutation'), { timeout: 120_000 }).not.toBeNull();
    expect((await kc<{ source: string }>(page, 'refutation')).source).toBe('stockfish'); // base: 'fallback' at 5.1 s
  });
});

test.describe("one engine request at a time (P1 follow-up: requests made while the engine loaded took each other's moves)", () => {
  /** Lichess 0B66I, the next puzzle: a8b8 is a wrong move there. */
  const NEXT: Row = ['0B66I', 'r4rk1/1p4pp/p7/P1p1p1Q1/2Pp4/3P2R1/2P1B1PP/5q1K w - - 6 29', 'e2f1 f8f1', 413];
  /** The engine's script arrives late (a slow phone): every request below is made while it loads. */
  const slowEngine = (page: Page, ms: number) =>
    page.route('**/engine/*.js', async (r) => {
      await new Promise((res) => setTimeout(res, ms));
      await r.continue();
    });
  const legal = (fen: string, uci: string) => new Chess(fen).moves({ verbose: true }).some((m) => m.from + m.to + (m.promotion ?? '') === uci);

  test("a miss review left for the next puzzle's: the second review gets its own reply, and nothing throws", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await slowEngine(page, 10_000);
    await plain(page);
    await move(page, 'e2h2'); // the first review asks the engine, still loading
    await kc(page, 'forcePuzzle', NEXT, 'mateIn1');
    await page.locator('[data-testid="review-new"]:not([disabled])').click();
    await expect.poll(() => phase(page), { timeout: 20_000 }).toBe('player');
    const pre = new Chess((await state(page)).fen);
    pre.move({ from: 'a8', to: 'b8' });
    await move(page, 'a8b8'); // the second review asks too, before the load is over
    await expect.poll(async () => (await kc<{ fen: string } | null>(page, 'refutation'))?.fen, { timeout: 40_000 }).toBe(pre.fen());
    const r = (await kc<{ fen: string; uci: string; source: string }>(page, 'refutation'))!;
    expect(r.source).toBe('stockfish');
    expect(legal(r.fen, r.uci), r.uci).toBe(true); // the earlier build: a8d8, the first puzzle's reply
    await expect(page.getByTestId('review-next')).toBeEnabled({ timeout: 10_000 }); // the reply and the right move joined
    await expect(page.getByTestId('review-text')).not.toContainText('is thinking');
    expect(errors).toEqual([]); // the earlier build: 'Invalid move: {"from":"a8","to":"d8"}'
  });

  test("a miss review left for a game vs Computer: the computer's first reply is its own, from the engine", async ({ page }) => {
    test.setTimeout(90_000);
    await slowEngine(page, 8000);
    await plain(page);
    await move(page, 'e2h2'); // the review asks the engine, still loading
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-computer').click();
    await page.getByTestId('team-red').click();
    await page.getByTestId('level-2').click();
    await page.getByTestId('intro').click();
    await expect(page.getByTestId('screen-game')).toBeVisible();
    await settled(page);
    await move(page, 'e2e4');
    await expect.poll(async () => { const s = await state(page); return s.turn === 'w' && s.fen !== new Chess().fen(); }, { timeout: 40_000, intervals: [250] }).toBe(true); // the earlier build: the review's move, ignored, and the game hung on "thinking"
    expect((await state(page)).aiFailed).toBe(false);
  });

  test('a reply that is not legal in its position never breaks a review: the neutral line and the right move', async ({ page }) => {
    // A stand-in engine that answers every search with a move no position here allows.
    await page.route('**/engine/*.js', (r) =>
      r.fulfill({ contentType: 'text/javascript', body: "onmessage = (e) => { const c = String(e.data); if (c === 'uci') postMessage('uciok'); else if (c === 'isready') postMessage('readyok'); else if (c.startsWith('go')) postMessage('bestmove a1h8'); };" }),
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(lineLog);
    await plain(page);
    await move(page, 'e2h2');
    await expect(page.getByTestId('review-text')).toContainText('checkmate!', { timeout: 15_000 });
    expect((await kc<{ source: string }>(page, 'refutation')).source).toBe('fallback');
    expect((await lines(page)).map((x) => x.text)).toContain('Here is one answer.');
    expect(errors).toEqual([]); // the earlier build: "Invalid move", and the review stopped at your move
  });
});

test.describe('a miss review at reading speed (P2, 4x CPU)', () => {
  test('the line that says why stays REFUTATION_READ_MS before the right move', async ({ page, context }) => {
    test.setTimeout(90_000);
    await throttle(page, context, false);
    await page.addInitScript(lineLog);
    await plain(page);
    await move(page, 'e2h2');
    await expect(page.getByTestId('review-text')).toContainText('checkmate!', { timeout: 30_000 });
    const l = await lines(page);
    const right = l.findIndex((x) => /checkmate!/.test(x.text));
    const why = l[right - 1]!;
    expect(why.text).toMatch(WHY);
    expect(l[right]!.t - why.t, why.text).toBeGreaterThanOrEqual(READ_MS - 20); // base: 900 ms (OPPONENT_REPLY_MS)
  });

  test('a tap after HOLD_MIN_MS moves on to the right move', async ({ page, context }) => {
    test.setTimeout(90_000);
    await throttle(page, context, false);
    await page.addInitScript(lineLog);
    await plain(page);
    await move(page, 'e2h2');
    await expect(page.getByTestId('review-text')).toHaveText(WHY, { timeout: 30_000 });
    await page.locator('body[data-hold="miss"][data-skippable]').waitFor({ state: 'attached' });
    const box = (await page.getByTestId('board').boundingBox())!;
    const tap = await page.evaluate(() => performance.now());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('review-text')).toContainText('checkmate!', { timeout: 5000 });
    const l = await lines(page);
    const right = l.findIndex((x) => /checkmate!/.test(x.text));
    expect(l[right]!.t - tap).toBeLessThan(1000);
    expect(l[right]!.t - l[right - 1]!.t).toBeLessThan(READ_MS - 200);
  });

  test('with no engine, the fallback reply gets a neutral line, never "that one hurts!"', async ({ page }) => {
    await page.route('**/engine/**', (r) => r.abort());
    await page.addInitScript(lineLog);
    await plain(page);
    await move(page, 'e2h2');
    await expect(page.getByTestId('review-text')).toContainText('checkmate!', { timeout: 15_000 });
    expect((await kc<{ source: string }>(page, 'refutation')).source).toBe('fallback');
    const said = (await lines(page)).map((x) => x.text);
    expect(said).toContain('Here is one answer.');
    expect(said.filter((x) => WHY.test(x))).toEqual([]);
  });
});

test("P3: a new save's first puzzle shows its coach marks before the set up move, which plays PUZZLE_SETUP_MS after the second one goes", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(frameLog);
  await seed(page, { ...SAVE, tips: [], lessonsSeen: ['mateIn1'], journey: { cleared: [], beaten: [], visited: ['route-1'] } });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
  await page.getByTestId('battle-trainer').click();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  const coach = page.getByTestId('coach');
  await expect(coach).toContainText('These are yours: TEAM RED, at the bottom.');
  // A reader at 2 words a second: the base build played the set up move under this bubble after 1.5 s.
  await page.waitForTimeout(2500);
  const header = page.getByTestId('screen-game').locator('header');
  await header.click({ position: { x: 2, y: 2 } });
  await expect(coach).toContainText('Your goal is always up here.');
  await page.waitForTimeout(1500);
  await header.click({ position: { x: 2, y: 2 } });
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('player');
  await expect(coach).toContainText('They moved. Now find your move!'); // the third bubble follows the move, as before
  const f = await frames(page);
  const start = f.find((x) => x.fen === QUIET1[1])!;
  const moved = f.find((x) => x.t > start.t && x.fen !== QUIET1[1])!;
  const shown = f.filter((x) => x.t < moved.t && x.bubble);
  expect(shown.length).toBeGreaterThan(0);
  expect(f.find((x) => x.t <= moved.t && x.fen !== QUIET1[1] && x.bubble), 'a set up move under a bubble').toBeUndefined();
  const gone = f.find((x) => x.t > shown.at(-1)!.t && !x.bubble)!; // the frame bubble 2 went
  expect(moved.t - gone.t).toBeGreaterThanOrEqual(SETUP_MS - 40);
  expect(moved.t - gone.t).toBeLessThanOrEqual(SETUP_MS + 150);
});

test("P3: the coach marks move on with Enter, Space and B, as with a tap (the app's skip keys)", async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page, { ...SAVE, tips: [], lessonsSeen: ['mateIn1'], journey: { cleared: [], beaten: [], visited: ['route-1'] } });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
  await page.getByTestId('battle-trainer').click();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  const coach = page.getByTestId('coach');
  await expect(coach).toContainText('These are yours: TEAM RED, at the bottom.');
  await page.keyboard.press('Enter');
  await expect(coach).toContainText('Your goal is always up here.'); // base: Enter, Space and B did nothing (only Escape)
  await page.keyboard.press('Space');
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('player'); // the set up move, PUZZLE_SETUP_MS later
  await expect(coach).toContainText('They moved. Now find your move!');
  await page.keyboard.press('b');
  await expect(coach).toBeHidden();
  expect((await state(page)).fen).not.toBe(QUIET1[1]);
});

test.describe('P4: puzzle holds wait for the player', () => {
  for (const via of ['OPTION', 'START'] as const) {
    test(`${via} open for 3 s during "Watch!": no set up move behind it; it plays at least HOLD_MIN_MS after the board shows again`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.addInitScript(frameLog);
      await seed(page, SAVE);
      await page.goto('./?debug=1');
      await page.getByTestId('screen-splash').click();
      await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
      await kc(page, 'openPuzzles');
      await expect(page.getByTestId('text-main')).toContainText('Watch!');
      await page.locator('body[data-hold="setup"]').waitFor({ state: 'attached' });
      await page.getByTestId('start-button').click();
      if (via === 'OPTION') {
        await page.getByTestId('start-menu-option').click();
        await expect(page.getByTestId('screen-settings')).toBeVisible();
      }
      await page.waitForTimeout(3000); // the player reads OPTION (or START) for 3 s
      expect((await state(page)).fen).toBe(QUIET1[1]); // base: the set up move was played behind it
      if (via === 'OPTION') await page.getByTestId('back').click();
      else await page.getByTestId('start-menu-close').click();
      await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('player');
      const f = await frames(page);
      const back = [...f].reverse().find((x) => x.screen !== 'screen-game' || x.start)!;
      const shows = f.find((x) => x.t > back.t)!;
      const start = f.find((x) => x.fen === QUIET1[1])!;
      const moved = f.find((x) => x.t > start.t && x.fen !== QUIET1[1])!;
      expect(moved.t).toBeGreaterThan(back.t);
      expect(moved.t - shows.t).toBeGreaterThanOrEqual(HOLD_MIN_MS - 20);
    });
  }
});

test('P5: a slow next puzzle never pulls the player off OPTION, OPTION keeps its keys, and Back brings it in with its dip and "Watch!"', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(dipLog);
  await plain(page);
  let served = false;
  await page.route(THEME_CHUNK, async (r) => {
    await new Promise((res) => setTimeout(res, 6000));
    await r.continue();
    served = true;
  });
  await move(page, 'e2e1');
  await skipHold(page); // the solve's beat
  await page.getByTestId('review-continue').click(); // the next puzzle: the board dips while its theme loads
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  // OPTION's own paper fade is over (keys wait for a cover on screen, R2); the board's dip goes on behind it.
  await page.waitForFunction(() => !document.querySelector('.screen-cover'));
  const input = page.getByTestId('save-code-input');
  await input.focus();
  await input.evaluate((e) => e.addEventListener('keydown', () => ((window as unknown as { __typed: number }).__typed = ((window as unknown as { __typed?: number }).__typed ?? 0) + 1)));
  for (let i = 0; i < 10; i++) await page.keyboard.press(i % 2 ? 's' : 'b');
  expect(await page.evaluate(() => (window as unknown as { __typed?: number }).__typed ?? 0)).toBe(10); // base: 0 of 10
  await expect.poll(() => served, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(800); // the load is in: OPTION stays (base: the new puzzle pulled the player back)
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __dips: unknown[] }).__dips.length);
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-game')).toBeVisible();
  await expect.poll(() => page.evaluate((n) => (window as unknown as { __dips: { connected: boolean }[] }).__dips.slice(n).some((d) => d.connected), before)).toBe(true);
  await expect(page.getByTestId('text-main')).toContainText('Watch!');
  await page.locator('body[data-hold="setup"]').waitFor({ state: 'attached' });
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('player');
});

test("P5: the Path's next position never pulls the player off OPTION opened in its dip; Back brings it in with a dip", async ({ page }) => {
  await page.addInitScript(dipLog);
  await page.addInitScript(() => {
    localStorage.setItem('kc:v1:cartridge', JSON.stringify('yellow'));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off' }));
  });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('yellow-learn').click();
  await page.getByTestId('lesson-1').click();
  await page.click('[data-square="e2"]');
  await page.click('[data-square="e4"]');
  const progress = await page.getByTestId('path-progress').textContent();
  await page.locator('[data-testid="path-next"]:not([disabled])').waitFor();
  // Next, then START and OPTION before the dip's peak (as fast as two taps can be): one task in the page.
  await page.evaluate(() => {
    const tap = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click();
    tap('path-next');
    tap('start-button');
    tap('start-menu-option');
  });
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.waitForTimeout(600); // past the dip (BOARD_DIP_MS 240): base showed the board again at its peak
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __dips: unknown[] }).__dips.length);
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-game')).toBeVisible();
  await expect(page.getByTestId('path-progress')).not.toHaveText(progress!);
  expect(await page.evaluate((n) => (window as unknown as { __dips: { connected: boolean }[] }).__dips.slice(n).some((d) => d.connected), before)).toBe(true);
});

test('P6: a miss review that finished behind OPTION shows its right move arrow when the board is back', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(holdLog);
  await plain(page);
  await move(page, 'e2h2');
  await expect(page.getByTestId('review')).toBeVisible();
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  // The review plays all its frames behind OPTION: the reply is in and no hold has run for a while.
  await expect.poll(() => kc(page, 'refutation'), { timeout: 15_000 }).not.toBeNull();
  await page.waitForFunction(() => performance.now() - (window as unknown as { __holdOff: number }).__holdOff > 1500, null, { timeout: 20_000 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('b');
  await expect(page.getByTestId('screen-game')).toBeVisible();
  await expect(page.getByTestId('review-next')).toBeDisabled(); // the last frame
  await expect
    .poll(() =>
      page.evaluate(() => {
        const layer = document.querySelector('[data-testid="review-layer"]')!;
        const line = layer.querySelector('line[data-arrow="e2e1"]');
        const n = (k: string) => Number(line?.getAttribute(k) ?? 0);
        return { box: layer.getAttribute('viewBox') !== '0 0 0 0', length: Math.round(Math.hypot(n('x2') - n('x1'), n('y2') - n('y1'))) > 10, stroke: n('stroke-width') > 0 };
      }),
    )
    .toEqual({ box: true, length: true, stroke: true }); // base: viewBox 0 0 0 0, a line of length 0
});

test('P7: "… is thinking" goes once the engine answers, also when ◀ ▶ were tapped meanwhile', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/engine/**', async (r) => {
    await new Promise((res) => setTimeout(res, 8000));
    await r.continue();
  });
  await plain(page);
  await move(page, 'e2h2');
  const line = page.getByTestId('review-text');
  await expect(line).toContainText('is thinking', { timeout: 10_000 });
  await page.getByTestId('review-prev').click();
  await page.getByTestId('review-next').click();
  await expect.poll(() => kc(page, 'refutation'), { timeout: 30_000 }).not.toBeNull();
  await expect(page.getByTestId('review-next')).toBeEnabled(); // the reply and the right move joined the line
  await expect(line).not.toContainText('is thinking'); // base: it stayed until the player stepped on
});

test("P8: in Training the puzzle bar's way out says Back", async ({ page }) => {
  await seed(page, SAVE);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('training').click();
  await page.getByTestId('train-mateIn1').click();
  await expect(page.getByTestId('leave-grass')).toHaveText('Back'); // base: "Map", which went to the Training list
  await page.getByTestId('leave-grass').click();
  await expect(page.getByTestId('screen-training')).toBeVisible();
});

test('P10: a gym won, at 360x640: the map shows the new badge with its pulse before it stamps the gym', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await seed(page, upTo('pewter-gym'));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await kc(page, 'enterPlace', 'pewter-gym');
  await page.getByTestId('story').click(); // the gym's one line
  for (let i = 0; i < 3; i++) {
    await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
    if (i === 0) {
      await page.getByTestId('trainer-intro').click();
      await page.getByTestId('goal-card').click();
    } else await page.getByTestId('review-continue').click();
    await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('player');
    await move(page, 'e2e1');
    await expect.poll(() => phase(page)).toBe('review');
  }
  // Each frame on the map until the stamp slams: is the new badge in view, and has it its class?
  await page.evaluate(() => {
    const w = window as unknown as { __badge: { stamped: boolean; inView: boolean; marked: boolean }[] };
    w.__badge = [];
    const tick = () => {
      const b = document.querySelector('[data-testid="map-strip"] .badge.boulder');
      if (b) {
        const r = b.getBoundingClientRect();
        const box = b.closest('.menu-body')?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
        w.__badge.push({ stamped: !!document.querySelector('.stamp-now'), inView: r.height > 0 && r.top >= Math.max(0, box.top) && r.bottom <= Math.min(innerHeight, box.bottom), marked: b.classList.contains('badge-new') });
      }
      if (!document.querySelector('.stamp-now')) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByTestId('review-continue').click();
  for (let i = 0; i < 8; i++) {
    const card = page.locator('#app > .overlay:not([hidden]) > .panel').first();
    const which = await Promise.race([card.waitFor({ timeout: 15_000 }).then(() => 'card'), page.getByTestId('screen-map').waitFor({ timeout: 15_000 }).then(() => 'map')]);
    if (which === 'map') break;
    await card.click();
  }
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await page.locator('.stamp-now').waitFor({ state: 'attached' });
  const seen = await page.evaluate(() => (window as unknown as { __badge: { stamped: boolean; inView: boolean; marked: boolean }[] }).__badge);
  expect(seen.some((s) => !s.stamped && s.inView && s.marked)).toBe(true); // base: the strip was above the fold
  await expect(page.locator('[data-testid="place-pewter-gym"].stamp-now')).toBeInViewport(); // then the row, for its stamp
});

test("P11: Slow 4G, cold: Route 1's trainer sprites are in when its screen is revealed", async ({ page, context }) => {
  test.setTimeout(180_000);
  await seed(page, { ...SAVE, journey: { cleared: [], beaten: [], visited: [] } });
  await throttle(page, context, true);
  await coldGoto(page);
  await page.getByTestId('screen-splash').click({ timeout: 120_000 });
  await page.getByTestId('kanto').click({ timeout: 60_000 });
  await expect(page.getByTestId('screen-map')).toBeVisible({ timeout: 60_000 });
  await settled(page, 60_000);
  // The player reads the map; at most 5 s (the base build had not asked for the sprites yet, so it waited them out).
  await page.waitForFunction(() => performance.getEntriesByType('resource').filter((e) => /\/trainers\/(youngster|lass)/.test(e.name)).length >= 2, null, { timeout: 5000 }).catch(() => undefined);
  await page.evaluate(() => {
    const w = window as unknown as { __atReveal: boolean[] | null };
    w.__atReveal = null;
    new MutationObserver((_, o) => {
      if (document.body.dataset.screen !== 'screen-route' || document.querySelector('[data-testid="screen-cover"]')) return;
      o.disconnect();
      w.__atReveal = [...document.querySelectorAll<HTMLImageElement>('.trainer-row .row-sprite img')].map((i) => i.complete && i.naturalWidth > 0);
    }).observe(document.getElementById('app')!, { childList: true, subtree: true });
  });
  await page.getByTestId('route-route-1').click();
  await expect(page.getByTestId('screen-route')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atReveal: boolean[] | null }).__atReveal), { timeout: 10_000 }).toEqual([true, true]);
});
