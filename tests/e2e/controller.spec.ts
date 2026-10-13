// SPDX-License-Identifier: AGPL-3.0-only
// The game controller, 14 Oct (owner: "logically well timed for players to understand the inputs and outputs"): START
// stops the game's clock, Take back says and shows what it undid, the computer's thinking line, outcome lines that
// stay readable, YELLOW's sticker with the end panel, Two Players' auto flip, START items that end a game ask first,
// lines that name the people on the plates, the Journey's challenges, online rematch and resume, YELLOW's boot, the
// promotion picker and a new game's cover. Real timings, measured in the page (performance.now()).
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';
import { Chess } from 'chess.js';
import { AI_MIN_THINK_MS, BATTLE_CLOSE_MS, BOARD_DIP_MS, THEIR_SLIDE_MS } from '../../src/config';
import { noTransition, ready, settled } from './pace';

type KC = Record<string, (...a: unknown[]) => unknown>;
const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);
type State = { fen: string; turn: string; mode: string; aiFailed: boolean; ended: boolean };
const state = async (page: Page) => JSON.parse(await kc<string>(page, 'dumpState')) as State;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const now = (page: Page) => page.evaluate(() => performance.now());

type Ev = { t: number; k: string; v: string };
/** Records, in the page, each change of what the player sees: the position, the battle, START, the end panel, the
 * question, both bars, the header, the board's corner (its orientation), the intro card, the dip and each toast. */
function recorder(): void {
  const w = window as unknown as { __rec: Ev[] };
  const log: Ev[] = (w.__rec = []);
  performance.setResourceTimingBufferSize(5000); // C13 reads which sprites have arrived
  const last: Record<string, string> = {};
  const add = (k: string, v: string) => {
    if (last[k] === v) return;
    last[k] = v;
    log.push({ t: performance.now(), k, v });
  };
  const q = (s: string) => document.querySelector<HTMLElement>(s);
  const shown = (e: HTMLElement | null) => !!e && e.getClientRects().length > 0;
  const toasts = new WeakSet<Element>();
  const dom = () => {
    const b = q('[data-testid="battle"]');
    add('battle', b && !b.hidden ? 'on' : 'off');
    add('start', q('.start-overlay') ? 'open' : 'closed');
    add('end', shown(q('[data-testid="end-screen"]')) ? 'on' : 'off');
    add('confirm', shown(q('[data-testid="quit-confirm"]')) ? 'on' : 'off');
    add('top', q('[data-testid="plate-top-msg"]')?.textContent ?? '');
    add('text', q('[data-testid="text-main"]')?.textContent ?? '');
    add('turn', q('[data-testid="turn"]')?.textContent ?? '');
    add('corner', q('#board .sq')?.dataset.square ?? '');
    add('intro', q('[data-testid="intro"]')?.textContent ?? '');
    add('dip', q('[data-testid="board-dip"]') ? 'on' : 'off');
    for (const t of document.querySelectorAll('[data-testid="toast"]')) {
      if (toasts.has(t)) continue;
      toasts.add(t);
      log.push({ t: performance.now(), k: 'toast', v: t.textContent ?? '' });
    }
  };
  new MutationObserver(dom).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  const frame = () => {
    dom();
    const kc = (window as unknown as { __kc?: { dumpState(): string } }).__kc;
    if (kc) add('fen', (JSON.parse(kc.dumpState()) as { fen: string }).fen);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  addEventListener('pointerup', (e) => {
    const sq = (e.target as Element | null)?.closest?.('[data-square]') as HTMLElement | null;
    if (sq) log.push({ t: performance.now(), k: 'release', v: sq.dataset.square ?? '' });
  }, true);
}
const rec = (page: Page) => page.evaluate(() => (window as unknown as { __rec: Ev[] }).__rec);
const at = (log: Ev[], k: string, test: (v: string) => boolean, after = 0) => log.find((e) => e.k === k && e.t >= after && test(e.v));

const LESSONS = ['advancedPawn', 'advantage', 'backRankMate', 'capturingDefender', 'castling', 'deflection', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'fork', 'hangingPiece', 'mateIn1', 'mateIn2', 'pin', 'promotion', 'skewer', 'trappedPiece', 'xRayAttack'];
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1 }, warmup: true, lessonsSeen: LESSONS, tips: ['puzzle'], journey: { cleared: [], beaten: ['r1-toby'], visited: ['route-1'] } };
const YELLOW_SAVE = { v: 2, caught: {}, path: 3, yellowGiven: 3 };

