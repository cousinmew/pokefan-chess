// SPDX-License-Identifier: AGPL-3.0-only
// The secret code (§B18 item 7): ↑ ↑ ↓ ↓ ← → ← → B A unlocks MEIR. Keyboard on the cartridge shelf and the YELLOW
// home; on touch screens three taps on the YELLOW cartridge label open a small D-pad with B and A. Ten dots show the
// progress. Typing MEIR at the name step unlocks him too.
import { fmt } from '../game/text';
import { el } from './dom';

export type CodeKey = 'up' | 'down' | 'left' | 'right' | 'b' | 'a';
export const SECRET: readonly CodeKey[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];
// e.code names the physical key, so B and A work on any layout (Hebrew נ ש, Russian И Ф); e.key is the fallback.
const CODES: Record<string, CodeKey> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyB: 'b', KeyA: 'a' };
const KEYS: Record<string, CodeKey> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', up: 'up', down: 'down', left: 'left', right: 'right', b: 'b', a: 'a', 'נ': 'b', 'ש': 'a', 'и': 'b', 'ф': 'a' };

export const codeKey = (e: { key?: string; code?: string }): CodeKey | null => CODES[e.code ?? ''] ?? KEYS[(e.key ?? '').toLowerCase()] ?? null;

/** Feeds keys one at a time and returns the progress, 0 to 10; 10 means unlocked (then it starts over). A slip keeps
 * whatever still matches the start of the code, so ↑ ↑ ↑ ↓ ↓ ... works. */
export function codeReader(): (k: CodeKey) => number {
  let recent: CodeKey[] = [];
  return (k) => {
    recent = [...recent, k].slice(-SECRET.length);
    for (let n = recent.length; n > 0; n--) {
      if (recent.slice(-n).every((x, i) => x === SECRET[i])) {
        if (n === SECRET.length) recent = [];
        return n;
      }
    }
    return 0;
  };
}

/** Ten dots that fill as the code goes in, and shake and clear on a wrong key. */
export function codeDots(): { el: HTMLElement; show(n: number): void } {
  const row = el('span', 'code-dots');
  row.dataset.testid = 'code-dots';
  row.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < SECRET.length; i++) row.append(el('span', 'code-dot'));
  let last = 0;
  return {
    el: row,
    show(n) {
      const wrong = n === 0 && last > 0;
      [...row.children].forEach((d, i) => d.classList.toggle('on', i < n));
      row.classList.toggle('active', n > 0);
      row.dataset.progress = String(n);
      if (wrong) {
        row.classList.remove('shake');
        void row.offsetWidth;
        row.classList.add('shake');
      }
      last = n === SECRET.length ? 0 : n;
    },
  };
}

/** Listens for the code while `view` is on screen. Capture phase on window, so no screen can swallow the keys; it
 * never prevents them, so arrow key navigation keeps working. Held keys (repeats) are ignored. */
export function listenForCode(view: HTMLElement, unlock: () => void, read = codeReader(), dots?: { show(n: number): void }): void {
  const onKey = (e: KeyboardEvent) => {
    if (!view.isConnected) return window.removeEventListener('keydown', onKey, true);
    if (e.repeat) return;
    const k = codeKey(e);
    if (!k) return;
    const n = read(k);
    dots?.show(n);
    if (n === SECRET.length) unlock();
  };
  window.addEventListener('keydown', onKey, true);
}

/** Typing a word (letters by physical key, so any layout) while `view` is on screen. */
export function listenForWord(view: HTMLElement, word: string, done: () => void): void {
  let typed = '';
  const onKey = (e: KeyboardEvent) => {
    if (!view.isConnected) return window.removeEventListener('keydown', onKey, true);
    if (e.repeat) return;
    const letter = /^Key([A-Z])$/.exec(e.code ?? '')?.[1] ?? (/^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : '');
    if (!letter) return;
    typed = (typed + letter).slice(-word.length);
    if (typed === word) {
      typed = '';
      done();
    }
  };
  window.addEventListener('keydown', onKey, true);
}

/** The on screen D-pad: arrows, B and A. Feeds the same reader (and dots) as the keyboard. */
export function dpad(read: (k: CodeKey) => number, unlock: () => void, dots?: { show(n: number): void }): HTMLElement {
  const pad = el('div', 'dpad');
  pad.dataset.testid = 'dpad';
  pad.setAttribute('aria-label', fmt('secret.pad'));
  const glyph: Record<CodeKey, string> = { up: '▲', down: '▼', left: '◀', right: '▶', b: 'B', a: 'A' };
  for (const k of ['up', 'left', 'right', 'down', 'b', 'a'] as CodeKey[]) {
    const b = el('button', `pad-${k}`);
    b.type = 'button';
    b.dataset.testid = `pad-${k}`;
    b.textContent = glyph[k];
    b.setAttribute('aria-label', k.length === 1 ? k.toUpperCase() : fmt(`secret.${k}` as 'secret.up'));
    b.onclick = () => {
      const n = read(k);
      dots?.show(n);
      if (n === SECRET.length) {
        pad.remove();
        unlock();
      }
    };
    pad.append(b);
  }
  return pad;
}
