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
 * MAP TILES ARE CACHED, UP TO A LIMIT -- and this reverses an earlier decision
 * of mine that was right about the danger and wrong about the conclusion.
 *
 * It used to say: tiles are large, there are thousands of them, and filling a
 * phone with a city's worth of map is not ours to do quietly. The first half is
 * still true and the last clause is the part that matters -- QUIETLY and
 * WITHOUT LIMIT. But refusing to cache them at all was the wrong answer, and
 * measuring the traffic showed why.
 *
 * One cold start pulls NINE tiles at zoom 14, about 378 kB. The picture of the
 * map and the geometry we use for walls come from the SAME tiles -- the style
 * tops out at zoom 14 and stretches -- so there is no second, larger stream
 * hiding behind the first. A zoom-14 tile is over two kilometres across, so
 * somebody walking their own neighbourhood asks for the same nine tiles every
 * single day, forever.
 *
 * A bounded cache turns that into a one-off. It is also the single biggest
 * lever on what this game would cost to run: see MONETIZATION.md.
 */

/* Bumping this wipes everything and starts fresh. */
const CACHE = 'geo-survivors-v2';

/** Map tiles live apart, so they can be capped without touching the app shell. */
const TILE_CACHE = 'geo-survivors-tiles-v1';

/**
 * The most tiles kept on the phone.
 *
 * A neighbourhood is about nine of them and each is roughly 40 kB, so 300 is
 * around 12 MB -- a couple of photographs, holding many neighbourhoods' worth of
 * ground. Small enough to be nobody's problem, large enough that a regular
 * walker downloads their own city once and never again.
 */
const MAX_TILES = 300;

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
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== CACHE && n !== TILE_CACHE).map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
      .then(() => warmTheShell())
  );
});

/**
 * Fetch the game's own code and keep it, immediately on taking over.
 *
 * Without this the offline promise had a hole in it that only showed up in the
 * exact case it exists for: everything worked because the app had ALREADY been
 * loaded normally at least once while this worker was in charge, and the
 * ordinary network-first path had quietly kept a copy on the way past.
 *
 * Somebody who installs the game and loses signal before their second visit had
 * nothing but a blank page: the shell list here names index.html but not the
 * code it pulls in, and those filenames change with every build, so they cannot
 * be listed by hand. So they are read out of the page itself.
 */
async function warmTheShell() {
  try {
    const cache = await caches.open(CACHE);
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response || response.status !== 200) return;
    await cache.put('/index.html', response.clone());

    const html = await response.text();
    const assets = new Set();
    // src="..." and href="..." pointing at our own build output.
    for (const match of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
      const path = match[1];
      if (path.startsWith('/assets/') || path.endsWith('.js') || path.endsWith('.css')) {
        assets.add(path);
      }
    }
    await Promise.all(
      [...assets].map((path) =>
        fetch(path)
          .then((r) => (r && r.status === 200 ? cache.put(path, r) : undefined))
          .catch(() => undefined)
      )
    );
  } catch {
    // No signal while activating. The ordinary path will catch up later.
  }
}

/**
 * A tile, from the phone if we have it, otherwise from the network and kept.
 *
 * The cap is enforced by throwing away the oldest entries, which for tiles is a
 * fair approximation of the least useful: caches keep insertion order, and the
 * places you stopped visiting are the ones you cached longest ago.
 */
async function tileFromCacheOrNetwork(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      await cache.put(request, response.clone());
      void trimTiles(cache);
    }
    return response;
  } catch (error) {
    // No signal and never been here. Nothing to show but the failure.
    return Response.error();
  }
}

async function trimTiles(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_TILES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Someone else's server. Leave it entirely alone.
  if (url.origin !== self.location.origin) return;

  // The map: serve from the phone when we have it, and keep what we fetch.
  //
  // Cache FIRST here, unlike everything else, and deliberately. A tile of a
  // street is not like our code: the buildings do not move, so a copy from last
  // week is as good as a copy from now, and asking again costs the player their
  // data and us our bandwidth for an identical answer.
  if (url.pathname.startsWith('/maptiles')) {
    event.respondWith(tileFromCacheOrNetwork(request));
    return;
  }

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
