/**
 * Oasis Pharmacy Service Worker
 * Versioned caching with update flow
 */

const CACHE_VERSION = 'v2.2.0';
const CACHE_NAME = `oasis-pharmacy-${CACHE_VERSION}`;

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// External resources to cache
const EXTERNAL_CACHE = [
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// API domains - always fetch from network, never cache
const API_DOMAINS = [
  'api.fda.gov',           // OpenFDA - medicine data
  'dailymed.nlm.nih.gov',  // DailyMed - FDA labels
  'rxnav.nlm.nih.gov',     // RxNorm - drug terminology
  'openfoodfacts.org',     // Open Food Facts - supplements
  'upcitemdb.com'          // UPC Database (legacy)
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${CACHE_NAME}`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching local assets');
        await cache.addAll(ASSETS_TO_CACHE);
        
        // Cache external resources separately (don't fail if they can't be fetched)
        console.log('[SW] Caching external assets');
        for (const url of EXTERNAL_CACHE) {
          try {
            await cache.add(url);
          } catch (e) {
            console.log('[SW] Could not cache external:', url);
          }
        }
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${CACHE_NAME}`);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('oasis-pharmacy-') && name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // For API requests, always go to network (medicine data must be fresh)
  const isAPIRequest = API_DOMAINS.some(domain => url.hostname.includes(domain));
  if (isAPIRequest) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For CDN resources (like html5-qrcode), use cache-first
  if (url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((response) => {
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
            return response;
          });
        })
    );
    return;
  }
  
  // Skip other cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached response and update in background
          fetchAndCache(event.request);
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        return fetch(event.request)
          .then((response) => {
            // Cache successful responses
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => {
            // Network failed, try to return cached index.html for navigation
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Background fetch and cache update
function fetchAndCache(request) {
  fetch(request)
    .then((response) => {
      if (response.status === 200) {
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, response));
      }
    })
    .catch(() => {
      // Ignore network errors during background update
    });
}

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'getVersion') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// Push notification handling (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'New notification',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      vibrate: [100, 50, 100],
      data: data.data || {}
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Oasis Pharmacy', options)
    );
  }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if no existing window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

console.log(`[SW] Service Worker loaded - ${CACHE_VERSION}`);
