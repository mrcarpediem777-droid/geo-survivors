/**
 * THE MAP ON SCREEN.
 * ==================
 * This file owns the MapLibre map: creating it, keeping it pointed at the
 * player, and drawing the two things M1 needs on top of it --
 *   - a dot for where you are, and
 *   - a soft circle showing how unsure the GPS is.
 *
 * It also WATCHES ITSELF. A map that fails to draw shows a blank white screen
 * and explains nothing, which is useless to everybody -- to a player on a bad
 * connection and to us trying to work out what went wrong. So this file keeps a
 * running record of what worked and what did not (`getDiagnostics`), and quietly
 * falls back to a second map provider if the first one will not load.
 *
 * In M2 the game entities stop being map markers and become a proper drawing
 * layer inside the map. This file is where that will plug in.
 */

// MapLibre v6 has no default export -- everything is imported by name.
import { Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * THE BACKGROUND WORKER -- and why this three-line block matters enormously.
 * =========================================================================
 * A "worker" is a second thread the browser runs alongside the page. MapLibre
 * uses one to unpack map data without freezing the screen, and it does ALL tile
 * decoding there. No worker means no tiles -- and, cruelly, no error either:
 * requests go out and results simply never come back.
 *
 * By default MapLibre looks for its worker in a file sitting next to itself.
 * That works when you use MapLibre straight from the internet, but our build
 * tool bundles everything into one file with a scrambled name, so the worker
 * file it looks for does not exist. On the live site it was a plain 404.
 *
 * This was invisible during development, because there the original files are
 * still lying around where MapLibre expects them. It only broke once deployed --
 * which is exactly the sort of bug that eats a week if you are not looking for it.
 *
 * `?worker&url` tells the build tool: bundle this worker AND everything it needs
 * into one self-contained file, then give me its real address. We hand that
 * address to MapLibre, and it stops guessing.
 */
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);

import {
  activeBasemap,
  BASEMAPS,
  throughMirror,
  mirroredStyleUrl,
  type BasemapOption,
} from '../config/basemap';
import { TUNING } from '../config/tuning';
import type { LatLng } from '../location/geo';
import { offsetByMetres } from '../location/geo';

/** Ids for the things we add to the map, kept in one place to avoid typos. */
const ACCURACY_SOURCE_ID = 'gps-accuracy-source';
const ACCURACY_FILL_ID = 'gps-accuracy-fill';
const ACCURACY_LINE_ID = 'gps-accuracy-line';

/** Dev-only overlay showing what the game treats as a wall. */
const WALL_SOURCE_ID = 'debug-walls-source';
const WALL_FILL_ID = 'debug-walls-fill';
const WALL_LINE_ID = 'debug-walls-line';

/** Everything we know about whether the map is actually working. */
export interface MapDiagnostics {
  /** Does this phone support the graphics system the map needs? */
  webgl2: boolean;
  webglDetail: string;
  /** Which map provider we ended up using. */
  basemap: string;
  /** Are we routing map data through our own website? */
  usingMirror: boolean;
  /** Has the map recipe file downloaded and been understood? */
  styleLoaded: boolean;
  /** Has the map drawn even one frame? */
  firstRenderDone: boolean;
  tilesRequested: number;
  tilesLoaded: number;
  /** Whatever the map complained about, most recent last. */
  errors: string[];
  /** Does the phone think it has an internet connection at all? */
  online: boolean;
  zoom: number;
  secondsSinceStart: number;
}

/**
 * Check for WebGL2 -- the graphics system the map needs to draw anything.
 *
 * WHY THIS MATTERS: MapLibre version 5 and above simply will not run without it.
 * Most phones from about 2017 onward have it, but some older Android phones,
 * some budget phones, and some cut-down browsers do not. When it is missing the
 * map draws nothing whatsoever and you get a plain white screen -- which we must
 * be able to tell apart from "the internet is slow", because the fixes are
 * completely different.
 */
