// SPDX-License-Identifier: AGPL-3.0-only
// Trust pass (14 Oct): the splash credit names no one and says what this is; the start menu and the shelf carry
// "Free fan project · About · Source on GitHub"; About & privacy opens from there, from OPTION and from the hub's
// footer, says what is stored and where, links the source and the issues, and Back returns to where it was opened.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { REPO_URL } from '../../src/config';
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

for (const [w, h] of [[320, 480], [844, 390]] as const) {
  test(`the trust row and every menu item are on screen at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await startMenu(page);
    await noTransition(page);
    for (const id of ['start-continue', 'start-new', 'start-play', 'start-option', 'trust-about', 'trust-github']) await inWindow(page, id);
    for (const id of ['trust-about', 'trust-github']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(Math.min(b.width, b.height), `${id} tap target`).toBeGreaterThanOrEqual(43.5);
    }
  });
}

test('About lists every claim in plain words, with the source and issues links and the version', async ({ page }) => {
  await startMenu(page);
  await page.getByTestId('trust-about').click();
  const about = page.getByTestId('screen-about');
  await expect(about.locator('h2')).toHaveText('About & privacy');
  await expect(page.getByTestId('about-made')).toHaveText('PokeFan Chess was made by Cousin Mew for a little cousin who loves chess and Pokémon.');
  await expect(page.getByTestId('about-free')).toHaveText(en['about.free']!);
  for (const k of ['saves', 'code', 'feedback', 'online', 'others']) await expect(page.getByTestId(`about-${k}`)).toHaveText(en[`about.${k}`]!);
  await expect(page.getByTestId('about-code')).toContainText('180 days');
  await expect(page.getByTestId('about-online')).toContainText('deleted after a day');
  const source = page.getByTestId('about-source');
  await expect(source).toHaveText('Open source: the code is on GitHub (AGPL-3.0)');
  await expect(source).toHaveAttribute('href', REPO_URL);
  await expect(source).toHaveAttribute('rel', 'noopener');
  await expect(page.getByTestId('about-questions')).toHaveText('Questions, or a rights holder with a concern?');
  const issues = page.getByTestId('about-issues');
  await expect(issues).toHaveText('Open an issue on GitHub.');
  await expect(issues).toHaveAttribute('href', `${REPO_URL}/issues`);
  await expect(issues).toHaveAttribute('rel', 'noopener');
  await expect(issues).toHaveAttribute('target', '_blank');
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
