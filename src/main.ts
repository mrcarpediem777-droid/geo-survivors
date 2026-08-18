/**
 * THE STARTING POINT.
 * ===================
 * This is the first file that runs when the game opens. Its whole job is to
 * create the four big pieces and introduce them to each other:
 *
 *   Profile        what you own and what you have set     (src/profile/)
 *   PlayerLocation where you are in the real world        (src/location/)
 *   MapView        the real map on the screen             (src/map/)
 *   Hud            the small interface drawn over the map (src/ui/)
 *
 * Deliberately kept thin. Wiring lives here; nothing else does.
 */

import { Profile } from './profile/profile';
import { PlayerLocation } from './location/playerLocation';
import { MapView } from './map/mapView';
import { Hud } from './ui/hud';
import { showMapTrouble } from './ui/mapTrouble';
import { Game } from './game/game';
import type { LatLng } from './location/geo';

/**
 * ARE THE CHEAT TOOLS SWITCHED ON?
 *
 * `import.meta.env.DEV` is true only while you run the game on your own computer
 * with `npm run dev`. It is ALWAYS false in the version we put on the internet.
 *
 * The second half lets us deliberately turn dev tools on for a deployed test
 * build by setting VITE_ENABLE_DEV_TOOLS to "true" in the Vercel dashboard.
 * We will not set it, so the public game has no dev tools at all -- and because
 * the import below is inside an `if`, the build tool physically deletes the dev
 * panel code from the finished game rather than merely hiding it.
 */
const DEV_TOOLS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true';

/**
 * Where the map looks before we know anything about the player.
 * Only ever visible for a second or two, and only on a very first visit --
 * after that we reopen wherever you were last time.
 */
const FALLBACK_START: LatLng = { lat: 15.8801, lng: 108.338 }; // Hoi An, Vietnam

async function boot(): Promise<void> {
  const uiContainer = document.getElementById('ui')!;

  // 1. WHAT THE PLAYER OWNS ------------------------------------------------
  const profile = new Profile();

  // 2. THE MAP -------------------------------------------------------------
  const startAt = profile.get().lastKnownPosition ?? FALLBACK_START;
  // If this network needed the mirror last time, start with it rather than
  // rediscovering the hard way.
  const mapView = new MapView('map', startAt, profile.get().useTileMirror);

  // ...and if we discover it now, remember it for next time.
  mapView.onMirrorEnabled(() => profile.update({ useTileMirror: true }));

  // 3. WHERE THE PLAYER IS -------------------------------------------------
  const location = new PlayerLocation();

  // 3b. WATCH THE MAP ------------------------------------------------------
  // If the map cannot draw, say why on screen instead of leaving a white
  // rectangle. This tries the backup map provider first, and only complains if
  // that fails too. A real player on a bad connection gets this as well.
  mapView.onTrouble((diagnostics) => showMapTrouble(uiContainer, diagnostics));

  // 4. THE GAME ------------------------------------------------------------
  // Everything that moves: the entity pool, the drawing layer welded into the
  // map, the leashed character, the joystick and the combat camera.
  const game = new Game(mapView.map, uiContainer, startAt, mapView.isUsingMirror());

  // The game banks essence into the profile and reads permanent upgrades back
  // out of it, so it needs the handle before anything can be cleared.
  game.profile = profile;

  // 5. THE INTERFACE -------------------------------------------------------
  const hud = new Hud(uiContainer, () => {
    const anchor = location.current().anchor;
    if (anchor) {
      mapView.recentre(anchor);
      game.camera.resume(); // start following again after a manual drag
    }
  });

  // Whenever the position changes, update everything that cares about it.
  location.subscribe((state) => {
    hud.render(state);

    if (state.anchor) {
      mapView.setAnchorPosition(state.anchor);
      game.setAnchor(state.anchor);

      // The circle shows how unsure we are. On real GPS that is what the phone
      // reports; on fake GPS it is our own smoothing uncertainty.
      const radius =
        state.source === 'fake-gps-dev'
          ? location.smoothingUncertaintyMetres()
          : state.accuracyMetres;
      mapView.updateAccuracyCircle(state.anchor, radius);

      // Remember where we were, so the map opens here next time.
      profile.update({ lastKnownPosition: { ...state.anchor } });
    }

    // Only show the raw jittery GPS dot while dev tools are on -- it would
    // just confuse a real player.
    mapView.setRawPosition(DEV_TOOLS_ENABLED ? state.raw : null);
  });

  // Keep the "centre on me" button in sync with whether the map is following.
  setInterval(() => {
    const lost = game.camera.isSuspended() || !mapView.isFollowing();
    hud.setRecentreVisible(lost && location.current().anchor !== null);
  }, 400);

  // 6. START THE GAME LOOP -------------------------------------------------
  // Wait for the map's style before adding our drawing layer to it -- there is
  // nothing to add a layer TO until the style exists.
  // Hand the camera over IMMEDIATELY, not after the map finishes loading. A GPS
  // fix can easily arrive first, and then this file starts a gentle glide toward
  // the anchor at the same moment the game camera starts driving every frame --
  // two things steering one camera, which shows up as a hard jerk.
  mapView.handCameraToGame();

  void mapView.whenReady().then(() => {
    game.start();
  });

  // 7. START THE GPS -------------------------------------------------------
  // Start asking for the location IMMEDIATELY -- do not wait for the map to
  // finish drawing first. Two reasons:
  //   - Getting a GPS fix takes several seconds, and the map takes several
  //     seconds; doing them at the same time rather than one after the other
  //     roughly halves how long you stare at a blank screen.
  //   - If the map somehow never finishes loading (bad signal, phone put the
  //     tab to sleep), waiting for it would mean the game never asks for your
  //     location at all. Anything that arrives early is queued and drawn once
  //     the map is ready.
  location.startRealGps();

  // 8. DEV TOOLS -- see the long comment above -----------------------------
  if (DEV_TOOLS_ENABLED) {
    const { installDevTools } = await import('./ui/devPanel');
    installDevTools(uiContainer, mapView, location, profile, game);

    // Also hang the game's pieces off the browser's debug console, so problems
    // can be poked at directly. Same rule as the panel: stripped from the real build.
    (window as unknown as Record<string, unknown>).__geo = {
      mapView,
      location,
      profile,
      // Lets us open the "map did not load" screen on demand to check it reads
      // well, without having to break the internet first.
      showMapTrouble: () => showMapTrouble(uiContainer, mapView.getDiagnostics()),
      game,
    };
  }
}

boot().catch((error) => {
  // If something goes badly wrong before the game starts, say so on screen
  // rather than leaving a blank rectangle.
  console.error('[boot] the game failed to start', error);
  document.body.innerHTML = `
    <div style="padding:24px;font:14px/1.6 system-ui,sans-serif;color:#e6edf3">
      <h1 style="font-size:18px;margin-bottom:8px">The game could not start</h1>
      <p style="color:#9fb3c8">Please tell Claude what this says:</p>
      <pre style="margin-top:10px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.06);white-space:pre-wrap">${String(
        error
      )}</pre>
    </div>`;
});
