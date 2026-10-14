// SPDX-License-Identifier: AGPL-3.0-only
// W3 puzzle clarity (playtest 12 Oct): in a black to move journey puzzle you are still TEAM RED with your own team at
// the bottom, a YOU plate, the trainer's name on top, the goal in the header, the set up move explained, coach marks
// once per save, and a Who's who that lists only what stands on the board.
import { expect, test, type Page } from '@playwright/test';

type KC = { puzzlePhase(): string; puzzleAnswer(): string | null; forcePuzzle(row: [string, string, string, number], theme: string): void; journey(): { tips: string[]; puzzlesStarted: number } };
const save = (page: Page) => page.evaluate(() => (window as unknown as { __kc: KC }).__kc.journey());
const phase = (page: Page) => page.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());
// Lichess 08ysH, mate in 1: White's king steps to h5, then Black (you) mates with the rook on h4.
const BLACK_MATE: [string, string, string, number] = ['08ysH', '8/3N2k1/5b2/5R2/r5KP/8/8/8 w - - 3 48', 'g4h5 a4h4', 458];
const force = (page: Page) => page.evaluate((row) => (window as unknown as { __kc: KC }).__kc.forcePuzzle(row, 'mateIn1'), BLACK_MATE);

/** Each legend entry is one species on one side; the board has exactly those (ux #13). */
async function legendMatchesBoard(page: Page) {
  const onBoard = await page.locator('#board .sq[data-piece]').evaluateAll((els) => [...new Set(els.map((e) => `${(e as HTMLElement).dataset.piece![0]}${(e as HTMLElement).dataset.piece![1]}:${e.querySelector('img.piece')?.getAttribute('alt')}`))].sort());
  const listed = await page.locator('[data-testid="legend"] .legend-item').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.testid!.slice(7, 9)}:${e.querySelector('.legend-text b')?.textContent}`).sort());
  expect(listed).toEqual(onBoard);
}

async function toRoute1(page: Page, campaign: object) {
  // Seeded once per tab, so a reload keeps what the game saved.
  await page.addInitScript((c) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off', legend: 'on' }));
    localStorage.setItem('kc:v1:campaign', JSON.stringify(c));
  }, campaign);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
}

async function startTrainer(page: Page) {
  await force(page);
  await page.getByTestId('battle-trainer').click();
  await expect(page.getByTestId('trainer-intro')).toContainText('YOUNGSTER TOBY wants to battle!');
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
}

const SAVE = { v: 2, name: 'LEAF', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1 }, lessonsSeen: ['mateIn1'], journey: { cleared: [], beaten: [], visited: ['route-1'] } };

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`black to move journey puzzle: you are TEAM RED at the bottom, YOU plate, goal in the header (${vp.width}x${vp.height})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(vp);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await toRoute1(page, SAVE);
    await startTrainer(page);
    // Before the set up move: the position and who moves first, never "RED wants to battle!" (ux #5, #6).
    await expect(page.getByTestId('text-main')).toHaveText('YOUNGSTER TOBY moves first. Watch!');
    await expect(page.getByTestId('plate-top-msg')).not.toContainText('wants to battle');
    await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move');
    await expect(page.getByTestId('plate-top')).toContainText('YOUNGSTER TOBY');
    await expect(page.getByTestId('plate-top')).not.toContainText('ROCKET');
    await expect(page.getByTestId('plate-bottom')).toContainText('LEAF');
    await expect(page.getByTestId('plate-bottom').getByTestId('plate-you')).toHaveText('YOU');
    await expect(page.getByTestId('plate-top').getByTestId('plate-you')).toHaveCount(0);
    // Coach marks on the save's first puzzle: your team, then the goal.
    await expect(page.getByTestId('coach')).toContainText('These are yours: TEAM RED, at the bottom.');
    await page.getByTestId('screen-game').locator('header').click({ position: { x: 2, y: 2 } });
    await expect(page.getByTestId('coach')).toContainText('Your goal is always up here.');
    // The set up move waits until both are read (fix, 14 Oct), then plays; the third bubble follows it.
    await page.getByTestId('screen-game').locator('header').click({ position: { x: 2, y: 2 } });
    // After the set up move: your turn, with how to move (first puzzles of a save).
    await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
    await expect(page.getByTestId('text-main')).toHaveText('Your turn! Tap your Pokémon, then a square.');
    await expect(page.getByTestId('coach')).toContainText('They moved. Now find your move!');
    await page.getByTestId('screen-game').locator('header').click({ position: { x: 2, y: 2 } });
    await expect(page.getByTestId('coach')).toBeHidden();
    // You play black, but your pieces are TEAM RED, your starter is the king, and you are at the bottom.
    const king = page.locator('[data-square="g7"] img.piece');
    await expect(king).toHaveAttribute('alt', 'BULBASAUR');
    await expect(page.locator('[data-square="h5"] img.piece')).toHaveAttribute('alt', 'RATICATE');
    await expect(page.locator('[data-square="h4"] img.piece')).toHaveAttribute('alt', 'RATTATA');
    const y = async (sq: string) => (await page.locator(`[data-square="${sq}"]`).boundingBox())!.y;
    expect(await y('g7')).toBeGreaterThan(await y('h5'));
    await expect(page.locator('[data-square="g7"] .ground')).toHaveClass(/ground-w/); // Red's ground shadow
    // Who's who: TEAM RED first, and only what is on the board.
    await expect(page.locator('.legend-team-name').first()).toHaveText('TEAM RED');
    await legendMatchesBoard(page);
    await page.screenshot({ path: `/tmp/claude-0/-home-user-repo/d3963086-35bf-5cbe-98c0-ec2fb0c61565/scratchpad/w3/black-puzzle-${vp.width}.png` });
    // Mate: the solved lines name the opponent's king, the turn line keeps the goal (ux #11).
    await page.click('[data-square="a4"]');
    await page.click('[data-square="h4"]');
    await expect.poll(() => phase(page), { timeout: 8000 }).toBe('review');
    await expect(page.getByTestId('text-main')).toHaveText('Checkmate! Well done.');
    await expect(page.getByTestId('review-text')).toContainText('RATICATE');
    await expect(page.getByTestId('review-text')).not.toContainText('BULBASAUR');
    await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move');
    await expect(page.getByTestId('puzzle-banner')).toHaveText('YOUNGSTER TOBY ●○○ need 1');
    await page.screenshot({ path: `/tmp/claude-0/-home-user-repo/d3963086-35bf-5cbe-98c0-ec2fb0c61565/scratchpad/w3/black-solved-${vp.width}.png` });
    // A miss on the next puzzle: the review names the trainer, the banner says what is left; no coach marks again.
    await force(page);
    await page.getByTestId('review-continue').click();
    await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
    await expect(page.getByTestId('coach')).toBeHidden();
    await expect(page.getByTestId('text-main')).toHaveText('Your turn! Tap your Pokémon, then a square.');
    await page.click('[data-square="a4"]');
    await page.click('[data-square="a1"]');
    await expect(page.getByTestId('text-main')).toHaveText('Not quite. Watch what happens, then the right move.');
    await expect(page.getByTestId('puzzle-banner')).toHaveText('YOUNGSTER TOBY ●✕○ Win the next one!'); // not "1 more of the next 1" (playtest, 12 Oct)
    await expect.poll(async () => (await save(page)).tips).toEqual(['puzzle']);
    expect(errors).toEqual([]);
  });
}

