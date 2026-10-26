// SPDX-License-Identifier: AGPL-3.0-only
// Sprite paint lint (23 Oct): six cold walks over every screen that shows sprites, on Fast 4G (the gate) or on Slow
// 4G with a 4x slower CPU (@perf: PERF=1 npx playwright test paint.spec.ts --project perf), recorded by paintwatch.ts.
// Fails on what does not depend on timing: an asset that fails, an image whose box is not reserved before it loads
// or changed size as it drew, a trainer with no sprite. Pop-in (an image blank on screen), late reveals and layout
// shifts are logged per step and written to the test's output folder as paint.json; @perf also fails on a blank with
// nothing standing in that outlasts BLANK_MS, KNOWN ones aside. Two more checks hold a sprite's files back to see
// that an evolution and a capture battle never start on an empty box. The data side: tests/unit/spriterefs.test.ts.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { FAST_4G, FEN_D5, SAVE, SLOW_4G, boot, cartBlue, fresh, kc } from './loadwatch';
import { settled } from './pace';
import { audit, mark, painter, pw, type Pw } from './paintwatch';

const BLANK_MS = 300; // @perf: longest an image may stay blank on screen with nothing standing in
/** Known pop-ins (paint lint, 23 Oct), each one in the fix plan: logged, and not failed by @perf until fixed, by
 * where they show. Anything else blank past BLANK_MS fails. */
const KNOWN: [RegExp, string][] = [
  [/^screen-dex dex-[a-z-]+ \.dex-sprite$/, 'the Pokédex opens at the SCREEN_READY_MS cap, 300 ms, with its stills loading'],
  [/^screen-(level|yellow-levels) loadout \.loadout-mon$/, 'the level pickers open at the same cap'],
  [/^screen-route \.dex-sprite$/, "a route's wild Pokémon (animated fronts) at the same cap"],
  [/^screen-team team-red \.menu-sprite$/, "the team picker's animated fronts at the same cap"],
];
const known = (at: string) => KNOWN.some(([re]) => re.test(at));
/** Mate in 1 by a capture (a battle): the set up a2-a3, then Re8xe1#. */
const CAPTURE1 = ['pace1', '4r1k1/5ppp/8/8/8/8/P4PPP/4N1K1 w - - 0 1', 'a2a3 e8e1', 600];
const YELLOW = { 'kc:v1:cartridge': 'yellow', 'kc:v1:campaign': { v: 2, name: '', introSeen: true, caught: {}, team: {}, journey: { cleared: [], beaten: [], visited: [] } } };

type Step = (name: string, act?: () => Promise<unknown>) => Promise<void>;
type Body = (page: Page, step: Step, reboot: () => Promise<void>) => Promise<void>;

/** One walk: a fresh context, every step marked, then settled and audited; the report is written whatever happens. */
async function walk(browser: Browser, name: string, store: Record<string, unknown>, perf: boolean, body: Body, newDevice = false): Promise<void> {
  test.setTimeout(perf ? 360_000 : 150_000);
  const { context, page } = await fresh(browser, store, perf ? SLOW_4G : FAST_4G, perf ? 4 : 1, 'no-preference', newDevice);
  await context.addInitScript(painter);
  const failed: string[] = [];
  page.on('response', (r) => void (r.status() >= 400 && /\/(assets|art)\//.test(r.url()) && failed.push(`${r.status()} ${r.url().replace(/^.*?\/(?=assets\/|art\/)/, '')}`)));
  const audited: string[] = [];
  const step: Step = async (s, act) => {
    await mark(page, s);
    await act?.();
    await settled(page, 60_000).catch(() => undefined); // a looping hold (a lesson board) never settles: audit as is
    audited.push(`${s} (${await audit(page, s)})`);
  };
  // A reload starts a new record: what the page saw before it is kept here.
  const before: Pw[] = [];
  const reboot = async () => {
    before.push(await pw(page));
    await boot(page);
  };
  let p: Pw | null;
  try {
    await boot(page);
    await body(page, step, reboot);
  } finally {
    const last = await pw(page).catch(() => null);
    p = last && [...before, last].reduce((a, b) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Array.isArray(v) ? [...v, ...(b[k as keyof Pw] as unknown[])] : b[k as keyof Pw]])) as Pw);
    if (p) {
      writeFileSync(test.info().outputPath('paint.json'), JSON.stringify({ walk: name, net: perf ? 'Slow 4G, CPU 4x' : 'Fast 4G', audited, failed, ...p }, null, 1));
      console.log(summary(name, perf, p, failed, audited));
    }
    await context.close();
  }
  expect(failed, 'asset requests that failed').toEqual([]);
  expect(p!.broken, 'images that failed on screen').toEqual([]);
  expect(p!.unreserved, 'images with no box of their own before they load (they move the layout when they do)').toEqual([]);
  expect(p!.jumps, 'images whose box changed size as they drew').toEqual([]);
  expect(p!.noArt, 'a trainer with no sprite (a silhouette for good)').toEqual([]);
  if (perf) expect(p!.blanks.filter((b) => !b.stand && b.ms > BLANK_MS && !known(b.at)), `blank on screen over ${BLANK_MS} ms with nothing standing in`).toEqual([]);
}

