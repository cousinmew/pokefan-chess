// SPDX-License-Identifier: AGPL-3.0-only
// W5 journey progression: Oak's Route 1 warm-up and the first catch, easy first trainers, the next goal everywhere,
// the map's CLEARED stamps and ▶, the win and unlock cards, and play time that never overwrites a rename (bugs #6).
import { expect, test, type Page } from '@playwright/test';

type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);
const SHOTS = '/tmp/claude-0/-home-user-repo/d3963086-35bf-5cbe-98c0-ec2fb0c61565/scratchpad/w5';
const shots = !!process.env.W5_SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1 }, journey: { cleared: [], beaten: [], visited: [] } };
async function open(page: Page, save: object = SAVE, query = '') {
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kc:v1:campaign', JSON.stringify(s));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ anim: 'off', v: 2 }));
  }, save);
  await page.goto(`./?debug=1${query}`);
  await page.getByTestId('screen-splash').click();
}

/** Plays the current puzzle's expected moves until its review, then Continue. */
async function solve(page: Page) {
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toBe('player');
  for (let i = 0; i < 6 && (await kc<string>(page, 'puzzlePhase')) === 'player'; i++) {
    const uci = (await kc<string>(page, 'puzzleAnswer'))!;
    await page.click(`[data-square="${uci.slice(0, 2)}"]`);
    await page.click(`[data-square="${uci.slice(2, 4)}"]`);
    if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toMatch(/player|review/);
  }
  await page.getByTestId('review-continue').click();
}

const move = async (page: Page, from: string, to: string) => {
  await page.click(`[data-square="${from}"]`);
  await page.click(`[data-square="${to}"]`);
};

test.use({ viewport: { width: 390, height: 844 } });