export function checkWebGL2(): { ok: boolean; detail: string } {
  try {
    const probe = document.createElement('canvas');
    if (probe.getContext('webgl2')) return { ok: true, detail: 'WebGL2 available' };
    if (probe.getContext('webgl')) {
      return { ok: false, detail: 'Only WebGL1 — this phone or browser is too old for the map' };
    }
    return { ok: false, detail: 'No WebGL at all — graphics may be switched off in browser settings' };
  } catch (error) {
    return { ok: false, detail: `WebGL check failed: ${String(error)}` };
  }
}

export class MapView {
  readonly map: MapLibreMap;

  private playerMarker: Marker | null = null;
  private rawMarker: Marker | null = null;

  /** Whether the map should keep re-centring itself on the player. */
  private followPlayer = true;

  /** Set once the style has loaded and it is safe to add layers. */
  private ready = false;
  private pendingAccuracy: { centre: LatLng; radiusMetres: number } | null = null;

  /* --- self-diagnosis --- */
  private basemap: BasemapOption = activeBasemap;
  private webgl = checkWebGL2();
  private firstRenderDone = false;
  private tilesRequested = 0;
  private tilesLoaded = 0;
  private errors: string[] = [];
  private startedAtMs = Date.now();
  private triedBackup = false;
  private useMirror = false;
  /**
   * Once the game starts, the game camera drives the map every frame and this
   * file must stop nudging it too -- two things steering one camera produces a
   * fight that shows up as stutter.
   */
  private cameraDrivenByGame = false;
  private onMirrorEnabledCallback: (() => void) | null = null;

