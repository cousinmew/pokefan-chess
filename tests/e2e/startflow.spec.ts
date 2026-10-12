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
    // One back control on the name step (ux #14): ◀ BACK, not also the screen's own Back.
    await expect(page.getByTestId('back')).toHaveCount(0);
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
  // The starter's Back returns to the name step, still with ◀ BACK, never to a hub with no starter (playtest, 12 Oct).
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-name')).toBeVisible();
  await expect(page.getByTestId('newgame-back')).toBeVisible();
  await page.getByTestId('name-2').click();
  await page.getByTestId('starter-squirtle').click();
  await expect(page.getByTestId('story')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('kc:v1:creating'))).toBeNull(); // the save is real now
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
  // A guest's game in progress is not saved, so QUIT asks first (playtest, 12 Oct); Keep playing stays.
  await page.getByTestId('quit-no').click();
  await expect(page.getByTestId('quit-confirm')).toHaveCount(0);
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-quit').click();
  await page.getByTestId('quit-yes').click();
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

// Playtest 12 Oct (W1): CONTINUE only with progress, first launch straight into the new game, NEW GAME reusing an
// empty save, BACK that can only drop the save being made, a NEW GAME left empty dropped at boot (never a save from
// before, data loss review), and the double tap latch.
const profiles = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:profiles') ?? 'null'));
const menuItems = (page: Page) => page.locator('[data-testid^="start-"].start-item').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid));
/** Seeds exactly these keys once per test (no old style keys, which would move into the current save). */
const seedRaw = (page: Page, kv: Record<string, unknown>) =>
  page.addInitScript((items) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, JSON.stringify(v));
  }, kv);

test.describe('a brand-new device', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('first launch: splash, shelf, then straight into Oak; BACK shows a menu with no CONTINUE', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('screen-splash').click();
    await expect(page.getByTestId('screen-shelf')).toBeVisible();
    await expect(page.locator('.screen-shelf h2')).toHaveText('Do you know how chess pieces move?');
    await expect(page.getByTestId('cart-yellow')).toContainText('Start here');
    await expect(page.getByTestId('cart-blue')).toContainText('Puzzles, gyms, catching.');
    await expect(page.getByTestId('lang-button')).toHaveCount(0); // the language list is the only language control
    const carts = await page.locator('.cartridge').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid));
    expect(carts).toEqual(['cart-yellow', 'cart-blue']);
    await page.getByTestId('cart-blue').click();
    await expect(page.getByTestId('screen-intro')).toBeVisible();
    await expect(page.getByTestId('screen-start')).toHaveCount(0);
    expect(await profiles(page)).toEqual({ slots: [1], current: 1 });
    await page.getByTestId('newgame-back').click();
    await page.getByTestId('screen-splash').click();
    await expect(page.getByTestId('screen-start')).toBeVisible();
    expect(await menuItems(page)).toEqual(['start-new', 'start-play', 'start-option']);
    await expect(page.getByTestId('start-summary')).toHaveCount(0);
    await expect(page.getByTestId('start-new')).toContainText('Start your own save. Others are kept.');
    // NEW GAME from here reuses the empty save: the shelf at once (no second splash), one slot.
    await page.getByTestId('start-new').click();
    await expect(page.getByTestId('screen-shelf')).toBeVisible();
    await page.getByTestId('cart-blue').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
    await page.getByTestId('name-2').click();
    await expect(page.getByTestId('screen-oak')).toBeVisible();
    expect(await profiles(page)).toEqual({ slots: [1], current: 1 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:p1:campaign')!).name)).toBeTruthy();
  });

  test('first launch on YELLOW opens its home; its start menu shows lessons and stickers, not badges', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('cart-yellow').click();
    await expect(page.getByTestId('screen-yellow')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('kc:v1:p1:campaign', JSON.stringify({ path: 3, caught: { pikachu: 1, eevee: 1 } })));
    await page.reload();
    await page.getByTestId('screen-splash').click();
    await expect(page.getByTestId('start-continue')).toHaveText(/^▶\s*CONTINUE$/); // no name chosen: plain CONTINUE
    await expect(page.getByTestId('start-summary-lessons')).toHaveText('3/12');
    await expect(page.getByTestId('start-summary-stickers')).toHaveText('2');
    await expect(page.getByTestId('start-summary-badges')).toHaveCount(0);
    await expect(page.getByTestId('start-summary-dex')).toHaveCount(0);
  });
});

