// SPDX-License-Identifier: AGPL-3.0-only
// Gentle hub notes (§B18 item 2): "Back up your save" after each badge, and a one time Add to Home Screen tip.
import type { StringKey } from '../game/text';
import { installState } from '../pwa';
import { exportSave } from '../store/backup';
import { load, save } from '../store/persist';
import { button, el } from './dom';


function note(key: StringKey, testid: string, ...buttons: HTMLButtonElement[]): HTMLElement {
  const n = el('div', 'hub-note');
  n.dataset.testid = testid;
  n.setAttribute('role', 'status');
  const row = el('div', 'note-buttons');
  row.append(...buttons);
  n.append(el('p', '', key), row);
  return n;
}

/** The note to show above the hub, if any. The tip counts as seen once shown; YELLOW (small children) never gets it. */
export function hubNote(kids = false): HTMLElement | null {
  if (load<boolean>('backupDue')) {
    const n: HTMLElement = note(
      'backup.prompt',
      'backup-note',
      button('backup.now', () => (exportSave(), n.remove()), 'backup-now'),
      button('backup.later', () => (save('backupDue', false), n.remove()), 'backup-later', 'secondary'),
    );
    return n;
  }
  const state = installState();
  if (kids || load<boolean>('homeTip') || state === 'installed') return null;
  save('homeTip', true);
  // Where OPTION's install row can only say "Open in Chrome or Edge", the tip says so too (playtest, 12 Oct).
  const n: HTMLElement = note(state === 'none' ? 'tip.homeBrowser' : 'tip.home', 'home-tip', button('tip.ok', () => n.remove(), 'home-tip-ok', 'secondary'));
  return n;
}

/** Adds the language button and the note to a home screen (BLUE hub or YELLOW home). */
export function decorateHome(view: HTMLElement, lang: HTMLElement): HTMLElement {
  const top = view.querySelector('.hub-top');
  if (top) top.prepend(lang);
  const n = hubNote(!!view.querySelector('.yellow-top'));
  if (n) view.querySelector('.hub-top, .yellow-top')?.after(n);
  return view;
}
