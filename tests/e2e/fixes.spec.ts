// SPDX-License-Identifier: AGPL-3.0-only
// Three fixes: the MEIR code on any keyboard (with progress dots), and YELLOW's My Team with linear unlocks.
import { expect, test, type Page } from '@playwright/test';

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
/** Seeds storage once per test (later reloads keep what the game saved). */
const seedOnce = (page: Page, items: Record<string, unknown>) =>
  page.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, items);
const shelf = async (page: Page) => {
  await page.addInitScript(() => localStorage.removeItem('kc:v1:cartridge'));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
};
const unlocked = async (page: Page) => {
  await expect(page.getByTestId('toast')).toHaveText('MEIR joined the adventure!');
  expect(await page.evaluate(() => localStorage.getItem('kc:v1:p1:trainer'))).toBe('"meir"');
};

test.describe('MEIR code @both', () => {
  test('keyboard on the shelf, with focus on a language button; the dots fill, a slip shakes and clears', async ({ page }) => {
    await shelf(page);
    await page.getByTestId('lang-en').last().focus();
    const dots = page.getByTestId('code-dots');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    await expect(dots).toHaveAttribute('data-progress', '0');
    await expect(dots).toHaveClass(/shake/);
    // A third ↑ is not a slip: ↑ ↑ still matches the start.
    await page.keyboard.press('ArrowUp');
    for (const [i, k] of CODE.entries()) {
      await page.keyboard.press(k);
      if (i === 4) await expect(dots).toHaveAttribute('data-progress', '5');
    }
    await unlocked(page);
  });

  test('keyboard on the YELLOW home; held keys do not count', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kc:v1:cartridge', JSON.stringify('yellow')));
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await expect(page.getByTestId('screen-yellow')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', repeat: true })));
    await expect(page.getByTestId('code-dots')).not.toHaveAttribute('data-progress', '1');
    for (const k of CODE) await page.keyboard.press(k);
    await unlocked(page);
  });

  test('Hebrew and Russian layouts: B and A by physical key, or by the letter alone', async ({ page }) => {
    await shelf(page);
    await page.evaluate(() => {
      const send = (key: string, code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
      for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight']) send(k, k);
      send('נ', 'KeyB');
      send('ש', 'KeyA');
    });
    await unlocked(page);
    await page.evaluate(() => localStorage.removeItem('kc:v1:p1:trainer'));
    await page.evaluate(() => {
      const send = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'и', 'ф']) send(k);
    });
    expect(await page.evaluate(() => localStorage.getItem('kc:v1:p1:trainer'))).toBe('"meir"');
  });

  test('the touch D-pad fills the same dots', async ({ page }) => {
    await shelf(page);
    const label = page.locator('[data-testid="cart-yellow"] .cart-label');
    for (let i = 0; i < 3; i++) await label.click();
    for (const k of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b']) await page.getByTestId(`pad-${k}`).click();
    await expect(page.getByTestId('code-dots')).toHaveAttribute('data-progress', '9');
    await page.getByTestId('pad-a').click();
    await unlocked(page);
  });

  test('typing MEIR at the name step', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('kanto').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('story').click();
    await expect(page.getByTestId('name-1')).toBeVisible();
    await page.keyboard.type('meir');
    await expect(page.getByTestId('screen-oak')).toBeVisible();
    expect(await page.evaluate(() => [localStorage.getItem('kc:v1:p1:trainer'), JSON.parse(localStorage.getItem('kc:v1:p1:campaign')!).name])).toEqual(['"meir"', 'MEIR']);
  });
});

async function finishLesson(page: Page, n: number): Promise<string> {
  await page.getByTestId(`lesson-${n}`).click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('path-hint').click();
    const marked = await page.locator('.sq.hint').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.square!, (e as HTMLElement).dataset.piece ?? ''] as const));
    const from = marked.find(([, p]) => p.startsWith('w'))![0];
    const to = marked.find(([sq]) => sq !== from)![0];
    await page.click(`[data-square="${from}"]`);
    await page.click(`[data-square="${to}"]`);
    await page.getByTestId('path-next').click();
  }
  await expect(page.getByTestId('sticker')).toBeVisible();
  const got = (await page.getByTestId('sticker').locator('img').getAttribute('data-species'))!;
  await page.getByTestId('sticker-ok').click();
  return got;
}

