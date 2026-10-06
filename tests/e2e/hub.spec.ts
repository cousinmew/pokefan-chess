// SPDX-License-Identifier: AGPL-3.0-only
// §B16 gate: every tile's title and subtitle visible without hover at phone and desktop sizes; each "?" opens its
// manual page; each "Try it" lands in its mode; Continue resumes a journey save and a game in progress.
import { expect, test, type Page } from '@playwright/test';

const TILES = ['kanto', 'training', 'quick-battle', 'vs-computer', 'two-players', 'play-online', 'hub-dex', 'hub-team', 'hub-card', 'settings', 'share'];
const HELP: Record<string, string> = { journey: 'journey', training: 'training', battle: 'battle', computer: 'computer', two: 'two', online: 'online', dex: 'catching', team: 'pieces' };

async function hub(page: Page, init?: () => void) {
  if (init) await page.addInitScript(init);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
}

for (const size of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
  test(`hub at ${size.width}x${size.height}: every tile title and subtitle shows without hover; each ? opens its page`, async ({ page }) => {
    await page.setViewportSize(size);
    await hub(page);
    for (const id of TILES) {
      const tile = page.getByTestId(id);
      await expect(tile.locator('.tile-title'), id).toBeVisible();
      await expect(tile.locator('.tile-sub'), id).toBeVisible();
      expect((await tile.locator('.tile-sub').textContent())!.length, id).toBeGreaterThan(10);
    }
    // One column at every width (§B16 addendum): every tile starts at the same x.
    const boxes = await Promise.all(TILES.map((id) => page.getByTestId(id).boundingBox()));
    expect(new Set(boxes.map((b) => Math.round(b!.x))).size).toBe(1);
    // No mascots; item icons load; the five original pixel icons are drawn; one static Oak in the Journey header.
    await expect(page.locator('.tile-mascot, .tile img[data-species]')).toHaveCount(0);
    // Item icons come from one preloaded sheet (load fix).
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hubSheet)).toBe('ready');
    expect(await page.locator('.screen-title .item-icon.sheet-icon').count()).toBeGreaterThanOrEqual(7 + 8);
    for (const icon of ['two-balls', 'link-cable', 'dex', 'six-balls', 'gear']) await expect(page.locator(`.tile svg[data-icon="${icon}"]`)).toHaveCount(1);
    await expect(page.locator('.screen-title [data-trainer="oak"]')).toHaveCount(1);
    await expect(page.locator('.hub-zone').first().locator('[data-trainer="oak"]')).toBeVisible();
    await expect(page.locator('.screen-title .slide-in')).toHaveCount(0);
    for (const [tile, pageId] of Object.entries(HELP)) {
      await page.getByTestId(`help-${tile}`).click();
      await expect(page.getByTestId(`manual-page-${pageId}`)).toBeVisible();
      await expect(page.locator('.manual-page:not([hidden])')).toHaveCount(1);
      await page.getByTestId('back').click();
    }
  });
}

test.use({ viewport: { width: 360, height: 640 } });

test('each manual page has a demo, 3 rules, and a Try it that lands in its mode', async ({ page }) => {
  const lands: Record<string, (p: Page) => Promise<void>> = {
    journey: (p) => expect(p.locator('[data-testid="screen-intro"], [data-testid="screen-map"]')).toBeVisible(),
    training: (p) => expect(p.getByTestId('screen-training')).toBeVisible(),
    battle: (p) => expect(p.getByTestId('screen-game')).toBeVisible(),
    computer: (p) => expect(p.getByTestId('team-red')).toBeVisible(),
    two: (p) => expect(p.getByTestId('screen-game')).toBeVisible(),
    online: (p) => expect(p.getByTestId('screen-online')).toBeVisible(),
    pieces: (p) => expect(p.getByTestId('team-k')).toBeVisible(),
    catching: (p) => expect(p.locator('[data-testid="screen-intro"], [data-testid="screen-map"]')).toBeVisible(),
  };
  for (const [pageId, check] of Object.entries(lands)) {
    await hub(page);
    await page.getByTestId('how-to').click();
    await page.getByTestId(`manual-tab-${pageId}`).click();
    const shown = page.getByTestId(`manual-page-${pageId}`);
    await expect(shown).toBeVisible();
    await expect(shown.locator('li')).toHaveCount(3);
    await expect(shown.locator('[data-testid="mini-board"], [data-testid="fx-demo"], .legend').first()).toBeVisible();
    await shown.getByTestId('manual-try').click();
    await check(page);
  }
});

test('Continue resumes a journey save', async ({ page }) => {
  await hub(page, () => {
    localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'JADE', starter: 'charmander', introSeen: true, teamRules: 2, caught: { charmander: 1 }, journey: { cleared: ['route-1'], beaten: [], visited: [] } }));
    localStorage.setItem('kc:v1:last', JSON.stringify('journey'));
  });
  await expect(page.getByTestId('continue')).toContainText('Kanto Journey: VIRIDIAN CITY');
  await expect(page.getByTestId('hub-card-mini')).toContainText('JADE');
  await expect(page.getByTestId('kanto')).toContainText('0/8 badges');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
});

test('Continue resumes a game in progress', async ({ page }) => {
  await hub(page);
  await page.getByTestId('two-players').click();
  await page.getByTestId('intro').click();
  await page.click('[data-square="e2"]');
  await page.click('[data-square="e4"]');
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('continue')).toContainText('Your game in progress');
  await page.getByTestId('continue').click();
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp');
});