test('the coach marks show once per save, and Escape skips them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toRoute1(page, SAVE);
  await startTrainer(page);
  await expect(page.getByTestId('coach')).toBeVisible();
  // Non-blocking: the board under it stays visible.
  await expect(page.locator('#board')).toBeVisible();
  // The first mark lights your own pieces (not the bottom rows, which can hold theirs) and never covers your king.
  const geo = await page.evaluate(() => {
    const me = document.querySelector('.board [data-square]')!.getAttribute('data-square') === 'a8' ? 'w' : 'b';
    const box = (e: Element) => e.getBoundingClientRect();
    const spot = box(document.querySelector('.coach-spot')!);
    const bubble = box(document.querySelector('.coach-bubble')!);
    const king = box(document.querySelector(`.board [data-piece="${me}k"]`)!);
    const inside = [...document.querySelectorAll(`.board [data-piece^="${me}"]`)].every((e) => {
      const r = box(e);
      return r.left >= spot.left - 1 && r.right <= spot.right + 1 && r.top >= spot.top - 1 && r.bottom <= spot.bottom + 1;
    });
    const overlap = bubble.left < king.right && bubble.right > king.left && bubble.top < king.bottom && bubble.bottom > king.top;
    return { inside, overlap };
  });
  expect(geo).toEqual({ inside: true, overlap: false });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('coach')).toBeHidden();
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  await expect(page.getByTestId('coach')).toBeHidden(); // the "they moved" step is skipped too
  // A new visit to the same save: no coach marks.
  await page.reload();
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await startTrainer(page);
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  await expect(page.getByTestId('coach')).toBeHidden();
  // Two puzzles started on this save so far.
  expect((await save(page)).puzzlesStarted).toBe(2);
});

