const CACHE_NAME = 'legocontroller-offline-v1';
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
const scopedUrl = path => new URL(path, self.registration.scope).toString();

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_SHELL.map(scopedUrl)))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(scopedUrl('./index.html'), copy));
        }
        return response;
      })
      .catch(() => caches.match(scopedUrl('./index.html'))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response && response.ok) {
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    });
  }));
});