/** Storage once per test (a reload keeps what the game saved), and the recorder. `bare`: only `extra` (several saves). */
async function seed(page: Page, o: { save?: object; settings?: object; cartridge?: string; extra?: Record<string, unknown>; bare?: boolean } = {}) {
  await page.addInitScript(recorder);
  await page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, { ...(o.bare ? {} : { 'kc:v1:cartridge': o.cartridge ?? 'blue', 'kc:v1:campaign': o.save ?? SAVE, 'kc:v1:settings': { v: 2, anim: 'off', sound: false, ...o.settings } }), ...o.extra });
}
async function open(page: Page, o: Parameters<typeof seed>[1] = {}, query = '') {
  await seed(page, o);
  await page.goto(`./?debug=1${query}`);
  await page.getByTestId('screen-splash').click();
}
/** ?start=two: straight into Two Players, no splash. */
async function two(page: Page, o: Parameters<typeof seed>[1] = {}) {
  await seed(page, o);
  await page.goto('./?debug=1&start=two');
  await expect(page.getByTestId('screen-game')).toBeVisible();
  await noTransition(page);
}
/** vs Computer at `level` from the harness (no intro card), optionally from a position. */
async function vsComputer(page: Page, level: number, fen?: string, o: Parameters<typeof seed>[1] = {}) {
  await open(page, o);
  await kc(page, 'setMode', 'computer', level, 'w');
  if (fen) await kc(page, 'loadFen', fen);
  await noTransition(page);
}
const move = async (page: Page, from: string, to: string) => {
  await page.click(`[data-square="${from}"]`);
  await page.click(`[data-square="${to}"]`);
};
const cpu4 = async (page: Page): Promise<CDPSession> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
};
const centre = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const gamesPlayed = (page: Page) => page.evaluate(() => Number(Object.entries(localStorage).find(([k]) => k.endsWith(':gamesPlayed'))?.[1] ?? 0));
/** A guest's Two Players game from PLAY CHESS, past its intro card. */
async function guestFriend(page: Page) {
  await open(page, {}, '&menu=1');
  await page.getByTestId('start-play').click();
  await page.getByTestId('quick-friend').click();
  await page.getByTestId('intro').click();
  await noTransition(page);
}

test.use({ viewport: { width: 390, height: 844 } });

// Qb7+: Kxb7 is black's only move, a capture (a battle with anim full).
const QB7 = 'k7/7p/7P/8/8/8/8/1Q5K w - - 0 1';

test.describe('C1: START pauses the computer and the end panel', () => {
  for (const level of [1, 2]) {
    test(`vs Computer L${level}, CPU 4x: START 50 ms after your move, open 3 s: nothing moves under it; the reply follows CLOSE`, async ({ page }) => {
      test.setTimeout(60_000);
      await vsComputer(page, level, QB7, { settings: { anim: 'full' } });
      if (level > 1) await kc(page, 'aiMove', level); // the engine is loaded: this test is about START, not the download
      await cpu4(page);
      const moved = await page.evaluate(() => {
        const t = performance.now();
        (window as unknown as { __kc: KC }).__kc.move!('b1b7');
        window.setTimeout(() => document.querySelector<HTMLElement>('[data-testid="start-button"]')!.click(), 50);
        return t;
      });
      await expect(page.getByTestId('start-overlay')).toBeVisible();
      await page.waitForTimeout(3000); // what must NOT happen in these 3 s: the reply and its battle
      const closed = await page.evaluate(() => {
        document.querySelector<HTMLElement>('[data-testid="start-menu-close"]')!.click();
        return performance.now();
      });
      await expect.poll(async () => (await state(page)).turn, { timeout: 15_000 }).toBe('w');
      await expect.poll(async () => !!at(await rec(page), 'battle', (v) => v === 'on', closed), { timeout: 5000 }).toBe(true); // Kxb7 battles once START is closed
      const log = await rec(page);
      const opened = at(log, 'start', (v) => v === 'open', moved)!.t;
      expect(opened - moved).toBeLessThan(250); // the setup: START opened right after the move (50 ms, CPU 4x)
      const fens = log.filter((e) => e.k === 'fen' && e.t >= moved).map((e) => e.t);
      // The first change is your move, the next the reply: never before CLOSE, and soon after it.
      const reply = fens[1]!;
      expect(reply).toBeGreaterThan(closed);
      expect(reply - closed).toBeLessThanOrEqual(AI_MIN_THINK_MS + 300);
      expect(log.filter((e) => e.k === 'battle' && e.v === 'on' && e.t >= opened && e.t < closed)).toEqual([]);
    });
  }

  test('a guest Two Players mate, START 400 ms into the end hold and open 3 s: no end panel under it; it shows on CLOSE', async ({ page }) => {
    test.setTimeout(45_000);
    await guestFriend(page);
    for (const uci of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) expect(await kc(page, 'move', uci)).toBeTruthy();
    await page.locator('body[data-hold="end"]').waitFor({ state: 'attached' });
    await page.waitForTimeout(400);
    await page.getByTestId('start-button').click();
    const opened = await now(page);
    await page.waitForTimeout(3000);
    const closed = await page.evaluate(() => {
      document.querySelector<HTMLElement>('[data-testid="start-menu-close"]')!.click();
      return performance.now();
    });
    await expect(page.getByTestId('end-screen')).toBeVisible();
    const log = await rec(page);
    expect(log.filter((e) => e.k === 'end' && e.v === 'on' && e.t >= opened && e.t < closed)).toEqual([]);
    expect(at(log, 'end', (v) => v === 'on', closed)!.t - closed).toBeLessThanOrEqual(300);
  });
});

