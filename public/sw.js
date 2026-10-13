// SPDX-License-Identifier: AGPL-3.0-only
// Offline app shell (§B18 item 2) and the sprite cache (load fix). Files under assets/ are served cache first:
// sprites, cries, trainers and items (assets/<folder>/...) from a cache named after the asset set, which keeps them
// across deploys while those files stay the same (N2, 14 Oct: their URLs never change); code chunks (assets/<file>)
// from a cache named after the build, so a deploy starts fresh. Everything else same origin goes to the network first,
// with the cache as offline fallback. The relay (another origin) is never touched. Progress lives in localStorage.
// Install for offline play asks this worker to cache offline.json's list (src/net/offline.ts, the message handler).
const BUILD = '__BUILD__';
const CACHE = 'pfc-shell-v1';
/** Sprites, cries, trainers and items: named after the asset set (vite.config.ts stampWorker hashes the file list). */
const ASSETS = 'pfc-assets-__ASSETS__';
/** Code chunks and the ready mark: this build's own. */
const CODE = `pfc-code-${BUILD}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];
// Only same origin copies are kept, so a server's "Vary: Origin" must not split them: a module script asks with an
// Origin header, the warm up's fetch without one (vite preview sends Vary: Origin).
const ANY = { ignoreVary: true };

/** The cache a same origin path is served from cache first, or null for network first (the shell). */
const cacheFor = (path) => (/\/assets\/[^/]+\//.test(path) ? ASSETS : /\/assets\/[^/]+$/.test(path) ? CODE : null);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

// Only caches this worker does not name go: an earlier build's code, an asset set that changed, older layouts.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== ASSETS && k !== CODE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const keep = (e, cache, req, res) => {
  if (res.ok && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    e.waitUntil(caches.open(cache).then((c) => c.put(req, copy)));
  }
  return res;
};

// An <audio> asks with a Range header, and a host such as GitHub Pages answers 206, which Cache Storage refuses (N2):
// the worker fetches the whole file once more, without the Range, and keeps that 200 copy.
const keepWhole = (e, cache, url) =>
  e.waitUntil(
    fetch(url)
      .then((res) => (res.status === 200 && res.type === 'basic' ? caches.open(cache).then((c) => c.put(url, res)) : undefined))
      .catch((err) => console.warn('kept no copy of', url, err && err.message)),
  );

/** A Range asked of a whole cached copy is answered with that part (206), as the network would. */
async function ranged(req, res) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (!m || res.status !== 200) return res;
  const body = await res.blob();
  const size = body.size;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const type = res.headers.get('Content-Type');
  return new Response(body.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: { ...(type ? { 'Content-Type': type } : {}), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
  });
}

// Getting ready for offline (review fix): the worker itself fetches offline.json's list into its caches, so a newer
// worker taking over halfway can never delete what an older page warmed up. A file already cached is not downloaded
// again (considerate warm up): under assets/ when its cache (the asset set's, or this build's for code) has it, any
// other file when the shell cache has it (normal loads still go to the network first and refresh that copy). The page
// that asked gets { warm: n } at once (fix, 13 Oct: it shows progress only once a worker answers), then as files land,
// and { warm: 'done', ok, build } at the end, so it can remember which build is ready on this device; one run at a
// time, later askers join it. A complete run ends with READY in this build's code cache: the page asks
// { type: 'ready?' } before it skips a warm up or says ready (Chromium can evict Cache Storage and keep localStorage),
// and the answer names this build, so the page's code carries no build id and its chunks keep their hashes from build
// to build. After a deploy with the same assets, a run fetches only the new build's code.
const PARALLEL = 4;
const READY = new URL('offline-ready', self.registration.scope).href;
let warming = null;
let pct = 0;
const asked = new Set();
const tell = (msg) => asked.forEach((c) => c.postMessage(msg));

async function warmUp() {
  const res = await fetch('offline.json', { cache: 'no-store' });
  if (!res.ok) return false;
  const { files } = await res.json();
  const open = { [ASSETS]: await caches.open(ASSETS), [CODE]: await caches.open(CODE), [CACHE]: await caches.open(CACHE) };
  let done = 0, failed = 0, next = 0;
  const one = async (file) => {
    const url = new URL(file, self.registration.scope).href;
    const cache = open[cacheFor(new URL(url).pathname) ?? CACHE];
    if (!(await cache.match(url, ANY))) {
      const r = await fetch(url).catch(() => null);
      if (r?.ok && r.status === 200) await cache.put(url, r);
      else failed++;
    }
    tell({ warm: (pct = Math.floor((++done * 100) / files.length)) });
  };
  const lane = async () => {
    while (next < files.length) await one(files[next++]);
  };
  await Promise.all(Array.from({ length: PARALLEL }, lane));
  if (failed) return false;
  await open[CODE].put(READY, new Response(BUILD));
  return true;
}

self.addEventListener('message', (e) => {
  const port = e.ports[0];
  if (e.data?.type === 'ready?' && port) {
    e.waitUntil(caches.match(READY, { cacheName: CODE }).then((r) => port.postMessage({ ready: !!r, build: BUILD })));
    return;
  }
  if (e.data?.type !== 'warm' || !e.source) return;
  asked.add(e.source);
  if (!warming) {
    pct = 0;
    warming = warmUp()
      .catch(() => false)
      .then((ok) => (tell({ warm: 'done', ok, build: BUILD }), asked.clear(), (warming = null), ok));
  }
  e.source.postMessage({ warm: pct });
  e.waitUntil(warming);
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const cache = cacheFor(url.pathname);
  if (cache) {
    e.respondWith(
      caches.open(cache).then(async (c) => {
        const hit = await c.match(req, ANY);
        if (hit) return ranged(req, hit);
        const res = await fetch(req);
        if (res.status === 206) keepWhole(e, cache, req.url); // never the part: the whole file
        else keep(e, cache, req, res);
        return res;
      }),
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => keep(e, CACHE, req, res))
      .catch(async () => (await caches.match(req, ANY)) ?? (req.mode === 'navigate' ? caches.match('./index.html', ANY) : Response.error())),
  );
});
