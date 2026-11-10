// Minimal service worker so Chrome lets you "Install app" (full-screen, no address bar).
// Network-first: always loads the latest version when online.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const c = r.clone(); caches.open('booth').then(cache => cache.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request))
  );
});
