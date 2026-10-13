// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Page } from '@playwright/test';

type KC = { puzzleAnswer(): string | null; puzzlePhase(): string; journey(): { journey: { cleared: string[]; beaten: string[] }; name: string; starter: string } };
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());

/** Plays the expected answer of the current puzzle until it is over. */
async function solveOne(page: Page) {
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('player');
  for (let i = 0; i < 6 && (await phase(page)) === 'player'; i++) {
    const uci = (await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzleAnswer()))!;
    await page.click(`[data-square="${uci.slice(0, 2)}"]`);
    await page.click(`[data-square="${uci.slice(2, 4)}"]`);
    if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
    await expect.poll(() => phase(page), { timeout: 10_000 }).toMatch(/player|review/);
  }
  // The review moment (§B15) waits for Continue.
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('review');
  await page.getByTestId('review-continue').click();
}

/** A Route 1 trainer battle: the lesson the first time, intro card, goal card, then puzzles until "You won!" (pacing §5:
 * the win card comes first, then the defeat story). */
async function beatTrainer(page: Page, who: string) {
  if (await page.getByTestId('lesson-ok').isVisible()) await page.getByTestId('lesson-ok').click();
  await page.getByTestId('trainer-intro').click();
  await expect(page.getByTestId('goal-card')).toBeVisible();
  await page.getByTestId('goal-card').click();
  // W3: the banner keeps the trainer, the pips and what is still needed (2 of 3); the goal is in the header, and
  // Route 1's trainers are easy, mate in 1 only (W5).
  await expect(page.getByTestId('puzzle-banner')).toHaveText(`${who} ○○○ need 2`);
  await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move');
  for (let i = 0; i < 6 && !(await page.getByTestId('win-card').isVisible()); i++) {
    await solveOne(page);
    // After a short pause either the next puzzle starts or the win card shows.
    await expect.poll(async () => (await page.getByTestId('win-card').isVisible()) || (await phase(page)) === 'player', { timeout: 10_000 }).toBe(true);
  }
  await expect(page.getByTestId('win-card')).toBeVisible();
}

async function readStory(page: Page, boxes: number) {
  for (let i = 0; i < boxes; i++) await page.getByTestId('story').click();
}

test.use({ viewport: { width: 360, height: 640 } });

