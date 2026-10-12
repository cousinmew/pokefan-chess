// SPDX-License-Identifier: AGPL-3.0-only
// Polish, 12 Oct (W4): leaving a game half way and coming back (bugs #7), nothing from an old screen acts later
// (bugs #8), Enter on story boxes, START's CLOSE, guest OPTION, new save copy and YELLOW polish (ux #14 to #17).
import { expect, test, type Page } from '@playwright/test';

const camp = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1 }, lessonsSeen: ['mateIn1', 'fork', 'hangingPiece', 'pin', 'skewer', 'short', 'oneMove'] };
const seed = (page: Page, extra: Record<string, unknown> = {}) =>
  page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, { 'kc:v1:cartridge': 'blue', 'kc:v1:campaign': camp, 'kc:v1:settings': { v: 2, anim: 'off' }, ...extra });
type KC = { dumpState(): string };
const state = (page: Page) => page.evaluate(() => JSON.parse((window as unknown as { __kc: KC }).__kc.dumpState()) as { fen: string; turn: string; mode: string });
const move = async (page: Page, from: string, to: string) => {
  await page.click(`[data-square="${from}"]`);
  await page.click(`[data-square="${to}"]`);
};
/** A click no matter what covers it: the way a tap reached START before the fix (S over a card). */
const forceClick = (page: Page, testid: string) => page.evaluate((id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click(), testid);

async function vsComputer(page: Page, team: 'red' | 'rocket') {
  await seed(page);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('vs-computer').click();
  await page.getByTestId(`team-${team}`).click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('intro')).toBeVisible();
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe('bugs #7: back from OPTION, the game goes on', () => {
  test('START → OPTION → BACK while the computer thinks: it still replies and the board unlocks', async ({ page }) => {
    await vsComputer(page, 'red');
    await page.getByTestId('intro').click();
    await move(page, 'e2', 'e4');
    // The computer thinks for at least 600 ms; leave and come back inside that.
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-option').click();
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('screen-game')).toBeVisible();
    await expect.poll(async () => (await state(page)).turn, { timeout: 5000 }).toBe('w');
    await move(page, 'd2', 'd4');
    await expect(page.locator('[data-square="d4"]')).toHaveAttribute('data-piece', 'wp');
    await expect.poll(async () => (await state(page)).turn, { timeout: 5000 }).toBe('w');
  });

  test('the same when OPTION stays open longer than the computer thinks', async ({ page }) => {
    await vsComputer(page, 'red');
    await page.getByTestId('intro').click();
    await move(page, 'e2', 'e4');
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-option').click();
    const behind = (await state(page)).turn; // 'b' unless the reply came before OPTION opened (a slow run)
    await page.waitForTimeout(1500);
    expect((await state(page)).turn).toBe(behind); // nothing moves behind OPTION
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await state(page)).turn, { timeout: 5000 }).toBe('w');
    await move(page, 'd2', 'd4');
    await expect(page.locator('[data-square="d4"]')).toHaveAttribute('data-piece', 'wp');
  });

  test('START during the "wants to battle" card, back after it ended: the computer opens', async ({ page }) => {
    await vsComputer(page, 'rocket');
    await forceClick(page, 'start-button');
    await page.getByTestId('start-menu-option').click();
    await page.waitForTimeout(1600); // the card's own timer ends while OPTION is open
    await page.getByTestId('back').click();
    await expect.poll(async () => (await state(page)).turn, { timeout: 5000 }).toBe('b');
    await move(page, 'e7', 'e5');
    await expect(page.locator('[data-square="e5"]')).toHaveAttribute('data-piece', 'bp');
  });

  test('the end screen is still there after OPTION', async ({ page }) => {
    await seed(page);
    await page.goto('./?debug=1&start=two');
    for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) await move(page, a!, b!);
    await expect(page.getByTestId('end-screen')).toBeVisible();
    await forceClick(page, 'start-button');
    await page.getByTestId('start-menu-option').click();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('end-screen')).toBeVisible();
  });
});

test('bugs #8: a Journey card left behind never starts a puzzle in a later game', async ({ page }) => {
  await seed(page);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await page.getByTestId('warmup-skip').click(); // Oak's warm-up (W5): covered in progress.spec.ts
  await page.getByTestId('battle-trainer').click();
  await expect(page.getByTestId('trainer-intro')).toBeVisible();
  // S no longer opens START over the card; a tap that reaches it anyway must leave nothing behind.
  await page.keyboard.press('s');
  await expect(page.getByTestId('start-overlay')).toHaveCount(0);
  await forceClick(page, 'start-button-corner');
  await page.getByTestId('start-menu-friend').click();
  await page.getByTestId('intro').click();
  for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) await move(page, a!, b!);
  await expect(page.getByTestId('end-screen')).toBeVisible();
  await page.waitForTimeout(1500); // the card's old timer
  await expect(page.getByTestId('goal-card')).toHaveCount(0);
  await page.getByTestId('rematch').click();
  await page.waitForTimeout(1500); // a stale handler would have started the Route 1 puzzle by now
  await expect(page.getByTestId('goal-card')).toHaveCount(0);
  if (await page.getByTestId('intro').isVisible()) await page.getByTestId('intro').click();
  const s = await state(page);
  expect(s.mode).toBe('two-players');
  expect(s.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')).toBe(true);
  await expect(page.getByTestId('puzzle-banner')).toBeHidden();
  await move(page, 'e2', 'e4');
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp');
});

