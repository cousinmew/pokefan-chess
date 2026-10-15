// SPDX-License-Identifier: AGPL-3.0-only
// Trust pass (14 Oct): the splash credit names no one and says what this is; the start menu and the shelf carry
// "Free fan project   About · Source on GitHub"; About & privacy opens from there, from OPTION and from the hub's
// footer, says what is stored and where, links the source and the issues, and Back returns to where it was opened
// (trust fix, 14 Oct: to the same scroll and button). The built page may connect only to itself and the relay.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { RELAY_URL, REPO_URL } from '../../src/config';
import { noTransition } from './pace';

const en = JSON.parse(readFileSync('src/data/strings.en.json', 'utf8')) as Record<string, string>;
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const CAMPAIGN = { v: 2, name: 'JADE', starter: 'charmander', introSeen: true, teamRules: 2, badges: ['boulder'], caught: { charmander: 1 }, playMs: 30 * 60_000, team: {} };

/** A returning player with one save (CONTINUE, NEW GAME, PLAY CHESS, OPTION) on the start menu. */
async function startMenu(page: Page): Promise<void> {
  await page.addInitScript((camp) => {
    localStorage.setItem('kc:v1:cartridge', '"blue"');
    localStorage.setItem('kc:v1:campaign', camp);
  }, JSON.stringify(CAMPAIGN));
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();
}

const inWindow = async (page: Page, testid: string) => {
  const b = (await page.getByTestId(testid).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(b.y, `${testid} top`).toBeGreaterThanOrEqual(-0.5);
  expect(b.y + b.height, `${testid} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
  expect(b.x + b.width, `${testid} right`).toBeLessThanOrEqual(vp.width + 0.5);
};

const focused = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? '');

test('the splash credits Cousin Mew without a name, says it is a free fan project, and a tap on that line starts', async ({ page }) => {
  await page.goto('./?debug=1&menu=1');
  await expect(page.getByTestId('splash-credit')).toHaveText(en['splash.credit']!);
  await expect(page.getByTestId('splash-credit')).toHaveText('Made by Cousin Mew for my little cousin');
  await expect(page.getByTestId('splash-fan')).toHaveText('Free, unofficial fan project');
  await expect(page.getByTestId('splash-fan')).not.toHaveAttribute('href');
  expect(await page.getByTestId('screen-splash').locator('a').count(), 'no link on the splash').toBe(0);
  await page.getByTestId('splash-fan').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();
});

// Trust fix (14 Oct): the new credit wraps on phones in de, nl, ru (and at 320 px in nearly every language); a wrapped
// credit sat left aligned (right aligned in Hebrew) under the centred title.
for (const lang of ['en', 'de', 'he'] as const) {
  test(`the splash credit and fan line stay centred when they wrap, ${lang} at 320x480`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.addInitScript((l) => localStorage.setItem('kc:v1:lang', JSON.stringify(l)), lang);
    await page.goto('./?debug=1&menu=1');
    await expect(page.getByTestId('splash-credit')).toBeVisible();
    for (const id of ['splash-credit', 'splash-fan']) {
      const m = await page.getByTestId(id).evaluate((e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        // One rect per run of text (Hebrew's isolated Latin is its own run): joined into one span per line.
        const lines = new Map<number, [number, number]>();
        for (const q of r.getClientRects()) {
          const k = Math.round(q.top + q.height / 2);
          const [l, rt] = lines.get(k) ?? [Infinity, -Infinity];
          lines.set(k, [Math.min(l, q.left), Math.max(rt, q.right)]);
        }
        const box = e.getBoundingClientRect();
        return { align: getComputedStyle(e).textAlign, lines: [...lines.values()].map(([l, rt]) => [l - box.left, box.right - rt]) };
      });
      expect(m.align, `${id} text-align`).toBe('center');
      // Every line sits in the middle of its box: as much room on its left as on its right.
      for (const [left, right] of m.lines) expect(Math.abs(left! - right!), `${id} line off centre`).toBeLessThanOrEqual(2);
    }
  });
}

test('the start menu carries the trust row; arrows, Enter, B and Escape work as before', async ({ page }) => {
  await startMenu(page);
  const row = page.getByTestId('trust-row');
  await expect(row.locator('.trust-fan')).toHaveText('Free fan project');
  await expect(page.getByTestId('trust-about')).toHaveText('About');
  const gh = page.getByTestId('trust-github');
  await expect(gh).toHaveText('Source on GitHub');
  await expect(gh).toHaveAttribute('href', REPO_URL);
  await expect(gh).toHaveAttribute('rel', 'noopener');
  await expect(gh).toHaveAttribute('target', '_blank');
  // The cursor: first item focused, arrows move it and wrap; B and Escape do nothing here, as before.
  await noTransition(page);
  await expect.poll(() => focused(page)).toBe('start-continue');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focused(page)).toBe('start-new');
  await expect(page.getByTestId('start-new')).toHaveClass(/\bon\b/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => focused(page)).toBe('start-option');
  for (const key of ['Escape', 'b']) {
    await page.keyboard.press(key);
    await expect(page.getByTestId('screen-start')).toBeVisible();
    await expect(page.getByTestId('screen-about')).toHaveCount(0);
    await expect.poll(() => focused(page)).toBe('start-option');
  }
  // Enter on a focused About opens About only, never the item under the cursor (OPTION) as well: every screen shown
  // is recorded from here.
  await page.evaluate(() => {
    const seen: string[] = ((window as unknown as { __screens: string[] }).__screens = []);
    new MutationObserver(() => seen.push(document.body.dataset.screen ?? '')).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  });
  await page.getByTestId('trust-about').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('screen-about')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __screens: string[] }).__screens)).toEqual(['screen-about']);
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();
  // The rebuilt menu still answers the keys: down to OPTION, Enter opens it.
  await noTransition(page);
  await expect.poll(() => focused(page)).toBe('start-continue');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect.poll(() => focused(page)).toBe('start-option');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
});

// en, a long language that wraps the row (de, ru) and RTL (he).
for (const lang of ['en', 'de', 'ru', 'he'] as const) for (const [w, h] of [[320, 480], [844, 390]] as const) {
  test(`the trust row and every menu item are on screen at ${w}x${h}, ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((l) => localStorage.setItem('kc:v1:lang', JSON.stringify(l)), lang);
    await startMenu(page);
    await noTransition(page);
    for (const id of ['start-continue', 'start-new', 'start-play', 'start-option', 'trust-about', 'trust-github']) await inWindow(page, id);
    for (const id of ['trust-about', 'trust-github']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(Math.min(b.width, b.height), `${id} tap target`).toBeGreaterThanOrEqual(43.5);
    }
    // A wrapped row never leaves a separator hanging at the end of a line: the only dot is between the two links.
    expect(await page.getByTestId('trust-row').locator('.trust-sep').count()).toBe(1);
    const sep = (await page.getByTestId('trust-row').locator('.trust-sep').boundingBox())!;
    const about = (await page.getByTestId('trust-about').boundingBox())!;
    expect(Math.abs(sep.y + sep.height / 2 - (about.y + about.height / 2)), 'the dot on the links\' line').toBeLessThanOrEqual(4);
  });
}

