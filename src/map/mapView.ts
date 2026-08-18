/**
 * THE MAP ON SCREEN.
 * ==================
 * This file owns the MapLibre map: creating it, keeping it pointed at the
 * player, and drawing the two things M1 needs on top of it --
 *   - a dot for where you are, and
 *   - a soft circle showing how unsure the GPS is.
 *
 * In M2 the game entities stop being map markers and become a proper drawing
 * layer inside the map. This file is where that will plug in.
 */

// MapLibre v6 has no default export -- everything is imported by name.
import { Map as MapLibreMap, Marker, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { activeBasemap } from '../config/basemap';
import { TUNING } from '../config/tuning';
import type { LatLng } from '../location/geo';
import { offsetByMetres } from '../location/geo';

/** Ids for the things we add to the map, kept in one place to avoid typos. */
const ACCURACY_SOURCE_ID = 'gps-accuracy-source';
const ACCURACY_FILL_ID = 'gps-accuracy-fill';
const ACCURACY_LINE_ID = 'gps-accuracy-line';

export class MapView {
  readonly map: MapLibreMap;

  private playerMarker: Marker | null = null;
  private rawMarker: Marker | null = null;

  /** Whether the map should keep re-centring itself on the player. */
  private followPlayer = true;

  /** Set once the map has finished loading and it is safe to add layers. */
  private ready = false;
  private pendingAccuracy: { centre: LatLng; radiusMetres: number } | null = null;

  constructor(containerId: string, startAt: LatLng) {
    this.map = new MapLibreMap({
      container: containerId,
      style: activeBasemap.styleUrl,
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

    // If the user drags the map themselves, stop chasing them around --
    // otherwise the map would snap back and feel broken.
    this.map.on('dragstart', () => {
      this.followPlayer = false;
    });

    this.map.on('load', () => {
      this.ready = true;
      this.installAccuracyLayer();
      if (this.pendingAccuracy) {
        this.updateAccuracyCircle(this.pendingAccuracy.centre, this.pendingAccuracy.radiusMetres);
        this.pendingAccuracy = null;
      }
    });
  }

  /** Resolves once the map has actually loaded its style. */
  whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => this.map.once('load', () => resolve()));
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

  private installAccuracyLayer(): void {
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
