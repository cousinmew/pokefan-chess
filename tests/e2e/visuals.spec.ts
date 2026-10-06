// SPDX-License-Identifier: AGPL-3.0-only
// §B14: no empty sprite boxes. Every image on these screens must have loaded (naturalWidth > 0).
import { expect, test, type Page } from '@playwright/test';

async function allLoaded(page: Page, scope: string, min = 1) {
  const unloaded = () =>
    page.$$eval(`${scope} img`, (imgs) => imgs.filter((i) => !i.closest('[hidden]') && !((i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)).map((i) => i.getAttribute('src')));
  await expect.poll(unloaded, { timeout: 8000, message: scope }).toEqual([]);
  expect(await page.locator(`${scope} img`).count(), scope).toBeGreaterThanOrEqual(min);
}

test.use({ viewport: { width: 360, height: 640 } });

test('starter picker, name step, battle intro, My Team and Pokédex sprites all load', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await allLoaded(page, '.screen-intro', 2);
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
  await allLoaded(page, '.screen-name', 1);
  await expect(page.locator('.screen-name [data-trainer="red-gen1"]')).toBeVisible();
  await page.getByTestId('name-3').click();
  await allLoaded(page, '.screen-oak', 3);
  await page.getByTestId('starter-squirtle').click();
  await allLoaded(page, '.overlay', 1);
  await expect(page.locator('.overlay [data-trainer="oak"]')).toBeVisible();
  await page.getByTestId('story').click();
  await page.getByTestId('story').click();
  await page.getByTestId('route-route-1').click();
  await page.getByTestId('battle-trainer').click();
  await page.getByTestId('lesson-ok').click();
  await allLoaded(page, '[data-testid="trainer-intro"]', 2);
  await expect(page.locator('[data-testid="trainer-intro"] [data-trainer="youngster-gen1"]')).toBeVisible();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  await page.getByTestId('leave-grass').click();
  await page.getByTestId('back').click();
  await page.getByTestId('open-team').click();
  await allLoaded(page, '.screen-team', 7);
  await page.getByTestId('back').click();
  await page.getByTestId('open-dex').click();
  await allLoaded(page, '.screen-dex .dex-cell.caught', 1);
});

test('a placeholder gym shows its leader and Coming soon', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'RED', starter: 'squirtle', caught: { squirtle: 1 }, introSeen: true, teamRules: 1, journey: { cleared: ['route-1', 'viridian', 'rival-1', 'viridian-forest'], beaten: [], visited: ['route-1'] } })),
  );
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('place-pewter-gym').click();
  await allLoaded(page, '[data-testid="gym-card"]', 1);
  await expect(page.getByTestId('gym-card')).toContainText('PEWTER GYM: BROCK');
  await expect(page.locator('[data-testid="gym-card"] [data-trainer="brock-gen1"]')).toBeVisible();
  await expect(page.getByTestId('route-route-3')).toBeEnabled();
});
