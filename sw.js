/**
 * Pharmacy Tracker - Service Worker v3.0.0
 * Handles offline caching and background sync
 */

const CACHE_VERSION = 'v3.0.3';
const CACHE_NAME = `pharmacy-tracker-${CACHE_VERSION}`;

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/favicon.ico',
  '/boots-icon-32.png',
  '/boots-icon-48.png',
  '/boots-icon-192.png',
  '/boots-icon-512.png',
  '/icon-152.png',
  '/boots-apple-touch-167.png',
  '/boots-apple-touch-180.png'
];

// External resources to cache
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// API domains - these should NOT be cached (always fetch fresh)
const API_DOMAINS = [
  'api.fda.gov',
  'dailymed.nlm.nih.gov',
  'rxnav.nlm.nih.gov',
  'openfoodfacts.org'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3.0.0...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v3.0.0...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('pharmacy-tracker-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests except for fonts and external scripts
  if (url.origin !== location.origin) {
    // Check if it's an API request - always fetch from network
    const isApiRequest = API_DOMAINS.some(domain => url.hostname.includes(domain));
    
    if (isApiRequest) {
      event.respondWith(fetch(event.request));
      return;
    }
    
    // For fonts and external scripts, try cache first
    if (url.hostname.includes('fonts.') || url.hostname.includes('unpkg.com')) {
      event.respondWith(
        caches.match(event.request)
          .then((response) => {
            if (response) return response;
            
            return fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse.ok) {
                  const clone = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, clone);
                  });
                }
                return networkResponse;
              });
          })
      );
      return;
    }
    
    return;
  }
  
  // For same-origin requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(event.request)
          .then((networkResponse) => {
            // Cache successful GET responses
            if (event.request.method === 'GET' && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, clone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Pharmacy Tracker Service Worker v3.0.0 loaded');
