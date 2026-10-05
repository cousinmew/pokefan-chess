// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

type KC = {
  runBattle(a: string, d: string): string[];
  playFx(id: string, seed: number): unknown;
  step(n: number): unknown;
  dumpState(): string;
  loadFen(f: string): string;
};
const RED = ['pikachu', 'charizard', 'snorlax', 'venusaur', 'blastoise', 'rapidash', 'eevee'];
const ROCKET = ['nidoking', 'nidoqueen', 'rhydon', 'arbok', 'weezing', 'dugtrio', 'rattata'];

test('pair sweep: 98 battles, zero errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?debug=1&start=two');
  const out = await page.evaluate(
    ([red, rocket]) => {
      const kc = (window as unknown as { __kc: KC }).__kc;
      const res: Record<string, string[]> = {};
      for (const a of red!) for (const d of rocket!) res[`${a}>${d}`] = kc.runBattle(a, d);
      for (const a of rocket!) for (const d of red!) res[`${a}>${d}`] = kc.runBattle(a, d);
      return res;
    },
    [RED, ROCKET],
  );
  expect(Object.keys(out)).toHaveLength(98);
  for (const [k, lines] of Object.entries(out)) expect(lines.at(-1), k).toMatch(/fainted!$/);
  for (const g of ['nidoking', 'nidoqueen', 'rhydon', 'dugtrio']) expect(out[`pikachu>${g}`]![0]).toBe('PIKACHU used QUICK ATTACK!');
  expect(out['dugtrio>charizard']![0]).toBe('DUGTRIO used SLASH!');
  expect(out['rhydon>charizard']).toContain("It's super effective!");
  expect(errors).toEqual([]);
});

test('bolt is deterministic under a seed', async ({ page }) => {
  await page.goto('/?debug=1&start=two');
  const run = (seed: number) =>
    page.evaluate((s) => {
      const kc = (window as unknown as { __kc: KC }).__kc;
      kc.playFx('bolt', s);
      kc.step(36);
      const st = JSON.parse(kc.dumpState());
      return JSON.stringify({ overlay: st.overlay, fxSig: st.fxSig, rngCalls: st.rngCalls });
    }, seed);
  const a = await run(1234);
  const b = await run(1234);
  const c = await run(9999);
  expect(a).toBe(b);
  expect(c).not.toBe(a);
  expect(JSON.parse(a).rngCalls).toBeGreaterThan(0);
});

test('a real capture plays the battle, tap skips it in under 100 ms', async ({ page }) => {
  await page.goto('/?debug=1&start=two');
  await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.loadFen('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'));
  await page.click('[data-square="e4"]');
  await page.click('[data-square="d5"]');
  const battle = page.getByTestId('battle');
  await expect(battle).toBeVisible();
  await expect(page.getByTestId('battle-text')).toContainText('EEVEE used');
  const ms = await page.evaluate(async () => {
    const t0 = performance.now();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    while (!(document.querySelector('[data-testid="battle"]') as HTMLElement).hidden) await new Promise((r) => setTimeout(r, 5));
    return performance.now() - t0;
  });
  expect(ms).toBeLessThan(100);
  await expect(page.locator('[data-square="d5"] img')).toHaveAttribute('alt', 'EEVEE');
  await expect(page.getByTestId('text-main')).toHaveText('RATTATA fainted!');
});

test("computer captures: the player's Pokémon stays near (back view), the attacker is far (front view)", async ({ page }) => {
  await page.goto('/?debug=1&start=two');
  await page.evaluate(() => {
    const kc = (window as unknown as { __kc: { setMode(m: string, l: number, h: string): void; loadFen(f: string): string } }).__kc;
    kc.setMode('computer', 1, 'w');
    // Black's only legal move is Kxg7: NIDOKING takes the player's CHARIZARD.
    kc.loadFen('7k/6Q1/8/8/8/8/8/4K3 b - - 0 1');
  });
  await expect(page.getByTestId('battle')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('battle-text')).toContainText('NIDOKING used', { timeout: 3000 });
  const view = await page.evaluate(() =>
    ['.mon.att', '.mon.def'].map((s) => {
      const slot = document.querySelector(s) as HTMLElement;
      return { src: (slot.querySelector('img') as HTMLImageElement).src.split('/').slice(-2).join('/'), top: parseFloat(slot.style.top) };
    }),
  );
  expect(view[0]!.src).toBe('front/34.gif');
  expect(view[1]!.src).toBe('back/6.gif');
  expect(view[0]!.top).toBeLessThan(view[1]!.top);
});
