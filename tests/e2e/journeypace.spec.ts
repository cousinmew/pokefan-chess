// SPDX-License-Identifier: AGPL-3.0-only
// The Journey's moments, timed (Fix, 13 Oct; owner: "all the sprites and animations to load in a timely fashion as well
// as everything being logically well timed for players to understand the inputs and outputs"): an evolution shows and
// says the new form; a badge's evolutions come after the badge; a catch has a beat and says what it gave; first clears
// and gifts come in order; a battle left half way keeps its pips; battle art is fetched ahead; tall grass says its rule;
// the Pokédex and My Team load only what shows; Training says what its number is. Real timings, measured in the page.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { coldGoto, noTransition, ready, settled, tapSplash } from './pace';

type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);
const ALL_THEMES = ['advancedPawn', 'advantage', 'backRankMate', 'capturingDefender', 'castling', 'deflection', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'fork', 'hangingPiece', 'mateIn1', 'mateIn2', 'pin', 'promotion', 'skewer', 'trappedPiece', 'xRayAttack'];
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1 }, warmup: true, lessonsSeen: ALL_THEMES, tips: ['puzzle'], journey: { cleared: [], beaten: [], visited: ['route-1'] } };
/** Quiet mate in 1: the set up Ra6-a8, then Re2-e1# (e2h2 misses). */
const QUIET1 = ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480];
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 };
const FAST_4G = { offline: false, latency: 165, downloadThroughput: 1_012_500, uploadThroughput: 84_375 };
type Place = { id: string; kind: string; optional?: boolean; badge?: string; trainers?: { id: string }[] };
const PLACES = (JSON.parse(readFileSync('src/data/journey.kanto.json', 'utf8')) as { places: Place[] }).places;
/** A save that has cleared every required place before `id`: its trainers beaten, its badges won, its gifts given. */
function upTo(id: string, extra: object = {}) {
  const before = PLACES.slice(0, PLACES.findIndex((p) => p.id === id)).filter((p) => !p.optional && p.kind !== 'champion');
  const cleared = before.map((p) => p.id);
  const beaten = before.flatMap((p) => (p.trainers ?? []).map((t) => t.id));
  const badges = before.flatMap((p) => (p.kind === 'gym' && p.badge ? [p.badge] : []));
  return { ...SAVE, badges, rewards: cleared, journey: { cleared, beaten, visited: ['route-1'] }, ...extra };
}

/** A page load into the hub (YELLOW: its home), the splash tapped once the page has loaded. `cold`: the network is
 * throttled from the first request, so the tap takes a splash already gone by itself (see coldGoto, tapSplash: on a
 * busy runner `load` came after the splash had moved on, and J9's tap timed out). */
async function open(page: Page, save: object = SAVE, o: { settings?: object; cartridge?: string; trainer?: object; cold?: boolean } = {}) {
  await page.addInitScript(probe);
  await page.addInitScript(([s, set, cart, tr]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kc:v1:cartridge', JSON.stringify(cart));
    localStorage.setItem('kc:v1:campaign', JSON.stringify(s));
    localStorage.setItem('kc:v1:settings', JSON.stringify(set));
    if (tr) localStorage.setItem('kc:v1:trainer', JSON.stringify(tr));
  }, [save, o.settings ?? { v: 2, anim: 'off', sound: false }, o.cartridge ?? 'blue', o.trainer ?? null] as const);
  if (o.cold) {
    await coldGoto(page);
    await page.waitForLoadState('load', { timeout: 120_000 });
    await tapSplash(page);
  } else {
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
  }
  await expect(page.getByTestId(o.cartridge === 'yellow' ? 'screen-yellow' : 'screen-title')).toBeVisible(o.cold ? { timeout: 60_000 } : {});
}

async function throttle(page: Page, net: object, cpu = 1): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', net as never);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
}

type Ev = { t: number; ev: string; v: string };
type Probe = { log: Ev[]; flash: { src: string; ok: boolean }[]; intro: { n: number; complete: number } | null };
/** Each frame, what the player sees: the card over the screen (test id and text), the battle or evolution screen and
 * its text, the toast; the target sprite on the first frame of each evolution flash; the "wants to battle!" card's
 * Pokémon on its first frame. */