test('fresh save: Pallet, Route 1 trainers, Viridian, then rival BLUE (§B11 gate)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('set-anim').selectOption('off');
  await page.getByTestId('back').click();
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('story-text')).toContainText('OAK:');
  await readStory(page, 3);
  await page.getByTestId('name-2').click();
  await page.getByTestId('starter-bulbasaur').click();
  await expect(page.getByTestId('story-text')).toContainText('BULBASAUR');
  await readStory(page, 1);
  await expect(page.getByTestId('story-text')).toContainText('BLUE:');
  await readStory(page, 1);
  await expect(page.getByTestId('place-viridian')).toBeDisabled();

  await page.getByTestId('route-route-1').click();
  await page.getByTestId('warmup-skip').click(); // Oak's warm-up (W5): covered in progress.spec.ts
  await expect(page.locator('.trainer-row')).toHaveCount(2);
  for (const who of ['YOUNGSTER TOBY', 'LASS MINA']) {
    await expect(page.getByTestId('battle-trainer')).toHaveText(`Battle ${who}`);
    await page.getByTestId('battle-trainer').click();
    // The first Route 1 trainer teaches mate in 1: Oak's mini lesson comes first, once.
    if (who === 'YOUNGSTER TOBY') {
      await expect(page.getByTestId('mini-board')).toBeVisible();
      await page.getByTestId('lesson-ok').click();
    }
    await expect(page.getByTestId('trainer-intro')).toContainText(`${who} wants to battle!`);
    await beatTrainer(page, who);
    await page.getByTestId('win-card').click(); // W5: what you won, first (pacing §5)
    await readStory(page, 1); // the defeat line
    // "Next: …" once, last: on the unlock card when the route is cleared, else the story's last line.
    if (who === 'LASS MINA') {
      await expect(page.getByTestId('unlock-card')).toContainText('Next: Go to VIRIDIAN CITY');
      await page.getByTestId('unlock-card').click(); // W5: what opened
    } else {
      await expect(page.getByTestId('story-text')).toHaveText('Next: LASS MINA at ROUTE 1');
      await readStory(page, 1);
    }
  }
  await expect(page.getByTestId('place-viridian')).toBeEnabled();
  await page.getByTestId('place-viridian').click();
  await readStory(page, 2);
  await expect(page.getByTestId('town-card')).toContainText('Next: Battle RIVAL BLUE'); // W5: a town says what is there
  await page.getByTestId('town-card').click();
  await page.getByTestId('place-rival-1').click();
  await expect(page.getByTestId('story-text')).toContainText('BLUE:');
  await readStory(page, 2);
  // BLUE picked the starter strong against BULBASAUR.
  await expect(page.getByTestId('trainer-intro')).toContainText('RIVAL BLUE wants to battle!');
  await expect(page.locator('[data-testid="trainer-intro"] img[data-species]').first()).toHaveAttribute('alt', 'CHARMANDER');
  await page.getByTestId('trainer-intro').click();
  await expect(page.getByTestId('goal-card')).toContainText('BLUE leads with CHARMANDER.');
  await expect(page.getByTestId('pips')).toHaveText('○○○○○');
  await page.getByTestId('goal-card').click();
  for (let i = 0; i < 6 && !(await page.getByTestId('win-card').isVisible()); i++) {
    await solveOne(page);
    await expect.poll(async () => (await page.getByTestId('win-card').isVisible()) || (await phase(page)) === 'player', { timeout: 10_000 }).toBe(true);
  }
  // The win card, BLUE's defeat line, the unlock card with the next goal, then Oak's reward: the starter neither of you
  // picked (§B12).
  await page.getByTestId('win-card').click();
  await readStory(page, 1);
  await page.getByTestId('unlock-card').click();
  await expect(page.getByTestId('story-text')).toContainText('SQUIRTLE wanted to come along!');
  await readStory(page, 1);
  await expect(page.getByTestId('route-viridian-forest')).toBeEnabled();
  const save = await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.journey());
  expect(save.journey.cleared).toEqual(expect.arrayContaining(['route-1', 'viridian', 'rival-1']));
  expect(save).toMatchObject({ name: 'LEAF', starter: 'bulbasaur' });
  await page.getByTestId('open-card').click();
  await expect(page.getByTestId('trainer-card')).toContainText('NAME: LEAF');
  // 7 rated puzzles (TOBY 2, MINA 2, BLUE 3; the warm-up was skipped): no number before 10 (playtest, 12 Oct).
  await expect(page.getByTestId('trainer-card')).toContainText('Trainer Level: new (7/10)');
});

test('Pokédex: candy evolution adds the new species, shiny and stars show', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'RED', starter: 'squirtle', caught: { squirtle: 9 }, shiny: { squirtle: 1 }, oak: {}, candy: { squirtle: 30 }, seen: ['squirtle'], caughtAt: { squirtle: 'pallet' }, routes: {}, journey: { cleared: [], beaten: [], visited: [] }, team: {}, playMs: 0 })));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('set-anim').selectOption('off');
  await page.getByTestId('back').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('open-dex').click();
  await expect(page.getByTestId('dex-squirtle')).toContainText('SQUIRTLE ✨');
  await page.getByTestId('dex-squirtle').click();
  await page.getByTestId('evolve-wartortle').click();
  await expect(page.getByTestId('dex-detail')).toContainText('WARTORTLE x1', { timeout: 5000 });
  await page.getByTestId('dex-close').click();
  await expect(page.getByTestId('dex-wartortle')).toBeEnabled();
  await expect(page.locator('.screen-dex p').first()).toHaveText('Pokédex: 2 of 151 caught');
});
