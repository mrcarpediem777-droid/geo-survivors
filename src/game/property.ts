/**
 * OWNING A BUILDING.
 * ==================
 * The first thing in this game that belongs to a REAL PLACE rather than to a
 * position. A tower is a gun you put somewhere; a building is the corner shop.
 *
 * THE PRICE IS CALCULATED, NEVER STORED -- and that is the whole trick.
 *
 * Every phone works out what a building is worth from its own footprint: how
 * big it is and where it sits. Same building, same answer, everywhere, with
 * nobody coordinating. So when this becomes a game about buying things off each
 * other, a server never has to hold a catalogue of prices for every building on
 * Earth. It only has to remember the handful that somebody actually bought, and
 * what they paid.
 *
 * That is the same rule the nests already follow, and it is the difference
 * between a backend that costs twenty dollars a month and one that costs a
 * thousand. See MONETIZATION.md.
 *
 * WHAT IT IS NOT, YET. Nobody can take one from you, because there is nobody
 * else. The half that makes this interesting -- somebody outbidding you, the
 * price ratcheting up, the whole street quietly competing over the same cafe --
 * needs a server and a second player. Everything here is shaped so that half
 * drops in without a rewrite: an owner, a price, and a record of what was paid.
 */

export interface OwnedBuilding {
  /** Identifies the building itself, not a position. See `buildingKeyFor`. */
  key: string;
  /** Where to draw the marker, and where you must stand to be "at" it. */
  lat: number;
  lng: number;
  /** What was paid. The next buyer must beat this, once there is a next buyer. */
  paid: number;
  boughtAtMs: number;
}

/**
 * A stable name for a building, from its own corners.
 *
 * Rounded to about a metre so the same building gets the same name however the
 * tiles were cut, and so two phones agree without asking each other.
 */
export function buildingKeyFor(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const r = (n: number) => Math.round(n * 100000);
  return `${r(minLng)}:${r(minLat)}:${r(maxLng)}:${r(maxLat)}`;
}

/**
 * What a building is worth, from its footprint alone.
 *
 * Bigger is dearer, but far from proportionally -- a warehouse should not cost
 * fifty times a corner shop, or nobody would ever own anything interesting.
 * The square root keeps the range of prices narrow enough that choosing WHICH
 * building stays a matter of taste rather than arithmetic.
 */
export function priceOf(areaSquareMetres: number, basePrice: number, perRoot: number): number {
  return Math.round(basePrice + Math.sqrt(Math.max(0, areaSquareMetres)) * perRoot);
}

/** Rough floor area of a footprint, in square metres. */
export function footprintArea(points: Float32Array): number {
  let twiceArea = 0;
  const count = points.length / 2;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    twiceArea += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
  }
  return Math.abs(twiceArea) / 2;
}