test.describe('C2: Take back says what it undid and shows it', () => {
  test('after the computer replied: the plate goes quiet, the bar names both moves, each piece slides back; the move before stays lit', async ({ page }) => {
    await vsComputer(page, 1);
    const lit = () => page.locator('.sq.last').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.square!).sort());
    await move(page, 'e2', 'e4');
    await expect.poll(async () => (await state(page)).turn).toBe('w');
    await settled(page);
    const before = await lit();
    await move(page, 'd2', 'd4');
    await expect(page.locator('[data-square="d4"]')).toHaveAttribute('data-piece', 'wp');
    await expect.poll(async () => (await state(page)).turn).toBe('w');
    await settled(page);
    // The reply's square: of the two lit, the one a black piece stands on.
    const to = (await page.locator('.sq.last[data-piece^="b"]').getAttribute('data-square'))!;
    await expect(page.getByTestId('plate-top-msg')).not.toHaveText('');
    // Right after the tap (the next task, well within 50 ms): what the player sees.
    await page.evaluate(() =>
      document.querySelector('[data-testid="takeback"]')!.addEventListener('click', () => {
        const t0 = performance.now();
        window.setTimeout(() => {
          const anims = [...document.querySelectorAll('#board .piece, #board .classic')].flatMap((e) => e.getAnimations()).map((a) => Number(a.effect?.getComputedTiming().duration ?? 0));
          (window as unknown as { __tb: unknown }).__tb = { top: document.querySelector('[data-testid="plate-top-msg"]')!.textContent, text: document.querySelector('[data-testid="text-main"]')!.textContent, anims, ms: performance.now() - t0 };
        }, 0);
      }, { once: true, capture: true }),
    );
    await page.getByTestId('takeback').click();
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { __tb?: unknown }).__tb)).toBe(true);
    const tb = await page.evaluate(() => (window as unknown as { __tb: { top: string; text: string; anims: number[] } }).__tb);
    expect(tb.top).toBe('');
    expect(tb.text).toMatch(new RegExp(`^Took back .+ to ${to} and .+ to d4\\.$`));
    expect(Math.max(0, ...tb.anims)).toBeGreaterThanOrEqual(THEIR_SLIDE_MS);
    await expect(page.locator('[data-square="d4"]')).not.toHaveAttribute('data-piece', /./);
    await settled(page);
    // Back to after the first reply: that move is lit again, and the board is yours.
    expect(await lit()).toEqual(before);
    await move(page, 'g1', 'f3');
    await expect(page.locator('[data-square="f3"]')).toHaveAttribute('data-piece', 'wn');
  });

  test('80 ms after your move, during the think: your move is undone, the reply never comes, the board is yours', async ({ page }) => {
    await vsComputer(page, 1);
    await page.evaluate(() => {
      (window as unknown as { __kc: KC }).__kc.move!('e2e4');
      window.setTimeout(() => document.querySelector<HTMLElement>('[data-testid="takeback"]')!.click(), 80);
    });
    await expect.poll(async () => (await state(page)).fen, { timeout: 3000 }).toBe(START_FEN);
    await page.waitForTimeout(1500); // a reply that was not dropped lands in here
    expect((await state(page)).fen).toBe(START_FEN);
    await expect(page.getByTestId('text-main')).toContainText('Took back');
    await move(page, 'd2', 'd4');
    await expect(page.locator('[data-square="d4"]')).toHaveAttribute('data-piece', 'wp');
    await expect.poll(async () => (await state(page)).turn, { timeout: 5000 }).toBe('w'); // and the computer answers that
  });

  test('while a battle plays, Take back looks disabled (never a silent no-op)', async ({ page }) => {
    await vsComputer(page, 1, QB7, { settings: { anim: 'full' } });
    await move(page, 'b1', 'b7');
    await expect(page.getByTestId('battle')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('takeback')).toBeDisabled();
    await page.getByTestId('battle').waitFor({ state: 'hidden', timeout: 10_000 });
    await expect(page.getByTestId('takeback')).toBeEnabled();
  });
});

