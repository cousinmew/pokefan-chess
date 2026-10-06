// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';

type KC = { puzzleAnswer(): string | null; puzzlePhase(): string; seedEncounters(n: number): number; campaign(): { caught: Record<string, number>; team: Record<string, string> } };
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());

async function solve(page: Page) {
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  for (let i = 0; i < 6 && (await phase(page)) !== 'over'; i++) {
    const uci = (await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzleAnswer()))!;
    await page.click(`[data-square="${uci.slice(0, 2)}"]`);
    await page.click(`[data-square="${uci.slice(2, 4)}"]`);
    if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
    await expect.poll(() => phase(page), { timeout: 8000 }).not.toMatch(/checking|reply/);
  }
}

test.use({ viewport: { width: 360, height: 640 } });

test('Oak starter, Route 1 tall grass, an encounter, and a caught Pokémon as a skin vs Computer', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('set-anim').selectOption('off');
  await page.getByTestId('back').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('starter-charmander').click();
  await expect(page.getByTestId('route-viridian-forest')).toBeDisabled();
  await page.getByTestId('route-route-1').click();
  await page.getByTestId('walk-grass').click();
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.seedEncounters(7));
  await solve(page);
  await expect(page.getByTestId('encounter-text')).toHaveText(/^Wild (PIDGEY|RATTATA) appeared!$/, { timeout: 5000 });
  await page.getByTestId('throw-ball').click();
  await expect(page.getByTestId('encounter-text')).toHaveText(/^(Gotcha! (PIDGEY|RATTATA) was caught!|Oh no! (PIDGEY|RATTATA) broke free!)$/);
  const caught = (await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.campaign())).caught;
  const text = (await page.getByTestId('encounter-text').textContent())!;
  if (text.startsWith('Gotcha')) expect((caught.pidgey ?? 0) + (caught.rattata ?? 0)).toBe(1);
  // My Team: Charmander as queen, then it plays queen vs Computer.
  await page.getByTestId('to-map').click();
  await page.getByTestId('open-team').click();
  await page.getByTestId('team-q').selectOption('charmander');
  await page.getByTestId('back').click();
  await page.getByTestId('back').click();
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-1').click();
  await expect(page.locator('[data-square="d1"] img')).toHaveAttribute('alt', 'CHARMANDER');
  await expect(page.locator('[data-square="d8"] img')).toHaveAttribute('alt', 'NIDOQUEEN');
});

test('Pokédex counts the starter; Two Players keeps the default teams', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:campaign', JSON.stringify({ starter: 'squirtle', caught: { squirtle: 1 }, routes: {}, team: { k: 'squirtle' } })));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await expect(page.locator('.map-top p')).toHaveText(/^Pokédex: 1 of \d+ caught$/);
  await page.getByTestId('back').click();
  await page.getByTestId('two-players').click();
  await expect(page.locator('[data-square="e1"] img')).toHaveAttribute('alt', 'PIKACHU');
});
