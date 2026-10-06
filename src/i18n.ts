// SPDX-License-Identifier: AGPL-3.0-only
// Language switching (§B17): strings, Pokémon and move names, and page direction. Hebrew is right to left,
// but the chess board, coordinates and move notation stay left to right (see .board in style.css).
import { applyNames } from './board/pieces';
import { LANGS, RTL, setLang, type Lang } from './game/text';
import { load, save } from './store/persist';

export function savedLang(): Lang {
  const l = load<string>('lang');
  return (LANGS as readonly string[]).includes(l ?? '') ? (l as Lang) : 'en';
}

export function applyLanguage(lang: Lang, remember = true): void {
  setLang(lang);
  applyNames(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.includes(lang) ? 'rtl' : 'ltr';
  if (remember) save('lang', lang);
}
