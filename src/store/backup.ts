// SPDX-License-Identifier: AGPL-3.0-only
// Keeping progress safe (§B18 item 2): the save file format for Export and Import (and save codes), and
// navigator.storage.persist(), asked once per profile.
import { currentSlot, load, profileData, restoreProfile, save } from './persist';

export const SAVE_APP = 'pokefan-chess';
export interface SaveFile {
  app: typeof SAVE_APP;
  v: 1;
  data: Record<string, unknown>;
}

// Room seats and the persist question belong to this device, not to the progress.
const LOCAL_ONLY = /^(room:|persistAsked$)/;

export function packSave(slot = currentSlot()): SaveFile {
  const data = profileData(slot);
  for (const k of Object.keys(data)) if (LOCAL_ONLY.test(k)) delete data[k];
  return { app: SAVE_APP, v: 1, data };
}

export function isSaveFile(x: unknown): x is SaveFile {
  if (!x || typeof x !== 'object') return false;
  const f = x as Partial<SaveFile>;
  return f.app === SAVE_APP && f.v === 1 && !!f.data && typeof f.data === 'object' && !Array.isArray(f.data);
}

/** Replaces the current profile with a save file. False if it isn't one. */
export function unpackSave(x: unknown, slot = currentSlot()): boolean {
  if (!isSaveFile(x)) return false;
  restoreProfile(slot, x.data);
  return true;
}

/** Downloads the current profile as a .json file. */
export function exportSave(): void {
  const blob = new Blob([JSON.stringify(packSave(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const day = new Date().toISOString().slice(0, 10);
  a.download = `pokefan-chess-save-${currentSlot()}-${day}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  save('backupDue', false);
}

/** Reads a chosen file; resolves true when it was a save and is now restored. */
export async function importSave(file: File): Promise<boolean> {
  try {
    return unpackSave(JSON.parse(await file.text()));
  } catch (err) {
    console.warn('not a save file:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Asks the browser once per profile to keep this site's storage (no eviction under pressure). */
export async function protectSave(): Promise<boolean> {
  const sm = navigator.storage;
  if (!sm?.persisted) return false;
  try {
    if (await sm.persisted()) return true;
    if (load<boolean>('persistAsked') || !sm.persist) return false;
    save('persistAsked', true);
    return await sm.persist();
  } catch (err) {
    console.warn('storage.persist failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
