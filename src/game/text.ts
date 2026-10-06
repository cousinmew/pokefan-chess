// SPDX-License-Identifier: AGPL-3.0-only
// UI text (§B17): strings.<lang>.json per language with the same keys as English, which is the fallback.
import strings from '../data/strings.en.json';

export type StringKey = keyof typeof strings;
export type Vars = Record<string, string>;

export interface Line {
  key: StringKey;
  vars?: Vars;
  caption?: StringKey;
}

/** Phase 1 and 2 languages (§B17). Language names are written in their own language (strings "lang.<code>"). */
export const LANGS = ['en', 'fr', 'he', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh-Hans', 'ru'] as const;
export type Lang = (typeof LANGS)[number];
export const RTL: readonly Lang[] = ['he'];
/** No spaces between words: YELLOW's limit is 16 characters, and inserted names must never break across lines. */
export const CJK: readonly Lang[] = ['ja', 'zh-Hans'];

const dicts = import.meta.glob<Record<string, string>>('../data/strings.*.json', { eager: true, import: 'default' });
let lang: Lang = 'en';
let dict: Record<string, string> = strings;

export function setLang(next: Lang): void {
  lang = next;
  dict = dicts[`../data/strings.${next}.json`] ?? strings;
}

export const currentLang = () => lang;

// Hebrew shows English Pokémon and place names in Latin letters: isolate each inserted value so it
// reads correctly inside right to left text (U+2068 first strong isolate, U+2069 pop isolate).
// Japanese and Chinese break lines between any two characters: a word joiner (U+2060) between the characters of an
// inserted value (a Pokémon, move or place name) keeps it on one line.
const isolate = (v: string) => (RTL.includes(lang) ? `⁨${v}⁩` : CJK.includes(lang) ? [...v].join('⁠') : v);

export function fmt(key: StringKey, vars: Vars = {}): string {
  const text = dict[key] ?? strings[key];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : isolate(vars[k]!)));
}