function probe(): void {
  const w = window as unknown as { __jp: Probe };
  const P: Probe = (w.__jp = { log: [], flash: [], intro: null });
  const last: Record<string, string> = {};
  const tick = () => {
    const o = document.querySelector<HTMLElement>('#app > .overlay');
    const panel = o && !o.hidden ? o.querySelector<HTMLElement>(':scope > .panel') : null;
    const b = document.querySelector<HTMLElement>('[data-testid="battle"]');
    const on = !!b && !b.hidden;
    const def = on ? b!.querySelector('.mon.def') : null;
    const now: Record<string, string> = {
      card: panel ? `${panel.dataset.testid ?? ''}|${(panel.textContent ?? '').replace(/\s+/g, ' ').trim()}` : '',
      battle: on ? 'on' : '',
      text: on ? (b!.querySelector('[data-testid="battle-text"]')?.textContent ?? '') : '',
      phase: def ? (def.classList.contains('evo') ? 'evo' : 'def') : '',
      toast: document.querySelector('[data-testid="toast"]')?.textContent ?? '',
    };
    if (last.phase === 'evo' && now.phase === 'def') {
      const img = def!.querySelector('img');
      P.flash.push({ src: img?.getAttribute('src') ?? '', ok: !!img && img.complete && img.naturalWidth > 0 });
    }
    if (!P.intro && panel?.dataset.testid === 'trainer-intro') {
      const imgs = [...panel.querySelectorAll<HTMLImageElement>('.kings img')];
      P.intro = { n: imgs.length, complete: imgs.filter((i) => i.complete && i.naturalWidth > 0).length };
    }
    for (const [k, v] of Object.entries(now)) if (last[k] !== v) P.log.push({ t: performance.now(), ev: k, v });
    Object.assign(last, now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const probed = (page: Page) => page.evaluate(() => (window as unknown as { __jp: Probe }).__jp);
/** How long each battle text containing `part` stayed on screen (ms); [-1] when it never showed. */
function shown(log: Ev[], part: string): number[] {
  const out = log.flatMap((e, i) => (e.ev === 'text' && e.v.includes(part) ? [(log.slice(i + 1).find((x) => x.ev === 'text' || (x.ev === 'battle' && !x.v))?.t ?? Infinity) - e.t] : []));
  return out.length ? out : [-1];
}
const move = async (page: Page, uci: string) => {
  await page.click(`[data-square="${uci.slice(0, 2)}"]`);
  await page.click(`[data-square="${uci.slice(2, 4)}"]`);
};
const tapCentre = async (page: Page) => page.mouse.click((page.viewportSize()?.width ?? 390) / 2, (page.viewportSize()?.height ?? 844) / 3);

/** From "wants to battle!": quiet mates in 1, solved (e2e1) or missed (e2h2), each up to its review; `cont`: Continue. */
async function play(page: Page, moves: string[], cont = true) {
  for (const [i, uci] of moves.entries()) {
    await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
    if (i === 0) {
      if (await page.getByTestId('trainer-intro').count()) await page.getByTestId('trainer-intro').click();
      await page.getByTestId('goal-card').click();
    } else await page.getByTestId('review-continue').click();
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
    await move(page, uci);
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 30_000 }).toBe('review');
  }
  if (cont) await page.getByTestId('review-continue').click();
}

/** Taps story lines (at their ▼) until "wants to battle!" or the goal card is up. */
async function toCard(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    const c = page.locator('#app > .overlay:not([hidden]) > .panel').first();
    await c.waitFor();
    const id = (await c.getAttribute('data-testid'))!;
    seen.push(id);
    if (id !== 'story') return seen;
    await ready(page, 'story');
    await c.click();
    await page.waitForTimeout(30);
  }
  return seen;
}

/** After the last Continue: taps each card at its ▼ and each evolution once it can be skipped, until the map shows. */
async function tapThrough(page: Page): Promise<number> {
  let evoTaps = 0;
  for (let i = 0; i < 30; i++) {
    const card = page.locator('#app > .overlay:not([hidden]) > .panel[data-ready]').first();
    const evo = page.locator('[data-testid="battle"]:not([hidden])[data-skippable]');
    const which = await Promise.race([
      card.waitFor({ timeout: 20_000 }).then(() => 'card', () => 'none'),
      evo.waitFor({ timeout: 20_000 }).then(() => 'evo', () => 'none'),
      page.getByTestId('screen-map').waitFor({ timeout: 20_000 }).then(() => 'map', () => 'none'),
    ]);
    if (which === 'map' && !(await page.locator('#app > .overlay:not([hidden]) > .panel').count())) return evoTaps;
    if (which === 'evo') {
      evoTaps++;
      await tapCentre(page);
      await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-testid="battle"]')?.dataset.skippable === undefined || document.querySelector<HTMLElement>('[data-testid="battle"]')!.hidden);
    } else if (which === 'card') await card.click();
  }
  return evoTaps;
}

test.use({ viewport: { width: 390, height: 844 } });

// J1: Slow 4G and a 4x slower CPU, cold: the evolved form is decoded when it is revealed, and the screen says so.
for (const run of [1, 2, 3]) {
  test(`J1 Pokédex: Slow 4G cold, CHARMELEON is decoded at the flash and "evolved into" holds 1 s; OAK says thanks (run ${run})`, async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, { ...SAVE, caught: { bulbasaur: 1 } });
    await kc(page, 'grant', 'charmander', 9); // 27 candy: CHARMELEON costs 25
    await page.getByTestId('kanto').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await settled(page);
    await throttle(page, SLOW_4G, 4);
    await page.getByTestId('open-dex').click();
    await page.getByTestId('dex-charmander').click();
    await page.getByTestId('evolve-charmeleon').click({ timeout: 30_000 });
    await expect(page.getByTestId('dex-detail')).toContainText('CHARMELEON x1', { timeout: 30_000 });
    const p = await probed(page);
    expect(p.flash).toHaveLength(1);
    expect(p.flash[0]!.src).toMatch(/\/5\.(gif|webp|png)$/);
    expect(p.flash[0]!.ok).toBe(true);
    expect(Math.min(...shown(p.log, 'CHARMANDER evolved into CHARMELEON!'))).toBeGreaterThanOrEqual(1000);
    expect(p.log.filter((e) => e.ev === 'toast').map((e) => e.v)).toContain('CHARMANDER evolved into CHARMELEON!');
    await expect(page.getByTestId('dex-detail')).toContainText('CHARMANDER evolved into CHARMELEON!');
    await page.waitForTimeout(2600); // the new form and its line stay until the player closes the entry
    await expect(page.getByTestId('dex-detail')).toContainText('CHARMANDER evolved into CHARMELEON!');
    await page.getByTestId('dex-close').click();
    await page.getByTestId('dex-charmander').click();
    await page.getByTestId('send-oak').click();
    await expect(page.getByTestId('dex-detail')).toContainText("OAK: Thanks! Here's a candy for your CHARMANDER.");
    await expect(page.locator('[data-testid="dex-detail"] .changed')).toHaveCount(2); // x9 to x8, candy 5 to 6
  });
}

