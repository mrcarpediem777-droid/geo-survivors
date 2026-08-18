/**
 * THE MAP CONFIG FILE
 * ===================
 * This is the ONE file that decides which map the game draws.
 * If we ever need to switch map providers, we change it here and nowhere else.
 *
 * WHAT IS A "BASEMAP STYLE"?
 * It is a web address pointing at a recipe file that tells the map how to draw
 * roads, water, parks and buildings, and where to fetch the map data from.
 *
 * HARD REQUIREMENT -- DO NOT SWAP THIS FOR A PICTURE-BASED MAP:
 * The style must be a VECTOR style. Vector means the map arrives as actual
 * shapes with coordinates (this building is a rectangle at these corners),
 * not as flat photographs of a map. We NEED the real shapes, because in
 * milestone M3 the building shapes literally become the walls of the game.
 * A picture-based ("raster") map would look identical but would be useless --
 * we would have no idea where the buildings are.
 */

/** One selectable map provider. */
export interface BasemapOption {
  /** Short id used in code and saved settings. */
  id: string;
  /** Human name, shown in the dev panel. */
  label: string;
  /** The style recipe URL handed to MapLibre. */
  styleUrl: string;
  /**
   * Direct address of one data square, with {z}/{x}/{y} standing in for which
   * square. The game fetches these itself to work out where the walls are --
   * see `src/world/buildingSource.ts` for why it does not just ask the map.
   */
  tileUrlTemplate: string;
  /**
   * Do this provider's squares actually contain building outlines?
   * Measured, not assumed. When false, the game goes straight to generated
   * obstacles instead of hunting for walls that are not there.
   */
  hasBuildingGeometry: boolean;
  /**
   * The name of the layer inside the map data that holds building footprints.
   * M3 reads building shapes out of this. Both providers below use the
   * "OpenMapTiles" data layout, where that layer is simply called "building".
   */
  buildingSourceLayer: string;
  /** The id of the vector data source inside the style, needed to query shapes. */
  vectorSourceId: string;
  /**
   * The web address all of this provider's data comes from.
   *
   * WHY WE NEED THIS: some networks (a real example: a mobile network in Da Nang,
   * Vietnam) simply do not deliver anything from these addresses -- the requests
   * hang forever rather than failing, so you get a white screen and no error.
   * When that happens we re-route every single map request through our OWN
   * website instead, which those networks do allow. See `mirrorPath`.
   */
  tileOrigin: string;
  /**
   * The path on our own site that forwards to `tileOrigin`.
   * The forwarding itself is set up in `vercel.json` in the project root.
   */
  mirrorPath: string;
  /** Attribution we are legally required to show. */
  attribution: string;
  /**
   * Route this provider through our own site by default, rather than only
   * falling back to it when the direct route fails.
   *
   * Worth it when the provider has no global delivery network of its own: we
   * measured Versatiles at 1.7s a tile direct, and 0.4s through our site once
   * it is cached at an edge near the player.
   */
  preferMirror: boolean;
  /** Plain-language note for the designer. */
  notes: string;
}

export const BASEMAPS: Record<string, BasemapOption> = {
  /**
   * DEFAULT. OpenFreeMap "Liberty": free, no account, no API key, no usage limit,
   * built from OpenStreetMap data. Bright, readable, and has building shapes.
   */
  liberty: {
    id: 'liberty',
    label: 'OpenFreeMap Liberty (default)',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    // Note the dated portion: OpenFreeMap versions its data by build date, so
    // this address goes stale. It does not matter, because we never read
    // buildings from this provider -- it has almost none. See below.
    tileUrlTemplate: 'https://tiles.openfreemap.org/planet/20260802_080001_pt/{z}/{x}/{y}.pbf',
    hasBuildingGeometry: false,
    buildingSourceLayer: 'building',
    vectorSourceId: 'openmaptiles',
    tileOrigin: 'https://tiles.openfreemap.org',
    mirrorPath: '/maptiles',
    preferMirror: false,
    attribution: '© OpenStreetMap contributors, © OpenFreeMap',
    notes:
      'Fast (Cloudflare, measured serving from the Hong Kong edge) but MEASURED ' +
      'TO BE NEARLY EMPTY OF BUILDINGS: 55 per km2 in central London and 1.4 in ' +
      'Hoi An, against 1445 and 6900 in OpenStreetMap itself. Unusable for M3, ' +
      'where buildings are the level design. Kept only as a fallback for when ' +
      'the primary provider is unreachable -- a plain map beats no map.',
  },

  /**
   * BACKUP. Versatiles "Colorful". Same underlying OpenStreetMap data and the
   * same data layout, different servers. If OpenFreeMap ever goes down or gets
   * slow, switch ACTIVE_BASEMAP_ID below to 'versatiles' and everything keeps working.
   */
  versatiles: {
    id: 'versatiles',
    label: 'Versatiles Colorful (default)',
    styleUrl: 'https://tiles.versatiles.org/assets/styles/colorful/style.json',
    tileUrlTemplate: 'https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}',
    hasBuildingGeometry: true,
    // NOTE THE PLURAL. Versatiles uses a different data layout ("shortbread")
    // from OpenFreeMap, and its building layer is called `buildings`. Getting
    // this wrong means finding zero walls and blaming the wrong thing.
    buildingSourceLayer: 'buildings',
    vectorSourceId: 'versatiles-shortbread',
    tileOrigin: 'https://tiles.versatiles.org',
    mirrorPath: '/maptiles-backup',
    preferMirror: true,
    attribution: '© OpenStreetMap contributors, © Versatiles',
    notes:
      'THE PROVIDER WE ACTUALLY USE, because it is the one with the buildings. ' +
      'Measured: 1545 per km2 in central London, 2711 in Hoi An, 225 in Da Nang, ' +
      'with a median footprint of 76 m2 -- real houses, not just landmarks. ' +
      'It has no global CDN and is about 5x slower direct (1.7s vs 0.33s a tile), ' +
      'which is why we route it through our own site by default: measured 0.4s ' +
      'a tile once Vercel has it cached.',
  },
};

/**
 * >>> CHANGE THIS ONE LINE TO SWITCH MAP PROVIDER <<<
 *
 * Currently Versatiles, and the reason is worth remembering: it is the one that
 * actually contains building footprints. OpenFreeMap looks nicer and is faster,
 * but measurement showed its tiles carry under 4% of the buildings that exist in
 * OpenStreetMap -- and in this game the buildings ARE the level design.
 */
export const ACTIVE_BASEMAP_ID = 'versatiles';

export const activeBasemap: BasemapOption = BASEMAPS[ACTIVE_BASEMAP_ID];

/**
 * Rewrite one map request so it goes through our own website instead of straight
 * to the map provider.
 *
 * Example:
 *   https://tiles.openfreemap.org/planet/.../14/13116/7451.pbf
 *   becomes
 *   /maptiles/planet/.../14/13116/7451.pbf
 *
 * Anything not belonging to the provider is left completely alone.
 */
export function throughMirror(basemap: BasemapOption, url: string): string {
  if (!url.startsWith(basemap.tileOrigin)) return url;
  return basemap.mirrorPath + url.slice(basemap.tileOrigin.length);
}

/** The provider's own style file, but served via our website. */
export function mirroredStyleUrl(basemap: BasemapOption): string {
  return throughMirror(basemap, basemap.styleUrl);
}
