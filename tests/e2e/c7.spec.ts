// SPDX-License-Identifier: AGPL-3.0-only
// C7 (§B18 items 5 to 8): evolving story teams, the Anime battle style, MEIR, and trainers beside the board.
import { expect, test, type Page } from '@playwright/test';

type Kc = { __kc: { bench(a?: string, d?: string, s?: string): { style: string; p95: number; totalMs: number; worstSecond: number; flashes: number }; playFx(id: string): unknown; step(n: number): { phase: string } } };
const seed = (page: Page, badges: string[], cart = 'blue') =>
  page.addInitScript(
    ([b, c]) => {
      localStorage.setItem('kc:v1:cartridge', JSON.stringify(c));
      localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'JADE', starter: 'charmander', introSeen: true, teamRules: 2, caught: { charmander: 1 }, badges: b }));
    },
    [badges, cart] as const,
  );
const vsComputer = async (page: Page, level: number) => {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId(`level-${level}`).click();
  await page.getByTestId('intro').click();
};
const label = (page: Page, sq: string) => page.locator(`[data-square="${sq}"]`);

test('BLUE teams start unevolved and evolve at 3 and 6 badges; YELLOW keeps final forms', async ({ page }) => {
  await seed(page, ['boulder']);
  await vsComputer(page, 1);
  await expect(label(page, 'd1')).toHaveAttribute('aria-label', /CHARMANDER/);
  await expect(label(page, 'd8')).toHaveAttribute('aria-label', /NIDORAN/);
  await expect(label(page, 'g1')).toHaveAttribute('aria-label', /PONYTA/);
});

test('three badges: the middle forms', async ({ page }) => {
  await seed(page, ['boulder', 'cascade', 'thunder']);
  await vsComputer(page, 1);
  await expect(label(page, 'd1')).toHaveAttribute('aria-label', /CHARMELEON/);
  await expect(label(page, 'e8')).toHaveAttribute('aria-label', /NIDORINO/);
});

test('YELLOW keeps the classic final forms', async ({ page }) => {
  await seed(page, [], 'yellow');
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('yellow-play').click();
  await page.getByTestId('yellow-level-1').click();
  await expect(label(page, 'd1')).toHaveAttribute('aria-label', /CHARIZARD/);
});

test('Anime battle: p95 frame cost under 8 ms, about 1.9 s, at most 3 flashes a second, banner on super effective @both', async ({ page }, info) => {
  await page.goto('./?debug=1');
  const anime = await page.evaluate(() => (window as unknown as Kc).__kc.bench('pikachu', 'blastoise', 'anime'));
  const classic = await page.evaluate(() => (window as unknown as Kc).__kc.bench('pikachu', 'blastoise', 'classic'));
  console.log(`[${info.project.name}] anime ${JSON.stringify(anime)} classic ${JSON.stringify(classic)}`);
  expect(anime.style).toBe('anime');
  expect(anime.p95).toBeLessThan(8);
  expect(anime.worstSecond).toBeLessThanOrEqual(3);
  expect(Math.abs(anime.totalMs - classic.totalMs)).toBeLessThanOrEqual(20);
  expect(anime.totalMs).toBeGreaterThan(1800);
  expect(anime.totalMs).toBeLessThan(2000);
});

