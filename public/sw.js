// Epong AI Service Worker — PWA support without breaking Next.js HMR/dev.
//
// Strategy:
//  - Navigations (HTML documents): NETWORK-FIRST. Always fetch the freshest HTML
//    from the network; only fall back to cache when offline. This prevents stale
//    HTML referencing old chunk hashes (which 404 and freeze the app).
//  - Next.js chunks (_next/static/chunks/): NOT INTERCEPTED. Turbopack/Next.js
//    already serves them with immutable cache headers + content-hashed filenames,
//    so caching them in the SW only causes stale-HTML-reference bugs after edits.
//  - API requests: NOT INTERCEPTED (real-time data).
//  - Static brand assets (icons, manifest): CACHE-FIRST (they never change).
const CACHE_VERSION = 'epong-ai-v2'
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.ico',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  )
  // Take over immediately so old SWs don't keep serving stale caches.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        // Tell all open tabs to reload so they pick up the new SW + fresh HTML.
        self.clients.matchAll({ type: 'window' }).then((clients) =>
          clients.forEach((c) => {
            try {
              c.postMessage({ type: 'SW_UPDATED' })
            } catch {}
          })
        )
      )
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Only handle GET.
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Skip cross-origin requests entirely (Supabase, image optimizer on other hosts, etc.)
  if (url.origin !== self.location.origin) return

  // Skip API routes — they need real-time data.
  if (url.pathname.startsWith('/api/')) return

  // Skip Next.js chunks — Turbopack handles their caching via hashed filenames +
  // immutable Cache-Control headers. Caching them here causes stale-HTML bugs.
  if (url.pathname.startsWith('/_next/static/chunks/')) return
  if (url.pathname.startsWith('/_next/webpack-hmr')) return

  // Navigation requests (HTML page loads) → NETWORK-FIRST.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache a fresh copy for offline fallback.
          const clone = res.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone))
          return res
        })
        .catch(() =>
          // Offline → serve cached HTML (or a minimal fallback).
          caches.match(req).then(
            (cached) =>
              cached ||
              new Response(
                '<!doctype html><meta charset=utf-8><title>Offline</title><p>Anda sedang offline. Hubungkan internet lalu muat ulang.</p>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              )
          )
        )
    )
    return
  }

  // Static brand assets → CACHE-FIRST (immutable).
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/logo.svg'
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const clone = res.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone))
            return res
          })
      )
    )
    return
  }

  // Everything else (e.g. /_next/image optimizer): let the browser handle it.
  // Do NOT call event.respondWith — pass through to default.
})
