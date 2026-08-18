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
    attribution: '© OpenStreetMap contributors, © OpenFreeMap',
    notes: 'Free forever, no key. Good building coverage wherever OSM has it.',
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
    attribution: '© OpenStreetMap contributors, © Versatiles',
    notes: 'Independent backup provider in case OpenFreeMap has an outage.',
  },
};

/**
 * >>> CHANGE THIS ONE LINE TO SWITCH MAP PROVIDER <<<
 */
export const ACTIVE_BASEMAP_ID = 'liberty';

export const activeBasemap: BasemapOption = BASEMAPS[ACTIVE_BASEMAP_ID];
