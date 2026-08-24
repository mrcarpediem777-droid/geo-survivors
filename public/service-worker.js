/*
 * THE OFFLINE HELPER.
 * ===================
 * A small program the phone keeps even after the game is closed. Its whole job
 * is to answer requests when the network cannot: you walk into a lift, round the
 * back of a building, or onto a street with no signal, and the game keeps
 * running instead of turning into a browser error page.
 *
 * THE RULE THAT MATTERS MOST HERE: never trap somebody on an old version.
 *
 * The classic way this goes wrong is caching the app and serving the cache
 * first, forever -- so a player keeps playing a build from three weeks ago and
 * every fix we deploy is invisible to them. Nothing here is ever served from the
 * cache while the network is answering. The cache is a safety net, not a
 * shortcut, and the small delay of asking the network first is worth far more
 * than the milliseconds it costs.
 *
 * MAP TILES ARE DELIBERATELY NOT CACHED HERE. They are large, there are
 * thousands of them, and the browser already keeps its own copies. Filling a
 * phone's storage with a city's worth of map is not ours to do quietly.
 */

/* Bumping this wipes everything and starts fresh. */
const CACHE = 'geo-survivors-v1';

/* Enough to open the game with no signal at all. Hashed asset names are added
 * as they are fetched, because their names change with every build. */
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A failure here must never stop the worker installing: a missing file
      // would otherwise leave the player with no offline support at all AND no
      // explanation. Better a partial net than none.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Someone else's server, or the map. Leave it entirely alone.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/maptiles')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep a copy of anything that came back properly, so the next walk
        // through a dead spot still works. Opaque and error responses are not
        // worth storing -- they would only be served back as failures later.
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // A page request with nothing cached for it: fall back to the game's
        // own page rather than the browser's dinosaur.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
