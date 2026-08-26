/**
 * TOWERS — the first thing in this game that is BUILT.
 * ====================================================
 * Everything else on the map is either found or calculated. A tower is neither:
 * you pay for it, you walk to the spot, and it stays there after you go home.
 *
 * THREE RULES IT MUST NOT BREAK, all of them from the brief:
 *
 * 1. NOTHING CAN EVER TAKE IT AWAY FROM YOU. No decay, no attack while you are
 *    absent, no maintenance. The moment a thing you own can be lost while you
 *    are not there, you will hurry to it -- across roads, at night, looking at a
 *    phone -- and that is the single behaviour this game refuses to cause. It is
 *    also why coming back is never *required*: a tower you forget about costs
 *    you nothing at all.
 *
 * 2. IT ADDS NO INPUT TO COMBAT. It fires by itself like every other weapon
 *    here. Building happens on the map, not in a fight.
 *
 * 3. IT MUST NOT REPLACE WALKING. A tower only wakes when you are near it, so
 *    fortifying one corner and sitting in it achieves nothing -- there is
 *    nothing to farm and no reason to stay. What towers do is let you hold
 *    ground you have already walked to, which is why they are placed anywhere
 *    you like rather than only on cleared nests: the good spot is a decision.
 */

export interface Tower {
  lat: number;
  lng: number;
  /** Bought upgrades. Each one is another payment at the same spot. */
  level: number;
  /** When it was built, so the shop can say something friendly about it. */
  builtAtMs: number;
}

/**
 * What the next tower costs.
 *
 * Rises steeply with how many you already own. Towers are permanent and cannot
 * be lost, so a flat price would mean a player eventually carpets their
 * neighbourhood and the game plays itself -- the cost curve is what keeps them
 * a decision about WHERE rather than a shopping list.
 */
export function costOfNextTower(owned: number, base: number, growth: number): number {
  return Math.round(base * Math.pow(growth, owned));
}

/** What upgrading a particular tower costs. */
export function costOfUpgrade(level: number, base: number, growth: number): number {
  return Math.round(base * 0.6 * Math.pow(growth, level));
}

/** Metres between two points, near enough for the distances involved here. */
export function metresBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const dy = (aLat - bLat) * 111320;
  const dx = (aLng - bLng) * 111320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** The tower nearest a point, and how far away it is. */
export function nearestTower(
  towers: Tower[],
  lat: number,
  lng: number
): { tower: Tower; index: number; metres: number } | null {
  let best: { tower: Tower; index: number; metres: number } | null = null;
  for (let i = 0; i < towers.length; i++) {
    const metres = metresBetween(lat, lng, towers[i].lat, towers[i].lng);
    if (!best || metres < best.metres) best = { tower: towers[i], index: i, metres };
  }
  return best;
}