/** From the next click on Evolve: the frames before the evolution screen with neither a card nor it up (the bare grid,
 * which takes taps), and each screen shown. */
const watchEvolve = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __gap: { bare: number; screens: string[] } };
    const g = (w.__gap = { bare: 0, screens: [] as string[] });
    let on = false;
    let evo = false;
    document.addEventListener('click', (e) => (e.target as Element).closest('[data-testid^="evolve-"]') && (on = true), { capture: true });
    const tick = () => {
      const b = document.querySelector<HTMLElement>('[data-testid="battle"]');
      const m = document.querySelector<HTMLElement>('#app > .overlay');
      evo ||= !!b && !b.hidden;
      if (on && !evo && (!m || m.hidden) && (!b || b.hidden)) g.bare++;
      if (on && g.screens.at(-1) !== document.body.dataset.screen) g.screens.push(document.body.dataset.screen ?? '');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

// Review (R2): Evolve hid the entry, then left the bare grid up for about 0.5 s while the sprites decoded; Back in that
// gap went to the map, and the evolution's end then pulled the player back into the Pokédex.
test('J1 Pokédex: Slow 4G cold, the evolution screen is up from the tap on Evolve; a tap 150 ms later does not leave', async ({ page }) => {
  test.setTimeout(150_000);
  await open(page, { ...SAVE, caught: { bulbasaur: 1 } });
  await kc(page, 'grant', 'charmander', 9);
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await settled(page);
  await throttle(page, SLOW_4G, 4);
  await page.getByTestId('open-dex').click();
  await page.getByTestId('dex-charmander').click();
  const back = (await page.getByTestId('back').boundingBox())!;
  await watchEvolve(page);
  await page.getByTestId('evolve-charmeleon').click({ timeout: 30_000 });
  await page.waitForTimeout(150); // a player who changes their mind, as soon as the entry is gone
  await page.mouse.click(back.x + back.width / 2, back.y + back.height / 2);
  await expect(page.getByTestId('dex-detail')).toContainText('CHARMANDER evolved into CHARMELEON!', { timeout: 30_000 });
  const gap = await page.evaluate(() => (window as unknown as { __gap: { bare: number; screens: string[] } }).__gap);
  expect(gap).toEqual({ bare: 0, screens: ['screen-dex'] });
});

test('J1 Pokédex: a screen left during the evolution stays left (the Pokédex does not come back)', async ({ page }) => {
  await open(page, { ...SAVE, caught: { bulbasaur: 1 } });
  await kc(page, 'grant', 'charmander', 9);
  await page.getByTestId('kanto').click();
  await page.getByTestId('open-dex').click();
  await page.getByTestId('dex-charmander').click();
  await page.getByTestId('evolve-charmeleon').click();
  await expect(page.getByTestId('battle')).toBeVisible();
  await kc(page, 'setMode', 'computer', 1, 'w'); // as a new game would, while it plays
  await expect(page.getByTestId('screen-game')).toBeVisible();
  await page.waitForTimeout(3000); // longer than the evolution's whole sequence
  await expect(page.getByTestId('screen-game')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.screen)).toBe('screen-game');
});