test('About lists every claim in plain words, with the source and issues links and the version', async ({ page }) => {
  await startMenu(page);
  await page.getByTestId('trust-about').click();
  const about = page.getByTestId('screen-about');
  await expect(about.locator('h2')).toHaveText('About & privacy');
  await expect(page.getByTestId('about-made')).toHaveText('PokeFan Chess was made by Cousin Mew for a little cousin who loves chess and Pokémon.');
  await expect(page.getByTestId('about-free')).toHaveText(en['about.free']!);
  for (const k of ['saves', 'feedback', 'online', 'others']) await expect(page.getByTestId(`about-${k}`)).toHaveText(en[`about.${k}`]!);
  await expect(page.getByTestId('about-code')).toHaveText(
    "A save code, if you make one, keeps a copy of your save (the trainer name picked in the game, like RED or LEAF, never a real name, and your progress) on the game's small server under that code only. It is deleted after 180 days without use.",
  );
  await expect(page.getByTestId('about-delete')).toHaveText('To delete it at once, tap "Delete my save code" in OPTION. Never post a save code publicly: anyone who has it can open that save.');
  await expect(page.getByTestId('about-feedback')).toHaveText('Feedback notes have no name or email field and are deleted after 180 days.');
  await expect(page.getByTestId('about-online')).toContainText('deleted after a day');
  const source = page.getByTestId('about-source');
  await expect(source).toHaveText('Open source: the code is on GitHub (AGPL\u20113.0)'); // a non-breaking hyphen: never "(AGPL-" / "3.0)"
  await expect(source).toHaveAttribute('href', REPO_URL);
  await expect(source).toHaveAttribute('rel', 'noopener');
  await expect(page.getByTestId('about-questions')).toHaveText('Questions, or a rights holder with a concern?');
  const issues = page.getByTestId('about-issues');
  await expect(issues).toHaveText('Open an issue on GitHub.');
  await expect(issues).toHaveAttribute('href', `${REPO_URL}/issues`);
  await expect(issues).toHaveAttribute('rel', 'noopener');
  await expect(issues).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('about-github')).toHaveText("GitHub links open GitHub's own site, with its own privacy policy.");
  await expect(page.getByTestId('about-disclaimer')).toHaveText(en['footer.disclaimer']!);
  await expect(page.getByTestId('about-version')).toHaveText(`Version ${version}`);
  await expect(page.getByTestId('start-button-corner')).toBeHidden(); // one way out: Back
});

