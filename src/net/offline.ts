// SPDX-License-Identifier: AGPL-3.0-only
// Getting ready for offline play (owner, 12 Oct). The page itself loads before the service worker controls it, so
// after an install the first offline launch could miss the bundle, the engine or the puzzle chunks. The build writes
// offline.json (vite.config.ts) with the core same origin files; fetching them through the service worker puts them
// in its caches (sw.js decides which cache and keeps network first, so an update is never hidden). Same origin only.
const LIST = 'offline.json';
const PARALLEL = 4;
const CONTROL_WAIT_MS = 10000;

/** The service worker controlling this page, waiting a little for a fresh one to claim it. */
async function controlled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('caches' in window) || new URLSearchParams(location.search).has('debug')) return false;
  const sw = navigator.serviceWorker;
  if (sw.controller) return true;
  if (!(await sw.getRegistration())) return false;
  return new Promise((done) => {
    const t = window.setTimeout(() => done(false), CONTROL_WAIT_MS);
    sw.addEventListener('controllerchange', () => (window.clearTimeout(t), done(true)), { once: true });
  });
}

/** Fetches every listed file not cached yet; `progress` gets 0 to 100. True when all of them are cached. */
export async function warmUp(progress: (pct: number) => void): Promise<boolean> {
  try {
    if (!(await controlled())) return false;
    progress(0);
    const res = await fetch(LIST, { cache: 'no-store' });
    if (!res.ok) return false;
    const { files } = (await res.json()) as { files: string[] };
    let done = 0, failed = 0, next = 0;
    const one = async (url: string) => {
      if (!(await caches.match(url, { ignoreVary: true }))) {
        const r = await fetch(url).catch(() => null);
        if (!r?.ok) failed++;
        else await r.arrayBuffer(); // read to the end so the worker's copy is complete
      }
      progress(Math.floor((++done * 100) / files.length));
    };
    const lane = async () => {
      while (next < files.length) await one(files[next++]!);
    };
    await Promise.all(Array.from({ length: PARALLEL }, lane));
    return failed === 0;
  } catch (err) {
    console.warn('offline warm up failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
