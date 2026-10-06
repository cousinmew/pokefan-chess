// SPDX-License-Identifier: AGPL-3.0-only
// §B19 gate at 360x640: chips at least 18 px with 4.5:1 contrast; all three piece styles render and persist; the
// legend toggles and highlights; press and hold opens the card without making a move.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 360, height: 640 } });

type KC = { dumpState(): string };
const fen = async (p: Page) => (JSON.parse(await p.evaluate(() => (window as unknown as { __kc: KC }).__kc.dumpState())) as { fen: string }).fen;

function lum(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

async function settings(page: Page, values: Record<string, string>) {
  await page.getByTestId('settings').click();
  for (const [k, v] of Object.entries(values)) await page.getByTestId(`set-${k}`).selectOption(v);
  await page.getByTestId('back').click();
}

test('chips are at least 18 px with 4.5:1 contrast, and the board fills the width', async ({ page }) => {
  await page.goto('./?debug=1&start=two');
  const chips = await page.locator('#board .chip').evaluateAll((els) =>
    els.map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height, fg: cs.color, bg: cs.backgroundColor };
    }),
  );
  expect(chips).toHaveLength(32);
  for (const c of chips) {
    expect(Math.min(c.w, c.h)).toBeGreaterThanOrEqual(18);
    expect(contrast(c.fg, c.bg)).toBeGreaterThanOrEqual(4.5);
  }
  const board = (await page.locator('#board').boundingBox())!;
  expect(board.width).toBeGreaterThanOrEqual(360 - 8 - 2);
});

test('all three piece styles render and persist', async ({ page }) => {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  for (const [style, check] of [['badge', '.chip.big'], ['classic', '.classic'], ['pokemon', 'img.piece.trimmed']] as const) {
    await settings(page, { pieceStyle: style });
    await page.getByTestId('two-players').click();
    await page.getByTestId('intro').click();
    await expect(page.locator(`#board ${check}`)).toHaveCount(32);
    if (style === 'classic') await expect(page.locator('#board img.piece')).toHaveCount(0);
    await page.reload();
    await page.getByTestId('screen-splash').click();
    await page.getByTestId('settings').click();
    await expect(page.getByTestId('set-pieceStyle')).toHaveValue(style);
    await page.getByTestId('back').click();
  }
});

test('the Who\'s who legend toggles and highlights', async ({ page }) => {
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await settings(page, { legend: 'on' });
  await page.getByTestId('two-players').click();
  await page.getByTestId('intro').click();
  await expect(page.getByTestId('legend')).toBeVisible();
  await page.getByTestId('legend-wn').click();
  await expect(page.locator('#board .sq.legend-hl')).toHaveCount(2);
  await expect(page.locator('[data-square="b1"]')).toHaveClass(/legend-hl/);
  await page.getByTestId('legend-wn').click();
  await expect(page.locator('#board .sq.legend-hl')).toHaveCount(0);
  await page.getByTestId('menu').click();
  await settings(page, { legend: 'off' });
  await page.getByTestId('two-players').click();
  await page.getByTestId('intro').click();
  await expect(page.getByTestId('legend')).toBeHidden();
});

test('press and hold opens the card without making a move', async ({ page }) => {
  await page.goto('./?debug=1&start=two');
  const before = await fen(page);
  // Select the e2 pawn, then hold on the black pawn at e7 (not a target) and on d1 (own piece).
  const hold = async (sq: string) => {
    const b = (await page.locator(`[data-square="${sq}"]`).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
  };
  await hold('e2');
  await expect(page.getByTestId('piece-card')).toBeVisible();
  await expect(page.getByTestId('piece-card')).toContainText('EEVEE');
  await page.getByTestId('piece-card').click();
  await expect(page.getByTestId('piece-card')).toBeHidden();
  await hold('e7');
  await expect(page.getByTestId('piece-card')).toContainText('RATTATA');
  await page.mouse.click(10, 10);
  expect(await fen(page)).toBe(before);
  // A normal tap still plays.
  await page.click('[data-square="e2"]');
  await page.click('[data-square="e4"]');
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp');
});