  /**
   * @param startWithMirror  skip straight to routing map data through our own
   *   website. We remember this between sessions, so a player on a network that
   *   blocks the map servers does not have to sit through the 12-second
   *   discovery every single time they open the game.
   */
  constructor(containerId: string, startAt: LatLng, startWithMirror = false) {
    // Some providers are simply slow when talked to directly, so for those we go
    // through our own site from the outset rather than discovering it the hard
    // way. See `preferMirror` in the basemap config for the measurements.
    this.useMirror = startWithMirror || this.basemap.preferMirror;

    this.map = new MapLibreMap({
      container: containerId,
      style: this.useMirror ? mirroredStyleUrl(this.basemap) : this.basemap.styleUrl,
      center: [startAt.lng, startAt.lat],
      zoom: TUNING.camera.startZoom,
      pitch: TUNING.camera.pitch,
      minZoom: TUNING.camera.minZoom,
      maxZoom: TUNING.camera.maxZoom,

      // Rotating the map makes a swarm game much harder to read, and we want
      // "up on screen" to always mean the same thing. Off.
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,

      // The map's own attribution control is small and we are legally required
      // to credit OpenStreetMap, so leave it on.
      attributionControl: { compact: true },

      // Do not let a double-tap zoom fight with the joystick in M2.
      doubleClickZoom: false,

      // EVERY request the map makes passes through here first -- the style file,
      // every tile, the icons, the fonts. When mirror mode is on we rewrite each
      // one to go through our own website. This is the only place that needs to
      // know about it, which is why it works even for addresses written inside
      // the style file itself.
      transformRequest: (url: string) => {
        if (!this.useMirror) return { url };
        return { url: throughMirror(this.basemap, url) };
      },
    });

    this.wireUpDiagnostics();

    // If the user drags the map themselves, stop chasing them around --
    // otherwise the map would snap back and feel broken.
    this.map.on('dragstart', () => {
      this.followPlayer = false;
    });

    // `styledata` fires on first load AND after any style switch, so putting the
    // accuracy circle here means it survives a fallback to the backup provider.
    this.map.on('styledata', () => {
      this.ready = true;
      this.ensureAccuracyLayer();
      if (this.pendingAccuracy) {
        this.updateAccuracyCircle(this.pendingAccuracy.centre, this.pendingAccuracy.radiusMetres);
        this.pendingAccuracy = null;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Watching whether the map actually works                             */
  /* ------------------------------------------------------------------ */

  private wireUpDiagnostics(): void {
    this.map.on('error', (event) => {
      const message = event?.error?.message ?? String(event?.error ?? 'unknown map error');
      // Keep only the last handful; a broken tile server produces hundreds.
      this.errors.push(message);
      if (this.errors.length > 8) this.errors.shift();
      console.warn('[map]', message);
    });

    this.map.on('dataloading', (event) => {
      if (event.dataType === 'source' && 'tile' in event) this.tilesRequested++;
    });

    this.map.on('data', (event) => {
      if (event.dataType === 'source' && 'tile' in event) this.tilesLoaded++;
    });

    this.map.once('render', () => {
      this.firstRenderDone = true;
    });
  }

  getDiagnostics(): MapDiagnostics {
    return {
      webgl2: this.webgl.ok,
      webglDetail: this.webgl.detail,
      basemap: this.basemap.label,
      usingMirror: this.useMirror,
      styleLoaded: this.map.isStyleLoaded() === true,
      firstRenderDone: this.firstRenderDone,
      tilesRequested: this.tilesRequested,
      tilesLoaded: this.tilesLoaded,
      errors: [...this.errors],
      online: navigator.onLine,
      zoom: this.map.getZoom(),
      secondsSinceStart: Math.round((Date.now() - this.startedAtMs) / 1000),
    };
  }

  /**
   * Is the map genuinely broken, as opposed to merely slow?
   * "Broken" means it has had a fair amount of time and has still drawn nothing.
   */
  looksBroken(): boolean {
    if (!this.webgl.ok) return true;
    if ((Date.now() - this.startedAtMs) / 1000 < 12) return false; // still a fair chance
    return this.tilesLoaded === 0 || !this.map.isStyleLoaded();
  }

  /**
   * Watch the map, try the backup provider once if the first one fails, and call
   * back only if it is still broken after that -- so the UI can explain it.
   */
  onTrouble(callback: (diagnostics: MapDiagnostics) => void): void {
    // A phone with no WebGL2 will never work. Say so immediately; waiting is cruel.
    if (!this.webgl.ok) {
      setTimeout(() => callback(this.getDiagnostics()), 500);
      return;
    }

    // Recovery ladder, cheapest and most likely fix first. We only bother the
    // player once every rung has failed.
    //   1. route everything through our own website (beats a network that
    //      silently swallows requests to the map servers)
    //   2. try the other map provider entirely (beats one provider being down)
    //   3. give up and explain
    const timer = setInterval(() => {
      if (!this.looksBroken()) {
        if (this.tilesLoaded > 0) clearInterval(timer); // it worked; stop watching
        return;
      }
      if (!this.useMirror) {
        this.switchToMirror();
        return;
      }
      if (!this.triedBackup) {
        this.switchToBackupBasemap();
        return;
      }
      clearInterval(timer);
      callback(this.getDiagnostics());
    }, 4000);
  }

  /**
   * Stop talking to the map provider directly and route everything through our
   * own website instead.
   *
   * This is the fix for a network that accepts our website but silently swallows
   * requests to the map servers -- observed for real on a mobile network in
   * Da Nang, where tile requests simply hung with no error of any kind.
   */
  private switchToMirror(): void {
    if (this.useMirror) return;
    this.useMirror = true;

    console.warn('[map] direct tiles did not arrive, routing through our own site');
    this.errors.push('switched to same-origin mirror');

    this.resetLoadCounters();
    // Re-fetching the style makes every follow-up request go through
    // transformRequest again, so tiles, icons and fonts all get mirrored too.
    this.map.setStyle(mirroredStyleUrl(this.basemap));

    // Let whoever cares remember this, so next launch skips the discovery.
    this.onMirrorEnabledCallback?.();
  }

  /** Be told when we had to fall back to the mirror, so it can be remembered. */
  onMirrorEnabled(callback: () => void): void {
    this.onMirrorEnabledCallback = callback;
  }

  isUsingMirror(): boolean {
    return this.useMirror;
  }

  /** Judge each new attempt on its own merits, not the failed one before it. */
  private resetLoadCounters(): void {
    this.tilesRequested = 0;
    this.tilesLoaded = 0;
    this.startedAtMs = Date.now();
  }

  /**
   * Swap to the second map provider. Same OpenStreetMap data, different company's
   * servers -- so if the first is unreachable from this country, or simply down,
   * this has a good chance of working.
   */
  private switchToBackupBasemap(): void {
    if (this.triedBackup) return;
    this.triedBackup = true;

    const backup = BASEMAPS.versatiles;
    if (!backup || backup.id === this.basemap.id) return;

    console.warn('[map] primary basemap did not load, switching to backup:', backup.label);
    this.errors.push(`switched to backup provider: ${backup.label}`);
    this.basemap = backup;

    this.resetLoadCounters();
    // Keep mirroring if that is how we got here -- the backup provider is just
    // as likely to be unreachable on a network that blocked the first one.
    this.map.setStyle(this.useMirror ? mirroredStyleUrl(backup) : backup.styleUrl);
  }

  /** Which map provider are we currently using? */
  currentBasemap(): BasemapOption {
    return this.basemap;
  }

  /** Resolves once the map has actually loaded its style. */
  whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => this.map.once('styledata', () => resolve()));
  }

  /* ------------------------------------------------------------------ */
  /* The player dot                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Move (or create) the blue dot showing the smoothed anchor position.
   * This is the position the game trusts.
   */
  setAnchorPosition(position: LatLng): void {
    // With no rope, the character and your real position are the same point, so
    // drawing both put two dots on top of each other. The game's own layer draws
    // the blue dot; this one steps aside.
    if (TUNING.leash.radiusMetres <= 0) {
      if (this.followPlayer && !this.cameraDrivenByGame) {
        this.map.easeTo({ center: [position.lng, position.lat], duration: 450 });
      }
      return;
    }

    if (!this.playerMarker) {
      this.playerMarker = new Marker({
        element: buildAnchorRing(),
      })
        .setLngLat([position.lng, position.lat])
        .addTo(this.map);
    } else {
      this.playerMarker.setLngLat([position.lng, position.lat]);
    }

    // Before the game starts we gently follow the anchor ourselves. Once the
    // game camera takes over it does all the following, and we keep out of it.
    if (this.followPlayer && !this.cameraDrivenByGame) {
      // `easeTo` glides rather than jumping. A jumping map is unreadable.
      this.map.easeTo({
        center: [position.lng, position.lat],
        duration: 450,
      });
    }
  }

  /**
   * Show the unsmoothed GPS reading as a small grey dot, so you can SEE the
   * smoothing working. Dev mode only.
   */
  setRawPosition(position: LatLng | null): void {
    if (!position) {
      this.rawMarker?.remove();
      this.rawMarker = null;
      return;
    }
    if (!this.rawMarker) {
      this.rawMarker = new Marker({
        element: buildDot('#9ca3af', 9, 'none'),
      })
        .setLngLat([position.lng, position.lat])
        .addTo(this.map);
    } else {
      this.rawMarker.setLngLat([position.lng, position.lat]);
    }
  }

  /* ------------------------------------------------------------------ */
  /* The accuracy circle                                                 */
  /* ------------------------------------------------------------------ */

  /** Add the circle layers if they are not already there (survives style swaps). */
  private ensureAccuracyLayer(): void {
    if (this.map.getSource(ACCURACY_SOURCE_ID)) return;

    this.map.addSource(ACCURACY_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: ACCURACY_FILL_ID,
      type: 'fill',
      source: ACCURACY_SOURCE_ID,
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.12 },
    });

    this.map.addLayer({
      id: ACCURACY_LINE_ID,
      type: 'line',
      source: ACCURACY_SOURCE_ID,
      paint: { 'line-color': '#3b82f6', 'line-opacity': 0.35, 'line-width': 1 },
    });
  }

