/**
 * GEO MATHS -- converting between "map coordinates" and "metres".
 * ==============================================================
 * The map speaks in latitude/longitude (degrees). The game speaks in metres.
 * This file translates between the two.
 *
 * A note on accuracy: the Earth is round, so this conversion is only exact for a
 * single point. We cheat by treating the small patch of world around the player
 * as flat. Over the ~1 km the game ever cares about, the error is centimetres.
 */

/** A point on the Earth, the way the map likes it. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** How many metres are in one degree of latitude. Same everywhere on Earth. */
const METRES_PER_DEGREE_LAT = 111320;

/**
 * How many metres are in one degree of longitude AT A GIVEN LATITUDE.
 * Longitude lines squeeze together as you approach the poles, so this shrinks:
 * at the equator one degree is ~111 km, in Iceland it is ~55 km.
 */
export function metresPerDegreeLng(atLatitude: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((atLatitude * Math.PI) / 180);
}

/**
 * Straight-line distance between two points, in metres.
 */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const midLat = (a.lat + b.lat) / 2;
  const dx = (b.lng - a.lng) * metresPerDegreeLng(midLat);
  const dy = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  return Math.hypot(dx, dy);
}

/**
 * Move a point by a number of metres east and north.
 * Used by the leash, by monster movement, and by the fake-GPS arrow keys.
 */
export function offsetByMetres(from: LatLng, eastMetres: number, northMetres: number): LatLng {
  return {
    lat: from.lat + northMetres / METRES_PER_DEGREE_LAT,
    lng: from.lng + eastMetres / metresPerDegreeLng(from.lat),
  };
}

/**
 * How many metres of real ground fit across the screen at a given map zoom.
 * This is how we check that "combat zoom" really does show 60-80 metres.
 *
 * The formula is the standard web-map one: at zoom 0 the whole world is 256
 * pixels wide, and every zoom level doubles that.
 */
export function metresAcrossScreen(zoom: number, latitude: number, screenWidthPx: number): number {
  const earthCircumferenceMetres = 40075016.686;
  const metresPerPixel =
    (earthCircumferenceMetres * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return metresPerPixel * screenWidthPx;
}
