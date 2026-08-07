const CACHE_NAME = 'silsilah-bani-kuzari-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache API cuma mendukung request GET. Request method lain (POST/PUT/dll —
  // termasuk semua panggilan tulis ke Firestore) harus dibiarkan lewat langsung
  // ke network tanpa disentuh cache, kalau tidak "cache.put()" akan gagal dengan
  // TypeError: Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported.
  if (event.request.method !== 'GET') {
    return; // biarkan browser menangani request ini secara normal (tidak di-intercept)
  }

  // Network-first untuk file utama, fallback ke cache saat offline
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
