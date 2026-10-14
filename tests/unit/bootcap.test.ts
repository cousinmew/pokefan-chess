// SPDX-License-Identifier: AGPL-3.0-only
// Boot fix, 14 Oct: before boot, src/i18n.ts waits for the saved languages' tables (N1), but at most BOOT_LANG_MS. A
// table whose request stalled (a dropped mobile connection) kept the splash away for good. Past the cap the page boots
// reading English in full (review R2: words, direction and language button; the save keeps its language), and switches
// when the table lands and the screen can take it, unless the player picked a language meanwhile.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOT_LANG_MS } from '../../src/config';

/** A strings table's request (any language but English): it answers, or fails, only when the test says so. The text
 * module is mocked once for the file, so each test boots a language no earlier test loaded. */
let gate: { open(): void; fail(): void } = { open: () => undefined, fail: () => undefined };
vi.mock('../../src/game/text', async (real) => {
  const t = await real<typeof import('../../src/game/text')>();
  return {
    ...t,
    loadStrings: async (l: Parameters<typeof t.loadStrings>[0]) => {
      if (l !== 'en') await new Promise<void>((open, fail) => (gate = { open, fail: () => fail(new Error('network')) }));
      return t.loadStrings(l);
    },
  };
});

const store = new Map<string, string>();
const storage = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const g = globalThis as unknown as Record<string, unknown>;
g.window = { localStorage: storage, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (n: number) => clearTimeout(n) };
g.document = { documentElement: { lang: '', dir: '' } };
const html = () => (document as unknown as { documentElement: { lang: string; dir: string } }).documentElement;
g.location = { search: '' };

/** A fresh page load of a save in `lang`: the modules as boot imports them, and how long the import (the wait) took. */
async function bootIn(lang: string) {
  vi.resetModules();
  store.clear();
  store.set('kc:v1:p1:lang', JSON.stringify(lang));
  const t0 = performance.now();
  const i18n = await import('../../src/i18n');
  const waited = performance.now() - t0;
  const text = await import('../../src/game/text');
  const { SPECIES } = await import('../../src/board/pieces');
  return { ...i18n, ...text, SPECIES, waited };
}

afterEach(() => gate.fail());

describe('boot waits for a saved language at most BOOT_LANG_MS', () => {
  it('a stalled table: boot goes on after the cap reading English, and switches once it lands and the screen takes it', async () => {
    const b = await bootIn('fr'); // base: this import never resolved (the test timed out)
    expect(b.waited).toBeGreaterThanOrEqual(BOOT_LANG_MS - 50);
    expect(b.waited).toBeLessThan(BOOT_LANG_MS + 2000);
    const landed = vi.fn<(apply: () => boolean) => void>();
    b.startLanguage('fr', landed);
    // English in full while it is missing (R2: was lang "fr" with English words); the save keeps French.
    expect([b.currentLang(), html().lang, html().dir]).toEqual(['en', 'en', 'ltr']);
    expect(store.get('kc:v1:p1:lang')).toBe('"fr"');
    expect(b.fmt('splash.tap')).toBe('Tap to start');
    expect(landed).not.toHaveBeenCalled();
    gate.open();
    await vi.waitFor(() => expect(landed).toHaveBeenCalledTimes(1));
    expect(b.currentLang()).toBe('en'); // the screen showing decides when (src/main.ts lateLanguage)
    const apply = landed.mock.calls[0]![0];
    expect(apply()).toBe(true);
    expect([b.currentLang(), html().lang, html().dir]).toEqual(['fr', 'fr', 'ltr']);
    expect(b.fmt('splash.tap')).toBe('Touche pour commencer');
    expect(b.SPECIES.bulbasaur!.name).toBe('BULBIZARRE');
    expect(apply()).toBe(false); // once
  }, 10_000);

  it('Hebrew: left to right in English while its table is missing, right to left once it applies', async () => {
    const b = await bootIn('he');
    const landed = vi.fn<(apply: () => boolean) => void>();
    b.startLanguage('he', landed);
    expect([html().lang, html().dir]).toEqual(['en', 'ltr']); // R2: "he", "rtl" around English words
    gate.open();
    await vi.waitFor(() => expect(landed).toHaveBeenCalledTimes(1));
    expect(landed.mock.calls[0]![0]()).toBe(true);
    expect([b.currentLang(), html().lang, html().dir]).toEqual(['he', 'he', 'rtl']);
  }, 10_000);

  it('a language picked meanwhile stays: before the table lands, or after it while the screen waited', async () => {
    const b = await bootIn('de');
    const landed = vi.fn<(apply: () => boolean) => void>();
    b.startLanguage('de', landed);
    b.applyLanguage('en'); // the player's pick (English is always there)
    gate.open();
    await new Promise((r) => setTimeout(r, 50));
    expect(landed).not.toHaveBeenCalled();
    expect(b.currentLang()).toBe('en');
    expect(b.fmt('splash.tap')).toBe('Tap to start');
    expect(store.get('kc:v1:p1:lang')).toBe('"en"');
    const c = await bootIn('it');
    const late = vi.fn<(apply: () => boolean) => void>();
    c.startLanguage('it', late);
    gate.open();
    await vi.waitFor(() => expect(late).toHaveBeenCalledTimes(1));
    c.applyLanguage('en'); // picked in OPTION while the map kept its words
    expect(late.mock.calls[0]![0]()).toBe(false); // so the way home leaves it
    expect(c.currentLang()).toBe('en');
  }, 10_000);

  it('a table that fails, after the cap or before it: English in full, nothing redrawn, the save keeps its language', async () => {
    const b = await bootIn('es');
    const landed = vi.fn();
    b.startLanguage('es', landed);
    gate.fail();
    await new Promise((r) => setTimeout(r, 50));
    expect(landed).not.toHaveBeenCalled();
    expect(b.fmt('splash.tap')).toBe('Tap to start');
    expect([b.currentLang(), html().lang]).toEqual(['en', 'en']);
    expect(store.get('kc:v1:p1:lang')).toBe('"es"');
    const boot = bootIn('ru');
    await new Promise((r) => setTimeout(r, 50));
    gate.fail(); // before BOOT_LANG_MS: offline and not cached
    const c = await boot;
    expect(c.waited).toBeLessThan(BOOT_LANG_MS);
    c.startLanguage('ru', landed);
    expect([c.currentLang(), html().lang, html().dir]).toEqual(['en', 'en', 'ltr']); // base: "ru" in English words
    await new Promise((r) => setTimeout(r, 50));
    expect(landed).not.toHaveBeenCalled();
  }, 10_000);
});
