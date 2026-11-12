// Bump CACHE when you deploy changes so phones pick up the new version.
const CACHE = 'wiwe-v1.9.1';
const SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'js/core.js', 'js/front.js', 'js/ops.js', 'js/admin.js', 'js/building.js', 'js/shifts.js', 'manifest.json', 'img/icon-192.png', 'img/icon-512.png', 'img/logo.png', 'img/building.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// App files: network first (so updates arrive), cache as fallback when offline.
// Firebase traffic is never touched; Firestore keeps its own offline copy.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const cdn = url.hostname === 'www.gstatic.com' || url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!sameOrigin && !cdn) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
