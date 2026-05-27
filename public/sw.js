// DecoShop PWA - Custom Workbox Service Worker
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (self.workbox) {
  console.log('🎉 Workbox loaded successfully in DecoShop SW');

  // Cache static pages & assets
  self.workbox.routing.registerRoute(
    ({ request }) =>
      request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'font',
    new self.workbox.strategies.StaleWhileRevalidate({
      cacheName: 'decoshop-static-assets',
      plugins: [
        new self.workbox.expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Days
        }),
      ],
    })
  );

  // Cache brand image assets (icons, favicons, logos)
  self.workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new self.workbox.strategies.CacheFirst({
      cacheName: 'decoshop-images',
      plugins: [
        new self.workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
      ],
    })
  );

  // Cache layout frameworks
  self.workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/_next/static/'),
    new self.workbox.strategies.StaleWhileRevalidate({
      cacheName: 'nextjs-chunks',
    })
  );

  // Offline fallback message: If offline, notify browser
  self.addEventListener('install', () => {
    self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });
} else {
  console.warn('⚡ Workbox failed to load in SW. Running plain worker.');
}
