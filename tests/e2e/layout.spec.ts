// SPDX-License-Identifier: AGPL-3.0-only
// Change A: game screens fit the window at every size, with no scrolling. For each viewport: a game vs Computer
// (board, both plates with messages, Menu and Take back), a puzzle, the battle overlay, the level picker and the shelf.
import { expect, test, type Page } from '@playwright/test';

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
  for (const id of ['board', 'plate-top', 'plate-bottom', 'menu', 'takeback', 'text-main']) await inView(page, id, what);
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
    for (const id of ['board', 'plate-bottom', 'menu']) await inView(page, id, `${w}x${h} puzzle`);
    // The level picker and the shelf.
    await page.getByTestId('menu').click();
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
