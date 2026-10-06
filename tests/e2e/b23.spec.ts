// SPDX-License-Identifier: AGPL-3.0-only
// §B23: BACK on OPTION from every way in; relay failures are visible, and feedback waits on the device until it sends.
import { expect, test, type Page } from '@playwright/test';

const RELAY = 'http://localhost:8788';
const camp = { v: 2, name: 'JADE', starter: 'charmander', introSeen: true, teamRules: 2, caught: { charmander: 1 } };
const seed = (page: Page, extra: Record<string, unknown> = {}) =>
  page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, { 'kc:v1:cartridge': 'blue', 'kc:v1:campaign': camp, 'kc:v1:settings': { v: 2, anim: 'off' }, ...extra });
const screenId = (page: Page) => page.locator('#app [data-testid^="screen-"]').first().getAttribute('data-testid');

test.describe('OPTION: BACK, B and Escape return to where it was opened', () => {
  test('from the start menu', async ({ page }) => {
    await seed(page);
    await page.goto('./?debug=1&menu=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('start-option').click();
    await page.getByTestId('back').click();
    expect(await screenId(page)).toBe('screen-start');
    await page.getByTestId('start-option').click();
    await page.keyboard.press('b');
    expect(await screenId(page)).toBe('screen-start');
  });

  test('from the hub', async ({ page }) => {
    await seed(page);
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('settings').click();
    await page.getByTestId('back').click();
    expect(await screenId(page)).toBe('screen-title');
    await page.getByTestId('settings').click();
    await page.keyboard.press('Escape');
    expect(await screenId(page)).toBe('screen-title');
  });

  test('from the YELLOW gear (BACK used to do nothing there)', async ({ page }) => {
    await seed(page, { 'kc:v1:cartridge': 'yellow' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('settings').click();
    await page.getByTestId('back').click();
    expect(await screenId(page)).toBe('screen-yellow');
    expect(errors).toEqual([]);
  });

  test('from the START menu: back to the map, and back to the game in progress', async ({ page }) => {
    await seed(page);
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('kanto').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await page.getByTestId('start-button-corner').click();
    await page.getByTestId('start-menu-option').click();
    await page.getByTestId('back').click();
    expect(await screenId(page)).toBe('screen-map');
    await page.goto('./?debug=1&start=two');
    await page.click('[data-square="e2"]');
    await page.click('[data-square="e4"]');
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-option').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('screen-game')).toBeVisible();
    await expect(page.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp');
  });
});

test.describe('relay failures are visible and recoverable', () => {
  test('feedback waits on the device (at most 20) and sends on the next launch', async ({ page }) => {
    const mark = `queued ${Date.now()}`;
    await seed(page);
    await page.route('**/feedback', (r) => r.fulfill({ status: 500, body: 'error code: 1101' }));
    await page.goto(`./?debug=1&relay=${RELAY}`);
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('settings').click();
    await page.getByTestId('feedback').click();
    await page.getByTestId('feedback-text').fill(mark);
    await page.getByTestId('feedback-bug').click();
    await expect(page.getByTestId('toast').first()).toHaveText("Can't reach the server right now. Your message is saved and will send later.");
    const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:dev:feedbackQueue') ?? '[]').length);
    expect(await queue()).toBe(1);
    for (let i = 0; i < 22; i++) {
      await page.getByTestId('feedback').click();
      await page.getByTestId('feedback-fun').click();
    }
    expect(await queue()).toBe(20);
    // The relay is back: the next launch sends what waited.
    await page.unroute('**/feedback');
    await page.reload();
    await expect.poll(queue, { timeout: 15_000 }).toBe(0);
  });

  test('save codes and online rooms say so when the relay is down', async ({ page }) => {
    await seed(page);
    await page.route('**/save', (r) => r.fulfill({ status: 500, body: 'error code: 1101' }));
    await page.route('**/room', (r) => r.fulfill({ status: 503, body: 'daily limit reached' }));
    await page.goto(`./?debug=1&relay=${RELAY}`);
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('settings').click();
    await page.getByTestId('save-code-make').click();
    await expect(page.getByTestId('toast').first()).toHaveText("Can't reach the server right now. Please try again later.");
    await page.getByTestId('back').click();
    await page.getByTestId('play-online').click();
    await page.getByTestId('create-room').click();
    await expect(page.locator('#app')).toContainText("Can't reach the server right now. Please try again later.");
  });

  test('joining a room when the relay cannot be reached stops and says so', async ({ page }) => {
    await seed(page);
    await page.goto('./?debug=1&relay=http://localhost:9&room=ABCD');
    await expect(page.locator('#app')).toContainText("Can't reach the server right now. Please try again later.", { timeout: 15_000 });
  });
});
