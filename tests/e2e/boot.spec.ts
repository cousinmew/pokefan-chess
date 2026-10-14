// SPDX-License-Identifier: AGPL-3.0-only
// Boot fix, 14 Oct: the splash comes quickly and nothing boot fetches or reads can keep it away. (1) A saved
// language's tables are waited for at most BOOT_LANG_MS: a request that stalled left a French save on a blank page for
// good; past the cap the splash shows in English and takes the language when its table lands. The Slow 4G cases time
// the splash from the navigation to the tap it takes. (2) A save whose My Team names a species this build does not
// know ("missingno": another build, an edited backup or save code) threw in the Journey's My Team prefetch: a blank
// page, OPTION out of reach. Its slot now plays the default piece, and Import and save codes drop it.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const strings = (l: string) => JSON.parse(readFileSync(`src/data/strings.${l}.json`, 'utf8')) as Record<string, string>;
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 };
const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, warmup: true, tips: ['puzzle'], journey: { cleared: [], beaten: [], visited: [] } };
const STRINGS_FR = /\/assets\/strings\.fr-[\w-]+\.js$/;
/** Slow 4G with a 4x slower CPU, cold: the splash takes a tap by then (from the navigation). Measured on this build,
 * three tests at a time: 2.9 to 3.3 s for an English device or a French save, 3.9 to 4.4 s for a French save whose
 * table stalls (it waits BOOT_LANG_MS, 1 s, more). */
const TAP_BY_MS = 4500;
const TAP_STALLED_BY_MS = 6000;
/** SPLASH_AUTO_MS in src/config.ts: the splash moves on by itself this long after it shows. */
const SPLASH_AUTO_MS = 2500;

type Boot = { shown: number; tap: number | null; left: number | null; said: string | null; hints: { t: number; n: string; text: string }[]; lang: string };

/** In the page, from the navigation: when the splash shows and leaves, every text of its "tap" line (with the
 * element it is in), and the first tap on it with what its line said then. */
function recorder(): void {
  const w = window as unknown as { __boot: Boot };
  const b: Boot = (w.__boot = { shown: -1, tap: null, left: null, said: null, hints: [], lang: '' });
  let count = 0;
  const hint = () => document.querySelector('[data-testid="screen-splash"] .hint')?.textContent ?? '';
  addEventListener(
    'pointerdown',
    (e) => {
      if (b.tap !== null || !(e.target as Element | null)?.closest?.('[data-testid="screen-splash"]')) return;
      b.tap = performance.now();
      b.said = hint();
      b.lang = document.documentElement.lang;
    },
    true,
  );
  new MutationObserver(() => {
    const s = document.querySelector<HTMLElement>('[data-testid="screen-splash"]');
    if (s && b.shown < 0) b.shown = performance.now();
    if (!s && b.shown >= 0 && b.left === null) b.left = performance.now();
    if (!s) return;
    s.dataset.n ??= String(++count);
    const text = hint();
    if (text && b.hints.at(-1)?.text !== text) b.hints.push({ t: performance.now(), n: s.dataset.n, text });
  }).observe(document, { childList: true, subtree: true, characterData: true });
}
const booted = (page: Page) => page.evaluate(() => (window as unknown as { __boot: Boot }).__boot);

function seed(page: Page, lang: string | null, campaign: object = SAVE): Promise<unknown> {
  return page.addInitScript(
    ([c, l]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('kc:v1:campaign', JSON.stringify(c));
      if (l) localStorage.setItem('kc:v1:lang', JSON.stringify(l));
    },
    [campaign, lang] as const,
  );
}

