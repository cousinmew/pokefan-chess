// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test';

const FEN = (turn: 'w' | 'b') => `r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R ${turn} KQkq - 0 1`;
const CASES = [
  { name: 'Red kingside', turn: 'w', king: 'e1', dot: 'g1', rook: 'h1', rookTo: 'f1', text: 'PIKACHU hid behind SNORLAX!' },
  { name: 'Red queenside', turn: 'w', king: 'e1', dot: 'c1', rook: 'a1', rookTo: 'd1', text: 'PIKACHU hid behind SNORLAX!' },
  { name: 'Rocket kingside', turn: 'b', king: 'e8', dot: 'g8', rook: 'h8', rookTo: 'f8', text: 'RATICATE hid behind SANDSLASH!' },
  { name: 'Rocket queenside', turn: 'b', king: 'e8', dot: 'c8', rook: 'a8', rookTo: 'd8', text: 'RATICATE hid behind SANDSLASH!' },
] as const;

test.use({ viewport: { width: 360, height: 640 } });

for (const c of CASES) {
  for (const via of ['dot', 'rook'] as const) {
    test(`castling ${c.name} by tapping the king then the ${via}`, async ({ page }) => {
      await page.goto('./?debug=1&start=two');
      await page.evaluate((fen) => (window as unknown as { __kc: { loadFen(f: string): string } }).__kc.loadFen(fen), FEN(c.turn));
      await page.click(`[data-square="${c.king}"]`);
      await expect(page.locator(`[data-square="${c.dot}"]`)).toHaveClass(/\bdot\b/);
      await page.click(`[data-square="${via === 'dot' ? c.dot : c.rook}"]`);
      await expect(page.locator(`[data-square="${c.dot}"]`)).toHaveAttribute('data-piece', `${c.turn}k`);
      await expect(page.locator(`[data-square="${c.rookTo}"]`)).toHaveAttribute('data-piece', `${c.turn}r`);
      // The mover's line goes to the mover's plate (§B24 item 2): Red's to the text box, Rocket's to the top plate.
      await expect(page.getByTestId(c.turn === 'w' ? 'text-main' : 'plate-top-msg')).toHaveText(c.text);
    });
  }
}