// Review (R2): the Gen 1 sprite was used only once the animation and the still had both failed, so a target whose files
// stall showed an empty box at the reveal and the swap blinked against nothing.
test('J1: a target whose animation and still stall shows its Gen 1 sprite in every frame of the evolution', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(/\/assets\/(front\/5\.(gif|webp)|static\/front\/5\.png)$/, async (r) => {
    await new Promise((res) => setTimeout(res, 10_000));
    await r.continue().catch(() => undefined);
  });
  await open(page, { ...SAVE, caught: { bulbasaur: 1 } });
  await kc(page, 'grant', 'charmander', 9);
  await page.getByTestId('kanto').click();
  await page.getByTestId('open-dex').click();
  await page.getByTestId('dex-charmander').click();
  await expect(page.locator('[data-testid="dex-detail"] img')).toHaveJSProperty('complete', true);
  await page.evaluate(() => {
    const w = window as unknown as { __empty: string[] };
    w.__empty = [];
    const tick = () => {
      const b = document.querySelector<HTMLElement>('[data-testid="battle"]');
      const i = b && !b.hidden ? b.querySelector<HTMLImageElement>('.mon.def img') : null;
      if (b && !b.hidden && !(i && i.complete && i.naturalWidth > 0)) w.__empty.push(i?.getAttribute('src') ?? 'none');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByTestId('evolve-charmeleon').click();
  await expect(page.getByTestId('dex-detail')).toContainText('CHARMANDER evolved into CHARMELEON!', { timeout: 15_000 });
  const p = await probed(page);
  expect(p.flash).toEqual([{ src: expect.stringMatching(/\/retro\/5\.png$/), ok: true }]);
  expect(await page.evaluate(() => (window as unknown as { __empty: string[] }).__empty)).toEqual([]);
});

test('J1 vs Computer: a promotion holds "… evolved into …!" on the evolution screen for at least 1000 ms', async ({ page }) => {
  await open(page, SAVE, { settings: { v: 2, anim: 'full', sound: false } });
  await kc(page, 'setMode', 'computer', 1, 'w');
  await kc(page, 'loadFen', '7k/P7/8/8/8/8/8/K7 w - - 0 1');
  await noTransition(page);
  await move(page, 'a7a8');
  await page.locator('[data-testid="promotion"] button[data-role="q"]').click();
  await expect(page.getByTestId('battle')).toBeVisible();
  await page.getByTestId('battle').waitFor({ state: 'hidden', timeout: 10_000 });
  const p = await probed(page);
  expect(p.log.filter((e) => e.ev === 'text').map((e) => e.v)).toContainEqual(expect.stringMatching(/^EEVEE evolved into [A-Z]+!$/));
  expect(Math.min(...shown(p.log, 'evolved into'))).toBeGreaterThanOrEqual(1000);
});

test('J2: a badge that evolves the team: "You won!", the badge, the line that says why, then one tap per evolution', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, upTo('vermilion-gym'));
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await kc(page, 'enterPlace', 'vermilion-gym');
  await toCard(page);
  await play(page, ['e2e1', 'e2e1', 'e2e1']); // gym 3: 3 of 5
  const taps = await tapThrough(page);
  const l = (await probed(page)).log;
  const at = (f: (e: Ev) => boolean) => l.find(f)?.t ?? Infinity;
  const win = at((e) => e.ev === 'card' && e.v.startsWith('win-card|'));
  const badge = at((e) => e.ev === 'card' && e.v.startsWith('badge-card|'));
  const why = at((e) => e.ev === 'card' && e.v.includes("That's 3 badges! Your team is evolving!"));
  const evo = at((e) => e.ev === 'battle' && e.v === 'on');
  expect(Object.entries({ win, badge, why, evo }).sort((a, b) => a[1] - b[1]).map(([k, t]) => (t === Infinity ? `${k}: never` : k))).toEqual(['win', 'badge', 'why', 'evo']);
  expect(l.filter((e) => e.ev === 'text' && /is evolving!$/.test(e.v)).map((e) => e.v)).toEqual(['What? CHARMANDER is evolving!', 'What? PONYTA is evolving!', 'What? SQUIRTLE is evolving!', 'What? BULBASAUR is evolving!']);
  expect(taps).toBe(4);
  const unlock = at((e) => e.ev === 'card' && e.v.startsWith('unlock-card|'));
  expect(unlock).toBeLessThan(Infinity);
  expect(l.filter((e) => e.ev === 'battle' && e.v === 'on' && e.t >= unlock)).toEqual([]); // no evolution after it
});

test.describe('J3, J11: a catch', () => {
  test('a new catch: the ball\'s beat, then the result, the candy and the Pokédex; the way back names the route', async ({ page }) => {
    await open(page);
    await grassSolve(page);
    const t = await throwBall(page);
    expect(t.result).toBeGreaterThanOrEqual(1000);
    await expect(page.getByTestId('encounter-text')).toHaveText(/^Gotcha! (PIDGEY|RATTATA) was caught!$/);
    const name = (await page.getByTestId('encounter-text').textContent())!.match(/(PIDGEY|RATTATA)/)![1]!;
    await expect(page.getByTestId('enc-gains')).toHaveText([`+3 ${name} candy`, 'New! Pokédex 2/151']);
    expect(t.buttons).toBeGreaterThanOrEqual(t.result);
    await expect(page.getByTestId('to-map')).toHaveText('Back to ROUTE 1');
  });

  test('a duplicate says x2; a tap after the first 250 ms skips the beat', async ({ page }) => {
    await open(page, { ...SAVE, caught: { bulbasaur: 1, pidgey: 1, rattata: 1 } });
    await grassSolve(page);
    const t = await throwBall(page, true);
    expect(t.result).toBeLessThan(1000);
    const name = (await page.getByTestId('encounter-text').textContent())!.match(/(PIDGEY|RATTATA)/)![1]!;
    await expect(page.getByTestId('enc-gains')).toHaveText([`+3 ${name} candy`, `${name} x2`]);
  });
});

/** Route 1's tall grass, a solve, Continue: "Wild … appeared!". */
async function grassSolve(page: Page) {
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
  await page.getByTestId('walk-grass').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
  await move(page, 'e2e1');
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('review');
  await page.getByTestId('review-continue').click();
  await expect(page.getByTestId('encounter-text')).toHaveText(/^Wild (PIDGEY|RATTATA) appeared!$/);
}

/** Throws (after its guard) and times, from the tap, the result line and the buttons; `skip` taps the panel once the
 * beat can be skipped. */
