// Minigames Hub service worker: lets the app open offline and shows call alerts when the app is closed.
const CACHE = 'minigames-hub-v1';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png'])).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('/')))
  );
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused)) return;   // the app is on screen and already shows it
    await self.registration.showNotification(d.title || 'Minigames Hub', {
      body: d.body || 'Open the app',
      icon: '/icon-192.png', badge: '/icon-192.png',
      tag: d.tag || 'mh', renotify: true,
      requireInteraction: !!d.call,
      vibrate: d.call ? [600, 300, 600, 300, 600, 300, 600] : [200],
      data: { url: '/' }
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  }));
});
