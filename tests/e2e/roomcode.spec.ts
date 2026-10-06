// SPDX-License-Identifier: AGPL-3.0-only
// §B18 item 1: the room code field. Typing, pasting lower case (with spaces, or a whole link), Enter and the Join
// button, the 4 letter limit, and the ?room= link. Runs in Chromium and in WebKit (iPhone 13), tagged @both.
import { devices, expect, test, type Browser, type Page } from '@playwright/test';

const RELAY = '&relay=http://localhost:8788';

async function createRoom(browser: Browser): Promise<string> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const a = await ctx.newPage();
  await a.goto(`./?debug=1${RELAY}`);
  await a.getByTestId('screen-splash').click();
  await a.getByTestId('play-online').click();
  await a.getByTestId('create-room').click();
  return (await a.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
}

async function onlineMenu(page: Page, query = '') {
  await page.goto(`./?debug=1${RELAY}${query}`);
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('play-online').click();
}

test.use({ viewport: { width: 360, height: 640 } });

test('@both typing the code in lower case, then Enter, joins the room', async ({ browser, page }) => {
  const code = await createRoom(browser);
  await onlineMenu(page);
  const input = page.getByTestId('code-input');
  await expect(input).toHaveAttribute('autocapitalize', 'characters');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await expect(input).toHaveAttribute('inputmode', 'text');
  await input.click();
  await page.keyboard.type(code.toLowerCase(), { delay: 30 });
  await expect(input).toHaveValue(code);
  await page.keyboard.press('Enter');
  await expect(page.locator('#board')).toBeVisible({ timeout: 10_000 });
});

test('@both pasting lower case with spaces, or a whole link, then the Join button, joins', async ({ browser, page }) => {
  const code = await createRoom(browser);
  await onlineMenu(page);
  const input = page.getByTestId('code-input');
  await input.fill(`  ${code.toLowerCase().split('').join(' ')} `);
  await expect(input).toHaveValue(code);
  await input.fill(`https://pokefanchess.com/?room=${code.toLowerCase()}`);
  await expect(input).toHaveValue(code);
  await input.fill(`${code}XYZ`);
  await expect(input).toHaveValue(code);
  await page.getByTestId('join-code').click();
  await expect(page.locator('#board')).toBeVisible({ timeout: 10_000 });
});

test('@both a short code asks for 4 letters; a code with I or O says no such room', async ({ page }) => {
  await onlineMenu(page);
  await page.getByTestId('code-input').fill('ab');
  await page.getByTestId('join-code').click();
  await expect(page.getByTestId('code-error')).not.toBeEmpty();
  await expect(page.getByTestId('screen-online')).toBeVisible();
  await page.getByTestId('code-input').fill('oooo');
  await page.getByTestId('join-code').click();
  await expect(page.getByTestId('online-message')).toBeVisible();
});

test('@both a ?room= link in lower case joins straight away', async ({ browser, page }) => {
  const code = await createRoom(browser);
  await page.goto(`./?debug=1${RELAY}&room=${code.toLowerCase()}`);
  await expect(page.locator('#board')).toBeVisible({ timeout: 10_000 });
});

test('Android Chrome emulation: typing and the Go key join', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Android emulation is Chromium only');
  const code = await createRoom(browser);
  const p7 = devices['Pixel 7'];
  const ctx = await browser.newContext({ viewport: p7.viewport, userAgent: p7.userAgent, deviceScaleFactor: p7.deviceScaleFactor, isMobile: p7.isMobile, hasTouch: p7.hasTouch });
  const page = await ctx.newPage();
  await onlineMenu(page);
  await page.getByTestId('code-input').tap();
  await page.keyboard.type(code.toLowerCase());
  await page.keyboard.press('Enter');
  await expect(page.locator('#board')).toBeVisible({ timeout: 10_000 });
});
