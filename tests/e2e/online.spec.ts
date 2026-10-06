// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test, type Browser, type Page } from '@playwright/test';

// Local runs talk to `wrangler dev` (5 s reconnect window); LIVE_URL runs use the deployed relay.
const LIVE = !!process.env.LIVE_URL;
const RELAY = LIVE ? '' : '&relay=http://localhost:8788';
const AWAY_MS = LIVE ? 60_000 : 5_000;
type KC = { dumpState(): string; netSend(m: unknown): void; lastReject(): string | null };
const kc = (p: Page) => p.evaluate(() => JSON.parse((window as unknown as { __kc: KC }).__kc.dumpState()) as { fen: string });

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  return ctx.newPage();
}

async function createRoom(browser: Browser): Promise<{ a: Page; code: string }> {
  const a = await newPage(browser);
  await a.goto(`./?debug=1${RELAY}`);
  await a.getByTestId('screen-splash').click();
  await a.getByTestId('play-online').click();
  await a.getByTestId('create-room').click();
  const code = (await a.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  return { a, code };
}

async function joinRoom(page: Page, code: string): Promise<void> {
  await page.goto(`./?debug=1${RELAY}&room=${code}`);
}

async function pair(browser: Browser) {
  const { a, code } = await createRoom(browser);
  const b = await newPage(browser);
  await joinRoom(b, code);
  for (const p of [a, b]) await expect(p.locator('#board')).toBeVisible({ timeout: 10_000 });
  return { a, b, code };
}

async function play(mover: Page, other: Page, uci: string) {
  await mover.click(`[data-square="${uci.slice(0, 2)}"]`);
  await mover.click(`[data-square="${uci.slice(2, 4)}"]`);
  for (const p of [mover, other]) await expect(p.locator(`[data-square="${uci.slice(2, 4)}"]`)).toHaveAttribute('data-piece', /./, { timeout: 8000 });
  await expect(other.locator(`[data-square="${uci.slice(0, 2)}"]`)).not.toHaveAttribute('data-piece', /./);
}

test.describe.configure({ mode: 'serial' });

test("@live online: Scholar's Mate between two browsers ends the same on both", async ({ browser }) => {
  test.setTimeout(90_000);
  const { a, b } = await pair(browser);
  const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
  for (const [i, uci] of moves.entries()) await play(i % 2 ? b : a, i % 2 ? a : b, uci);
  for (const p of [a, b]) await expect(p.getByTestId('end-text')).toHaveText("Looks like Team Rocket's blasting off again!", { timeout: 8000 });
  expect((await kc(a)).fen).toBe((await kc(b)).fen);
});

test('online: an illegal or out of turn move is rejected and nothing changes', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const before = (await kc(a)).fen;
  await a.evaluate(() => (window as unknown as { __kc: KC }).__kc.netSend({ type: 'move', uci: 'e2e5' }));
  await expect.poll(() => a.evaluate(() => (window as unknown as { __kc: KC }).__kc.lastReject())).toBe('illegal move');
  await b.evaluate(() => (window as unknown as { __kc: KC }).__kc.netSend({ type: 'move', uci: 'e7e5' }));
  await expect.poll(() => b.evaluate(() => (window as unknown as { __kc: KC }).__kc.lastReject())).toBe('not your turn');
  expect((await kc(a)).fen).toBe(before);
  expect((await kc(b)).fen).toBe(before);
});

test('online: a closed tab reopened in time resumes; gone too long loses', async ({ browser }) => {
  test.setTimeout(60_000);
  const { a, b, code } = await pair(browser);
  await play(a, b, 'e2e4');
  const ctx = b.context();
  await b.close();
  await expect(a.getByTestId('text-main')).toHaveText('Your friend lost connection. Waiting up to 60 seconds...', { timeout: 5000 });
  const b2 = await ctx.newPage();
  await joinRoom(b2, code);
  await expect(b2.locator('[data-square="e4"]')).toHaveAttribute('data-piece', 'wp', { timeout: 8000 });
  await play(b2, a, 'e7e5');
  await b2.close();
  await expect(a.getByTestId('end-text')).toHaveText("Your friend didn't come back. You win!", { timeout: AWAY_MS + 8000 });
});

test('online: unknown and full rooms show a friendly message', async ({ browser }) => {
  const lost = await newPage(browser);
  await joinRoom(lost, 'ZZZZ');
  await expect(lost.getByTestId('online-message')).toHaveText('No room with that code. Check the letters and try again.');
  const { code } = await pair(browser);
  const third = await newPage(browser);
  await joinRoom(third, code);
  await expect(third.getByTestId('online-message')).toHaveText('That room already has two trainers.');
});

test("online: your friend sees your My Team skins", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  await ctx.addInitScript(() => localStorage.setItem('kc:v1:campaign', JSON.stringify({ starter: 'squirtle', caught: { squirtle: 1 }, routes: {}, team: { k: 'squirtle' } })));
  const a = await ctx.newPage();
  await a.goto(`./?debug=1${RELAY}`);
  await a.getByTestId('screen-splash').click();
  await a.getByTestId('play-online').click();
  await a.getByTestId('create-room').click();
  const code = (await a.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
  const b = await newPage(browser);
  await joinRoom(b, code);
  await expect(b.locator('[data-square="e1"] img')).toHaveAttribute('alt', 'SQUIRTLE', { timeout: 10_000 });
  await expect(a.locator('[data-square="e1"] img')).toHaveAttribute('alt', 'SQUIRTLE');
  await expect(b.locator('[data-square="e8"] img')).toHaveAttribute('alt', 'RATICATE'); // Rocket at stage 0 = the Grunt's team (change B)
});

test('online: a win evolves trade Pokémon on your team (§B12)', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  await ctx.addInitScript(() =>
    localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, starter: 'squirtle', introSeen: true, teamRules: 2, caught: { squirtle: 1, kadabra: 1 }, team: { n: 'kadabra' } })),
  );
  const a = await ctx.newPage();
  await a.goto(`./?debug=1${RELAY}`);
  await a.getByTestId('screen-splash').click();
  await a.getByTestId('play-online').click();
  await a.getByTestId('create-room').click();
  const code = (await a.getByTestId('room-code').textContent({ timeout: 10_000 }))!.trim();
  const b = await newPage(browser);
  await joinRoom(b, code);
  for (const p of [a, b]) await expect(p.locator('#board')).toBeVisible({ timeout: 10_000 });
  const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
  for (const [i, uci] of moves.entries()) await play(i % 2 ? b : a, i % 2 ? a : b, uci);
  await expect(a.getByTestId('end-text')).toHaveText("Looks like Team Rocket's blasting off again!", { timeout: 8000 });
  await expect(a.getByTestId('toast').first()).toHaveText('Your KADABRA evolved into ALAKAZAM after the online win!');
  const caught = await a.evaluate(() => (window as unknown as { __kc: { journey(): { caught: Record<string, number> } } }).__kc.journey().caught);
  expect(caught).toMatchObject({ kadabra: 1, alakazam: 1 });
});
