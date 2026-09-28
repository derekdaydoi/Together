/* Together offline shell. Never cache authentication or private Supabase data. */
const ROOT = new URL(self.registration.scope).pathname
const CACHE = 'together-shell-v1'
const SHELL = [ROOT, `${ROOT}icon.svg`, `${ROOT}manifest.webmanifest`]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)))
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('together-shell-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]))
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  // Same-origin static assets and navigation only; remote user data is live.
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return
  if (request.mode !== 'navigate' && !/\.(?:js|css|svg|png|webmanifest)$/.test(url.pathname)) return
  // Invitation and auth callback parameters must never enter Cache Storage.
  const cacheKey = request.mode === 'navigate' ? ROOT : request
  event.respondWith((async () => {
    try {
      const response = await fetch(request)
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE)
        await cache.put(cacheKey, response.clone())
      }
      return response
    } catch (error) {
      const cached = await caches.match(cacheKey)
      if (cached) return cached
      if (request.mode === 'navigate') {
        const shell = await caches.match(ROOT)
        if (shell) return shell
      }
      throw error
    }
  })())
})
