// SPDX-License-Identifier: AGPL-3.0-only
// Writes one 360x640 screenshot per battle effect to docs/fx-sheet/ for review. Run: npm run sheets
import { test } from '@playwright/test';

// Effect -> [attacker, defender, share of the effect to show].
const SHEET: Record<string, [string, string, number]> = {
  bolt: ['pikachu', 'rattata', 0.55], flame: ['charizard', 'rattata', 0.55], slam: ['snorlax', 'rattata', 0.55], leaf: ['venusaur', 'rattata', 0.55],
  water: ['blastoise', 'rattata', 0.55], stomp: ['rapidash', 'rattata', 0.55], quick: ['eevee', 'rattata', 0.55], horn: ['nidoking', 'eevee', 0.55],
  rockfall: ['rhydon', 'eevee', 0.55], dig: ['dugtrio', 'eevee', 0.85], wrap: ['arbok', 'eevee', 0.55], sludge: ['weezing', 'eevee', 0.75],
  fang: ['rattata', 'eevee', 0.4], slash: ['dugtrio', 'charizard', 0.55],
};
const FX_FRAMES = 415 / (1000 / 60);
type KC = { playFx(id: string, seed: number, a: string, d: string): unknown; step(n: number): unknown; spritesReady(): Promise<boolean> };

test('@fxsheet one screenshot per effect', async ({ page }) => {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.spritesReady());
  await page.getByTestId('two-players').click();
  await page.getByTestId('intro').click();
  for (const [id, [a, d, at]] of Object.entries(SHEET)) {
    // Park at the start of the effect, then advance to the chosen share of it (after the type flash).
    await page.evaluate(([fx, att, def, n]) => {
      const kc = (window as unknown as { __kc: KC }).__kc;
      kc.playFx(fx as string, 7, att as string, def as string);
      kc.step(n as number);
    }, [id, a, d, Math.round(at * FX_FRAMES)] as const);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `docs/fx-sheet/${id}.png` });
  }
});