test('new BLUE save: warm-up, first catch, Pidgey pawns, then an easy first trainer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('set-anim').selectOption('off');
  await page.getByTestId('back').click();
  await page.getByTestId('kanto').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
  await page.getByTestId('name-2').click();
  await page.getByTestId('starter-bulbasaur').click();
  for (let i = 0; i < 2; i++) await page.getByTestId('story').click();
  // The map points at the next goal.
  await expect(page.getByTestId('map-next')).toHaveText('▶ YOUNGSTER TOBY at ROUTE 1');
  await page.getByTestId('route-route-1').click();
  await expect(page.getByTestId('warmup-intro')).toContainText('OAK: Before the trainers, three quick moves!');
  await shot(page, 'warmup-intro-390');
  await page.getByTestId('warmup-go').click();

  // 1: capture, with the goal in the header; a wrong move is put back.
  await expect(page.getByTestId('path-progress')).toHaveText('Warm-up 1 of 3');
  await expect(page.getByTestId('turn')).toHaveText(/^Take the .+!$/);
  await expect(page.getByTestId('warmup-skip')).toBeVisible();
  await expect(page.getByTestId('path-back')).toBeHidden();
  // Your own team: the starter is your king.
  await expect(page.locator('[data-square="h1"] img')).toHaveAttribute('alt', 'BULBASAUR');
  await shot(page, 'warmup-step1-390');
  await expect(page.getByTestId('text-main')).toHaveText('Capture: move onto an enemy piece to take it off the board.');
  await move(page, 'c1', 'c2');
  await expect(page.locator('[data-square="c1"]')).toHaveAttribute('data-piece', 'wr');
  // A wrong move: "Try again!", the goal stays in the header, no "wants to battle" anywhere (playtest, 12 Oct).
  await expect(page.getByTestId('text-main')).toHaveText('Try again!');
  await expect(page.getByTestId('turn')).toHaveText(/^Take the .+!$/);
  await expect(page.getByTestId('screen-game')).not.toContainText('wants to battle');
  await page.getByTestId('path-hint').click();
  await move(page, 'c1', 'c4');
  await expect(page.getByTestId('path-hint')).toBeHidden(); // nothing left to hint after a solve
  await page.getByTestId('path-next').click();
  // 2: check, with the idea in plain words.
  await expect(page.getByTestId('turn')).toHaveText('Put the king in check!');
  await expect(page.getByTestId('text-main')).toHaveText('Check means you attack the king.');
  await move(page, 'a1', 'a2');
  await expect(page.getByTestId('text-main')).toHaveText('Try again!');
  await expect(page.getByTestId('turn')).toHaveText('Put the king in check!');
  await expect(page.getByTestId('screen-game')).not.toContainText('wants to battle');
  await move(page, 'a1', 'a8');
  await page.getByTestId('path-next').click();
  // 3: mate in 1.
  await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move!');
  await move(page, 'a1', 'a8');
  await page.getByTestId('path-next').click();

  // The first catch cannot fail.
  await expect(page.getByTestId('story-text')).toHaveText('OAK: Rustling in the grass! Try a Poké Ball!');
  await page.getByTestId('story').click();
  await page.getByTestId('throw-ball').click();
  await expect(page.getByTestId('encounter-text')).toHaveText('Gotcha! PIDGEY was caught!');
  await page.getByTestId('enc-next').click();
  await expect(page.getByTestId('catch-card')).toContainText('Your first catch! Pokédex 2/151');
  await expect(page.getByTestId('catch-card')).toContainText('PIDGEY is your pawn team now. Change it in MY TEAM.');
  await shot(page, 'first-catch-390');
  await page.getByTestId('catch-card').click();
  await expect(page.getByTestId('screen-route')).toBeVisible();
  const save = await kc<{ warmup: boolean; team: Record<string, string>; caught: Record<string, number>; lessonsSeen: string[] }>(page, 'journey');
  expect(save).toMatchObject({ warmup: true, team: { p: 'pidgey' }, caught: { pidgey: 1 } });
  expect(save.lessonsSeen).toContain('mateIn1');
  await expect(page.getByTestId('route-trainers')).toHaveText('0 of 2 trainers beaten');
  await shot(page, 'route-390');

  // The next board: your pawns are PIDGEY (a tall grass puzzle with pawns on both sides).
  await page.getByTestId('walk-grass').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toBe('player');
  const pidgeys = await page.locator('.board img[alt="PIDGEY"]').count();
  const mine = await page.evaluate(() => {
    const human = document.querySelector('.board')!.querySelectorAll('[data-piece]');
    const turn = (window as unknown as { __kc: KC }).__kc.puzzleAnswer!() as string;
    const own = document.querySelector(`[data-square="${turn.slice(0, 2)}"]`)!.getAttribute('data-piece')![0];
    return [...human].filter((s) => s.getAttribute('data-piece') === `${own}p`).length;
  });
  expect(mine).toBeGreaterThan(0);
  expect(pidgeys).toBe(mine);
  await page.getByTestId('leave-grass').click();

  // The first trainer: no mini lesson (the warm-up taught mate in 1), a position with at most 16 pieces.
  await page.getByTestId('battle-trainer').click();
  await expect(page.getByTestId('trainer-intro')).toContainText('YOUNGSTER TOBY wants to battle!');
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toBe('player');
  expect(await page.locator('.board [data-piece]').count()).toBeLessThanOrEqual(16);
  await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move');
});

test('warm-up Skip goes straight to the route and is remembered', async ({ page }) => {
  await open(page);
  await page.getByTestId('kanto').click();
  await page.getByTestId('map-next').click();
  await page.getByTestId('warmup-skip').click();
  // ▶ went for the first trainer: the mini lesson, then TOBY.
  await expect(page.getByTestId('lesson-ok')).toBeVisible();
  expect((await kc<{ warmup: boolean }>(page, 'journey')).warmup).toBe(true);
});

