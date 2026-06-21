// Epong AI Service Worker — enables PWA + offline cache
const CACHE_NAME = 'epong-ai-v1'
const STATIC_ASSETS = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Only cache GET requests, skip API calls (they need real-time data)
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return
  }
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((res) => {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
            return res
          })
          .catch(() => cached)
    )
  )
})
