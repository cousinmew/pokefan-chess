// SPDX-License-Identifier: AGPL-3.0-only
// The secret code (§B18 item 7): ↑ ↑ ↓ ↓ ← → ← → B A unlocks MEIR. Keyboard on the cartridge shelf and the YELLOW
// home; on touch screens three taps on the YELLOW cartridge label open a small D-pad with B and A.
import { fmt } from '../game/text';
import { el } from './dom';

export type CodeKey = 'up' | 'down' | 'left' | 'right' | 'b' | 'a';
export const SECRET: readonly CodeKey[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];
const KEYS: Record<string, CodeKey> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', b: 'b', B: 'b', a: 'a', A: 'a' };

/** Feeds keys one at a time; true on the key that completes the code. A wrong key restarts (or starts a new try). */
export function codeReader(): (k: CodeKey) => boolean {
  let at = 0;
  return (k) => {
    at = k === SECRET[at] ? at + 1 : k === SECRET[0] ? 1 : 0;
    if (at < SECRET.length) return false;
    at = 0;
    return true;
  };
}

/** Listens for the code while `view` is on screen. */
export function listenForCode(view: HTMLElement, unlock: () => void, read = codeReader()): void {
  const onKey = (e: KeyboardEvent) => {
    if (!view.isConnected) return window.removeEventListener('keydown', onKey);
    const k = KEYS[e.key];
    if (k && read(k)) unlock();
  };
  window.addEventListener('keydown', onKey);
}

/** The on screen D-pad: arrows, B and A. Feeds the same reader as the keyboard. */
export function dpad(read: (k: CodeKey) => boolean, unlock: () => void): HTMLElement {
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
      if (read(k)) {
        pad.remove();
        unlock();
      }
    };
    pad.append(b);
  }
  return pad;
}