test('beating Route 1: win card, unlock card, CLEARED stamp and ▶ on Viridian, which says what is there', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, { ...SAVE, warmup: true, lessonsSeen: ['mateIn1'], journey: { cleared: [], beaten: ['r1-toby'], visited: ['route-1'] } });
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('map-next')).toHaveText('▶ LASS MINA at ROUTE 1');
  await expect(page.getByTestId('place-viridian')).toHaveText(/\?\?\?Visit VIRIDIAN CITY first|\?\?\?Beat the trainers on ROUTE 1/);
  await expect(page.getByTestId('map-more')).toHaveText(/^\d+ more places ahead$/);
  await page.getByTestId('map-next').click();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  for (let i = 0; i < 3 && !(await page.getByTestId('story').isVisible()); i++) {
    await solve(page);
    await expect.poll(async () => (await page.getByTestId('story').isVisible()) || (await kc<string>(page, 'puzzlePhase')) === 'player', { timeout: 10_000 }).toBe(true);
  }
  // The defeat line, then "Next: …" closes the story.
  await page.getByTestId('story').click();
  await expect(page.getByTestId('story-text')).toHaveText('Next: Go to VIRIDIAN CITY');
  await page.getByTestId('story').click();
  await expect(page.getByTestId('win-card')).toContainText('✓ LASS MINA');
  await expect(page.getByTestId('win-card')).toContainText('2 of 2 trainers beaten');
  await shot(page, 'win-card-390');
  await page.getByTestId('win-card').click();
  await expect(page.getByTestId('unlock-card')).toContainText('ROUTE 1 cleared!');
  await expect(page.getByTestId('unlock-card')).toContainText('VIRIDIAN CITY is open!');
  await shot(page, 'unlock-card-390');
  await page.getByTestId('unlock-card').click();
  await expect(page.getByTestId('route-route-1')).toContainText('CLEARED');
  await expect(page.getByTestId('map-current')).toContainText('VIRIDIAN CITY');
  await expect(page.getByTestId('map-next')).toHaveText('▶ Go to VIRIDIAN CITY');
  await expect(page.getByTestId('place-rival-1')).toContainText('Visit VIRIDIAN CITY first');
  await page.waitForTimeout(900);
  await shot(page, 'map-cleared-390');
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot(page, 'map-cleared-1280');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('map-next').click();
  await page.getByTestId('story').click();
  await page.getByTestId('story').click();
  await expect(page.getByTestId('town-card')).toContainText('Here: a POKé MART');
  await expect(page.getByTestId('town-card')).toContainText('Next: Battle RIVAL BLUE');
  await shot(page, 'town-card-390');
  await page.getByTestId('town-card').click();
  await expect(page.getByTestId('place-viridian')).toContainText('CLEARED');
  await expect(page.getByTestId('map-next')).toHaveText('▶ Battle RIVAL BLUE');
  await expect(page.getByTestId('map-progress')).toHaveText(/^Journey \d+%$/);
});

test('the next goal on the hub, START and the start menu', async ({ page }) => {
  await open(page, { ...SAVE, journey: { cleared: [], beaten: ['r1-toby'], visited: ['route-1'] } });
  await expect(page.getByTestId('continue')).toContainText('Next: LASS MINA at ROUTE 1');
  await page.getByTestId('start-button-corner').click();
  await expect(page.getByTestId('start-next')).toHaveText('Next: LASS MINA at ROUTE 1');
  await shot(page, 'start-overlay-390');
  await page.getByTestId('start-menu-close').click();
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('start-summary-next')).toHaveText('Next: LASS MINA at ROUTE 1');
  await shot(page, 'start-menu-390');
});

test('a rename survives 6 s on the map, and play time counts into the save (bugs #6)', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, { ...SAVE, warmup: true, playMs: 0 });
  await page.getByTestId('kanto').click();
  await page.getByTestId('start-button-corner').click();
  await page.getByTestId('start-menu-option').click();
  await page.getByTestId('players').click();
  await page.getByTestId('slot-rename-1').click();
  await page.getByTestId('rename-5').click();
  await page.getByTestId('back').click();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await page.waitForTimeout(6000);
  const stored = await kc<{ name: string; playMs: number }>(page, 'campaign');
  expect(stored.name).toBe('SKY');
  expect(stored.playMs).toBeGreaterThanOrEqual(5000);
  expect((await kc<{ name: string }>(page, 'journey')).name).toBe(stored.name);
  await page.getByTestId('open-card').click();
  await expect(page.getByTestId('trainer-card')).toContainText(`NAME: ${stored.name}`);
});
