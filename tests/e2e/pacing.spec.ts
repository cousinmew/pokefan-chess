// SPDX-License-Identifier: AGPL-3.0-only
// Pacing (owner, 12 Oct: "transitions between screens ... cut too hard"): screen changes under one cover, holds a tap
// can skip after HOLD_MIN_MS, cards that ignore a double tap, the solve and win beats, the board that never moves,
// reduced motion and RTL. Real timings, measured in the page (performance.now() and a MutationObserver).
import { expect, test, type Page } from '@playwright/test';
import { AREA_IN_MS, BATTLE_IN_MS, BOARD_DIP_MS, CARD_GUARD_MS, COVER_LABEL_MS, END_HOLD_MS, HOLD_MIN_MS, MOVE_SLIDE_MS, REDUCED_FADE_MS, SCREEN_IN_MS, SOLVED_STAMP_MS, SOLVE_BEAT_MS, TRAINER_SPOT_MS } from '../../src/config';
import { noTransition, ready, settled, skipHold, tapInGuard } from './pace';

type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);
type Ev = { t: number; ev: string; id?: string };
const log = (page: Page) => page.evaluate(() => (window as unknown as { __pace: { log: Ev[] } }).__pace.log);
const now = (page: Page) => page.evaluate(() => performance.now());
const first = (l: Ev[], ev: string, id?: string, after = 0) => l.find((e) => e.ev === ev && (id === undefined || e.id === id) && e.t >= after);

/** Records, in the page, what appears and when: screens, the cover and its reveal, cards, the stamp, the review, the
 * end panel, the battle, and each frame's count of screens (there is only ever one). */
function recorder(): void {
  const w = window as unknown as { __pace: { log: Ev[]; maxScreens: number; dupes: string[] } };
  const pace = (w.__pace = { log: [] as Ev[], maxScreens: 0, dupes: [] as string[] });
  const add = (ev: string, id?: string) => pace.log.push({ t: performance.now(), ev, id });
  const seen = (n: Element): void => {
    if (!(n instanceof HTMLElement)) return;
    const id = n.dataset.testid ?? '';
    if (id === 'screen-cover') add('cover+', n.dataset.kind);
    else if (id.startsWith('screen-')) add('screen', id);
    else if (n.classList.contains('panel') && n.parentElement?.classList.contains('overlay')) add('card', id);
    else if (id === 'solved-stamp') add('stamp');
    else if (id === 'intro') add('intro');
    else if (id === 'trainer-spot') add('spot');
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach((n) => seen(n as Element));
        r.removedNodes.forEach((n) => (n as HTMLElement).dataset?.testid === 'screen-cover' && add('cover-'));
      } else {
        const e = r.target as HTMLElement;
        if (r.attributeName === 'data-phase' && e.dataset.testid === 'screen-cover') add('cover-open', e.dataset.kind);
        if (r.attributeName === 'hidden' && e.dataset.testid === 'review' && !e.hidden) add('review');
        if (r.attributeName === 'hidden' && e.dataset.testid === 'battle') add(e.hidden ? 'battle-' : 'battle+');
        if (r.attributeName === 'class' && e.classList.contains('stamp-now')) add('map-stamp');
      }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-phase', 'class'] });
  const frame = () => {
    // A reveal's real start: its animation's start time on the document timeline (performance.now()'s clock).
    const open = document.querySelector<HTMLElement>('[data-testid="screen-cover"][data-phase="open"]:not([data-started])');
    const a = open ? [open, ...open.querySelectorAll('*')].flatMap((e) => e.getAnimations()).find((x) => x.startTime !== null) : undefined;
    if (open && a) {
      open.dataset.started = '';
      pace.log.push({ t: Number(a.startTime), ev: 'cover-start', id: open.dataset.kind });
    }
    const screens = [...document.querySelectorAll('[data-testid^="screen-"]')].filter((e) => (e as HTMLElement).dataset.testid !== 'screen-cover');
    pace.maxScreens = Math.max(pace.maxScreens, screens.length);
    for (const id of ['story', 'trainer-intro', 'goal-card', 'win-card', 'unlock-card', 'review', 'board', 'end-screen']) if (document.querySelectorAll(`[data-testid="${id}"]`).length > 1) pace.dupes.push(id);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // The time of each release on a square (a move's second tap makes the move on release).
  window.addEventListener('pointerup', (e) => {
    const sq = (e.target as Element | null)?.closest?.('[data-square]') as HTMLElement | null;
    if (sq) add('click', sq.dataset.square);
  }, true);
}

const ALL_THEMES = ['advancedPawn', 'advantage', 'backRankMate', 'capturingDefender', 'castling', 'deflection', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'fork', 'hangingPiece', 'mateIn1', 'mateIn2', 'pin', 'promotion', 'skewer', 'trappedPiece', 'xRayAttack'];
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, warmup: true, lessonsSeen: ALL_THEMES, tips: ['puzzle'], journey: { cleared: [], beaten: ['r1-toby'], visited: ['route-1'] } };
/** Quiet mate in 1: the set up Ra6-a8, then Re2-e1#. */
const QUIET1 = ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480];
/** Mate in 1 by a capture (a battle): the set up a2-a3, then Re8xe1#. */
const CAPTURE1 = ['pace1', '4r1k1/5ppp/8/8/8/8/P4PPP/4N1K1 w - - 0 1', 'a2a3 e8e1', 600];