/** One line per finding kind, the worst first. */
function summary(name: string, perf: boolean, p: Pw, failed: string[], audited: string[]): string {
  const hard = p.blanks.filter((b) => !b.stand).sort((a, b) => b.ms - a.ms);
  const soft = p.blanks.filter((b) => b.stand).sort((a, b) => b.ms - a.ms);
  const cls = (kind: string) => {
    const by = new Map<string, number>();
    for (const s of p.shifts) if (!s.input && s.kind === kind) by.set(s.mark, (by.get(s.mark) ?? 0) + s.v);
    return [...by].map(([m, v]) => `${m} ${v.toFixed(3)}`).join(', ') || 'none';
  };
  const late = p.reveals.filter((r) => r.late.length);
  const early = p.opens.filter((o) => !o.capped && o.late.length);
  const b = (x: Pw['blanks'][number]) => `${x.src} @ ${x.at} [${x.mark}] ${x.ms} ms${x.stand ? ` (${x.stand})` : known(x.at) ? ' (known)' : ''}`;
  return [
    `paint ${name} (${perf ? 'Slow 4G' : 'Fast 4G'}): audited ${audited.join(', ')}`,
    `  blank, nothing standing in: ${hard.length}${hard.length ? `: ${hard.slice(0, 8).map(b).join('; ')}` : ''}`,
    `  blank behind a stand-in: ${soft.length}${soft.length ? `: ${soft.slice(0, 5).map(b).join('; ')}` : ''}`,
    `  covers opened before their cap on images not drawn: ${early.length ? early.map((o) => `${o.kind} ${o.scr} [${o.mark}] ${o.late.join(', ')}`).join('; ') : 'none'}`,
    `  late reveals: ${late.length}${late.length ? `: ${late.slice(0, 6).map((r) => `${r.what} [${r.mark}] ${r.late.join(', ')}`).join('; ')}` : ''}`,
    `  layout shift as images draw (no input), by step: ${cls('img')}`,
    `  layout shift of the battle screen's own motion: ${cls('battle')}; other: ${cls('other')}`,
    `  unreserved: ${p.unreserved.map((u) => `${u.src} @ ${u.at} [${u.mark}] ${u.box} -> ${u.empty}`).join('; ') || 'none'}`,
    `  jumps: ${p.jumps.map((j) => `${j.src} @ ${j.at} [${j.mark}] ${j.from} -> ${j.to}`).join('; ') || 'none'}`,
    `  broken: ${[...p.broken, ...failed].join('; ') || 'none'}; trainers with no art: ${p.noArt.join('; ') || 'none'}`,
  ].join('\n');
}

/** Holds `dex`'s files (`kinds`: the animated ones, the still, the Gen 1 sprite) for `ms`, as a phone that has not got
 * them yet when an animation needs them. Through CDP with patterns for those files only: page.route() would disable
 * the HTTP cache, and every other image would load again too. */
