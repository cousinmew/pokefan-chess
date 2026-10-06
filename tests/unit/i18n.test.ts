// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const load = (l: string) => JSON.parse(readFileSync(`src/data/strings.${l}.json`, 'utf8')) as Record<string, unknown>;
const en = load('en');
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n phase 1 (§B17)', () => {
  it.each(['fr', 'he', 'es'])('%s has every key, the same placeholders, and is marked for native review', (l) => {
    const t = load(l);
    expect(t._review).toBe(true);
    const missing = Object.keys(en).filter((k) => typeof t[k] !== 'string');
    expect(missing).toEqual([]);
    const extra = Object.keys(t).filter((k) => k !== '_review' && !(k in en));
    expect(extra).toEqual([]);
    for (const k of Object.keys(en)) expect(holes(t[k] as string), `${l} ${k}`).toEqual(holes(en[k] as string));
    // Language names stay in their own language in every file.
    for (const k of ['lang.en', 'lang.fr', 'lang.he', 'lang.es']) expect(t[k]).toBe(en[k]);
  });

  it('YELLOW lines stay short: at most 8 words in every language', () => {
    for (const l of ['en', 'fr', 'he', 'es']) {
      const t = load(l);
      for (const k of Object.keys(t).filter((x) => /^(yellow|path)\./.test(x))) expect((t[k] as string).split(/\s+/).length, `${l} ${k}`).toBeLessThanOrEqual(8);
    }
  });

  it('Hebrew isolates Latin names so they read right inside right to left text', () => {
    const he = load('he');
    expect(he['mate.redLoses']).toMatch(/⁨PIKACHU⁩/);
  });
});
