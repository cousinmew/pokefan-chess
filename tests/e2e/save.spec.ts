// SPDX-License-Identifier: AGPL-3.0-only
// Keeping progress safe (§B18 item 2), the language button (item 3) and YELLOW's level picker (item 4).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const RELAY = '&relay=http://localhost:8788';
const enter = async (page: Page, q = '') => {
  await page.goto(`./?debug=1${q}`);
  await page.getByTestId('screen-splash').click();
};
const settings = async (page: Page) => {
  await page.getByTestId('settings').first().click();
  await expect(page.getByTestId('save-box')).toBeVisible();
};

test('an old save moves into slot 1; a second player gets the picker, own cartridge and own language', async ({ page }) => {
  // The old save has a name: a cartridge alone is no progress, and NEW GAME would reuse that slot (playtest 12 Oct).
  await page.addInitScript(() => localStorage.getItem('kc:v1:p1:campaign') ?? localStorage.setItem('kc:v1:campaign', JSON.stringify({ name: 'ASH' })));
  await enter(page);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toContain('kc:v1:p1:cartridge');
  expect(keys).toContain('kc:v1:p1:campaign');
  expect(keys).toContain('kc:v1:profiles');
  // Moved, not copied: the old save itself is in slot 1 and its old keys are gone.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:p1:campaign')!).name)).toBe('ASH');
  expect(keys).not.toContain('kc:v1:campaign');
  expect(keys).not.toContain('kc:v1:cartridge');
  await settings(page);
  await page.getByTestId('players').click();
  await expect(page.getByTestId('slot-1')).toBeVisible();
  await page.getByTestId('slot-new').click();
  // The new player opens on the shelf, picks YELLOW and French.
  await page.getByTestId('screen-splash').click();
  await page.getByTestId('lang-fr').click();
  await page.getByTestId('cart-yellow').click();
  await expect(page.getByTestId('screen-yellow')).toBeVisible();
  // A new visit asks who's playing; the YELLOW save is kept with no lesson done yet (its cartridge is its progress).
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  await expect(page.getByTestId('slot-2')).toContainText('FR');
  await page.getByTestId('slot-pick-1').click();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  // Rename slot 2, then delete it: a 2 second hold, then a confirm.
  await settings(page);
  await page.getByTestId('players').click();
  await page.getByTestId('slot-rename-2').click();
  await page.getByTestId('rename-3').click();
  await expect(page.getByTestId('slot-2')).toContainText('JADE');
  const del = page.getByTestId('slot-delete-2');
  await del.dispatchEvent('pointerdown');
  await page.waitForTimeout(2200);
  await page.getByTestId('slot-delete-yes-2').click();
  await expect(page.getByTestId('slot-2')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('kc:v1:p2:')))).toBe(false);
});

test('export a save, lose it, import it back', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'SKY', starter: 'bulbasaur', caught: { bulbasaur: 1 }, team: { k: 'bulbasaur' } }));
    sessionStorage.setItem('seeded', '1');
  });
  await enter(page);
  await settings(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-save').click()]);
  const path = await dl.path();
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.app).toBe('pokefan-chess');
  expect(file.data.campaign.name).toBe('SKY');
  await page.evaluate(() => localStorage.removeItem('kc:v1:p1:campaign'));
  await page.getByTestId('import-file').setInputFiles(path);
  await page.getByTestId('screen-splash').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:p1:campaign') ?? '{}').name)).toBe('SKY');
});

test('a save code restores progress on another device', async ({ browser }) => {
  const a = await browser.newPage();
  await a.addInitScript(() => localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'PIP', badges: ['boulder'] })));
  await enter(a, RELAY);
  await settings(a);
  await a.getByTestId('save-code-make').click();
  await expect(a.getByTestId('save-code')).toContainText(/[A-Z2-9]{4}-[A-Z2-9]{4}/);
  const code = /([A-Z2-9]{4}-[A-Z2-9]{4})/.exec((await a.getByTestId('save-code').textContent()) ?? '')![1]!;
  const b = await browser.newPage();
  await enter(b, RELAY);
  await settings(b);
  await b.getByTestId('save-code-input').fill('nope1234');
  await b.getByTestId('save-code-restore').click();
  await expect(b.getByTestId('toast')).toBeVisible();
  await b.getByTestId('save-code-input').fill(code.toLowerCase());
  await b.getByTestId('save-code-restore').click();
  await b.getByTestId('screen-splash').click();
  expect(await b.evaluate(() => JSON.parse(localStorage.getItem('kc:v1:p1:campaign') ?? '{}').name)).toBe('PIP');
});

