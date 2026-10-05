// SPDX-License-Identifier: AGPL-3.0-only
// Online screens: menu (create or enter a code), waiting room, and a message screen.
import { CODE_RE } from '../../worker/src/protocol';
import { fmt, type StringKey } from '../game/text';
import { button, el, screen, toast } from './dom';

export function onlineMenu(create: () => void, join: (code: string) => void, back: () => void): HTMLElement {
  const input = el('input', 'code-input');
  input.dataset.testid = 'code-input';
  input.maxLength = 4;
  input.autocapitalize = 'characters';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', fmt('online.codeLabel'));
  input.placeholder = fmt('online.codeLabel');
  const go = button('online.go', () => {
    const code = input.value.trim().toUpperCase();
    if (CODE_RE.test(code)) join(code);
    else input.focus();
  }, 'join-code');
  input.onkeydown = (e) => e.key === 'Enter' && go.click();
  const row = el('div', 'code-row');
  row.append(input, go);
  return screen('online', el('h2', '', 'title.online'), button('online.create', create, 'create-room', 'primary'), el('h3', '', 'online.joinTitle'), row, button('back', back, 'back', 'secondary'));
}

export function waitingRoom(code: string, back: () => void): HTMLElement {
  const big = el('p', 'room-code');
  big.dataset.testid = 'room-code';
  big.textContent = code;
  const url = `${location.origin}${location.pathname}?room=${code}`;
  const share = button('online.shareLink', () => {
    const done = () => toast('toast.copied');
    if (navigator.share) navigator.share({ url, title: fmt('title.name') }).catch((err: unknown) => console.warn('share closed:', err));
    else navigator.clipboard?.writeText(url).then(done, (err: unknown) => console.warn('copy failed:', err));
  }, 'share-room');
  return screen('waiting', el('h2', '', 'title.online'), el('p', '', 'online.waiting'), big, share, button('back', back, 'back', 'secondary'));
}

export function message(key: StringKey, back: () => void, vars?: Record<string, string>): HTMLElement {
  const p = el('p', 'online-message');
  p.dataset.testid = 'online-message';
  p.textContent = fmt(key, vars);
  return screen('message', el('h2', '', 'title.online'), p, button('back', back, 'back', 'secondary'));
}
