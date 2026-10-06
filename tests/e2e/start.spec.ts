// SPDX-License-Identifier: AGPL-3.0-only
// Change C: the Gen 1 style start menu, several players on one device, NEW GAME, and Two Players with saves.
// (?debug=1 skips the start menu for the other tests; &menu brings it back.)
import { expect, test, type Page } from '@playwright/test';

const camp = (name: string, badges: string[], caught: Record<string, number>, playMs: number, team: Record<string, string> = {}) => ({ v: 2, name, starter: 'charmander', introSeen: true, teamRules: 2, badges, caught, playMs, team });
/** Seeds storage once per test (reloads keep what the game saved). */
const seed = (page: Page, items: Record<string, unknown>) =>
  page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, items);
const three = {
  'kc:v1:profiles': { slots: [1, 2, 3], current: 1 },
  'kc:v1:p1:cartridge': 'blue', 'kc:v1:p1:campaign': camp('JADE', ['boulder', 'cascade'], { charmander: 1, pidgey: 2, rattata: 1, caterpie: 1, weedle: 1 }, 65 * 60_000),
  'kc:v1:p2:cartridge': 'blue', 'kc:v1:p2:campaign': camp('SKY', ['boulder'], { squirtle: 1 }, 5 * 60_000, { q: 'onix' }),
  'kc:v1:p3:cartridge': 'yellow', 'kc:v1:p3:campaign': camp('PIP', [], { bulbasaur: 1, onix: 1 }, 125 * 60_000, { q: 'onix', p: 'bulbasaur' }),
};
const start = async (page: Page) => {
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();
};

test('one save: CONTINUE shows its summary and resumes the game in progress', async ({ page }) => {
  await seed(page, { 'kc:v1:cartridge': 'blue', 'kc:v1:campaign': camp('JADE', ['boulder'], { charmander: 1 }, 30 * 60_000), 'kc:v1:last': 'game', 'kc:v1:game': { mode: 'two-players', human: 'w', level: 1, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', pgn: '1. e4' } });
  await start(page);
  await expect(page.getByTestId('start-switch')).toHaveCount(0);
  await expect(page.getByTestId('start-summary-name')).toHaveText('JADE');
  await expect(page.getByTestId('start-summary-badges')).toHaveText('1');
  await expect(page.getByTestId('start-summary-time')).toHaveText('0:30');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp');
});

test('three saves: SWITCH TRAINER lists them; saves 2 and 3 keep their own progress', async ({ page }) => {
  await seed(page, three);
  await start(page);
  await page.getByTestId('start-switch').click();
  await expect(page.getByTestId('slot-1')).toContainText('2 badges');
  await expect(page.getByTestId('slot-1')).toContainText('Pokédex 5');
  await expect(page.getByTestId('slot-1')).toContainText('1:05');
  await expect(page.getByTestId('slot-3')).toContainText('2:05');
  // Loading a save carries on where it left off: SKY's journey map.
  await page.getByTestId('slot-pick-2').click();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:profiles')!).current)).toBe(2);
  await start(page);
  await expect(page.getByTestId('start-summary-name')).toHaveText('SKY');
  await page.getByTestId('start-switch').click();
  await page.getByTestId('slot-pick-3').click();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-yellow')).toBeVisible();
  const saves = await page.evaluate(() => [2, 3].map((n) => JSON.parse(localStorage.getItem(`kc:v1:p${n}:campaign`)!)).map((c) => [c.name, c.badges.length, Object.keys(c.caught).length]));
  expect(saves).toEqual([['SKY', 1, 1], ['PIP', 0, 2]]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:profiles')!).current)).toBe(3);
});

test('NEW GAME with all 4 saves in use needs a 2 second hold naming the save it replaces', async ({ page }) => {
  await seed(page, { ...three, 'kc:v1:profiles': { slots: [1, 2, 3, 4], current: 1 }, 'kc:v1:p4:cartridge': 'blue', 'kc:v1:p4:campaign': camp('ROWAN', [], {}, 0) });
  await start(page);
  await page.getByTestId('start-new').click();
  await expect(page.getByTestId('screen-replace')).toBeVisible();
  await expect(page.getByTestId('replace-2')).toContainText("SKY");
  await page.getByTestId('replace-2').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('screen-replace')).toBeVisible();
  await page.getByTestId('replace-2').dispatchEvent('pointerdown');
  await page.waitForTimeout(2200);
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('kc:v1:p2:campaign'), JSON.parse(localStorage.getItem('kc:v1:profiles')!).current, JSON.parse(localStorage.getItem('kc:v1:p1:campaign')!).name])).toEqual([null, 2, 'JADE']);
});

test('Two Players with two saves: each side plays its own trainer and team', async ({ page }) => {
  await seed(page, { ...three, 'kc:v1:p1:campaign': { ...camp('JADE', ['boulder'], { charmander: 1, machamp: 1 }, 0, { q: 'machamp' }), starter: null, teamRules: 2 }, 'kc:v1:p1:settings': { v: 2, anim: 'off' } });
  await start(page);
  await page.getByTestId('start-continue').click();
  await page.getByTestId('two-players').click();
  await page.getByTestId('duo-w-1').click();
  await page.getByTestId('duo-b-2').click();
  await page.getByTestId('duo-start').click();
  await expect(page.getByTestId('plate-bottom')).toContainText('JADE');
  await expect(page.getByTestId('plate-top')).toContainText('SKY');
  await expect(page.locator('[data-square="d1"]')).toHaveAttribute('aria-label', /MACHAMP/);
  await expect(page.locator('[data-square="d8"]')).toHaveAttribute('aria-label', /ONIX/);
});

for (const [w, h] of [[360, 640], [1280, 720]] as const) {
  test(`start menu and switch list screenshots ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seed(page, three);
    await start(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/start-menu/start-${w}x${h}.png` });
    await page.getByTestId('start-switch').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/start-menu/switch-${w}x${h}.png`, fullPage: true });
  });
}