async function throwBall(page: Page, skip = false): Promise<{ result: number; buttons: number }> {
  await page.locator('[data-testid="throw-ball"]:not([disabled])').waitFor();
  await page.evaluate(() => {
    const w = window as unknown as { __thr: { t0: number; result: number; buttons: number } };
    const text = document.querySelector('[data-testid="encounter-text"]')!;
    const was = text.textContent;
    w.__thr = { t0: 0, result: 0, buttons: 0 };
    document.querySelector('[data-testid="throw-ball"]')!.addEventListener('click', () => (w.__thr.t0 = performance.now()), { capture: true, once: true });
    const tick = () => {
      const t = performance.now() - w.__thr.t0;
      if (w.__thr.t0 && !w.__thr.result && text.textContent !== was) w.__thr.result = t;
      if (w.__thr.t0 && !w.__thr.buttons && document.querySelector('[data-testid="walk-again"], [data-testid="enc-next"]')) w.__thr.buttons = t;
      if (!w.__thr.result || !w.__thr.buttons) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByTestId('throw-ball').click();
  if (skip) {
    await page.locator('body[data-skippable]').waitFor();
    await page.getByTestId('encounter').click({ position: { x: 8, y: 8 } });
  }
  await page.getByTestId('walk-again').waitFor();
  return page.evaluate(() => (window as unknown as { __thr: { result: number; buttons: number } }).__thr);
}

test.describe('J4: first clears and gifts in order', () => {
  test('Victory Road\'s second drill: the unlock card, then the map stamps the row and ▶ pulses', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, upTo('victory-road'));
    await page.getByTestId('kanto').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await kc(page, 'enterPlace', 'victory-road');
    for (const fen of ['k7/8/1K6/8/8/8/8/7Q w - - 0 1', 'k7/8/1K6/8/8/8/8/7R w - - 0 1']) {
      await toCard(page);
      await page.getByTestId('goal-card').click();
      await expect(page.getByTestId('screen-game')).toBeVisible();
      await noTransition(page);
      await kc(page, 'loadFen', fen);
      await move(page, 'h1h8');
      await expect(page.getByTestId('story-text')).toHaveText('Checkmate! Drill complete.', { timeout: 10_000 });
      await ready(page, 'story');
      await page.getByTestId('story').click();
    }
    await expect(page.getByTestId('unlock-card')).toContainText('VICTORY ROAD cleared!');
    await expect(page.getByTestId('unlock-card')).toContainText('Next: ');
    await ready(page, 'unlock-card');
    await page.getByTestId('unlock-card').click();
    await expect(page.locator('[data-testid="place-victory-road"].stamp-now')).toBeAttached({ timeout: 5000 });
    await expect(page.locator('[data-testid="map-current"].next-pulse')).toBeAttached({ timeout: 5000 });
  });

  test('rival BLUE\'s first win: the gift card with BULBASAUR and the Pokédex count comes before "Next:"', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, upTo('rival-1', { starter: 'charmander', caught: { charmander: 1 } }));
    await page.getByTestId('kanto').click();
    await kc(page, 'enterPlace', 'rival-1');
    await toCard(page);
    await play(page, ['e2e1', 'e2e1', 'e2e1']);
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      const card = page.locator('#app > .overlay:not([hidden]) > .panel').first();
      const which = await Promise.race([card.waitFor({ timeout: 15_000 }).then(() => 'card', () => 'none'), page.getByTestId('screen-map').waitFor({ timeout: 15_000 }).then(() => 'map', () => 'none')]);
      if (which === 'map') break;
      const id = (await card.getAttribute('data-testid'))!;
      order.push(`${id}|${(await card.textContent()) ?? ''}`);
      if (id === 'gift-card') {
        await expect(card.locator('img[data-species="bulbasaur"]')).toBeVisible();
        await expect(card).toContainText('Pokédex: 2 of 151 caught');
      }
      await ready(page, id);
      await card.click();
    }
    const gift = order.findIndex((x) => x.startsWith('gift-card|'));
    const next = order.findIndex((x) => x.includes('Next: '));
    expect(gift).toBeGreaterThanOrEqual(0);
    expect(gift).toBeLessThan(next);
    expect(order.filter((x) => x.includes('Next: '))).toHaveLength(1);
    expect(order.at(-1)).toMatch(/^unlock-card\|/);
  });

  // Review (R2): a choice's story and the unlock card came over the choice screen with both choices still on offer.
  test('Mt. Moon\'s fossil: once picked, the screen under "You received" and the unlock card shows only the pick', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, upTo('mt-moon'));
    await page.getByTestId('kanto').click();
    await kc(page, 'enterPlace', 'mt-moon');
    await toCard(page);
    await play(page, ['e2e1', 'e2e1']); // 2 of 3
    for (let i = 0; i < 8 && !(await page.getByTestId('screen-choice').count()); i++) {
      const card = page.locator('#app > .overlay:not([hidden]) > .panel[data-ready]').first();
      await Promise.race([card.waitFor({ timeout: 15_000 }), page.getByTestId('screen-choice').waitFor({ timeout: 15_000 })]);
      if (!(await page.getByTestId('screen-choice').count())) await card.click();
    }
    await page.getByTestId('choose-omanyte').click();
    for (const id of ['story', 'unlock-card']) {
      await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId('choose-kabuto')).toBeHidden();
      await expect(page.getByTestId('choose-omanyte')).toBeVisible();
      await expect(page.getByTestId('choose-omanyte')).toBeDisabled();
      await ready(page, id);
      await page.getByTestId(id).click();
    }
    await expect(page.getByTestId('screen-map')).toBeVisible();
  });
});

