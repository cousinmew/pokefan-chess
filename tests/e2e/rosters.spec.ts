// SPDX-License-Identifier: AGPL-3.0-only
// Playtest, 23 Oct: a Journey trainer plays on their own Pokémon (BROCK wore Team Rocket's pieces), and MY TEAM is one
// tap away in START.
import { expect, test, type Page } from '@playwright/test';

type KC = { puzzlePhase(): string; enterPlace(id: string): void };
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());
/** The species names the Who's who lists for each team. */
const legend = (page: Page) =>
  page.locator('[data-testid="legend"] .legend-team').evaluateAll((rows) =>
    rows.map((r) => ({ team: r.querySelector('.legend-team-name')?.textContent ?? '', names: [...r.querySelectorAll('.legend-item .legend-text b')].map((b) => b.textContent ?? '') })),
  );

const SAVE = {
  v: 2, name: 'RED', starter: 'squirtle', introSeen: true, teamRules: 2, caught: { squirtle: 1 }, seen: ['squirtle'],
  lessonsSeen: ['mateIn1', 'castling', 'hangingPiece'], tips: ['puzzle'], puzzlesStarted: 12, warmup: true,
  journey: { cleared: ['route-1', 'viridian', 'rival-1', 'viridian-forest'], beaten: ['r1-toby', 'r1-mina', 'rival-1', 'vf-oskar', 'vf-liam', 'vf-pip'], visited: ['route-1', 'viridian', 'rival-1', 'viridian-forest'] },
};

test.use({ viewport: { width: 1280, height: 800 } });

test('BROCK plays on his own rock team, and START → MY TEAM goes and comes back', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript((c) => {
    localStorage.setItem('kc:v1:campaign', JSON.stringify(c));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off' }));
  }, SAVE);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.enterPlace('pewter-gym'));
  for (let i = 0; i < 4 && (await page.getByTestId('story').isVisible().catch(() => false)); i++) await page.getByTestId('story').click();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  await expect.poll(() => phase(page), { timeout: 20_000 }).toBe('player');
  const teams = await legend(page);
  const brock = teams.find((t) => !t.team.includes('RED'))!;
  expect(brock.names).toContain('ONIX');
  expect(brock.names).toContain('GEODUDE');
  for (const rocket of ['RATTATA', 'NIDOKING', 'ARBOK', 'WEEZING']) expect(brock.names).not.toContain(rocket);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-team').click();
  await expect(page.getByTestId('screen-team')).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-game')).toBeVisible();
});