async function slow4g(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe('B1 Slow 4G + 4x CPU, cold: the splash takes a tap quickly', () => {
  const cases = [
    { name: 'an English device', lang: null, stall: false, says: 'en', html: 'en', by: TAP_BY_MS },
    { name: 'a French save (its tables come with the bundle)', lang: 'fr', stall: false, says: 'fr', html: 'fr', by: TAP_BY_MS },
    // The base build waited for this table with no limit: the page stayed blank (no splash after 20 s).
    { name: "a French save whose strings table never comes (a stalled request): in English, the save's language kept", lang: 'fr', stall: true, says: 'en', html: 'fr', by: TAP_STALLED_BY_MS },
  ];
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      test.setTimeout(90_000);
      await seed(page, c.lang);
      await page.addInitScript(recorder);
      if (c.stall) await page.route(STRINGS_FR, () => undefined); // never answered
      await slow4g(page);
      // Not page.goto's `load`: boot's image preloads hold it back, on Slow 4G about 1.7 s past the splash.
      await page.goto('./?debug=1', { waitUntil: 'commit' });
      await page.getByTestId('screen-splash').click({ timeout: 30_000 });
      await expect(page.getByTestId('screen-title')).toBeVisible({ timeout: 30_000 });
      const b = await booted(page);
      console.log(`B1 ${c.name}: splash at ${Math.round(b.shown)} ms, tap taken at ${Math.round(b.tap ?? -1)} ms`);
      expect(b.tap).not.toBeNull();
      expect(b.tap!).toBeLessThanOrEqual(c.by);
      expect(b.left! - b.tap!).toBeLessThan(500); // the tap moved it on
      expect(b.left! - b.shown).toBeLessThan(SPLASH_AUTO_MS); // not its own timer
      expect(b.said).toBe(strings(c.says)['splash.tap']);
      expect(b.lang).toBe(c.html);
    });
  }
});

test("B2 a French save's table that lands after the cap relabels the same splash, and later screens read French", async ({ page }) => {
  await seed(page, 'fr');
  await page.addInitScript(recorder);
  let landed = 0;
  await page.route(STRINGS_FR, async (r) => {
    await new Promise((res) => setTimeout(res, 1800));
    landed = Date.now();
    await r.continue();
  });
  await page.goto('./?debug=1', { waitUntil: 'commit' });
  await expect.poll(async () => (await booted(page)).hints.map((h) => h.text), { timeout: 10_000 }).toEqual([strings('en')['splash.tap'], strings('fr')['splash.tap']]);
  expect(landed).toBeGreaterThan(0);
  const b = await booted(page);
  // The base build: no splash until the table came, then French only ([fr]).
  expect(new Set(b.hints.map((h) => h.n)).size).toBe(1); // the same splash, relabelled in place (its hold runs on)
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toContainText(strings('fr')['hub.journey.title']!);
});

test.describe('B3 a My Team species this build does not know', () => {
  const TEAM = { n: 'missingno', p: 'pidgey' };

  test('boots: the start menu, CONTINUE to the map, My Team (the knight plays the default piece), the hub and OPTION', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seed(page, null, { ...SAVE, team: TEAM });
    await page.goto('./');
    // The base build: "Cannot read properties of undefined (reading 'dex')" in JourneyGame's constructor (teamArt), a
    // blank page with no splash.
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('start-continue').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await page.getByTestId('open-team').click();
    await expect(page.getByTestId('screen-team')).toBeVisible();
    await expect(page.getByTestId('team-n')).toHaveValue('');
    await expect(page.getByTestId('team-p')).toHaveValue('pidgey');
    await page.getByTestId('back').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('screen-title')).toBeVisible();
    await expect(page.getByTestId('hub-team')).toContainText(strings('en')['hub.chip.team']!.replace('{n}', '1')); // the known slot only
    await page.getByTestId('settings').click();
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Import drops the unknown slot, keeps the rest, and the restored save boots', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seed(page, null);
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('settings').click();
    const data = { cartridge: 'blue', campaign: { ...SAVE, name: 'SKY', team: { ...TEAM, k: 'constructor' } } };
    await page.getByTestId('import-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'pokefan-chess', v: 1, data })) });
    // The page reloads into the restored save and continues it (the base build stored "missingno": a blank page).
    await page.getByTestId('screen-splash').click();
    await expect(page.getByTestId('screen-map')).toBeVisible();
    await page.getByTestId('back').click();
    await expect(page.getByTestId('screen-title')).toBeVisible();
    const stored = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => /^kc:v1:(p\d+:)?campaign$/.test(x) && localStorage.getItem(x)!.includes('SKY'));
      return k ? (JSON.parse(localStorage.getItem(k)!) as { team: object }).team : null;
    });
    expect(stored).toEqual({ p: 'pidgey' });
    await page.getByTestId('settings').click();
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
