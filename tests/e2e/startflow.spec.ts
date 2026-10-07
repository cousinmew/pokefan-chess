// SPDX-License-Identifier: AGPL-3.0-only
// §B22: Oak on the first intro box, BACK out of NEW GAME, the START button, and PLAY CHESS without a save.
import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'docs/start-flow';
const camp = { v: 2, name: 'JADE', starter: 'charmander', introSeen: true, teamRules: 2, badges: ['boulder'], caught: { charmander: 1 }, playMs: 600_000 };
const seed = (page: Page, extra: Record<string, unknown> = {}) =>
  page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, { 'kc:v1:cartridge': 'blue', 'kc:v1:campaign': camp, 'kc:v1:settings': { v: 2, anim: 'off' }, ...extra });
const startMenu = async (page: Page) => {
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();
};
const storage = (page: Page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));

test.use({ viewport: { width: 360, height: 640 } });

test('NEW GAME, cold cache on Slow 4G: Oak shows on the first intro box', async ({ page, context }) => {
  test.setTimeout(180_000);
  await seed(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 });
  await page.goto('./?debug=1&menu=1', { timeout: 120_000 });
  await page.getByTestId('screen-splash').click({ timeout: 120_000 });
  await page.getByTestId('start-new').click({ timeout: 60_000 });
  await page.getByTestId('screen-splash').click({ timeout: 120_000 });
  await page.getByTestId('cart-blue').click({ timeout: 60_000 });
  const box = page.getByTestId('story');
  await expect(box).toBeVisible({ timeout: 60_000 });
  const first = await page.getByTestId('story-text').textContent();
  // Still on the first box: Oak's sprite (not the silhouette) is there.
  const oak = page.locator('.screen-intro [data-trainer="oak"]');
  await expect.poll(() => oak.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), { timeout: 10_000 }).toBe(true);
  await expect(page.locator('.screen-intro .trainer-sprite.loading')).toHaveCount(0);
  expect(await page.getByTestId('story-text').textContent()).toBe(first);
  await page.screenshot({ path: `${SHOTS}/oak-first-box.png` });
});

test('BACK out of NEW GAME: the shelf, the intro and the name step return to the start menu with nothing saved', async ({ page }) => {
  await seed(page);
  await startMenu(page);
  const before = await storage(page);
  for (const exit of ['button', 'escape', 'b'] as const) {
    await page.getByTestId('start-new').click();
    await page.getByTestId('screen-splash').click();
    await expect(page.getByTestId('newgame-back')).toBeVisible();
    await page.getByTestId('cart-blue').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
    await expect(page.getByTestId('screen-name')).toBeVisible();
    if (exit === 'button') {
      if (!(await page.getByTestId('newgame-back').isVisible())) throw new Error('no BACK on the name step');
      await page.screenshot({ path: `${SHOTS}/newgame-back.png` });
      await page.getByTestId('newgame-back').click();
    } else await page.keyboard.press(exit === 'escape' ? 'Escape' : 'b');
    await page.getByTestId('screen-splash').click();
    await expect(page.getByTestId('screen-start')).toBeVisible();
    expect(await storage(page)).toBe(before);
  }
  // Confirming the name makes the save real: BACK is gone and START takes over.
  await page.getByTestId('start-new').click();
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('cart-blue').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
  await page.getByTestId('name-2').click();
  await expect(page.getByTestId('screen-oak')).toBeVisible();
  await expect(page.getByTestId('newgame-back')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:profiles')!).slots.length)).toBe(2);
});

test('START: in the top bar, opens with a tap, S or Enter, closes with B or Escape; SAVE & QUIT returns to the start menu', async ({ page }) => {
  await seed(page);
  await page.goto('./?debug=1&menu=1&start=two');
  const btn = page.getByTestId('start-button');
  const box = (await btn.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeGreaterThan(300); // top right
  await btn.click();
  await expect(page.getByTestId('start-overlay')).toBeVisible();
  for (const id of ['journey', 'computer', 'friend', 'online', 'dex', 'option', 'quit']) await expect(page.getByTestId(`start-menu-${id}`)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/start-overlay.png` });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-overlay')).toHaveCount(0);
  await page.keyboard.press('s');
  await expect(page.getByTestId('start-overlay')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.getByTestId('start-overlay')).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('start-overlay')).toBeVisible();
  await page.getByTestId('start-menu-quit').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();
  // CONTINUE resumes the journey; there START sits in the corner and leads anywhere, e.g. VS COMPUTER.
  await page.getByTestId('start-continue').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await page.getByTestId('start-button-corner').click();
  await page.getByTestId('start-menu-computer').click();
  await expect(page.getByTestId('screen-team')).toBeVisible();
});

test('START during a puzzle pauses it without counting a fail', async ({ page }) => {
  await seed(page);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.evaluate(() => (window as unknown as { __kc: { openPuzzles(): void } }).__kc.openPuzzles());
  const phase = () => page.evaluate(() => (window as unknown as { __kc: { puzzlePhase(): string } }).__kc.puzzlePhase());
  await expect.poll(phase, { timeout: 10_000 }).toBe('player');
  const rating = () => page.evaluate(() => localStorage.getItem('kc:v1:p1:puzzles'));
  const r0 = await rating();
  await page.getByTestId('start-button').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  expect(await phase()).toBe('player');
  expect(await rating()).toBe(r0);
});

test('START sits top left in Hebrew', async ({ page }) => {
  await seed(page, { 'kc:v1:lang': 'he' });
  await page.goto('./?debug=1&start=two');
  const box = (await page.getByTestId('start-button').boundingBox())!;
  expect(box.x).toBeLessThan(60);
});

test('PLAY CHESS: straight into a game as a guest; nothing is saved and the Journey is untouched', async ({ page }) => {
  await seed(page);
  await startMenu(page);
  const items = await page.locator('[data-testid^="start-"].start-item').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid));
  expect(items.indexOf('start-play')).toBe(items.indexOf('start-new') + 1);
  await page.screenshot({ path: `${SHOTS}/start-menu.png` });
  const before = await storage(page);
  await page.getByTestId('start-play').click();
  await page.screenshot({ path: `${SHOTS}/play-chess.png` });
  await page.getByTestId('quick-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-1').click();
  await page.getByTestId('intro').click();
  await expect(page.getByTestId('plate-bottom')).toContainText('Guest');
  await expect(page.locator('[data-square="d1"]')).toHaveAttribute('aria-label', /CHARIZARD/); // the default team
  await page.click('[data-square="e2"]');
  await page.click('[data-square="e4"]');
  await page.waitForTimeout(800);
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-quit').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();
  expect(await storage(page)).toBe(before);
  // VS FRIEND as guests too.
  await page.getByTestId('start-play').click();
  await page.getByTestId('quick-friend').click();
  await page.getByTestId('intro').click();
  await page.click('[data-square="d2"]');
  await page.click('[data-square="d4"]');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-quit').click();
  expect(await storage(page)).toBe(before);
});
