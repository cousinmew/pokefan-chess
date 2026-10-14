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

export function footer(): HTMLElement {
  const f = el('footer', 'site-footer');
  const p = el('p', '', 'footer.disclaimer');
  const links = el('p', 'links');
  const gh = el('a', '', 'footer.github');
  gh.href = REPO_URL;
  gh.rel = 'noopener';
  links.append(gh);
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