test('About opens from the shelf, OPTION, the hub and How to Play, and Back, B or Escape return there', async ({ page }) => {
  // A first launch: the shelf. Back and Escape both return to it.
  await page.addInitScript(() => localStorage.removeItem('kc:v1:cartridge'));
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
  await expect(page.getByTestId('trust-github')).toHaveAttribute('href', REPO_URL);
  await page.getByTestId('trust-about').click();
  await expect(page.getByTestId('screen-about')).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
  await page.getByTestId('trust-about').click();
  await expect(page.getByTestId('screen-about')).toBeVisible();
  await noTransition(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
  await expect(page.getByTestId('cart-blue')).toBeVisible(); // the shelf works as before
  await page.getByTestId('cart-blue').click();
  await expect(page.getByTestId('screen-shelf')).toHaveCount(0);

  // OPTION: About near the bottom; Back returns to OPTION, whose own Back still leads to the start menu.
  await page.goto('./?debug=1&menu=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('start-option').click();
  await expect(page.getByTestId('open-about')).toHaveText('ABOUT & PRIVACY');
  await page.getByTestId('open-about').click();
  await expect(page.getByTestId('screen-about')).toBeVisible();
  await noTransition(page);
  await page.keyboard.press('b');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-start')).toBeVisible();

  // The hub's footer: About next to Source on GitHub.
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await expect(page.getByTestId('footer-github')).toHaveAttribute('href', REPO_URL);
  await expect(page.getByTestId('footer-github')).toHaveAttribute('rel', 'noopener');
  await expect(page.getByTestId('footer-github')).toHaveAttribute('target', '_blank'); // an installed app keeps the game
  await page.getByTestId('footer-about').click();
  await expect(page.getByTestId('screen-about')).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();

  // How to Play has the same footer; Back returns to the page it was on.
  await page.getByTestId('how-to').click();
  await page.getByTestId('manual-tab-online').click();
  await page.getByTestId('footer-about').click();
  await expect(page.getByTestId('screen-about')).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('screen-howto')).toBeVisible();
  await expect(page.getByTestId('manual-page-online')).toBeVisible();
});

// Trust fix (14 Oct): OPTION and the hub are rebuilt on Back, which put them at the top with focus on BODY; About
// was reached by scrolling to the bottom, so Back put the player somewhere else. Holding B or Escape went back twice.
test('Back from About returns to the same scroll and button in OPTION and the hub; a held Escape goes back once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  const scrollOf = (screen: string) => page.getByTestId(screen).locator('.menu-body').evaluate((b) => b.scrollTop);
  for (const [screen, opener, open] of [
    ['screen-settings', 'open-about', () => page.getByTestId('settings').first().click()],
    ['screen-title', 'footer-about', async () => undefined],
  ] as const) {
    await open();
    await expect(page.getByTestId(screen)).toBeVisible();
    await noTransition(page);
    await page.getByTestId(opener).scrollIntoViewIfNeeded();
    const before = await scrollOf(screen);
    expect(before, `${screen} scrolled to reach ${opener}`).toBeGreaterThan(100);
    await page.getByTestId(opener).click();
    await expect(page.getByTestId('screen-about')).toBeVisible();
    await page.getByTestId('back').click();
    await expect(page.getByTestId(screen)).toBeVisible();
    await expect.poll(() => scrollOf(screen)).toBeGreaterThanOrEqual(before - 2);
    expect(await scrollOf(screen)).toBeLessThanOrEqual(before + 2);
    await expect.poll(() => focused(page)).toBe(opener);
    if (screen === 'screen-settings') {
      // A held Escape (keydown, then repeats) on About opened from OPTION stops at OPTION.
      await page.getByTestId(opener).click();
      await expect(page.getByTestId('screen-about')).toBeVisible();
      await noTransition(page);
      await page.keyboard.down('Escape');
      await expect(page.getByTestId('screen-settings')).toBeVisible();
      for (let i = 0; i < 3; i++) await page.keyboard.down('Escape'); // repeat: true, as a held key sends
      await page.keyboard.up('Escape');
      await expect(page.getByTestId('screen-settings')).toBeVisible();
      await page.getByTestId('back').click();
      await expect(page.getByTestId('screen-title')).toBeVisible();
    }
  }
});

// Trust fix (14 Oct): a link with ?debug=1&relay=https://another.host used to send that host the feedback queue, save
// codes and online games. The relay param now takes only localhost (unit tested), and the built page's
// Content-Security-Policy lets the browser connect only to the game itself, the relay and a relay on this machine.
test('the built page may connect only to itself, the relay and localhost', async ({ page }) => {
  await page.goto('./?debug=1&relay=https://example.com');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toBe(`connect-src 'self' ${RELAY_URL} ${RELAY_URL.replace('https:', 'wss:')} http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*`);
  const tried = await page.evaluate(async () => {
    const blocked: string[] = [];
    document.addEventListener('securitypolicyviolation', (e) => blocked.push(`${e.effectiveDirective} ${e.blockedURI}`));
    const go = (u: string) => fetch(u).then(() => 'ok', () => 'failed');
    const out = { other: await go('https://example.com/feedback'), self: await go('./manifest.webmanifest'), local: await go('http://localhost:8788/health') };
    await new Promise((r) => setTimeout(r, 50));
    return { ...out, blocked };
  });
  expect(tried.other).toBe('failed');
  expect(tried.blocked).toEqual(['connect-src https://example.com/feedback']);
  expect(tried.self).toBe('ok');
  expect(tried.local).toBe('ok');
});
