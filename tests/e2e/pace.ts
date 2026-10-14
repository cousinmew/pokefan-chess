// SPDX-License-Identifier: AGPL-3.0-only
// Pacing (12 Oct) helpers for the specs. Real timings, no speed flag: click() and tap() wait on their own (a cover or
// dip intercepts the hit test, a guarded card is aria-disabled, a guarded button disabled). Keys, force clicks,
// dispatchEvent and page.mouse do not wait, so those wait here first. Long walks skip holds the way a fast player does.
import { test, type Page } from '@playwright/test';

/** No cover or dip is up (keys and forced clicks count again). */
export async function noTransition(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.transition === undefined && !document.querySelector('.board-dip'), null, { timeout });
}

/** Nothing is moving: no cover, dip or hold, and every finite animation has finished. Before geometry and screenshots. */
export async function settled(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.transition === undefined &&
      !document.querySelector('.board-dip') &&
      document.body.dataset.hold === undefined &&
      document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
    null,
    { timeout },
  );
}

/** Skips the hold running now once it can be skipped, with Space (nothing focused), as a fast player does. */
export async function skipHold(page: Page, timeout = 15_000): Promise<void> {
  await page.locator('body[data-skippable]').waitFor({ state: 'attached', timeout });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Space');
}

/** A card or story box takes input (its guard is over). */
export async function ready(page: Page, testid: string, timeout = 15_000): Promise<void> {
  await page.locator(`[data-testid="${testid}"][data-ready]`).first().waitFor({ state: 'attached', timeout });
}

/** Clicks a guarded card from inside the page within a frame of its appearing, while its guard is still on (no
 * data-ready yet): a timed tap from the test can land after the guard on a busy machine. 'late' if it never could. */
export async function tapInGuard(page: Page, testid: string): Promise<string> {
  const tap = await page.waitForFunction((id) => {
    const c = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!c) return false;
    if (c.dataset.ready !== undefined) return 'late';
    c.click();
    return 'in-guard';
  }, testid, { polling: 'raf' });
  return (await tap.jsonValue()) as string;
}

/** A throttled cold load (an empty cache, a slow network or CPU), up to its first response: not page.goto's `load`.
 * Boot's image preloads (Oak, the starters, the save's boards) hold `load` back, on Slow 4G about 1.7 s past the
 * splash, which moves on by itself 2.5 s after it shows (SPLASH_AUTO_MS); on a busy runner `load` came later still,
 * and a splash tap waited out the test for a splash already gone (P11 in the merged CI run, 14 Oct; then trainerart 3,
 * J9 and the startflow cold load under load). The splash comes about 2.2 s after the navigation (boot.spec.ts B1). */
export const coldGoto = (page: Page, query = '?debug=1') => page.goto(`./${query}`, { waitUntil: 'commit', timeout: 120_000 });

/** Leaves the splash a page load shows with a tap, as a player does, as soon as a tap can skip it (HOLD_MIN_MS; an
 * earlier one is taken and does nothing). A splash that already moved on by itself (SPLASH_AUTO_MS, a busy runner)
 * needs no tap: 'gone', noted on the test. Not for a splash shown again later (NEW GAME's): the screen before it
 * would count as gone. */
export async function tapSplash(page: Page, timeout = 120_000): Promise<'tapped' | 'gone'> {
  const splash = page.getByTestId('screen-splash');
  const state = await page.waitForFunction(
    () => {
      const shown = document.body?.dataset.screen ?? '';
      if (document.querySelector('[data-testid="screen-splash"]')) return document.body.dataset.hold === 'splash' && document.body.dataset.skippable !== undefined && 'up';
      return shown !== '' && shown !== 'screen-splash' && 'gone';
    },
    null,
    { timeout, polling: 'raf' },
  );
  if ((await state.jsonValue()) === 'up') {
    try {
      await splash.click({ timeout: 10_000 });
      return 'tapped';
    } catch (err) {
      if (await splash.count()) throw err; // still up and untappable: a real failure
    }
  }
  test.info().annotations.push({ type: 'splash', description: 'moved on by itself before the tap (SPLASH_AUTO_MS)' });
  return 'gone';
}
