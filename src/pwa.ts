// SPDX-License-Identifier: AGPL-3.0-only
// Installable web app (§B18 item 2): the service worker caches the app shell so it opens offline.
export function registerShell(): void {
  if (!('serviceWorker' in navigator) || new URLSearchParams(location.search).has('debug')) return;
  navigator.serviceWorker.register('./sw.js').catch((err: unknown) => console.warn('offline cache unavailable:', err instanceof Error ? err.message : err));
}
