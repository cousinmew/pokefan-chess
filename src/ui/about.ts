// SPDX-License-Identifier: AGPL-3.0-only
// About & privacy (trust pass, 14 Oct): who made the game, that it is free, what is stored and where, the source and
// issues links, the disclaimer and the version, in plain words for a parent. Opened from the trust row under the start
// menu and the shelf, from OPTION and from the hub's footer; Back, B or Escape return to where it was opened.
import type { StringKey } from '../game/text';
import { button, el, repoLink, screen } from './dom';

/** What is stored and where, one line each; every line is checked against the code (README, Privacy). */
export const ABOUT_STORED = ['saves', 'code', 'feedback', 'online', 'others'] as const;

const line = (tag: 'p' | 'li', key: StringKey, testid: string, cls = '', vars?: Record<string, string>) => {
  const e = el(tag, cls, key, vars);
  e.dataset.testid = testid;
  return e;
};

export function aboutScreen(back: () => void): HTMLElement {
  const stored = el('ul', 'about-list');
  for (const k of ABOUT_STORED) stored.append(line('li', `about.${k}`, `about-${k}`));
  const link = (key: StringKey, path: string, testid: string) => {
    const p = el('p', 'about-link');
    p.append(repoLink(key, path, testid));
    return p;
  };
  const view = screen(
    'about',
    el('h2', '', 'about.title'),
    line('p', 'about.made', 'about-made', 'about-lead'),
    line('p', 'about.free', 'about-free', 'about-lead'),
    el('h3', '', 'about.stored'),
    stored,
    link('about.source', '', 'about-source'),
    line('p', 'about.questions', 'about-questions', 'about-link about-ask'),
    link('about.issues', '/issues', 'about-issues'),
    line('p', 'footer.disclaimer', 'about-disclaimer', 'about-small'),
    line('p', 'about.version', 'about-version', 'about-small', { version: __VERSION__ }),
    button('back', back, 'back', 'secondary'),
  );
  // B and Escape go back too, as in OPTION (§B23 item 1).
  const onKey = (e: KeyboardEvent) => {
    if (!view.isConnected) return window.removeEventListener('keydown', onKey);
    if (e.key === 'Escape' || e.code === 'KeyB' || e.key.toLowerCase() === 'b') {
      e.preventDefault();
      back();
    }
  };
  window.addEventListener('keydown', onKey);
  return view;
}

/** OPTION's way in, near the bottom: a box like FEEDBACK's, so screen() keeps it in the body, not with Back. */
export function aboutOption(open: () => void): HTMLElement {
  const box = el('div', 'about-box');
  box.append(button('about.option', open, 'open-about', 'secondary'));
  return box;
}