async function late(page: Page, dex: number, ms: number, kinds = ['front', 'back', 'static/front', 'retro']): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Fetch.requestPaused', (e: { requestId: string }) => void setTimeout(() => void cdp.send('Fetch.continueRequest', { requestId: e.requestId }).catch(() => undefined), ms));
  await cdp.send('Fetch.enable', { patterns: kinds.flatMap((k) => [k, `shiny/${k}`]).map((k) => ({ urlPattern: `*/assets/${k}/${dex}.*`, requestStage: 'Request' as const })) });
}
const tap = (page: Page, id: string) => page.getByTestId(id).first().click({ timeout: 60_000 });
const playerTurn = (page: Page) => page.waitForFunction(() => (window as unknown as { __kc: { puzzlePhase: () => string } }).__kc.puzzlePhase() === 'player', null, { timeout: 60_000 });
const battleDone = async (page: Page) => {
  await page.locator('[data-testid="battle"]:not([hidden])').waitFor({ timeout: 60_000 });
  await page.locator('[data-testid="battle"]').waitFor({ state: 'hidden', timeout: 60_000 });
};

test.describe.configure({ mode: 'parallel' });

for (const perf of [false, true]) {
  const tag = perf ? '@perf ' : '';
  test.describe(`${tag}sprite paint lint`, () => {
    test(`${tag}BLUE new game: title, Oak, name, starters, map, warm-up board, encounter`, async ({ browser }) => {
      await walk(browser, 'blue-new', cartBlue, perf, async (page, step) => {
        await step('title');
        await step('Oak story', () => tap(page, 'kanto'));
        for (let i = 0; i < 2; i++) await tap(page, 'story');
        await step('name step', () => tap(page, 'story').then(() => page.getByTestId('screen-name').waitFor({ timeout: 60_000 })));
        await step('starters', () => tap(page, 'name-2').then(() => page.getByTestId('starter-bulbasaur').waitFor({ timeout: 60_000 })));
        await step('starter story', () => tap(page, 'starter-bulbasaur'));
        for (let i = 0; i < 2; i++) await tap(page, 'story');
        await step('map', () => page.getByTestId('screen-map').waitFor({ timeout: 60_000 }));
        await step('route 1 warm-up', () => tap(page, 'route-route-1'));
        await step('warm-up board', () => tap(page, 'warmup-go').then(() => page.getByTestId('path-progress').waitFor({ timeout: 60_000 })));
        const move = async (from: string, to: string) => {
          await page.click(`[data-square="${from}"]`, { timeout: 60_000 });
          await page.click(`[data-square="${to}"]`, { timeout: 60_000 });
        };
        await move('c1', 'c4');
        await tap(page, 'path-next');
        await expect(page.getByTestId('turn')).toHaveText('Put the king in check!', { timeout: 60_000 });
        await move('a1', 'a8');
        await tap(page, 'path-next');
        await expect(page.getByTestId('turn')).toHaveText('Checkmate in 1 move!', { timeout: 60_000 });
        await move('a1', 'a8');
        await tap(page, 'path-next');
        await expect(page.getByTestId('story-text')).toHaveText('OAK: Rustling in the grass! Try a Poké Ball!', { timeout: 60_000 });
        await step('encounter', () => tap(page, 'story').then(() => page.getByTestId('encounter').waitFor({ timeout: 60_000 })));
      });
    });

    test(`${tag}BLUE route: hub, START, map, route, tall grass, lesson, trainer intro, capture battle`, async ({ browser }) => {
      const save = { ...SAVE, lessonsSeen: SAVE.lessonsSeen.filter((t) => t !== 'mateIn1') };
      await walk(browser, 'blue-route', { ...cartBlue, 'kc:v1:campaign': save }, perf, async (page, step) => {
        await step('hub');
        await step('map', () => tap(page, 'kanto').then(() => page.getByTestId('screen-map').waitFor({ timeout: 60_000 })));
        await step('route 1', () => tap(page, 'route-route-1').then(() => page.getByTestId('screen-route').waitFor({ timeout: 60_000 })));
        await step('tall grass board', () => tap(page, 'walk-grass').then(() => page.locator('[data-square]').first().waitFor({ timeout: 60_000 })));
        await tap(page, 'leave-grass');
        await page.getByTestId('screen-route').waitFor({ timeout: 60_000 });
        await kc(page, 'forcePuzzle', CAPTURE1, 'mateIn1');
        await step('lesson', () => tap(page, 'battle-trainer').then(() => page.getByTestId('mini-board').waitFor({ timeout: 60_000 })));
        await step('trainer intro', () => tap(page, 'lesson-ok').then(() => page.getByTestId('trainer-intro').waitFor({ timeout: 60_000 })));
        await step('goal card', () => tap(page, 'trainer-intro').then(() => page.getByTestId('goal-card').waitFor({ timeout: 60_000 })));
        await step('puzzle board', () => tap(page, 'goal-card').then(() => playerTurn(page)));
        await mark(page, 'capture battle');
        await page.click('[data-square="e8"]', { timeout: 60_000 });
        await page.click('[data-square="e1"]', { timeout: 60_000 });
        await battleDone(page);
        await step('after the battle');
      });
    });

    test(`${tag}BLUE Pokédex, My Team, an evolution, the Cinnabar Lab`, async ({ browser }) => {
      await walk(browser, 'blue-dex', { ...cartBlue, 'kc:v1:campaign': SAVE }, perf, async (page, step, reboot) => {
        await kc(page, 'grant', 'bulbasaur', 9); // 27 candy: IVYSAUR costs 25
        await step('map', () => tap(page, 'kanto').then(() => page.getByTestId('screen-map').waitFor({ timeout: 60_000 })));
        await step('My Team', () => tap(page, 'open-team').then(() => page.getByTestId('screen-team').waitFor({ timeout: 60_000 })));
        await tap(page, 'back');
        await step('Trainer Card', () => tap(page, 'open-card').then(() => page.getByTestId('trainer-card').waitFor({ timeout: 60_000 })));
        await tap(page, 'back');
        await step('Training', () => tap(page, 'open-training').then(() => page.getByTestId('screen-training').waitFor({ timeout: 60_000 })));
        await tap(page, 'back');
        // Every Journey trainer has art: the Cinnabar Lab's SCIENTIST had no sprite id, so a silhouette for good.
        await step('Cinnabar Lab intro', async () => {
          await kc(page, 'enterPlace', 'cinnabar-lab');
          await page.getByTestId('story').waitFor({ timeout: 60_000 });
          while (!(await page.getByTestId('trainer-intro').isVisible())) await tap(page, 'story'); // the Lab's story first
        });
        await reboot();
        await tap(page, 'kanto');
        await step('Pokédex', () => tap(page, 'open-dex').then(() => page.getByTestId('screen-dex').waitFor({ timeout: 60_000 })));
        await step('dex entry', () => tap(page, 'dex-bulbasaur').then(() => page.getByTestId('dex-detail').waitFor({ timeout: 60_000 })));
        await step('evolution', () => tap(page, 'evolve-ivysaur').then(() => expect(page.getByTestId('dex-detail')).toContainText('IVYSAUR x1', { timeout: 60_000 })));
      });
    });

    test(`${tag}BLUE vs Computer: team, level picker, intro card, board, capture battle`, async ({ browser }) => {
      await walk(browser, 'blue-vs', cartBlue, perf, async (page, step) => {
        await step('team picker', () => tap(page, 'vs-computer').then(() => page.getByTestId('team-red').waitFor({ timeout: 60_000 })));
        await step('level picker', () => tap(page, 'team-red').then(() => page.getByTestId('level-1').waitFor({ timeout: 60_000 })));
        await step('board', async () => {
          await tap(page, 'level-1');
          await page.getByTestId('intro').waitFor({ timeout: 60_000 });
          await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
        });
        await step('START menu', () => tap(page, 'start-button').then(() => page.getByTestId('start-overlay').waitFor({ timeout: 60_000 })));
        await tap(page, 'start-menu-close');
        await step('new position', () => kc(page, 'loadFen', FEN_D5));
        await mark(page, 'capture battle');
        await page.click('[data-square="e4"]', { timeout: 60_000 });
        await page.click('[data-square="d5"]', { timeout: 60_000 });
        await battleDone(page);
        await step('after the battle');
      });
    });

    test(`${tag}first launch: the cartridge shelf, BLUE's title`, async ({ browser }) => {
      await walk(browser, 'shelf', {}, perf, async (page, step) => {
        await step('shelf');
        await step('BLUE title', () => tap(page, 'cart-blue').then(() => page.getByTestId('kanto').waitFor({ timeout: 60_000 })));
      }, true);
    });

    test(`${tag}YELLOW: home, lessons, lesson board, levels, board`, async ({ browser }) => {
      await walk(browser, 'yellow', YELLOW, perf, async (page, step, reboot) => {
        await step('YELLOW home');
        await step('lessons', () => tap(page, 'yellow-learn').then(() => page.getByTestId('lesson-1').waitFor({ timeout: 60_000 })));
        await step('lesson board', () => tap(page, 'lesson-1').then(() => page.getByTestId('path-progress').waitFor({ timeout: 60_000 })));
        await reboot();
        await step('levels', () => tap(page, 'yellow-play').then(() => page.getByTestId('yellow-level-1').waitFor({ timeout: 60_000 })));
        await step('board', async () => {
          await tap(page, 'yellow-level-1');
          await page.getByTestId('intro').waitFor({ timeout: 60_000 });
          await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
        });
      });
    });
  });
}

