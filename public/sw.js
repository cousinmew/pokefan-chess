// SPDX-License-Identifier: AGPL-3.0-only
// Offline app shell (§B18 item 2) and the sprite cache (load fix). Sprites and other files under assets/ are served
// cache first from a cache named after the build, so a revisit shows them at once and a deploy starts fresh.
// Everything else same origin goes to the network first, with the cache as offline fallback. The relay (another
// origin) is never touched. Progress lives in localStorage.
const BUILD = '__BUILD__';
const CACHE = 'pfc-shell-v1';
const SPRITES = `pfc-assets-${BUILD}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

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

const keep = (cache, req, res) => {
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    void caches.open(cache).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.open(SPRITES).then(async (c) => (await c.match(req)) ?? fetch(req).then((res) => keep(SPRITES, req, res))));
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => keep(CACHE, req, res))
      .catch(async () => (await caches.match(req)) ?? (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
  );
});
