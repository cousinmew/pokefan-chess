// SPDX-License-Identifier: AGPL-3.0-only
// Online screens: menu (create or enter a code), waiting room, and a message screen.
import { normalizeCode } from '../net/online';
import { fmt, type StringKey } from '../game/text';
import { button, el, screen, toast } from './dom';

/** Create a room, or join one with its 4 letter code (§B18 item 1). The field is a real form, so Enter, the phone's
 * Go key and the Join button all submit; typing or pasting is normalised as you go (no maxlength, which would cut a
 * pasted link or a code with spaces before it could be cleaned up). */
export function onlineMenu(create: () => void, join: (code: string) => void, back: () => void, prefill = ''): HTMLElement {
  const form = el('form', 'code-row');
  form.noValidate = true;
  const input = el('input', 'code-input');
  input.type = 'text';
  input.name = 'room';
  input.dataset.testid = 'code-input';
  // Attributes, not properties: WebKit ignores the autocapitalize property, but iOS Safari reads the attribute.
  const hints: [string, string][] = [['inputmode', 'text'], ['autocapitalize', 'characters'], ['autocomplete', 'off'], ['autocorrect', 'off'], ['spellcheck', 'false'], ['enterkeyhint', 'go']];
  for (const [k, v] of hints) input.setAttribute(k, v);
  input.setAttribute('aria-label', fmt('online.codeLabel'));
  input.placeholder = fmt('online.codeLabel');
  input.value = normalizeCode(prefill);
  input.addEventListener('input', () => {
    const v = normalizeCode(input.value);
    if (v !== input.value) input.value = v;
  });
  const go = button('online.go', () => undefined, 'join-code');
  go.type = 'submit';
  const err = el('p', 'code-error');
  err.dataset.testid = 'code-error';
  err.setAttribute('role', 'alert');
  form.onsubmit = (e) => {
    e.preventDefault();
    const code = normalizeCode(input.value);
    if (code.length === 4) return join(code);
    err.textContent = fmt('online.codeShort');
    input.focus();
  };
  form.append(input, go);
  return screen('online', el('h2', '', 'title.online'), button('online.create', create, 'create-room', 'primary'), el('h3', '', 'online.joinTitle'), form, err, button('back', back, 'back', 'secondary'));
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