// Animations against files that come late (no throttle: the route holds them), so each one meets its sprites' cap.
test.describe('sprite paint lint: animations wait for their frames', () => {
  // METAPOD: in no team the idle preload fetches for this save, so nothing has it before the Pokédex asks.
  test("evolution: METAPOD's files 8 s late, nothing blank on the evolution screen", async ({ browser }) => {
    // Known (paint lint, 23 Oct; in the fix plan): with none of the three files in by the flash, 'evolve-flash' puts
    // in the animation still loading (src/battle/overlay.ts evolve), and the evolved form is an empty box for about
    // 1.35 s. This passes once that is fixed: then drop the line below.
    test.fail(true, 'the evolved form is blank when none of its sprites is in by the flash');
    await walk(browser, 'evolve-late', { ...cartBlue, 'kc:v1:campaign': SAVE }, false, async (page, step) => {
      await kc(page, 'grant', 'caterpie', 9); // 27 candy: METAPOD costs 25
      await late(page, 11, 8000);
      await step('Pokédex', () => tap(page, 'kanto').then(() => tap(page, 'open-dex')));
      await step('dex entry', () => tap(page, 'dex-caterpie').then(() => page.getByTestId('evolve-metapod').waitFor({ timeout: 60_000 })));
      await step('evolution', () => tap(page, 'evolve-metapod').then(() => expect(page.getByTestId('dex-detail')).toContainText('METAPOD x1', { timeout: 60_000 })));
      const p = await pw(page);
      expect(p.blanks.filter((b) => / battle /.test(` ${b.at} `)), 'blank on the evolution screen').toEqual([]);
    });
  });

  test("capture battle: both animated sprites 3 s late, the battle's first frame is drawn", async ({ browser }) => {
    await walk(browser, 'battle-late', cartBlue, false, async (page, step) => {
      await step('board', async () => {
        await tap(page, 'two-players');
        await page.getByTestId('intro').waitFor({ timeout: 60_000 });
        await page.getByTestId('intro').waitFor({ state: 'detached', timeout: 60_000 });
      });
      await step('new position', () => kc(page, 'loadFen', FEN_D5));
      const dex = await page.evaluate(() => ['e4', 'd5'].map((sq) => document.querySelector(`[data-square="${sq}"] img.piece`)?.getAttribute('src')?.match(/\/(\d+)\.\w+$/)?.[1]));
      expect(dex.every(Boolean), `species on e4 and d5: ${dex.join(', ')}`).toBe(true);
      for (const d of dex) await late(page, Number(d), 3000, ['front', 'back']);
      await mark(page, 'capture battle');
      await page.click('[data-square="e4"]', { timeout: 60_000 });
      await page.click('[data-square="d5"]', { timeout: 60_000 });
      await battleDone(page);
      const p = await pw(page);
      expect(p.reveals.filter((r) => r.what === 'battle' && r.late.length), 'the battle screen shown with a sprite not drawn').toEqual([]);
      expect(p.blanks.filter((b) => / battle /.test(` ${b.at} `)), 'blank on the battle screen').toEqual([]);
    });
  });
});