test.describe('C3: the thinking line', () => {
  test('L4, CPU 4x: on each reply "{name} is thinking…" is on the opponent plate, by its name, for at least 1000 ms', async ({ page }) => {
    test.setTimeout(90_000);
    await vsComputer(page, 4);
    const name = (await page.locator('[data-testid="plate-top"] .plate-name b').textContent())!;
    expect(name).toBe('GIOVANNI');
    await cpu4(page);
    for (const [a, b] of [['e2', 'e4'], ['d2', 'd4']] as const) {
      const t0 = await now(page);
      await move(page, a, b);
      await expect.poll(async () => (await state(page)).turn, { timeout: 30_000 }).toBe('w');
      await expect.poll(async () => (await rec(page)).filter((e) => e.k === 'top' && e.t >= t0 && !/thinking/.test(e.v) && e.v !== '').length, { timeout: 10_000 }).toBeGreaterThan(0);
      const top = (await rec(page)).filter((e) => e.k === 'top' && e.t >= t0);
      const i = top.findIndex((e) => /is thinking/.test(e.v));
      expect(i, JSON.stringify(top)).toBeGreaterThanOrEqual(0);
      expect(top[i]!.v).toBe('GIOVANNI is thinking about strategy...');
      expect(top[i + 1]!.t - top[i]!.t).toBeGreaterThanOrEqual(990);
    }
    expect((await rec(page)).filter((e) => e.k === 'text' && /thinking/.test(e.v))).toEqual([]);
  });

  test('L1 never shows it', async ({ page }) => {
    await vsComputer(page, 1);
    for (const [a, b] of [['e2', 'e4'], ['d2', 'd4']] as const) {
      await move(page, a, b);
      await expect.poll(async () => (await state(page)).turn).toBe('w');
    }
    expect((await rec(page)).filter((e) => (e.k === 'text' || e.k === 'top') && /thinking/.test(e.v))).toEqual([]);
  });

  test('a drill whose first engine download fails retries: engine moves, no "got lost", no switch to Easy', async ({ page }) => {
    test.setTimeout(60_000);
    let n = 0;
    await page.route('**/engine/stockfish-*.js', (route) => (n++ === 0 ? route.abort() : route.continue()));
    await drill(page);
    await move(page, 'h1', 'h2');
    await expect.poll(async () => (await state(page)).turn, { timeout: 30_000 }).toBe('w');
    expect((await rec(page)).filter((e) => (e.k === 'text' || e.k === 'top') && /got lost/.test(e.v))).toEqual([]);
    expect((await state(page)).aiFailed).toBe(false);
    expect(n).toBeGreaterThanOrEqual(2); // the download was tried again
  });
});

test.describe('C4: outcome lines stay readable', () => {
  test('the evolved line stays until you move', async ({ page }) => {
    await vsComputer(page, 1, '8/P6k/8/8/8/8/8/K7 w - - 0 1');
    await kc(page, 'move', 'a7a8q');
    await expect(page.getByTestId('text-main')).toContainText('evolved into');
    await expect.poll(async () => (await state(page)).turn).toBe('w');
    await settled(page);
    await expect(page.getByTestId('plate-top-msg')).not.toHaveText('');
    await expect(page.getByTestId('text-main')).toContainText('evolved into');
    await move(page, 'a1', 'b1');
    await expect(page.getByTestId('text-main')).not.toContainText('evolved into');
  });

  test('no turn line before the mate line', async ({ page }) => {
    await two(page);
    for (const uci of ['f2f3', 'e7e5', 'g2g4']) await kc(page, 'move', uci);
    const t = await now(page);
    await kc(page, 'move', 'd8h4');
    await expect(page.getByTestId('text-main')).toHaveText('PIKACHU fainted! RED blacked out!');
    const lines = (await rec(page)).filter((e) => e.k === 'text' && e.t >= t).map((e) => e.v);
    expect(lines.filter((l) => /to move/.test(l))).toEqual([]);
  });

  test('a YELLOW capture with check says the check', async ({ page }) => {
    await open(page, { cartridge: 'yellow', save: YELLOW_SAVE });
    await kc(page, 'setMode', 'two-players', 1, 'w');
    await kc(page, 'loadFen', '4k3/8/8/8/4p3/8/8/K3R3 w - - 0 1');
    await noTransition(page);
    await kc(page, 'move', 'e1e4');
    await expect(page.getByTestId('text-main')).toContainText('is in danger!', { timeout: 5000 });
  });
});

