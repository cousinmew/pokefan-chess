// SPDX-License-Identifier: AGPL-3.0-only
// Save slot controller (§B18 item 2). Switching player reloads the page, so every module starts clean on the new
// slot's data; a session flag skips the picker on that reload.
import type { Campaign } from './campaign/kanto';
import { DEX } from './campaign/kanto';
import { fmt } from './game/text';
import { clearProfile, loadFrom, MAX_SLOTS, readMeta, saveTo, writeMeta, type ProfileMeta } from './store/persist';
import type { SlotSummary } from './ui/profiles';

const PICKED = 'kc:v1:picked';

function session(write?: boolean): boolean {
  try {
    if (write) window.sessionStorage.setItem(PICKED, '1');
    return window.sessionStorage.getItem(PICKED) === '1';
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
    return true;
  }
}

const meta = (): ProfileMeta => readMeta() ?? { slots: [1], current: 1 };

/** The picker shows after the splash only when the device has more than one player, once per visit. */
export const needsPicker = () => meta().slots.length > 1 && !session();

export function summaries(): SlotSummary[] {
  return meta().slots.map((n) => {
    const c = loadFrom<Partial<Campaign>>(n, 'campaign');
    return {
      n,
      name: c?.name || fmt('profiles.slot', { n: String(n) }),
      cart: loadFrom<'yellow' | 'blue'>(n, 'cartridge'),
      lang: loadFrom<string>(n, 'lang') ?? 'en',
      badges: c?.badges?.length ?? 0,
      dex: DEX.filter((s) => c?.caught?.[s]).length,
    };
  });
}

export function switchTo(n: number): void {
  const m = meta();
  if (m.slots.includes(n)) writeMeta({ ...m, current: n });
  session(true);
  location.reload();
}

/** A fresh player in the first free slot; it opens on the cartridge shelf. */
export function addProfile(): void {
  const m = meta();
  const n = [1, 2, 3, 4].find((x) => !m.slots.includes(x));
  if (!n || m.slots.length >= MAX_SLOTS) return;
  clearProfile(n);
  writeMeta({ slots: [...m.slots, n].sort(), current: m.current });
  switchTo(n);
}

export function renameProfile(n: number, name: string): void {
  saveTo(n, 'campaign', { ...loadFrom<Partial<Campaign>>(n, 'campaign'), name });
}

/** Deletes a player; deleting the last one leaves an empty slot 1. Reloads when the current player went. */
export function deleteProfile(n: number): boolean {
  const m = meta();
  clearProfile(n);
  const slots = m.slots.filter((x) => x !== n);
  const next = { slots: slots.length ? slots : [1], current: m.current === n ? (slots[0] ?? 1) : m.current };
  writeMeta(next);
  if (m.current !== n) return false;
  switchTo(next.current);
  return true;
}
