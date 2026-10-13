// SPDX-License-Identifier: AGPL-3.0-only
// What the player hears and is told while things load (loading fix, 14 Oct, review follow-ups): the Journey's panel
// cries (the starter pick, a wild encounter) are fetched ahead and heard with their panel; a battle cover held for its
// board's images says so; and under reduced motion the capture tap's flash is a colour fade. Real timings, as in
// loading.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { arm, boot, cartBlue, FAST_4G, FEN_D5, firstFrame, fresh, kc, ld, now, SAVE } from './loadwatch';

// Review, 14 Oct: a battle cover held for its images said nothing (up to BATTLE_READY_MS of black bars), and under
// reduced motion the capture tap's flash animated a box shadow (a white flash) instead of a colour fade (R8).
test.describe('what a wait and a capture tap say', () => {
  test("a battle cover waiting on its board's images says 'Loading Pokémon...', and opens without it", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await fresh(browser, cartBlue, null);
    // Every still arrives 2 s after it is asked for: the cover waits on them, well past COVER_LABEL_MS.
    await context.route(/\/assets\/static\//, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue().catch(() => undefined);
    });
    await boot(page);
    await page.getByTestId('two-players').waitFor({ timeout: 60_000 });
    await arm(page);
    const t0 = await now(page);
    await page.getByTestId('two-players').click({ timeout: 60_000 });
    await page.getByTestId('intro').waitFor({ timeout: 60_000 });
    const l = await ld(page);
    const said = l.frames.filter((f) => f.t >= t0 && f.cover === 'battle:up' && f.label);
    const open = firstFrame(l.frames, t0, (f) => f.cover === 'battle:open');
    console.log(`cover label: ${said.length ? `'${said[0]!.label}' from ${Math.round(said[0]!.t - t0)} ms after the tap` : 'never'}; open at ${open ? Math.round(open.t - t0) : '?'} ms`);
    expect(said.length, 'the held cover said why').toBeGreaterThan(0);
    expect(said[0]!.label).toBe('Loading Pokémon...');
    expect(open, 'the cover opened').toBeTruthy();
    expect(open!.label, 'the line is gone when the bars open').toBe('');
    await context.close();
  });

  test("reduced motion: the capture tap's flash is a colour fade of 120 ms at most, nothing moves", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await fresh(browser, { ...cartBlue, 'kc:v1:settings': { v: 2, anim: 'full' } }, null, 1, 'reduce');
    await boot(page);
    await page.getByTestId('two-players').click({ timeout: 60_000 });
    await page.getByTestId('intro').waitFor({ timeout: 60_000 });
    await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 30_000 });
    await kc(page, 'loadFen', FEN_D5);
    await page.evaluate(() => {
      const w = window as unknown as { __strike: { name: string; props: string[]; ms: number }[] };
      w.__strike = [];
      const known = new WeakSet<Animation>();
      const tick = () => {
        for (const a of document.getAnimations()) {
          if (known.has(a)) continue;
          known.add(a);
          const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
          if (!target?.classList.contains('strike')) continue;
          const props = [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((f) => Object.keys(f)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k));
          w.__strike.push({ name: (a as CSSAnimation).animationName ?? 'waapi', props, ms: Number(a.effect?.getComputedTiming().duration) || 0 });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.click('[data-square="e4"]');
    await page.click('[data-square="d5"]');
    await page.getByTestId('battle').waitFor({ state: 'visible', timeout: 30_000 });
    const anims = await page.evaluate(() => (window as unknown as { __strike: { name: string; props: string[]; ms: number }[] }).__strike);
    console.log(`reduced motion capture flash: ${JSON.stringify(anims)}`);
    expect(anims.length, 'the capture tap flashed its square').toBeGreaterThan(0);
    expect(anims.filter((a) => a.props.some((x) => !['opacity', 'backgroundColor', 'visibility'].includes(x)))).toEqual([]);
    expect(anims.filter((a) => a.ms > 120)).toEqual([]);
    await context.close();
  });
});

/** A new BLUE save from Oak's intro to the starter pick (the cartridge only: no save yet); a player reads the three. */
async function toStarters(page: Page): Promise<void> {
  await boot(page);
  await page.getByTestId('kanto').click({ timeout: 60_000 });
  for (let i = 0; i < 3; i++) await page.getByTestId('story').click({ timeout: 60_000 });
  await page.getByTestId('name-2').click({ timeout: 60_000 });
  await page.getByTestId('starter-bulbasaur').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}
/** The first start of species `dex`'s cry at or after the last tap on `id`, in ms after that tap's pointerdown. */
async function cryAfterTap(page: Page, id: string, dex: number): Promise<{ ms: number | null; cries: string }> {
  const l = await ld(page);
  const tap = l.taps.filter((x) => x.id === id && !x.up).at(-1)!;
  const cry = l.cries.find((c) => new RegExp(`^cries/${dex}\\.`).test(c.url) && c.t >= tap.t - 5);
  return { ms: cry ? cry.t - tap.t : null, cries: JSON.stringify(l.cries.map((c) => ({ ...c, t: Math.round(c.t - tap.t) }))) };
}