// Review (R2, J13): the Champion's story handed over to "wants to battle!" with the card and BLUE fading in from 0.
test('J13: the Champion\'s story hands over with BLUE seen in every frame', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __seen: { t: number; a: number; intro: boolean }[] };
    w.__seen = [];
    const shownAt = (s: Element) => { let a = 1; for (let e: Element | null = s; e; e = e.parentElement) a *= Number(getComputedStyle(e).opacity); return a; };
    const tick = () => {
      const o = document.querySelector<HTMLElement>('#app > .overlay');
      if (o && !o.hidden) w.__seen.push({ t: performance.now(), a: Math.max(0, ...[...o.querySelectorAll('.trainer-sprite')].map(shownAt)), intro: !!o.querySelector('[data-testid="trainer-intro"]') });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await open(page, upTo('champion'));
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await noTransition(page);
  await kc(page, 'enterPlace', 'champion');
  let t0 = 0;
  while (!(await page.getByTestId('trainer-intro').count())) {
    await ready(page, 'story');
    t0 = await page.evaluate(() => performance.now());
    await page.getByTestId('story').click();
    await page.locator('[data-testid="trainer-intro"], [data-testid="story"]').first().waitFor();
  }
  await ready(page, 'trainer-intro');
  const f = (await page.evaluate(() => (window as unknown as { __seen: { t: number; a: number; intro: boolean }[] }).__seen)).filter((x) => x.t >= t0);
  expect(f.filter((x) => x.intro).length).toBeGreaterThan(5);
  expect(f.filter((x) => x.a < 0.5)).toEqual([]);
  await expect(page.getByTestId('trainer-intro')).toHaveClass(/handover/);
});

test('J5: a battle left half way keeps its pips: re-entering Brock shows the goal card and ●●○○○ need 1', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, upTo('pewter-gym'));
  await page.getByTestId('kanto').click();
  await kc(page, 'enterPlace', 'pewter-gym');
  await toCard(page);
  await play(page, ['e2e1', 'e2e1'], false);
  await expect(page.getByTestId('puzzle-banner')).toHaveText('LEADER BROCK ●●○○○ need 1');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-journey').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await noTransition(page);
  await kc(page, 'enterPlace', 'pewter-gym');
  expect(await toCard(page)).toEqual(['goal-card']);
  await expect(page.getByTestId('pips')).toHaveText('●●○○○');
  await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
  await page.getByTestId('goal-card').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
  await expect(page.getByTestId('puzzle-banner')).toHaveText('LEADER BROCK ●●○○○ need 1');
});

for (const run of [1, 2, 3]) {
  test(`J6: Slow 4G cold, MEWTWO is in when "wants to battle!" first shows, for a player who taps at ▼ (run ${run})`, async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, upTo('cerulean-cave'));
    await page.getByTestId('kanto').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await settled(page);
    await throttle(page, SLOW_4G, 4);
    await kc(page, 'enterPlace', 'cerulean-cave');
    await toCard(page);
    expect((await probed(page)).intro).toEqual({ n: 1, complete: 1 });
  });
}

test('J7: tall grass says its rule, and after a miss that the Pokémon ran away', async ({ page }) => {
  await open(page);
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
  await page.getByTestId('walk-grass').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
  await expect(page.getByTestId('puzzle-banner')).toHaveText('Solve it to meet a wild Pokémon!');
  await move(page, 'e2h2');
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 30_000 }).toBe('review');
  await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
  await page.getByTestId('review-continue').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('setup');
  await expect(page.getByTestId('puzzle-banner')).toHaveText('It ran away! Try another.');
});

