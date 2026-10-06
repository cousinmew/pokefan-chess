// SPDX-License-Identifier: AGPL-3.0-only
// §B21 item 3: player feedback from OPTION, the ?review=<lang> translation mode, the relay's rate limit and export.
import { expect, test } from '@playwright/test';

const RELAY = 'http://localhost:8788';
const relay = `&relay=${RELAY}`;
type Note = { kind: string; lang?: string; key?: string; suggestion?: string; text?: string; screen?: string; version?: string };
const exported = async (): Promise<Note[]> => (await (await fetch(`${RELAY}/feedback/export`, { headers: { Authorization: 'Bearer local-test-token' } })).json()) as Note[];

test('OPTION has FEEDBACK: a preset button plus a short note, with version, screen and language attached', async ({ page }) => {
  const mark = `note ${Date.now()}`;
  await page.goto(`./?debug=1${relay}`);
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('settings').click();
  await page.getByTestId('feedback').click();
  await expect(page.getByTestId('feedback-text')).toHaveAttribute('placeholder', /Don't write your name/);
  await page.getByTestId('feedback-text').fill(`${mark} ${'x'.repeat(300)}`);
  await page.getByTestId('feedback-fun').click();
  await expect(page.getByTestId('toast')).toHaveText('Thanks! We read every note.');
  const mine = (await exported()).find((n) => n.text?.startsWith(mark))!;
  expect(mine).toMatchObject({ kind: 'fun', lang: 'en', screen: 'screen-settings' });
  expect(mine.text!.length).toBeLessThanOrEqual(200);
  expect(mine.version).toMatch(/^\d+\.\d+\.\d+$/);
});

test('?review=he: the game in Hebrew with a mark on each string; a suggestion goes to the relay; nothing is saved', async ({ page }) => {
  const better = `הצעה ${Date.now()}`;
  await page.goto(`./?debug=1&review=he${relay}`);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('he');
  await page.getByTestId('screen-splash').click();
  await expect(page.locator('.i18n-mark').first()).toBeVisible();
  expect(await page.locator('.i18n-mark').count()).toBeGreaterThan(10);
  await page.getByTestId('how-to').locator('.i18n-mark').first().click();
  await expect(page.getByTestId('i18n-panel')).toContainText('hub.manual');
  await expect(page.getByTestId('i18n-panel')).toContainText('How to Play');
  await page.getByTestId('i18n-suggestion').fill(better);
  await page.getByTestId('i18n-send').click();
  await expect(page.getByTestId('i18n-panel')).toHaveCount(0);
  expect((await exported()).find((n) => n.suggestion === better)).toMatchObject({ kind: 'translation', lang: 'he', key: 'hub.manual' });
  expect(await page.evaluate(() => localStorage.getItem('kc:v1:p1:lang'))).not.toBe('"he"');
  // Normal players see no marks.
  await page.goto('./?debug=1');
  await page.getByTestId('screen-splash').click();
  await expect(page.locator('.i18n-mark')).toHaveCount(0);
});

test('the relay limits each client to 20 notes an hour and rejects oversize or unknown notes', async () => {
  const client = `rate-${Date.now()}`;
  const post = (body: unknown) => fetch(`${RELAY}/feedback`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4173', 'X-Test-Client': client } });
  expect((await post({ kind: 'nope' })).status).toBe(400);
  expect((await post({ kind: 'bug', text: 'x'.repeat(5000) })).status).toBe(413);
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await post({ kind: 'bug', text: `rate ${i}` })).status);
  expect(codes.slice(0, 19).every((c) => c === 201)).toBe(true);
  expect(codes.at(-1)).toBe(429);
  expect((await fetch(`${RELAY}/feedback/export`)).status).toBe(403);
});