test.describe('C5: YELLOW stickers and online trade evolutions are told with the end panel', () => {
  test('a YELLOW Play win that unlocks a sticker: no toast before the panel; the panel names the sticker', async ({ page }) => {
    await open(page, { cartridge: 'yellow', save: { v: 2, caught: {}, path: 12, yellowGiven: 12 } });
    await page.getByTestId('yellow-play').click();
    await page.getByTestId('yellow-level-1').click();
    await expect(page.getByTestId('intro')).toBeVisible();
    await kc(page, 'loadFen', 'k7/8/1K6/8/8/8/8/7Q w - - 0 1');
    await kc(page, 'move', 'h1h8');
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('end-screen')).toContainText('You got ABRA!');
    await expect(page.locator('[data-testid="end-screen"] img[data-species="abra"]')).toBeVisible();
    const log = await rec(page);
    const panel = at(log, 'end', (v) => v === 'on')!.t;
    expect(log.filter((e) => e.k === 'toast' && e.t <= panel + 50)).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:p1:campaign')!).caught.abra)).toBe(1);
  });

  test('an online win with a Kadabra, then START → SAVE & QUIT in the end hold: one "evolved" toast on the next screen', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    await ctx.addInitScript(recorder);
    await ctx.addInitScript(() => localStorage.getItem('kc:v1:campaign') ?? localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', introSeen: true, teamRules: 2, caught: { squirtle: 1, kadabra: 1 }, team: { n: 'kadabra' } })));
    const a = await ctx.newPage();
    const { b } = await room(browser, a);
    await scholars(a, b);
    await a.locator('body[data-hold="end"]').waitFor({ state: 'attached', timeout: 10_000 });
    await a.getByTestId('start-button').click();
    await a.getByTestId('start-menu-quit').click();
    const left = await now(a);
    await expect(a.getByTestId('screen-title')).toBeVisible();
    await a.waitForTimeout(2500); // the end hold's own time and more: a second toast would come in here
    const toasts = (await rec(a)).filter((e) => e.k === 'toast' && /evolved into/.test(e.v));
    expect(toasts.map((e) => e.v)).toEqual(['Your KADABRA evolved into ALAKAZAM after the online win!']);
    expect(toasts[0]!.t).toBeGreaterThanOrEqual(left - 50);
  });
});