test('a cartridge alone is no progress: no CONTINUE, and NEW GAME keeps a single slot', async ({ page }) => {
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  expect(await menuItems(page)).toEqual(['start-new', 'start-play', 'start-option']);
  await page.getByTestId('start-new').click();
  await page.getByTestId('cart-blue').click();
  await expect(page.getByTestId('screen-intro')).toBeVisible();
  expect(await profiles(page)).toEqual({ slots: [1], current: 1 });
});

test('CONTINUE names the save', async ({ page }) => {
  await seed(page);
  await startMenu(page);
  await expect(page.getByTestId('start-continue')).toContainText('CONTINUE as JADE');
});

test('a NEW GAME left empty is dropped at boot, a save from before never is; SWITCH TRAINER lists neither', async ({ page }) => {
  // Saves 2 and 3: NEW GAMEs left unnamed, their device notes older than the 30 minute hold. Save 4 is from before
  // the notes, with only a cartridge, settings and a language: it stays (data loss review).
  const notes = { 2: Date.now() - 31 * 60_000, 3: 0 };
  const save4 = { 'kc:v1:p4:cartridge': 'blue', 'kc:v1:p4:settings': { v: 2, sound: false }, 'kc:v1:p4:lang': 'de' };
  await seedRaw(page, { 'kc:v1:profiles': { slots: [1, 2, 3, 4], current: 2 }, 'kc:v1:p1:cartridge': 'blue', 'kc:v1:p1:campaign': camp, 'kc:v1:p2:cartridge': 'blue', 'kc:v1:p3:campaign': { introSeen: true }, ...save4, 'kc:v1:dev:newGames': notes });
  await startMenu(page);
  await expect(page.getByTestId('start-summary-name')).toHaveText('JADE');
  await expect(page.getByTestId('start-switch')).toHaveCount(0);
  expect(await profiles(page)).toEqual({ slots: [1, 4], current: 1 });
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /^kc:v1:(p[23]:|dev:newGames)/.test(k)))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('kc:v1:p4:lang'))).toBe('"de"');
});

test('bugs #2: a NEW GAME left unnamed can no longer delete another save', async ({ page }) => {
  const sky = { v: 2, name: 'SKY', introSeen: true, teamRules: 2 };
  await seed(page, { 'kc:v1:profiles': { slots: [1, 2], current: 1 }, 'kc:v1:p2:cartridge': 'blue', 'kc:v1:p2:campaign': sky });
  await startMenu(page);
  await page.getByTestId('start-new').click();
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('cart-blue').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
  await expect(page.getByTestId('screen-name')).toBeVisible();
  // Leave the unnamed save another way: the menu again in the same tab, then SWITCH TRAINER to SKY.
  await startMenu(page);
  await page.getByTestId('start-switch').click();
  await expect(page.getByTestId('slot-3')).toHaveCount(0); // the unnamed save is not listed
  await page.getByTestId('slot-pick-2').click();
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('screen-intro')).toBeVisible();
  await expect(page.getByTestId('newgame-back')).toHaveCount(0);
  await page.keyboard.press('Escape');
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
  await page.getByTestId('back').click(); // the name step's own Back: home, nothing deleted
  await expect(page.getByTestId('screen-title')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:p2:campaign')!).name)).toBe('SKY');
  expect(await profiles(page)).toEqual({ slots: [1, 2], current: 2 });
});

test('a double tap on NEW GAME makes one save', async ({ page }) => {
  await seed(page);
  await startMenu(page);
  await page.getByTestId('start-new').dblclick();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
  expect(await profiles(page)).toEqual({ slots: [1, 2], current: 2 });
});

test('PLAY CHESS: a guest has no cartridge switch', async ({ page }) => {
  await seed(page);
  await startMenu(page);
  await page.getByTestId('start-play').click();
  await page.getByTestId('quick-friend').click();
  await page.getByTestId('intro').click();
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expect(page.getByTestId('switch-cartridge')).toHaveCount(0);
});
