// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const load = (l: string) => JSON.parse(readFileSync(`src/data/strings.${l}.json`, 'utf8')) as Record<string, unknown>;
const en = load('en');
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const OTHERS = ['fr', 'he', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh-Hans', 'ru'];

describe('i18n phases 1 and 2 (§B17)', () => {
  it.each(OTHERS)('%s has every key, the same placeholders, and is marked for native review', (l) => {
    const t = load(l);
    expect(t._review).toBe(true);
    const missing = Object.keys(en).filter((k) => typeof t[k] !== 'string');
    expect(missing).toEqual([]);
    const extra = Object.keys(t).filter((k) => k !== '_review' && !(k in en));
    expect(extra).toEqual([]);
    for (const k of Object.keys(en)) expect(holes(t[k] as string), `${l} ${k}`).toEqual(holes(en[k] as string));
    // Language names stay in their own language in every file.
    for (const k of Object.keys(en).filter((x) => x.startsWith('lang.'))) expect(t[k], `${l} ${k}`).toBe(en[k]);
  });

  it('YELLOW lines stay short: at most 8 words, or 16 characters in Japanese and Chinese', () => {
    for (const l of ['en', ...OTHERS]) {
      const t = load(l);
      const cjk = l === 'ja' || l === 'zh-Hans';
      for (const k of Object.keys(t).filter((x) => /^(yellow|path)\./.test(x))) {
        const s = t[k] as string;
        if (cjk) expect([...s.replace(/\{\w+\}/g, '')].length, `${l} ${k}: ${s}`).toBeLessThanOrEqual(16);
        else expect(s.split(/\s+/).length, `${l} ${k}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('Japanese and Chinese never break a name across lines; every language has a glossary', async () => {
    const { setLang, fmt } = await import('../../src/game/text');
    setLang('ja');
    expect(fmt('battle.fainted', { defender: 'ピカチュウ' })).toContain('ピ⁠カ⁠チ⁠ュ⁠ウ');
    setLang('en');
    for (const l of OTHERS) expect(readFileSync(`docs/i18n/glossary.${l}.md`, 'utf8').length, l).toBeGreaterThan(200);
  });

  it('Hebrew isolates Latin names so they read right inside right to left text', () => {
    const he = load('he');
    expect(he['mate.redLoses']).toMatch(/⁨PIKACHU⁩/);
  });
});