/** Every sprite image requested from `from` on, with its size once it has finished. */
function spriteRequests(page: Page) {
  const seen: { url: string; bytes: number }[] = [];
  let on = false;
  page.on('requestfinished', async (r) => {
    if (!on || r.resourceType() !== 'image' || !/\/assets\/(front|back|shiny|static|retro)\//.test(r.url())) return;
    const s = await r.sizes().catch(() => null);
    seen.push({ url: r.url(), bytes: (s?.responseBodySize ?? 0) + (s?.responseHeadersSize ?? 0) });
  });
  page.on('requestfailed', (r) => on && seen.push({ url: r.url(), bytes: 0 }));
  return { start: () => (on = true), seen };
}

test.describe('J8: the Pokédex and the sticker book load only what shows', () => {
  test('the Pokédex: at most 40 sprite requests and 200 KB before scrolling, no animation of an uncaught species', async ({ page }) => {
    await open(page, { ...SAVE, caught: { bulbasaur: 1, pidgey: 2, rattata: 1 }, seen: ['bulbasaur', 'pidgey', 'rattata', 'spearow'] });
    await page.getByTestId('kanto').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await kc(page, 'spritesReady');
    await settled(page);
    const req = spriteRequests(page);
    req.start();
    await page.getByTestId('open-dex').click();
    await expect(page.getByTestId('screen-dex')).toBeVisible();
    await settled(page);
    await page.waitForTimeout(1500);
    const caughtDex = ['1', '16', '19'];
    const animated = req.seen.filter((r) => /\/(front|shiny\/front)\/(\d+)\.(gif|webp)$/.test(r.url)).map((r) => r.url.match(/\/(\d+)\.(gif|webp)$/)![1]!);
    console.log(`[J8] Pokédex: ${req.seen.length} sprite requests, ${req.seen.reduce((n, r) => n + r.bytes, 0)} bytes`);
    expect(req.seen.length).toBeLessThanOrEqual(40);
    expect(req.seen.reduce((n, r) => n + r.bytes, 0)).toBeLessThanOrEqual(200_000);
    expect(animated.filter((d) => !caughtDex.includes(d))).toEqual([]);
  });

  test('YELLOW\'s sticker book: at most 40 sprite requests before scrolling', async ({ page }) => {
    await open(page, { ...SAVE, caught: { pikachu: 1, pidgey: 1 } }, { cartridge: 'yellow' });
    await kc(page, 'spritesReady');
    await settled(page);
    const req = spriteRequests(page);
    req.start();
    await page.getByTestId('start-button-corner').click();
    await page.getByTestId('start-menu-dex').click();
    await expect(page.getByTestId('screen-dex')).toBeVisible();
    await settled(page);
    await page.waitForTimeout(1500);
    console.log(`[J8] sticker book: ${req.seen.length} sprite requests`);
    expect(req.seen.length).toBeLessThanOrEqual(40);
  });
});

// The budgets are for production's HTTP/2, where the cells' requests go out together: set PERF_H2_URL to an HTTP/2 front
// of the preview (the audit's h2proxy). vite preview is HTTP/1.1 (6 connections, a round trip each): its numbers are
// logged too, for comparison.
test.describe('@perf J8: the first 24 Pokédex cells decode soon after the reveal (cache on, median of 3)', () => {
  for (const [name, net, budget] of [['Fast 4G', FAST_4G, 400], ['Slow 4G', SLOW_4G, 1000]] as const) {
    test(`${name}: within ${budget} ms`, async ({ browser }, info) => {
      test.setTimeout(240_000);
      const base = process.env.PERF_H2_URL ?? info.project.use.baseURL;
      const times: { first24: number; inView: number }[] = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        const page = await context.newPage();
        await open(page, { ...SAVE, caught: { bulbasaur: 1, pidgey: 2 } });
        await page.getByTestId('kanto').click();
        await settled(page);
        await throttle(page, net, net === SLOW_4G ? 4 : 1);
        await page.getByTestId('open-dex').click();
        times.push(await page.evaluate(async () => {
          while (document.documentElement.dataset.transition !== undefined || !document.querySelector('[data-testid="screen-dex"]')) await new Promise((r) => requestAnimationFrame(r));
          const t0 = performance.now();
          const body = document.querySelector('[data-testid="screen-dex"] .menu-body')!.getBoundingClientRect();
          const cells = [...document.querySelectorAll<HTMLImageElement>('.dex-cell img')];
          const inView = cells.filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > body.top && r.top < body.bottom; });
          const done = (list: HTMLImageElement[]) => list.every((i) => i.complete && i.naturalWidth > 0);
          let first24 = 0;
          while (!done(inView) && performance.now() - t0 < 60_000) {
            if (!first24 && done(cells.slice(0, 24))) first24 = Math.round(performance.now() - t0);
            await new Promise((r) => requestAnimationFrame(r));
          }
          return { first24: first24 || Math.round(performance.now() - t0), inView: Math.round(performance.now() - t0) };
        }));
        await context.close();
      }
      const median = times.map((t) => t.first24).sort((a, b) => a - b)[1]!;
      console.log(`[perf J8] ${name} over ${base}: ${JSON.stringify(times)} ms after the reveal (first 24, all in view), median of the first 24 ${median}`);
      // Review (R2): over vite preview's HTTP/1.1 the budgets do not apply (each request waits for one of 6 connections),
      // so without an HTTP/2 front the numbers are logged and noted, not judged.
      if (!process.env.PERF_H2_URL) return void info.annotations.push({ type: 'perf', description: `HTTP/1.1, not judged (set PERF_H2_URL): median ${median} ms, budget ${budget} ms` });
      expect(median).toBeLessThanOrEqual(budget);
    });
  }
});

/** From MY TEAM's first frame, 2.5 s of frames: in each, how many rows show no painted Pokémon (the animation, or its Gen 1
 * placeholder fetched); 100 more while the 7 rows are not all there. */
