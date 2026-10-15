// SPDX-License-Identifier: AGPL-3.0-only
// Opt in save codes on the relay (§B18 item 2): upload a profile's progress under an 8 character code and restore
// it on another device. No personal data and no accounts (V3); the code alone opens the save.
import { relayBase } from './online';

export const SAVE_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/** Upper case, spaces and dashes dropped, so "abcd-2345" and "ABCD 2345" both work. */
export const normalizeSaveCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, '');

/** Uploads to `code` when the save already has one, else asks for a new code. Returns the code. */
export async function uploadSave(save: object, code?: string | null): Promise<string> {
  const body = JSON.stringify(save);
  const headers = { 'Content-Type': 'application/json' };
  if (code) {
    const res = await fetch(`${relayBase()}/save/${code}`, { method: 'PUT', body, headers });
    if (res.ok) return code;
    if (res.status !== 404) throw new Error(`relay answered ${res.status}`);
  }
  const res = await fetch(`${relayBase()}/save`, { method: 'POST', body, headers });
  if (!res.ok) throw new Error(`relay answered ${res.status}`);
  const out = (await res.json()) as { code?: string };
  if (!out.code) throw new Error('relay sent no code');
  return out.code;
}

/** Deletes the server's copy under `code` at once (trust fix, 14 Oct). Resolves only on the relay's 204, which it sends
 * also when the copy already was gone (expired, or deleted from another device). Anything else throws, so the code is
 * kept: a relay deployed before DELETE /save/:code refuses DELETE's CORS preflight (a network error) or, when reached,
 * answers 404 or 405 while it still holds the save (15 Oct). */
export async function deleteSave(code: string): Promise<void> {
  const res = await fetch(`${relayBase()}/save/${code}`, { method: 'DELETE' });
  if (res.status !== 204) throw new Error(`relay answered ${res.status}`);
}

/** The save under `code`, or null when there is none (wrong or expired code). */
export async function downloadSave(code: string): Promise<unknown> {
  const res = await fetch(`${relayBase()}/save/${code}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`relay answered ${res.status}`);
  return res.json();
}
