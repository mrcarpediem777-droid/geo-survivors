/**
 * WHERE THE WALLS COME FROM.
 * ==========================
 * This file fetches real building outlines for the patch of world around the
 * player, and hands them on as plain lists of corner coordinates.
 *
 * WHY WE FETCH THE MAP DATA OURSELVES INSTEAD OF ASKING THE MAP FOR IT
 * MapLibre can be asked what buildings it has, but only for what it is currently
 * drawing on screen. That is the wrong shape for a game:
 *   - the brief wants collision worked out ONCE per region, not per frame;
 *   - we need walls slightly beyond the edge of the screen, so monsters do not
 *     walk through a house that is just out of view;
 *   - and it would tie the rules of the game to whatever the camera happens to
 *     be looking at, which is a strange and fragile thing to depend on.
 * So we ask the map server for the same data directly. The files are already in
 * the browser's cache from drawing the map, so this is nearly free.
 *
 * WHAT A "TILE" IS
 * Map data is cut into square tiles, like a chessboard laid over the world. To
 * know the buildings near a point, we work out which squares that point's
 * neighbourhood falls into, fetch those squares, and read the buildings out.
 *
 * A NOTE ON TILE EDGES -- this one bit us
 * Squares are delivered with a little overlap, so a building near a join appears
 * in BOTH neighbouring squares, clipped slightly differently in each. Keeping
 * both copies gives two almost-identical walls sitting on top of each other, and
 * a player pushed out of one lands inside the other and cannot escape. Measured:
 * 20 of 120 buildings trapped a character this way.
 *
 * The fix is to give each building exactly one owner: we keep it only in the
 * square its middle falls into. The full outline is preserved either way, since
 * the overlap means the owning square already holds the whole shape.
 */

import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

import { activeBasemap } from '../config/basemap';

/**
 * Which zoom's tiles we read buildings from.
 *
 * The map data stops at zoom 14 -- that is the most detailed version that
 * exists, and everything more zoomed-in on screen is just that same data drawn
 * bigger. So 14 is both the best we can get and the right thing to ask for.
 */
export const BUILDING_TILE_ZOOM = 14;

/** What a ring represents, since water and buildings block movement alike. */
export type ObstacleKind = 'building' | 'water';

/** One building: a closed loop of longitude/latitude corners. */
export interface BuildingRing {
  kind: ObstacleKind;
  /** Corner coordinates, flattened as lng, lat, lng, lat, ... */
  coords: Float64Array;
  /** Bounding box, so we can reject far-away buildings cheaply. */
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** Which square of the world-wide grid a coordinate falls into. */
export function tileForLngLat(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

/**
 * The geographic edges of one square.
 *
 * Needed because squares are delivered with a little overlap: a building near an
 * edge is included in BOTH neighbouring squares, clipped differently in each. We
 * keep each building only in the square its middle falls into, which removes the
 * duplicates exactly, with no guessing about which near-identical copy to drop.
 */
export function tileBounds(x: number, y: number, zoom: number) {
  const n = 2 ** zoom;
  const lngAt = (tx: number) => (tx / n) * 360 - 180;
  const latAt = (ty: number) => {
    const t = Math.PI - (2 * Math.PI * ty) / n;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t)));
  };
  return { west: lngAt(x), east: lngAt(x + 1), north: latAt(y), south: latAt(y + 1) };
}

