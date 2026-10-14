// SPDX-License-Identifier: AGPL-3.0-only
// Small DOM helpers. All visible text comes from strings.en.json through fmt().
import { DISCORD_URL, REPO_URL, TOAST_MS } from '../config';
import { fmt, type StringKey } from '../game/text';

/** `vars` fill the text's placeholders (a key with placeholders always gets its values: placeholders.test.ts). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: StringKey, vars?: Record<string, string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = fmt(text, vars);
  return e;
}

export function button(text: StringKey, onClick: () => void, testid?: string, cls = '', vars?: Record<string, string>): HTMLButtonElement {
  const b = el('button', cls, text, vars);
  b.type = 'button';
  if (testid) b.dataset.testid = testid;
  b.onclick = onClick;
  return b;
}

// The title row: the logo, a screen heading and the top rows that carry START or the language button.
const TITLE = 'h1, h2, .logo, .hub-top, .yellow-top';

/** One frame for every menu screen (W2): the title on top, a body that scrolls on its own when it is too tall for the
 * window, and the trailing Back and main action buttons underneath it, so they are always on screen. The page itself
 * never scrolls. A trailing footer goes to the end of the body. A screen built empty (the shelf) fills itself. */
export function screen(name: string, ...children: Node[]): HTMLElement {
  const s = el('section', `screen-${name} menu`);
  s.dataset.testid = `screen-${name}`;
  if (!children.length) return s;
  const kids = [...children];
  const foot = kids.at(-1) instanceof HTMLElement && (kids.at(-1) as HTMLElement).classList.contains('site-footer') ? kids.pop()! : null;
  let i = 0;
  while (i < kids.length && kids[i] instanceof Element && (kids[i] as Element).matches(TITLE)) i++;
  let j = kids.length;
  const action = (n: Node) => n instanceof HTMLButtonElement && (n.classList.contains('secondary') || n.classList.contains('primary'));
  while (j > i && action(kids[j - 1]!)) j--;
  const body = el('div', 'menu-body');
  body.append(...kids.slice(i, j), ...(foot ? [foot] : []));
  s.append(...kids.slice(0, i), body);
  if (j < kids.length) {
    const acts = el('div', 'menu-actions');
    acts.append(...kids.slice(j));
    s.append(acts);
  }
  return s;
}

/** A real link to the repository (`path`: a page in it), opened in a new tab so an installed app keeps the game. */
export function repoLink(key: StringKey, path = '', testid?: string): HTMLAnchorElement {
  const a = el('a', 'repo-link', key);
  a.href = REPO_URL + path;
  a.target = '_blank';
  a.rel = 'noopener';
  if (testid) a.dataset.testid = testid;
  return a;
}

// How an About link opens the About & privacy screen (trust pass, 14 Oct): main.ts sets it at boot, and Back returns
// to the screen it was opened from.
let aboutOpener: (() => void) | null = null;
export const onAbout = (open: () => void): void => void (aboutOpener = open);

/** "About" as a link-styled button: it opens a screen of the game, not a page. */
function aboutButton(open: () => void, testid: string): HTMLButtonElement {
  return button('trust.about', open, testid, 'link-btn');
}

/** The trust row under the start menu and the cartridge shelf (trust pass, 14 Oct): "Free fan project · About ·
 * Source on GitHub", the same three on every first screen a visitor sees. */
export function trustRow(about: () => void): HTMLElement {
  const dot = () => {
    const d = el('span', 'trust-sep');
    d.textContent = '·';
    d.setAttribute('aria-hidden', 'true');
    return d;
  };
  // The two links stay together: on a narrow window in a long language they wrap as one, under the words.
  const links = el('span', 'trust-links');
  links.append(aboutButton(about, 'trust-about'), dot(), repoLink('footer.github', '', 'trust-github'));
  const row = el('p', 'trust-row');
  row.dataset.testid = 'trust-row';
  row.append(el('span', 'trust-fan', 'trust.fan'), dot(), links);
  return row;
}

export function footer(): HTMLElement {
  const f = el('footer', 'site-footer');
  const p = el('p', '', 'footer.disclaimer');
  const links = el('p', 'links');
  links.append(aboutButton(() => aboutOpener?.(), 'footer-about'), ' · ', repoLink('footer.github', '', 'footer-github'));
  if (DISCORD_URL) {
    const dc = el('a', '', 'footer.discord');
    dc.href = DISCORD_URL;
    dc.rel = 'noopener';
    links.append(' · ', dc);
  }
  f.append(p, links);
  return f;
}

export function toast(key: StringKey, vars?: Record<string, string>): void {
  const t = el('div', 'toast');
  t.textContent = fmt(key, vars);
  t.setAttribute('role', 'status');
  t.dataset.testid = 'toast';
  document.body.append(t);
  window.setTimeout(() => t.remove(), TOAST_MS);
}