test.describe('YELLOW My Team', () => {
  test('a fresh YELLOW player unlocks stickers 1 to 3 in order by finishing lessons; the next one is shown', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.setItem('kc:v1:cartridge', JSON.stringify('yellow')));
    await page.addInitScript(() => localStorage.setItem('kc:v1:settings', JSON.stringify({ v: 2, anim: 'off' })));
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('yellow-team').click();
    await expect(page.getByTestId('yellow-next')).toHaveText('Finish the next lesson to get BULBASAUR!');
    await page.getByTestId('back').click();
    await page.getByTestId('yellow-learn').click();
    const got = [];
    for (const n of [1, 2, 3]) got.push(await finishLesson(page, n));
    expect(got).toEqual(['bulbasaur', 'squirtle', 'charmander']);
    await page.getByTestId('path-back').or(page.getByTestId('back')).first().click();
    await page.getByTestId('yellow-team').click();
    await expect(page.getByTestId('yellow-next')).toHaveText('Finish the next lesson to get ONIX!');
  });

  test('only eligible stickers per slot; the team plays vs Computer; Classic team restores', async ({ page }) => {
    await seedOnce(page, { 'kc:v1:cartridge': 'yellow', 'kc:v1:settings': { v: 2, anim: 'off' }, 'kc:v1:campaign': { v: 2, caught: { bulbasaur: 1, onix: 1, mewtwo: 1 }, path: 3, yellowGiven: 3 } });
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('yellow-team').click();
    const offered = async () => page.locator('[data-testid^="ysticker-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.slice(9)).sort());
    expect(await offered()).toEqual(['bulbasaur', 'onix']);
    await page.getByTestId('ysticker-bulbasaur').click();
    await page.getByTestId('yslot-q').click();
    expect(await offered()).toEqual(['mewtwo', 'onix']);
    await page.getByTestId('ysticker-mewtwo').click();
    await page.getByTestId('yslot-b').click();
    await page.getByTestId('ysticker-onix').click();
    await expect(page.getByTestId('yslot-q')).toHaveAttribute('data-species', 'mewtwo');
    await page.getByTestId('back').click();
    await page.getByTestId('yellow-play').click();
    await page.getByTestId('yellow-level-1').click();
    const at = (sq: string) => page.locator(`[data-square="${sq}"]`);
    await expect(at('d1')).toHaveAttribute('aria-label', /MEWTWO/);
    await expect(at('a2')).toHaveAttribute('aria-label', /BULBASAUR/);
    await expect(at('c1')).toHaveAttribute('aria-label', /ONIX/);
    await expect(at('f1')).toHaveAttribute('aria-label', /ONIX/);
    await expect(at('e1')).toHaveAttribute('aria-label', /PIKACHU/);
    await page.getByTestId('menu').click();
    await page.getByTestId('yellow-team').click();
    await page.getByTestId('yellow-classic').click();
    await expect(page.getByTestId('yslot-q')).toHaveAttribute('data-species', 'charizard');
  });

  test('after the 12 lessons, the 13th sticker arrives with a win vs Computer', async ({ page }) => {
    await seedOnce(page, { 'kc:v1:cartridge': 'yellow', 'kc:v1:settings': { v: 2, anim: 'off' }, 'kc:v1:campaign': { v: 2, caught: {}, path: 12, yellowGiven: 12 } });
    await page.goto('./?debug=1');
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('yellow-team').click();
    await expect(page.getByTestId('yellow-next')).toHaveText('Win a game to get ABRA!');
    await page.getByTestId('back').click();
    await page.getByTestId('yellow-play').click();
    await page.getByTestId('yellow-level-1').click();
    await page.evaluate(() => {
      const kc = (window as unknown as { __kc: { loadFen(f: string): string; move(u: string): string } }).__kc;
      kc.loadFen('k7/8/1K6/8/8/8/8/7Q w - - 0 1');
      kc.move('h1h8');
    });
    await expect(page.getByTestId('toast')).toHaveText('You got ABRA!');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:p1:campaign')!).caught.abra)).toBe(1);
  });
});
