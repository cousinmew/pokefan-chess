// SPDX-License-Identifier: AGPL-3.0-only
// Getting ready for offline play (owner, 12 Oct). The page itself loads before the service worker controls it, so
// after an install the first offline launch could miss the bundle, the engine or the puzzle chunks. The build writes
// offline.json (vite.config.ts) with the core same origin files. The service worker caches them itself, into its own
// build's caches (sw.js, review fix): the page only asks the newest worker and listens for its progress, so an update
// arriving meanwhile cannot delete a half warmed cache under it. Same origin only.
const CONTROL_WAIT_MS = 10000;
/** No word from the worker for this long: give up (it was stopped, or a newer one replaced it). */
const QUIET_MS = 60000;
/** How long the worker has to say whether it is ready (an older sw.js never answers). */
const ASK_MS = 5000;

/** The parts of the Network Information API read here (Chromium only; Safari and Firefox have none). */
export interface Connection {
  saveData?: boolean;
  effectiveType?: string;
}

/** Data saver on, or a 2G connection: no automatic warm up of about 8 MB (considerate warm up). Unknown: false. */
export const sparing = (c: Connection | null | undefined): boolean => c?.saveData === true || c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g';

/** A service worker and Cache Storage, outside ?debug: getting ready for offline can work here. */
export const warmable = (): boolean => 'serviceWorker' in navigator && 'caches' in window && !new URLSearchParams(location.search).has('debug');

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

/** readyBuild's answer when a worker is registered but none controls the page (a hard reload): nothing could be
 * asked, which is not the same as "not ready" (N4, 14 Oct). */
export const UNKNOWN = 'unknown';

/** The newest active service worker of this page's registration, once it controls the page; null when there is none,
 * UNKNOWN when one is registered but nothing controls the page. `quick`: no wait for a controller when the active
 * worker has finished activating, as it claimed every page it will then (sw.js clients.claim in activate): a hard
 * reload gets none, and the check answered only after 10 s (review, 14 Oct). Should its controllerchange come after
 * all, pwa.ts asks again. A warm up asked for keeps the wait. */
async function newest(quick = false): Promise<ServiceWorker | null | typeof UNKNOWN> {
  if (!warmable()) return null;
  const sw = navigator.serviceWorker;
  const reg = await sw.getRegistration();
  if (!reg) return null;
  await settled(reg);
  if (quick && !sw.controller && reg.active?.state === 'activated') return UNKNOWN;
  if (!sw.controller || sw.controller !== reg.active) {
    // A fresh worker claims the page right after it activates (sw.js clients.claim).
    await new Promise<void>((done) => {
      const t = window.setTimeout(done, CONTROL_WAIT_MS);
      sw.addEventListener('controllerchange', () => (window.clearTimeout(t), done()), { once: true });
    });
  }
  if (!sw.controller) return UNKNOWN;
  return reg.active && sw.controller === reg.active ? reg.active : null;
}

/** Asks the newest worker whether a complete warm up of its build is still in its cache (fix, 13 Oct: Chromium can
 * evict Cache Storage and keep localStorage). Resolves to that build when so; null when not, when there is no worker,
 * or when it does not answer (an older sw.js); UNKNOWN when a worker is registered but none controls the page (a hard
 * reload: ask again later). The worker names its build: the page's code carries none. */
export async function readyBuild(): Promise<string | null> {
  try {
    const worker = await newest(true);
    if (worker === UNKNOWN) return UNKNOWN;
    if (!worker) return null;
    return await new Promise<string | null>((done) => {
      const { port1, port2 } = new MessageChannel();
      const t = window.setTimeout(() => (port1.close(), done(null)), ASK_MS);
      port1.onmessage = (e: MessageEvent<{ ready?: boolean; build?: string } | null>) => {
        window.clearTimeout(t);
        port1.close();
        done(e.data?.ready === true && typeof e.data.build === 'string' ? e.data.build : null);
      };
      worker.postMessage({ type: 'ready?' }, [port2]);
    });
  } catch (err) {
    console.warn('offline check failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Asks the service worker to cache every listed file; `progress` gets 0 to 100 from the worker's first answer on (fix,
 * 13 Oct: nothing shows while no worker is found). Resolves to the worker's build when all of them are cached (the page
 * remembers it, src/pwa.ts), else null. */
export async function warmUp(progress: (pct: number) => void): Promise<string | null> {
  try {
    const worker = await newest();
    if (!worker || worker === UNKNOWN) return null;
    return await new Promise<string | null>((done) => {
      const sw = navigator.serviceWorker;
      let quiet = 0;
      const finish = (build: string | null) => {
        window.clearTimeout(quiet);
        sw.removeEventListener('message', heard);
        sw.removeEventListener('controllerchange', replaced);
        done(build);
      };
      const wait = () => (window.clearTimeout(quiet), (quiet = window.setTimeout(() => finish(null), QUIET_MS)));
      // Another worker took over: its caches are new, so this run's copies may be gone. Report not ready.
      const replaced = () => finish(null);
      const heard = (e: MessageEvent) => {
        const m = e.data as { warm?: number | 'done'; ok?: boolean; build?: string } | null;
        // An older sw.js sends no build: nothing to remember, the next launch asks again.
        if (m?.warm === 'done') finish(m.ok && typeof m.build === 'string' ? m.build : null);
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
    return null;
  }
}