test('C6: Two Players auto flip lets the move land first, then turns the board; nothing takes input meanwhile', async ({ page }) => {
  await two(page, { settings: { autoFlip: true } });
  const e2 = (await page.locator('[data-square="e2"]').boundingBox())!;
  const tapAfter = await centre(page, '[data-square="d2"]'); // where e7 stands once the board has turned
  // The slide's start, measured in the first frame after the release.
  await page.evaluate(() => addEventListener('pointerup', (e) => (e.target as Element).closest('[data-square="e4"]') && requestAnimationFrame(() => {
    const img = document.querySelector('[data-square="e4"] .piece, [data-square="e4"] .classic');
    const a = img?.getAnimations()[0];
    const from = (a?.effect as KeyframeEffect | undefined)?.getKeyframes()[0]?.transform as string | undefined;
    const m = from ? /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(from) : null;
    const cell = document.querySelector('[data-square="e4"]')!.getBoundingClientRect();
    (window as unknown as { __slide: unknown }).__slide = m ? { x: cell.left + Number(m[1]), y: cell.top + Number(m[2]) } : null;
  }), { capture: true }));
  await move(page, 'e2', 'e4');
  await page.waitForTimeout(200);
  await page.mouse.click(tapAfter.x, tapAfter.y); // too early: the board takes no input until it has turned
  await expect.poll(async () => (await rec(page)).some((e) => e.k === 'corner' && e.v === 'h1'), { timeout: 3000 }).toBe(true);
  await settled(page);
  const slide = await page.evaluate(() => (window as unknown as { __slide: { x: number; y: number } | null }).__slide);
  expect(slide).not.toBeNull();
  expect(Math.abs(slide!.x - e2.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(slide!.y - e2.y)).toBeLessThanOrEqual(2);
  const log = await rec(page);
  const landed = at(log, 'release', (v) => v === 'e4')!.t;
  expect(at(log, 'corner', (v) => v === 'h1', landed)!.t - landed).toBeGreaterThanOrEqual(400);
  await expect(page.locator('.sq.selected')).toHaveCount(0);
  await expect(page.getByTestId('text-main')).toHaveText("BLUE's turn!");
  await move(page, 'e7', 'e5');
  await expect(page.locator('[data-square="e5"]')).toHaveAttribute('data-piece', 'bp');
});

test.describe('C7: START items that end a game ask first', () => {
  test('a guest at move 3: START → VS FRIEND asks within 150 ms; nothing changes until Yes; No keeps the game', async ({ page }) => {
    await guestFriend(page);
    for (const uci of ['e2e4', 'e7e5', 'g1f3']) await kc(page, 'move', uci);
    const fen = (await state(page)).fen;
    await page.getByTestId('start-button').click();
    const tapped = await page.evaluate(() => {
      document.querySelector<HTMLElement>('[data-testid="start-menu-friend"]')!.click();
      return performance.now();
    });
    await expect(page.getByTestId('quit-confirm')).toBeVisible();
    expect(at(await rec(page), 'confirm', (v) => v === 'on', tapped)!.t - tapped).toBeLessThan(150);
    await page.waitForTimeout(BOARD_DIP_MS + 200);
    expect((await state(page)).fen).toBe(fen);
    await expect(page.getByTestId('quit-confirm')).toContainText("Quit this game? Guest games aren't saved.");
    await page.getByTestId('quit-no').click();
    await expect(page.getByTestId('quit-confirm')).toHaveCount(0);
    expect((await state(page)).fen).toBe(fen);
    expect(await kc(page, 'move', 'b8c6')).toBeTruthy();
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-friend').click();
    await page.getByTestId('quit-yes').click();
    await expect.poll(async () => (await state(page)).fen).toBe(START_FEN);
  });

  test('a save vs Computer in progress: START → JOURNEY asks "Leave this game?"; No stays', async ({ page }) => {
    await vsComputer(page, 1);
    await move(page, 'e2', 'e4');
    await expect.poll(async () => (await state(page)).turn).toBe('w');
    const fen = (await state(page)).fen;
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-journey').click();
    await expect(page.getByTestId('quit-confirm')).toContainText('Leave this game? It ends here.');
    await page.getByTestId('quit-no').click();
    await expect(page.getByTestId('screen-game')).toBeVisible();
    expect((await state(page)).fen).toBe(fen);
  });
});

test.describe('C8: lines name the people on the plates', () => {
  const camp = (name: string) => ({ v: 2, name, starter: null, introSeen: true, teamRules: 2, caught: { charmander: 1 } }); // no starter: CONTINUE opens the hub
  test('Two Players with two saves: the header names whose move it is, as the plates do; the mate panel names the winner', async ({ page }) => {
    await seed(page, { bare: true, extra: { 'kc:v1:profiles': { slots: [1, 2], current: 1 }, 'kc:v1:p1:cartridge': 'blue', 'kc:v1:p1:campaign': camp('JADE'), 'kc:v1:p1:settings': { v: 2, anim: 'off', sound: false }, 'kc:v1:p2:cartridge': 'blue', 'kc:v1:p2:campaign': camp('SKY') } });
    await page.goto('./?debug=1&menu=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('start-continue').click();
    await page.getByTestId('two-players').click();
    await page.getByTestId('duo-w-1').click();
    await page.getByTestId('duo-b-2').click();
    await page.getByTestId('duo-start').click();
    await expect(page.getByTestId('intro')).toContainText('SKY wants to battle!');
    await page.getByTestId('intro').click();
    await expect(page.getByTestId('turn')).toHaveText('JADE to move');
    await kc(page, 'move', 'f2f3');
    await expect(page.getByTestId('turn')).toHaveText('SKY to move');
    for (const uci of ['e7e5', 'g2g4', 'd8h4']) await kc(page, 'move', uci);
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('end-text')).toHaveText('PIKACHU fainted! RED blacked out!');
    await expect(page.getByTestId('end-winner')).toHaveText('SKY wins!');
  });

  test('vs Computer L4 from the hub: "GIOVANNI wants to battle!", and the header follows the plates', async ({ page }) => {
    await open(page);
    await page.getByTestId('vs-computer').click();
    await page.getByTestId('team-red').click();
    await page.getByTestId('level-4').click();
    await expect(page.getByTestId('intro')).toContainText('GIOVANNI wants to battle!');
    await page.getByTestId('intro').click();
    await expect(page.getByTestId('turn')).toHaveText('JADE to move');
  });
});

/** Victory Road's first drill (queen and king against the lone king, 15 moves), on the board. */
async function drill(page: Page) {
  await open(page);
  await kc(page, 'enterPlace', 'victory-road');
  for (let i = 0; i < 2; i++) await page.getByTestId('story').click();
  await page.getByTestId('goal-card').click();
  await expect(page.getByTestId('screen-game')).toBeVisible();
  await noTransition(page);
}

/** A white move that ends nothing, keeps the queen safe and never repeats a position (a drill's limit test). */
function quietMove(fen: string, seen: Set<string>): string {
  const c = new Chess(fen);
  for (const m of c.moves({ verbose: true })) {
    const n = new Chess(fen);
    n.move(m);
    const key = n.fen().split(' ').slice(0, 2).join(' ');
    if (n.isGameOver() || n.inCheck() || seen.has(key) || n.moves({ verbose: true }).some((r) => r.captured)) continue;
    seen.add(key);
    return m.from + m.to;
  }
  throw new Error(`no quiet move in ${fen}`);
}

test.describe('C9: the Journey\'s challenges show who you face; drills count down', () => {
  test('Champion BLUE: his plate and sprite, his team answering your starter, his thinking line', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, { extra: { 'kc:v1:trainer': { rating: { r: 1500, rd: 60, vol: 0.06 }, solved: 30, missed: 5, assisted: 0, seen: [] } } });
    await kc(page, 'enterPlace', 'champion');
    for (let i = 0; i < 2; i++) await page.getByTestId('story').click();
    await page.getByTestId('trainer-intro').click();
    await page.getByTestId('goal-card').click();
    await expect(page.getByTestId('screen-game')).toBeVisible();
    await noTransition(page);
    await expect(page.getByTestId('plate-top')).toContainText('BLUE');
    expect(await page.locator('[data-testid="plate-top"] .plate-sprite img').getAttribute('src')).toMatch(/blue-gen1champion\.png$/);
    await expect(page.locator('[data-square="e8"]')).toHaveAttribute('aria-label', /CHARIZARD/); // bulbasaur → his charmander, fully evolved
    await move(page, 'e2', 'e4');
    await expect(page.getByTestId('plate-top-msg')).toHaveText('BLUE is thinking about strategy...', { timeout: 5000 });
    // Every line names BLUE: the plates, both bars and the header.
    expect((await rec(page)).filter((e) => /TEAM ROCKET|GIOVANNI|GRUNT/.test(e.v))).toEqual([]);
    for (const id of ['plate-top', 'plate-bottom', 'turn']) await expect(page.getByTestId(id)).not.toContainText(/TEAM ROCKET|GIOVANNI|GRUNT/);
  });

  test('a drill: PROF. OAK on the plate, no TEAM ROCKET lines, and "Moves left" counts down, highlighted from 3', async ({ page }) => {
    test.setTimeout(120_000);
    await drill(page);
    await expect(page.getByTestId('plate-top')).toContainText('OAK');
    await expect(page.getByTestId('turn')).toHaveText('Moves left: 15');
    const seen = new Set<string>();
    for (let left = 14; left >= 3; left--) {
      const uci = quietMove((await state(page)).fen, seen);
      await move(page, uci.slice(0, 2), uci.slice(2, 4));
      await expect(page.getByTestId('turn')).toHaveText(`Moves left: ${left}`);
      if (left === 14) await expect(page.getByTestId('turn')).not.toHaveClass(/moves-low/);
      await expect.poll(async () => (await state(page)).turn, { timeout: 15_000 }).toBe('w');
      await settled(page);
    }
    await expect(page.getByTestId('turn')).toHaveClass(/moves-low/);
    expect((await rec(page)).filter((e) => /TEAM ROCKET/.test(e.v))).toEqual([]);
  });
});

