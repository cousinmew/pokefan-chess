// SPDX-License-Identifier: AGPL-3.0-only
// N1 (14 Oct): the entry bundle carries English only; before boot, the languages this device can start in are loaded
// (src/i18n.ts bootLangs and loadLanguage): ?review=<lang>, every save's language and the one from before save slots.
import { describe, expect, it } from 'vitest';
import { bootLangs, loadLanguage } from '../../src/i18n';
import { fmt, setLang } from '../../src/game/text';
import { applyNames, SPECIES } from '../../src/board/pieces';

/** A localStorage stand-in holding these raw values. */
const store = (o: Record<string, string>) => ({
  get length() {
    return Object.keys(o).length;
  },
  key: (i: number) => Object.keys(o)[i] ?? null,
  getItem: (k: string) => o[k] ?? null,
});

describe('bootLangs: the languages to load before boot', () => {
  it('a new device, or an English one: none (English is in the bundle)', () => {
    expect(bootLangs('', store({}))).toEqual([]);
    expect(bootLangs('', store({ 'kc:v1:p1:lang': '"en"', 'kc:v1:p1:cartridge': '"blue"' }))).toEqual([]);
  });

  it("every save's language, the one from before save slots, and ?review=, once each", () => {
    const s = store({ 'kc:v1:p1:lang': '"fr"', 'kc:v1:p3:lang': '"de"', 'kc:v1:lang': '"ja"', 'kc:v1:p4:lang': '"fr"', 'kc:v1:p2:name': '"he"' });
    expect(bootLangs('?review=he', s).sort()).toEqual(['de', 'fr', 'he', 'ja']);
    expect(bootLangs('?debug=1&review=zh-Hans', store({}))).toEqual(['zh-Hans']);
  });

  it('ignores what is not a language, and keys of other apps', () => {
    const s = store({ 'kc:v1:p1:lang': '"xx"', 'kc:v1:p2:lang': 'not json', 'other:lang': '"fr"', 'kc:v1:p5:langs': '"de"' });
    expect(bootLangs('?review=klingon', s)).toEqual([]);
  });

  it('storage blocked: only ?review=, and the device starts in English', () => {
    const blocked = {
      get length(): number {
        throw new DOMException('blocked', 'SecurityError');
      },
      key: () => null,
      getItem: () => null,
    };
    expect(bootLangs('', blocked)).toEqual([]);
    expect(bootLangs('?review=fr', null)).toEqual(['fr']);
  });
});

describe('loadLanguage', () => {
  it('loads the strings and the Pokémon names; setLang and applyNames stay synchronous', async () => {
    await loadLanguage('fr');
    setLang('fr');
    applyNames('fr');
    expect(fmt('splash.tap')).toBe('Touche pour commencer');
    expect(SPECIES.bulbasaur!.name).toBe('BULBIZARRE');
    setLang('en');
    applyNames('en');
    expect(fmt('splash.tap')).toBe('Tap to start');
    expect(SPECIES.bulbasaur!.name).toBe('BULBASAUR');
  });
});