// Trust fix (14 Oct): the player's own way to remove the server copy, after one question; the device keeps its save.
test('Delete my save code deletes the server copy at once and keeps the save on this device', async ({ page }) => {
  await page.addInitScript(() => localStorage.getItem('kc:v1:p1:campaign') ?? localStorage.setItem('kc:v1:campaign', JSON.stringify({ v: 2, name: 'LEAF', badges: ['boulder'] })));
  await enter(page, RELAY);
  await settings(page);
  await expect(page.getByTestId('save-code-delete')).toBeHidden(); // no code yet, nothing to delete
  await page.getByTestId('save-code-make').click();
  await expect(page.getByTestId('save-code')).toContainText(/[A-Z2-9]{4}-[A-Z2-9]{4}/);
  const code = /([A-Z2-9]{4})-([A-Z2-9]{4})/.exec((await page.getByTestId('save-code').textContent()) ?? '')!.slice(1).join('');
  const onRelay = async () => (await page.request.get(`http://localhost:8788/save/${code}`, { headers: { Origin: 'http://localhost:4173' } })).status();
  expect(await onRelay()).toBe(200);
  // One question first; Keep leaves everything as it was.
  await expect(page.getByTestId('save-code-delete')).toHaveText('Delete my save code');
  await page.getByTestId('save-code-delete').click();
  await expect(page.locator('.save-confirm')).toHaveText('Delete the copy on the server now? The code stops working; your save stays on this device.');
  await page.getByTestId('save-code-delete-no').click();
  await expect(page.getByTestId('save-code-delete')).toBeVisible();
  expect(await onRelay()).toBe(200);
  await page.getByTestId('save-code-delete').click();
  await page.getByTestId('save-code-delete-yes').click();
  await expect(page.getByTestId('toast')).toHaveText('Save code deleted. Your save is still on this device.');
  await expect(page.getByTestId('save-code')).toBeHidden();
  await expect(page.getByTestId('save-code-delete')).toBeHidden();
  await expect(page.getByTestId('save-code-make')).toHaveText('Make a save code');
  expect(await onRelay()).toBe(404);
  expect(await page.evaluate(() => [localStorage.getItem('kc:v1:p1:saveCode'), JSON.parse(localStorage.getItem('kc:v1:p1:campaign') ?? '{}').name])).toEqual([null, 'LEAF']);
  // A second delete of the same code (already gone) is not an error for the relay either.
  expect((await page.request.delete(`http://localhost:8788/save/${code}`, { headers: { Origin: 'http://localhost:4173' } })).status()).toBe(404);
});

test('Save protected shows yes or no in Settings @both', async ({ page }, info) => {
  await enter(page);
  await settings(page);
  await expect(page.getByTestId('save-protected')).toHaveText(/Save protected: (yes|no)/);
  await page.waitForTimeout(300);
  const text = (await page.getByTestId('save-protected').textContent()) ?? '';
  info.annotations.push({ type: 'save-protected', description: `${info.project.name}: ${text}` });
  console.log(`[${info.project.name}] ${text}`);
});

test('language button: the current code, one tap to switch, saved per player', async ({ page }) => {
  await enter(page);
  const btn = page.getByTestId('lang-button');
  await expect(btn).toHaveText('EN');
  await btn.click();
  await page.getByTestId('lang-he').click();
  await expect(page.getByTestId('lang-button')).toHaveText('HE');
  expect(await page.evaluate(() => [document.documentElement.dir, localStorage.getItem('kc:v1:p1:lang')])).toEqual(['rtl', '"he"']);
});

test('YELLOW Play opens four levels with stars, Youngster first', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kc:v1:cartridge', JSON.stringify('yellow')));
  await enter(page);
  await expect(page.getByTestId('lang-button')).toBeVisible();
  await page.getByTestId('yellow-play').click();
  for (const n of [1, 2, 3, 4]) await expect(page.getByTestId(`yellow-level-${n}`)).toContainText('★'.repeat(n));
  await expect(page.getByTestId('yellow-level-1')).toBeFocused();
  await page.getByTestId('yellow-level-2').click();
  await expect(page.locator('.board')).toBeVisible();
  expect(JSON.parse(await page.evaluate(() => (window as unknown as { __kc: { dumpState(): string } }).__kc.dumpState())).level).toBe(2);
});

test('a badge brings a gentle back up note; the home screen tip shows once', async ({ page }) => {
  await enter(page);
  await expect(page.getByTestId('home-tip')).toBeVisible();
  await page.getByTestId('home-tip-ok').click();
  await page.evaluate(() => localStorage.setItem('kc:v1:p1:backupDue', 'true'));
  await page.reload();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('backup-note')).toBeVisible();
  await page.getByTestId('backup-later').click();
  await page.reload();
  await page.getByTestId('screen-splash').click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await expect(page.getByTestId('backup-note')).toHaveCount(0);
  await expect(page.getByTestId('home-tip')).toHaveCount(0);
});

test.describe('installable web app', () => {
  test.use({ serviceWorkers: 'allow' });
  test('manifest, icons and an app shell that opens offline', async ({ page, context }) => {
    await page.goto('./');
    const manifest = await (await page.request.get('./manifest.webmanifest')).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('screen-splash')).toBeVisible();
    await context.setOffline(false);
  });
});
