// SPDX-License-Identifier: AGPL-3.0-only
// C8 (§B20 items 1 to 3): trainers in the level pickers, on the battle screen, and titles on the name plates.
import { expect, test, type Page } from '@playwright/test';

const seed = (page: Page, cart = 'blue') =>
  page.addInitScript((c) => {
    localStorage.setItem('kc:v1:cartridge', JSON.stringify(c));
    localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'JADE', starter: 'charmander', introSeen: true, caught: { charmander: 1 }, badges: [] }));
  }, cart);
const ladder = (page: Page, prefix: string) => Promise.all([1, 2, 3, 4].map((n) => page.getByTestId(`${prefix}${n}`).locator('.opponent-sprite').getAttribute('data-trainer')));
const hub = async (page: Page) => {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
};

test('BLUE level picker: Team Rocket when you play Red, Youngster to RED when you play Rocket, you on the other side', async ({ page }) => {
  await seed(page);
  await hub(page);
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  expect(await ladder(page, 'level-')).toEqual(['rocketgrunt', 'rocketgruntf', 'jessiejames-gen1', 'giovanni-gen1']);
  await expect(page.getByTestId('level-4')).toContainText('GIOVANNI');
  await expect(page.getByTestId('level-4')).toContainText('★★★★');
  await expect(page.getByTestId('picker-me').locator('.faceoff-sprite')).toHaveAttribute('data-trainer', 'red-gen1');
  await page.getByTestId('back').click();
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-rocket').click();
  expect(await ladder(page, 'level-')).toEqual(['youngster-gen1', 'brock-gen1', 'blue-gen1', 'red-gen1']);
  await expect(page.getByTestId('level-4')).toContainText('Champion');
});

test('YELLOW level picker shows the trainers too @both', async ({ page }) => {
  await seed(page, 'yellow');
  await hub(page);
  await page.getByTestId('yellow-play').click();
  expect(await ladder(page, 'yellow-level-')).toEqual(['rocketgrunt', 'rocketgruntf', 'jessiejames-gen1', 'giovanni-gen1']);
  await expect(page.getByTestId('picker-me')).toBeVisible();
});

test('name plates carry titles and stay on screen at 360x640 @both', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await seed(page);
  await hub(page);
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-4').click();
  await page.getByTestId('intro').click();
  await expect(page.getByTestId('plate-top')).toContainText('GIOVANNI · Boss');
  await expect(page.getByTestId('plate-bottom')).toContainText('JADE · Trainer');
  for (const id of ['plate-top', 'plate-bottom']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.y, id).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, id).toBeLessThanOrEqual(640);
  }
});

test('both trainers stand in the battle with a reaction; the battle is no longer than before', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'full', battleStyle: 'anime' })));
  await page.goto('./?debug=1&start=two');
  const kc = (u: string) => page.evaluate((x) => (window as unknown as { __kc: { move(u: string): string } }).__kc.move(x), u);
  await kc('e2e4');
  await page.waitForTimeout(100);
  await kc('d7d5');
  await page.waitForTimeout(100);
  await kc('e4d5');
  await expect(page.getByTestId('battle')).toBeVisible();
  await expect(page.locator('.t-near img')).toHaveAttribute('src', /red-gen1/);
  await expect(page.locator('.t-far img')).toHaveAttribute('src', /blue-gen1/);
  await expect(page.locator('.t-near .say')).toHaveText('Go!');
  await expect(page.locator('.t-far .say')).toHaveText('Oh no!');
  const len = await page.evaluate(() => (window as unknown as { __kc: { bench(): { totalMs: number } } }).__kc.bench().totalMs);
  expect(len).toBe(1900);
});

test('Quick mode: no battle screen, the reactions show on the plates', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'quick' })));
  await page.goto('./?debug=1&start=two');
  const kc = (u: string) => page.evaluate((x) => (window as unknown as { __kc: { move(u: string): string } }).__kc.move(x), u);
  await kc('e2e4');
  await page.waitForTimeout(100);
  await kc('d7d5');
  await page.waitForTimeout(100);
  await kc('e4d5');
  await expect(page.locator('.plate[data-color="w"] .plate-say')).toHaveText('Go!');
  await expect(page.locator('.plate[data-color="b"] .plate-say')).toHaveText('Oh no!');
});
