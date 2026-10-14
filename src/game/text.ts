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

// N1 (14 Oct): only English is in the entry bundle; every other table is its own chunk, fetched once by loadStrings
// (src/i18n.ts loadLanguage: before boot for the device's saved languages, on demand from the language picker).
const loaders = import.meta.glob<Record<string, string>>(['../data/strings.*.json', '!../data/strings.en.json'], { import: 'default' });
const dicts: Partial<Record<Lang, Record<string, string>>> = { en: strings };
let lang: Lang = 'en';
let dict: Record<string, string> = strings;

/** Fetches a language's table once; English is always there. Rejects when it cannot be fetched (offline, not cached). */
export async function loadStrings(l: Lang): Promise<void> {
  dicts[l] ??= await loaders[`../data/strings.${l}.json`]!();
}

/** Synchronous: a language not loaded yet reads in English until loadStrings has fetched it. */
export function setLang(next: Lang): void {
  lang = next;
  dict = dicts[next] ?? strings;
}

export const currentLang = () => lang;

// Hebrew shows English Pokémon and place names in Latin letters: isolate each inserted value so it
// reads correctly inside right to left text (U+2068 first strong isolate, U+2069 pop isolate).
// Japanese and Chinese break lines between any two characters: a word joiner (U+2060) between the characters of an
// inserted value (a Pokémon, move or place name) keeps it on one line.
const isolate = (v: string) => (RTL.includes(lang) ? `⁨${v}⁩` : CJK.includes(lang) ? [...v].join('⁠') : v);

// Translation review mode (§B21 item 3): every string shown is remembered with its key, so a reviewer can tap it.
const shown = new Map<string, StringKey>();
let recording = false;
export const recordStrings = () => (recording = true);
/** The key behind a piece of text on screen, in review mode. */
export const keyOfText = (text: string) => shown.get(text.trim());
/** A string as written in a language file (English, or the current language), before any value is filled in. */
export const rawString = (key: StringKey, inLang?: 'en') => (inLang === 'en' ? strings[key] : (dict[key] ?? strings[key]));

/** A string with its values filled in. A value that is missing is left out with the space before it, never shown as
 * "{turn}" (online merge, 14 Oct: the friend's return read "Welcome back! {turn}"; tests/unit/placeholders.test.ts). */
export function fmt(key: StringKey, vars: Vars = {}): string {
  const text = dict[key] ?? strings[key];
  let gap = false;
  const filled = text.replace(/( ?)\{(\w+)\}/g, (_, space: string, k: string) => {
    const v = vars[k];
    if (v !== undefined) return space + isolate(v);
    gap = true;
    return '';
  });
  const out = gap ? filled.trim() : filled;
  if (recording) shown.set(out.trim(), key);
  return out;
}
