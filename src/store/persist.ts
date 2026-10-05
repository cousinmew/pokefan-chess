// SPDX-License-Identifier: AGPL-3.0-only
// localStorage under kc:v1:. Every access is guarded: the game works with storage blocked (§4.8).
import { STORAGE_NS } from '../config';

export function load<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_NS + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.warn(`storage read ${key} failed:`, err instanceof Error ? err.name : err);
    return null;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(STORAGE_NS + key, JSON.stringify(value));
  } catch (err) {
    console.warn(`storage write ${key} failed:`, err instanceof Error ? err.name : err);
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(STORAGE_NS + key);
  } catch (err) {
    console.warn(`storage remove ${key} failed:`, err instanceof Error ? err.name : err);
  }
}