const teamFrames = (page: Page, pick?: [string, string]) =>
  page.evaluate(async (change) => {
    while (!document.querySelector('[data-testid="screen-team"]')) await new Promise((r) => requestAnimationFrame(r));
    const sel = change && document.querySelector<HTMLSelectElement>(`[data-testid="team-${change[0]}"]`);
    const loaded = (url: string) => performance.getEntriesByName(new URL(url, location.href).href).some((e) => (e as PerformanceResourceTiming).responseEnd > 0);
    const painted = (i: HTMLImageElement) => (i.complete && i.naturalWidth > 0) || loaded(/url\("?([^")]+)"?\)/.exec(i.style.backgroundImage)?.[1] ?? 'about:blank');
    const out: number[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 2500) {
      const rows = [...document.querySelectorAll('.team-row')];
      out.push(rows.filter((r) => { const i = r.querySelector('img'); return !i || !painted(i); }).length + (rows.length === 7 ? 0 : 100));
      if (sel && out.length === 1) {
        sel.value = change[1]; // a pick, one frame in
        sel.dispatchEvent(new Event('change'));
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  }, pick);
const noEmptyRow = (frames: number[]) => {
  expect(frames.length).toBeGreaterThan(10);
  expect({ frames: frames.length, withAnEmptyRow: frames.filter((n) => n > 0).length, mostEmpty: Math.max(...frames) }).toMatchObject({ withAnEmptyRow: 0 });
};

test('J9: Slow 4G cold, every My Team row shows a painted Pokémon in every frame', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, { ...SAVE, caught: { bulbasaur: 1, pidgey: 1, rattata: 1, caterpie: 1 }, team: { p: 'pidgey' } });
  await throttle(page, SLOW_4G, 4);
  await page.getByTestId('kanto').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await settled(page);
  // A player looks at the map for a moment before MY TEAM (the map fetches its placeholders meanwhile; on HTTP/1.1, as
  // here, 7 requests share 6 connections with the battle preload, about two round trips of 562 ms).
  await page.waitForTimeout(1500);
  await page.getByTestId('open-team').click();
  noEmptyRow(await teamFrames(page));
  // Merge review, 14 Oct: a new pick's preview was an empty box for about 0.6 s (its placeholder one round trip away).
  noEmptyRow(await teamFrames(page, ['p', 'caterpie']));
  await expect(page.locator('.team-row:has([data-testid="team-p"]) img')).toHaveAttribute('data-species', 'caterpie');
});

// Review (R2): only the map fetched the placeholders, so MY TEAM straight from the hub tile (the audit's own path) still
// showed empty rows for about 0.8 s on a cold Slow 4G load.
for (const cpu of [1, 4]) {
  test(`J9: Slow 4G${cpu > 1 ? ' + 4x CPU' : ''} cold, MY TEAM straight from the hub tile: every row painted in every frame`, async ({ page }) => {
    test.setTimeout(120_000);
    await throttle(page, SLOW_4G, cpu); // from the first request: a cold load
    await open(page, { ...SAVE, caught: { bulbasaur: 1, pidgey: 1, rattata: 1 }, team: { p: 'pidgey', n: 'rattata' } }, { cold: true });
    await page.getByTestId('hub-team').click();
    noEmptyRow(await teamFrames(page));
  });
}

test('J10: Training shows the Trainer Level, and a solve says "Trainer Level +N"', async ({ page }) => {
  await open(page, SAVE, { trainer: { rating: { r: 900, rd: 150, vol: 0.06 }, solved: 12, missed: 3, assisted: 0, seen: [] } });
  await page.getByTestId('kanto').click();
  await page.getByTestId('open-training').click();
  await expect(page.getByTestId('screen-training')).toContainText('Trainer Level ~900');
  await kc(page, 'forcePuzzle', [QUIET1[0], QUIET1[1], QUIET1[2], 900], 'mateIn1');
  await page.getByTestId('train-mateIn1').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
  await move(page, 'e2e1');
  await expect(page.getByTestId('trainer-rating')).toHaveText(/^Trainer Level \+\d+$/);
});

type Anim = { name: string; props: string[]; ms: number };
/** Every finite animation that starts, with the properties its keyframes change and its length (as pacing.spec does). */
function animations(): void {
  const seen: Anim[] = ((window as unknown as { __anims: Anim[] }).__anims = []);
  const known = new WeakSet<Animation>();
  const tick = () => {
    for (const a of document.getAnimations()) {
      if (known.has(a)) continue;
      known.add(a);
      const t = a.effect?.getComputedTiming();
      if (!t || t.endTime === Infinity || (a as CSSAnimation).animationName === 'say-fade') continue;
      const props = [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((f) => Object.keys(f)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k));
      seen.push({ name: (a as CSSAnimation).animationName ?? 'waapi', props, ms: Number(t.duration) || 0 });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

test('R8: under reduced motion the catch, OAK\'s highlight and a story\'s "wants to battle!" are opacity fades of 120 ms at most', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(animations);
  await open(page, upTo('pewter-gym', { caught: { bulbasaur: 1, pidgey: 3, rattata: 1 } }));
  await grassSolve(page);
  await throwBall(page);
  await page.getByTestId('to-map').click();
  await page.getByTestId('back').click();
  await page.getByTestId('open-dex').click();
  await page.getByTestId('dex-pidgey').click();
  await page.getByTestId('send-oak').click();
  await expect(page.locator('[data-testid="dex-detail"] .changed')).toHaveCount(2);
  await page.getByTestId('dex-close').click();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-map')).toBeVisible();
  await kc(page, 'enterPlace', 'pewter-gym');
  await toCard(page);
  await settled(page);
  const anims = await page.evaluate(() => (window as unknown as { __anims: Anim[] }).__anims);
  expect(anims.map((a) => a.name)).toEqual(expect.arrayContaining(['fade-in', 'fade-out', 'journey-handover-fade']));
  expect(anims.filter((a) => a.props.some((p) => !['opacity', 'backgroundColor', 'visibility'].includes(p)))).toEqual([]);
  expect(anims.filter((a) => a.ms > 120)).toEqual([]);
});
