// SPDX-License-Identifier: AGPL-3.0-only
// Pacing (12 Oct) helpers for the specs. Real timings, no speed flag: click() and tap() wait on their own (a cover or
// dip intercepts the hit test, a guarded card is aria-disabled, a guarded button disabled). Keys, force clicks,
// dispatchEvent and page.mouse do not wait, so those wait here first. Long walks skip holds the way a fast player does.
import type { Page } from '@playwright/test';

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