/** Each side's pieces as "square:alt", and the Who's who team name over each colour's entries. */
const sides = (page: Page) =>
  page.evaluate(() => ({
    pieces: [...document.querySelectorAll<HTMLElement>('#board .sq[data-piece]')].map((e) => `${e.dataset.square}:${e.querySelector('img.piece')?.getAttribute('alt')}`).sort(),
    teams: [...document.querySelectorAll('[data-testid="legend"] .legend-team')].map((r) => `${r.querySelector('.legend-team-name')?.textContent}:${(r.querySelector<HTMLElement>('.legend-item')?.dataset.testid ?? '').slice(7, 8)}`),
  }));

test('black to move puzzle: START → OPTION → Back keeps your team and theirs (review regression)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toRoute1(page, { ...SAVE, tips: ['puzzle'] });
  await startTrainer(page);
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  const before = await sides(page);
  // You play black: your starter is the king on g7, PIKACHU stands where the story team had BULBASAUR (f6, dark).
  expect(before.pieces).toEqual(['a4:SNORLAX', 'd7:ZUBAT', 'f5:SANDSLASH', 'f6:PIKACHU', 'g7:BULBASAUR', 'h4:RATTATA', 'h5:RATICATE']);
  expect(before.teams).toEqual(['TEAM RED:b', 'TEAM ROCKET:w']);
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByTestId('screen-game')).toBeVisible();
  expect(await sides(page)).toEqual(before);
  await expect(page.locator('[data-square="g7"] .ground')).toHaveClass(/ground-w/);
});

test('coach marks close when the game screen is left: Escape on OPTION goes back at once (review fix)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toRoute1(page, SAVE);
  await startTrainer(page);
  await expect(page.getByTestId('coach')).toBeVisible();
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('screen-game')).toBeVisible();
  await expect(page.getByTestId('coach')).toBeHidden();
  // The board takes taps again, and no bubble comes back for the set up move.
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  await expect(page.getByTestId('coach')).toBeHidden();
});

test('a save that already beat trainers says "Your turn!" and shows no coach marks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toRoute1(page, { ...SAVE, journey: { cleared: [], beaten: ['r1-toby'], visited: ['route-1'] } });
  await page.getByTestId('battle-trainer').click(); // LASS MINA, the next one
  await page.evaluate((row) => (window as unknown as { __kc: KC }).__kc.forcePuzzle(row, 'mateIn1'), BLACK_MATE);
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  await expect.poll(() => phase(page), { timeout: 8000 }).toBe('player');
  await expect(page.getByTestId('text-main')).toHaveText('Your turn!');
  await expect(page.getByTestId('coach')).toBeHidden();
  await expect(page.getByTestId('plate-top')).toContainText('LASS MINA');
});

test('YELLOW lesson: the Who\'s who lists only the Pokémon on the board, and a solve never reads "TEAM ROCKET to move"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('kc:v1:cartridge', JSON.stringify('yellow'));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off' }));
  });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('yellow-learn').click();
  await page.getByTestId('lesson-1').click();
  await expect(page.getByTestId('legend')).toBeVisible();
  await legendMatchesBoard(page);
  expect(await page.locator('[data-testid="legend"] .legend-item').count()).toBeLessThan(12);
  await page.getByTestId('path-hint').click();
  const marked = await page.locator('.sq.hint').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.square!, (e as HTMLElement).dataset.piece ?? ''] as const));
  const from = marked.find(([, p]) => p.startsWith('w'))![0];
  const to = marked.find(([sq]) => sq !== from)![0];
  await page.click(`[data-square="${from}"]`);
  await page.click(`[data-square="${to}"]`);
  await expect(page.getByTestId('path-next')).toBeVisible();
  await expect(page.getByTestId('turn')).not.toContainText('ROCKET');
  await legendMatchesBoard(page);
});

test('YELLOW lesson 1: a wrong move says "Try again!" and the goal stays in the header (playtest, 12 Oct)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('kc:v1:cartridge', JSON.stringify('yellow'));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off' }));
  });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('yellow-learn').click();
  await page.getByTestId('lesson-1').click();
  await expect(page.getByTestId('turn')).toHaveText('Move it to the star!');
  await page.click('[data-square="e2"]');
  await page.click('[data-square="e3"]');
  await expect(page.locator('[data-square="e2"]')).toHaveAttribute('data-piece', 'wp');
  await expect(page.getByTestId('text-main')).toHaveText('Try again!');
  await expect(page.getByTestId('turn')).toHaveText('Move it to the star!');
  await expect(page.getByTestId('screen-game')).not.toContainText('wants to battle');
  await page.click('[data-square="e2"]');
  await page.click('[data-square="e4"]');
  await expect(page.getByTestId('text-main')).toHaveText('Great job!');
  await expect(page.getByTestId('path-hint')).toBeHidden();
});
