// SPDX-License-Identifier: AGPL-3.0-only
// §B24: START replaces Menu, move lines go to the mover's plate, plate names and titles on one line.
import { expect, test, type Page } from '@playwright/test';

const boxOf = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

/** A guest game vs Jessie & James (level 3), as in the owner's screenshot. */
async function guestVsJessie(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off', legend: 'on' })));
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('start-play').click();
  await page.getByTestId('quick-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-3').click();
  await page.getByTestId('intro').click();
}

for (const [w, h] of [[1440, 900], [360, 640]] as const) {
  test(`top bar and plates at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: w, height: h });
    await guestVsJessie(page);
    await expect(page.getByTestId('menu')).toHaveCount(0);
    const start = await boxOf(page, '[data-testid="start-button"]');
    const board = await boxOf(page, '#board');
    const turn = await boxOf(page, '[data-testid="turn"]');
    const top = await boxOf(page, '[data-testid="plate-top"]');
    expect(start.height).toBeGreaterThanOrEqual(44);
    if (w > h) {
      // Wide: START tops the side column, as wide as it, above the opponent's plate.
      expect(start.x).toBeGreaterThanOrEqual(board.x + board.width);
      expect(Math.abs(start.width - top.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(start.x - top.x)).toBeLessThanOrEqual(1);
      expect(start.y + start.height).toBeLessThanOrEqual(top.y + 1);
    } else {
      // Narrow: top right of the top bar.
      const bar = await boxOf(page, 'header.game-header');
      expect(Math.abs(start.x + start.width - (bar.x + bar.width))).toBeLessThanOrEqual(2);
      expect(start.y).toBeLessThan(board.y);
    }
    // The status text stays centred over the board.
    expect(Math.abs(turn.x + turn.width / 2 - (board.x + board.width / 2))).toBeLessThanOrEqual(w > h ? 4 : 40);
    // Name and title on one line, the title whole, no stray separator.
    for (const plate of ['plate-top', 'plate-bottom']) {
      const name = page.getByTestId(plate).locator('.plate-name');
      const b = await name.locator('b').boundingBox();
      const t = await name.locator('.plate-title').boundingBox();
      const who = await page.getByTestId(plate).locator('.plate-who').boundingBox();
      expect(Math.abs(b!.y + b!.height - (t!.y + t!.height))).toBeLessThanOrEqual(3);
      expect(t!.x + t!.width).toBeLessThanOrEqual(who!.x + who!.width + 1);
      expect(await name.locator('.plate-title').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    await expect(page.getByTestId('plate-top')).toContainText('JESSIE & JAMES');
    await expect(page.getByTestId('plate-top')).toContainText('Team Rocket');
    await expect(page.getByTestId('plate-bottom')).toContainText('Guest');
    await expect(page.getByTestId('plate-bottom')).toContainText('Trainer');
    // Your move: your plate. The computer's reply: its own plate, never yours.
    await page.click('[data-square="e2"]');
    await page.click('[data-square="e4"]');
    await expect(page.getByTestId('plate-top-msg')).toContainText(/ to [a-h][1-8]/, { timeout: 15_000 });
    expect(await page.getByTestId('text-main').textContent()).not.toMatch(/(MEOWTH|ARBOK|WEEZING|LICKITUNG|VICTREEBEL|EKANS) to /);
    await page.screenshot({ path: `docs/layout/b24-${w}x${h}.png` });
  });
}
