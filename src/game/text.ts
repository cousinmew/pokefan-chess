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

/** Phase 1 languages (§B17). Language names are written in their own language (strings "lang.<code>"). */
export const LANGS = ['en', 'fr', 'he', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export const RTL: readonly Lang[] = ['he'];

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
const isolate = (v: string) => (RTL.includes(lang) ? `⁨${v}⁩` : v);

export function fmt(key: StringKey, vars: Vars = {}): string {
  const text = dict[key] ?? strings[key];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : isolate(vars[k]!)));
}
