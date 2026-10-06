// SPDX-License-Identifier: AGPL-3.0-only
// §B17 gates: the shelf on first launch only; a 2 s hold to switch cartridge; a full YELLOW lesson and a BLUE
// trainer battle in Hebrew with the board still left to right.
import { expect, test, type Page } from '@playwright/test';

type KC = { puzzleAnswer(): string | null; puzzlePhase(): string };
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzlePhase());

async function boardIsLtr(page: Page) {
  await expect(page.locator('#board [data-square="a1"]')).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#board')!).direction)).toBe('ltr');
  // Left to right whichever side you play: each row's first square in the DOM is drawn leftmost (RTL would mirror it).
  const xs = await page.locator('#board .sq').evaluateAll((els) => els.slice(0, 8).map((e) => e.getBoundingClientRect().x));
  expect(xs).toEqual([...xs].sort((p, q) => p - q));
}

test.use({ viewport: { width: 360, height: 640 } });

test.describe('first launch', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('the cartridge shelf appears on first launch only', async ({ page }) => {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-shelf')).toBeVisible();
  await page.getByTestId('lang-fr').click();
  await expect(page.getByTestId('cart-blue')).toContainText('BLEU');
  await page.getByTestId('cart-blue').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await page.reload();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await expect(page.getByTestId('screen-shelf')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  });
});

test('switching cartridge needs a 2 second hold', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:cartridge', JSON.stringify('blue')));
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('settings').click();
  const hold = page.getByTestId('switch-cartridge');
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // A tap, and a press shorter than 2 s, do nothing.
  await hold.click();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  // A full 2 s press and hold switches to YELLOW.
  await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
  await expect(page.getByTestId('screen-yellow')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kc:v1:p1:cartridge'))).toBe('"yellow"');
});

test('YELLOW in Hebrew: a full lesson of Pikachu\'s Path, board left to right, a sticker at the end', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kc:v1:cartridge', JSON.stringify('yellow'));
    localStorage.setItem('kc:v1:lang', JSON.stringify('he'));
  });
  await page.goto('./?debug=1');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('yellow-play')).toBeVisible();
  await expect(page.getByTestId('yellow-online')).toHaveCount(0);
  await page.getByTestId('yellow-learn').click();
  await page.getByTestId('lesson-1').click();
  await expect(page.locator('.sq.star')).toHaveCount(1);
  await boardIsLtr(page);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('path-hint').click();
    // The hint marks the piece and its target; the piece's square is the one with a piece on it.
    const marked = await page.locator('.sq.hint').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.square!, (e as HTMLElement).dataset.piece ?? ''] as const));
    const from = marked.find(([, p]) => p.startsWith('w'))![0];
    const to = marked.find(([sq]) => sq !== from)![0];
    await page.click(`[data-square="${from}"]`);
    await page.click(`[data-square="${to}"]`);
    await page.getByTestId('path-next').click();
  }
  await expect(page.getByTestId('sticker')).toBeVisible();
  await page.getByTestId('sticker-ok').click();
  await expect(page.getByTestId('lesson-1')).toHaveClass(/done/);
  await expect(page.getByTestId('lesson-2')).toBeEnabled();
});

test('BLUE in Hebrew: a trainer battle completes, board left to right', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('kc:v1:cartridge', JSON.stringify('blue'));
    localStorage.setItem('kc:v1:lang', JSON.stringify('he'));
    localStorage.setItem('kc:v1:settings', JSON.stringify({ anim: 'off', v: 2 }));
    localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'RED', starter: 'squirtle', introSeen: true, teamRules: 2, caught: { squirtle: 1 }, lessonsSeen: ['mateIn1'] }));
  });
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('kanto').click();
  await page.getByTestId('route-route-1').click();
  await page.getByTestId('battle-trainer').click();
  await page.getByTestId('trainer-intro').click();
  await page.getByTestId('goal-card').click();
  await boardIsLtr(page);
  for (let i = 0; i < 6 && !(await page.getByTestId('story').isVisible()); i++) {
    await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('player');
    for (let j = 0; j < 6 && (await phase(page)) === 'player'; j++) {
      const uci = (await page.evaluate(() => (window as unknown as { __kc: KC }).__kc.puzzleAnswer()))!;
      await page.click(`[data-square="${uci.slice(0, 2)}"]`);
      await page.click(`[data-square="${uci.slice(2, 4)}"]`);
      if (uci.length > 4) await page.click(`[data-testid="promotion"] button[data-role="${uci[4]}"]`);
      await expect.poll(() => phase(page), { timeout: 10_000 }).toMatch(/player|review/);
    }
    await page.getByTestId('review-continue').click();
    await expect.poll(async () => (await page.getByTestId('story').isVisible()) || (await phase(page)) === 'player', { timeout: 10_000 }).toBe(true);
  }
  await expect(page.getByTestId('story')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
});

test('phase 2: Japanese uses kana Pokémon names and the system CJK fonts; Chinese and German too', async ({ page }) => {
  for (const [l, king, font] of [['ja', 'ピカチュウ', /Hiragino Sans/], ['zh-Hans', '皮卡丘', /PingFang SC/], ['de', 'PIKACHU', /ui-monospace/]] as const) {
    await page.addInitScript((x) => localStorage.setItem('kc:v1:lang', JSON.stringify(x)), l);
    await page.goto('./?debug=1&start=two');
    // Japanese and Chinese names carry word joiners (U+2060) so they never break across lines.
    await expect.poll(async () => ((await page.locator('[data-square="e1"]').getAttribute('aria-label')) ?? '').replaceAll('\u2060', '')).toContain(king);
    expect(await page.evaluate(() => [document.documentElement.lang, getComputedStyle(document.body).fontFamily])).toEqual([l, expect.stringMatching(font)]);
  }
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('lang-button')).toHaveText('DE');
});

test('Russian (§B20 item 4): Cyrillic interface, English Pokémon names in Latin script', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:lang', JSON.stringify('ru')));
  await page.goto('./?debug=1&start=two');
  await expect(page.locator('[data-square="e1"]')).toHaveAttribute('aria-label', /PIKACHU/);
  expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(['ru', 'ltr']);
  await expect(page.getByTestId('menu')).toHaveText(/[А-Яа-яЁё]/);
});