async function open(page: Page, o: { save?: object; settings?: object; query?: string; lang?: string; cartridge?: string } = {}) {
  await page.addInitScript(recorder);
  await page.addInitScript(([s, set, lang, cart]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('kc:v1:cartridge', JSON.stringify(cart));
    localStorage.setItem('kc:v1:campaign', JSON.stringify(s));
    localStorage.setItem('kc:v1:settings', JSON.stringify(set));
    if (lang) localStorage.setItem('kc:v1:lang', JSON.stringify(lang));
  }, [o.save ?? SAVE, o.settings ?? { v: 2, anim: 'off', sound: false }, o.lang ?? '', o.cartridge ?? 'blue'] as const);
  await page.goto(`./?debug=1${o.query ?? ''}`);
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId(o.cartridge === 'yellow' ? 'screen-yellow' : 'screen-title')).toBeVisible();
}

/** Route 1's last trainer, from the map: the intro card, the goal card, then the board. */
async function toBattle(page: Page, row: unknown[] = QUIET1) {
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await kc(page, 'forcePuzzle', row, 'mateIn1');
  await page.getByTestId('battle-trainer').click();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
}

const move = async (page: Page, uci: string) => {
  await page.click(`[data-square="${uci.slice(0, 2)}"]`);
  await page.click(`[data-square="${uci.slice(2, 4)}"]`);
};
const tapAt = async (page: Page, testid: string) => {
  const b = (await page.getByTestId(testid).first().boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test.describe(`@both ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('one screen at a time through the Journey, vs Computer and YELLOW; reveals block taps and last their length', async ({ page }) => {
      test.setTimeout(90_000);
      await open(page);
      // A: hub → map → route → a trainer → the board.
      await toBattle(page);
      // C: back home, vs Computer, team, level, the intro.
      await page.getByTestId('start-button').click();
      await page.getByTestId('start-menu-computer').click();
      await page.getByTestId('team-red').click();
      // Mid reveal the cover is what a tap hits.
      const hit = await page.evaluate(() => (document.elementFromPoint(innerWidth / 2, innerHeight / 2) as HTMLElement | null)?.closest('[data-testid="screen-cover"]') !== null);
      expect(hit).toBe(true);
      await page.getByTestId('level-1').click();
      await expect(page.getByTestId('intro')).toBeVisible();
      await settled(page);
      const state = await page.evaluate(() => (window as unknown as { __pace: { maxScreens: number; dupes: string[] } }).__pace);
      expect(state.maxScreens).toBe(1);
      expect(state.dupes).toEqual([]);
      // Each reveal lasts its kind's length, from its animation's start to the cover's removal.
      const l = await log(page);
      const reveals: { kind: string; ms: number }[] = [];
      for (const e of l.filter((x) => x.ev === 'cover-start')) {
        const gone = l.find((x) => x.ev === 'cover-' && x.t >= e.t);
        if (gone) reveals.push({ kind: e.id!, ms: gone.t - e.t });
      }
      const want: Record<string, number> = { screen: SCREEN_IN_MS, area: AREA_IN_MS, battle: BATTLE_IN_MS };
      expect(reveals.map((r) => r.kind)).toEqual(expect.arrayContaining(['screen', 'area', 'battle']));
      // Never cut short. A busy machine may end it late (first paint, then the fade's promise): CI's emulated iPhone
      // painted the map 230 ms late; a 27-minute 4-worker run ended Chromium's 188 ms late (12/12 alone under load).
      const late = test.info().project.name.startsWith('webkit') ? 600 : 300;
      for (const r of reveals.filter((x) => want[x.kind])) {
        expect(r.ms - want[r.kind]!, JSON.stringify(r)).toBeGreaterThanOrEqual(-50);
        expect(r.ms - want[r.kind]!, JSON.stringify(r)).toBeLessThanOrEqual(late);
      }
    });

    test('one screen at a time through YELLOW: home, the Path, a lesson', async ({ page }) => {
      await open(page, { cartridge: 'yellow' });
      await page.getByTestId('yellow-learn').click();
      await page.getByTestId('lesson-1').click();
      await expect(page.getByTestId('path-progress')).toBeVisible();
      await settled(page);
      const state = await page.evaluate(() => (window as unknown as { __pace: { maxScreens: number; dupes: string[] } }).__pace);
      expect(state.maxScreens).toBe(1);
      expect(state.dupes).toEqual([]);
      const l = await log(page);
      expect(l.filter((e) => e.ev === 'cover-open').map((e) => e.id)).toEqual(['first', 'area', 'screen', 'screen']);
    });

    test('a double tap 40 ms apart on the Journey tile or ▶ acts once', async ({ page }) => {
      await open(page);
      await settled(page);
      const b = (await page.getByTestId('kanto').boundingBox())!;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(40);
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await expect(page.getByTestId('screen-map')).toBeVisible();
      await settled(page);
      const n = (await page.getByTestId('map-next').boundingBox())!;
      await page.mouse.click(n.x + n.width / 2, n.y + n.height / 2);
      await page.waitForTimeout(40);
      await page.mouse.click(n.x + n.width / 2, n.y + n.height / 2); // the cover or the clear modal takes it
      await expect(page.getByTestId('trainer-intro')).toBeVisible();
      await settled(page);
      const l = await log(page);
      expect(l.filter((e) => e.ev === 'screen' && e.id === 'screen-map')).toHaveLength(1);
      expect(l.filter((e) => e.ev === 'screen' && e.id === 'screen-route')).toHaveLength(1);
      expect(l.filter((e) => e.ev === 'card' && e.id === 'trainer-intro')).toHaveLength(1);
    });
  });
}

test.describe('the battle cards and the waiting cover', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const ms of [950, 1000, 1300]) {
    test(`a tap on "wants to battle!" at ${ms} ms always reaches the goal card; a tap inside its guard is ignored`, async ({ page }) => {
      await open(page);
      await page.getByTestId('kanto').click();
      await page.getByTestId('route-route-1').click();
      await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
      await page.getByTestId('battle-trainer').click();
      await expect(page.getByTestId('trainer-intro')).toBeVisible();
      const shown = first(await log(page), 'card', 'trainer-intro')!.t;
      await page.waitForTimeout(Math.max(0, ms - ((await now(page)) - shown)));
      await tapAt(page, 'trainer-intro');
      expect(await tapInGuard(page, 'goal-card')).toBe('in-guard'); // inside the goal card's guard
      await page.waitForTimeout(CARD_GUARD_MS);
      await expect(page.getByTestId('goal-card')).toBeVisible();
      await tapAt(page, 'goal-card');
      await expect(page.getByTestId('screen-game')).toBeVisible();
    });
  }

  test('Slow 4G, the puzzles 2.5 s late: after the goal tap the route is never seen again, and the label shows by 450 ms', async ({ page }) => {
    await page.route('**/assets/mateIn1-*.js', async (r) => {
      await new Promise((res) => setTimeout(res, 2500));
      await r.continue();
    });
    await open(page);
    await page.getByTestId('kanto').click();
    await page.getByTestId('route-route-1').click();
    await page.getByTestId('battle-trainer').click();
    await page.getByTestId('trainer-intro').click();
    await page.getByTestId('goal-card').click();
    const t0 = await now(page);
    // Until the board shows, every frame is under the shut bars.
    const seen = await page.evaluate(async (start) => {
      const out: { t: number; covered: boolean; label: boolean }[] = [];
      while (!document.querySelector('[data-testid="screen-game"]')) {
        await new Promise((r) => requestAnimationFrame(r));
        const cover = document.querySelector<HTMLElement>('[data-testid="screen-cover"]');
        const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 3);
        out.push({ t: performance.now() - start, covered: !!cover && !!hit && cover.contains(hit), label: !!cover?.querySelector('.cover-label:not([hidden])') });
      }
      return out;
    }, t0);
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.filter((s) => s.t > 230 && !s.covered)).toEqual([]);
    const label = seen.find((s) => s.label);
    expect(label?.t).toBeLessThanOrEqual(COVER_LABEL_MS + 50);
    await expect(page.getByTestId('screen-game')).toBeVisible();
  });
});

type Frame = { t: number; alpha: number; spot: boolean; sprites: number; intro: boolean };
/** Each frame, the modal: its dim (0 when hidden), the "!", how visible its trainer is (J13: opacity with ancestors'), "wants to battle!". */
function modalFrames(): void {
  const frames: Frame[] = ((window as unknown as { __frames: Frame[] }).__frames = []);
  const shown = (s: Element) => { let a = 1; for (let e: Element | null = s; e; e = e.parentElement) a *= Number(getComputedStyle(e).opacity); return a; };
  const tick = () => {
    const o = document.querySelector<HTMLElement>('#app > .overlay');
    if (o) {
      const rgba = getComputedStyle(o).backgroundColor.match(/[\d.]+/g) ?? [];
      frames.push({ t: performance.now(), alpha: o.hidden ? 0 : Number(rgba[3] ?? 1), spot: !!o.querySelector('.trainer-spot'), sprites: Math.max(0, ...[...o.querySelectorAll('.trainer-sprite')].map(shown)), intro: !!o.querySelector('[data-testid="trainer-intro"]') });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Puzzles of a battle from "wants to battle!": a quiet mate in 1 each, solved (e2e1) or missed (e2h2), then Continue. */
async function play(page: Page, moves: string[]) {
  for (const [i, uci] of moves.entries()) {
    await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
    if (i === 0) {
      await page.getByTestId('trainer-intro').click();
      await page.getByTestId('goal-card').click();
    } else await page.getByTestId('review-continue').click();
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
    await move(page, uci);
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 30_000 }).toBe('review');
  }
  await page.getByTestId('review-continue').click();
}

/** Taps the story's lines until "wants to battle!" takes taps; the time of the last tap. */
async function toIntro(page: Page): Promise<number> {
  let t0 = 0;
  while (!(await page.getByTestId('trainer-intro').count())) {
    await ready(page, 'story');
    t0 = await now(page);
    await page.getByTestId('story').click();
    await page.locator('[data-testid="trainer-intro"], [data-testid="story"]').first().waitFor();
  }
  await ready(page, 'trainer-intro');
  return t0;
}

/** B2 (Fix, 13 Oct): the tap on a story's last line hands over to "wants to battle!" in the same frame, under the dim
 * already up: no "!" over the map, the dim never fades out and back, and a trainer who stood in the story never goes. */
async function handsOver(page: Page, trainerStays: boolean) {
  const t0 = await toIntro(page);
  const f = (await page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames)).filter((x) => x.t >= t0);
  const l = await log(page);
  expect(first(l, 'spot', undefined, t0)).toBeUndefined();
  expect(first(l, 'card', 'trainer-intro', t0)!.t - t0).toBeLessThan(TRAINER_SPOT_MS / 2);
  expect(f.filter((x) => x.spot)).toEqual([]);
  expect(Math.min(...f.map((x) => x.alpha))).toBeGreaterThan(0.3); // .overlay's dim is 0.35
  if (trainerStays) expect(f.filter((x) => x.sprites < 0.5)).toEqual([]); // seen in every frame, not just in the DOM
}

test.describe('B2: from a story, "wants to battle!" pops in under the dim, with no "!"', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const GYM = { ...SAVE, journey: { cleared: ['route-1', 'viridian', 'rival-1', 'viridian-forest'], beaten: [], visited: [] } };

  test('a gym leader\'s story: Brock stays in place', async ({ page }) => {
    await page.addInitScript(modalFrames);
    await open(page, { save: GYM });
    await page.getByTestId('kanto').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await noTransition(page);
    await kc(page, 'enterPlace', 'pewter-gym');
    await handsOver(page, true);
    // He stood in the story, so he does not slide in again.
    await expect(page.locator('[data-testid="trainer-intro"] .trainer-sprite')).not.toHaveClass(/slide-in/);
  });

  test('a lost gym: the lost line, then "wants to battle!" again', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(modalFrames);
    await open(page, { save: GYM });
    await page.getByTestId('kanto').click();
    await kc(page, 'enterPlace', 'pewter-gym');
    await toIntro(page);
    await play(page, ['e2h2', 'e2h2', 'e2h2']); // 3 of 5 needed: three misses lose
    await handsOver(page, false);
  });

  test('the Elite Four: a trainer beaten, the next one\'s card follows the quote', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(modalFrames);
    await open(page, { save: GYM });
    await page.getByTestId('kanto').click();
    await kc(page, 'enterPlace', 'indigo-plateau');
    await toIntro(page);
    await play(page, ['e2e1', 'e2e1', 'e2e1', 'e2e1']); // 4 of 5
    await page.getByTestId('win-card').click();
    await handsOver(page, true); // LORELEI's quote, then BRUNO
    await expect(page.getByTestId('trainer-intro')).toContainText('BRUNO');
  });
});

for (const width of [360, 390]) {
  test(`a quiet solve at ${width} px: the board alone for ${SOLVE_BEAT_MS} ms, the stamp centred on it, the review at 1400 ms`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 844 });
    await open(page);
    await toBattle(page);
    await move(page, 'e2e1');
    const l1 = await log(page);
    const click = l1.filter((e) => e.ev === 'click' && e.id === 'e1').at(-1)!.t;
    await expect(page.getByTestId('solved-stamp')).toBeAttached();
    await page.waitForTimeout(400); // inside the stamp's hold
    const geo = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="solved-stamp"]')!.getBoundingClientRect();
      const b = document.querySelector('[data-testid="board"]')!.getBoundingClientRect();
      return { s: [s.left, s.top, s.right, s.bottom], b: [b.left, b.top, b.right, b.bottom] };
    });
    const [sl, st, sr, sb] = geo.s as [number, number, number, number];
    const [bl, bt, br, bb] = geo.b as [number, number, number, number];
    expect(Math.abs((sl + sr) / 2 - (bl + br) / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs((st + sb) / 2 - (bt + bb) / 2)).toBeLessThanOrEqual(2);
    expect(sl).toBeGreaterThanOrEqual(bl);
    expect(sr).toBeLessThanOrEqual(br);
    await expect.poll(() => kc<string>(page, 'puzzlePhase')).toBe('review');
    const l = await log(page);
    const stamp = first(l, 'stamp', undefined, click)!.t - click;
    const review = first(l, 'review', undefined, click)!.t - click;
    expect(stamp).toBeGreaterThanOrEqual(MOVE_SLIDE_MS + SOLVE_BEAT_MS - 20);
    // Never early: the stamp gets its whole time before the review. A timer can only fire late, and a busy machine
    // (the full suite on 4 workers, a shared CI runner) ran it 62 ms late once, so lateness has a little more room.
    expect(review - stamp).toBeGreaterThanOrEqual(SOLVED_STAMP_MS - 40); // 40: the two log stamps are a frame apart at most
    expect(review - (MOVE_SLIDE_MS + SOLVE_BEAT_MS + SOLVED_STAMP_MS)).toBeGreaterThanOrEqual(-60);
    expect(review - (MOVE_SLIDE_MS + SOLVE_BEAT_MS + SOLVED_STAMP_MS)).toBeLessThanOrEqual(150);
  });
}

test.describe('skipping the solve hold', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Enter, Space or B before HOLD_MIN_MS do nothing; a tap at 300 ms opens the review at once', async ({ page }) => {
    await open(page);
    await toBattle(page);
    await move(page, 'e2e1');
    await page.locator('body[data-hold="solved"]').waitFor({ state: 'attached' });
    const start = await now(page);
    for (const k of ['Enter', 'Space', 'b']) await page.keyboard.press(k);
    expect((await now(page)) - start).toBeLessThan(HOLD_MIN_MS);
    expect(await kc<string>(page, 'puzzlePhase')).toBe('solved');
    await page.waitForTimeout(300 - ((await now(page)) - start));
    const b = (await page.getByTestId('board').boundingBox())!;
    const tap = await now(page);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect.poll(() => kc<string>(page, 'puzzlePhase')).toBe('review');
    const review = first(await log(page), 'review', undefined, tap)!.t;
    expect(review - tap).toBeLessThan(100);
    // The tap did not also select a piece.
    expect(await page.locator('.sq.selected').count()).toBe(0);
  });

  test('a capture mate: the battle, then the board for the beat, then the stamp and the review', async ({ page }) => {
    await open(page, { settings: { v: 2, anim: 'full', sound: false } });
    await toBattle(page, CAPTURE1);
    await move(page, 'e8e1');
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('review');
    const l = await log(page);
    const hidden = first(l, 'battle-')!.t;
    expect(first(l, 'stamp', undefined, 0)!.t - hidden).toBeGreaterThanOrEqual(MOVE_SLIDE_MS + SOLVE_BEAT_MS - 20);
    expect(first(l, 'review', undefined, 0)!.t - hidden).toBeGreaterThanOrEqual(SOLVE_BEAT_MS);
  });
});

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`the board never moves from a puzzle's first frame through its review and the win card (${vp.width}x${vp.height})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(vp);
    await open(page);
    await toBattle(page);
    await move(page, 'e2e1');
    await expect.poll(() => kc<string>(page, 'puzzlePhase')).toBe('review');
    await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
    await page.getByTestId('review-continue').click();
    await expect.poll(() => kc<string>(page, 'puzzlePhase')).toBe('setup');
    await noTransition(page);
    // Every frame from here to the win card.
    await page.evaluate(() => {
      const w = window as unknown as { __geo: number[][]; __stop: boolean };
      w.__geo = [];
      w.__stop = false;
      const tick = () => {
        const b = document.querySelector('[data-testid="board"]')!.getBoundingClientRect();
        w.__geo.push([parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sq')), b.left, b.top, b.width, b.height]);
        if (!w.__stop) requestAnimationFrame(tick);
      };
      tick();
    });
    await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 10_000 }).toBe('player');
    await move(page, 'e2e1');
    await expect.poll(() => kc<string>(page, 'puzzlePhase')).toBe('review');
    await page.getByTestId('review-continue').click();
    await expect(page.getByTestId('win-card')).toBeVisible();
    await settled(page);
    const geo = await page.evaluate(() => {
      const w = window as unknown as { __geo: number[][]; __stop: boolean };
      w.__stop = true;
      return w.__geo;
    });
    expect(geo.length).toBeGreaterThan(30);
    for (let i = 0; i < 5; i++) {
      const vals = geo.map((g) => g[i]!);
      expect(Math.max(...vals) - Math.min(...vals), `column ${i}`).toBeLessThanOrEqual(0.5);
    }
  });
}

