// SPDX-License-Identifier: AGPL-3.0-only
// Gentle hub notes (§B18 item 2): "Back up your save" after each badge, and a one time Add to Home Screen tip.
import type { StringKey } from '../game/text';
import { exportSave } from '../store/backup';
import { load, save } from '../store/persist';
import { button, el } from './dom';

const standalone = () =>
  (window.matchMedia?.('(display-mode: standalone)').matches ?? false) || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function note(key: StringKey, testid: string, ...buttons: HTMLButtonElement[]): HTMLElement {
  const n = el('div', 'hub-note');
  n.dataset.testid = testid;
  n.setAttribute('role', 'status');
  const row = el('div', 'note-buttons');
  row.append(...buttons);
  n.append(el('p', '', key), row);
  return n;
}

/** The note to show above the hub, if any. The tip counts as seen once shown. */
export function hubNote(): HTMLElement | null {
  if (load<boolean>('backupDue')) {
    const n: HTMLElement = note(
      'backup.prompt',
      'backup-note',
      button('backup.now', () => (exportSave(), n.remove()), 'backup-now'),
      button('backup.later', () => (save('backupDue', false), n.remove()), 'backup-later', 'secondary'),
    );
    return n;
  }
  if (load<boolean>('homeTip') || standalone()) return null;
  save('homeTip', true);
  const n: HTMLElement = note('tip.home', 'home-tip', button('tip.ok', () => n.remove(), 'home-tip-ok', 'secondary'));
  return n;
}

/** Adds the language button and the note to a home screen (BLUE hub or YELLOW home). */
export function decorateHome(view: HTMLElement, lang: HTMLElement): HTMLElement {
  const top = view.querySelector('.hub-top');
  if (top) top.prepend(lang);
  const n = hubNote();
  if (n) view.querySelector('.hub-top, .yellow-top')?.after(n);
  return view;
}
