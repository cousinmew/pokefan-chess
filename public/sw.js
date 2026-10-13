// SPDX-License-Identifier: AGPL-3.0-only
// Offline app shell (§B18 item 2) and the sprite cache (load fix). Sprites and other files under assets/ are served
// cache first from a cache named after the build, so a revisit shows them at once and a deploy starts fresh.
// Everything else same origin goes to the network first, with the cache as offline fallback. The relay (another
// origin) is never touched. Progress lives in localStorage. Install for offline play asks this worker to cache
// offline.json's list (src/net/offline.ts, the message handler below).
const BUILD = '__BUILD__';
const CACHE = 'pfc-shell-v1';
const SPRITES = `pfc-assets-${BUILD}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];
// Only same origin copies are kept, so a server's "Vary: Origin" must not split them: a module script asks with an
// Origin header, the warm up's fetch without one (vite preview sends Vary: Origin).
const ANY = { ignoreVary: true };

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SPRITES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const keep = (e, cache, req, res) => {
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    e.waitUntil(caches.open(cache).then((c) => c.put(req, copy)));
  }
  return res;
};

// Getting ready for offline (review fix): the worker itself fetches offline.json's list into this build's caches, so
// a newer worker taking over halfway can never delete what an older page warmed up. A file already cached is not
// downloaded again (considerate warm up): under assets/ when this build's cache has it, any other file when the shell
// cache has it (normal loads still go to the network first and refresh that copy). The page that asked gets
// { warm: n } at once (fix, 13 Oct: it shows progress only once a worker answers), then as files land, and
// { warm: 'done', ok, build } at the end, so it can remember which build is ready on this device; one run at a time,
// later askers join it. A complete run ends with READY in this build's cache: the page asks { type: 'ready?' } before
// it skips a warm up or says ready (Chromium can evict Cache Storage and keep localStorage), and the answer names this
// build, so the page's code carries no build id and its chunks keep their hashes from build to build.
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
  const sprites = await caches.open(SPRITES);
  const shell = await caches.open(CACHE);
  let done = 0, failed = 0, next = 0;
  const one = async (file) => {
    const url = new URL(file, self.registration.scope).href;
    const cache = new URL(url).pathname.includes('/assets/') ? sprites : shell;
    if (!(await cache.match(url, ANY))) {
      const r = await fetch(url).catch(() => null);
      if (r?.ok) await cache.put(url, r);
      else failed++;
    }
    tell({ warm: (pct = Math.floor((++done * 100) / files.length)) });
  };
  const lane = async () => {
    while (next < files.length) await one(files[next++]);
  };
  await Promise.all(Array.from({ length: PARALLEL }, lane));
  if (failed) return false;
  await sprites.put(READY, new Response(BUILD));
  return true;
}

self.addEventListener('message', (e) => {
  const port = e.ports[0];
  if (e.data?.type === 'ready?' && port) {
    e.waitUntil(caches.match(READY, { cacheName: SPRITES }).then((r) => port.postMessage({ ready: !!r, build: BUILD })));
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
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.open(SPRITES).then(async (c) => (await c.match(req, ANY)) ?? fetch(req).then((res) => keep(e, SPRITES, req, res))));
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => keep(e, CACHE, req, res))
      .catch(async () => (await caches.match(req, ANY)) ?? (req.mode === 'navigate' ? caches.match('./index.html', ANY) : Response.error())),
  );
});
