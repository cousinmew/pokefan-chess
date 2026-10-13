// SPDX-License-Identifier: AGPL-3.0-only
// Change A: game screens fit the window at every size, with no scrolling. For each viewport: a game vs Computer
// (board, both plates with messages, Menu and Take back), a puzzle, the battle overlay, the level picker and the shelf.
import { expect, test, type Page } from '@playwright/test';
import { settled } from './pace';

const SIZES: [number, number][] = [[320, 480], [360, 640], [375, 667], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]];
const SHOTS = new Set(['360x640', '390x844', '1024x768', '1280x720', '1920x1080']);
type KC = { __kc: { move(u: string): string; openPuzzles(): void; battleTo(p: string): unknown } };

async function noScroll(page: Page, what: string): Promise<void> {
  const s = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: window.innerWidth, h: window.innerHeight, x: window.scrollX, y: window.scrollY }));
  expect(s.sw, `${what}: page wider than the window`).toBeLessThanOrEqual(s.w);
  expect(s.sh, `${what}: page taller than the window`).toBeLessThanOrEqual(s.h);
}

async function inView(page: Page, testid: string, what: string): Promise<void> {
  const loc = page.getByTestId(testid).first();
  await expect(loc, `${what}: ${testid}`).toBeVisible();
  const b = (await loc.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(b.x, `${what}: ${testid} left`).toBeGreaterThanOrEqual(-0.5);
  expect(b.y, `${what}: ${testid} top`).toBeGreaterThanOrEqual(-0.5);
  expect(b.x + b.width, `${what}: ${testid} right`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(b.y + b.height, `${what}: ${testid} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
}

async function checkGame(page: Page, what: string): Promise<void> {
  await page.waitForTimeout(150);
  await noScroll(page, what);
  for (const id of ['board', 'plate-top', 'plate-bottom', 'takeback', 'text-main', 'start-button']) await inView(page, id, what);
  // START sits in the top bar row and is at least 44 px tall (§B22 item 3).
  expect((await page.getByTestId('start-button').boundingBox())!.height, `${what}: START height`).toBeGreaterThanOrEqual(44);
  const board = (await page.getByTestId('board').boundingBox())!;
  expect(Math.min(board.width, board.height), `${what}: board size`).toBeGreaterThanOrEqual(Math.min(280, page.viewportSize()!.width - 16));
}

async function vsComputer(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off', takeBack: true, legend: 'on' })));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-1').click();
  await page.getByTestId('intro').click();
  await page.evaluate(() => (window as unknown as KC).__kc.move('e2e4'));
  await expect(page.getByTestId('takeback')).toBeVisible();
}

for (const [w, h] of SIZES) {
  test(`@both game screens fit ${w}x${h}`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: w, height: h });
    await vsComputer(page);
    await checkGame(page, `${w}x${h} vs Computer`);
    if (info.project.name === 'chromium' && SHOTS.has(`${w}x${h}`)) await page.screenshot({ path: `docs/layout/board-${w}x${h}.png` });
    // The battle overlay fits too.
    await page.evaluate(() => (window as unknown as KC).__kc.battleTo('fx'));
    const scr = (await page.locator('.battle .screen').boundingBox())!;
    expect(scr.y + scr.height, `${w}x${h} battle`).toBeLessThanOrEqual(h + 0.5);
    expect(scr.x + scr.width, `${w}x${h} battle`).toBeLessThanOrEqual(w + 0.5);
    await noScroll(page, `${w}x${h} battle`);
    await page.evaluate(() => (window as unknown as { __kc: { step(n: number): unknown } }).__kc.step(300));
    // A puzzle.
    await page.evaluate(() => (window as unknown as KC).__kc.openPuzzles());
    await page.waitForTimeout(300);
    await noScroll(page, `${w}x${h} puzzle`);
    for (const id of ['board', 'plate-bottom', 'start-button']) await inView(page, id, `${w}x${h} puzzle`);
    // The level picker and the shelf.
    await page.getByTestId('start-button').click(); // START replaced Menu (§B24 item 1)
    await page.getByTestId('start-menu-quit').click();
    await page.getByTestId('vs-computer').click();
    await page.getByTestId('team-red').click();
    await noScroll(page, `${w}x${h} level picker`);
    for (const n of [1, 4]) await inView(page, `level-${n}`, `${w}x${h} level picker`);
    await page.evaluate(() => localStorage.removeItem('kc:v1:p1:cartridge'));
    await page.reload();
    await page.getByTestId('screen-splash').click();
    await noScroll(page, `${w}x${h} shelf`);
    for (const id of ['cart-yellow', 'cart-blue', 'lang-zh-Hans']) await inView(page, id, `${w}x${h} shelf`);
  });
}

test('@both a live resize keeps the game on screen: 1280x720, 1280x500, 600x900', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await vsComputer(page);
  for (const [w, h] of [[1280, 720], [1280, 500], [600, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await checkGame(page, `resize to ${w}x${h}`);
  }
});

// W2: every screen fits any window or iframe, the way web game portals expect: desktop 16:9, 16:10 and 4:3, small
// 800x600 and 640x480 embeds, tablets, phones in portrait and landscape. Each screen is opened once and the window is
// resized through the whole matrix, which also covers live resizing and rotation.
const MATRIX: [number, number][] = [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [800, 600], [640, 480], [768, 1024], [412, 915], [390, 844], [360, 640], [320, 480], [844, 390], [667, 375]];
const CAMPAIGN = { v: 2, name: 'RED', starter: 'squirtle', caught: { squirtle: 9, pidgey: 2, rattata: 3 }, shiny: { squirtle: 1 }, oak: {}, candy: { squirtle: 30 }, seen: ['squirtle', 'pidgey', 'rattata'], caughtAt: { squirtle: 'pallet' }, routes: {}, journey: { cleared: [], beaten: [], visited: ['pallet'] }, team: {}, playMs: 3600000, introSeen: true };
type Phase = { __kc: { puzzlePhase(): string; puzzleAnswer(): string } };

/** Everything that does not fit on the screen as it is now: page scroll, a control out of reach (off screen and not
 * in a scrolling box), a tap target under 44 px up to 900 px wide, a key label cut, a board under its minimum. */
async function misfits(page: Page, what: string): Promise<string[]> {
  const found = await page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight, de = document.documentElement, out: string[] = [];
    if (de.scrollWidth > W || de.scrollHeight > H) out.push(`page scrolls (${de.scrollWidth}x${de.scrollHeight})`);
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      for (let a: Element | null = e; a; a = a.parentElement) {
        const c = getComputedStyle(a);
        if (c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') return false;
      }
      return true;
    };
    const inScroller = (e: Element) => {
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const c = getComputedStyle(a);
        if (/(auto|scroll)/.test(c.overflowY + c.overflowX) && (a.scrollHeight > a.clientHeight + 1 || a.scrollWidth > a.clientWidth + 1)) return true;
      }
      return false;
    };
    const name = (e: Element) => (e as HTMLElement).dataset.testid ?? (e.textContent ?? '').trim().slice(0, 24);
    for (const b of document.querySelectorAll('button, select, a[href], input')) {
      if (!shown(b)) continue;
      const r = b.getBoundingClientRect();
      if ((r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) && !inScroller(b)) out.push(`${name(b)} out of reach`);
      if (W <= 900 && (r.width < 43.5 || r.height < 43.5)) out.push(`${name(b)} ${Math.round(r.width)}x${Math.round(r.height)} under 44 px`);
    }
    for (const e of document.querySelectorAll('.start-btn, .menu-actions button, [data-testid="turn"], [data-testid="takeback"], .review-btn, .big-level, .menu button.level, .tile-title, .start-item, .tb-main')) {
      if (shown(e) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)) out.push(`${name(e)} cut (${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight})`);
    }
    const board = document.querySelector('[data-testid="board"]');
    if (board && shown(board)) {
      const r = board.getBoundingClientRect();
      if (Math.min(r.width, r.height) < Math.min(280, W - 16)) out.push(`board ${Math.round(r.width)} px`);
    }
    return out;
  });
  return found.map((f) => `${what}: ${f}`);
}

/** Resizes through the matrix on the screen that is showing and collects what does not fit. */
async function sweep(page: Page, what: string): Promise<string[]> {
  const out: string[] = [];
  for (const [w, h] of MATRIX) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    out.push(...(await misfits(page, `${what} ${w}x${h}`)));
  }
  return out;
}

async function seeded(page: Page, cart: 'blue' | 'yellow', url = './?debug=1'): Promise<void> {
  await page.addInitScript(([c, camp]) => {
    localStorage.setItem('kc:v1:cartridge', JSON.stringify(c));
    localStorage.setItem('kc:v1:campaign', camp);
    localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off', takeBack: true, legend: 'on' }));
  }, [cart, JSON.stringify(CAMPAIGN)] as const);
  await page.goto(url);
  await page.getByTestId('screen-splash').click();
}

test('@both W2: the menus fit every window', async ({ page }) => {
  test.setTimeout(150_000);
  const out: string[] = [];
  await seeded(page, 'blue', './?debug=1&menu');
  await expect(page.getByTestId('screen-start')).toBeVisible();
  out.push(...(await sweep(page, 'start menu')));
  for (const [tile, screen] of [['how-to', 'screen-howto'], ['settings', 'screen-settings'], ['hub-card', 'trainer-card'], ['kanto', 'screen-map']] as const) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    if (tile === 'how-to') out.push(...(await sweep(page, 'hub')));
    await page.getByTestId(tile).first().click();
    await expect(page.getByTestId(screen)).toBeVisible();
    out.push(...(await sweep(page, screen)));
  }
  await page.getByTestId('open-dex').click();
  out.push(...(await sweep(page, 'pokedex')));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  out.push(...(await sweep(page, 'level picker')));
  expect(out).toEqual([]);
});

test('@both W2: the game, a puzzle review and its Continue fit every window', async ({ page }) => {
  test.setTimeout(150_000);
  const out: string[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await seeded(page, 'blue');
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-1').click();
  await page.getByTestId('intro').click();
  await page.evaluate(() => (window as unknown as KC).__kc.move('e2e4'));
  await expect(page.getByTestId('takeback')).toBeVisible();
  out.push(...(await sweep(page, 'vs Computer')));
  // A route trainer's puzzle, then solved, so the review with its buttons and Continue shows (R1, R2).
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await page.getByTestId('warmup-skip').click(); // Oak's warm-up (W5): covered in progress.spec.ts
  await page.getByTestId('battle-trainer').click();
  // Oak's lesson (loaded under a cover) or, after the "!" (TRAINER_SPOT_MS), the card: wait for one, not a fixed time.
  await page.locator('[data-testid="lesson-ok"], [data-testid="trainer-intro"]').first().waitFor();
  if (await page.getByTestId('lesson-ok').isVisible()) await page.getByTestId('lesson-ok').click();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  const phase = () => page.evaluate(() => (window as unknown as Phase).__kc.puzzlePhase());
  await expect.poll(phase, { timeout: 10_000 }).toBe('player');
  out.push(...(await sweep(page, 'puzzle')));
  await page.setViewportSize({ width: 1280, height: 720 });
  for (let i = 0; i < 6 && (await phase()) === 'player'; i++) {
    const uci = await page.evaluate(() => (window as unknown as Phase).__kc.puzzleAnswer());
    await page.click(`[data-square="${uci.slice(0, 2)}"]`);
    await page.click(`[data-square="${uci.slice(2, 4)}"]`);
    await expect.poll(phase, { timeout: 10_000 }).toMatch(/player|review/);
  }
  await expect.poll(phase, { timeout: 10_000 }).toBe('review');
  out.push(...(await sweep(page, 'review')));
  await expect(page.getByTestId('review-continue')).toBeVisible();
  expect(out).toEqual([]);
});

test('@both W2: YELLOW fits every window, its board included', async ({ page }) => {
  test.setTimeout(150_000);
  const out: string[] = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await seeded(page, 'yellow');
  await expect(page.getByTestId('screen-yellow')).toBeVisible();
  out.push(...(await sweep(page, 'YELLOW home')));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId('yellow-play').click();
  out.push(...(await sweep(page, 'YELLOW levels')));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId('yellow-level-1').click();
  // The intro card holds INTRO_MS: click() waits for its guard (data-ready) and skips it, then the board settles.
  await page.getByTestId('intro').click();
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await settled(page);
  out.push(...(await sweep(page, 'YELLOW game')));
  expect(out).toEqual([]);
});
