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
    buildingSourceLayer: 'building',
    vectorSourceId: 'openmaptiles',
    tileOrigin: 'https://tiles.openfreemap.org',
    mirrorPath: '/maptiles',
    attribution: '© OpenStreetMap contributors, © OpenFreeMap',
    notes:
      'Free forever, no key. Good building coverage wherever OSM has it. ' +
      'Served through Cloudflare -- measured serving from the Hong Kong edge, ' +
      'so it is fast from Vietnam and the rest of Southeast Asia.',
  },

  /**
   * BACKUP. Versatiles "Colorful". Same underlying OpenStreetMap data and the
   * same data layout, different servers. If OpenFreeMap ever goes down or gets
   * slow, switch ACTIVE_BASEMAP_ID below to 'versatiles' and everything keeps working.
   */
  versatiles: {
    id: 'versatiles',
    label: 'Versatiles Colorful (backup)',
    styleUrl: 'https://tiles.versatiles.org/assets/styles/colorful/style.json',
    buildingSourceLayer: 'building',
    vectorSourceId: 'versatiles-shortbread',
    tileOrigin: 'https://tiles.versatiles.org',
    mirrorPath: '/maptiles-backup',
    attribution: '© OpenStreetMap contributors, © Versatiles',
    notes:
      'Independent backup provider in case OpenFreeMap has an outage. ' +
      'CAUTION: plain nginx with no global CDN, so from Asia this is likely ' +
      'SLOWER than the default. It is a availability fallback, not a speed one.',
  },
};

/**
 * >>> CHANGE THIS ONE LINE TO SWITCH MAP PROVIDER <<<
 */
export const ACTIVE_BASEMAP_ID = 'liberty';

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
