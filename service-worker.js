// service-worker.js — Application-shell caching & offline support
// Strategy:
//   - Pre-cache the app shell (HTML, CSS, JS, icons) on install.
//   - Runtime: cache-first for same-origin static assets; network-first for navigations
//     (with offline fallback to cached index.html).
//   - NEVER cache /download/* exports or backup files (they may contain sensitive data).
//   - Bump CACHE_VERSION on each release to trigger cleanup & refresh.

const CACHE_VERSION = 'emara-v1.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/forms.css',
  './css/reports.css',
  './css/responsive.css',
  './css/print.css',
  './js/app.js',
  './js/config.js',
  './js/router.js',
  './js/database.js',
  './js/migrations.js',
  './js/validation.js',
  './js/calculations.js',
  './js/ledger.js',
  './js/backup.js',
  './js/export.js',
  './js/notifications.js',
  './js/whatsapp.js',
  './js/ui.js',
  './js/modules/dashboard.js',
  './js/modules/buildings.js',
  './js/modules/apartments.js',
  './js/modules/residents.js',
  './js/modules/contracts.js',
  './js/modules/obligations.js',
  './js/modules/collections.js',
  './js/modules/expenses.js',
  './js/modules/maintenance.js',
  './js/modules/receipts.js',
  './js/modules/reports.js',
  './js/modules/resident-portal.js',
  './js/modules/settings.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/favicon.svg',
];

// Paths that must NEVER be cached (sensitive exports / backups).
const NEVER_CACHE_PATTERNS = [
  /\/download\//i,
  /emara-backup-/i,
  /\.csv$/i,
  /\/print\//i,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Use addAll with fallback so a single missing file doesn't break install
    try {
      await cache.addAll(APP_SHELL);
    } catch (err) {
      console.warn('[SW] Some app-shell assets failed to cache:', err);
      // Try individually
      for (const url of APP_SHELL) {
        try { await cache.add(url); } catch (_) {}
      }
    }
    // Activate immediately
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean up old caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    // Take control of all clients
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;

  // Skip cross-origin requests (e.g., Google Fonts handled by browser HTTP cache)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // NEVER intercept sensitive downloads / exports
  if (NEVER_CACHE_PATTERNS.some(p => p.test(url.pathname) || p.test(url.href))) {
    return; // Let the browser handle normally (will trigger a download)
  }

  // Navigation requests → network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match('./index.html') || await cache.match('./');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Same-origin static assets → cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) {
      // Refresh in background
      fetch(req).then(fresh => {
        if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
      }).catch(() => {});
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});

// Allow page to trigger immediate activation
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
