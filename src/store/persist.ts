// SPDX-License-Identifier: AGPL-3.0-only
// localStorage, one namespace per save slot (§B18 item 2): kc:v1:p<n>:<key>. Every access is guarded: the game works
// with storage blocked (§4.8). kc:v1:profiles holds the slot list and the current slot.
import { STORAGE_NS } from '../config';

export const MAX_SLOTS = 4;
export interface ProfileMeta {
  slots: number[];
  current: number;
}

const META = `${STORAGE_NS}profiles`;
export const profilePrefix = (n: number) => `${STORAGE_NS}p${n}:`;
let prefix = profilePrefix(1);
let slot = 1;

function get(full: string): string | null {
  try {
    return window.localStorage.getItem(full);
  } catch (err) {
    console.warn('storage read failed:', err instanceof Error ? err.name : err);
    return null;
  }
}

function set(full: string, value: string): void {
  try {
    window.localStorage.setItem(full, value);
  } catch (err) {
    console.warn('storage write failed:', err instanceof Error ? err.name : err);
  }
}

function drop(full: string): void {
  try {
    window.localStorage.removeItem(full);
  } catch (err) {
    console.warn('storage remove failed:', err instanceof Error ? err.name : err);
  }
}

function keys(): string[] {
  try {
    return Object.keys(window.localStorage);
  } catch (err) {
    console.warn('storage list failed:', err instanceof Error ? err.name : err);
    return [];
  }
}

const parse = <T>(raw: string | null): T | null => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('unreadable stored value:', err instanceof Error ? err.message : err);
    return null;
  }
};

export const readMeta = () => parse<ProfileMeta>(get(META));
/** Device level values (kc:v1:dev:<key>), shared by every save: the feedback waiting to send (§B23 item 2). */
export const readDevice = <T>(key: string): T | null => parse<T>(get(`${STORAGE_NS}dev:${key}`));
export const writeDevice = (key: string, value: unknown) => set(`${STORAGE_NS}dev:${key}`, JSON.stringify(value));
export const removeDevice = (key: string) => drop(`${STORAGE_NS}dev:${key}`);
export const writeMeta = (m: ProfileMeta) => set(META, JSON.stringify(m));
export const currentSlot = () => slot;

/** Picks the slot whose data load/save use from now on. */
export function useProfile(n: number): void {
  slot = n;
  prefix = profilePrefix(n);
}

/** Boot: the slot list (slot 1 on a new device), and old style kc:v1:<key> data moved into the current slot.
 * That migrates a save from before profiles into slot 1 once, without losing anything; an old MEIR unlock moves to
 * its own key in every save (moveMeir). `abandoned(n)` says a save is a NEW GAME left empty (profiles.ts bootSaves
 * decides; a save it has no note for never is): it is dropped while another save remains, and when it was the
 * current one the first remaining save loads instead (playtest, 12 Oct; bootSaves then prefers one with progress). */
export function bootProfiles(abandoned?: (n: number) => boolean): ProfileMeta {
  const m = readMeta() ?? { slots: [1], current: 1 };
  if (!m.slots.includes(m.current)) m.current = m.slots[0] ?? 1;
  useProfile(m.current);
  const legacy = keys().filter((k) => k.startsWith(STORAGE_NS) && k !== META && !/^kc:v1:(p\d+|dev):/.test(k));
  for (const k of legacy) {
    const v = get(k);
    if (v !== null) set(prefix + k.slice(STORAGE_NS.length), v);
    drop(k);
  }
  for (const n of m.slots) moveMeir(n);
  for (const n of abandoned ? [...m.slots] : []) {
    if (m.slots.length < 2 || !abandoned!(n)) continue;
    clearProfile(n);
    m.slots = m.slots.filter((x) => x !== n);
    if (m.current === n) m.current = m.slots[0]!;
  }
  useProfile(m.current);
  writeMeta(m);
  return m;
}

// PLAY CHESS without a save (§B22 item 4): a guest reads and writes only here, in memory. Nothing reaches storage, so
// the player's saves (Journey included) are never touched.
let guest: Map<string, string> | null = null;
export const isGuest = () => guest !== null;
export const enterGuest = () => void (guest = new Map());
export const leaveGuest = () => void (guest = null);

export const load = <T>(key: string): T | null => parse<T>(guest ? (guest.get(key) ?? null) : get(prefix + key));
export const save = (key: string, value: unknown) => (guest ? void guest.set(key, JSON.stringify(value)) : set(prefix + key, JSON.stringify(value)));
export const remove = (key: string) => (guest ? void guest.delete(key) : drop(prefix + key));
export const loadFrom = <T>(n: number, key: string): T | null => parse<T>(get(profilePrefix(n) + key));
export const saveTo = (n: number, key: string, value: unknown) => set(profilePrefix(n) + key, JSON.stringify(value));
export const removeFrom = (n: number, key: string) => drop(profilePrefix(n) + key);

/** The player's trainer: "meir" once the secret code is entered (§B18 item 7), else nothing (RED). Its own key since
 * the data loss review (13 Oct): it shared 'trainer' with the puzzle record, so the first rated puzzle put RED back
 * and the MEIR code wiped the Trainer Level. */
export const PLAYER_TRAINER = 'playerTrainer';
/** An old save (boot) or backup (restore) with 'trainer' = "meir": MEIR moves to its own key and 'trainer' is left
 * to the puzzle record. A puzzle record there is never touched. */
function moveMeir(n: number): void {
  if (loadFrom(n, 'trainer') !== 'meir') return;
  saveTo(n, PLAYER_TRAINER, 'meir');
  removeFrom(n, 'trainer');
}

/** Every key of a slot, for export, save codes and delete. */
export function profileData(n: number): Record<string, unknown> {
  const p = profilePrefix(n);
  const out: Record<string, unknown> = {};
  for (const k of keys().filter((x) => x.startsWith(p))) out[k.slice(p.length)] = parse(get(k));
  return out;
}

export function clearProfile(n: number): void {
  const p = profilePrefix(n);
  for (const k of keys().filter((x) => x.startsWith(p))) drop(k);
}

/** Replaces a slot's data with an exported or downloaded copy. */
export function restoreProfile(n: number, data: Record<string, unknown>): void {
  clearProfile(n);
  for (const [k, v] of Object.entries(data)) if (/^[a-zA-Z0-9:_-]{1,60}$/.test(k)) saveTo(n, k, v);
  moveMeir(n);
}