/** Roughly how many metres across one tile is at this latitude. */
export function tileWidthMetres(lat: number, zoom: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Build the web address of one tile, with the mirror applied if we are using it.
 * The `{z}/{x}/{y}` placeholders are the standard way tile servers name squares.
 */
function tileUrl(x: number, y: number, zoom: number, useMirror: boolean): string {
  const template = activeBasemap.tileUrlTemplate;
  const direct = template
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

  if (!useMirror) return direct;
  if (!direct.startsWith(activeBasemap.tileOrigin)) return direct;
  return activeBasemap.mirrorPath + direct.slice(activeBasemap.tileOrigin.length);
}

export class BuildingSource {
  /** Tiles we have already fetched, so we never ask twice. */
  private cache = new Map<string, BuildingRing[]>();

  /** Tiles currently being fetched, so two requests do not race. */
  private inFlight = new Map<string, Promise<BuildingRing[]>>();

  private useMirror: boolean;

  /** Purely for the dev readout. */
  stats = {
    tilesFetched: 0,
    tilesFailed: 0,
    tilesEmpty: 0,
    buildingsParsed: 0,
    /** Copies of buildings that belong to a neighbouring square. */
    duplicatesDropped: 0,
  };

  constructor(useMirror: boolean) {
    this.useMirror = useMirror;
  }

  setUseMirror(useMirror: boolean): void {
    if (this.useMirror === useMirror) return;
    this.useMirror = useMirror;
    // Anything we already have is still valid -- only the address changed.
  }

  /**
   * Every building within roughly `radiusMetres` of a point.
   *
   * Fetches whatever tiles it needs and remembers them, so walking around the
   * neighbourhood gets cheaper the longer you play.
   */
  async buildingsNear(
    lng: number,
    lat: number,
    radiusMetres: number
  ): Promise<BuildingRing[]> {
    const zoom = BUILDING_TILE_ZOOM;
    const centre = tileForLngLat(lng, lat, zoom);

    // How many squares out we must look. One tile is several kilometres across,
    // so this is almost always just the one square plus its neighbours.
    const reach = Math.max(1, Math.ceil(radiusMetres / tileWidthMetres(lat, zoom)));

    const wanted: Promise<BuildingRing[]>[] = [];
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        wanted.push(this.tile(centre.x + dx, centre.y + dy, zoom));
      }
    }

    const groups = await Promise.all(wanted);
    return groups.flat();
  }

  /** Fetch and parse one tile, or return the copy we already have. */
  private tile(x: number, y: number, zoom: number): Promise<BuildingRing[]> {
    const key = `${zoom}/${x}/${y}`;

    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = this.fetchTile(x, y, zoom)
      .then((rings) => {
        this.cache.set(key, rings);
        this.inFlight.delete(key);
        return rings;
      })
      .catch(() => {
        // A missing tile is normal -- oceans and empty countryside have none.
        // Remember the emptiness so we do not keep asking.
        this.stats.tilesFailed++;
        this.cache.set(key, []);
        this.inFlight.delete(key);
        return [] as BuildingRing[];
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  private async fetchTile(x: number, y: number, zoom: number): Promise<BuildingRing[]> {
    const response = await fetch(tileUrl(x, y, zoom, this.useMirror));
    if (!response.ok) throw new Error(`tile ${zoom}/${x}/${y}: HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    this.stats.tilesFetched++;

    // A nearly-empty response means a square with nothing in it. Not an error.
    if (bytes.length < 64) {
      this.stats.tilesEmpty++;
      return [];
    }

    const tile = new VectorTile(new PbfReader(bytes));
    const bounds = tileBounds(x, y, zoom);

    const rings: BuildingRing[] = [];
    let droppedAsDuplicate = 0;

    // Buildings and water both stop things moving, so they are read the same way
    // and only differ by the label we attach.
    const sources: [string, ObstacleKind][] = [
      [activeBasemap.buildingSourceLayer, 'building'],
      [activeBasemap.waterSourceLayer, 'water'],
    ];

    for (const [layerName, kind] of sources) {
    const layer = tile.layers[layerName];
    if (!layer) continue;

    for (let i = 0; i < layer.length; i++) {
      // `toGeoJSON` converts the tile's own compact numbering into real
      // longitude and latitude for us.
      const feature = layer.feature(i).toGeoJSON(x, y, zoom);
      const geometry = feature.geometry;

      const polygons =
        geometry.type === 'Polygon'
          ? [geometry.coordinates]
          : geometry.type === 'MultiPolygon'
            ? geometry.coordinates
            : [];

      for (const polygon of polygons) {
        // Only the outer loop matters. Courtyards and light wells are holes in
        // the middle of a building, and a player can never reach them anyway.
        const outer = polygon[0];
        if (!outer || outer.length < 4) continue;

        const coords = new Float64Array(outer.length * 2);
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;
        let sumLng = 0;
        let sumLat = 0;

        for (let p = 0; p < outer.length; p++) {
          const [plng, plat] = outer[p] as [number, number];
          coords[p * 2] = plng;
          coords[p * 2 + 1] = plat;
          sumLng += plng;
          sumLat += plat;
          if (plng < minLng) minLng = plng;
          if (plng > maxLng) maxLng = plng;
          if (plat < minLat) minLat = plat;
          if (plat > maxLat) maxLat = plat;
        }

        // Does this building "belong" to this square? If its middle lies in a
        // neighbouring square, that square will supply it, and keeping our
        // clipped copy too would leave two overlapping walls -- which pushes a
        // player out of one and straight into the other, trapping them.
        const middleLng = sumLng / outer.length;
        const middleLat = sumLat / outer.length;
        if (
          middleLng < bounds.west ||
          middleLng >= bounds.east ||
          middleLat > bounds.north ||
          middleLat <= bounds.south
        ) {
          droppedAsDuplicate++;
          continue;
        }

        rings.push({ kind, coords, minLng, minLat, maxLng, maxLat });
      }
    }
    }

    this.stats.buildingsParsed += rings.length;
    this.stats.duplicatesDropped += droppedAsDuplicate;
    return rings;
  }

  /** How many tiles we are holding on to. Dev readout only. */
  cachedTileCount(): number {
    return this.cache.size;
  }
}