// Loading fix, 14 Oct (review): only the board's species were preloaded and every cry not ready within 150 ms was
// dropped, so on a phone network the starter's cry and each new wild Pokémon's were never heard.
test.describe('panel cries: the starter pick and a wild encounter, Fast 4G cold', () => {
  test("the starter's cry starts within 100 ms of the pick", async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, cartBlue, FAST_4G, 1);
    await toStarters(page);
    await page.getByTestId('starter-bulbasaur').click({ timeout: 60_000 });
    await expect.poll(async () => (await cryAfterTap(page, 'starter-bulbasaur', 1)).ms, { timeout: 3000 }).not.toBeNull().catch(() => undefined);
    const { ms, cries } = await cryAfterTap(page, 'starter-bulbasaur', 1);
    console.log(`starter pick: BULBASAUR's cry ${ms === null ? 'never' : `${Math.round(ms)} ms after the tap`} (${cries})`);
    expect(ms, "BULBASAUR's cry at the pick").not.toBeNull();
    expect(ms!).toBeLessThanOrEqual(100);
    await context.close();
  });

  test("a wild encounter's cry starts within 100 ms of 'Wild ... appeared!' (Viridian Forest)", async ({ browser }) => {
    test.setTimeout(240_000);
    // Past the warm-up, Route 1 and Viridian Forest walked before (PIDGEY, the warm-up's catch, never shows there).
    const save = { ...SAVE, badges: ['boulder'], journey: { cleared: ['route-1'], beaten: [], visited: ['route-1', 'viridian-forest'] } };
    const { context, page } = await fresh(browser, { ...cartBlue, 'kc:v1:campaign': save, 'kc:v1:settings': { v: 2, anim: 'off' } }, FAST_4G, 1);
    await boot(page);
    await page.getByTestId('kanto').click({ timeout: 60_000 });
    await kc(page, 'enterPlace', 'viridian-forest');
    await page.getByTestId('walk-grass').click({ timeout: 60_000 });
    // Solve the tall grass puzzle as a player would: the expected move on the player's turn, a tap through each hold.
    for (let i = 0; i < 300 && !(await page.getByTestId('encounter').isVisible().catch(() => false)); i++) {
      const phase = await kc<string>(page, 'puzzlePhase').catch(() => '');
      if (phase === 'player') {
        const uci = await kc<string | null>(page, 'puzzleAnswer');
        if (uci) {
          await page.click(`[data-square="${uci.slice(0, 2)}"]`).catch(() => undefined);
          await page.click(`[data-square="${uci.slice(2, 4)}"]`).catch(() => undefined);
          if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`).catch(() => undefined);
        }
      } else if (await page.locator('body[data-skippable]').count()) await page.keyboard.press('Space');
      else if (await page.getByTestId('lesson-ok').isVisible().catch(() => false)) await page.getByTestId('lesson-ok').click().catch(() => undefined);
      else if (await page.getByTestId('review-continue').isVisible().catch(() => false)) await page.getByTestId('review-continue').click().catch(() => undefined);
      await page.waitForTimeout(150);
    }
    await page.getByTestId('encounter').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    const l = await ld(page);
    const enc = l.encounters.at(-1)!;
    const dex = Number(/\/(\d+)\.\w+$/.exec((await page.locator('[data-testid="encounter"] img').first().getAttribute('src')) ?? '')?.[1]);
    const cry = l.cries.find((c) => new RegExp(`^cries/${dex}\\.`).test(c.url) && c.t >= enc.t - 100);
    console.log(`encounter: #${dex}'s cry ${cry ? `${Math.round(cry.t - enc.t)} ms after the panel` : 'never'} (${JSON.stringify(l.cries.slice(-3))})`);
    expect(dex).toBeGreaterThan(0);
    expect(cry, `#${dex}'s cry at 'Wild ... appeared!'`).toBeTruthy();
    expect(Math.abs(cry!.t - enc.t)).toBeLessThanOrEqual(100);
    await context.close();
  });

  test("a panel's cry that arrives late is still heard while the panel is up (the board's are not: see above)", async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await fresh(browser, cartBlue, null);
    // BULBASAUR's cry is held until 400 ms after the pick (its preload too): a slow network, not a missing file.
    let release: () => void = () => undefined;
    const released = new Promise<void>((r) => (release = r));
    await context.route(/\/assets\/cries\/1\.(ogg|mp3)$/, async (route) => {
      await released;
      await route.continue().catch(() => undefined);
    });
    await toStarters(page);
    await page.getByTestId('starter-bulbasaur').click({ timeout: 60_000 });
    await page.waitForTimeout(400);
    release();
    await expect.poll(async () => (await cryAfterTap(page, 'starter-bulbasaur', 1)).ms, { timeout: 3000 }).not.toBeNull().catch(() => undefined);
    const { ms, cries } = await cryAfterTap(page, 'starter-bulbasaur', 1);
    console.log(`late starter cry: ${ms === null ? 'never' : `${Math.round(ms)} ms after the tap`} (${cries})`);
    expect(ms, 'heard, late').not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(400);
    expect(ms!).toBeLessThanOrEqual(1000); // CRY_PANEL_LATE_MS: never later
    await context.close();
  });
});
