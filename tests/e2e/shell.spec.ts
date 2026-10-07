// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test.describe('360x640', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('@live splash, Battle!, board in 2 taps; one capture plays; zero console errors', async ({ page }) => {
    const errors = watchErrors(page);
    const t0 = Date.now();
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('quick-battle').click();
    await expect(page.getByTestId('intro')).toBeHidden();
    await page.click('[data-square="e2"]');
    await expect(page.locator('[data-square="e2"]')).toHaveClass(/selected/);
    console.log(`T-1 load to interactive board (2 taps, incl. 1.2 s intro): ${Date.now() - t0} ms`);
    await page.evaluate(() => (window as unknown as { __kc: { loadFen(f: string): string } }).__kc.loadFen('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'));
    await page.click('[data-square="e4"]');
    await page.click('[data-square="d5"]');
    await expect(page.getByTestId('battle-text')).toContainText('EEVEE used QUICK ATTACK!');
    await expect(page.locator('[data-square="d5"] img')).toHaveAttribute('alt', 'EEVEE', { timeout: 6000 });
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  test('storage blocked: team select, level, intro, computer moves first as Red', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('blocked', 'SecurityError'); } });
    });
    const errors = watchErrors(page);
    await page.goto('./');
    await page.getByTestId('screen-splash').click();
    // With storage blocked nothing is remembered, so the cartridge shelf shows: pick BLUE.
    await page.getByTestId('cart-blue').click();
    // The Gen 1 style start menu follows (change C): CONTINUE goes home.
    await page.getByTestId('start-continue').click();
    await page.getByTestId('vs-computer').click();
    await page.getByTestId('team-rocket').click();
    await page.getByTestId('level-1').click();
    await page.getByTestId('intro').click();
    await expect(page.getByTestId('turn')).toHaveText('TEAM ROCKET to move', { timeout: 5000 });
    expect(await page.locator('.sq').first().getAttribute('data-square')).toBe('h1');
    await expect(page.getByTestId('takeback')).toBeVisible();
    await page.getByTestId('start-button').click(); // START replaced Menu (§B24 item 1)
    await page.getByTestId('start-menu-quit').click();
    await page.getByTestId('start-continue').click(); // the real start menu, then home
    await page.getByTestId('how-to').click();
    await expect(page.getByTestId('screen-howto')).toContainText('Bishop, light squares');
    expect(errors).toEqual([]);
  });

  test('settings persist and Continue resumes a game', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('start-continue').click();
    await page.getByTestId('settings').click();
    await page.getByTestId('set-anim').selectOption('off');
    await page.getByTestId('set-glyphs').uncheck();
    await page.getByTestId('back').click();
    await page.getByTestId('two-players').click();
    await page.getByTestId('intro').click();
    await page.click('[data-square="e2"]');
    await page.click('[data-square="e4"]');
    await expect(page.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp');
    await expect(page.locator('.glyph')).toHaveCount(0);
    await page.reload();
    await page.getByTestId('screen-splash').click();
    // CONTINUE on the start menu resumes the game in progress (change C).
    await page.getByTestId('start-continue').click();
    await expect(page.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp');
    await page.getByTestId('start-button').click(); // START replaced Menu (§B24 item 1)
    await page.getByTestId('start-menu-quit').click();
    await page.getByTestId('start-option').click(); // SAVE & QUIT lands on the start menu: its OPTION
    await expect(page.getByTestId('set-anim')).toHaveValue('off');
  });
});

test('music: title loop on the title screen, board loop in a game, music slider defaults to 30%', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  const cue = () => page.evaluate(() => (JSON.parse((window as unknown as { __kc: { dumpState(): string } }).__kc.dumpState()) as { music: string | null }).music);
  expect(await cue()).toBe('title');
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('set-music')).toHaveValue('0.3');
  await page.getByTestId('back').click();
  await page.getByTestId('two-players').click();
  expect(await cue()).toBe('board');
  expect(errors).toEqual([]);
});
