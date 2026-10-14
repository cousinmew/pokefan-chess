// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';
import { COACH_EN, passCoach } from './coach';

type KC = { puzzleAnswer(): string | null; puzzlePhase(): string; seedEncounters(n: number): number; campaign(): { caught: Record<string, number>; team: Record<string, string> } };
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());

async function solve(page: Page) {
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  for (let i = 0; i < 6 && (await phase(page)) !== 'review'; i++) {
    const uci = (await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzleAnswer()))!;
    await page.click(`[data-square="${uci.slice(0, 2)}"]`);
    await page.click(`[data-square="${uci.slice(2, 4)}"]`);
    if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
    await expect.poll(() => phase(page), { timeout: 8000 }).not.toMatch(/checking|reply|solved/); // pacing: the solve beat ('solved') comes before the review
  }
  // The review moment (§B15) waits for Continue before the encounter.
  await page.getByTestId('review-continue').click();
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
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
  await page.getByTestId('name-1').click();
  await page.getByTestId('starter-charmander').click();
  // Oak's line about your partner, then BLUE slides in for one line.
  await page.getByTestId('story').click();
  await page.getByTestId('story').click();
  // W5: only the next locked place shows (as ???); the rest fold into one line.
  await expect(page.getByTestId('route-viridian-forest')).toHaveCount(0);
  await expect(page.getByTestId('map-more')).toBeVisible();
  await page.getByTestId('route-route-1').click();
  await page.getByTestId('warmup-skip').click(); // Oak's warm-up (W5): covered in progress.spec.ts
  await page.getByTestId('walk-grass').click();
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.seedEncounters(7));
  // The save's first puzzle: its set up move waits for the coach marks (fix, 14 Oct).
  expect(await passCoach(page)).toEqual(COACH_EN);
  await solve(page);
  await expect(page.getByTestId('encounter-text')).toHaveText(/^Wild (PIDGEY|RATTATA) appeared!$/, { timeout: 5000 });
  await page.getByTestId('throw-ball').click();
  // J3: the ball's beat (CATCH_BEAT_MS) comes before the result; the way back names the route (J11).
  await expect(page.locator('[data-testid="encounter"].throwing')).toBeVisible();
  await expect(page.getByTestId('encounter-text')).toHaveText(/^(Gotcha! (PIDGEY|RATTATA) was caught!|Oh no! (PIDGEY|RATTATA) broke free!)$/);
  const caught = (await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.campaign())).caught;
  const text = (await page.getByTestId('encounter-text').textContent())!;
  if (text.startsWith('Gotcha')) expect((caught.pidgey ?? 0) + (caught.rattata ?? 0)).toBe(1);
  if (text.startsWith('Gotcha')) await expect(page.getByTestId('enc-gains').last()).toHaveText('New! Pokédex 2/151');
  // My Team: the king is your starter's family (§B14), so Charmander plays king vs Computer.
  await expect(page.getByTestId('to-map')).toHaveText('Back to ROUTE 1');
  await page.getByTestId('to-map').click();
  await page.getByTestId('back').click();
  await page.getByTestId('open-team').click();
  await expect(page.getByTestId('team-q')).toBeDisabled();
  await expect(page.getByTestId('why-q')).toHaveText('The queen opens after your first badge.');
  await page.getByTestId('team-k').selectOption('charmander');
  await page.getByTestId('back').click();
  await page.getByTestId('back').click();
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-1').click();
  await expect(page.locator('[data-square="e1"] img')).toHaveAttribute('alt', 'CHARMANDER');
  await expect(page.locator('[data-square="d1"] img')).toHaveAttribute('alt', 'CHARMANDER'); // a new BLUE player's queen (§B18 item 5)
  await expect(page.locator('[data-square="e8"] img')).toHaveAttribute('alt', 'RATICATE'); // the Grunt's team at level 1 (change B)
});

test('a C2 save opens on the map; Pokédex counts the starter; Two Players keeps the default teams', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:campaign', JSON.stringify({ starter: 'squirtle', caught: { squirtle: 1 }, routes: {}, team: { k: 'squirtle' } })));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await expect(page.locator('.map-strip p').first()).toHaveText('Pokédex: 1 of 151 caught'); // W5: in the map's top strip
  await page.getByTestId('back').click();
  await page.getByTestId('two-players').click();
  await expect(page.locator('[data-square="e1"] img')).toHaveAttribute('alt', 'PIKACHU');
});