  /**
   * Draw a circle of a given real-world radius in metres.
   *
   * We build it as an actual ring of points rather than asking the map for a
   * circle, because a map circle is measured in screen pixels -- it would stay
   * the same size on screen as you zoom, which is the opposite of what we want.
   * This one is measured in real metres and grows as you zoom in, like it should.
   */
  updateAccuracyCircle(centre: LatLng, radiusMetres: number): void {
    if (!this.ready) {
      this.pendingAccuracy = { centre, radiusMetres };
      return;
    }
    const source = this.map.getSource<GeoJSONSource>(ACCURACY_SOURCE_ID);
    if (!source) return;

    const STEPS = 48;
    const ring: [number, number][] = [];
    for (let i = 0; i <= STEPS; i++) {
      const angle = (i / STEPS) * Math.PI * 2;
      const point = offsetByMetres(
        centre,
        Math.cos(angle) * radiusMetres,
        Math.sin(angle) * radiusMetres
      );
      ring.push([point.lng, point.lat]);
    }

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      ],
    });
  }

  /* ------------------------------------------------------------------ */
  /* Camera                                                              */
  /* ------------------------------------------------------------------ */

  /** Start chasing the player again after they dragged the map away. */
  recentre(on: LatLng): void {
    this.followPlayer = true;
    this.map.easeTo({
      center: [on.lng, on.lat],
      zoom: Math.max(this.map.getZoom(), TUNING.camera.startZoom),
      duration: 700,
    });
  }

  isFollowing(): boolean {
    return this.followPlayer;
  }

  /**
   * Draw the outlines the game is actually using as walls, on top of the map.
   *
   * This is how you check M3 with your own eyes: the highlighted shapes should
   * sit exactly on the buildings the map has drawn. If they are offset, or if a
   * building you can see has no outline, that is the bug -- and it is much
   * easier to spot than to reason about.
   */
  showWallOverlay(ringsAsLngLat: number[][][]): void {
    const data = {
      type: 'FeatureCollection' as const,
      features: ringsAsLngLat.map((ring) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      })),
    };

    const existing = this.map.getSource<GeoJSONSource>(WALL_SOURCE_ID);
    if (existing) {
      existing.setData(data);
      return;
    }

    this.map.addSource(WALL_SOURCE_ID, { type: 'geojson', data });
    this.map.addLayer({
      id: WALL_FILL_ID,
      type: 'fill',
      source: WALL_SOURCE_ID,
      paint: { 'fill-color': '#f43f5e', 'fill-opacity': 0.22 },
    });
    this.map.addLayer({
      id: WALL_LINE_ID,
      type: 'line',
      source: WALL_SOURCE_ID,
      paint: { 'line-color': '#f43f5e', 'line-width': 1.5, 'line-opacity': 0.85 },
    });
  }

  /** Take the wall overlay away again. */
  hideWallOverlay(): void {
    for (const id of [WALL_FILL_ID, WALL_LINE_ID]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource(WALL_SOURCE_ID)) this.map.removeSource(WALL_SOURCE_ID);
  }

  hasWallOverlay(): boolean {
    return !!this.map.getSource(WALL_SOURCE_ID);
  }

  /** Hand the camera over to the game loop. */
  handCameraToGame(): void {
    this.cameraDrivenByGame = true;
  }
}

/**
 * The ring showing where you REALLY are, as opposed to the solid disc showing
 * the character you steer. Keeping these two visually distinct matters: the gap
 * between them IS the leash, and being able to see it is how the whole idea
 * becomes understandable rather than confusing.
 */
function buildAnchorRing(): HTMLDivElement {
  const element = document.createElement('div');
  element.style.width = '22px';
  element.style.height = '22px';
  element.style.borderRadius = '50%';
  element.style.border = '2.5px solid rgba(59,130,246,0.95)';
  element.style.background = 'rgba(59,130,246,0.14)';
  element.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.55)';
  return element;
}

/**
 * Build the little coloured circle used for map markers.
 * Placeholder art, exactly as the brief asks -- real art comes much later.
 */
function buildDot(colour: string, sizePx: number, ringShadow: string): HTMLDivElement {
  const element = document.createElement('div');
  element.style.width = `${sizePx}px`;
  element.style.height = `${sizePx}px`;
  element.style.borderRadius = '50%';
  element.style.background = colour;
  element.style.border = '2px solid rgba(255,255,255,0.9)';
  element.style.boxShadow = ringShadow;
  return element;
}
