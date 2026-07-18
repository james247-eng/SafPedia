const STATIC_CACHE = 'kbw-academy-static-v1';
const DYNAMIC_CACHE = 'kbw-academy-dynamic-v1';
const IMAGE_CACHE = 'kbw-academy-images-v1';
const API_CACHE = 'kbw-academy-api-v1';

// Assets that should be available offline immediately
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/about-us.html',
  '/all-courses.html',
  '/blog.html',
  '/blog-post.html',
  '/sign-in.html',
  '/sign-up.html',
  '/css/home.css',
  '/css/chatBot.css',
  '/css/about-us.css',
  '/css/all-courses.css',
  '/css/blog-page.css',
  '/js/script.js',
  '/js/auth.js',
  '/js/profile-handler.js',
  '/js/pwa.js',
  '/js/pwa-install-ui.js',
  '/favicon/android-chrome-192x192.png',
  '/favicon/android-chrome-512x512.png',
  '/favicon/apple-touch-icon.png',
  '/favicon/favicon-32x32.png',
  '/favicon/favicon-16x16.png',
  '/favicon/favicon.ico',
  '/favicon/site.webmanifest'
];

// Helper: Cache falling back to network
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  
  try {
    const response = await fetch(request);
    if (!response || response.status !== 200 || response.type !== 'basic') return response;
    const clone = response.clone();
    cache.put(request, clone);
    return response;
  } catch (err) {
    return null;
  }
}

// Helper: Network falling back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (!response || response.status !== 200) throw new Error('Bad response');
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // For navigation, fall back to index.html
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return null;
  }
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (![STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE, API_CACHE].includes(key)) {
          return caches.delete(key);
        }
      })
    ))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // Handle different types of requests
  if (event.request.mode === 'navigate') {
    // Navigation: Network-first for HTML pages
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }
  
  if (url.pathname.startsWith('/api/') || url.pathname.includes('netlify/functions')) {
    // API calls: Network-first with 5-minute cache
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }
  
  if (event.request.destination === 'image') {
    // Images: Cache-first with network fallback
    event.respondWith(
      cacheFirst(event.request, IMAGE_CACHE)
        .then(response => response || fetch(event.request))
        .catch(() => caches.match('/favicon/android-chrome-192x192.png'))
    );
    return;
  }
  
  if (event.request.destination === 'script' || 
      event.request.destination === 'style' ||
      event.request.url.includes('/favicon/')) {
    // Static assets: Cache-first
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }
  
  // Everything else: Network-first falling back to cache
  event.respondWith(networkFirst(event.request, DYNAMIC_CACHE));
});