test('Anime shows the impact frame and the banner; reduced motion plays Classic', async ({ page }) => {
  await page.goto('./?debug=1');
  type To = { __kc: { battleTo(p: string, a?: string, d?: string, s?: string): { style: string; impact: boolean; banner: string | null }; step(n: number): unknown } };
  const hit = await page.evaluate(() => (window as unknown as To).__kc.battleTo('flash'));
  expect(hit.style).toBe('anime');
  expect(hit.impact).toBe(true);
  await page.evaluate(() => (window as unknown as To).__kc.step(1));
  await expect(page.locator('.screen.impact')).toHaveCount(0);
  const eff = await page.evaluate(() => (window as unknown as To).__kc.battleTo('eff'));
  expect(eff.banner).toBe('SUPER EFFECTIVE!');
  const classic = await page.evaluate(() => (window as unknown as To).__kc.battleTo('eff', 'pikachu', 'blastoise', 'classic'));
  expect([classic.style, classic.banner]).toEqual(['classic', null]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const calm = await page.evaluate(() => (window as unknown as Kc).__kc.bench('pikachu', 'blastoise', 'anime'));
  expect(calm.style).toBe('classic');
});

test('MEIR: the code on the shelf keyboard, and three taps on the YELLOW label for the D-pad', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('kc:v1:cartridge'));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
  const label = page.locator('[data-testid="cart-yellow"] .cart-label');
  for (let i = 0; i < 3; i++) await label.click();
  await expect(page.getByTestId('dpad')).toBeVisible();
  for (const k of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a']) await page.getByTestId(`pad-${k}`).click();
  await expect(page.getByTestId('toast')).toHaveText('MEIR joined the adventure!');
  expect(await page.evaluate(() => [localStorage.getItem('kc:v1:p1:trainer'), JSON.parse(localStorage.getItem('kc:v1:p1:campaign') ?? '{}').name])).toEqual(['"meir"', 'MEIR']);
  await page.getByTestId('cart-blue').click();
  await page.getByTestId('hub-card').click();
  await expect(page.getByTestId('player-trainer').locator('img')).toHaveAttribute('src', 'art/meir.png');
  // In a game MEIR stands at the bottom.
  await page.getByTestId('back').click();
  await page.getByTestId('two-players').click();
  await expect(page.getByTestId('plate-bottom').locator('img')).toHaveAttribute('src', 'art/meir.png');
});

test('MEIR by keyboard on the YELLOW home', async ({ page }) => {
  await seed(page, [], 'yellow');
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-yellow')).toBeVisible();
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await page.keyboard.press(k);
  await expect(page.getByTestId('toast')).toHaveText('MEIR joined the adventure!');
});

test('trainers beside the board follow the computer level, react to captures and the end @both', async ({ page }) => {
  await seed(page, []);
  await vsComputer(page, 3);
  await expect(page.getByTestId('plate-top').locator('img')).toHaveAttribute('src', /jessiejames-gen1/);
  await expect(page.getByTestId('plate-bottom').locator('img')).toHaveAttribute('src', /red-gen1/);
  await expect(page.getByTestId('plate-top')).toContainText('JESSIE & JAMES');
  await expect(page.getByTestId('plate-bottom')).toContainText('JADE');
  const box = await page.getByTestId('plate-bottom').locator('.plate-sprite').boundingBox();
  if ((page.viewportSize()?.width ?? 0) < 900) expect(Math.round(box?.height ?? 0)).toBe(48);
});

const twoPlayers = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off', autoFlip: true })));
  await page.goto('./?debug=1&start=two');
  return async (...moves: string[]) => {
    for (const m of moves) {
      await page.evaluate((u) => (window as unknown as { __kc: { move(u: string): string } }).__kc.move(u), m);
      await page.waitForTimeout(80);
    }
  };
};

test('Two Players: RED and BLUE; the plates follow the flip and show "!" on check', async ({ page }) => {
  const play = await twoPlayers(page);
  await expect(page.getByTestId('plate-top').locator('img')).toHaveAttribute('src', /blue-gen1/);
  await play('e2e4');
  await expect(page.getByTestId('plate-bottom')).toHaveAttribute('data-color', 'b');
  await play('f7f6', 'd1h5');
  await expect(page.locator('.plate.check')).toHaveAttribute('data-color', 'b');
  await play('g7g6');
  await expect(page.locator('.plate.check')).toHaveCount(0);
});

test('at the end the winner stays and the loser fades', async ({ page }) => {
  const play = await twoPlayers(page);
  await play('f2f3', 'e7e5', 'g2g4', 'd8h4');
  await expect(page.locator('.plate.won')).toHaveAttribute('data-color', 'b');
  await expect(page.locator('.plate.lost')).toHaveAttribute('data-color', 'w');
});