test('C10: a puzzle opponent with its own team plays it on its side', async ({ page }) => {
  await open(page, { save: { ...SAVE, starter: 'charmander', caught: { charmander: 1 } } });
  await kc(page, 'forcePuzzle', ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480], 'mateIn1');
  await kc(page, 'puzzleVs', { k: 'bulbasaur' });
  await expect.poll(() => kc<string>(page, 'puzzlePhase'), { timeout: 15_000 }).toBe('player');
  await expect(page.locator('[data-square="c1"]')).toHaveAttribute('aria-label', /BULBASAUR/); // the opponent's king
  await expect(page.locator('[data-square="d5"]')).not.toHaveAttribute('aria-label', /BULBASAUR/); // yours is not
});

// Online (the local relay, as online.spec.ts uses it).
const RELAY = '&relay=http://localhost:8788';
async function room(browser: Browser, a: Page): Promise<{ b: Page; code: string }> {
  await a.goto(`./?debug=1${RELAY}`);
  await a.getByTestId('screen-splash').click();
  await a.getByTestId('play-online').click();
  await a.getByTestId('create-room').click();
  const code = (await a.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  await ctx.addInitScript(recorder);
  const b = await ctx.newPage();
  await b.goto(`./?debug=1${RELAY}&room=${code}`);
  for (const p of [a, b]) await expect(p.locator('#board')).toBeVisible({ timeout: 10_000 });
  for (const p of [a, b]) await noTransition(p);
  return { b, code };
}
async function play(mover: Page, other: Page, uci: string) {
  await mover.click(`[data-square="${uci.slice(0, 2)}"]`);
  await mover.click(`[data-square="${uci.slice(2, 4)}"]`);
  for (const p of [mover, other]) await expect(p.locator(`[data-square="${uci.slice(2, 4)}"]`)).toHaveAttribute('data-piece', /./, { timeout: 8000 });
  await expect(other.locator(`[data-square="${uci.slice(0, 2)}"]`)).not.toHaveAttribute('data-piece', /./);
}
async function scholars(a: Page, b: Page) {
  const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
  for (const [i, uci] of moves.entries()) await play(i % 2 ? b : a, i % 2 ? a : b, uci);
}

test.describe('C11: online rematch and resume', () => {
  test.describe.configure({ mode: 'serial' });

  test('a swap rematch dips the board and shows the intro card with the swap line on both screens', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    await ctx.addInitScript(recorder);
    const a = await ctx.newPage();
    const { b } = await room(browser, a);
    await scholars(a, b);
    for (const p of [a, b]) await ready(p, 'end-screen');
    const t = await now(a);
    const tb = await now(b);
    await a.getByTestId('swap-sides').check();
    await a.getByTestId('rematch').click();
    await b.getByTestId('rematch').click();
    for (const [p, t0, line] of [[a, t, 'Sides swapped: you play TEAM ROCKET now.'], [b, tb, 'Sides swapped: you play TEAM RED now.']] as const) {
      await expect(p.getByTestId('intro')).toBeVisible({ timeout: 10_000 });
      await expect(p.getByTestId('intro')).toContainText(line);
      const log = await rec(p);
      const dip = at(log, 'dip', (v) => v === 'on', t0);
      expect(dip, 'the board dips').toBeTruthy();
      expect(at(log, 'intro', (v) => v !== '', t0)!.t).toBeGreaterThan(dip!.t);
    }
  });

  test('a tab reopened mid-game: "Welcome back!" with the turn, and the last move still lit', async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
    await ctx.addInitScript(recorder);
    const a = await ctx.newPage();
    const { b, code } = await room(browser, a);
    for (const [i, uci] of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'].entries()) await play(i % 2 ? b : a, i % 2 ? a : b, uci);
    const bctx = b.context();
    await b.close();
    const b2 = await bctx.newPage();
    await b2.goto(`./?debug=1${RELAY}&room=${code}`);
    await expect(b2.locator('[data-square="c4"]')).toHaveAttribute('data-piece', 'wb', { timeout: 10_000 });
    await expect(b2.getByTestId('text-main')).toContainText('Welcome back!');
    await expect(b2.locator('.sq.last')).toHaveCount(2);
    expect(await b2.locator('.sq.last').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.square).sort())).toEqual(['c4', 'f1']);
  });
});

