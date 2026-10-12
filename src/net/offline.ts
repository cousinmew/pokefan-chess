// SPDX-License-Identifier: AGPL-3.0-only
// Getting ready for offline play (owner, 12 Oct). The page itself loads before the service worker controls it, so
// after an install the first offline launch could miss the bundle, the engine or the puzzle chunks. The build writes
// offline.json (vite.config.ts) with the core same origin files. The service worker caches them itself, into its own
// build's caches (sw.js, review fix): the page only asks the newest worker and listens for its progress, so an update
// arriving meanwhile cannot delete a half warmed cache under it. Same origin only.
const CONTROL_WAIT_MS = 10000;
/** No word from the worker for this long: give up (it was stopped, or a newer one replaced it). */
const QUIET_MS = 60000;

/** Resolves once nothing is installing or waiting, so `reg.active` is the newest worker (or after a timeout). */
function settled(reg: ServiceWorkerRegistration): Promise<void> {
  return new Promise((done) => {
    const t = window.setTimeout(done, CONTROL_WAIT_MS);
    const check = () => {
      const w = reg.installing ?? reg.waiting;
      if (!w) return (window.clearTimeout(t), done());
      w.addEventListener('statechange', check, { once: true });
    };
    check();
  });
}

/** The newest active service worker of this page's registration, once it controls the page; null when there is none. */
async function newest(): Promise<ServiceWorker | null> {
  if (!('serviceWorker' in navigator) || !('caches' in window) || new URLSearchParams(location.search).has('debug')) return null;
  const sw = navigator.serviceWorker;
  const reg = await sw.getRegistration();
  if (!reg) return null;
  await settled(reg);
  if (!sw.controller || sw.controller !== reg.active) {
    // A fresh worker claims the page right after it activates (sw.js clients.claim).
    await new Promise<void>((done) => {
      const t = window.setTimeout(done, CONTROL_WAIT_MS);
      sw.addEventListener('controllerchange', () => (window.clearTimeout(t), done()), { once: true });
    });
  }
  return reg.active && sw.controller === reg.active ? reg.active : null;
}

/** Asks the service worker to cache every listed file; `progress` gets 0 to 100. True when all of them are cached. */
export async function warmUp(progress: (pct: number) => void): Promise<boolean> {
  try {
    const worker = await newest();
    if (!worker) return false;
    progress(0);
    return await new Promise<boolean>((done) => {
      const sw = navigator.serviceWorker;
      let quiet = 0;
      const finish = (ok: boolean) => {
        window.clearTimeout(quiet);
        sw.removeEventListener('message', heard);
        sw.removeEventListener('controllerchange', replaced);
        done(ok);
      };
      const wait = () => (window.clearTimeout(quiet), (quiet = window.setTimeout(() => finish(false), QUIET_MS)));
      // Another worker took over: its caches are new, so this run's copies may be gone. Report not ready.
      const replaced = () => finish(false);
      const heard = (e: MessageEvent) => {
        const m = e.data as { warm?: number | 'done'; ok?: boolean } | null;
        if (m?.warm === 'done') finish(!!m.ok);
        else if (typeof m?.warm === 'number') {
          progress(m.warm);
          wait();
        }
      };
      sw.addEventListener('message', heard);
      sw.addEventListener('controllerchange', replaced);
      sw.startMessages();
      wait();
      worker.postMessage({ type: 'warm' });
    });
  } catch (err) {
    console.warn('offline warm up failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
