// Bump CACHE when you deploy changes so phones pick up the new version.
const CACHE = 'wiwe-v3.0.0';
const SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'js/core.js', 'js/front.js', 'js/ops.js', 'js/admin.js', 'js/building.js', 'js/shifts.js', 'js/phone.js', 'manifest.json', 'img/icon-192.png', 'img/icon-512.png', 'img/logo.png', 'img/building.jpg'];
const SLOW_MS = 3000; // on a weak signal, stop waiting for the network after this long and use the saved copy

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// App files and the Firebase/font files they load: network first (so updates arrive), the saved
// copy when offline or when the network is too slow. Firebase data traffic is never touched;
// Firestore keeps its own offline copy.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const cdn = url.hostname === 'www.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !cdn) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(e.request);
    const fresh = fetch(e.request).then(res => {
      if (res && res.status === 200) cache.put(e.request, res.clone());
      return res;
    });
    if (!saved) return fresh.catch(() => cache.match('index.html'));
    const slow = new Promise(resolve => setTimeout(() => resolve(saved), SLOW_MS));
    return Promise.race([fresh.catch(() => saved), slow]);
  })());
});