test('C12: a YELLOW cold load requests no starter sprites before the YELLOW home shows', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await seed(page, { cartridge: 'yellow', save: { v: 2, caught: {}, path: 0, yellowGiven: 0, introSeen: true } });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-yellow')).toBeVisible();
  const early = [...urls];
  expect(early.filter((u) => /\/assets\/(front|retro|static\/front)\/(1|4|7)\.(gif|webp|png)$/.test(u))).toEqual([]);
});

test('C12: BLUE still preloads Oak and the starters at boot', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await open(page);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  for (const d of [1, 4, 7]) expect(urls.some((u) => new RegExp(`/assets/retro/${d}\\.png$`).test(u)), `retro ${d}`).toBe(true);
});

test('C13: Slow 4G, a cold promotion: the picker never shows an empty box', async ({ page }) => {
  test.setTimeout(60_000);
  // My Team species no battle preload or board has shown yet (CONTINUE resumes a game with kings and a pawn): the
  // picker is their first appearance.
  const team = { q: 'dragonite', r: 'golem', n: 'rapidash', bLight: 'hypno', bDark: 'hypno' };
  const fen = '8/7k/P7/8/8/8/8/K7 w - - 0 1';
  const game = { mode: 'computer', human: 'w', level: 1, fen, pgn: `[SetUp "1"]\n[FEN "${fen}"]\n\n*` };
  await open(page, { save: { ...SAVE, team, caught: { bulbasaur: 1, dragonite: 1, golem: 1, rapidash: 1, hypno: 1 } }, extra: { 'kc:v1:last': 'game', 'kc:v1:game': game } });
  await page.getByTestId('continue').click();
  await expect.poll(async () => (await state(page)).fen).toBe(fen);
  await noTransition(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 });
  await move(page, 'a6', 'a7');
  await expect.poll(async () => (await state(page)).turn, { timeout: 10_000 }).toBe('w');
  // Each frame the picker shows: a box is empty when neither its sprite nor its Gen 1 placeholder has arrived.
  await page.evaluate(() => {
    const w = window as unknown as { __promo: { frames: number; empty: number; worst: string[] } };
    const p = (w.__promo = { frames: 0, empty: 0, worst: [] as string[] });
    const loaded = (url: string) => performance.getEntriesByName(new URL(url, location.href).href).length > 0;
    const frame = () => {
      const panel = document.querySelector('[data-testid="promotion"]');
      if (panel) {
        p.frames++;
        const empty = [...panel.querySelectorAll('img')].filter((img) => {
          if (img.complete && img.naturalWidth > 0) return false;
          const bg = /url\("?([^")]+)"?\)/.exec(img.style.backgroundImage)?.[1];
          return !(bg && loaded(bg));
        });
        if (empty.length) {
          p.empty++;
          p.worst = empty.map((i) => i.getAttribute('src') ?? '');
        }
      }
      if (p.frames < 30) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await move(page, 'a7', 'a8');
  await expect(page.getByTestId('promotion')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __promo: { frames: number } }).__promo.frames), { timeout: 10_000 }).toBeGreaterThanOrEqual(30);
  const promo = await page.evaluate(() => (window as unknown as { __promo: { empty: number; worst: string[] } }).__promo);
  expect(promo.empty, promo.worst.join(' ')).toBe(0);
  await page.locator('[data-testid="promotion"] button[data-role="q"]').click();
  await expect(page.getByTestId('promotion')).toBeHidden();
  await expect(page.locator('[data-square="a8"]')).toHaveAttribute('aria-label', /DRAGONITE/);
});

test('C14: Battle! then START → OPTION while the bars close: OPTION stays and no game starts', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await noTransition(page);
  const before = await gamesPlayed(page);
  await page.evaluate(() => ['quick-battle', 'start-button-corner', 'start-menu-option'].forEach((id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click()));
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.waitForTimeout(BATTLE_CLOSE_MS + 400);
  await noTransition(page);
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expect(page.getByTestId('screen-game')).toHaveCount(0);
  expect(await gamesPlayed(page)).toBe(before);
});
