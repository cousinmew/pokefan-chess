// SPDX-License-Identifier: AGPL-3.0-only
// Puzzle flow after the pacing change (fix, 13 Oct): the SOLVED! stamp goes with its hold, a wrong move's review keeps
// its reply and right move when ◀ ▶ ↺ are tapped early, and a review that plays on while OPTION shows never eats
// OPTION's keys. Real timings, plain puzzle QUIET1 (set up Ra6-a8, then Re2-e1#; e2h2 is a wrong move).
import { expect, test, type Page } from '@playwright/test';
import { noTransition, skipHold } from './pace';

type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);
const QUIET1 = ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480];
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, warmup: true, tips: ['puzzle'], journey: { cleared: [], beaten: ['r1-toby'], visited: ['route-1'] } };

/** Every dip over the board, and whether its board was on screen (a review going on behind OPTION). */
function dipLog(): void {
  const w = window as unknown as { __dips: { t: number; connected: boolean }[] };
  w.__dips = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...a: Parameters<Element['animate']>) {
    if (this.classList.contains('board-dip')) w.__dips.push({ t: performance.now(), connected: this.isConnected });
    return animate.apply(this, a);
  };
}

/** A plain puzzle (QUIET1) from the hub, waiting for your move. */
async function plain(page: Page): Promise<void> {
  await page.addInitScript(dipLog);
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kc:v1:campaign', JSON.stringify(s));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off', sound: false }));
  }, SAVE);
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
  await kc(page, 'openPuzzles');
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
}

const move = async (page: Page, uci: string) => {
  await page.click(`[data-square="${uci.slice(0, 2)}"]`);
  await page.click(`[data-square="${uci.slice(2, 4)}"]`);
};

/** START → OPTION from the game screen, the cover gone. */
async function toOption(page: Page): Promise<void> {
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-option').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await noTransition(page);
}

test.use({ viewport: { width: 390, height: 844 } });

test('a skipped solve hold takes the SOLVED! stamp with it: none over the review or the next puzzle', async ({ page }) => {
  await plain(page);
  await move(page, 'e2e1');
  await expect(page.getByTestId('solved-stamp')).toBeAttached();
  await skipHold(page);
  // At once, not SOLVED_STAMP_MS after it came: the review is open and nothing of the stamp is left.
  expect(await page.evaluate(() => ({ phase: (window as unknown as { __kc: KC }).__kc.puzzlePhase!(), stamps: document.querySelectorAll('[data-testid="solved-stamp"]').length }))).toEqual({ phase: 'review', stamps: 0 });
  await page.getByTestId('review-continue').click();
  await expect(page.getByTestId('text-main')).toContainText('Watch!');
  expect(await page.locator('[data-testid="solved-stamp"]').count()).toBe(0);
});

for (const [label, id] of [['▶', 'review-next'], ['↺', 'review-replay']] as const) {
  test(`${label} tapped 100 ms into a wrong move's review keeps the reply and the right move`, async ({ page }) => {
    await plain(page);
    await move(page, 'e2h2');
    await expect(page.getByTestId('review')).toBeVisible();
    await page.waitForTimeout(100);
    await page.getByTestId(id).click();
    await expect.poll(() => kc<unknown>(page, 'refutation'), { timeout: 15_000 }).not.toBeNull();
    // The line still grows to its end (▶ comes back on), where the right move is drawn in green.
    const next = page.getByTestId('review-next');
    const right = page.locator('[data-testid="review-layer"] line[data-arrow="e2e1"][data-color="green"]');
    await expect(async () => {
      while (await next.isEnabled()) await next.click();
      await expect(right).toBeAttached({ timeout: 200 });
    }).toPass({ timeout: 15_000 });
    await expect(next).toBeDisabled();
    // Five frames: your move, it played (faded), their reply, the position again with the right move, it played.
    let back = 0;
    for (const prev = page.getByTestId('review-prev'); await prev.isEnabled(); back++) await prev.click();
    expect(back).toBe(4);
  });
}

test('a review going on behind OPTION never eats the letters typed there while its board dips', async ({ page }) => {
  await plain(page);
  await move(page, 'e2h2');
  await expect(page.getByTestId('review')).toBeVisible();
  await toOption(page);
  // Type B and S into the save code box until the review has dipped its board behind OPTION, and a little longer.
  const input = page.getByTestId('save-code-input');
  await input.focus();
  await input.evaluate((e) => e.addEventListener('keydown', () => ((window as unknown as { __typed: number }).__typed = ((window as unknown as { __typed?: number }).__typed ?? 0) + 1)));
  let pressed = 0;
  let stopAt = Infinity;
  for (let i = 0; i < 400 && Date.now() < stopAt; i++) {
    await page.keyboard.press(i % 2 ? 's' : 'b');
    pressed++;
    if (stopAt === Infinity && (await page.evaluate(() => (window as unknown as { __dips: { connected: boolean }[] }).__dips.some((d) => !d.connected)))) stopAt = Date.now() + 400;
    await page.waitForTimeout(15);
  }
  expect(stopAt).not.toBe(Infinity); // the review did dip behind OPTION
  expect(await page.evaluate(() => (window as unknown as { __typed: number }).__typed)).toBe(pressed);
  await expect(page.getByTestId('screen-settings')).toBeVisible();
});

test('B on OPTION goes back while a hold the review started behind OPTION runs', async ({ page }) => {
  await plain(page);
  await move(page, 'e2h2');
  await expect(page.getByTestId('review')).toBeVisible();
  await toOption(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  // A hold that starts while OPTION shows (the review's next step).
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        new MutationObserver((_, o) => {
          if (document.body.dataset.hold === undefined || document.body.dataset.screen !== 'screen-settings') return;
          o.disconnect();
          done();
        }).observe(document.body, { attributes: true, attributeFilter: ['data-hold'] }),
      ),
  );
  await page.keyboard.press('b');
  await expect(page.getByTestId('screen-game')).toBeVisible({ timeout: 2000 });
});