test('Enter advances a story box and a trainer card like a tap, and never opens START over them', async ({ page }) => {
  await seed(page);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('place-pallet').click(); // the button keeps focus behind the box
  const text = page.getByTestId('story-text');
  const first = await text.textContent();
  await page.keyboard.press('Enter');
  await expect(text).not.toHaveText(first!);
  await expect(page.getByTestId('start-overlay')).toHaveCount(0);
  for (let i = 0; i < 5 && (await page.getByTestId('story').isVisible()); i++) await page.keyboard.press('Enter');
  await expect(page.getByTestId('story')).toBeHidden();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await expect(page.getByTestId('start-overlay')).toHaveCount(0);
  // The trainer card, then the goal card: Enter moves on as a tap does.
  await page.getByTestId('route-route-1').click();
  await page.getByTestId('warmup-skip').click(); // Oak's warm-up (W5): covered in progress.spec.ts
  await page.getByTestId('battle-trainer').click();
  await expect(page.getByTestId('trainer-intro')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('goal-card')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('goal-card')).toBeHidden();
  await expect(page.getByTestId('turn')).toHaveText(/^(Checkmate in \d moves?|Goal: .+)$/); // W3 moved the goal to the header
  await expect(page.getByTestId('start-overlay')).toHaveCount(0);
});

test('START has a visible CLOSE, at least 44 px tall', async ({ page }) => {
  await seed(page);
  await page.goto('./?debug=1&start=two');
  await page.getByTestId('start-button').click();
  const close = page.getByTestId('start-menu-close');
  await expect(close).toBeVisible();
  await expect(close).toHaveText(/CLOSE/);
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/w4-start-close.png' }).catch(() => undefined);
  await close.click();
  await expect(page.getByTestId('start-overlay')).toHaveCount(0);
  await expect(page.getByTestId('screen-game')).toBeVisible();
});

test('a guest game: QUIT, not SAVE & QUIT, and OPTION has no save tools', async ({ page }) => {
  await seed(page);
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('start-play').click();
  await page.getByTestId('quick-friend').click();
  await page.getByTestId('intro').click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('start-menu-quit')).toHaveText(/^.?QUIT$/);
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('guest-note')).toHaveText("Guest play isn't saved.");
  for (const id of ['save-box', 'save-protected', 'export-save', 'import-save', 'save-code-make', 'save-code-input']) await expect(page.getByTestId(id)).toHaveCount(0);
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-game')).toBeVisible();
  // A save keeps its tools and SAVE & QUIT.
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-quit').click();
  await page.getByTestId('start-continue').click();
  await page.getByTestId('start-button-corner').click();
  await expect(page.getByTestId('start-menu-quit')).toHaveText(/SAVE & QUIT/);
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('save-box')).toBeVisible();
});

test('a brand-new save: no "the way you played last", Trainer Level reads new, one lesson is singular', async ({ page }) => {
  await seed(page, { 'kc:v1:campaign': { ...camp, journey: { visited: ['route-1'] } } });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('quick-battle')).not.toContainText('the way you played last');
  await expect(page.getByTestId('quick-battle')).toContainText('A quick game against the computer.');
  await expect(page.getByTestId('hub-card-mini')).toContainText('Trainer Level: new');
  await expect(page.getByTestId('hub-card')).toContainText('Level: new');
  await expect(page.getByTestId('training')).not.toContainText('1 lessons');
  await page.getByTestId('hub-card').click();
  await expect(page.getByTestId('trainer-card')).toContainText('Trainer Level: new');
});

test('YELLOW home: Learn first, the code dots invisible at rest, the hint star never blinks out', async ({ page }) => {
  await seed(page, { 'kc:v1:cartridge': 'yellow' });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  const tiles = await page.locator('.big-tile').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid));
  expect(tiles.slice(0, 2)).toEqual(['yellow-learn', 'yellow-play']);
  const dots = page.getByTestId('code-dots');
  expect(await dots.evaluate((d) => getComputedStyle(d).opacity)).toBe('0');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => dots.evaluate((d) => getComputedStyle(d).opacity)).toBe('1');
  await page.getByTestId('yellow-learn').click();
  await page.getByTestId('lesson-1').click();
  const star = page.locator('.sq.star').first();
  await expect(star).toBeVisible();
  expect(await star.evaluate((s) => getComputedStyle(s, '::after').animationName)).toBe('star-pulse');
});
