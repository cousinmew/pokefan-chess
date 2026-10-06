// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';

type Save = { badges: string[]; caught: Record<string, number>; journey: { cleared: string[] }; champion: boolean; hallOfFame: unknown[] };
const kc = <T>(page: Page, fn: string, arg?: unknown) => page.evaluate(([f, a]) => (window as unknown as { __kc: Record<string, (x?: unknown) => unknown> }).__kc[f as string]!(a) as T, [fn, arg] as const);

const SAVE = { v: 2, name: 'RED', starter: 'squirtle', introSeen: true, teamRules: 2, caught: { squirtle: 1 }, journey: { cleared: [], beaten: [], visited: [] } };

async function open(page: Page, save: object = SAVE) {
  await page.addInitScript((s) => {
    localStorage.setItem('kc:v1:campaign', JSON.stringify(s));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ anim: 'off', v: 2 }));
  }, save);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
}

/** Plays whatever the Journey shows (stories, cards, choices, puzzles) until the map is back with nothing over it. */
async function playThrough(page: Page) {
  // The Elite Four is four battles in one go, so allow plenty of steps.
  for (let i = 0; i < 1500; i++) {
    const vis = (id: string) => page.getByTestId(id).first().isVisible();
    if (await vis('story')) await page.getByTestId('story').first().click();
    else if (await vis('goal-card')) await page.getByTestId('goal-card').click();
    else if (await vis('trainer-intro')) await page.getByTestId('trainer-intro').click();
    else if (await vis('lesson-ok')) await page.getByTestId('lesson-ok').click();
    else if (await page.locator('[data-testid^="choose-"]').first().isVisible()) await page.locator('[data-testid^="choose-"]').first().click();
    else if ((await kc<string>(page, 'puzzlePhase')) === 'player' && (await page.getByTestId('screen-game').isVisible())) {
      const uci = (await kc<string>(page, 'puzzleAnswer'))!;
      await page.click(`[data-square="${uci.slice(0, 2)}"]`);
      await page.click(`[data-square="${uci.slice(2, 4)}"]`);
      if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
    } else if (await vis('screen-map')) return;
    await page.waitForTimeout(150);
  }
  const state = await page.evaluate(() => ({ phase: (window as unknown as { __kc: { puzzlePhase(): string } }).__kc.puzzlePhase(), screens: [...document.querySelectorAll('[data-testid^="screen-"]')].map((e) => e.getAttribute('data-testid')), overlay: document.querySelector('.overlay:not([hidden])')?.textContent?.slice(0, 120), text: document.querySelector('[data-testid="text-main"]')?.textContent, banner: document.querySelector('[data-testid="puzzle-banner"]')?.textContent, beaten: (window as unknown as { __kc: { journey(): { journey: { beaten: string[] } } } }).__kc.journey().journey.beaten.filter((b) => b.startsWith('e4')) }));
  throw new Error(`playThrough did not get back to the map: ${JSON.stringify(state)}`);
}

test.use({ viewport: { width: 360, height: 640 } });

test('gyms 1 to 8 and the Elite Four complete via the harness; badges, gifts and the queen slot', async ({ page }) => {
  test.setTimeout(600_000);
  await open(page);
  const gyms = ['pewter-gym', 'cerulean-gym', 'vermilion-gym', 'celadon-gym', 'fuchsia-gym', 'saffron-gym', 'cinnabar-gym', 'viridian-gym'];
  for (const [i, gym] of gyms.entries()) {
    await kc(page, 'enterPlace', gym);
    await expect(page.locator('.overlay .story-trainer img')).toHaveAttribute('data-trainer', /-gen1$/);
    await playThrough(page);
    expect((await kc<Save>(page, 'journey')).badges, gym).toHaveLength(i + 1);
  }
  const save = await kc<Save>(page, 'journey');
  expect(save.badges).toEqual(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']);
  expect(save.caught).toMatchObject({ eevee: 1, lapras: 1, hitmonlee: 1 });
  await kc(page, 'enterPlace', 'indigo-plateau');
  await playThrough(page);
  expect((await kc<Save>(page, 'journey')).journey.cleared).toContain('indigo-plateau');
  await page.getByTestId('open-team').click();
  await expect(page.getByTestId('team-q')).toBeEnabled();
});

test('Victory Road drills detect mate; Champion BLUE, then the Hall of Fame with your team', async ({ page }) => {
  await open(page, { ...SAVE, caught: { squirtle: 1, blastoise: 1 }, team: { k: 'blastoise' } });
  await kc(page, 'enterPlace', 'victory-road');
  for (let i = 0; i < 2; i++) await page.getByTestId('story').click();
  await expect(page.getByTestId('goal-card')).toContainText('QUEEN VS LONE KING');
  await page.getByTestId('goal-card').click();
  await kc(page, 'loadFen', 'k7/8/1K6/8/8/8/8/7Q w - - 0 1');
  await page.click('[data-square="h1"]');
  await page.click('[data-square="h8"]');
  await expect(page.getByTestId('story-text')).toHaveText('Checkmate! Drill complete.', { timeout: 8000 });
  await page.getByTestId('story').click();
  await expect(page.getByTestId('goal-card')).toContainText('ROOK VS LONE KING');
  await page.getByTestId('goal-card').click();
  await kc(page, 'loadFen', 'k7/8/1K6/8/8/8/8/7R w - - 0 1');
  await page.click('[data-square="h1"]');
  await page.click('[data-square="h8"]');
  await expect(page.getByTestId('story-text')).toHaveText('Checkmate! Drill complete.', { timeout: 8000 });
  await playThrough(page);
  expect((await kc<Save>(page, 'journey')).journey.cleared).toContain('victory-road');

  await kc(page, 'enterPlace', 'champion');
  for (let i = 0; i < 2; i++) await page.getByTestId('story').click();
  await expect(page.getByTestId('trainer-intro')).toContainText('CHAMPION BLUE wants to battle!');
  await page.getByTestId('trainer-intro').click();
  await expect(page.getByTestId('goal-card')).toContainText('He plays at level 1: Youngster.');
  await page.getByTestId('goal-card').click();
  await kc(page, 'loadFen', 'k7/8/1K6/8/8/8/8/7Q w - - 0 1');
  await page.click('[data-square="h1"]');
  await page.click('[data-square="h8"]');
  await expect(page.getByTestId('story-text')).toContainText('You\'re the CHAMPION now.', { timeout: 8000 });
  await page.getByTestId('story').click();
  await expect(page.getByTestId('hof-team').locator('img')).toHaveCount(2);
  await page.getByTestId('hof-ok').click();
  await expect(page.getByTestId('open-hof')).toBeVisible();
  const save = await kc<Save>(page, 'journey');
  expect(save.champion).toBe(true);
  expect(save.hallOfFame).toHaveLength(1);
});

test('a save with 150 caught receives Mew', async ({ page }) => {
  await page.goto('./?debug=1');
  const dex = await kc<string[]>(page, 'dexIds');
  expect(dex).toHaveLength(151);
  await open(page, { ...SAVE, caught: Object.fromEntries(dex.filter((s) => s !== 'mew').map((s) => [s, 1])) });
  await expect(page.getByTestId('story-text')).toContainText('MEW wants to join you!');
  expect((await kc<Save>(page, 'journey')).caught.mew).toBe(1);
});
