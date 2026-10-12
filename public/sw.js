// SPDX-License-Identifier: AGPL-3.0-only
// Offline app shell (§B18 item 2) and the sprite cache (load fix). Sprites and other files under assets/ are served
// cache first from a cache named after the build, so a revisit shows them at once and a deploy starts fresh.
// Everything else same origin goes to the network first, with the cache as offline fallback. The relay (another
// origin) is never touched. Progress lives in localStorage. Install for offline play fetches offline.json's list
// through here (src/net/offline.ts), so each copy is written before the fetch event ends (waitUntil).
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
