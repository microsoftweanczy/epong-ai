// Epong AI Service Worker v3 — force clear ALL old caches + immediate takeover
const CACHE_NAME = 'epong-ai-v3'

// On install: skip waiting immediately (don't wait for old SW to die)
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// On activate: DELETE ALL old caches + claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Delete EVERY cache (including v1, v2, v3-old)
      return Promise.all(keys.map((k) => caches.delete(k)))
    }).then(() => {
      // Take control of ALL clients immediately
      return self.clients.claim()
    }).then(() => {
      // Notify all clients to reload
      return self.clients.matchAll()
    }).then((clients) => {
      clients.forEach((client) => client.navigate(client.url))
    })
  )
})

// On fetch: ALWAYS go to network first (never serve stale cache)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache fresh response for offline use only
        const clone = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return res
      })
      .catch(() => caches.match(event.request))
  )
})