test.describe('the win, in order, then the map', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a gym: "You won!", the quote, the badge, the queen line, the unlock card with Next; the map stamps after its reveal', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, { save: { ...SAVE, journey: { cleared: ['route-1', 'viridian', 'rival-1', 'route-2', 'viridian-forest', 'pewter'], beaten: [], visited: [] } } });
    await page.getByTestId('kanto').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await kc(page, 'enterPlace', 'pewter-gym');
    await page.getByTestId('story').click(); // the gym's one line
    for (let i = 0; i < 3; i++) {
      await kc(page, 'forcePuzzle', QUIET1, 'mateIn1');
      if (i === 0) {
        await page.getByTestId('trainer-intro').click();
        await page.getByTestId('goal-card').click();
      } else await page.getByTestId('review-continue').click();
      await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
      await move(page, 'e2e1');
      await expect.poll(() => kc<string>(page, 'puzzlePhase')).toBe('review');
    }
    await page.getByTestId('review-continue').click();
    const order: string[] = [];
    const nexts: string[] = [];
    for (let i = 0; i < 8; i++) {
      const card = page.locator('#app > .overlay:not([hidden]) > .panel').first();
      const which = await Promise.race([card.waitFor({ timeout: 15_000 }).then(() => 'card'), page.getByTestId('screen-map').waitFor({ timeout: 15_000 }).then(() => 'map')]);
      if (which === 'map') break;
      const id = (await card.getAttribute('data-testid'))!;
      const text = (await card.textContent()) ?? '';
      order.push(id === 'story' ? `story:${text.slice(0, 12)}` : id);
      if (/Next: /.test(text)) nexts.push(id);
      await card.click();
      await page.waitForTimeout(80);
    }
    expect(order[0]).toBe('win-card');
    expect(order[1]).toMatch(/^story:/);
    expect(order[2]).toBe('badge-card');
    expect(order[3]).toMatch(/^story:Your first/);
    expect(order[4]).toBe('unlock-card');
    expect(nexts).toEqual(['unlock-card']);
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await page.locator('.stamp-now').waitFor({ state: 'attached' });
    const l = await log(page);
    const map = l.filter((e) => e.ev === 'screen' && e.id === 'screen-map').at(-1)!.t;
    const gone = first(l, 'cover-', undefined, map)!.t;
    expect(first(l, 'map-stamp', undefined, map)!.t).toBeGreaterThanOrEqual(gone);
  });

  // Fix, 13 Oct: the row was built with its stamp showing, so it blinked out and slammed in again at about 520 ms.
  for (const reduce of [false, true]) {
    test(`a town just cleared: its CLEARED stamp is hidden until it ${reduce ? 'fades in (reduced motion)' : 'slams in'}`, async ({ page }) => {
      if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((testid) => {
        const w = window as unknown as { __stamp: { shown: boolean; now: boolean; opacity: number }[] };
        w.__stamp = [];
        const tick = () => {
          const row = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
          const s = row?.querySelector<HTMLElement>('.stamp');
          if (row && s) {
            const cs = getComputedStyle(s);
            w.__stamp.push({ opacity: Number(cs.opacity), shown: cs.visibility !== 'hidden' && Number(cs.opacity) > 0, now: row.classList.contains('stamp-now') });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 'place-viridian');
      await open(page, { save: { ...SAVE, journey: { cleared: ['route-1'], beaten: ['r1-toby'], visited: ['route-1'] } } });
      await page.getByTestId('kanto').click();
      await expect(page.getByTestId('screen-map')).toBeVisible();
      await kc(page, 'enterPlace', 'viridian');
      for (let i = 0; i < 2; i++) {
        await ready(page, 'story');
        await page.getByTestId('story').click();
      }
      await page.getByTestId('town-card').click();
      await page.locator('[data-testid="place-viridian"].stamp-now').waitFor({ state: 'attached' });
      await settled(page);
      const f = await page.evaluate(() => (window as unknown as { __stamp: { shown: boolean; now: boolean; opacity: number }[] }).__stamp);
      const at = f.findIndex((x) => x.now);
      expect(at).toBeGreaterThan(5); // the reveal's frames, then the stamp
      expect(f.slice(0, at).filter((x) => x.shown)).toEqual([]);
      expect(f.at(-1)).toMatchObject({ now: true, opacity: 1, shown: true });
    });
  }
});

test.describe('vs Computer', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const MATE = '1k2n3/ppp5/8/8/8/8/5PPP/4R1K1 w - - 0 1'; // Re1xe8#: a capture, so a battle

  async function mate(page: Page) {
    await open(page, { settings: { v: 2, anim: 'full', sound: false } });
    await kc(page, 'setMode', 'computer', 1, 'w');
    await kc(page, 'loadFen', MATE);
    await noTransition(page);
    await move(page, 'e1e8');
    await expect(page.getByTestId('battle')).toBeVisible();
    await page.getByTestId('battle').waitFor({ state: 'hidden', timeout: 10_000 });
  }

  test(`the mate holds ${END_HOLD_MS} ms on the board before the end panel`, async ({ page }) => {
    await mate(page);
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 5000 });
    const l = await log(page);
    const hidden = first(l, 'battle-')!.t;
    const panel = first(l, 'card', 'end-screen', hidden)!.t - hidden;
    expect(panel).toBeGreaterThanOrEqual(1550);
    expect(panel).toBeLessThanOrEqual(1850);
    await expect(page.getByTestId('rematch')).toBeEnabled();
  });

  test('a tap 300 ms into the hold shows the end panel at once', async ({ page }) => {
    await mate(page);
    await page.locator('body[data-hold="end"]').waitFor({ state: 'attached' });
    await page.waitForTimeout(300);
    const b = (await page.getByTestId('board').boundingBox())!;
    const tap = await now(page);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.getByTestId('end-screen')).toBeVisible();
    expect(first(await log(page), 'card', 'end-screen', tap)!.t - tap).toBeLessThan(100);
  });

  // The end of a game (fix, 13 Oct): a quiet mate, Ra8#, at level 1, where take back is offered.
  const QUIET_MATE = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  const fen = async (page: Page) => (JSON.parse(await kc<string>(page, 'dumpState')) as { fen: string }).fen;
  const gamesPlayed = (page: Page) => page.evaluate(() => Number(Object.entries(localStorage).find(([k]) => k.endsWith(':gamesPlayed'))?.[1] ?? 0));
  const centre = async (page: Page, testid: string) => {
    const b = (await page.getByTestId(testid).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  /** Plays Ra8# and waits for the end hold; returns where take back was before the mate. */
  async function quietMate(page: Page) {
    await open(page);
    await kc(page, 'setMode', 'computer', 1, 'w');
    await kc(page, 'loadFen', QUIET_MATE);
    await noTransition(page);
    await expect(page.getByTestId('takeback')).toBeVisible();
    const back = await centre(page, 'takeback');
    await move(page, 'a1a8');
    await page.locator('body[data-hold="end"]').waitFor({ state: 'attached' });
    return back;
  }
  /** Ra8#, the hold skipped, the end panel taking taps; returns the mated position. */
  async function endPanel(page: Page) {
    await quietMate(page);
    await skipHold(page);
    await ready(page, 'end-screen');
    return fen(page);
  }

  test('take back is gone from the mate on: a tap where it was during the hold never undoes the mate', async ({ page }) => {
    const back = await quietMate(page);
    const mated = await fen(page);
    await page.mouse.click(back.x, back.y);
    await expect(page.getByTestId('end-screen')).toBeVisible();
    expect(await fen(page)).toBe(mated);
    await expect(page.getByTestId('takeback')).toBeHidden();
    expect(await kc<boolean>(page, 'takeBack')).toBe(false);
    await page.getByTestId('rematch').click();
    await expect(page.getByTestId('intro')).toBeVisible();
    await expect(page.getByTestId('takeback')).toBeVisible(); // a new game has it again
  });

  test('a double tap on Rematch starts one game', async ({ page }) => {
    await endPanel(page);
    const before = await gamesPlayed(page);
    const r = await centre(page, 'rematch');
    await page.mouse.dblclick(r.x, r.y);
    await expect(page.getByTestId('intro')).toBeVisible();
    await settled(page);
    expect(await gamesPlayed(page)).toBe(before + 1);
  });

  test('Menu tapped 40 ms after Rematch: the panel went with the first tap, so the menu never shows under the rematch', async ({ page }) => {
    await endPanel(page);
    const before = await gamesPlayed(page);
    const r = await centre(page, 'rematch');
    const m = await centre(page, 'end-menu');
    const t = await now(page);
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(40);
    await page.mouse.click(m.x, m.y);
    await expect(page.getByTestId('intro')).toBeVisible();
    await settled(page);
    expect((await log(page)).filter((e) => e.ev === 'screen' && e.t >= t && e.id !== 'screen-game')).toEqual([]);
    await expect(page.getByTestId('screen-game')).toBeVisible();
    expect(await gamesPlayed(page)).toBe(before + 1);
  });

  test('a screen chosen during the rematch dip stays: the rematch never pulls the player back into a game', async ({ page }) => {
    const mated = await endPanel(page);
    const before = await gamesPlayed(page);
    // Rematch, then START → OPTION before the dip's peak (one task: as fast as it gets).
    await page.evaluate(() => ['rematch', 'start-button', 'start-menu-option'].forEach((id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click()));
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await page.waitForTimeout(BOARD_DIP_MS + 200);
    await noTransition(page);
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await expect(page.getByTestId('screen-game')).toHaveCount(0);
    expect(await gamesPlayed(page)).toBe(before);
    // Back: the game that ended, with its end panel.
    await page.getByTestId('back').click();
    await expect(page.getByTestId('end-screen')).toBeVisible();
    expect(await fen(page)).toBe(mated);
  });
});

// Hebrew too (Fix, 13 Oct): the RTL slide-ins outranked the reduced-motion fade, so trainers still slid in.
for (const lang of ['en', 'he']) test(`reduced motion${lang === 'he' ? ' in Hebrew (RTL)' : ''}: every animation is an opacity fade of 120 ms or less, nothing moves`, async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const seen: { name: string; props: string[]; ms: number }[] = [];
    (window as unknown as { __anims: typeof seen }).__anims = seen;
    const known = new WeakSet<Animation>();
    const tick = () => {
      for (const a of document.getAnimations()) {
        if (known.has(a)) continue;
        known.add(a);
        const t = a.effect?.getComputedTiming();
        if (!t || t.endTime === Infinity) continue; // the endless pulses and blinks are separate rules, not transitions
        if ((a as CSSAnimation).animationName === 'say-fade') continue; // a speech bubble's timed fade out, not a transition
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        const props = [...new Set(frames.flatMap((f) => Object.keys(f)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k));
        seen.push({ name: (a as CSSAnimation).animationName ?? a.id ?? 'waapi', props, ms: Number(t.duration) || 0 });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await open(page, { lang: lang === 'he' ? 'he' : undefined });
  expect(await page.evaluate(() => document.documentElement.dir || 'ltr')).toBe(lang === 'he' ? 'rtl' : 'ltr');
  await toBattle(page);
  await move(page, 'e2e1');
  await expect.poll(() => kc<string>(page, 'puzzlePhase')).toBe('review');
  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('intro')).toBeVisible();
  await settled(page);
  const anims = await page.evaluate(() => (window as unknown as { __anims: { name: string; props: string[]; ms: number }[] }).__anims);
  expect(anims.length).toBeGreaterThan(5);
  const moving = anims.filter((a) => a.props.some((p) => !['opacity', 'backgroundColor', 'visibility'].includes(p)));
  expect(moving).toEqual([]);
  expect(anims.filter((a) => a.ms > REDUCED_FADE_MS)).toEqual([]);
  // A story's trainer and the badge's shine are not on this walk: their rules, on elements shown on their own.
  const names = await page.evaluate(() =>
    ['trainer-sprite slide-in', 'trainer-sprite story-trainer slide-in', 'badge won boulder badge-big'].map((cls) => {
      const c = document.createElement('div');
      c.className = 'panel progress-card badge-card';
      const e = document.createElement('div');
      e.className = cls;
      c.append(e);
      document.body.append(c);
      const name = `${getComputedStyle(e).animationName} ${getComputedStyle(e, '::after').animationName}`;
      c.remove();
      return name;
    }),
  );
  expect(names).toEqual(['fade-in none', 'fade-in none', 'fade-in none']);
});

test('Hebrew: the battle bars and the badge shine run mirrored; the board and the dip have no direction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const w = window as unknown as { __bars: string[] };
    w.__bars = [];
    const tick = () => {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
        if (t?.classList.contains('cover-bar') && t === t.parentElement?.firstElementChild) w.__bars.push(String((a.effect as KeyframeEffect).getKeyframes()[0]?.transform ?? ''));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await open(page, { lang: 'he' });
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await page.getByTestId('vs-computer').click();
  await page.getByTestId('team-red').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('intro')).toBeVisible();
  // The first bar closes from, and opens to, the inline start: the right in RTL.
  const bars = await page.evaluate(() => (window as unknown as { __bars: string[] }).__bars);
  expect(bars.some((b) => /translateX\(101%\)/.test(b))).toBe(true);
  expect(bars.some((b) => /translateX\(-101%\)/.test(b))).toBe(false);
  expect(await page.getByTestId('board').evaluate((b) => getComputedStyle(b).direction)).toBe('ltr');
  // The badge shine runs the other way (a card shown on its own).
  const shine = await page.evaluate(() => {
    const c = document.createElement('div');
    c.className = 'panel progress-card badge-card';
    const b = document.createElement('span');
    b.className = 'badge won boulder badge-big';
    c.append(b);
    document.body.append(c);
    const name = getComputedStyle(b, '::after').animationName;
    c.remove();
    return name;
  });
  expect(shine).toBe('badge-shine-rtl');
});
