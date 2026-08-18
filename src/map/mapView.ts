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
import { Map as MapLibreMap, Marker, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { activeBasemap, BASEMAPS, type BasemapOption } from '../config/basemap';
import { TUNING } from '../config/tuning';
import type { LatLng } from '../location/geo';
import { offsetByMetres } from '../location/geo';

/** Ids for the things we add to the map, kept in one place to avoid typos. */
const ACCURACY_SOURCE_ID = 'gps-accuracy-source';
const ACCURACY_FILL_ID = 'gps-accuracy-fill';
const ACCURACY_LINE_ID = 'gps-accuracy-line';

/** Everything we know about whether the map is actually working. */
export interface MapDiagnostics {
  /** Does this phone support the graphics system the map needs? */
  webgl2: boolean;
  webglDetail: string;
  /** Which map provider we ended up using. */
  basemap: string;
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

  constructor(containerId: string, startAt: LatLng) {
    this.map = new MapLibreMap({
      container: containerId,
      style: this.basemap.styleUrl,
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

    const timer = setInterval(() => {
      if (!this.looksBroken()) {
        if (this.tilesLoaded > 0) clearInterval(timer); // it worked; stop watching
        return;
      }
      // First failure: silently try the other provider before bothering anyone.
      if (!this.triedBackup) {
        this.switchToBackupBasemap();
        return;
      }
      clearInterval(timer);
      callback(this.getDiagnostics());
    }, 4000);
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

    // Reset the counters so the backup is judged on its own merits.
    this.tilesRequested = 0;
    this.tilesLoaded = 0;
    this.startedAtMs = Date.now();

    this.map.setStyle(backup.styleUrl);
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
    if (!this.playerMarker) {
      this.playerMarker = new Marker({
        element: buildDot('#3b82f6', 18, '0 0 0 3px rgba(59,130,246,0.35)'),
      })
        .setLngLat([position.lng, position.lat])
        .addTo(this.map);
    } else {
      this.playerMarker.setLngLat([position.lng, position.lat]);
    }

    if (this.followPlayer) {
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
