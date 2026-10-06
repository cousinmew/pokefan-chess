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
export const slotCount = () => meta().slots.length;
export const isFull = () => meta().slots.length >= MAX_SLOTS;

// What the page should do after a switch reloads it (change C): resume the save, or start a new game.
const INTENT = 'kc:v1:intent';
export type Intent = 'continue' | 'newgame' | 'menu';
function setIntent(i: Intent): void {
  try {
    window.sessionStorage.setItem(INTENT, i);
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
  }
}
/** Reads and clears the intent left by a switch. */
export function takeIntent(): Intent | null {
  try {
    const i = window.sessionStorage.getItem(INTENT);
    window.sessionStorage.removeItem(INTENT);
    return i === 'continue' || i === 'newgame' || i === 'menu' ? i : null;
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
    return null;
  }
}
/** h:mm from milliseconds of play. */
export const playTime = (ms = 0) => `${Math.floor(ms / 3_600_000)}:${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}`;

/** The picker shows after the splash only when the device has more than one player, once per visit. */
export const needsPicker = () => meta().slots.length > 1 && !session();

export function summaries(): SlotSummary[] {
  return meta().slots.map((n) => {
    const c = loadFrom<Partial<Campaign>>(n, 'campaign');
    return {
      n,
      name: c?.name || fmt('profiles.slot', { n: String(n) }),
      cart: loadFrom<'yellow' | 'blue'>(n, 'cartridge'),
      trainer: loadFrom<string>(n, 'trainer') === 'meir' ? 'meir' : 'red-gen1',
      lang: loadFrom<string>(n, 'lang') ?? 'en',
      badges: c?.badges?.length ?? 0,
      dex: DEX.filter((s) => c?.caught?.[s]).length,
      time: playTime(c?.playMs),
    };
  });
}

export function switchTo(n: number, intent: Intent | null = null): void {
  const m = meta();
  if (m.slots.includes(n)) writeMeta({ ...m, current: n });
  session(true);
  if (intent) setIntent(intent);
  location.reload();
}

// A NEW GAME is "being created" until the name is confirmed (§B22 item 2): this remembers which save to go back to.
const CREATING = 'kc:v1:creating';
function session2(set?: string | null): string | null {
  try {
    if (set === null) window.sessionStorage.removeItem(CREATING);
    else if (set !== undefined) window.sessionStorage.setItem(CREATING, set);
    return window.sessionStorage.getItem(CREATING);
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
    return null;
  }
}
/** The save to return to while a NEW GAME is still unnamed, or null. */
export const creatingFrom = (): number | null => {
  const v = session2();
  return v === null ? null : Number(v);
};
/** The name is confirmed: the new save is real now. */
export const endCreating = () => void session2(null);
/** BACK during NEW GAME: the unnamed save is dropped and the start menu of the previous save comes back. */
export function abandonNewGame(): void {
  const from = creatingFrom();
  const m = meta();
  const n = m.current;
  endCreating();
  clearProfile(n);
  const slots = m.slots.filter((x) => x !== n);
  const back = from !== null && slots.includes(from) ? from : (slots[0] ?? 1);
  writeMeta({ slots: slots.length ? slots : [1], current: back });
  switchTo(back, 'menu');
}

/** NEW GAME with all 4 slots in use: this save is wiped and a new game starts in its place (after a 2 s hold). */
export function replaceProfile(n: number): void {
  session2(String(meta().current));
  clearProfile(n);
  switchTo(n, 'newgame');
}

/** A fresh player in the first free slot; it opens on the cartridge shelf. */
export function addProfile(): void {
  const m = meta();
  const n = [1, 2, 3, 4].find((x) => !m.slots.includes(x));
  if (!n || m.slots.length >= MAX_SLOTS) return;
  clearProfile(n);
  writeMeta({ slots: [...m.slots, n].sort(), current: m.current });
  session2(String(m.current));
  switchTo(n, 'newgame');
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
