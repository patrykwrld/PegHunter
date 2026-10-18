// Offline support: app shell cache-first, price list network-first, scans never cached.
const VERSION = 'peghunter-v3';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/store.js', '/data/catalog.json',
  '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const networkFirst = async (req) => {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
};

const cacheFirst = async (req) => {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && new URL(req.url).origin === self.location.origin) (await caches.open(VERSION)).put(req, res.clone());
  return res;
};

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== self.location.origin) {
    // Google Fonts: serve from cache when offline.
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(networkFirst(request));
    return;
  }
  if (request.mode === 'navigate' || url.pathname.startsWith('/data/')) e.respondWith(networkFirst(request).then((r) => (r.type === 'error' ? caches.match('/index.html') : r)));
  else e.respondWith(cacheFirst(request));
});
