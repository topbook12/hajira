/**
 * Hajira service worker — deliberately minimal and SAFE.
 *
 * Attendance is real-time and location-bound, so we NEVER cache API
 * responses — a stale "is there a session?" answer would be worse than no
 * answer. What we do cache:
 *   - the app shell (HTML navigations): network-first, cache fallback
 *   - static assets (/_next/static, icons): cache-first (they are
 *     content-hashed, so "stale" is impossible in practice)
 *   - everything offline-tolerant: an /offline.html fallback page
 *
 * The installability requirement for "Add to Home Screen" is a manifest +
 * a registered fetch handler — both provided here.
 */

const CACHE = 'hajira-v1'
const SHELL = ['/', '/offline.html']
const STATIC_PATTERNS = ['/_next/static/', '/icons/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // Cache the shell best-effort — never block install on it.
      await Promise.allSettled(SHELL.map((url) => cache.add(url)))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return // POST check-ins / logins always hit the network

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 1) API: absolute freshness — passthrough, no cache, no fallback.
  if (url.pathname.startsWith('/api/')) return

  // 2) Navigations: network-first, fall back to cache, then offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          // Keep the latest shell copy around for offline opens.
          const cache = await caches.open(CACHE)
          cache.put('/', fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cached = await caches.match(req, { ignoreSearch: true })
          return cached || (await caches.match('/offline.html')) || Response.error()
        }
      })()
    )
    return
  }

  // 3) Hashed static assets + icons: cache-first (immutable in practice).
  if (STATIC_PATTERNS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        const fresh = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put(req, fresh.clone()).catch(() => {})
        return fresh
      })()
    )
  }

  // 4) Anything else (fonts, CDN GETs): plain network — browser handles it.
})
