const BASE_PATH = self.location.pathname.replace(/sw\.js$/, '');

const CACHE_NAME = 'shopeasy-v2'

const STATIC_ASSETS = [
  'index.html',
  'login.html',
  'register.html',
  'shop.html',
  'cart.html',
  'account.html',
  'offline.html',
  'manifest.json',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
].map(path => BASE_PATH + path)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
       )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  
  // Never cache Firebase API or local API calls
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('cloudfunctions.net') ||
      url.hostname.includes('paychangu') ||
      url.pathname.startsWith('/api/')) {
    return
  }
  
  // Cache-first for static assets
  if (STATIC_ASSETS.includes(url.pathname) || 
      url.pathname.includes('/css/') ||
      url.pathname.includes('/js/') ||
      url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request)
          .then(response => {
            const clone = response.clone()
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, clone))
            return response
          })
      })
    )
    return
  }
  
  // Network-first for HTML pages
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(BASE_PATH + 'offline.html'))
    )
    return
  }
  
  // Cache-first for Firebase Storage images
  if (url.hostname.includes('storage.googleapis.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone))
          return response
        })
      })
    )
  }
})
