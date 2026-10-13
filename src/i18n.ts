// SPDX-License-Identifier: AGPL-3.0-only
// Language switching (§B17): strings, Pokémon and move names, and page direction. Hebrew is right to left,
// but the chess board, coordinates and move notation stay left to right (see .board in style.css).
import { STORAGE_NS } from './config';
import { applyNames, loadNames } from './board/pieces';
import { LANGS, RTL, loadStrings, setLang, type Lang } from './game/text';
import { load, save } from './store/persist';

export function savedLang(): Lang {
  const l = load<string>('lang');
  return (LANGS as readonly string[]).includes(l ?? '') ? (l as Lang) : 'en';
}

/** Synchronous: the language must be loaded (loadLanguage), or it reads in English. */
export function applyLanguage(lang: Lang, remember = true): void {
  setLang(lang);
  applyNames(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.includes(lang) ? 'rtl' : 'ltr';
  if (remember) save('lang', lang);
}

/** Fetches a language's strings and Pokémon and move names once (N1, 14 Oct: only English is in the entry bundle). */
export const loadLanguage = (lang: Lang): Promise<void> => Promise.all([loadStrings(lang), loadNames(lang)]).then(() => undefined);

const isLang = (l: unknown): l is Lang => (LANGS as readonly unknown[]).includes(l);
const SAVED = new RegExp(`^${STORAGE_NS}(p\\d+:)?lang$`);

/** The languages this device can start in, besides English (N1): ?review=<lang> and the language of every save, read
 * straight from storage before boot picks a save (kc:v1:p<n>:lang, and kc:v1:lang from before save slots). Usually
 * none or one. Storage blocked: only ?review=, and the device starts in English. */
export function bootLangs(search: string, storage: Pick<Storage, 'length' | 'key' | 'getItem'> | null): Lang[] {
  const out = new Set<Lang>();
  const review = new URLSearchParams(search).get('review');
  if (isLang(review)) out.add(review);
  try {
    for (let i = 0; storage && i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !SAVED.test(k)) continue;
      let l: unknown = null;
      try {
        l = JSON.parse(storage.getItem(k) ?? 'null');
      } catch (err) {
        console.warn('unreadable saved language:', err instanceof Error ? err.message : err);
      }
      if (isLang(l)) out.add(l);
    }
  } catch (err) {
    console.warn('storage read failed:', err instanceof Error ? err.name : err);
  }
  out.delete('en');
  return [...out];
}

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch (err) {
    console.warn('storage blocked:', err instanceof Error ? err.name : err);
    return null;
  }
};

// Before boot runs (main.ts imports this module, so it waits for this top level await): the device's languages are
// fetched, so a French save's splash paints in French from its first frame and setLang stays synchronous. A table that
// cannot be fetched (offline and not cached) leaves that language reading in English.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  await Promise.all(bootLangs(location.search, storage()).map((l) => loadLanguage(l).catch((err: unknown) => console.warn(`language ${l} unavailable:`, err instanceof Error ? err.message : err))));
}
