// SPDX-License-Identifier: AGPL-3.0-only
// C8 (§B20 items 1 to 3): trainers in the level pickers, on the battle screen, and titles on the name plates.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
  await expect(page.getByTestId('plate-top')).toContainText(/GIOVANNI\s*·\s*Boss/);
  await expect(page.getByTestId('plate-bottom')).toContainText(/JADE\s*·\s*Trainer/);
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
  // The opponent's reaction is in their bar (change A).
  await expect(page.getByTestId('plate-top-msg')).toHaveText('Oh no!');
});

// Change B: each computer trainer brings their own team.
const TEAMS = JSON.parse(readFileSync('src/data/trainer-teams.json', 'utf8')).trainers as Record<string, { team: Record<string, string> }>;
const KANTO = JSON.parse(readFileSync('src/data/kanto.json', 'utf8')) as { species: Record<string, { name: string; move: string }>; moves: Record<string, { name: string }> };

test('all 8 levels show their trainer and team preview (King, Queen, Pawn)', async ({ page }) => {
  await seed(page);
  await hub(page);
  for (const side of ['red', 'rocket'] as const) {
    await page.getByTestId('vs-computer').click();
    await page.getByTestId(`team-${side}`).click();
    for (const n of [1, 2, 3, 4]) {
      const sprite = (await page.getByTestId(`level-${n}`).locator('.opponent-sprite').getAttribute('data-trainer'))!;
      const t = TEAMS[sprite]!.team;
      const shown = await page.getByTestId(`level-${n}`).getByTestId('loadout').locator('img').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.species));
      expect(shown, `${side} ${n} ${sprite}`).toEqual([sprite === 'blue-gen1' ? 'blastoise' : t.k, t.q, t.p]);
    }
    await page.getByTestId('back').click();
  }
});

test('a game puts the trainer team on the board, and its capture uses that species move', async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'full', battleStyle: 'classic' })));
  await hub(page);
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-3').click();
  await page.getByTestId('intro').click();
  const at = (sq: string) => page.locator(`[data-square="${sq}"]`);
  await expect(at('e8')).toHaveAttribute('aria-label', /MEOWTH/);
  await expect(at('d8')).toHaveAttribute('aria-label', /ARBOK/);
  await expect(at('a7')).toHaveAttribute('aria-label', /EKANS/);
  await expect(at('b8')).toHaveAttribute('aria-label', /LICKITUNG/);
  // Black's only legal move is Kxg7: the Rocket king (MEOWTH) attacks with its own move.
  await page.evaluate(() => (window as unknown as { __kc: { loadFen(f: string): string } }).__kc.loadFen('7k/6Q1/8/8/8/8/8/4K3 b - - 0 1'));
  const move = KANTO.moves[KANTO.species.meowth!.move]!.name;
  await expect(page.getByTestId('battle-text')).toContainText(`MEOWTH used ${move}`, { timeout: 8000 });
});

test('playing Rocket: Brock brings Geodude and Onix', async ({ page }) => {
  await seed(page);
  await hub(page);
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-rocket').click();
  await page.getByTestId('level-2').click();
  await page.getByTestId('intro').click();
  await expect(page.locator('[data-square="d1"]')).toHaveAttribute('aria-label', /ONIX/);
  await expect(page.locator('[data-square="a2"]')).toHaveAttribute('aria-label', /GEODUDE/);
  await expect(page.getByTestId('plate-top')).toContainText('BROCK');
});
