const CACHE_NAME = 'legocontroller-offline-v2';

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./img/favicon.svg",
  "./img/single-motor-body.svg",
  "./img/single-motor-shaft.svg",
  "./img/controller.svg",
  "./img/single-motor.svg",
  "./img/double-motor.svg",
  "./img/color-sensor.svg",
  "./img/essential-hub.svg",
  "./img/prime-hub.svg",
  "./img/technic-hub.svg",
  "./img/city-hub.svg",
  "./img/boost-hub.svg",
  "./img/remote-controller.svg",
  "./img/spike_motor_icon.svg",
  "./img/force_sensor_icon.svg",
  "./img/color_sensor_icon.svg",
  "./img/distance_sensor_icon.svg",
  "./img/matrix_icon.svg",
  "./img/hub_light_icon.svg",
  "./img/spike_prime_hub.svg"
];

const REMOTE_ARTWORK = [
  "https://blockcode.alorak.com/img/single-motor-body.png",
  "https://blockcode.alorak.com/img/single-motor-shaft.png",
  "https://blockcode.alorak.com/img/controller.png",
  "https://blockcode.alorak.com/img/single-motor.png",
  "https://blockcode.alorak.com/img/double-motor.png",
  "https://blockcode.alorak.com/img/color-sensor.png",
  "https://blockcode.alorak.com/img/essential-hub.png",
  "https://blockcode.alorak.com/img/prime-hub.png",
  "https://blockcode.alorak.com/img/technic-hub.png",
  "https://blockcode.alorak.com/img/city-hub.png",
  "https://blockcode.alorak.com/img/boost-hub.png",
  "https://blockcode.alorak.com/img/remote_controller_icon.png",
  "https://blockcode.alorak.com/img/spike_motor_icon.png",
  "https://blockcode.alorak.com/img/force_sensor_icon.png",
  "https://blockcode.alorak.com/img/color_sensor_icon.png",
  "https://blockcode.alorak.com/img/distance_sensor_icon.png",
  "https://blockcode.alorak.com/img/matrix_icon.png",
  "https://blockcode.alorak.com/img/hub_light_icon.png",
  "https://blockcode.alorak.com/img/spike_prime_hub.png"
];
const BLOCKCODE_ORIGIN = 'https://blockcode.alorak.com';
const scopedUrl = path => new URL(path, self.registration.scope).toString();

async function cacheRemoteArtwork(cache) {
  await Promise.allSettled(REMOTE_ARTWORK.map(async url => {
    const response = await fetch(new Request(url, { mode: 'no-cors', cache: 'reload' }));
    await cache.put(url, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await cache.addAll(APP_SHELL.map(scopedUrl));
        await cacheRemoteArtwork(cache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isBlockCodeArtwork = url.origin === BLOCKCODE_ORIGIN && url.pathname.startsWith('/img/');

  if (isBlockCodeArtwork) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        });
      })
    );
    return;
  }

  if (!isSameOrigin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(scopedUrl('./index.html'), copy));
          }
          return response;
        })
        .catch(() => caches.match(scopedUrl('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
