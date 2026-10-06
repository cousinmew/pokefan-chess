// SPDX-License-Identifier: AGPL-3.0-only
// Translation review mode (§B21 item 3): pokefanchess.com/?review=<lang> shows the game in that language with a small
// ✎ on every visible string. Tapping it shows the key, the English source and the current wording, with a box for a
// better wording and an optional note. Nothing is saved on the device and nothing changes for normal players.
import { keyOfText, LANGS, rawString, recordStrings, type Lang, type StringKey } from '../game/text';
import { context, sendFeedback } from '../net/feedback';
import { el, toast } from './dom';

const SCAN_MS = 800;

/** ?review=<lang>: starts review mode and returns the language (not saved), or null for normal players. */
export function reviewFromUrl(): Lang | null {
  const l = new URLSearchParams(location.search).get('review');
  if (!l || !(LANGS as readonly string[]).includes(l)) return null;
  startReviewMode(l);
  return l as Lang;
}

export function startReviewMode(lang: string): void {
  recordStrings();
  document.documentElement.classList.add('i18n-review');
  window.setInterval(() => mark(lang), SCAN_MS);
}

/** Puts a ✎ next to every visible text that came from a string key. */
function mark(lang: string): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits: [HTMLElement, StringKey][] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const host = n.parentElement;
    if (!host || host.closest('.i18n-panel, .i18n-mark') || host.querySelector(':scope > .i18n-mark')) continue;
    const key = keyOfText(n.nodeValue ?? '');
    if (key && host.offsetParent !== null) hits.push([host, key]);
  }
  for (const [host, key] of hits) {
    const m = el('span', 'i18n-mark');
    m.textContent = '✎';
    m.setAttribute('role', 'button');
    m.setAttribute('aria-label', key);
    m.dataset.key = key;
    m.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
    m.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      panel(lang, key);
    });
    host.append(m);
  }
}

function panel(lang: string, key: StringKey): void {
  document.querySelector('.i18n-panel')?.remove();
  const p = el('div', 'i18n-panel');
  p.dataset.testid = 'i18n-panel';
  const row = (label: string, value: string) => {
    const r = el('p');
    const b = el('b');
    b.textContent = `${label}: `;
    const v = el('span');
    v.textContent = value;
    r.append(b, v);
    return r;
  };
  const better = el('textarea');
  better.maxLength = 600;
  better.dataset.testid = 'i18n-suggestion';
  better.value = rawString(key);
  const note = el('input');
  note.maxLength = 300;
  note.placeholder = 'Note (optional)';
  note.dataset.testid = 'i18n-note';
  const send = el('button', 'primary');
  send.type = 'button';
  send.textContent = 'Send';
  send.dataset.testid = 'i18n-send';
  send.onclick = async () => {
    send.disabled = true;
    const ok = await sendFeedback({ kind: 'translation', ...context(lang), key, current: rawString(key), suggestion: better.value, note: note.value });
    toast(ok ? 'feedback.thanks' : 'feedback.failed');
    if (ok) p.remove();
    send.disabled = false;
  };
  const close = el('button', 'secondary');
  close.type = 'button';
  close.textContent = '✕';
  close.onclick = () => p.remove();
  // The reviewer panel stays in English: it is a tool for the reviewer, not part of the game.
  p.append(row('Key', key), row('English', rawString(key, 'en')), row(`Now (${lang})`, rawString(key)), better, note, send, close);
  document.body.append(p);
}
