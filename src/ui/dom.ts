// SPDX-License-Identifier: AGPL-3.0-only
// Small DOM helpers. All visible text comes from strings.en.json through fmt().
import { DISCORD_URL, REPO_URL, TOAST_MS } from '../config';
import { fmt, type StringKey } from '../game/text';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: StringKey): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = fmt(text);
  return e;
}

export function button(text: StringKey, onClick: () => void, testid?: string, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (testid) b.dataset.testid = testid;
  b.onclick = onClick;
  return b;
}

export function screen(name: string, ...children: Node[]): HTMLElement {
  const s = el('section', `screen-${name} menu`);
  s.dataset.testid = `screen-${name}`;
  s.append(...children);
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

export function toast(key: StringKey): void {
  const t = el('div', 'toast', key);
  t.setAttribute('role', 'status');
  t.dataset.testid = 'toast';
  document.body.append(t);
  window.setTimeout(() => t.remove(), TOAST_MS);
}
